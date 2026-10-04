import assert from "node:assert/strict";
import { database, prepare, run, guardedWrite } from "../db/store.ts";
import {
  memberFor,
  changeMember,
  activateMember,
  teamContext,
} from "../db/team.ts";
import { AccessError } from "../lib/team.ts";
const db = database();
const prefix = `test-${crypto.randomUUID()}`;
const admin = {
  id: prefix,
  email: `${prefix}@example.test`,
  name: prefix,
  role: "admin",
  vanId: "",
  status: "active",
  userId: `clerk:${prefix}`,
  version: 0,
};
const owner = `${prefix}-state`;
const memberId = `${prefix}-groomer`;
let checks = 0;
function check(value) {
  assert.ok(value);
  checks++;
}
try {
  await db`INSERT INTO team_members (id,email,name,role,status,user_id,created_at) VALUES (${admin.id},${admin.email},${admin.name},'admin','active',${admin.userId},${new Date().toISOString()})`;
  await db`INSERT INTO operation_state (owner,payload,revision) VALUES (${owner},'{}',0)`;
  const member = await memberFor({ userId: admin.userId, email: admin.email });
  check(member.id === admin.id);
  const invite = await changeMember(member, {
    type: "saveMember",
    member: {
      id: memberId,
      name: prefix + " groomer",
      email: prefix + "-groomer@example.test",
      role: "groomer",
      vanId: "v2",
    },
  });
  check(invite.token?.length === 64);
  const [[stored]] = await Promise.all([
    db`SELECT invite_hash FROM team_members WHERE id=${memberId}`,
  ]);
  check(stored.invite_hash !== invite.token);
  await assert.rejects(
    activateMember(
      { userId: `clerk:${prefix}-wrong`, email: "other@example.test" },
      invite.token,
    ),
    AccessError,
  );
  checks++;
  const user = {
    userId: `clerk:${prefix}-groomer`,
    email: prefix + "-groomer@example.test",
  };
  const groomer = await activateMember(user, invite.token);
  check(groomer.role === "groomer" && groomer.vanId === "v2");
  await assert.rejects(activateMember(user, invite.token));
  checks++;
  check((await teamContext(groomer)).members.length === 0);
  await assert.rejects(
    changeMember(groomer, {
      type: "setMemberStatus",
      id: admin.id,
      version: 0,
      active: false,
    }),
    AccessError,
  );
  checks++;
  const statement = prepare(
    "UPDATE operation_state SET payload=?,revision=revision+1 WHERE owner=? AND revision=?",
    ['{"paid":true}', owner, 0],
  );
  const result = await Promise.all([
    guardedWrite(statement, admin),
    guardedWrite(statement, admin),
  ]);
  check(result.reduce((a, b) => a + b, 0) === 1);
  await changeMember(admin, {
    type: "setMemberStatus",
    id: memberId,
    version: groomer.version,
    active: false,
  });
  await assert.rejects(memberFor(user), AccessError);
  checks++;
  check(
    (await guardedWrite(
      prepare("UPDATE operation_state SET revision=revision+1 WHERE owner=?", [
        owner,
      ]),
      groomer,
    )) === 0,
  );
  const [inactive] =
    await db`SELECT version FROM team_members WHERE id=${memberId}`;
  await changeMember(admin, {
    type: "setMemberStatus",
    id: memberId,
    version: inactive.version,
    active: true,
  });
  check((await memberFor(user)).id === memberId);
  await assert.rejects(
    changeMember(admin, {
      type: "saveMember",
      member: {
        id: memberId,
        name: "late",
        email: user.email,
        role: "admin",
        version: groomer.version,
      },
    }),
    /cambió/,
  );
  checks++;
  await assert.rejects(
    changeMember(admin, {
      type: "setMemberStatus",
      id: "alagua-administration",
      version: 0,
      active: false,
    }),
    /protegido/,
  );
  checks++;
  const legacyId = `${prefix}-legacy`;
  await db`INSERT INTO team_members (id,email,name,role,status,user_id,created_at,legacy_identity) VALUES (${legacyId},${prefix + "-legacy@example.test"},${prefix},'admin','active',${"sites:" + prefix},${new Date().toISOString()},true)`;
  const migrated = await memberFor({
    userId: "clerk:" + legacyId,
    email: prefix + "-legacy@example.test",
  });
  check(migrated.userId === "clerk:" + legacyId);
  await assert.rejects(
    memberFor({
      userId: "clerk:another-" + prefix,
      email: prefix + "-legacy@example.test",
    }),
    AccessError,
  );
  checks++;
  console.log(
    `${checks} comprobaciones de Postgres completadas: invitaciones, permisos, revocación, concurrencia y vinculación de cuentas.`,
  );
} finally {
  await db`DELETE FROM team_audit WHERE actor LIKE ${prefix + "%"}`;
  await db`DELETE FROM team_members WHERE id LIKE ${prefix + "%"}`;
  await db`DELETE FROM operation_state WHERE owner=${owner}`;
  await db.end();
}
