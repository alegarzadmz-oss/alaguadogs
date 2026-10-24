import { z } from "zod";
import { routeReadiness } from "./akira-routing";
import {
  akiraSystemPrompt,
  bookingProposal,
  daySchedule,
  findClients,
  routePreview,
  suggestSlots,
  type AkiraProposal,
  type AkiraMessage,
  type PlanningContext,
} from "./akira";
const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const booking = z
  .object({ clientId: id, petId: id, serviceId: id, date, time, vanId: id })
  .strict();
const slots = z
  .object({
    clientId: id,
    petId: id,
    serviceId: id,
    date,
    preferredTime: time.nullable(),
    vanId: id.nullable(),
  })
  .strict();
const route = z.object({ date, vanId: id, start: time }).strict();
const responseSchema = z.object({
  status: z.string().optional(),
  output: z.array(
    z
      .object({
        type: z.string(),
        name: z.string().optional(),
        call_id: z.string().optional(),
        arguments: z.string().optional(),
        content: z
          .array(
            z
              .object({
                type: z.string(),
                text: z.string().optional(),
                refusal: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  ),
});
const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
) => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
});
const string = { type: "string" };
const nullable = { type: ["string", "null"] };
const common = {
  clientId: string,
  petId: string,
  serviceId: string,
  date: string,
};
const tools = [
  tool(
    "route_readiness",
    "Revisa las cuatro camionetas o una elegida: base, ubicaciones faltantes, visitas sin horario y servicios que deben conservarse. No modifica datos.",
    { date: string, vanId: nullable },
  ),
  tool(
    "find_clients",
    "Busca fichas por nombre, mascota o domicilio. No determina identidad por nombre solamente.",
    { query: string },
  ),
  tool(
    "day_schedule",
    "Consulta las citas con horario y advierte de importaciones sin horarios.",
    { date: string },
  ),
  tool(
    "suggest_slots",
    "Sugiere horas y camionetas según cercanía por coordenadas o zona, carga y cruces. No reserva.",
    { ...common, preferredTime: nullable, vanId: nullable },
  ),
  tool(
    "prepare_booking",
    "Crea una tarjeta de cita para revisión. No guarda. Solo con cliente, mascota, servicio, fecha, hora y camioneta elegidos.",
    { ...common, time: string, vanId: string },
  ),
  tool(
    "route_preview",
    "Propone un orden aproximado de citas con coordenadas, o explica qué falta. No modifica horarios.",
    { date: string, vanId: string, start: string },
  ),
];
export function akiraDisplayReply(reply: string) {
  const labels: Record<string, string> = {
    route_preview: "la propuesta de ruta",
    route_readiness: "la revisión de preparación de rutas",
    day_schedule: "la consulta de agenda",
    suggest_slots: "la sugerencia de horarios",
    prepare_booking: "la preparación de la cita",
    find_clients: "la búsqueda de clientes",
    slots: "horarios sugeridos",
    previews: "propuestas",
  };
  return reply.replace(
    /\b(route_preview|route_readiness|day_schedule|suggest_slots|prepare_booking|find_clients|slots|previews)\b/g,
    (name) => labels[name],
  );
}
export class AkiraError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function chatWithAkira(
  ctx: PlanningContext,
  messages: AkiraMessage[],
  selectedDate: string,
) {
  const proposals: AkiraProposal[] = [];
  const conversation: unknown[] = [...messages];
  let reply = "";
  for (let step = 0; step < 6; step++) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AKIRA_MODEL || "gpt-5-mini",
        store: false,
        include: ["reasoning.encrypted_content"],
        instructions: akiraSystemPrompt(ctx, selectedDate),
        input: conversation,
        tools,
        parallel_tool_calls: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: 2000,
        ...(step === 5 ? { tool_choice: "none" } : {}),
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      const error = (await r.json().catch(() => ({}))) as {
        error?: { code?: string };
      };
      console.error("Akira provider error", {
        status: r.status,
        code: error.error?.code,
      });
      if (error.error?.code === "insufficient_quota")
        throw new AkiraError(
          "La cuenta de OpenAI necesita saldo para que Akira responda. Avísa a administración.",
          503,
        );
      throw new AkiraError(
        "Akira no pudo responder en este momento. Intenta de nuevo; no se guardaron cambios.",
        503,
      );
    }
    const response = responseSchema.parse(await r.json());
    conversation.push(...response.output);
    const calls = response.output.filter((o) => o.type === "function_call");
    reply = response.output
      .flatMap((o) => o.content || [])
      .map((c) => c.text || c.refusal || "")
      .join("\n");
    if (!calls.length) break;
    for (const call of calls) {
      let result: unknown;
      try {
        const args = JSON.parse(call.arguments || "{}");
        switch (call.name) {
          case "route_readiness": {
            const input = z
              .object({ date, vanId: id.nullable() })
              .strict()
              .parse(args);
            result = routeReadiness(ctx, input.date, input.vanId);
            break;
          }
          case "find_clients":
            result = findClients(
              ctx.state,
              z
                .object({ query: z.string().trim().min(2).max(200) })
                .strict()
                .parse(args).query,
            );
            break;
          case "day_schedule":
            result = daySchedule(
              ctx,
              z.object({ date }).strict().parse(args).date,
            );
            break;
          case "suggest_slots":
            result = suggestSlots(ctx, slots.parse(args));
            break;
          case "prepare_booking": {
            if (proposals.length)
              throw Error(
                "Ya hay una propuesta en esta respuesta. Confirma esa tarjeta antes de preparar otra.",
              );
            const proposal = bookingProposal(ctx, booking.parse(args));
            proposals.push(proposal);
            result = {
              draftPrepared: true,
              saved: false,
              details: proposal.details,
              warnings: proposal.warnings,
            };
            break;
          }
          case "route_preview": {
            const argsParsed = route.parse(args),
              preview = routePreview(
                ctx,
                argsParsed.date,
                argsParsed.vanId,
                argsParsed.start,
              );
            if (preview.proposal) {
              if (proposals.length)
                throw Error(
                  "Ya hay una propuesta; confirma esa tarjeta antes de preparar otra.",
                );
              proposals.push(preview.proposal);
            }
            result = preview;
            break;
          }
          default:
            result = { error: "Herramienta no disponible." };
        }
      } catch (e) {
        result = {
          error:
            e instanceof z.ZodError
              ? "Faltan datos o alguno es inválido. Pregunta antes de continuar."
              : e instanceof Error
                ? e.message
                : "No se pudo preparar la propuesta.",
        };
      }
      conversation.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }
  return {
    reply: akiraDisplayReply(
      reply || "Revisa los datos de la propuesta antes de confirmarla.",
    ),
    proposals,
  };
}
