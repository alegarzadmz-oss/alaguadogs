// Explicit Postgres integration check. Disposable owner and fake users only.
import assert from "node:assert/strict";
import { database } from "../db/store.ts";
import { reserveMapsRequests, readMapsUsage } from "../db/maps-usage.ts";
import { mapsMonth } from "../lib/maps-policy.ts";
import { AccessError } from "../lib/team.ts";
const db = database();
const prefix = `maps-test-${crypto.randomUUID()}`;
const owner = `test:${prefix}`;
const member = {
  id: prefix,
  name: prefix,
  email: prefix + "@example.test",
  userId: "clerk:" + prefix,
  role: "admin",
  status: "active",
  version: 0,
  vanId: "",
};
const now = new Date("2030-10-24T18:00:00Z");
try {
  await db`INSERT INTO team_members (id,email,name,role,status,user_id,created_at) VALUES (${member.id},${member.email},${member.name},'admin','active',${member.userId},${now.toISOString()})`;
  await reserveMapsRequests(member, "routes", 999, owner, now);
  const concurrent = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      reserveMapsRequests(member, "routes", 1, owner, now),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    concurrent.filter((r) => r.status === "rejected" && r.reason.status === 429)
      .length,
    11,
  );
  assert.equal(
    (await readMapsUsage(member, owner, now)).services.routes.used,
    1000,
  );
  await reserveMapsRequests(member, "geocoding", 1, owner, now);
  assert.equal(
    (await readMapsUsage(member, owner, now)).services.geocoding.used,
    1,
  );
  const nextMonth = new Date("2030-11-01T06:00:00Z");
  await reserveMapsRequests(member, "routes", 1, owner, nextMonth);
  assert.equal(
    (await readMapsUsage(member, owner, nextMonth)).services.routes.used,
    1,
  );
  await assert.rejects(
    reserveMapsRequests(
      { ...member, role: "groomer" },
      "routes",
      1,
      owner,
      now,
    ),
    AccessError,
  );
  await db`UPDATE team_members SET status='inactive',version=version+1 WHERE id=${member.id}`;
  await assert.rejects(
    reserveMapsRequests(member, "geocoding", 1, owner, now),
    AccessError,
  );
  assert.equal(
    (
      await db`SELECT used FROM maps_usage WHERE owner=${owner} AND month=${mapsMonth(now)} AND service='geocoding'`
    )[0].used,
    1,
  );
  console.log(
    "Maps: concurrencia bloqueada en 1,000, cuotas independientes, reinicio mensual y permisos revocados comprobados en Postgres.",
  );
} finally {
  await db`DELETE FROM maps_usage WHERE owner=${owner}`;
  await db`DELETE FROM team_audit WHERE actor=${member.id}`;
  await db`DELETE FROM team_members WHERE id=${member.id}`;
  await db.end();
}
