import { z } from "zod";
import { database } from "./store";
import { requireHistoryAdmin } from "./route-history";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import {
  captureSchema,
  toCaptureInput,
  duplicateVisits,
  newCapturedVisit,
  reviseVisitDetails,
  validateCapture,
} from "@/lib/route-capture";
import type { State } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";

export const batchSchema = z
  .object({
    operationId: z.string().uuid(),
    sourceText: z.string().max(60000),
    rows: z
      .array(
        z
          .object({ visit: captureSchema, duplicateConfirmed: z.boolean() })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function importRoutes(
  member: TeamMember,
  raw: unknown,
  owner = BUSINESS_KEY,
) {
  requireHistoryAdmin(member);
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) throw Error("Revisa la vista previa antes de importar.");
  const input = parsed.data;
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError(
        "Tus permisos cambiaron. Actualiza antes de importar.",
      );
    await tx`SELECT pg_advisory_xact_lock(hashtext(${owner + ":route-capture"}))`;
    const [record] =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    if (!record) throw Error("No se pudo consultar el directorio.");
    const state = JSON.parse(record.payload) as State;
    const stored =
      await tx`SELECT id,payload,revision FROM route_visits WHERE owner=${owner} ORDER BY id FOR UPDATE`;
    if (stored.length + input.rows.length > 10000)
      throw Error(
        "El historial necesita paginación antes de agregar más registros.",
      );
    const existing = stored.map(
      (r) => ({ ...r.payload, revision: r.revision }) as RouteVisit,
    );
    const created: RouteVisit[] = [];
    for (const [i, row] of input.rows.entries()) {
      const v = validateCapture(row.visit, state),
        id = `capture-${input.operationId}-${i}`;
      const prior = existing.find((p) => p.id === id);
      if (prior) {
        if (
          JSON.stringify(validateCapture(toCaptureInput(prior), state)) !==
            JSON.stringify(v) ||
          prior.price !== v.price ||
          prior.method !== v.method ||
          prior.notes !== v.notes
        )
          throw Error(
            "Este envío ya se guardó con otros datos. Actualiza la lista antes de volver a importar.",
          );
        created.push(prior);
        continue;
      }
      const duplicates = duplicateVisits(v, existing);
      if (duplicates.length && !row.duplicateConfirmed)
        throw Error(
          `Posible duplicado: ${v.clientName}, ${v.date}. Revisa la coincidencia antes de importar.`,
        );
      const order =
        Math.max(
          0,
          ...existing
            .filter(
              (r) => r.date === v.date && r.vanId === v.vanId && !r.deletedAt,
            )
            .map((r) => r.order),
        ) + 1;
      const visit = newCapturedVisit(
        v,
        id,
        order,
        state,
        new Date().toISOString(),
      );
      const original = {
        visit,
        sourceBatch: input.operationId,
        ...(i === 0 ? { sourceText: input.sourceText } : {}),
        capturedBy: member.name,
      };
      await tx`INSERT INTO route_visits(owner,id,service_date,payload,original,revision) VALUES (${owner},${id},${v.date},${tx.json(visit)},${tx.json(original)},0)`;
      existing.push(visit);
      created.push(visit);
    }
    const fresh = created.filter((v) => !stored.some((r) => r.id === v.id));
    if (fresh.length)
      await tx`INSERT INTO team_audit(id,at,actor,action) VALUES (${crypto.randomUUID()},${new Date().toISOString()},${member.name},${`${fresh.length} visitas capturadas desde vista previa. Lote ${input.operationId}.`})`;
    return created;
  });
}

export const managementSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("details"),
      id: z.string().min(1).max(100),
      revision: z.number().int().nonnegative(),
      visit: captureSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("archive"),
      id: z.string().min(1).max(100),
      revision: z.number().int().nonnegative(),
      confirmReceived: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      id: z.string().min(1).max(100),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export async function manageRoute(
  member: TeamMember,
  raw: unknown,
  owner = BUSINESS_KEY,
) {
  requireHistoryAdmin(member);
  const parsed = managementSchema.safeParse(raw);
  if (!parsed.success) throw Error("Revisa los datos de la visita.");
  const input = parsed.data;
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError(
        "Tus permisos cambiaron. Actualiza antes de guardar.",
      );
    await tx`SELECT pg_advisory_xact_lock(hashtext(${owner + ":route-capture"}))`;
    const [record] =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    const [row] =
      await tx`SELECT payload,revision FROM route_visits WHERE owner=${owner} AND id=${input.id} FOR UPDATE`;
    if (!record || !row) throw Error("No se encontró la visita.");
    if (row.revision !== input.revision)
      throw Error("Otra persona cambió la visita. Actualiza antes de guardar.");
    const current = { ...row.payload, revision: row.revision } as RouteVisit;
    let next: RouteVisit;
    if (input.action === "details") {
      if (current.deletedAt)
        throw Error("Restaura la visita antes de editarla.");
      next = reviseVisitDetails(
        current,
        input.visit,
        JSON.parse(record.payload) as State,
      );
      if (next.received !== true) next.confirmedBy = null;
      if (next.received !== current.received) {
        next.receiptUpdatedAt = new Date().toISOString();
        next.receiptUpdatedBy = member.name;
      }
    } else if (input.action === "archive") {
      if (current.received && !input.confirmReceived)
        throw Error(
          "La visita tiene un cobro confirmado. Confirma que deseas retirarla de los totales; el registro se conservará en el archivo.",
        );
      next = {
        ...current,
        deletedAt: new Date().toISOString(),
        deletedBy: member.name,
        revision: current.revision + 1,
      };
    } else {
      next = {
        ...current,
        deletedAt: null,
        deletedBy: null,
        revision: current.revision + 1,
      };
    }
    await tx`UPDATE route_visits SET service_date=${next.date},payload=${tx.json(next)},revision=revision+1 WHERE owner=${owner} AND id=${input.id} AND revision=${row.revision}`;
    await tx`INSERT INTO team_audit(id,at,actor,action) VALUES (${crypto.randomUUID()},${new Date().toISOString()},${member.name},${`${input.action === "details" ? "Visita editada" : input.action === "archive" ? "Visita retirada de ruta y conservada en archivo" : "Visita restaurada"}: ${next.clientName}, ${next.date} (${next.id}).`})`;
    return next;
  });
}
