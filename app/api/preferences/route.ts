import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { database } from "@/db/store";
import { AccessError } from "@/lib/team";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET() {
  try {
    const user = await getPortalUser();
    if (!user)
      return json(
        { error: "Inicia sesión para consultar tu apariencia." },
        401,
      );
    const member = await memberFor(user);
    const [row] =
      await database()`SELECT appearance FROM team_members WHERE id=${member.id} AND user_id=${user.userId} AND status='active'`;
    if (!row) throw new AccessError();
    return json({ appearance: row.appearance || "light" });
  } catch (error) {
    if (error instanceof AccessError)
      return json({ error: error.message }, 403);
    return json({ error: "No se pudo consultar tu apariencia." }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json({ error: "Inicia sesión para guardar tu apariencia." }, 401);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    const raw = await request.text();
    if (raw.length > 256)
      return json({ error: "Solicitud demasiado grande." }, 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      !("appearance" in input) ||
      typeof input.appearance !== "string" ||
      !["light", "dark"].includes(input.appearance)
    )
      return json({ error: "Elige apariencia clara u oscura." }, 400);
    const updated =
      await database()`UPDATE team_members SET appearance=${input.appearance} WHERE id=${member.id} AND user_id=${user.userId} AND version=${member.version} AND status='active' RETURNING appearance`;
    if (!updated.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    return json({ appearance: updated[0].appearance });
  } catch (error) {
    if (error instanceof AccessError)
      return json({ error: error.message }, 403);
    return json({ error: "No se pudo guardar tu apariencia." }, 503);
  }
}
