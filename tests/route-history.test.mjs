import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/operations.ts";
import {
  boardVisits,
  summarizeVisits,
  reviseHistoryVisit,
  weekDays,
  matchHistoryClient,
  routeCSV,
  validDay,
  weeklyDashboard,
} from "../lib/route-history.ts";

function visit(overrides = {}) {
  return {
    id: "history-1",
    date: "2026-10-23",
    vanId: "v1",
    sourceVan: "VAN A",
    order: 1,
    clientId: null,
    clientName: "Familia",
    address: "Calle 10",
    pets: [
      { name: "A", breed: "" },
      { name: "B", breed: "" },
      { name: "C", breed: "" },
    ],
    price: 90000,
    method: "Transferencia",
    received: false,
    confirmedAt: null,
    confirmedOn: null,
    confirmationNote: "",
    source: "Exportación",
    importedAt: "2026-10-23T12:00:00Z",
    revision: 0,
    ...overrides,
  };
}
function blank() {
  return { ...demoState(), appointments: [], payments: [] };
}

test("weekly dashboard combines scheduled and route visits, filters vans and keeps partial income separate from prices", () => {
  const state = blank();
  const scheduled = {
    ...demoState().appointments[0],
    date: "2026-10-19",
    price: 65000,
    vanId: "v1",
  };
  state.appointments = [
    scheduled,
    { ...scheduled, id: "canceled", status: "Cancelado" },
  ];
  state.payments = [
    {
      id: "partial",
      appointmentId: scheduled.id,
      amount: 20000,
      method: "Efectivo",
      reference: "",
      date: "2026-10-24T12:00:00Z",
    },
  ];
  const routes = [
    visit({ id: "received", received: true, vanId: "v2" }),
    visit({ id: "missing", price: null, vanId: "v1" }),
    visit({ id: "free", price: 0, vanId: "v1" }),
    visit({ id: "next-week", date: "2026-10-26", received: true }),
    visit({
      id: "archived",
      deletedAt: "2026-10-24T12:00:00Z",
      received: true,
    }),
  ];
  const rows = boardVisits(state, routes);
  const week = weeklyDashboard(rows, state.vans, "2026-10-24");
  assert.equal(week.summary.visits, 4);
  assert.equal(week.summary.appointments, 1);
  assert.equal(week.summary.routeVisits, 3);
  assert.equal(week.summary.amount, 155000);
  assert.equal(week.summary.received, 110000);
  assert.equal(week.summary.toVerify, 45000);
  assert.equal(week.summary.missingPrice, 1);
  assert.equal(week.byDay.length, 7);
  assert.equal(
    week.byDay.reduce((n, d) => n + d.received, 0),
    week.summary.received,
  );
  assert.equal(
    week.byVan.reduce((n, v) => n + v.visits, 0),
    week.summary.visits,
  );
  const van = weeklyDashboard(rows, state.vans, "2026-10-24", "v1");
  assert.equal(van.summary.visits, 3);
  assert.equal(van.summary.received, 20000);
  assert.ok(van.rows.every((v) => v.vanId === "v1"));
  assert.equal(
    weeklyDashboard(rows, state.vans, "2026-11-02").summary.visits,
    0,
  );
});

