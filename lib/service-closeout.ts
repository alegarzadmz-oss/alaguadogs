import { z } from "zod";
import { money, paid, type State } from "./operations";
import { AccessError, belongsTo, type TeamMember } from "./team";
import type { RouteVisit } from "./route-history";

export const MAX_SERVICE_PHOTOS = 6;
export const serviceTargetSchema = z
  .object({
    kind: z.enum(["appointment", "history"]),
    id: z.string().min(1).max(100),
  })
  .strict();
export type ServiceTarget = z.infer<typeof serviceTargetSchema>;
const cents = z.number().int().min(0).max(100000000);
export const closeoutSchema = serviceTargetSchema
  .extend({
    action: z.literal("save"),
    revision: z.number().int().nonnegative(),
    tip: cents.nullable(),
    tipMethod: z.enum(["Efectivo", "Tarjeta", "Transferencia"]).nullable(),
    ownerNote: z.string().trim().max(600),
    phone: z.string().trim().max(40),
    email: z.union([z.email().max(254), z.literal("")]),
    completed: z.literal(true),
  })
  .strict()
  .refine((v) => !v.tip || !!v.tipMethod, "Indica cómo se recibió la propina.");
export type ServiceCloseout = {
  tip: number | null;
  tipMethod: "Efectivo" | "Tarjeta" | "Transferencia" | null;
  ownerNote: string;
  phone: string;
  email: string;
  completedAt: string;
  updatedAt: string;
  updatedBy: string;
  revision: number;
};
export type ServicePhoto = {
  id: string;
  caption: string;
  createdAt: string;
  createdBy: string;
};
export type ServiceReceipt = {
  clientName: string;
  pets: string[];
  date: string;
  service: string;
  price: number | null;
  paid: number | null;
  balance: number | null;
  methods: string[];
  tip: number | null;
  tipMethod: string | null;
  ownerNote: string;
  completedAt: string;
  generatedAt: string;
  photos: Pick<ServicePhoto, "id" | "caption">[];
};
export function requireServiceAccess(
  member: TeamMember,
  target: ServiceTarget,
  state: State,
  visit?: RouteVisit,
) {
  if (member.status !== "active" || member.role === "reception")
    throw new AccessError(
      "Las fotos y cierres requieren administración o el bañador asignado.",
    );
  if (target.kind === "history") {
    if (member.role !== "admin")
      throw new AccessError("Esta ruta requiere administración.");
    if (!visit || visit.deletedAt) throw Error("La visita no está disponible.");
  } else {
    const appointment = state.appointments.find((a) => a.id === target.id);
    if (!appointment || appointment.status === "Cancelado")
      throw Error("El servicio no está disponible.");
    if (member.role !== "admin" && !belongsTo(member, appointment))
      throw new AccessError("Solo puedes cerrar tus servicios asignados.");
  }
}
export function serviceReceipt(
  state: State,
  target: ServiceTarget,
  closeout: ServiceCloseout,
  photos: ServicePhoto[],
  visit?: RouteVisit,
): ServiceReceipt {
  const appointment = state.appointments.find((a) => a.id === target.id);
  if (target.kind === "history" && (!visit || visit.deletedAt))
    throw Error("Visita no disponible.");
  if (
    target.kind === "appointment" &&
    (!appointment || appointment.status !== "Completado")
  )
    throw Error("Finaliza el servicio antes de preparar el recibo.");
  const client = state.clients.find(
    (c) =>
      c.id ===
      (target.kind === "history" ? visit!.clientId : appointment!.clientId),
  );
  const price = target.kind === "history" ? visit!.price : appointment!.price;
  const received =
    target.kind === "history"
      ? visit!.received === true
        ? price
        : null
      : paid(state, target.id);
  return {
    clientName:
      target.kind === "history" ? visit!.clientName : client?.name || "Cliente",
    pets:
      target.kind === "history"
        ? visit!.pets.map((p) => p.name)
        : [
            client?.pets.find((p) => p.id === appointment!.petId)?.name ||
              "Mascota",
          ],
    date: target.kind === "history" ? visit!.date : appointment!.date,
    service:
      target.kind === "history"
        ? [
            ...new Set(
              visit!.pets.flatMap((p) => p.services?.map((s) => s.name) || []),
            ),
          ].join(" · ") || "Estética de mascotas"
        : state.services.find((s) => s.id === appointment!.serviceId)?.name ||
          "Estética de mascotas",
    price,
    paid: received,
    balance:
      price === null || received === null
        ? null
        : Math.max(0, price - received),
    methods:
      target.kind === "history"
        ? visit!.method === "Pendiente"
          ? []
          : [visit!.method]
        : [
            ...new Set(
              state.payments
                .filter((p) => p.appointmentId === target.id)
                .map((p) => p.method),
            ),
          ],
    tip: closeout.tip,
    tipMethod: closeout.tipMethod,
    ownerNote: closeout.ownerNote,
    completedAt: closeout.completedAt,
    generatedAt: new Date().toISOString(),
    photos: photos.map(({ id, caption }) => ({ id, caption })),
  };
}
export function receiptMessage(r: ServiceReceipt, url: string) {
  return [
    `¡${r.pets.join(" y ")} ya quedó listo! 🐾`,
    "AL’AGUA DOGS · Pets Spa",
    `Servicio del ${r.date}: ${r.service}`,
    `Importe del servicio: ${r.price === null ? "por confirmar" : money(r.price)}`,
    `Pago del servicio: ${r.paid === null ? "pendiente de confirmar" : money(r.paid)}${r.methods.length ? ` · ${r.methods.join(" / ")}` : ""}`,
    ...(r.balance === null ? [] : [`Saldo del servicio: ${money(r.balance)}`]),
    `Propina: ${r.tip === null ? "por registrar" : money(r.tip)}${r.tip && r.tipMethod ? ` · ${r.tipMethod}` : ""}`,
    ...(r.paid !== null && r.tip !== null
      ? [`Total recibido, incluida la propina: ${money(r.paid + r.tip)}`]
      : []),
    r.ownerNote,
    `Foto y resumen del servicio: ${url}`,
    "¡Gracias por confiar en nosotros!",
  ]
    .filter(Boolean)
    .join("\n");
}
export function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return "52" + digits;
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith("0"))
    return digits;
  return "";
}
export function receiptShareLinks(
  receipt: ServiceReceipt,
  url: string,
  phone: string,
  email: string,
) {
  const number = whatsappNumber(phone);
  const message = receiptMessage(receipt, url);
  return {
    message,
    whatsapp: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    email: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Así quedó ${receipt.pets.join(" y ")} · AL’AGUA DOGS`)}&body=${encodeURIComponent(message)}`,
  };
}
