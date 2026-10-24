import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { AccessError } from "@/lib/team";
import { serviceTargetSchema } from "@/lib/service-closeout";
import {
  CloseoutError,
  createReceiptShare,
  readCloseout,
  revokeReceiptShares,
  saveCloseout,
} from "@/db/service-closeout";
export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user) return json({ error: "Inicia sesión para ver el cierre." }, 401);
    const member = await memberFor(user),
      query = new URL(request.url).searchParams;
    const target = serviceTargetSchema.safeParse({
      kind: query.get("kind"),
      id: query.get("id"),
    });
    if (!target.success) return json({ error: "Servicio inválido." }, 400);
    return json(await readCloseout(member, target.data));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user) return json({ error: "Inicia sesión antes de guardar." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user),
      raw = await request.text();
    if (raw.length > 12000)
      return json({ error: "La solicitud es demasiado grande." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    if (body?.action === "save") return json(await saveCloseout(member, body));
    if (
      !body ||
      Object.keys(body).some((k) => !["action", "kind", "id"].includes(k))
    )
      return json({ error: "Solicitud inválida." }, 400);
    const target = serviceTargetSchema.safeParse({
      kind: body.kind,
      id: body.id,
    });
    if (!target.success) return json({ error: "Servicio inválido." }, 400);
    if (body.action === "share")
      return json(await createReceiptShare(member, target.data));
    if (body.action === "revoke") {
      await revokeReceiptShares(member, target.data);
      return json({ ok: true });
    }
    return json({ error: "Acción inválida." }, 400);
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof AccessError) return json({ error: e.message }, 403);
  if (e instanceof CloseoutError)
    return json({ error: e.message }, /cambi[oó]/i.test(e.message) ? 409 : 400);
  console.error(
    "Service closeout failed",
    e instanceof Error ? e.name : "Unknown",
  );
  return json(
    {
      error:
        "No se pudo confirmar la operación. Conserva los datos y actualiza antes de reintentar.",
    },
    503,
  );
}
