import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, mutateState, validateClient, validateAppointment, isActiveClient, clientBalance, today } from "../lib/operations.ts";
import { findClients, buildBooking } from "../lib/akira.ts";
import { authorizeCommand } from "../lib/team.ts";

function fixture() {
  const state = demoState();
  const client = state.clients[0];
  const visit = state.appointments.find(a => a.clientId === client.id);
  visit.status = "Completado";
  visit.price = 45000;
  state.payments = state.payments.filter(p => p.appointmentId !== visit.id);
  state.payments.push({ id: "partial", appointmentId: visit.id, amount: 10000, method: "Efectivo", reference: "", date: today() });
  return { state, client, visit };
}
test("archiving keeps pets, visits, payments, incidents and outstanding balances; reactivation uses the same identity", () => {
  const { state, client } = fixture();
  const before = structuredClone(state);
  assert.equal(isActiveClient(client), true);
  const archived = mutateState(state, { type: "saveClient", client: { ...client, status: "archived" } }, "Admin");
  assert.equal(isActiveClient(archived.clients[0]), false);
  assert.deepEqual(archived.clients[0].pets, client.pets);
  for (const key of ["appointments", "payments", "incidents"]) assert.deepEqual(archived[key], before[key]);
  assert.equal(clientBalance(archived, client.id), clientBalance(before, client.id));
  assert.ok(clientBalance(archived, client.id) > 0);
  const restored = mutateState(archived, { type: "saveClient", client: { ...archived.clients[0], status: "active" } }, "Admin");
  assert.equal(restored.clients.length, state.clients.length);
  assert.equal(restored.clients[0].id, client.id);
  assert.equal(isActiveClient(restored.clients[0]), true);
  assert.deepEqual(state, before);
});
test("archived customers cannot be scheduled from either the portal or Akira", () => {
  const { state, client, visit } = fixture();
  client.status = "archived";
  assert.equal(findClients(state, client.name).clients.some(c => c.id === client.id), false);
  assert.throws(() => validateAppointment(state, { ...visit, id: "new" }), /cliente está archivado/);
  assert.throws(() => buildBooking({ state, history: [], members: [] }, { ...visit, date: "2099-01-01", time: "10:00" }), /ficha/);
});
test("pending or ongoing visits must be reviewed before archiving a customer", () => {
  for (const status of ["Confirmado", "En servicio"]) {
    const { state, client, visit } = fixture();
    visit.date = today();
    visit.status = status;
    assert.throws(() => mutateState(state, { type: "saveClient", client: { ...client, status: "archived" } }, "Admin"), /citas pendientes del cliente/);
  }
});
test("customer archive status is validated and only administration can change the profile", () => {
  const { state, client } = fixture();
  assert.throws(() => validateClient({ ...client, status: "wrong" }), /estado del cliente/);
  const command = { type: "saveClient", client: { ...client, status: "archived" } };
  for (const role of ["groomer", "reception"]) assert.throws(() => authorizeCommand(state, command, { role, status: "active" }), /administración|Recepción/i);
  assert.doesNotThrow(() => authorizeCommand(state, command, { role: "admin", status: "active" }));
});

test("payments can still settle the balance of an archived customer", () => {
  const { state, client, visit } = fixture();
  const archived = mutateState(state, { type: "saveClient", client: { ...client, status: "archived" } }, "Admin");
  const paid = mutateState(archived, { type: "payment", id: "settled", appointmentId: visit.id, amount: clientBalance(archived, client.id), method: "Transferencia", reference: "" }, "Admin");
  assert.equal(clientBalance(paid, client.id), 0);
  assert.equal(isActiveClient(paid.clients[0]), false);
});
