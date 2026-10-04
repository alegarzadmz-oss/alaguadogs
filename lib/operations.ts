export type Client = {
  id: string;
  name: string;
  phone: string;
  address: string;
  zone: string;
  notes: string;
  pets: {
    id: string;
    name: string;
    species: string;
    breed: string;
    notes: string;
  }[];
  lat: number | null;
  lng: number | null;
};
export type Van = { id: string; name: string; groomer: string; notes: string };
export type Service = {
  id: string;
  name: string;
  duration: number;
  price: number;
  cost: number;
};
export type Appointment = {
  id: string;
  clientId: string;
  petId: string;
  vanId: string;
  groomer: string;
  groomerId?: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  travel: number;
  price: number;
  cost: number;
  extraCost: number;
  status: "Confirmado" | "En servicio" | "Completado" | "Cancelado";
  notes: string;
  startedAt?: string;
  finishedAt?: string;
  actualMinutes?: number;
};
export type Payment = {
  id: string;
  appointmentId: string;
  amount: number;
  method: string;
  reference: string;
  date: string;
};
export type Incident = {
  id: string;
  clientId: string;
  appointmentId: string;
  category: string;
  description: string;
  resolution: string;
  resolved: boolean;
  createdAt: string;
};
export type State = {
  demo: boolean;
  clients: Client[];
  vans: Van[];
  services: Service[];
  appointments: Appointment[];
  payments: Payment[];
  incidents: Incident[];
  base: { address: string; lat: number | null; lng: number | null };
  audit: { at: string; actor: string; action: string }[];
  operations: string[];
};
export type Command = { type: string; [key: string]: unknown };
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const minute = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const timeLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const paid = (s: State, id: string) =>
  s.payments
    .filter((p) => p.appointmentId === id)
    .reduce((n, p) => n + p.amount, 0);
export const balance = (s: State, a: Appointment) =>
  a.status === "Cancelado" ? 0 : Math.max(0, a.price - paid(s, a.id));
export const clientBalance = (s: State, id: string) =>
  s.appointments
    .filter((a) => a.clientId === id)
    .reduce((n, a) => n + balance(s, a), 0);
