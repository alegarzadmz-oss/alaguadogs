import type postgres from "postgres";
import { database } from "./store";
import { projectSavedRoute, type SavedRouteRow } from "./saved-routes";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import { today, type State } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";
import {
  staffRoute,
  staffVisit,
  workdayCommand,
  workdayState,
  WorkdayError,
} from "@/lib/workday";

async function context(
  tx: postgres.TransactionSql,
  member: TeamMember,
  day: string,
  owner: string,
  write = false,
) {
  if (member.role !== "groomer" || member.status !== "active")
    throw new AccessError(
      "Esta vista es para el trabajo asignado del bañador.",
    );
  const allowed =
    await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='groomer' AND status='active' FOR SHARE`;
  if (!allowed.length)
    throw new AccessError("Tu acceso cambió. Actualiza el portal.");
  const [record] = write
    ? await tx`SELECT payload,revision FROM operation_state WHERE owner=${owner} FOR UPDATE`
    : await tx`SELECT payload,revision FROM operation_state WHERE owner=${owner} FOR SHARE`;
  if (!record) throw new WorkdayError("La agenda no está disponible.");
  const source = JSON.parse(record.payload) as State;
  const records =
    await tx`SELECT payload,revision FROM route_visits WHERE owner=${owner} AND service_date=${day} ORDER BY id LIMIT 1001 FOR SHARE`;
  if (records.length > 1000)
    throw new WorkdayError(
      "Contacta a Administración para revisar las visitas del día.",
    );
  const all = records.map(
    (r) => ({ ...r.payload, revision: r.revision }) as RouteVisit,
  );
  const rows =
    await tx`SELECT * FROM saved_routes WHERE owner=${owner} AND service_date=${day} AND status='active' AND assigned_to=${member.id} ORDER BY van_id,id FOR SHARE`;
  const routes = rows.map((r) =>
    projectSavedRoute(r as SavedRouteRow, source, all, true),
  );
  const ids = new Set(
    routes
      .filter((r) => !r.stale && r.kind === "history")
      .flatMap((r) => r.stops.map((s) => s.id)),
  );
  const visits = all.filter((v) => ids.has(v.id) && !v.deletedAt);
  return { source, revision: record.revision as number, routes, visits };
}
export async function readWorkday(
  member: TeamMember,
  day = today(),
  owner = BUSINESS_KEY,
) {
  return database().begin(async (tx) => {
    const result = await context(tx, member, day, owner);
    return {
      state: workdayState(result.source, member, day, result.visits),
      revision: result.revision,
      routes: result.routes.map(staffRoute),
      visits: result.visits.map(staffVisit),
    };
  });
}
export async function requireAssignedRouteVisit(
  tx: postgres.TransactionSql,
  member: TeamMember,
  visit: RouteVisit | undefined,
  owner: string,
  day = today(),
) {
  if (!visit || visit.date !== day)
    throw new AccessError(
      "Solo puedes trabajar en tus visitas publicadas del día.",
    );
  const result = await context(tx, member, day, owner);
  if (!result.visits.some((v) => v.id === visit.id))
    throw new AccessError("Esta visita ya no está asignada a tu ruta vigente.");
}
export async function saveWorkday(
  member: TeamMember,
  raw: unknown,
  owner = BUSINESS_KEY,
  day = today(),
) {
  const parsed = workdayCommand.safeParse(raw);
  if (!parsed.success) throw new WorkdayError("Revisa los datos de la visita.");
  const input = parsed.data;
  return database().begin(async (tx) => {
    const ctx = await context(tx, member, day, owner, true);
    const current = ctx.visits.find((v) => v.id === input.visitId);
    if (!current)
      throw new AccessError(
        "La visita no pertenece a tu ruta publicada de hoy.",
      );
    const now = new Date().toISOString();
    let action = "";
    if (input.action === "incident") {
      const duplicate = ctx.source.incidents.find(
        (i) => i.id === input.operationId,
      );
      if (duplicate) {
        if (duplicate.routeVisitId !== current.id)
          throw new WorkdayError("Este registro ya se utilizó en otra visita.");
        return { ok: true };
      }
      ctx.source.incidents.unshift({
        id: input.operationId,
        clientId: current.clientId || "",
        appointmentId: "",
        routeVisitId: current.id,
        category: input.category,
        description: input.description,
        resolution: "",
        resolved: false,
        createdAt: now,
      });
      ctx.source.audit.unshift({
        at: now,
        actor: member.name,
        action: `Incidencia de ruta: ${current.id} · ${input.category}`,
      });
      await tx`UPDATE operation_state SET payload=${JSON.stringify(ctx.source)},revision=revision+1 WHERE owner=${owner}`;
      action = `Incidencia registrada en visita de ruta ${current.id}`;
    } else {
      const next = { ...current, revision: current.revision + 1 };
      if (input.action === "payment") {
        if (current.staffPayment?.id === input.operationId) return { ok: true };
        if (current.revision !== input.revision)
          throw new WorkdayError(
            "La visita cambió. Actualiza el día y revisa el importe antes de registrar el cobro.",
          );
        if (current.received === true)
          throw new WorkdayError(
            "El cobro ya está confirmado. Solicita una revisión a Administración.",
          );
        if (current.price === null)
          throw new WorkdayError(
            "Administración debe capturar primero el precio del servicio.",
          );
        next.method = input.method;
        next.received = input.method !== "Transferencia";
        next.confirmedAt = next.received ? now : null;
        next.confirmedOn = next.received ? day : null;
        next.confirmedBy = next.received ? member.name : null;
        next.confirmationNote = next.received
          ? "Cobro completo registrado por el bañador."
          : "Transferencia reportada; Administración debe verificarla.";
        next.receiptUpdatedAt = now;
        next.receiptUpdatedBy = member.name;
        next.staffPayment = {
          id: input.operationId,
          amount: current.price,
          method: input.method,
          at: now,
          by: member.id,
        };
        // A previously shared receipt must not keep presenting an older payment.
        await tx`UPDATE service_receipt_shares SET revoked_at=${now} WHERE owner=${owner} AND kind='history' AND visit_id=${current.id} AND revoked_at IS NULL`;
        await tx`UPDATE service_email_outbox SET status='canceled',share_token=NULL,error_code='service_changed' WHERE owner=${owner} AND kind='history' AND visit_id=${current.id} AND status IN ('pending','retry','failed')`;
        action = `Cobro completo de ruta ${current.id}: ${current.price} centavos · ${input.method}${next.received ? "" : " · por verificar"}`;
      } else {
        if (current.workStatus === input.status) return { ok: true };
        if (
          current.workStatus === "Completado" ||
          (input.status === "Completado" &&
            current.workStatus !== "En servicio")
        )
          throw new WorkdayError("Inicia el servicio antes de finalizarlo.");
        next.workStatus = input.status;
        if (input.status === "En servicio") next.startedAt = now;
        else {
          next.finishedAt = now;
          next.actualMinutes = Math.max(
            1,
            Math.round(
              (Date.parse(now) - Date.parse(current.startedAt!)) / 60000,
            ),
          );
        }
        action = `Visita de ruta ${current.id}: ${input.status}`;
      }
      await tx`UPDATE route_visits SET payload=${tx.json(next)},revision=revision+1 WHERE owner=${owner} AND id=${current.id}`;
    }
    await tx`INSERT INTO team_audit(id,at,actor,action) VALUES(${crypto.randomUUID()},${now},${member.id},${action})`;
    return { ok: true };
  });
}
