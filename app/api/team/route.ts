import { getPortalUser } from "@/lib/auth";
import {
  accessAudit,
  activateMember,
  changeMember,
  memberFor,
  teamContext,
} from "@/db/team";
import { AccessError } from "@/lib/team";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  try {
    const user = await getPortalUser();
    if (!user)
      return json(
        { error: "Inicia sesión para entrar al equipo.", signIn: true },
        401,
      );
    const member = await memberFor(user);
    return json({
      ...(await teamContext(member)),
      audit: member.role === "admin" ? await accessAudit() : [],
    });
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    console.error("Read team failed", e);
    return json(
      { error: "No se pudieron cargar los accesos. Intenta de nuevo." },
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json(
        {
          error: "Inicia sesión antes de activar o cambiar accesos.",
          signIn: true,
        },
        401,
      );
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      return json({ error: "Origen no permitido." }, 403);
    const raw = await request.text();
    if (raw.length > 10000)
      return json({ error: "La solicitud es demasiado grande." }, 413);
    let command: Record<string, unknown>;
    try {
      command = JSON.parse(raw);
      if (!command || typeof command !== "object") throw Error();
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    let invite: { token?: string; memberId?: string } = {};
    let member;
    try {
      if (command.type === "activate")
        member = await activateMember(user, command.token);
      else {
        member = await memberFor(user);
        invite = await changeMember(member, command);
        member = await memberFor(user);
      }
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Revisa los datos." },
        e instanceof AccessError ? 403 : 400,
      );
    }
    return json({
      ...(await teamContext(member)),
      audit: member.role === "admin" ? await accessAudit() : [],
      ...invite,
    });
  } catch (e) {
    console.error("Write team failed", e);
    return json(
      {
        error:
          "No se pudo confirmar el cambio de acceso. Actualiza e intenta de nuevo.",
      },
      503,
    );
  }
}
