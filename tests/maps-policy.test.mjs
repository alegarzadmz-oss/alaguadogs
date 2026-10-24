import { test } from "node:test";
import assert from "node:assert/strict";
import { mapsMonth, MapsError } from "../lib/maps-policy.ts";
import { mapsRoutePlan, mapsAddressQuery } from "../lib/maps-plan.ts";
import { routeReadiness } from "../lib/akira-routing.ts";
import { mapsFetch, parseMapsRouteResponse } from "../lib/google-maps.ts";
import { demoState, mutateState } from "../lib/operations.ts";

test("Maps monthly limits reset at midnight in Monterrey, not UTC", () => {
  assert.equal(mapsMonth(new Date("2026-11-01T05:59:59Z")), "2026-10");
  assert.equal(mapsMonth(new Date("2026-11-01T06:00:00Z")), "2026-11");
});

test("abbreviated addresses get Nuevo León context without changing stored data or guessing a municipality", () => {
  const address = "Magnolia 610, Privada Montebello. Entrada por Gómez Morín";
  assert.equal(
    mapsAddressQuery(address),
    "Magnolia 610, Privada Montebello, Nuevo León, México",
  );
  assert.equal(
    address,
    "Magnolia 610, Privada Montebello. Entrada por Gómez Morín",
  );
  assert.equal(
    mapsAddressQuery("Armenia 414"),
    "Armenia 414, Nuevo León, México",
  );
  assert.equal(
    mapsAddressQuery("Base 135, Nuevo León, México"),
    "Base 135, Nuevo León, México",
  );
});

