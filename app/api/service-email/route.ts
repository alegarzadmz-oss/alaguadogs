import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { database, readSharedState } from "@/db/store";
import { AccessError, BUSINESS_KEY } from "@/lib/team";
import { CloseoutError, retryCloseoutEmail } from "@/db/service-closeout";
import { sendServiceEmail } from "@/db/service-email";
import { serviceTargetSchema } from "@/lib/service-closeout";
import { MAIL_SENDER } from "@/lib/service-email";
export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function administrator() {
  const user = await getPortalUser();
  if (!user) throw new AccessError("Inicia sesión para revisar los correos.");
  const member = await memberFor(user);
  if (member.role !== "admin")
    throw new AccessError("Esta vista corresponde a Administración.");
  return member;
}
export async function GET() {
  try {
    await administrator();
    const db = database(),
      { state } = await readSharedState();
    const jobs =
      await db`SELECT id,kind,visit_id AS "visitId",recipient,status,sent_at AS "sentAt",error_code AS "errorCode",created_at AS "createdAt" FROM service_email_outbox WHERE owner=${BUSINESS_KEY} ORDER BY created_at DESC LIMIT 100`;
    const closes =
      await db`SELECT kind,visit_id AS "visitId",payload FROM service_closeouts WHERE owner=${BUSINESS_KEY} ORDER BY payload->>'updatedAt' DESC LIMIT 100`;
    const waiting = closes
      .filter((c) => !c.payload.email)
      .map((c) => ({
        kind: c.kind,
        id: c.visitId,
        updatedAt: c.payload.updatedAt,
      }));
    return json({
      configured: !!process.env.RESEND_API_KEY,
      sender: MAIL_SENDER,
      jobs,
      waiting,
      clientsWithoutEmail: state.clients.filter((c) => !c.email).length,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "No se pudo consultar el estado de los correos.",
      },
      e instanceof AccessError ? 403 : 503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const member = await administrator(),
      origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const raw = await request.text();
    if (raw.length > 1000)
      return json({ error: "Solicitud demasiado grande." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    const parsed = serviceTargetSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Servicio inválido." }, 400);
    const id = await retryCloseoutEmail(member, parsed.data);
    return json(id ? await sendServiceEmail(id) : { status: "sent" });
  } catch (e) {
    return json(
      {
        error:
          e instanceof AccessError || e instanceof CloseoutError
            ? e.message
            : "No se pudo completar el reintento.",
      },
      e instanceof AccessError ? 403 : e instanceof CloseoutError ? 400 : 503,
    );
  }
}