test("capturing a missing price updates the same weekly visit without inventing a receipt", () => {
  const state = blank(),
    pending = visit({ price: null, received: null });
  const next = reviseHistoryVisit(
    pending,
    {
      price: 65050,
      method: pending.method,
      received: pending.received,
      clientId: pending.clientId,
      vanId: pending.vanId,
    },
    state,
  );
  const week = weeklyDashboard(
    boardVisits(state, [next]),
    state.vans,
    pending.date,
  );
  assert.equal(next.id, pending.id);
  assert.equal(next.received, false);
  assert.equal(week.summary.visits, 1);
  assert.equal(week.summary.amount, 65050);
  assert.equal(week.summary.missingPrice, 0);
  assert.equal(week.summary.received, 0);
  assert.equal(week.summary.toVerify, 65050);
  assert.equal(pending.price, null);
});
const changes = (v) => ({
  price: v.price,
  method: v.method,
  received: v.received,
  clientId: v.clientId,
  vanId: v.vanId,
});
test("a three-pet visit has one price, and missing prices remain unknown", () => {
  const rows = boardVisits(blank(), [
    visit(),
    visit({
      id: "missing",
      address: "Calle 20",
      price: null,
      method: "Pendiente",
      received: null,
    }),
  ]);
  const sum = summarizeVisits(rows);
  assert.equal(sum.pets, 6);
  assert.equal(sum.stops, 2);
  assert.equal(sum.amount, 90000);
  assert.equal(sum.missingPrice, 1);
  assert.equal(sum.received, 0);
  assert.equal(rows[1].price, null);
});
test("only confirmed receipts count as received, cash and card without evidence stay unknown", () => {
  const rows = boardVisits(blank(), [
    visit({ received: true }),
    visit({ id: "cash", method: "Efectivo", received: null }),
    visit({ id: "card", method: "Tarjeta", received: null }),
  ]);
  assert.equal(summarizeVisits(rows).received, 90000);
  assert.equal(summarizeVisits(rows).toVerify, 180000);
});
test("editing price or method resets receipt confirmation and its timestamp", () => {
  const current = visit({
    received: true,
    confirmedAt: "2026-10-22T20:00:00Z",
    confirmationNote: "Marcada en origen",
  });
  for (const edit of [{ price: 95000 }, { method: "Efectivo" }]) {
    const next = reviseHistoryVisit(
      current,
      { ...changes(current), ...edit },
      blank(),
    );
    assert.equal(next.received, false);
    assert.equal(next.confirmedAt, null);
    assert.equal(next.confirmationNote, "");
    assert.equal(next.revision, 1);
  }
  assert.equal(
    reviseHistoryVisit(
      current,
      { ...changes(current), clientId: blank().clients[0].id },
      blank(),
    ).confirmationNote,
    "Marcada en origen",
  );
});
test("confirming a pending receipt timestamps the actual confirmation, not the service date", () => {
  const current = visit();
  const next = reviseHistoryVisit(
    current,
    { ...changes(current), received: true },
    blank(),
    "2026-10-25T02:00:00Z",
  );
  assert.equal(next.confirmedAt, "2026-10-25T02:00:00Z");
  assert.equal(next.confirmedOn, "2026-10-24");
  assert.equal(next.date, "2026-10-23");
  assert.throws(
    () =>
      reviseHistoryVisit(
        visit({ price: null }),
        { ...changes(visit({ price: null })), received: true },
        blank(),
      ),
    /importe/,
  );
});
test("history edits cannot replace source, pets, dates or arbitrary clients", () => {
  const current = visit();
  for (const invalid of [
    { price: -1 },
    { price: 1.5 },
    { price: NaN },
    { received: "true" },
    { clientId: "missing" },
    { vanId: "missing" },
    { source: "other" },
    { date: "2026-10-24" },
  ])
    assert.throws(() =>
      reviseHistoryVisit(current, { ...changes(current), ...invalid }, blank()),
    );
});
test("shared addresses and ambiguous matching do not merge clients", () => {
  const client = {
    ...blank().clients[0],
    id: "c1",
    name: "Persona",
    address: "Calle 10",
    pets: [
      { id: "p1", name: "A", breed: "", species: "Por confirmar", notes: "" },
    ],
  };
  const original = visit({ clientName: "Persona" });
  assert.equal(matchHistoryClient(original, [client]), "c1");
  assert.equal(
    matchHistoryClient(original, [
      client,
      { ...client, id: "c2", name: "Otra persona" },
    ]),
    null,
  );
  assert.equal(
    matchHistoryClient(visit({ pets: [{ name: "Otra mascota", breed: "" }] }), [
      client,
    ]),
    null,
  );
  assert.equal(
    matchHistoryClient(visit({ clientName: "Persona", address: "Calle 12" }), [
      client,
    ]),
    null,
  );
});
test("a scheduled pair at the same address retains both service prices and one stop", () => {
  const state = blank();
  const a = {
    ...demoState().appointments[0],
    date: "2026-10-23",
    status: "Confirmado",
    price: 40000,
  };
  state.appointments = [
    a,
    { ...a, id: "second", petId: state.clients[0].pets[0].id, price: 50000 },
  ];
  state.payments = [
    {
      id: "p1",
      appointmentId: a.id,
      amount: 20000,
      method: "Transferencia",
      reference: "",
      date: "2026-10-23T12:00:00Z",
    },
  ];
  const sum = summarizeVisits(boardVisits(state, []));
  assert.equal(sum.stops, 1);
  assert.equal(sum.pets, 2);
  assert.equal(sum.amount, 90000);
  assert.equal(sum.received, 20000);
});
test("weeks run Monday to Sunday across year changes, and invalid days are rejected", () => {
  assert.deepEqual(weekDays("2027-01-03"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2026-10-23"), true);
});
test("CSV preserves missing prices and protects spreadsheet formula cells", () => {
  const data = routeCSV(
    boardVisits(blank(), [visit({ clientName: "=1+1", price: null })]),
    blank().vans,
  );
  assert.ok(data.includes('"\'=1+1"'));
  assert.ok(data.includes('"A; B; C","","Transferencia"'));
});
