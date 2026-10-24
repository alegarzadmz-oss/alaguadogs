import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { importRoutes, manageRoute } from "@/db/route-capture";
import { requireHistoryAdmin } from "@/db/route-history";
import { AccessError } from "@/lib/team";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json({ error: "Inicia sesión para capturar rutas." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    requireHistoryAdmin(member);
    const raw = await request.text();
    if (raw.length > 350000)
      return json({ error: "Importa una lista más pequeña." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    try {
      return body?.action
        ? json({ visit: await manageRoute(member, body) })
        : json({ visits: await importRoutes(member, body) });
    } catch (e) {
      if (e instanceof AccessError) throw e;
      const error = e instanceof Error ? e.message : "No se pudo guardar.";
      return json(
        { error },
        /cambi[oó]|duplicado|ya se guard[oó]/i.test(error) ? 409 : 400,
      );
    }
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    console.error(
      "Route capture failed",
      e instanceof Error ? e.name : "Unknown",
    );
    return json(
      {
        error:
          "No se pudo confirmar el guardado. Conserva la vista previa e intenta de nuevo.",
      },
      503,
    );
  }
}
