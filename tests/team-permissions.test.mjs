import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, mutateState } from "../lib/operations.ts";
import { authorizeCommand, visibleState, AccessError } from "../lib/team.ts";
const groomer = {
  id: "member-a",
  email: "a@example.test",
  name: "Ana",
  role: "groomer",
  vanId: "v1",
  status: "active",
  userId: "subject-a",
  version: 0,
};
function fixture() {
  const s = demoState();
  s.appointments[1].groomerId = groomer.id;
  s.appointments[2].groomerId = "member-b";
  s.audit = [{ at: "now", actor: "Private", action: "Private" }];
  return s;
}
test("assigned identity limits records even when two groomers use the same van", () => {
  const s = fixture();
  const view = visibleState(s, groomer);
  assert.deepEqual(
    view.appointments.map((a) => a.id),
    ["a1"],
  );
  assert.deepEqual(
    view.clients.map((c) => c.id),
    ["c1"],
  );
  assert.ok(view.payments.every((p) => p.appointmentId === "a1"));
  assert.ok(view.incidents.every((i) => i.appointmentId === "a1"));
  assert.equal(view.appointments[0].cost, 0);
  assert.equal(view.appointments[0].extraCost, 0);
  assert.ok(view.services.every((s) => s.cost === 0));
  assert.deepEqual(view.audit, []);
  assert.deepEqual(view.operations, []);
  assert.equal(s.appointments[1].cost, 18000);
});
test("groomer can collect, report and attend only their assigned visit", () => {
  const s = fixture();
  for (const command of [
    { type: "payment", appointmentId: "a1" },
    { type: "incident", appointmentId: "a1", clientId: "c1" },
    { type: "status", id: "a1", status: "En servicio" },
  ])
    assert.doesNotThrow(() => authorizeCommand(s, command, groomer));
  for (const command of [
    { type: "payment", appointmentId: "a2" },
    { type: "incident", appointmentId: "a1", clientId: "c2" },
    { type: "status", id: "a1", status: "Cancelado" },
    { type: "saveClient" },
    { type: "saveAppointment" },
    { type: "outcome", id: "a1" },
    { type: "clearDemo" },
    { type: "resolve" },
  ])
    assert.throws(() => authorizeCommand(s, command, groomer), AccessError);
  assert.throws(
    () =>
      authorizeCommand(
        s,
        { type: "payment", appointmentId: "a1" },
        { ...groomer, status: "inactive" },
      ),
    AccessError,
  );
});
test("no assignment gives no client or payment access; administrators retain complete history", () => {
  const s = fixture();
  const empty = visibleState(s, { ...groomer, id: "never-assigned" });
  assert.equal(empty.clients.length, 0);
  assert.equal(empty.payments.length, 0);
  assert.equal(empty.appointments.length, 0);
  assert.equal(visibleState(s, { ...groomer, role: "admin" }), s);
});
test("stable identity detects overlap even after a groomer name changes", () => {
  const s = fixture();
  const a = {
    ...s.appointments[1],
    id: "new",
    vanId: "v2",
    groomer: "Renamed",
    time: "11:00",
  };
  assert.throws(
    () => mutateState(s, { type: "saveAppointment", appointment: a }, "Admin"),
    /cruza/,
  );
});