export function demoState(): State {
  const pets = [
    "Luna",
    "Toby",
    "Milo",
    "Nala",
    "Bruno",
    "Coco",
    "Kira",
    "Simba",
    "Max",
    "Mía",
    "Rocky",
    "Olivia",
  ];
  const people = [
    "Ana Torres",
    "Carlos Ruiz",
    "Mariana López",
    "Luis Pérez",
    "Sofía Ramírez",
    "Diego Flores",
    "Daniela Reyes",
    "Pablo Medina",
    "Valeria Castro",
    "Andrés Silva",
    "Fernanda Ríos",
    "Jorge Luna",
  ];
  const date = today();
  const services = [
    { id: "bath", name: "Baño", duration: 60, price: 45000, cost: 18000 },
    { id: "cut", name: "Corte", duration: 45, price: 35000, cost: 15000 },
    {
      id: "both",
      name: "Baño y corte",
      duration: 90,
      price: 65000,
      cost: 26000,
    },
  ];
  const clients = pets.map((name, i) => ({
    id: `c${i}`,
    name: people[i],
    phone: "",
    address: `Domicilio de ejemplo ${i + 1}`,
    zone: ["Norte", "Centro", "Poniente", "Sur"][Math.floor(i / 3)],
    notes: "",
    pets: [
      {
        id: `p${i}`,
        name,
        species: [2, 7, 9].includes(i) ? "Gato" : "Perro",
        breed: [2, 7, 9].includes(i)
          ? "Doméstico"
          : ["Poodle", "Mestizo", "Golden retriever"][i % 3],
        notes: i === 2 ? "Evitar secadora cerca de la cara. Ejemplo." : "",
      },
    ],
    lat: null,
    lng: null,
  }));
  const vans = [1, 2, 3, 4].map((n) => ({
    id: `v${n}`,
    name: `Camioneta 0${n}`,
    groomer: `Bañador ${n}`,
    notes: "",
  }));
  const appointments = clients.map((c, i) => {
    const svc = services[[2, 0, 1][i % 3]];
    return {
      id: `a${i}`,
      clientId: c.id,
      petId: c.pets[0].id,
      vanId: vans[Math.floor(i / 3)].id,
      groomer: vans[Math.floor(i / 3)].groomer,
      serviceId: svc.id,
      date,
      time: ["09:00", "11:00", "13:00"][i % 3],
      duration: svc.duration,
      travel: 20,
      price: svc.price,
      cost: svc.cost,
      extraCost: 0,
      status: (i % 3 === 0
        ? "Completado"
        : "Confirmado") as Appointment["status"],
      notes: "",
      ...(i % 3 === 0 ? { actualMinutes: 95 } : {}),
    };
  });
  return {
    demo: true,
    clients,
    vans,
    services,
    appointments,
    payments: [
      {
        id: "pay0",
        appointmentId: "a0",
        amount: 65000,
        method: "Efectivo",
        reference: "Ejemplo",
        date: new Date().toISOString(),
      },
      {
        id: "pay3",
        appointmentId: "a3",
        amount: 30000,
        method: "Transferencia",
        reference: "Anticipo de ejemplo",
        date: new Date().toISOString(),
      },
    ],
    incidents: [
      {
        id: "i0",
        clientId: "c2",
        appointmentId: "a2",
        category: "Manejo de mascota",
        description:
          "Milo se mostró sensible al ruido de la secadora. Registro de ejemplo.",
        resolution:
          "Usar secado suave y confirmar indicaciones con su familia.",
        resolved: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "i1",
        clientId: "c3",
        appointmentId: "a3",
        category: "Pago pendiente",
        description:
          "Quedó un saldo después del anticipo. Registro de ejemplo.",
        resolution: "",
        resolved: false,
        createdAt: new Date().toISOString(),
      },
    ],
    base: { address: "", lat: null, lng: null },
    audit: [],
    operations: [],
  };
}
function fail(s: string): never {
  throw Error(s);
}
const text = (v: unknown, label: string, max = 2000, required = true) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(`Revisa ${label}.`);
  return (v as string).trim();
};
const num = (v: unknown, label: string, min = 0, max = 100000000) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    fail(`Revisa ${label}.`);
  return v as number;
};
const integer = (v: unknown, label: string, min = 0, max = 100000000) => {
  const n = num(v, label, min, max);
  if (!Number.isInteger(n)) fail(`Revisa ${label}.`);
  return n;
};
const coord = (v: unknown, max: number) =>
  v === null ? null : num(v, "las coordenadas", -max, max);
