import { z } from "zod";
import { getPortalUser } from "@/lib/auth";
import { memberFor, teamContext } from "@/db/team";
import { database, readSharedState } from "@/db/store";
import { readHistory } from "@/db/route-history";
import { AccessError } from "@/lib/team";
import type { PlanningContext } from "@/lib/akira";
import { chatWithAkira, AkiraError } from "@/lib/akira-openai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const requestSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(5000),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
async function reserveRequest(member: Awaited<ReturnType<typeof memberFor>>) {
  const actor = `akira:${member.id}`;
  const now = new Date(),
    since = new Date(now.getTime() - 60000).toISOString();
  const day = now.toISOString().slice(0, 10) + "T00:00:00.000Z";
  await database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    await tx`SELECT pg_advisory_xact_lock(hashtext(${actor}))`;
    const [usage] =
      await tx`SELECT count(*) FILTER (WHERE at >= ${since}) AS recent, count(*) AS daily FROM team_audit WHERE actor=${actor} AND action='Consulta a Akira' AND at >= ${day}`;
    if (Number(usage.recent) >= 8)
      throw new AkiraError(
        "Akira ha recibido varias consultas seguidas. Espera un minuto e intenta de nuevo.",
        429,
      );
    if (Number(usage.daily) >= 100)
      throw new AkiraError(
        "Se alcanzó el límite de 100 consultas de Akira por cuenta para hoy.",
        429,
      );
    await tx`INSERT INTO team_audit (id,at,actor,action) VALUES (${crypto.randomUUID()},${now.toISOString()},${actor},'Consulta a Akira')`;
  });
}

export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json({ error: "Inicia sesión para hablar con Akira." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    if (member.role !== "admin" || member.status !== "active")
      throw new AccessError(
        "Akira requiere acceso de administración para agendar y organizar rutas.",
      );
    if (!process.env.OPENAI_API_KEY)
      throw new AkiraError(
        "La conexión de Akira todavía no está configurada. Avísa a administración.",
        503,
      );
    const raw = await request.text();
    if (raw.length > 30000)
      return json(
        {
          error:
            "La conversación es demasiado larga. Inicia una conversación nueva.",
        },
        413,
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    const input = requestSchema.safeParse(parsed);
    if (!input.success || input.data.messages.at(-1)?.role !== "user")
      return json({ error: "Revisa el mensaje y la fecha." }, 400);
    await reserveRequest(member);
    const [current, team, history] = await Promise.all([
      readSharedState(),
      teamContext(member),
      readHistory(member),
    ]);
    const ctx: PlanningContext = {
      state: current.state,
      members: team.members,
      history,
    };
    const result = await chatWithAkira(
      ctx,
      input.data.messages,
      input.data.date,
    );
    return json({ ...result, revision: current.revision });
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    if (e instanceof AkiraError) return json({ error: e.message }, e.status);
    console.error(
      "Akira request failed",
      e instanceof Error ? e.name : "Unknown error",
    );
    return json(
      {
        error:
          "No se pudo completar la consulta. Intenta de nuevo; no se guardaron cambios.",
      },
      503,
    );
  }
}
