import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeRoundTrip } from "../lib/route-optimizer.ts";
import { demoState, mutateState } from "../lib/operations.ts";
import { routeReadiness } from "../lib/akira-routing.ts";
import { routePreview, daySchedule } from "../lib/akira.ts";

const circuit = (matrix, order) => {
  let cost = 0,
    at = 0;
  for (const i of order) {
    cost += matrix[at][i + 1];
    at = i + 1;
  }
  return cost + matrix[at][0];
};
test("exact route compares the complete circuit including its return to base", () => {
  const matrix = [
    [0, 10, 15, 20],
    [10, 0, 35, 25],
    [15, 35, 0, 30],
    [20, 25, 30, 0],
  ];
  const r = optimizeRoundTrip(matrix);
  assert.equal(r.distance, 80);
  assert.equal(r.originalDistance, 95);
  assert.equal(r.algorithm, "exact");
  assert.equal(circuit(matrix, r.order), r.distance);
  assert.equal(new Set(r.order).size, 3);
});
test("exact optimizer matches exhaustive search for directed travel costs", () => {
  const n = 7,
    matrix = Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) =>
        i === j ? 0 : 1 + ((i * 13 + j * 7 + i * j) % 31),
      ),
    );
  let best = Infinity;
  const search = (path, left) => {
    if (!left.length) {
      best = Math.min(best, circuit(matrix, path));
      return;
    }
    for (const i of left)
      search(
        [...path, i],
        left.filter((j) => j !== i),
      );
  };
  search(
    [],
    Array.from({ length: n }, (_, i) => i),
  );
  const r = optimizeRoundTrip(matrix);
  assert.equal(r.distance, best);
  assert.ok(r.distance <= r.originalDistance);
});
test("larger routes improve a poor order, remain deterministic and never lose or repeat stops", () => {
  const positions = [0, 1, 13, 2, 12, 3, 11, 4, 10, 5, 9, 6, 8, 7];
  const matrix = positions.map((a) => positions.map((b) => Math.abs(a - b)));
  const r = optimizeRoundTrip(matrix);
  assert.equal(r.algorithm, "heuristic");
  assert.equal(r.distance, 26);
  assert.ok(r.distance < r.originalDistance);
  assert.equal(new Set(r.order).size, 13);
  assert.deepEqual(optimizeRoundTrip(matrix), r);
  const directed = matrix.map((row, i) =>
    row.map((distance, j) => (i === j ? 0 : distance + ((i + j * 7) % 8))),
  );
  const d = optimizeRoundTrip(directed);
  assert.ok(d.distance <= d.originalDistance);
  assert.equal(circuit(directed, d.order), d.distance);
});
test("route optimizer refuses missing distances, non-finite inputs and oversized routes", () => {
  for (const matrix of [
    [],
    [[0]],
    [[0, 1], [1]],
    [
      [0, NaN],
      [1, 0],
    ],
    [
      [0, -1],
      [1, 0],
    ],
    Array.from({ length: 62 }, () => Array(62).fill(0)),
  ])
    assert.throws(() => optimizeRoundTrip(matrix));
});
function context() {
  const state = demoState();
  state.appointments = state.appointments
    .slice(0, 1)
    .map((a) => ({ ...a, date: "2030-01-07", status: "Confirmado" }));
  state.payments = [];
  state.base = { address: "Base de prueba", lat: 25.6, lng: -100.3 };
  Object.assign(state.clients[0], {
    lat: 25.61,
    lng: -100.31,
    phone: "PRIVATE-CONTACT",
    notes: "PRIVATE-NOTES",
  });
  return { state, history: [], members: [] };
}
test("readiness identifies changed addresses, excludes archived routes, and does not expose private contacts or payments", () => {
  const ctx = context(),
    c = ctx.state.clients[0];
  const route = {
    id: "history",
    date: "2030-01-07",
    vanId: "v1",
    clientId: c.id,
    clientName: c.name,
    address: "Un domicilio distinto",
    pets: [{ name: "Mascota", breed: "" }],
    price: 987654,
  };
  ctx.history = [
    route,
    { ...route, id: "archived", deletedAt: "2030-01-07T12:00:00Z" },
  ];
  const r = routeReadiness(ctx, "2030-01-07", "v1");
  assert.equal(r.vans[0].routeVisitsWithoutTimes, 1);
  assert.equal(r.vans[0].missingCoordinateCount, 1);
  assert.match(r.vans[0].missingCoordinates[0].reason, /difiere/);
  assert.equal(r.vans[0].readyToPreviewScheduledRoute, false);
  const text = JSON.stringify(r);
  for (const value of ["PRIVATE-CONTACT", "PRIVATE-NOTES", "987654"])
    assert.ok(!text.includes(value));
  assert.equal(daySchedule(ctx, "2030-01-07").importedVisitsWithoutTimes, 1);
  assert.equal(routePreview(ctx, "2030-01-07", "v1", "08:00").proposal, null);
  assert.throws(() => routeReadiness(ctx, "2030-02-30", null));
  assert.throws(() => routeReadiness(ctx, "2030-01-07", "missing"));
});
test("ready routes retain review requirements, ignore archived visits and reject a return after midnight", () => {
  const ctx = context();
  ctx.history = [
    { date: "2030-01-07", vanId: "v1", deletedAt: "2030-01-08T12:00:00Z" },
  ];
  assert.equal(
    routeReadiness(ctx, "2030-01-07", "v1").vans[0]
      .readyToPreviewScheduledRoute,
    true,
  );
  const before = structuredClone(ctx.state);
  const preview = routePreview(ctx, "2030-01-07", "v1", "08:00");
  const empty = routeReadiness(ctx, "2030-01-08", null);
  assert.equal(empty.dailyTotals.scheduled, 0);
  assert.equal(empty.dailyTotals.routeVisitsWithoutTimes, 0);
  assert.match(empty.scheduleFact, /No hay citas ni visitas/);
  assert.equal(preview.proposal.kind, "route");
  assert.ok(preview.proposal.warnings.some((w) => /Regreso estimado/.test(w)));
  assert.deepEqual(ctx.state, before);
  assert.throws(
    () => routePreview(ctx, "2030-01-07", "v1", "23:50"),
    /regreso.*medianoche/,
  );
  assert.throws(
    () =>
      mutateState(
        ctx.state,
        { type: "applyRoute", date: "2030-01-07", vanId: "v1", start: "23:50" },
        "Test",
      ),
    /regreso.*medianoche/,
  );
  assert.deepEqual(ctx.state, before);
});
