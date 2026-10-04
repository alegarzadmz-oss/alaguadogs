import { getPortalUser } from "@/lib/auth";
import { guardedWrite, prepare, readSharedState } from "@/db/store";
import { guardValues, memberFor, memberGuard, teamContext } from "@/db/team";
import { mutateState, type Command } from "@/lib/operations";
import {
  AccessError,
  authorizeCommand,
  BUSINESS_KEY,
  visibleState,
  type TeamMember,
} from "@/lib/team";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function response(
  current: Awaited<ReturnType<typeof readSharedState>>,
  member: TeamMember,
) {
  return json({
    state: visibleState(current.state, member),
    revision: current.revision,
    team: await teamContext(member),
  });
}
export async function GET() {
  try {
    const user = await getPortalUser();
    if (!user)
      return json(
        { error: "Inicia sesión para abrir los datos.", signIn: true },
        401,
      );
    const member = await memberFor(user);
    return response(await readSharedState(), member);
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    console.error("Read operations failed", e);
    return json(
      { error: "No se pudieron cargar los datos. Intenta de nuevo." },
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json(
        { error: "Inicia sesión antes de guardar.", signIn: true },
        401,
      );
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    const raw = await request.text();
    if (raw.length > 150000)
      return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: { revision: number; operationId: string; command: Command };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    if (
      !body?.command ||
      !Number.isInteger(body.revision) ||
      typeof body.operationId !== "string" ||
      !body.operationId ||
      body.operationId.length > 100
    )
      return json({ error: "Solicitud inválida." }, 400);
    const current = await readSharedState();
    try {
      authorizeCommand(current.state, body.command, member);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Acción no permitida." },
        403,
      );
    }
    if (current.state.operations.includes(body.operationId))
      return response(current, member);
    if (current.revision !== body.revision)
      return json(
        {
          error: "Otra persona cambió los datos. Actualiza y vuelve a guardar.",
          conflict: true,
        },
        409,
      );
    if (body.command.type === "saveAppointment") {
      const appointment = body.command.appointment as
        { groomerId?: unknown; groomer?: string } | undefined;
      if (appointment?.groomerId) {
        const context = await teamContext(member);
        const assigned = context.members.find(
          (m) =>
            m.id === appointment.groomerId &&
            m.role === "groomer" &&
            m.status !== "inactive",
        );
        if (!assigned)
          return json(
            {
              error:
                "Selecciona una cuenta de bañador activa o pendiente de activar.",
            },
            400,
          );
        appointment.groomer = assigned.name;
      }
    }
    let state;
    try {
      state = mutateState(
        current.state,
        body.command,
        `${member.name} (${user.email})`,
      );
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Revisa los datos." },
        400,
      );
    }
    state.operations = [...state.operations, body.operationId].slice(-1000);
    const payload = JSON.stringify(state);
    if (payload.length > 1800000)
      return json(
        {
          error:
            "El historial llegó al límite de esta versión. Contacta a administración.",
        },
        400,
      );
    const result = await guardedWrite(
      prepare(
        `UPDATE operation_state SET payload = ?, revision = revision + 1 WHERE owner = ? AND revision = ? AND ${memberGuard()}`,
        [payload, BUSINESS_KEY, body.revision, ...guardValues(member)],
      ),
      member,
    );
    if (!result)
      return json(
        {
          error:
            "Los datos o tus permisos cambiaron. Actualiza antes de guardar.",
          conflict: true,
        },
        409,
      );
    return response({ state, revision: body.revision + 1 }, member);
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    console.error("Write operations failed", e);
    return json(
      {
        error:
          "No se pudo confirmar el guardado. Tus datos siguen en el formulario; intenta de nuevo.",
      },
      503,
    );
  }
}
