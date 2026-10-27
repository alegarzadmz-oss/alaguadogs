import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { saveWorkday } from "@/db/workday";
import { AccessError } from "@/lib/team";
import { WorkdayError } from "@/lib/workday";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json({ error: "Inicia sesión para trabajar en tu ruta." }, 401);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    const text = await request.text();
    if (text.length > 4000)
      return json({ error: "Solicitud demasiado grande." }, 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    return json(await saveWorkday(member, input));
  } catch (e) {
    return json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof WorkdayError
              ? e.message
              : "No se pudo guardar.",
      },
      e instanceof AccessError ? 403 : e instanceof WorkdayError ? 400 : 503,
    );
  }
}
