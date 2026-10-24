import { z } from "zod";
import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { savedRoutes, publishRoadRoute } from "@/db/saved-routes";
import { SavedRouteError } from "@/lib/saved-routes";
import { AccessError } from "@/lib/team";
import { validDay } from "@/lib/route-history";
export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function viewer() {
  const user = await getPortalUser();
  if (!user)
    throw new SavedRouteError("Inicia sesión para consultar tu ruta.", 401);
  return memberFor(user);
}
function failure(e: unknown) {
  if (e instanceof AccessError) return json({ error: e.message }, 403);
  if (e instanceof SavedRouteError) return json({ error: e.message }, e.status);
  return json(
    { error: "No se pudieron cargar o guardar las rutas. Intenta de nuevo." },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const member = await viewer();
    const params = new URL(request.url).searchParams;
    const from = params.get("from") || params.get("date") || "";
    const to = params.get("to") || from;
    if (
      !validDay(from) ||
      !validDay(to) ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 14 * 86400000
    )
      throw new SavedRouteError(
        "Selecciona un periodo válido de hasta dos semanas.",
      );
    const van = params.get("vanId");
    if (van && van.length > 100)
      throw new SavedRouteError("Selecciona una VAN válida.");
    return json(await savedRoutes(member, from, to, van));
  } catch (e) {
    return failure(e);
  }
}
const publish = z
  .object({
    id: z.string().min(1).max(100),
    revision: z.number().int().nonnegative(),
    groomerId: z.string().min(1).max(100),
    reviewed: z.literal(true),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new SavedRouteError("Origen no permitido.", 403);
    const member = await viewer();
    const text = await request.text();
    if (text.length > 2000)
      throw new SavedRouteError("Solicitud demasiado grande.", 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SavedRouteError("Solicitud inválida.");
    }
    const input = publish.safeParse(raw);
    if (!input.success)
      throw new SavedRouteError(
        "Selecciona al bañador y confirma la revisión de domicilios.",
      );
    return json({ route: await publishRoadRoute(member, input.data) });
  } catch (e) {
    return failure(e);
  }
}
