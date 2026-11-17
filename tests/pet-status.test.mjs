import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, mutateState, validateClient, validateAppointment, isActivePet, petStatusLabel, today } from "../lib/operations.ts";
import { findClients, buildBooking } from "../lib/akira.ts";

function fixture() {
  const state = demoState();
  state.appointments[0].status = "Completado";
  state.clients[0].pets.push({ ...state.clients[0].pets[0], id: "blu", name: "Blu" });
  return state;
}
for (const status of ["archived", "deceased"]) {
  test(`${status} preserves the pet, past services and payments; only active pets can be booked`, () => {
    const state = fixture();
    const client = structuredClone(state.clients[0]);
    client.pets[0].status = status;
    const updated = mutateState(state, { type: "saveClient", client }, "Admin");
    assert.deepEqual(updated.appointments, state.appointments);
    assert.deepEqual(updated.payments, state.payments);
    assert.equal(updated.clients[0].pets[0].status, "archived");
    assert.equal(petStatusLabel(updated.clients[0].pets[0]), "Archivada");
    assert.equal(isActivePet(updated.clients[0].pets[1]), true);
    const options = findClients(updated, client.name).clients.find(c => c.id === client.id);
    assert.deepEqual(options.pets.map(p => p.name), ["Blu"]);
    assert.throws(() => validateAppointment(updated, { ...state.appointments[0], id: "new" }), /archivada/);
    assert.throws(() => buildBooking({ state: updated, members: [], history: [] }, { ...state.appointments[0], date: "2099-01-01", time: "10:00" }), /mascota/);
    client.pets[0].status = "active";
    assert.equal(isActivePet(mutateState(updated, { type: "saveClient", client }, "Admin").clients[0].pets[0]), true);
  });
}
test("a pet with a pending or ongoing appointment must be reviewed before inactivation", () => {
  for (const status of ["Confirmado", "En servicio"]) {
    const state = fixture();
    state.appointments[0].date = today();
    state.appointments[0].status = status;
    const client = structuredClone(state.clients[0]);
    client.pets[0].status = "deceased";
    assert.throws(() => mutateState(state, { type: "saveClient", client }, "Admin"), /Cancela primero/);
  }
});
test("removing an unsaved pet or the last pet without history is allowed; past references cannot be erased", () => {
  const state = fixture();
  const client = structuredClone(state.clients[0]);
  client.pets = [];
  assert.deepEqual(validateClient(client).pets, []);
  assert.throws(() => mutateState(state, { type: "saveClient", client }, "Admin"), /historial/);
  state.appointments = [];
  assert.deepEqual(mutateState(state, { type: "saveClient", client }, "Admin").clients[0].pets, []);
});
test("legacy pets remain active and invalid lifecycle values are rejected", () => {
  const client = fixture().clients[0];
  assert.equal(isActivePet(client.pets[0]), true);
  client.pets[0].status = "invalid";
  assert.throws(() => validateClient(client), /estado de la mascota/);
});
