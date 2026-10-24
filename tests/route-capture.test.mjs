import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/operations.ts";
import {
  parseRouteText,
  validateCapture,
  duplicateVisits,
  newCapturedVisit,
  reviseVisitDetails,
  toCaptureInput,
} from "../lib/route-capture.ts";
import {
  boardVisits,
  summarizeVisits,
  routeCSV,
} from "../lib/route-history.ts";
import { authorizeCommand, visibleState, AccessError } from "../lib/team.ts";
import {
  authorizeReceiptEdit,
  requireRouteReader,
  receiptProjection,
} from "../lib/route-permissions.ts";
const state = () => ({ ...demoState(), appointments: [], payments: [] });
const text =
  "Viernes 23 de octubre — VAN C\nCliente Ejemplo\nCalle Ejemplo 123, Colonia Centro\nLuna — bichón — baño\nMax — criollo — corte\n4 cortes de uñas adicionales\nObservación: avisar cuando vayan en camino";
const member = {
  id: "reception",
  name: "Recepción de prueba",
  email: "recepcion@example.test",
  role: "reception",
  status: "active",
  userId: "clerk:reception",
  vanId: "",
  version: 0,
};
function visit() {
  const s = state();
  const [input] = parseRouteText(text, "2026-10-24", "v1", s);
  return newCapturedVisit(
    toCaptureInput(input),
    "new-visit",
    1,
    s,
    "2026-10-24T12:00:00Z",
  );
}
test("guide: paste a full route with header, pets, services and observations without inventing price or payment", () => {
  const rows = parseRouteText(text, "2026-10-24", "v1", state());
  assert.equal(rows.length, 1);
  const v = rows[0];
  assert.equal(v.date, "2026-10-23");
  assert.equal(v.vanId, "v3");
  assert.equal(v.clientName, "Cliente Ejemplo");
  assert.equal(v.pets.length, 2);
  assert.equal(v.extras[0].quantity, 4);
  assert.match(v.notes, /avisar/);
  assert.equal(v.price, null);
  assert.equal(v.method, "Pendiente");
  assert.equal(v.clientId, null);
});
test("guide: two baths and four nail trims count two full services and four extras", () => {
  const s = state();
  const v = visit();
  const totals = summarizeVisits(boardVisits(s, [v]));
  assert.equal(totals.pets, 2);
  assert.equal(totals.additional, 4);
  assert.equal(totals.stops, 1);
  assert.equal(totals.missingPrice, 1);
  assert.equal(totals.received, 0);
  const [group] = parseRouteText(
    "Cliente: Familia\nDirección: Calle 123\n2 baños y 4 cortes de uñas adicionales",
    "2026-10-24",
    "v1",
  );
  assert.equal(
    summarizeVisits(
      boardVisits(s, [
        newCapturedVisit(toCaptureInput(group), "group", 1, s, "now"),
      ]),
    ).pets,
    2,
  );
  assert.equal(group.extras[0].quantity, 4);
});
test("guide: missing pets remain missing, and unparsed text is retained for review", () => {
  const [v] = parseRouteText(
    "Cliente: Ingrid\nObservación: datos por confirmar",
    "2026-10-24",
    "v4",
  );
  assert.equal(v.pets.length, 0);
  assert.equal(v.address, "");
  assert.equal(v.price, null);
  assert.ok(v.warnings.length > 0);
  assert.match(v.notes, /por confirmar/);
  assert.doesNotThrow(() => validateCapture(toCaptureInput(v), state()));
});
test("multiple clients and vans remain separate in one paste", () => {
  const rows = parseRouteText(
    text +
      "\n\nVAN D\nOtra Clienta\nAvenida 456\nToby — poodle — baño\nPrecio: $450.00\nPago: Transferencia",
    "2026-10-24",
    "v1",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].vanId, "v4");
  assert.equal(rows[1].price, 45000);
  assert.equal(rows[1].method, "Transferencia");
});
test("combined pet services keep baths and nail trims in separate counts", () => {
  const [row] = parseRouteText(
    "Cliente: Ana\nDirección: Calle 123\nLuna — bichón — baño y corte de uñas\n\nObservación: llamar al llegar",
    "2026-10-24",
    "v1",
  );
  const counts = summarizeVisits(
    boardVisits(state(), [
      newCapturedVisit(toCaptureInput(row), "combined", 1, state(), "now"),
    ]),
  );
  assert.equal(counts.pets, 1);
  assert.equal(counts.additional, 1);
  assert.match(row.notes, /llamar al llegar/);
  assert.throws(() =>
    validateCapture(
      {
        ...toCaptureInput(row),
        extras: [{ name: "Baño", kind: "full", quantity: 1 }],
      },
      state(),
    ),
  );
});
test("scheduled nail trims do not count as full grooming, and unknown addresses stay separate", () => {
  const s = demoState();
  s.services.push({
    id: "nails",
    name: "Corte de uñas",
    duration: 10,
    price: 10000,
    cost: 0,
  });
  s.appointments = [{ ...s.appointments[0], serviceId: "nails" }];
  const counts = summarizeVisits(boardVisits(s, []));
  assert.equal(counts.pets, 0);
  assert.equal(counts.additional, 1);
  s.appointments = [];
  const visits = ["a", "b"].map((id) => ({
    ...visit(),
    id,
    address: "Dirección por confirmar",
  }));
  assert.equal(summarizeVisits(boardVisits(s, visits)).stops, 2);
});
test("TSV/CSV capture preserves quoted addresses and missing amounts", () => {
  const rows = parseRouteText(
    'Fecha,Unidad,Cliente,Domicilio,Mascotas,Precio MXN,Forma de pago\n2026-10-24,VAN A,Ana,"Calle 12, Colonia Centro",Luna,,Pendiente',
    "2026-10-24",
    "v2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, "Calle 12, Colonia Centro");
  assert.equal(rows[0].price, null);
  assert.equal(rows[0].vanId, "v1");
  const [pending] = parseRouteText(
    "Cliente,Domicilio,Precio\nAna,Calle 12,por confirmar",
    "2026-10-24",
    "v1",
  );
  assert.equal(pending.price, null);
  assert.match(pending.notes, /por confirmar/);
});
test("duplicate review includes legacy rows and van changes, but allows another service date", () => {
  const v = visit();
  const input = toCaptureInput(v);
  assert.equal(duplicateVisits(input, [v]).length, 1);
  assert.equal(duplicateVisits(input, [toCaptureInput(v)]).length, 1);
  assert.equal(duplicateVisits({ ...input, vanId: "v4" }, [v]).length, 1);
  assert.equal(
    duplicateVisits({ ...input, date: "2026-10-24" }, [v]).length,
    0,
  );
  assert.equal(
    duplicateVisits({ ...input, clientName: "Otra persona" }, [v]).length,
    0,
  );
  const legacy = {
    ...v,
    pets: v.pets.map((p) => ({ name: p.name, breed: p.breed })),
  };
  assert.equal(duplicateVisits(input, [legacy]).length, 1);
  assert.equal(duplicateVisits(input, [{ ...v, deletedAt: "now" }]).length, 0);
});
test("a shared address does not automatically link two clients or merge profiles", () => {
  const s = state();
  s.clients[0].address = "Casa 123";
  s.clients[1].address = "Casa 123";
  s.clients[1].pets[0].name = s.clients[0].pets[0].name;
  const rows = parseRouteText(
    "Cliente: Alguien\nDirección: Casa 123\nLuna — poodle — baño",
    "2026-10-24",
    "v1",
    s,
  );
  assert.equal(rows[0].clientId, null);
  assert.equal(s.clients.length, 12);
});
test("moving or editing a visit updates all projections without mutating source or client profiles", () => {
  const s = state(),
    v = visit(),
    before = structuredClone(v),
    clients = structuredClone(s.clients);
  const next = reviseVisitDetails(
    v,
    {
      ...toCaptureInput(v),
      vanId: "v4",
      price: 65000,
      method: "Transferencia",
      address: "Domicilio corregido 777",
    },
    s,
  );
  const rows = boardVisits(s, [next]);
  assert.equal(rows[0].vanId, "v4");
  assert.equal(rows[0].method, "Transferencia");
  assert.equal(summarizeVisits(rows).amount, 65000);
  assert.equal(next.received, false);
  assert.deepEqual(v, before);
  assert.deepEqual(s.clients, clients);
});
test("changing price or payment method resets confirmation on the same visit", () => {
  const s = state(),
    v = {
      ...visit(),
      price: 65000,
      method: "Transferencia",
      received: true,
      confirmedAt: "2026-10-24T12:00:00Z",
      confirmedOn: "2026-10-24",
    };
  const next = reviseVisitDetails(v, { ...toCaptureInput(v), price: 70000 }, s);
  assert.equal(next.received, false);
  assert.equal(next.confirmedAt, null);
  assert.equal(next.id, v.id);
});
test("archiving removes a visit from every total but retains receipts and supports restoring", () => {
  const s = state(),
    v = { ...visit(), price: 65000, method: "Transferencia", received: true };
  const removed = { ...v, deletedAt: "2026-10-24T12:00:00Z" };
  assert.equal(boardVisits(s, [removed]).length, 0);
  assert.equal(summarizeVisits(boardVisits(s, [removed])).received, 0);
  assert.equal(removed.received, true);
  assert.equal(
    summarizeVisits(boardVisits(s, [{ ...removed, deletedAt: null }])).received,
    65000,
  );
});
test("Reception sees transfer-related agenda data only, no private contacts, notes, costs, or other customers", () => {
  const s = demoState();
  s.payments = [
    {
      id: "p",
      appointmentId: "a1",
      amount: 45000,
      method: "Transferencia",
      reference: "Banco",
      date: "2026-10-24T12:00:00Z",
    },
  ];
  s.clients[1].phone = "privado";
  s.clients[1].notes = "privado";
  const view = visibleState(s, member);
  assert.equal(view.clients.length, 1);
  assert.equal(view.clients[0].id, "c1");
  assert.equal(view.clients[0].phone, "");
  assert.equal(view.clients[0].notes, "");
  assert.equal(view.appointments[0].cost, 0);
  assert.equal(view.services.length, 0);
  assert.equal(view.incidents.length, 0);
  assert.deepEqual(view.audit, []);
  assert.deepEqual(view.operations, []);
  for (const type of [
    "saveClient",
    "saveAppointment",
    "applyRoute",
    "payment",
    "status",
    "clearDemo",
  ])
    assert.throws(() => authorizeCommand(s, { type }, member), AccessError);
});
test("Reception cannot edit prices, vans, clients, raw route data, cash receipts, archived transfers, or routes through direct requests", () => {
  const v = { ...visit(), method: "Transferencia", price: 45000 };
  assert.doesNotThrow(() =>
    authorizeReceiptEdit(member, v, { received: true }),
  );
  assert.doesNotThrow(() =>
    authorizeReceiptEdit(member, v, { received: false }),
  );
  for (const changes of [
    { received: true, price: 1 },
    { received: true, vanId: "v1" },
    { received: null },
    { received: true, clientId: "c1" },
    { notes: "editar" },
    [],
  ])
    assert.throws(() => authorizeReceiptEdit(member, v, changes), AccessError);
  assert.throws(
    () =>
      authorizeReceiptEdit(
        member,
        { ...v, method: "Efectivo" },
        { received: true },
      ),
    AccessError,
  );
  assert.throws(
    () =>
      authorizeReceiptEdit(
        member,
        { ...v, deletedAt: "now" },
        { received: false },
      ),
    AccessError,
  );
  assert.throws(
    () => requireRouteReader({ ...member, role: "groomer" }),
    AccessError,
  );
  assert.throws(
    () => requireRouteReader({ ...member, status: "inactive" }),
    AccessError,
  );
  const publicVisit = receiptProjection({
    ...v,
    notes: "Nota privada",
    source: "Origen privado",
    receiptUpdatedBy: "Monica",
  });
  assert.equal(publicVisit.notes, undefined);
  assert.equal(publicVisit.source, "Registro de transferencias");
  assert.equal(publicVisit.receiptUpdatedBy, "Monica");
});
test("CSV includes services, extras, notes and receipt evidence without losing pending prices", () => {
  const s = state(),
    v = visit();
  const csv = routeCSV(boardVisits(s, [v]), s.vans);
  assert.match(csv, /Servicios adicionales/);
  assert.match(csv, /4 × cortes de uñas/i);
  assert.match(csv, /avisar cuando/);
  assert.match(csv, /Cliente Ejemplo/);
});
