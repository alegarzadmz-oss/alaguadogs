import { AccessError, type TeamMember } from "./team";
import type { RouteVisit } from "./route-history";

export function requireRouteReader(member: TeamMember) {
  if (
    member.status !== "active" ||
    !["admin", "reception"].includes(member.role)
  )
    throw new AccessError(
      "Esta vista requiere acceso de administración o Recepción.",
    );
}
export function authorizeReceiptEdit(
  member: TeamMember,
  visit: RouteVisit,
  input: unknown,
) {
  requireRouteReader(member);
  if (member.role === "admin") return;
  if (visit.deletedAt || visit.method !== "Transferencia")
    throw new AccessError(
      "Recepción solo puede confirmar transferencias activas.",
    );
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => k !== "received") ||
    typeof (input as { received?: unknown }).received !== "boolean"
  )
    throw new AccessError(
      "Recepción solo puede marcar o desmarcar la recepción; no modificar importes, clientes ni rutas.",
    );
}
export function receiptProjection(v: RouteVisit): RouteVisit {
  return {
    id: v.id,
    date: v.date,
    vanId: v.vanId,
    sourceVan: v.sourceVan,
    order: v.order,
    clientId: v.clientId,
    clientName: v.clientName,
    address: v.address,
    pets: v.pets,
    extras: v.extras,
    price: v.price,
    method: v.method,
    received: v.received,
    confirmedAt: v.confirmedAt,
    confirmedOn: v.confirmedOn,
    confirmedBy: v.confirmedBy,
    receiptUpdatedAt: v.receiptUpdatedAt,
    receiptUpdatedBy: v.receiptUpdatedBy,
    confirmationNote: v.confirmationNote,
    source: "Registro de transferencias",
    importedAt: "",
    revision: v.revision,
  };
}
