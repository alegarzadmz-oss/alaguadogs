import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { readHistory, updateHistory } from "@/db/route-history";
import { AccessError } from "@/lib/team";
import { requireRouteReader } from "@/lib/route-permissions";
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
      return json({ error: "Inicia sesión para consultar el historial." }, 401);
    return json({ visits: await readHistory(await memberFor(user)) });
  } catch (error) {
    if (error instanceof AccessError)
      return json({ error: error.message }, 403);
    console.error("Route history read failed", error);
    return json(
      { error: "No se pudo cargar el historial de rutas. Intenta de nuevo." },
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user) return json({ error: "Inicia sesión antes de guardar." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    requireRouteReader(member);
    const raw = await request.text();
    if (raw.length > 10000)
      return json({ error: "Solicitud demasiado grande." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    if (
      !body ||
      typeof body.id !== "string" ||
      body.id.length > 100 ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0
    )
      return json({ error: "Solicitud inválida." }, 400);
    try {
      return json({
        visit: await updateHistory(
          member,
          body.id,
          body.revision,
          body.changes,
        ),
      });
    } catch (error) {
      if (error instanceof AccessError) throw error;
      const message =
        error instanceof Error ? error.message : "No se pudo guardar.";
      return json({ error: message }, message.includes("cambió") ? 409 : 400);
    }
  } catch (error) {
    if (error instanceof AccessError)
      return json({ error: error.message }, 403);
    console.error("Route history write failed", error);
    return json(
      { error: "No se pudo confirmar el guardado. Intenta de nuevo." },
      503,
    );
  }
}