export function validateClient(value: unknown): Client {
  const c = value as Client;
  const result = {
    id: text(c.id, "el identificador", 100),
    name: text(c.name, "el cliente", 120),
    phone: text(c.phone, "el teléfono", 40, false),
    address: text(c.address, "el domicilio", 400),
    zone: text(c.zone, "la zona", 100, false),
    notes: text(c.notes, "las notas", 2000, false),
    lat: coord(c.lat, 90),
    lng: coord(c.lng, 180),
    pets: c.pets?.map((p) => ({
      id: text(p.id, "la mascota", 100),
      name: text(p.name, "el nombre de la mascota", 80),
      species: ["Perro", "Gato"].includes(p.species)
        ? p.species
        : fail("Selecciona perro o gato."),
      breed: text(p.breed, "la raza", 100, false),
      notes: text(p.notes, "las indicaciones", 2000, false),
    })),
  };
  if (
    !result.pets?.length ||
    result.pets.length > 20 ||
    new Set(result.pets.map((p) => p.id)).size !== result.pets.length
  )
    fail("Revisa las mascotas.");
  if ((result.lat === null) !== (result.lng === null))
    fail("Indica latitud y longitud juntas.");
  return result;
}
export function validateAppointment(
  s: State,
  value: unknown,
  exclude = "",
): Appointment {
  const a = value as Appointment;
  const client = s.clients.find((c) => c.id === a.clientId);
  if (!client || !client.pets.some((p) => p.id === a.petId))
    fail("Selecciona cliente y mascota.");
  if (
    !s.vans.some((v) => v.id === a.vanId) ||
    !s.services.some((v) => v.id === a.serviceId)
  )
    fail("Selecciona camioneta y servicio.");
  const date = text(a.date, "la fecha", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    fail("Fecha inválida.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) fail("Hora inválida.");
  const r: Appointment = {
    id: text(a.id, "la cita", 100),
    clientId: a.clientId,
    petId: a.petId,
    vanId: a.vanId,
    serviceId: a.serviceId,
    time: a.time,
    status: "Confirmado",
    date,
    duration: integer(a.duration, "la duración", 5, 720),
    travel: integer(a.travel, "el traslado", 0, 300),
    price: integer(a.price, "el precio"),
    cost: integer(a.cost, "el costo"),
    extraCost: integer(a.extraCost, "el costo adicional"),
    groomer: text(a.groomer, "el bañador", 120),
    notes: text(a.notes, "las notas", 2000, false),
  };
  if (a.groomerId)
    r.groomerId = text(a.groomerId, "la cuenta del bañador", 100);
  const end = minute(r.time) + r.duration;
  if (end > 1440) fail("El servicio debe terminar dentro del día.");
  for (const b of s.appointments) {
    if (
      b.id === exclude ||
      b.date !== r.date ||
      b.status === "Cancelado" ||
      (b.vanId !== r.vanId &&
        (b.groomerId && r.groomerId
          ? b.groomerId !== r.groomerId
          : b.groomer.toLocaleLowerCase() !== r.groomer.toLocaleLowerCase()))
    )
      continue;
    if (
      minute(r.time) - r.travel < minute(b.time) + b.duration &&
      end > minute(b.time) - b.travel
    )
      fail(
        "El horario se cruza con otra cita o su traslado para esa camioneta o bañador.",
      );
  }
  return r;
}
export function mutateState(
  original: State,
  command: Command,
  actor: string,
): State {
  const s = structuredClone(original);
  const c = command as any;
  const now = new Date().toISOString();
  let action = "";
  switch (c.type) {
    case "saveClient": {
      const cl = validateClient(c.client);
      const at = s.clients.findIndex((v) => v.id === cl.id);
      if (at >= 0) {
        if (
          s.appointments.some(
            (a) =>
              a.clientId === cl.id && !cl.pets.some((p) => p.id === a.petId),
          )
        )
          fail("No se puede quitar una mascota con historial.");
        s.clients[at] = cl;
      } else s.clients.push(cl);
      action = `Cliente guardado: ${cl.name}`;
      break;
    }
    case "saveAppointment": {
      const prior = s.appointments.find((a) => a.id === c.appointment?.id);
      if (prior && prior.status !== "Confirmado")
        fail("Solo puedes editar citas confirmadas.");
      const a = validateAppointment(
        s,
        { ...c.appointment, status: "Confirmado" },
        prior?.id,
      );
      if (a.price < paid(s, a.id))
        fail("El precio no puede ser menor a los pagos registrados.");
      if (prior) s.appointments[s.appointments.indexOf(prior)] = a;
      else s.appointments.push(a);
      action = `Cita guardada: ${a.date} ${a.time}`;
      break;
    }
    case "status": {
      const a = s.appointments.find((a) => a.id === c.id);
      if (!a) fail("Cita no encontrada.");
      if (c.status === "En servicio" && a.status === "Confirmado") {
        if (
          s.appointments.some(
            (b) =>
              b.id !== a.id &&
              b.status === "En servicio" &&
              (b.vanId === a.vanId ||
                (b.groomerId && a.groomerId
                  ? b.groomerId === a.groomerId
                  : b.groomer.toLowerCase() === a.groomer.toLowerCase())),
          )
        )
          fail("La camioneta o bañador ya tiene un servicio en curso.");
        a.status = "En servicio";
        a.startedAt = now;
      } else if (c.status === "Completado" && a.status === "En servicio") {
        a.status = "Completado";
        a.finishedAt = now;
        a.actualMinutes = Math.max(
          1,
          Math.round((Date.now() - Date.parse(a.startedAt!)) / 60000),
        );
      } else if (c.status === "Cancelado" && a.status === "Confirmado") {
        if (paid(s, a.id) > 0)
          fail("La cita tiene pagos: requiere conciliación antes de cancelar.");
        a.status = "Cancelado";
      } else fail("Ese cambio de estado no está disponible.");
      action = `Servicio: ${a.status}`;
      break;
    }
    case "outcome": {
      const a = s.appointments.find((a) => a.id === c.id);
      if (!a || a.status === "Cancelado") fail("Cita no disponible.");
      a.cost = integer(c.cost, "el costo");
      a.extraCost = integer(c.extraCost, "el costo adicional");
      if (a.status === "Completado")
        a.actualMinutes = integer(c.actualMinutes, "el tiempo real", 1, 1440);
      action = "Tiempo y costos revisados";
      break;
    }
    case "payment": {
      const a = s.appointments.find((a) => a.id === c.appointmentId);
      if (!a || a.status === "Cancelado")
        fail("Cita no disponible para cobro.");
      const amount = integer(c.amount, "el importe", 1);
      if (amount > balance(s, a)) fail("El importe supera el saldo pendiente.");
      if (s.payments.some((p) => p.id === c.id))
        fail("Este pago ya está registrado.");
      if (!["Efectivo", "Tarjeta", "Transferencia"].includes(c.method))
        fail("Forma de pago inválida.");
      s.payments.push({
        id: text(c.id, "el pago", 100),
        appointmentId: a.id,
        amount,
        method: c.method,
        reference: text(c.reference, "la referencia", 200, false),
        date: now,
      });
      action = `Pago registrado: ${money(amount)} · ${c.method}`;
      break;
    }
    case "incident": {
      if (!s.clients.some((v) => v.id === c.clientId))
        fail("Cliente no encontrado.");
      if (s.incidents.some((i) => i.id === c.id))
        fail("Esta incidencia ya está registrada.");
      if (
        c.appointmentId &&
        !s.appointments.some(
          (a) => a.id === c.appointmentId && a.clientId === c.clientId,
        )
      )
        fail("La cita no corresponde al cliente.");
      const categories = [
        "Pago pendiente",
        "Cancelación",
        "Demora",
        "Atención al cliente",
        "Manejo de mascota",
        "Camioneta / equipo",
        "Otro",
      ];
      if (!categories.includes(c.category)) fail("Categoría inválida.");
      s.incidents.unshift({
        id: text(c.id, "la incidencia", 100),
        clientId: c.clientId,
        appointmentId: c.appointmentId || "",
        category: c.category,
        description: text(c.description, "lo ocurrido"),
        resolution: "",
        resolved: false,
        createdAt: now,
      });
      action = `Incidencia registrada: ${c.category}`;
      break;
    }
    case "resolve": {
      const inc = s.incidents.find((i) => i.id === c.id);
      if (!inc) fail("Incidencia no encontrada.");
      inc.resolution = text(c.resolution, "la resolución");
      inc.resolved = true;
      action = "Incidencia resuelta";
      break;
    }
    case "saveVan": {
      const v = s.vans.find((v) => v.id === c.van?.id);
      if (!v) fail("Camioneta no encontrada.");
      v.name = text(c.van.name, "la camioneta", 100);
      v.groomer = text(c.van.groomer, "el bañador", 120);
      v.notes = text(c.van.notes, "las notas", 2000, false);
      action = `Equipo actualizado: ${v.name}`;
      break;
    }
    case "saveService": {
      const v = s.services.find((v) => v.id === c.service?.id);
      if (!v) fail("Servicio no encontrado.");
      v.duration = integer(c.service.duration, "la duración", 5, 720);
      v.price = integer(c.service.price, "el precio");
      v.cost = integer(c.service.cost, "el costo");
      action = `Tarifa actualizada: ${v.name}`;
      break;
    }
    case "saveBase": {
      s.base = {
        address: text(c.base.address, "la base", 400),
        lat: coord(c.base.lat, 90),
        lng: coord(c.base.lng, 180),
      };
      if (s.base.lat === null || s.base.lng === null)
        fail("Indica coordenadas de la base.");
      action = "Base de salida y regreso actualizada";
      break;
    }
    case "applyRoute": {
      const route = routeProposal(
        s,
        text(c.vanId, "la camioneta", 100),
        text(c.date, "la fecha", 10),
      );
      if (route.error) fail(route.error);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start))
        fail("Revisa la hora de salida.");
      let t = minute(c.start);
      const ids = new Set(route.appointments.map((a) => a.id));
      const pending = route.appointments.map((a, i) => {
        const travel = route.legs[i];
        t += travel;
        const next = { ...a, time: timeLabel(t), travel };
        t += a.duration;
        return next;
      });
      s.appointments = s.appointments.filter((a) => !ids.has(a.id));
      for (const a of pending) {
        s.appointments.push(validateAppointment(s, a));
      }
      action = "Orden sugerido aplicado; horarios actualizados";
      break;
    }
    case "clearDemo": {
      if (!s.demo) fail("Los datos de ejemplo ya se retiraron.");
      if (c.confirm !== "EMPEZAR") fail("Escribe EMPEZAR para confirmar.");
      s.clients = [];
      s.appointments = [];
      s.payments = [];
      s.incidents = [];
      s.demo = false;
      action = "Inicio de operación sin datos de ejemplo";
      break;
    }
    default:
      fail("Acción no reconocida.");
  }
  s.audit.unshift({ at: now, actor, action });
  s.audit = s.audit.slice(0, 500);
  return s;
}
export function km(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180,
    dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * r) *
              Math.cos(b.lat * r) *
              Math.sin(dlng / 2) ** 2),
      ),
    )
  );
}
export function routeProposal(
  s: State,
  vanId: string,
  date: string,
): {
  appointments: Appointment[];
  legs: number[];
  distance: number;
  originalDistance: number;
  error?: string;
} {
  const all = s.appointments
    .filter(
      (a) => a.vanId === vanId && a.date === date && a.status !== "Cancelado",
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const empty = {
    appointments: [],
    legs: [],
    distance: 0,
    originalDistance: 0,
  };
  if (all.some((a) => a.status !== "Confirmado"))
    return {
      ...empty,
      error:
        "Reordena antes de iniciar los servicios del día. Los servicios ya iniciados o terminados conservan su agenda.",
    };
  if (!all.length)
    return {
      ...empty,
      error: "No hay servicios confirmados para esta camioneta.",
    };
  if (s.base.lat === null || s.base.lng === null)
    return {
      ...empty,
      error: "Configura la base de salida y regreso con sus coordenadas.",
    };
  const base = s.base as { lat: number; lng: number };
  const points = all.map((a) => s.clients.find((c) => c.id === a.clientId)!);
  if (points.some((c) => c.lat === null || c.lng === null))
    return {
      ...empty,
      error:
        "Agrega las coordenadas de todos los domicilios en Clientes y mascotas.",
    };
  const point = (i: number) => points[i] as { lat: number; lng: number };
  const cost = (order: number[]) =>
    order.reduce(
      (d, i, k) => d + km(k ? point(order[k - 1]) : base, point(i)),
      0,
    ) + km(point(order[order.length - 1]), base);
  let order = all.map((_, i) => i),
    best = cost(order);
  const originalDistance = best;
  if (all.length <= 8) {
    const search = (path: number[], left: number[]) => {
      if (!left.length) {
        const d = cost(path);
        if (d < best) {
          best = d;
          order = path;
        }
        return;
      }
      for (const i of left)
        search(
          [...path, i],
          left.filter((j) => j !== i),
        );
    };
    search([], order);
  } else {
    const remaining = [...order];
    const nearest: number[] = [];
    let at = base;
    while (remaining.length) {
      remaining.sort((i, j) => km(at, point(i)) - km(at, point(j)));
      const next = remaining.shift()!;
      nearest.push(next);
      at = point(next);
    }
    if (cost(nearest) < best) {
      order = nearest;
      best = cost(order);
    }
  }
  return {
    appointments: order.map((i) => all[i]),
    legs: order.map((i, k) =>
      Math.max(
        5,
        Math.ceil(
          ((km(k ? point(order[k - 1]) : base, point(i)) * 1.3) / 25) * 60,
        ),
      ),
    ),
    distance: Math.round(best * 10) / 10,
    originalDistance: Math.round(originalDistance * 10) / 10,
  };
}
