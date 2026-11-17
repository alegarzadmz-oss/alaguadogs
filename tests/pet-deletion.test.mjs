import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, mutateState, appointmentPet, clientBalance, today } from "../lib/operations.ts";
import { appointmentVisits } from "../lib/route-history.ts";
import { serviceReceipt } from "../lib/service-closeout.ts";
import { findClients } from "../lib/akira.ts";
import { visibleState, authorizeCommand } from "../lib/team.ts";

function fixture() {
  const state = demoState();
  const client = state.clients[0];
  client.pets[0].name = "Otto";
  client.pets.push({ id: "blu", name: "Blu", species: "Perro", breed: "Chihuahua", notes: "" });
  state.appointments[0].status = "Completado";
  return state;
}
function remove(state) {
  return mutateState(state, { type: "saveClient", client: { ...state.clients[0], pets: state.clients[0].pets.filter(p => p.id === "blu") } }, "Admin");
}
test("deleting a pet removes it from the profile and booking search while history, payments and balance remain", () => {
  const state = fixture();
  const before = structuredClone(state);
  const result = remove(state);
  assert.deepEqual(result.clients[0].pets.map(p => p.name), ["Blu"]);
  assert.equal(findClients(result, "Otto").total, 0);
  assert.deepEqual(result.payments, before.payments);
  assert.deepEqual(result.incidents, before.incidents);
  assert.equal(clientBalance(result, result.clients[0].id), clientBalance(before, before.clients[0].id));
  const { petSnapshot, ...visit } = result.appointments[0];
  assert.deepEqual(visit, before.appointments[0]);
  assert.equal(petSnapshot.name, "Otto");
  assert.equal(appointmentPet(result, result.appointments[0]).name, "Otto");
  assert.equal(appointmentVisits(result).find(v => v.id === result.appointments[0].id).pets[0].name, "Otto");
  const receipt = serviceReceipt(result, { kind: "appointment", id: result.appointments[0].id }, { tip: 0, tipMethod: null, ownerNote: "", phone: "", email: "", revision: 0 }, []);
  assert.deepEqual(receipt.pets, ["Otto"]);
  assert.equal(receipt.price, before.appointments[0].price);
  assert.deepEqual(state, before);
});
test("deleted pets are recoverable from a separate trash without creating another client, visit or payment", () => {
  const state = fixture();
  const deleted = remove(state);
  const item = deleted.deletedPets[0];
  const restored = mutateState(deleted, { type: "restorePet", clientId: item.clientId, petId: item.pet.id }, "Admin");
  assert.equal(restored.clients[0].pets.filter(p => p.id === item.pet.id).length, 1);
  assert.equal(restored.deletedPets.length, 0);
  assert.equal(restored.clients.length, state.clients.length);
  assert.deepEqual(restored.appointments, deleted.appointments);
  assert.deepEqual(restored.payments, deleted.payments);
  assert.throws(() => mutateState(restored, { type: "restorePet", clientId: item.clientId, petId: item.pet.id }, "Admin"), /papelera/);
});
test("pending or ongoing services block removal so the daily agenda cannot lose a scheduled pet", () => {
  for (const status of ["Confirmado", "En servicio"]) {
    const state = fixture();
    state.appointments[0].status = status;
    state.appointments[0].date = today();
    assert.throws(() => remove(state), /citas pendientes/);
  }
});
test("groomers and reception cannot browse or restore the pet trash", () => {
  const state = remove(fixture());
  for (const role of ["groomer", "reception"]) {
    const member = { id: "staff", role, status: "active", vanId: "v1" };
    assert.deepEqual(visibleState(state, member).deletedPets, []);
    assert.throws(() => authorizeCommand(state, { type: "restorePet", clientId: state.clients[0].id, petId: state.deletedPets[0].pet.id }, member));
  }
});
