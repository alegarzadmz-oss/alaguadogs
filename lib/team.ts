import type { Appointment, Command, State } from "./operations";

export const BUSINESS_KEY = "business:alagua-dogs";
export const BOOTSTRAP_MEMBER_ID = "alagua-administration";
export type TeamRole = "admin" | "groomer";
export type MemberStatus = "pending" | "active" | "inactive";
export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  vanId: string;
  status: MemberStatus;
  userId: string | null;
  version: number;
};
export type Viewer = Pick<TeamMember, "id" | "name" | "role" | "vanId">;
export type PublicMember = Omit<TeamMember, "userId"> & { activated: boolean };
export type TeamContext = { viewer: Viewer; members: PublicMember[] };
export const roleLabel = (role: TeamRole) =>
  role === "admin" ? "Administración" : "Bañador/a";

export class AccessError extends Error {
  constructor(
    message = "Tu cuenta no tiene acceso al equipo. Solicita a administración un enlace de activación.",
  ) {
    super(message);
  }
}

export function publicMember({
  userId: _userId,
  ...member
}: TeamMember): PublicMember {
  return { ...member, activated: !!_userId };
}

export function belongsTo(member: TeamMember, appointment: Appointment) {
  return appointment.groomerId === member.id;
}

// Always apply this projection on the server, including write responses and retries.
export function visibleState(state: State, member: TeamMember): State {
  if (member.role === "admin") return state;
  const appointments = state.appointments.filter((a) => belongsTo(member, a));
  const ids = new Set(appointments.map((a) => a.id));
  const clientIds = new Set(appointments.map((a) => a.clientId));
  const petIds = new Set(appointments.map((a) => a.petId));
  const vanIds = new Set(appointments.map((a) => a.vanId));
  if (member.vanId) vanIds.add(member.vanId);
  const serviceIds = new Set(appointments.map((a) => a.serviceId));
  return {
    ...state,
    appointments: appointments.map((a) => ({ ...a, cost: 0, extraCost: 0 })),
    clients: state.clients
      .filter((c) => clientIds.has(c.id))
      .map((c) => ({ ...c, pets: c.pets.filter((p) => petIds.has(p.id)) })),
    payments: state.payments.filter((p) => ids.has(p.appointmentId)),
    incidents: state.incidents.filter((i) => ids.has(i.appointmentId)),
    vans: state.vans
      .filter((v) => vanIds.has(v.id))
      .map((v) => ({ ...v, groomer: member.name, notes: "" })),
    services: state.services
      .filter((s) => serviceIds.has(s.id))
      .map((s) => ({ ...s, cost: 0 })),
    audit: [],
    operations: [],
  };
}

export function authorizeCommand(
  state: State,
  command: Command,
  member: TeamMember,
) {
  if (member.status !== "active")
    throw new AccessError("Tu acceso está desactivado.");
  if (member.role === "admin") return;
  let appointmentId: unknown;
  if (command.type === "status") {
    if (!["En servicio", "Completado"].includes(String(command.status)))
      throw new AccessError("Solo administración puede cancelar citas.");
    appointmentId = command.id;
  } else if (command.type === "payment" || command.type === "incident") {
    appointmentId = command.appointmentId;
  } else {
    throw new AccessError("Esta acción requiere permisos de administración.");
  }
  const appointment = state.appointments.find((a) => a.id === appointmentId);
  if (!appointment || !belongsTo(member, appointment))
    throw new AccessError("Solo puedes trabajar con tus citas asignadas.");
  if (command.type === "incident" && command.clientId !== appointment.clientId)
    throw new AccessError(
      "La incidencia debe corresponder a tu visita asignada.",
    );
}
