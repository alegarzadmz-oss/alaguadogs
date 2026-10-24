import { database } from "./store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import { reviseHistoryVisit, type RouteVisit } from "@/lib/route-history";
import type { State } from "@/lib/operations";
import {
  authorizeReceiptEdit,
  receiptProjection,
  requireRouteReader,
} from "@/lib/route-permissions";

export function requireHistoryAdmin(member: TeamMember) {
  if (member.role !== "admin" || member.status !== "active")
    throw new AccessError(
      "El historial importado requiere acceso de administración.",
    );
}
export async function readHistory(
  member: TeamMember,
  owner = BUSINESS_KEY,
): Promise<RouteVisit[]> {
  requireRouteReader(member);
  const records =
    await database()`SELECT payload, revision FROM route_visits WHERE owner=${owner} ORDER BY service_date DESC, id LIMIT 10001`;
  if (records.length > 10000)
    throw Error("El historial requiere paginación. Contacta a administración.");
  const visits = records.map(
    (row) => ({ ...row.payload, revision: row.revision }) as RouteVisit,
  );
  return member.role === "reception"
    ? visits
        .filter((v) => v.method === "Transferencia" && !v.deletedAt)
        .map(receiptProjection)
    : visits;
}
export async function updateHistory(
  member: TeamMember,
  id: string,
  revision: number,
  input: unknown,
  owner = BUSINESS_KEY,
): Promise<RouteVisit> {
  requireRouteReader(member);
  return database().begin(async (tx) => {
    const permission =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role IN ('admin','reception') AND status='active' FOR SHARE`;
    if (!permission.length)
      throw new AccessError(
        "Tus permisos cambiaron. Actualiza antes de guardar.",
      );
    // Share lock prevents linking to a customer that is concurrently removed or changed.
    const latest =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    if (!latest.length)
      throw Error("No se pudo leer el directorio de clientes.");
    const records =
      await tx`SELECT payload, revision FROM route_visits WHERE owner=${owner} AND id=${id} FOR UPDATE`;
    if (!records.length) throw Error("La visita ya no está disponible.");
    if (records[0].revision !== revision)
      throw Error(
        "Otra persona cambió esta visita. Actualiza y vuelve a guardar.",
      );
    const current = { ...records[0].payload, revision } as RouteVisit;
    if (current.deletedAt)
      throw Error(
        "La visita está en el archivo. Restaúrala antes de modificarla.",
      );
    authorizeReceiptEdit(member, current, input);
    const fields =
      member.role === "reception"
        ? {
            price: current.price,
            method: current.method,
            clientId: current.clientId,
            vanId: current.vanId,
            received: (input as { received: boolean }).received,
          }
        : input;
    const now = new Date().toISOString();
    const next = reviseHistoryVisit(
      current,
      fields,
      JSON.parse(latest[0].payload) as State,
      now,
    );
    next.confirmedBy =
      next.received === true
        ? current.received === true
          ? current.confirmedBy || null
          : member.name
        : null;
    if (next.received !== current.received) {
      next.receiptUpdatedAt = now;
      next.receiptUpdatedBy = member.name;
    }
    await tx`UPDATE route_visits SET payload=${tx.json(next)}, revision=revision+1 WHERE owner=${owner} AND id=${id} AND revision=${revision}`;
    await tx`INSERT INTO team_audit (id, at, actor, action) VALUES (${crypto.randomUUID()}, ${new Date().toISOString()}, ${member.name}, ${`Visita importada ${id}: importe, forma o confirmación de cobro actualizados (revisión ${revision + 1})`})`;
    return member.role === "reception" ? receiptProjection(next) : next;
  });
}
