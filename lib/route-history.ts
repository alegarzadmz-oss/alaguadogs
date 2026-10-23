import type { Appointment, Client, State, Van } from "./operations";

export const ROUTE_SOURCE =
  "https://rutas-alaguadogs.blushharp12.chatgpt.site/consulta";
export const paymentMethods = [
  "Pendiente",
  "Efectivo",
  "Tarjeta",
  "Transferencia",
] as const;
export type RouteMethod = (typeof paymentMethods)[number];
export type RouteVisit = {
  id: string;
  date: string;
  vanId: string;
  sourceVan: string;
  order: number;
  clientId: string | null;
  clientName: string;
  address: string;
  pets: { name: string; breed: string }[];
  price: number | null;
  method: RouteMethod;
  received: boolean | null;
  confirmedAt: string | null;
  confirmedOn: string | null;
  confirmationNote: string;
  source: string;
  importedAt: string;
  revision: number;
};
export type BoardVisit = RouteVisit & {
  kind: "history" | "appointment";
  appointment?: Appointment;
  paidAmount: number;
  time: string | null;
};
export function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function shiftDay(day: string, count: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function weekDays(day: string) {
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const monday = shiftDay(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
export const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// A shared address alone never proves that two customer records are the same.
export function matchHistoryClient(
  visit: Pick<RouteVisit, "clientName" | "address" | "pets">,
  clients: Client[],
) {
  const number = visit.address.match(/\d+/)?.[0];
  const names = new Set(visit.pets.map((p) => normalized(p.name)));
  const candidates = clients.filter((client) => {
    const sameAddress =
      normalized(client.address) === normalized(visit.address);
    const sameNumber = !!number && number === client.address.match(/\d+/)?.[0];
    const samePet = client.pets.some((p) => names.has(normalized(p.name)));
    return (
      (sameAddress && samePet) ||
      (sameNumber &&
        samePet &&
        normalized(client.name) === normalized(visit.clientName))
    );
  });
  return candidates.length === 1 ? candidates[0].id : null;
}

export function appointmentVisits(state: State): BoardVisit[] {
  const clients = new Map(state.clients.map((c) => [c.id, c]));
  const payments = new Map<string, typeof state.payments>();
  for (const p of state.payments)
    payments.set(p.appointmentId, [
      ...(payments.get(p.appointmentId) || []),
      p,
    ]);
  return state.appointments
    .filter((a) => a.status !== "Cancelado")
    .map((a) => {
      const client = clients.get(a.clientId);
      const pet = client?.pets.find((p) => p.id === a.petId);
      const receipts = payments.get(a.id) || [];
      const paidAmount = receipts.reduce((sum, p) => sum + p.amount, 0);
      const methods = [...new Set(receipts.map((p) => p.method))];
      return {
        id: a.id,
        date: a.date,
        vanId: a.vanId,
        sourceVan: "",
        order: 0,
        clientId: a.clientId,
        clientName: client?.name || "Cliente no disponible",
        address: client?.address || "",
        pets: [{ name: pet?.name || "Mascota", breed: pet?.breed || "" }],
        price: a.price,
        method: (methods.length === 1
          ? methods[0]
          : "Pendiente") as RouteMethod,
        received: paidAmount >= a.price,
        confirmedAt: null,
        confirmedOn: null,
        confirmationNote: "",
        source: "Agenda de alagua.dog",
        importedAt: "",
        revision: 0,
        kind: "appointment" as const,
        appointment: a,
        paidAmount,
        time: a.time,
      };
    });
}
export function boardVisits(state: State, history: RouteVisit[]): BoardVisit[] {
  return [
    ...appointmentVisits(state),
    ...history.map((v) => ({
      ...v,
      kind: "history" as const,
      paidAmount: v.received ? (v.price ?? 0) : 0,
      time: null,
    })),
  ];
}
export function summarizeVisits(visits: BoardVisit[]) {
  // Scheduled services at one address share a stop, but each service retains its price.
  const addresses = new Set(
    visits.map((v) => `${v.date}|${v.vanId}|${normalized(v.address) || v.id}`),
  );
  return {
    pets: visits.reduce((n, v) => n + v.pets.length, 0),
    stops: addresses.size,
    amount: visits.reduce((n, v) => n + (v.price ?? 0), 0),
    missingPrice: visits.filter((v) => v.price === null).length,
    received: visits.reduce((n, v) => n + v.paidAmount, 0),
    toVerify: visits.reduce(
      (n, v) => n + Math.max(0, (v.price ?? 0) - v.paidAmount),
      0,
    ),
  };
}
export function vanLoads(visits: BoardVisit[], vans: Van[]) {
  return vans.map((v) => ({
    ...v,
    ...summarizeVisits(visits.filter((row) => row.vanId === v.id)),
  }));
}

export function reviseHistoryVisit(
  current: RouteVisit,
  input: unknown,
  state: State,
  now = new Date().toISOString(),
): RouteVisit {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Revisa los datos de la visita.");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (k) => !["price", "method", "received", "clientId", "vanId"].includes(k),
    )
  )
    throw Error("Campo no permitido.");
  const price = value.price;
  if (
    price !== null &&
    (!Number.isSafeInteger(price) ||
      Number(price) < 0 ||
      Number(price) > 100000000)
  )
    throw Error(
      "Indica un importe válido en centavos o deja el precio pendiente.",
    );
  if (!paymentMethods.includes(value.method as RouteMethod))
    throw Error("Forma de pago inválida.");
  if (value.received !== null && typeof value.received !== "boolean")
    throw Error("Estado de cobro inválido.");
  if (
    value.clientId !== null &&
    !state.clients.some((c) => c.id === value.clientId)
  )
    throw Error("Selecciona un cliente existente.");
  if (!state.vans.some((v) => v.id === value.vanId))
    throw Error("Selecciona una camioneta existente.");
  const changed = price !== current.price || value.method !== current.method;
  const received = changed
    ? value.method === "Pendiente"
      ? null
      : false
    : (value.received as boolean | null);
  if (received && (price === null || value.method === "Pendiente"))
    throw Error("Captura el importe y la forma de pago antes de confirmar.");
  const newlyConfirmed = received === true && current.received !== true;
  const stillConfirmed = received === true && !changed;
  return {
    ...current,
    price: price as number | null,
    method: value.method as RouteMethod,
    received,
    clientId: value.clientId as string | null,
    vanId: value.vanId as string,
    confirmedAt: stillConfirmed
      ? newlyConfirmed
        ? now
        : current.confirmedAt
      : null,
    confirmedOn: stillConfirmed
      ? newlyConfirmed
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Monterrey",
          }).format(new Date(now))
        : current.confirmedOn
      : null,
    confirmationNote: stillConfirmed
      ? newlyConfirmed
        ? "Confirmado en alagua.dog"
        : current.confirmationNote
      : "",
    revision: current.revision + 1,
  };
}

// Protect spreadsheet users from formula interpretation when opening an exported CSV.
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function routeCSV(visits: BoardVisit[], vans: Van[]) {
  const header = [
    "Fecha",
    "Unidad",
    "Cliente",
    "Domicilio",
    "Mascotas",
    "Precio MXN",
    "Forma de pago",
    "Estado de cobro",
    "Confirmación",
    "Origen",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...visits.map((v) => [
        v.date,
        vans.find((van) => van.id === v.vanId)?.name || v.sourceVan,
        v.clientName,
        v.address,
        v.pets.map((p) => p.name).join("; "),
        v.price === null ? "" : (v.price / 100).toFixed(2),
        v.method,
        v.received === true
          ? "Recibido"
          : v.received === false
            ? "Pendiente"
            : "Por verificar",
        v.confirmationNote,
        v.source,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
