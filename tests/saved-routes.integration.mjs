// Disposable tenant and fake identities only; never modify business records.
import assert from "node:assert/strict";
import { database } from "../db/store.ts";
import { demoState } from "../lib/operations.ts";
import { routeSource } from "../lib/saved-routes.ts";
import {
  storeRoadProposal,
  savedRoutes,
  publishRoadRoute,
} from "../db/saved-routes.ts";
import { AccessError } from "../lib/team.ts";
const db = database(),
  prefix = `saved-route-test-${crypto.randomUUID()}`,
  owner = `test:${prefix}`;
const admin = {
  id: prefix,
  name: prefix,
  email: prefix + "@example.test",
  userId: "clerk:" + prefix,
  role: "admin",
  status: "active",
  version: 0,
  vanId: "",
};
const a = {
  ...admin,
  id: prefix + "a",
  email: prefix + "a@example.test",
  userId: "clerk:" + prefix + "a",
  role: "groomer",
  vanId: "v1",
};
const b = {
  ...a,
  id: prefix + "b",
  email: prefix + "b@example.test",
  userId: "clerk:" + prefix + "b",
};
const reception = {
  ...b,
  id: prefix + "r",
  email: prefix + "r@example.test",
  userId: "clerk:" + prefix + "r",
  role: "reception",
};
const state = {
  ...demoState(),
  appointments: [],
  base: { address: "Base 100", lat: null, lng: null },
};
const visits = [
  {
    id: prefix + "1",
    date: "2030-01-07",
    vanId: "v1",
    order: 1,
    clientId: null,
    clientName: "Customer A",
    address: "Street 100",
    price: 12345,
    notes: "secret-note",
  },
  {
    id: prefix + "2",
    date: "2030-01-07",
    vanId: "v1",
    order: 2,
    clientId: null,
    clientName: "Customer B",
    address: "Street 200",
  },
];
try {
  for (const m of [admin, a, b, reception])
    await db`INSERT INTO team_members(id,email,name,role,status,user_id,version,van_id,created_at) VALUES (${m.id},${m.email},${m.name},${m.role},'active',${m.userId},0,${m.vanId},${new Date().toISOString()})`;
  await db`INSERT INTO operation_state(owner,payload) VALUES (${owner},${JSON.stringify(state)})`;
  for (const v of visits)
    await db`INSERT INTO route_visits(owner,id,service_date,payload,original) VALUES (${owner},${v.id},${v.date},${db.json(v)},${db.json(v)})`;
  const source = routeSource(state, visits, "2030-01-07", "v1"),
    ids = visits.map((v) => v.id);
  const draft = await storeRoadProposal(
    admin,
    source,
    [...ids].reverse(),
    owner,
  );
  assert.equal(draft.status, "draft");
  assert.equal(
    (await storeRoadProposal(admin, source, [...ids].reverse(), owner)).id,
    draft.id,
  );
  assert.equal(
    (await savedRoutes(a, source.date, source.date, null, owner)).routes.length,
    0,
  );
  await assert.rejects(storeRoadProposal(a, source, ids, owner), AccessError);
  await assert.rejects(
    publishRoadRoute(
      a,
      { id: draft.id, revision: 0, groomerId: a.id, reviewed: true },
      owner,
    ),
    AccessError,
  );
  await assert.rejects(
    savedRoutes(reception, source.date, source.date, null, owner),
    AccessError,
  );
  await assert.rejects(
    publishRoadRoute(
      admin,
      { id: draft.id, revision: 0, groomerId: a.id, reviewed: false },
      owner,
    ),
    /Revisa/,
  );
  const active = await publishRoadRoute(
    admin,
    { id: draft.id, revision: 0, groomerId: a.id, reviewed: true },
    owner,
  );
  const own = (await savedRoutes(a, source.date, source.date, null, owner))
    .routes;
  assert.equal(own.length, 1);
  assert.deepEqual(
    own[0].stops.map((s) => s.id),
    [...ids].reverse(),
  );
  assert.ok(!JSON.stringify(own).includes("secret-note"));
  assert.ok(!JSON.stringify(own).includes("12345"));
  assert.equal(
    (await savedRoutes(b, source.date, source.date, "v1", owner)).routes.length,
    0,
  );
  await assert.rejects(
    publishRoadRoute(
      admin,
      { id: draft.id, revision: 0, groomerId: b.id, reviewed: true },
      owner,
    ),
    /cambió/,
  );
  const replacement = await storeRoadProposal(admin, source, ids, owner);
  await publishRoadRoute(
    admin,
    { id: replacement.id, revision: 0, groomerId: b.id, reviewed: true },
    owner,
  );
  assert.equal(
    (await savedRoutes(a, source.date, source.date, null, owner)).routes.length,
    0,
  );
  assert.equal(
    (await savedRoutes(b, source.date, source.date, null, owner)).routes[0].id,
    replacement.id,
  );
  const old = (
    await savedRoutes(admin, source.date, source.date, null, owner)
  ).routes.find((r) => r.id === draft.id);
  assert.equal(old.status, "replaced");
  await db`UPDATE route_visits SET payload=jsonb_set(payload,'{price}','99999') WHERE owner=${owner} AND id=${ids[0]}`;
  assert.equal(
    (await savedRoutes(b, source.date, source.date, null, owner)).routes[0]
      .stale,
    false,
  );
  await db`UPDATE route_visits SET payload=jsonb_set(payload,'{address}','"Changed address"') WHERE owner=${owner} AND id=${ids[0]}`;
  const stale = (await savedRoutes(b, source.date, source.date, null, owner))
    .routes[0];
  assert.equal(stale.stale, true);
  assert.equal(stale.stops.length, 0);
  await assert.rejects(
    publishRoadRoute(
      admin,
      { id: replacement.id, revision: 1, groomerId: b.id, reviewed: true },
      owner,
    ),
    /cambiaron/,
  );
  await db`UPDATE team_members SET status='inactive',version=version+1 WHERE id=${b.id}`;
  await assert.rejects(
    savedRoutes(b, source.date, source.date, null, owner),
    AccessError,
  );
  const [unchanged] =
    await db`SELECT payload FROM operation_state WHERE owner=${owner}`;
  assert.deepEqual(JSON.parse(unchanged.payload), state);
  // A saved agenda route must remain available as services progress, but an
  // appointment reassigned to another person immediately invalidates access.
  await db`DELETE FROM route_visits WHERE owner=${owner}`;
  const stateWithAppointments = {
    ...state,
    appointments: [
      {
        id: prefix + "appt",
        clientId: state.clients[0].id,
        petId: state.clients[0].pets[0].id,
        vanId: "v1",
        groomerId: a.id,
        groomer: a.name,
        serviceId: state.services[0].id,
        date: "2030-01-08",
        time: "09:00",
        duration: 60,
        travel: 10,
        price: 45000,
        cost: 0,
        extraCost: 0,
        status: "Confirmado",
        notes: "secret-appointment-note",
      },
    ],
  };
  await db`UPDATE operation_state SET payload=${JSON.stringify(stateWithAppointments)} WHERE owner=${owner}`;
  const appointmentSource = routeSource(
    stateWithAppointments,
    [],
    "2030-01-08",
    "v1",
  );
  const appointmentDraft = await storeRoadProposal(
    admin,
    appointmentSource,
    [prefix + "appt"],
    owner,
  );
  await assert.rejects(
    publishRoadRoute(
      admin,
      {
        id: appointmentDraft.id,
        revision: 0,
        groomerId: admin.id,
        reviewed: true,
      },
      owner,
    ),
    /cuenta activa/,
  );
  await publishRoadRoute(
    admin,
    { id: appointmentDraft.id, revision: 0, groomerId: a.id, reviewed: true },
    owner,
  );
  stateWithAppointments.appointments[0].status = "En servicio";
  await db`UPDATE operation_state SET payload=${JSON.stringify(stateWithAppointments)} WHERE owner=${owner}`;
  assert.equal(
    (await savedRoutes(a, "2030-01-08", "2030-01-08", null, owner)).routes[0]
      .stale,
    false,
  );
  stateWithAppointments.appointments[0].groomerId = b.id;
  await db`UPDATE operation_state SET payload=${JSON.stringify(stateWithAppointments)} WHERE owner=${owner}`;
  const reassigned = (
    await savedRoutes(a, "2030-01-08", "2030-01-08", null, owner)
  ).routes[0];
  assert.equal(reassigned.stale, true);
  assert.equal(reassigned.stops.length, 0);
  console.log(
    "Rutas persistentes: guardado idempotente, aprobación, aislamiento por bañador aun en la misma camioneta, reemplazo, cambios de domicilio, pagos sin invalidación y revocación comprobados.",
  );
} finally {
  await db`DELETE FROM saved_routes WHERE owner=${owner}`;
  await db`DELETE FROM route_visits WHERE owner=${owner}`;
  await db`DELETE FROM operation_state WHERE owner=${owner}`;
  for (const m of [admin, a, b, reception]) {
    await db`DELETE FROM team_audit WHERE actor=${m.id}`;
    await db`DELETE FROM team_members WHERE id=${m.id}`;
  }
  await db.end();
}
