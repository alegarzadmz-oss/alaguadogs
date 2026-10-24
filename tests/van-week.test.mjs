import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/operations.ts";
import { boardVisits } from "../lib/route-history.ts";
import { vanWeekDetail, needsPaymentReview } from "../lib/van-week.ts";

function fixture() {
  const state = demoState();
  state.clients = state.clients
    .slice(0, 2)
    .map((c) => ({ ...c, name: "Mismo nombre" }));
  const appointment = {
    ...state.appointments[0],
    date: "2026-10-21",
    vanId: "v1",
    price: 65000,
  };
  state.appointments = [appointment];
  state.payments = [
    {
      id: "p1",
      appointmentId: appointment.id,
      amount: 20000,
      method: "Efectivo",
      date: "2026-10-18T12:00:00Z",
      reference: "",
    },
    {
      id: "p2",
      appointmentId: appointment.id,
      amount: 10000,
      method: "Tarjeta",
      date: "2026-10-25T12:00:00Z",
      reference: "",
    },
    {
      id: "other",
      appointmentId: "other-appointment",
      amount: 99000,
      method: "Efectivo",
      date: "2026-10-21T12:00:00Z",
      reference: "",
    },
  ];
  const route = (id, changes = {}) => ({
    id,
    date: "2026-10-20",
    vanId: "v1",
    sourceVan: "VAN A",
    order: 1,
    clientId: state.clients[0].id,
    clientName: "Mismo nombre",
    address: "Mismo domicilio",
    pets: [{ name: "Mascota", breed: "" }],
    price: 50000,
    method: "Transferencia",
    received: true,
    confirmedAt: null,
    confirmedOn: null,
    confirmationNote: "",
    source: "test",
    importedAt: "",
    revision: 0,
    ...changes,
  });
  const routes = [
    route("received"),
    route("missing", { price: null, received: null }),
    route("other-client", {
      clientId: state.clients[1].id,
      price: 30000,
      received: null,
      method: "Efectivo",
    }),
    route("unlinked-1", { clientId: null, price: 20000, received: false }),
    route("unlinked-2", { clientId: null, price: null, received: null }),
    route("other-van", { vanId: "v2" }),
    route("outside-week", { date: "2026-10-26" }),
    route("archived", { deletedAt: "2026-10-24T12:00:00Z" }),
  ];
  return { state, rows: boardVisits(state, routes) };
}

test("van weekly profile keeps each customer identity and unresolved visit separate and excludes other vans and weeks", () => {
  const { state, rows } = fixture();
  const detail = vanWeekDetail(state, rows, "2026-10-24", "v1");
  assert.equal(detail.rows.length, 6);
  assert.equal(detail.clients.length, 2);
  assert.equal(detail.unlinked.length, 2);
  assert.equal(
    detail.clients.find((group) => group.client.id === state.clients[0].id).rows
      .length,
    3,
  );
  assert.ok(
    detail.rows.every(
      (row) => row.vanId === "v1" && detail.days.includes(row.date),
    ),
  );
  assert.equal(
    detail.byDay.reduce((n, d) => n + d.visits, 0),
    6,
  );
  assert.equal(vanWeekDetail(state, rows, "2026-11-02", "v1").rows.length, 0);
});

test("van weekly income reconciles mixed and partial payments without counting unknown receipts or missing prices as paid", () => {
  const { state, rows } = fixture();
  const detail = vanWeekDetail(state, rows, "2026-10-24", "v1");
  assert.equal(detail.summary.amount, 165000);
  assert.equal(detail.summary.received, 80000);
  assert.equal(detail.summary.toVerify, 85000);
  assert.equal(detail.summary.missingPrice, 2);
  assert.equal(
    detail.paymentsByAppointment.get(state.appointments[0].id).length,
    2,
  );
  assert.equal(detail.pending.length, 5);
  assert.deepEqual(
    Object.fromEntries(
      detail.incomeByMethod.map((item) => [item.method, item.amount]),
    ),
    { Efectivo: 20000, Tarjeta: 10000, Transferencia: 50000 },
  );
  assert.equal(
    detail.incomeByMethod.reduce((n, item) => n + item.amount, 0),
    detail.summary.received,
  );
  assert.ok(
    detail.pending.some(
      (row) => row.kind === "appointment" && row.paidAmount === 30000,
    ),
  );
  const missing = detail.rows.find((row) => row.id === "missing");
  assert.equal(missing.price, null);
  assert.equal(needsPaymentReview({ ...missing, received: true }), true);
});
