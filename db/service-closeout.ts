import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { put, del } from "@vercel/blob";
import { database } from "./store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import type { State } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";
import {
  closeoutSchema,
  MAX_SERVICE_PHOTOS,
  requireServiceAccess,
  serviceReceipt,
  type ServiceTarget,
  type ServiceCloseout,
  type ServicePhoto,
  type ServiceReceipt,
  receiptIdentity,
} from "@/lib/service-closeout";
import { requireAssignedRouteVisit } from "./workday";
import { queueServiceEmail, deliveryStatus } from "./service-email";

export class CloseoutError extends Error {}
type Context = {
  state: State;
  visit?: RouteVisit;
  closeout: ServiceCloseout | null;
  photos: ServicePhoto[];
};
type Tx = postgres.TransactionSql;
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const fingerprint = (r: ServiceReceipt) => hash(receiptIdentity(r));
const visibleCloseout = (c: ServiceCloseout | null, member: TeamMember) =>
  c && member.role !== "admin" ? { ...c, phone: "", email: "" } : c;
async function context(
  tx: Tx,
  target: ServiceTarget,
  owner: string,
): Promise<Context> {
  const [record] =
    await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
  if (!record) throw new CloseoutError("No se pudo consultar el servicio.");
  const state = JSON.parse(record.payload) as State;
  const rows =
    target.kind === "history"
      ? await tx`SELECT payload,revision FROM route_visits WHERE owner=${owner} AND id=${target.id} FOR SHARE`
      : [];
  const visit = rows[0]
    ? ({ ...rows[0].payload, revision: rows[0].revision } as RouteVisit)
    : undefined;
  const [row] =
    await tx`SELECT payload,revision FROM service_closeouts WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id}`;
  const photos =
    await tx`SELECT id,caption,created_at AS "createdAt",created_by AS "createdBy" FROM service_photos WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND deleted_at IS NULL ORDER BY created_at,id`;
  return {
    state,
    visit,
    closeout: row
      ? ({ ...row.payload, revision: row.revision } as ServiceCloseout)
      : null,
    photos: photos as unknown as ServicePhoto[],
  };
}
async function authorized<T>(
  member: TeamMember,
  target: ServiceTarget,
  owner: string,
  action: (tx: Tx, ctx: Context) => Promise<T>,
): Promise<T> {
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role=${member.role} AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError(
        "Tus permisos cambiaron. Actualiza antes de continuar.",
      );
    await tx`SELECT pg_advisory_xact_lock(hashtext(${owner + ":closeout:" + target.kind + ":" + target.id}))`;
    const ctx = await context(tx, target, owner);
    const assignedHistory =
      member.role === "groomer" && target.kind === "history";
    if (assignedHistory)
      await requireAssignedRouteVisit(tx, member, ctx.visit, owner);
    try {
      requireServiceAccess(
        member,
        target,
        ctx.state,
        ctx.visit,
        assignedHistory,
      );
    } catch (e) {
      if (e instanceof AccessError) throw e;
      throw new CloseoutError(
        e instanceof Error ? e.message : "Servicio no disponible.",
      );
    }
    return action(tx, ctx);
  }) as Promise<T>;
}
async function audit(tx: Tx, member: TeamMember, action: string) {
  await tx`INSERT INTO team_audit(id,at,actor,action) VALUES (${crypto.randomUUID()},${new Date().toISOString()},${member.name},${action})`;
}
async function revoke(tx: Tx, target: ServiceTarget, owner: string) {
  await tx`UPDATE service_receipt_shares SET revoked_at=${new Date().toISOString()} WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND revoked_at IS NULL`;
  await tx`UPDATE service_email_outbox SET status='canceled',share_token=NULL,error_code='service_changed' WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND status IN ('pending','retry','failed')`;
}
export async function readCloseout(
  member: TeamMember,
  target: ServiceTarget,
  owner = BUSINESS_KEY,
) {
  return authorized(member, target, owner, async (tx, ctx) => {
    const clientId =
      target.kind === "history"
        ? ctx.visit!.clientId
        : ctx.state.appointments.find((a) => a.id === target.id)!.clientId;
    const client = ctx.state.clients.find((c) => c.id === clientId);
    const draft: ServiceCloseout = ctx.closeout || {
      tip: null,
      tipMethod: null,
      ownerNote: "",
      phone: client?.phone || "",
      email: client?.email || "",
      completedAt: "",
      updatedAt: "",
      updatedBy: "",
      revision: 0,
    };
    return {
      closeout: visibleCloseout(ctx.closeout, member),
      photos: ctx.photos,
      phone: member.role === "admin" ? client?.phone || "" : "",
      email: member.role === "admin" ? client?.email || "" : "",
      canManageContacts: member.role === "admin",
      delivery: await deliveryStatus(
        tx,
        target,
        owner,
        ctx.closeout,
        ctx.photos,
        member.role === "admin",
      ),
      receipt: serviceReceipt(ctx.state, target, draft, ctx.photos, ctx.visit),
    };
  });
}
export async function saveCloseout(
  member: TeamMember,
  raw: unknown,
  owner = BUSINESS_KEY,
) {
  const parsed = closeoutSchema.safeParse(raw);
  if (!parsed.success)
    throw new CloseoutError(
      "Revisa la propina, el correo y la confirmación de servicio terminado.",
    );
  const input = parsed.data,
    target = { kind: input.kind, id: input.id };
  return authorized(member, target, owner, async (tx, ctx) => {
    if (!ctx.photos.length)
      throw new CloseoutError(
        "Guarda al menos una foto antes de cerrar el servicio.",
      );
    if (
      member.role === "groomer" &&
      target.kind === "history" &&
      ctx.visit?.workStatus !== "Completado"
    )
      throw new CloseoutError(
        "Finaliza el servicio antes de guardar el cierre.",
      );
    if (member.role !== "admin" && (input.phone || input.email))
      throw new AccessError(
        "Solo Administración puede elegir o cambiar el contacto del cliente.",
      );
    if ((ctx.closeout?.revision || 0) !== input.revision)
      throw new CloseoutError(
        "Otra persona cambió el cierre. Actualiza antes de guardar.",
      );
    if (
      target.kind === "appointment" &&
      ctx.state.appointments.find((a) => a.id === target.id)!.status !==
        "Completado"
    )
      throw new CloseoutError(
        "Finaliza el servicio antes de guardar su cierre.",
      );
    const now = new Date().toISOString();
    const clientId =
      target.kind === "history"
        ? ctx.visit!.clientId
        : ctx.state.appointments.find((a) => a.id === target.id)!.clientId;
    const client = ctx.state.clients.find((c) => c.id === clientId);
    const next: ServiceCloseout = {
      tip: input.tip,
      tipMethod: input.tip ? input.tipMethod : null,
      ownerNote: input.ownerNote,
      phone:
        member.role === "admin"
          ? input.phone
          : ctx.closeout?.phone || client?.phone || "",
      email:
        member.role === "admin"
          ? input.email || client?.email || ""
          : client?.email || ctx.closeout?.email || "",
      completedAt:
        ctx.closeout?.completedAt ||
        (target.kind === "appointment"
          ? ctx.state.appointments.find((a) => a.id === target.id)!.finishedAt
          : null) ||
        now,
      updatedAt: now,
      updatedBy: member.name,
      revision: input.revision + 1,
    };
    await tx`INSERT INTO service_closeouts(owner,kind,visit_id,payload,revision) VALUES (${owner},${target.kind},${target.id},${tx.json(next)},${next.revision}) ON CONFLICT(owner,kind,visit_id) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision`;
    const receipt = serviceReceipt(
      ctx.state,
      target,
      next,
      ctx.photos,
      ctx.visit,
    );
    if (
      !ctx.closeout ||
      ctx.closeout.email !== next.email ||
      receiptIdentity(
        serviceReceipt(ctx.state, target, ctx.closeout, ctx.photos, ctx.visit),
      ) !== receiptIdentity(receipt)
    )
      await revoke(tx, target, owner);
    const emailJobId = await queueServiceEmail(tx, {
      owner,
      target,
      receipt,
      email: next.email,
      actor: member.name,
    });
    await audit(
      tx,
      member,
      `Cierre con foto/recibo guardado: ${target.id}. Propina registrada por separado.`,
    );
    return {
      closeout: visibleCloseout(next, member),
      photos: ctx.photos,
      receipt,
      emailJobId,
      delivery: await deliveryStatus(
        tx,
        target,
        owner,
        next,
        ctx.photos,
        member.role === "admin",
      ),
    };
  });
}
export async function retryCloseoutEmail(
  member: TeamMember,
  target: ServiceTarget,
  owner = BUSINESS_KEY,
) {
  if (member.role !== "admin")
    throw new AccessError(
      "Solo Administración puede revisar o reintentar los avisos.",
    );
  return authorized(member, target, owner, async (tx, ctx) => {
    if (!ctx.closeout || !ctx.photos.length)
      throw new CloseoutError("Falta guardar la foto y el cierre.");
    const clientId =
      target.kind === "history"
        ? ctx.visit!.clientId
        : ctx.state.appointments.find((a) => a.id === target.id)!.clientId;
    const email =
      ctx.state.clients.find((c) => c.id === clientId)?.email ||
      ctx.closeout.email;
    if (!email)
      throw new CloseoutError(
        "Registra el correo del dueño en su ficha antes de reintentar.",
      );
    const next = { ...ctx.closeout, email };
    if (email !== ctx.closeout.email) {
      next.revision++;
      await tx`UPDATE service_closeouts SET payload=${tx.json(next)},revision=revision+1 WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id}`;
      await revoke(tx, target, owner);
    }
    const emailJobId = await queueServiceEmail(tx, {
      owner,
      target,
      receipt: serviceReceipt(ctx.state, target, next, ctx.photos, ctx.visit),
      email,
      actor: member.name,
    });
    if (emailJobId)
      await tx`UPDATE service_email_outbox SET status='pending',next_attempt_at=${new Date().toISOString()} WHERE id=${emailJobId} AND status IN ('retry','failed')`;
    await audit(
      tx,
      member,
      `Revisión de correo automático solicitada: ${target.id}.`,
    );
    return emailJobId;
  });
}
export async function addServicePhoto(
  member: TeamMember,
  target: ServiceTarget,
  photoId: string,
  caption: string,
  data: Buffer,
  owner = BUSINESS_KEY,
) {
  const pathname = `service-photos/${hash(owner).slice(0, 16)}/${photoId}-${hash(data).slice(0, 24)}.jpg`;
  let uploaded = false;
  try {
    return await authorized(member, target, owner, async (tx, ctx) => {
      const [prior] =
        await tx`SELECT owner,kind,visit_id,pathname,deleted_at AS "deletedAt",caption FROM service_photos WHERE id=${photoId}`;
      if (prior) {
        if (
          prior.owner !== owner ||
          prior.kind !== target.kind ||
          prior.visit_id !== target.id ||
          prior.pathname !== pathname ||
          prior.caption !== caption ||
          prior.deletedAt
        )
          throw new CloseoutError(
            "Esta foto ya se guardó con otros datos. Selecciónala de nuevo.",
          );
        return ctx.photos;
      }
      if (ctx.photos.length >= MAX_SERVICE_PHOTOS)
        throw new CloseoutError(
          `Puedes guardar hasta ${MAX_SERVICE_PHOTOS} fotos por servicio.`,
        );
      if (
        target.kind === "appointment" &&
        ctx.state.appointments.find((a) => a.id === target.id)!.status !==
          "Completado"
      )
        throw new CloseoutError(
          "Finaliza el servicio antes de guardar su foto.",
        );
      await put(pathname, data, {
        access: "private",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      uploaded = true;
      const now = new Date().toISOString();
      await tx`INSERT INTO service_photos(owner,id,kind,visit_id,pathname,caption,created_at,created_by) VALUES (${owner},${photoId},${target.kind},${target.id},${pathname},${caption},${now},${member.name})`;
      await revoke(tx, target, owner);
      await audit(
        tx,
        member,
        `Foto de servicio guardada: ${target.id} (${photoId}).`,
      );
      return [
        ...ctx.photos,
        { id: photoId, caption, createdAt: now, createdBy: member.name },
      ];
    });
  } catch (e) {
    if (uploaded)
      await database()
        .begin(async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${owner + ":closeout:" + target.kind + ":" + target.id}))`;
          const [referenced] =
            await tx`SELECT id FROM service_photos WHERE pathname=${pathname}`;
          // A lost commit response must not remove a photo that was actually saved.
          if (!referenced) await del(pathname);
        })
        .catch(() => {});
    throw e;
  }
}
export async function removeServicePhoto(
  member: TeamMember,
  target: ServiceTarget,
  photoId: string,
  owner = BUSINESS_KEY,
) {
  return authorized(member, target, owner, async (tx, ctx) => {
    if (!ctx.photos.some((p) => p.id === photoId))
      throw new CloseoutError("La foto ya no está disponible.");
    await tx`UPDATE service_photos SET deleted_at=${new Date().toISOString()} WHERE owner=${owner} AND kind=${target.kind} AND visit_id=${target.id} AND id=${photoId}`;
    await revoke(tx, target, owner);
    await audit(
      tx,
      member,
      `Foto retirada del cierre: ${target.id} (${photoId}).`,
    );
    return ctx.photos.filter((p) => p.id !== photoId);
  });
}
export async function servicePhotoPath(
  member: TeamMember,
  photoId: string,
  owner = BUSINESS_KEY,
) {
  const [photo] =
    await database()`SELECT kind,visit_id,pathname FROM service_photos WHERE owner=${owner} AND id=${photoId} AND deleted_at IS NULL`;
  if (!photo) throw new CloseoutError("Foto no disponible.");
  return authorized(
    member,
    { kind: photo.kind, id: photo.visit_id },
    owner,
    async () => photo.pathname as string,
  );
}
export async function createReceiptShare(
  member: TeamMember,
  target: ServiceTarget,
  owner = BUSINESS_KEY,
) {
  if (member.role !== "admin")
    throw new AccessError(
      "Solo Administración puede compartir enlaces o contactar al cliente.",
    );
  return authorized(member, target, owner, async (tx, ctx) => {
    if (!ctx.closeout || !ctx.photos.length)
      throw new CloseoutError(
        "Guarda el cierre y al menos una foto antes de compartir.",
      );
    const snapshot = serviceReceipt(
      ctx.state,
      target,
      ctx.closeout,
      ctx.photos,
      ctx.visit,
    );
    const token = randomBytes(32).toString("hex"),
      now = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await tx`INSERT INTO service_receipt_shares(token_hash,owner,kind,visit_id,snapshot,created_at,created_by,expires_at) VALUES (${hash(token)},${owner},${target.kind},${target.id},${tx.json(snapshot)},${now},${member.name},${expiresAt})`;
    await audit(
      tx,
      member,
      `Enlace temporal de foto y recibo preparado: ${target.id}. El envío se revisa en WhatsApp o correo.`,
    );
    return { token, receipt: snapshot, expiresAt };
  });
}
export async function revokeReceiptShares(
  member: TeamMember,
  target: ServiceTarget,
  owner = BUSINESS_KEY,
) {
  if (member.role !== "admin")
    throw new AccessError(
      "Solo Administración puede revocar enlaces del cliente.",
    );
  return authorized(member, target, owner, async (tx) => {
    await revoke(tx, target, owner);
    await audit(
      tx,
      member,
      `Enlaces de foto y recibo revocados: ${target.id}.`,
    );
  });
}
export async function sharedReceipt(token: unknown, photoId?: string) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return database().begin(async (tx) => {
    const [share] =
      await tx`SELECT owner,kind,visit_id,snapshot FROM service_receipt_shares WHERE token_hash=${hash(token)} AND revoked_at IS NULL AND expires_at>${new Date().toISOString()} FOR SHARE`;
    if (!share) return null;
    const target = { kind: share.kind, id: share.visit_id } as ServiceTarget;
    const ctx = await context(tx, target, share.owner);
    if (!ctx.closeout) return null;
    let current: ServiceReceipt;
    try {
      current = serviceReceipt(
        ctx.state,
        target,
        ctx.closeout,
        ctx.photos,
        ctx.visit,
      );
    } catch {
      return null;
    }
    if (fingerprint(current) !== fingerprint(share.snapshot as ServiceReceipt))
      return null;
    if (photoId) {
      if (!current.photos.some((p) => p.id === photoId)) return null;
      const [photo] =
        await tx`SELECT pathname FROM service_photos WHERE owner=${share.owner} AND kind=${share.kind} AND visit_id=${share.visit_id} AND id=${photoId} AND deleted_at IS NULL`;
      return photo ? { pathname: photo.pathname as string } : null;
    }
    return { receipt: share.snapshot as ServiceReceipt };
  });
}
