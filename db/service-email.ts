import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { Resend } from "resend";
import { get } from "@vercel/blob";
import { database } from "./store";
import { BUSINESS_KEY } from "@/lib/team";
import {
  receiptIdentity,
  serviceReceipt,
  type ServiceTarget,
  type ServicePhoto,
  type ServiceCloseout,
  type ServiceReceipt,
  type ServiceEmailStatus,
} from "@/lib/service-closeout";
import { MAIL_SENDER, serviceEmailContent } from "@/lib/service-email";
import type { State } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";
type Tx = postgres.TransactionSql;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const emailSignature = (r: ServiceReceipt, email: string) =>
  hash(receiptIdentity(r) + "\n" + email.trim().toLowerCase());
export async function queueServiceEmail(
  tx: Tx,
  input: {
    owner: string;
    target: ServiceTarget;
    receipt: ServiceReceipt;
    email: string;
    actor: string;
  },
) {
  const { owner, target, receipt, actor } = input,
    email = input.email.trim().toLowerCase();
  if (!email || !receipt.photos.length) return null;
  const signature = emailSignature(receipt, email);
  const [existing] =
    await tx`SELECT id,status FROM service_email_outbox WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND signature=${signature}`;
  if (existing && existing.status !== "canceled")
    return existing.status === "sent" ? null : (existing.id as string);
  const now = new Date().toISOString();
  await tx`UPDATE service_email_outbox SET status='canceled',share_token=NULL,error_code='service_changed' WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND status IN ('pending','retry','failed')`;
  const token = randomBytes(32).toString("hex"),
    expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await tx`INSERT INTO service_receipt_shares(token_hash,owner,kind,visit_id,snapshot,created_at,created_by,expires_at) VALUES (${hash(token)},${owner},${target.kind},${target.id},${tx.json(receipt)},${now},${actor},${expires})`;
  if (existing) {
    const replacement = crypto.randomUUID();
    await tx`UPDATE service_email_outbox SET id=${replacement},snapshot=${tx.json(receipt)},share_token=${token},status='pending',created_at=${now},first_attempt_at=NULL,attempts=0,next_attempt_at=${now},error_code=NULL,provider_id=NULL,sent_at=NULL WHERE id=${existing.id}`;
    return replacement;
  }
  const id = crypto.randomUUID();
  await tx`INSERT INTO service_email_outbox(id,owner,kind,visit_id,signature,recipient,sender,snapshot,share_token,status,created_at,next_attempt_at) VALUES (${id},${owner},${target.kind},${target.id},${signature},${email},${MAIL_SENDER},${tx.json(receipt)},${token},'pending',${now},${now})`;
  return id;
}
export async function deliveryStatus(
  tx: Tx,
  target: ServiceTarget,
  owner: string,
  closeout: ServiceCloseout | null,
  photos: ServicePhoto[],
  admin: boolean,
): Promise<ServiceEmailStatus> {
  if (!closeout) return { state: "not_saved" };
  if (!photos.length) return { state: "awaiting_photo" };
  if (!closeout.email) return { state: "missing_email" };
  const [row] =
    await tx`SELECT status,sent_at,recipient,error_code FROM service_email_outbox WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} ORDER BY created_at DESC,id DESC LIMIT 1`;
  if (!row) return { state: "not_saved" };
  return {
    state: row.status,
    sentAt: row.sent_at,
    ...(admin ? { recipient: row.recipient, error: row.error_code } : {}),
  };
}
type MailRequest = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: string; contentId: string }[];
};
// Injectable transport is for isolated integration tests. Production always uses Resend.
export type MailTransport = (
  body: MailRequest,
  idempotencyKey: string,
) => Promise<{ id: string }>;
async function resendTransport(body: MailRequest, idempotencyKey: string) {
  if (!process.env.RESEND_API_KEY) throw Error("configuration_missing");
  const { data, error } = await new Resend(
    process.env.RESEND_API_KEY,
  ).emails.send(body, { idempotencyKey, signal: AbortSignal.timeout(15000) });
  if (error) throw Error(error.name || "provider_error");
  if (!data?.id) throw Error("provider_response_unknown");
  return data;
}
export async function sendServiceEmail(
  id: string,
  transport: MailTransport = resendTransport,
) {
  const initial =
    await database()`SELECT owner,kind,visit_id FROM service_email_outbox WHERE id=${id}`;
  if (!initial[0]) return { status: "missing" };
  const identity = initial[0];
  return database().begin(async (tx) => {
    // Serialize against closeout edits/uploads and duplicate deliveries for the same service.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${identity.owner + ":closeout:" + identity.kind + ":" + identity.visit_id}))`;
    const [job] =
      await tx`SELECT * FROM service_email_outbox WHERE id=${id} FOR UPDATE`;
    if (!job || job.status === "sent" || job.status === "canceled")
      return { status: job?.status || "missing" };
    if (job.next_attempt_at > new Date().toISOString())
      return { status: job.status };
    const [stateRow] =
      await tx`SELECT payload FROM operation_state WHERE owner=${job.owner} FOR SHARE`;
    const [closed] =
      await tx`SELECT payload FROM service_closeouts WHERE owner=${job.owner} AND kind=${job.kind} AND visit_id=${job.visit_id}`;
    const [route] =
      job.kind === "history"
        ? await tx`SELECT payload FROM route_visits WHERE owner=${job.owner} AND id=${job.visit_id} FOR SHARE`
        : [];
    const photoRows =
      await tx`SELECT id,caption,pathname FROM service_photos WHERE owner=${job.owner} AND kind=${job.kind} AND visit_id=${job.visit_id} AND deleted_at IS NULL ORDER BY created_at,id`;
    let current: ServiceReceipt | undefined;
    try {
      if (stateRow && closed)
        current = serviceReceipt(
          JSON.parse(stateRow.payload) as State,
          { kind: job.kind, id: job.visit_id },
          closed.payload as ServiceCloseout,
          photoRows as unknown as ServicePhoto[],
          route?.payload as RouteVisit | undefined,
        );
    } catch {}
    if (
      !current ||
      !closed ||
      emailSignature(current, (closed.payload as ServiceCloseout).email) !==
        job.signature ||
      !job.share_token
    ) {
      await tx`UPDATE service_email_outbox SET status='canceled',share_token=NULL,error_code='service_changed' WHERE id=${id}`;
      return { status: "canceled" };
    }
    const now = new Date().toISOString();
    if (
      Date.now() - Date.parse(job.first_attempt_at || job.created_at) >
      23 * 3600000
    ) {
      await tx`UPDATE service_email_outbox SET status='failed',error_code='review_after_retry_window' WHERE id=${id}`;
      return { status: "failed" };
    }
    // No write is committed between the provider request and the sent marker. On a lost
    // database response the stable provider idempotency key prevents a duplicate email.
    await tx`UPDATE service_email_outbox SET status='sending',first_attempt_at=COALESCE(first_attempt_at,${now}),attempts=attempts+1 WHERE id=${id}`;
    try {
      if (transport === resendTransport && !process.env.RESEND_API_KEY)
        throw Error("configuration_missing");
      const attachments = await Promise.all(
        photoRows.map(async (p, i) => {
          const photo = await get(p.pathname, {
            access: "private",
            abortSignal: AbortSignal.timeout(15000),
          });
          if (!photo || photo.statusCode !== 200)
            throw Error("photo_unavailable");
          const buffer = Buffer.from(
            await new Response(photo.stream).arrayBuffer(),
          );
          if (buffer.length > 2500000) throw Error("photo_too_large");
          return {
            filename: `mascota-${i + 1}.jpg`,
            content: buffer.toString("base64"),
            contentId: `service-photo-${i}`,
          };
        }),
      );
      const content = serviceEmailContent(
        job.snapshot as ServiceReceipt,
        job.share_token as string,
      );
      const result = await transport(
        { from: job.sender, to: [job.recipient], ...content, attachments },
        `alagua-closeout/${id}`,
      );
      await tx`UPDATE service_email_outbox SET status='sent',sent_at=${new Date().toISOString()},provider_id=${result.id},share_token=NULL,error_code=NULL WHERE id=${id}`;
      return { status: "sent" };
    } catch (e) {
      const raw = e instanceof Error ? e.message : "provider_error";
      const errorCode = /^[a-z_]{1,80}$/.test(raw) ? raw : "provider_error";
      const attempts = Number(job.attempts) + 1,
        status = attempts >= 8 ? "failed" : "retry";
      const next = new Date(
        Date.now() + Math.min(60, 2 ** attempts) * 60000,
      ).toISOString();
      await tx`UPDATE service_email_outbox SET status=${status},error_code=${errorCode},next_attempt_at=${next} WHERE id=${id}`;
      return { status };
    }
  });
}
export async function processPendingServiceEmails() {
  const jobs =
    await database()`SELECT id FROM service_email_outbox WHERE owner=${BUSINESS_KEY} AND status IN ('pending','retry') AND next_attempt_at<=${new Date().toISOString()} ORDER BY created_at LIMIT 10`;
  const result = [];
  for (const job of jobs) result.push(await sendServiceEmail(job.id));
  return {
    processed: result.length,
    sent: result.filter((r) => r.status === "sent").length,
  };
}