test("road readiness allows complete addresses without GPS, but never allows missing addresses", () => {
  const s = {
    ...demoState(),
    appointments: [],
    base: { address: "Base de ejemplo 100", lat: null, lng: null },
  };
  const v = {
    id: "visit",
    date: "2026-10-23",
    vanId: "v1",
    order: 1,
    clientName: "Client",
    address: "Armenia 414",
    clientId: null,
    deletedAt: null,
  };
  const result = routeReadiness(
    { state: s, members: [], history: [v] },
    "2026-10-23",
    "v1",
    true,
  );
  assert.equal(result.vans[0].roadRoute.canQueryByAddress, true);
  assert.equal(result.vans[0].readyToPreviewScheduledRoute, false);
  assert.equal(
    routeReadiness(
      { state: s, members: [], history: [{ ...v, address: "" }] },
      "2026-10-23",
      "v1",
      true,
    ).vans[0].roadRoute.canQueryByAddress,
    false,
  );
});
test("road planning keeps distinct visits and customers at shared addresses; skips archived visits", () => {
  const s = {
    ...demoState(),
    appointments: [],
    base: { address: "Base de ejemplo 100", lat: null, lng: null },
  };
  const history = [
    {
      id: "1",
      date: "2026-10-24",
      vanId: "v1",
      order: 1,
      clientName: "Cliente A",
      address: "Calle compartida 123",
      deletedAt: null,
    },
    {
      id: "2",
      date: "2026-10-24",
      vanId: "v1",
      order: 2,
      clientName: "Cliente B",
      address: "Calle compartida 123",
      deletedAt: null,
    },
    {
      id: "3",
      date: "2026-10-24",
      vanId: "v1",
      order: 3,
      clientName: "Archivo",
      address: "Otro domicilio",
      deletedAt: "2026-10-24",
    },
  ];
  const before = JSON.stringify({ s, history });
  const plan = mapsRoutePlan(s, history, "2026-10-24", "v1");
  assert.deepEqual(
    plan.stops.map((v) => v.id),
    ["1", "2"],
  );
  assert.equal(JSON.stringify({ s, history }), before);
  assert.throws(
    () => mapsRoutePlan(s, history, "2026-10-25", "v1"),
    /no tiene visitas/,
  );
  assert.throws(
    () => mapsRoutePlan(s, history, "2026-02-30", "v1"),
    /fecha válida/,
  );
  assert.throws(
    () =>
      mapsRoutePlan(
        s,
        Array.from({ length: 26 }, (_, i) => ({
          ...history[0],
          id: String(i),
        })),
        "2026-10-24",
        "v1",
      ),
    /25 visitas/,
  );
  assert.throws(
    () =>
      mapsRoutePlan(s, [{ ...history[0], address: "" }], "2026-10-24", "v1"),
    /domicilios/,
  );
});
test("Maps cannot send a request after the quota is exhausted, even with a valid key", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-only-not-a-real-key";
  let requests = 0;
  try {
    await assert.rejects(
      mapsFetch(
        {},
        "routes",
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {},
        async () => {
          requests++;
          return Response.json({});
        },
        async () => {
          throw new MapsError("Límite", 429);
        },
      ),
      /Límite/,
    );
    assert.equal(requests, 0);
    await assert.rejects(
      mapsFetch(
        {},
        "routes",
        "https://example.test/",
        {},
        async () => {
          requests++;
        },
        async () => {},
      ),
      /Destino/,
    );
    assert.equal(requests, 0);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previous;
  }
});
test("Maps reserves before HTTP, does not retry failures, and never exposes the key or provider text", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  const key = "test-only-not-a-real-key";
  process.env.GOOGLE_MAPS_API_KEY = key;
  const events = [];
  try {
    await assert.rejects(
      mapsFetch(
        {},
        "routes",
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {},
        async (url, options) => {
          events.push("http");
          assert.ok(!url.includes(key));
          assert.equal(options.headers.get("X-Goog-Api-Key"), key);
          throw Error("Provider message contains " + key);
        },
        async () => {
          events.push("reserve");
        },
      ),
      (e) => e instanceof MapsError && !e.message.includes(key),
    );
    assert.deepEqual(events, ["reserve", "http"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previous;
  }
});
test("base can store an address without inventing coordinates; incomplete coordinate pairs are rejected", () => {
  const s = demoState();
  const next = mutateState(
    s,
    {
      type: "saveBase",
      base: { address: "Base de ejemplo 100", lat: null, lng: null },
    },
    "Test",
  );
  assert.equal(next.base.address, "Base de ejemplo 100");
  assert.equal(next.base.lat, null);
  assert.throws(
    () =>
      mutateState(
        s,
        {
          type: "saveBase",
          base: { address: "Base de ejemplo 100", lat: 25, lng: null },
        },
        "Test",
      ),
    /ambas/,
  );
});

test("Google one-stop sentinel keeps the only visit and its return; invalid multi-stop orders are rejected", () => {
  const plan = {
    base: "Base",
    stops: [{ id: "visit-1", client: "Client", address: "Address" }],
  };
  const raw = {
    routes: [
      {
        distanceMeters: 13879,
        duration: "1343s",
        legs: [
          { distanceMeters: 7786, duration: "658s" },
          { distanceMeters: 6093, duration: "686s" },
        ],
        optimizedIntermediateWaypointIndex: [-1],
      },
    ],
  };
  const result = parseMapsRouteResponse(raw, plan);
  assert.equal(result.stops[0].id, "visit-1");
  assert.equal(result.distanceKm, 13.9);
  assert.equal(result.returnMinutes, 12);
  assert.equal(result.saved, false);
  const two = {
    ...plan,
    stops: [
      ...plan.stops,
      { id: "visit-2", client: "Other", address: "Other address" },
    ],
  };
  assert.throws(() => parseMapsRouteResponse(raw, two), /todas las paradas/);
  assert.throws(
    () =>
      parseMapsRouteResponse(
        {
          routes: [
            { ...raw.routes[0], optimizedIntermediateWaypointIndex: [0, 0] },
          ],
        },
        two,
      ),
    /todas las paradas/,
  );
});

test("Maps distinguishes a failed lookup from a partial match and identifies the affected visit", () => {
  const plan = {
    base: "Base",
    stops: [
      { id: "visit-1", client: "Client A", address: "Street 100" },
      { id: "visit-2", client: "Client B", address: "Street 200" },
    ],
  };
  const raw = {
    routes: [
      {
        distanceMeters: 1000,
        duration: "180s",
        legs: [{ duration: "60s" }, { duration: "60s" }, { duration: "60s" }],
        optimizedIntermediateWaypointIndex: [1, 0],
      },
    ],
    geocodingResults: {
      intermediates: [
        {
          intermediateWaypointRequestIndex: 0,
          geocoderStatus: {},
          partialMatch: true,
        },
        { intermediateWaypointRequestIndex: 1, geocoderStatus: {} },
      ],
    },
  };
  const result = parseMapsRouteResponse(raw, plan);
  assert.equal(result.locationWarnings.length, 1);
  assert.equal(result.locationWarnings[0].client, "Client A");
  assert.deepEqual(
    result.stops.map((s) => s.id),
    ["visit-2", "visit-1"],
  );
  raw.geocodingResults.intermediates[1].geocoderStatus.code = 5;
  assert.throws(
    () => parseMapsRouteResponse(raw, plan),
    (e) =>
      e.status === 422 &&
      e.message.includes("Client B (Street 200)") &&
      !e.message.includes("Client A (Street 100)"),
  );
});
