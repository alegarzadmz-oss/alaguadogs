import { database } from "./store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import { reviseHistoryVisit, type RouteVisit } from "@/lib/route-history";
import type { State } from "@/lib/operations";

export function requireHistoryAdmin(member: TeamMember) {
  if (member.role !== "admin" || member.status !== "active")
    throw new AccessError(
      "El historial importado requiere acceso de administración.",
    );
}
export async function readHistory(member: TeamMember): Promise<RouteVisit[]> {
  requireHistoryAdmin(member);
  const records =
    await database()`SELECT payload, revision FROM route_visits WHERE owner=${BUSINESS_KEY} ORDER BY service_date DESC, id LIMIT 10001`;
  if (records.length > 10000)
    throw Error("El historial requiere paginación. Contacta a administración.");
  return records.map(
    (row) => ({ ...row.payload, revision: row.revision }) as RouteVisit,
  );
}
export async function updateHistory(
  member: TeamMember,
  id: string,
  revision: number,
  input: unknown,
): Promise<RouteVisit> {
  requireHistoryAdmin(member);
  return database().begin(async (tx) => {
    const permission =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!permission.length)
      throw new AccessError(
        "Tus permisos cambiaron. Actualiza antes de guardar.",
      );
    // Share lock prevents linking to a customer that is concurrently removed or changed.
    const latest =
      await tx`SELECT payload FROM operation_state WHERE owner=${BUSINESS_KEY} FOR SHARE`;
    if (!latest.length)
      throw Error("No se pudo leer el directorio de clientes.");
    const records =
      await tx`SELECT payload, revision FROM route_visits WHERE owner=${BUSINESS_KEY} AND id=${id} FOR UPDATE`;
    if (!records.length) throw Error("La visita ya no está disponible.");
    if (records[0].revision !== revision)
      throw Error(
        "Otra persona cambió esta visita. Actualiza y vuelve a guardar.",
      );
    const current = { ...records[0].payload, revision } as RouteVisit;
    const next = reviseHistoryVisit(
      current,
      input,
      JSON.parse(latest[0].payload) as State,
    );
    await tx`UPDATE route_visits SET payload=${tx.json(next)}, revision=revision+1 WHERE owner=${BUSINESS_KEY} AND id=${id} AND revision=${revision}`;
    await tx`INSERT INTO team_audit (id, at, actor, action) VALUES (${crypto.randomUUID()}, ${new Date().toISOString()}, ${member.name}, ${`Visita importada ${id}: importe, forma o confirmación de cobro actualizados (revisión ${revision + 1})`})`;
    return next;
  });
}
