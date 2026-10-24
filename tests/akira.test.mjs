import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/operations.ts";
import {
  findClients,
  buildBooking,
  suggestSlots,
  bookingProposal,
  routePreview,
  daySchedule,
} from "../lib/akira.ts";
const now = new Date("2026-10-23T18:00:00Z");
function context() {
  const state = demoState();
  state.appointments = [];
  state.payments = [];
  return { state, members: [], history: [] };
}
function input(ctx, changes = {}) {
  return {
    clientId: ctx.state.clients[0].id,
    petId: ctx.state.clients[0].pets[0].id,
    serviceId: ctx.state.services[0].id,
    date: "2026-10-24",
    time: "10:00",
    vanId: "v1",
    ...changes,
  };
}
test("search keeps people with the same name separate and excludes phones/notes", () => {
  const ctx = context();
  ctx.state.clients[1].name = ctx.state.clients[0].name;
  const result = findClients(ctx.state, ctx.state.clients[0].name);
  assert.equal(result.total, 2);
  assert.notEqual(result.clients[0].id, result.clients[1].id);
  assert.equal("phone" in result.clients[0], false);
  assert.equal("notes" in result.clients[0], false);
});
test("booking drafts use existing catalogue and assigned groomer without writing state", () => {
  const ctx = context();
  const before = structuredClone(ctx.state);
  ctx.members = [
    {
      id: "g1",
      name: "Leslie",
      role: "groomer",
      status: "active",
      vanId: "v1",
    },
  ];
  const draft = bookingProposal(ctx, input(ctx), now);
  assert.equal(draft.command.appointment.groomerId, "g1");
  assert.equal(draft.command.appointment.price, ctx.state.services[0].price);
  assert.deepEqual(ctx.state, before);
});
test("booking rejects missing identity and past or impossible dates", () => {
  const ctx = context();
  assert.throws(() =>
    buildBooking(ctx, input(ctx, { petId: "not-their-pet" }), now),
  );
  assert.throws(
    () => buildBooking(ctx, input(ctx, { date: "2026-10-22" }), now),
    /futuras/,
  );
  assert.throws(
    () => buildBooking(ctx, input(ctx, { date: "2026-02-30" }), now),
    /válida/,
  );
  ctx.state.clients[0].address = "Dirección no indicada";
  assert.throws(() => buildBooking(ctx, input(ctx), now), /domicilio/);
});
test("van and shared groomer conflicts and cross-van duplicate pet bookings are rejected", () => {
  const ctx = context();
  ctx.state.appointments.push(buildBooking(ctx, input(ctx), now));
  assert.throws(() => buildBooking(ctx, input(ctx), now));
  assert.throws(
    () => buildBooking(ctx, input(ctx, { vanId: "v2" }), now),
    /mascota/,
  );
  ctx.members = [
    {
      id: "g1",
      name: "Mismo bañador",
      role: "groomer",
      status: "active",
      vanId: "v2",
    },
  ];
  ctx.state.appointments[0].groomerId = "g1";
  assert.throws(
    () =>
      buildBooking(
        ctx,
        input(ctx, {
          clientId: ctx.state.clients[1].id,
          petId: ctx.state.clients[1].pets[0].id,
          vanId: "v2",
        }),
        now,
      ),
    /cruza/,
  );
});
test("slot suggestions prefer the same zone and warn about missing historical times", () => {
  const ctx = context();
  ctx.state.vans = ctx.state.vans.slice(0, 2);
  ctx.state.clients[1].zone = ctx.state.clients[0].zone;
  ctx.state.appointments.push(
    buildBooking(
      ctx,
      input(ctx, {
        clientId: ctx.state.clients[1].id,
        petId: ctx.state.clients[1].pets[0].id,
        time: "14:00",
        vanId: "v2",
      }),
      now,
    ),
  );
  ctx.history = [{ date: "2026-10-24", vanId: "v1" }];
  const result = suggestSlots(
    ctx,
    { ...input(ctx), preferredTime: "10:00", vanId: null },
    now,
  );
  assert.equal(result.slots[0].vanId, "v2");
  assert.match(result.warning, /importadas/);
  assert.match(result.slots[0].reason, /zona/);
});
test("routes without coordinates or imported visits never invent a viable route or hours", () => {
  const ctx = context();
  ctx.state.appointments.push(buildBooking(ctx, input(ctx), now));
  const r = routePreview(ctx, "2026-10-24", "v1", "08:00");
  assert.equal(r.proposal, null);
  assert.match(r.message, /base/);
  assert.equal(r.scheduledStops[0].hasCoordinates, false);
  assert.equal(daySchedule(ctx, "2026-10-24").appointments.length, 1);
});
test("routes with coordinates expose a reviewable command without applying it", () => {
  const ctx = context();
  ctx.state.base = { address: "Base", lat: 25.6, lng: -100.3 };
  Object.assign(ctx.state.clients[0], { lat: 25.61, lng: -100.31 });
  ctx.state.appointments.push(buildBooking(ctx, input(ctx), now));
  const before = structuredClone(ctx.state);
  const result = routePreview(ctx, "2026-10-24", "v1", "09:00");
  assert.equal(result.proposal.command.type, "applyRoute");
  assert.match(result.proposal.warnings[0], /línea recta/);
  assert.deepEqual(ctx.state, before);
});
