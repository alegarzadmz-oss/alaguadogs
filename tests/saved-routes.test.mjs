import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/operations.ts";
import {
  routeSource,
  sourceIdentity,
  orderedSource,
  navigationURL,
} from "../lib/saved-routes.ts";
test("saved work orders retain every visit identity and preserve addresses without copying financial/private fields", () => {
  const state = {
    ...demoState(),
    appointments: [],
    base: { address: "Base 123", lat: null, lng: null },
  };
  const visits = [
    {
      id: "a",
      date: "2030-01-07",
      vanId: "v1",
      order: 1,
      clientName: "Same name",
      clientId: null,
      address: "Address 100",
      notes: "secret",
      price: 12345,
    },
    {
      id: "b",
      date: "2030-01-07",
      vanId: "v1",
      order: 2,
      clientName: "Same name",
      clientId: null,
      address: "Address 200",
    },
  ];
  const source = routeSource(state, visits, "2030-01-07", "v1");
  const plan = orderedSource(source, ["b", "a"]);
  assert.deepEqual(
    plan.stops.map((s) => s.id),
    ["b", "a"],
  );
  assert.ok(!JSON.stringify(plan).includes("secret"));
  assert.ok(!JSON.stringify(plan).includes("12345"));
  assert.throws(() => orderedSource(source, ["a", "a"]), /exactamente/);
  assert.throws(() => orderedSource(source, ["a"]), /exactamente/);
  assert.equal(
    sourceIdentity(source),
    sourceIdentity(
      routeSource(
        state,
        [{ ...visits[0], price: 99999 }, visits[1]],
        "2030-01-07",
        "v1",
      ),
    ),
  );
  assert.notEqual(
    sourceIdentity(source),
    sourceIdentity(
      routeSource(
        state,
        [{ ...visits[0], address: "New address" }, visits[1]],
        "2030-01-07",
        "v1",
      ),
    ),
  );
});
test("navigation opens only the chosen destination, keeping all stops available on mobile without waypoint truncation", () => {
  const url = new URL(navigationURL("Calle & destino=otra 15"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), null);
  assert.equal(url.searchParams.get("waypoints"), null);
  assert.equal(
    url.searchParams.get("destination"),
    "Calle & destino=otra 15, Nuevo León, México",
  );
});
