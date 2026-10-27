import { z } from "zod";
import { AccessError, visibleState, type TeamMember } from "./team";
import type { State } from "./operations";
import type { RouteVisit } from "./route-history";
import type { SavedRoute } from "./saved-routes";

export const incidentCategories = [
  "Pago pendiente",
  "Cancelación",
  "Demora",
  "Atención al cliente",
  "Manejo de mascota",
  "VAN / equipo",
  "Otro",
] as const;
export const workdayCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("status"),
      visitId: z.string().min(1).max(100),
      status: z.enum(["En servicio", "Completado"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("payment"),
      visitId: z.string().min(1).max(100),
      revision: z.number().int().nonnegative(),
      operationId: z.uuid(),
      method: z.enum(["Efectivo", "Tarjeta", "Transferencia"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("incident"),
      visitId: z.string().min(1).max(100),
      operationId: z.uuid(),
      category: z.enum(incidentCategories),
      description: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type WorkdayCommand = z.infer<typeof workdayCommand>;
export class WorkdayError extends Error {}

// Mask contact details in free-text instructions as well as explicit fields.
export function staffText(value: string) {
  return value
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[contacto por Administración]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, (candidate) => {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15
        ? "[contacto por Administración]"
        : candidate;
    });
}
export function staffVisit(v: RouteVisit): RouteVisit {
  return {
    id: v.id,
    date: v.date,
    vanId: v.vanId,
    sourceVan: "",
    order: v.order,
    clientId: v.clientId,
    clientName: staffText(v.clientName),
    address: staffText(v.address),
    pets: v.pets.map((p) => ({
      ...p,
      name: staffText(p.name),
      breed: staffText(p.breed),
    })),
    extras: v.extras,
    notes: staffText(v.notes || ""),
    price: v.price,
    method: v.method,
    received: v.received,
    confirmedAt: v.confirmedAt,
    confirmedOn: v.confirmedOn,
    confirmationNote:
      v.method === "Transferencia" && v.received !== true
        ? "Administración verifica la transferencia."
        : "",
    source: "Mi ruta publicada",
    importedAt: "",
    revision: v.revision,
    workStatus: v.workStatus,
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
    actualMinutes: v.actualMinutes,
  };
}
export function staffRoute(r: SavedRoute): SavedRoute {
  return {
    id: r.id,
    date: r.date,
    vanId: r.vanId,
    van: r.van,
    kind: r.kind,
    base: staffText(r.base),
    stops: r.stops.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      client: staffText(s.client),
      address: staffText(s.address),
      time: s.time,
      duration: s.duration,
    })),
    status: r.status,
    createdAt: r.createdAt,
    createdBy: "Administración",
    publishedAt: r.publishedAt,
    assignedTo: r.assignedTo,
    assignedName: r.assignedName,
    revision: r.revision,
    stale: r.stale,
  };
}
export function workdayState(
  state: State,
  member: TeamMember,
  date: string,
  visits: RouteVisit[],
): State {
  if (member.role !== "groomer" || member.status !== "active")
    throw new AccessError();
  const projected = visibleState(
    {
      ...state,
      appointments: state.appointments.filter(
        (a) => a.date === date && a.status !== "Cancelado",
      ),
    },
    member,
  );
  const visitIds = new Set(visits.map((v) => v.id));
  const appointmentIds = new Set(projected.appointments.map((a) => a.id));
  const clientIds = new Set([
    ...projected.clients.map((c) => c.id),
    ...visits.map((v) => v.clientId),
  ]);
  return {
    demo: projected.demo,
    vans: projected.vans,
    services: projected.services,
    payments: projected.payments.map((p) => ({
      ...p,
      reference: staffText(p.reference),
    })),
    base: projected.base,
    audit: [],
    operations: [],
    appointments: projected.appointments.map((a) => ({
      ...a,
      notes: staffText(a.notes),
    })),
    clients: state.clients
      .filter((c) => clientIds.has(c.id))
      .map((c) => ({
        ...c,
        name: staffText(c.name),
        phone: "",
        email: "",
        address: staffText(c.address),
        notes: staffText(c.notes),
        pets: c.pets
          .filter(
            (p) =>
              projected.clients
                .find((x) => x.id === c.id)
                ?.pets.some((x) => x.id === p.id) ||
              visits.some(
                (v) =>
                  v.clientId === c.id && v.pets.some((x) => x.name === p.name),
              ),
          )
          .map((p) => ({ ...p, notes: staffText(p.notes) })),
      })),
    incidents: state.incidents
      .filter(
        (i) =>
          appointmentIds.has(i.appointmentId) ||
          (i.routeVisitId && visitIds.has(i.routeVisitId)),
      )
      .map((i) => ({
        ...i,
        description: staffText(i.description),
        resolution: staffText(i.resolution),
      })),
  };
}
