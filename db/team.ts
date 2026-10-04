import type { PortalUser } from "@/lib/auth";
import {
  AccessError,
  BOOTSTRAP_MEMBER_ID,
  publicMember,
  type TeamContext,
  type TeamMember,
} from "@/lib/team";
import { prepare, first, rows, auditedWrite, type Statement } from "./store";

const columns =
  'id, email, name, role, van_id AS "vanId", status, user_id AS "userId", version';
export async function memberFor(user: PortalUser): Promise<TeamMember> {
  const lookup = prepare(
    `SELECT ${columns} FROM team_members WHERE user_id = ? AND status = 'active'`,
    [user.userId],
  );
  const active = await first<TeamMember>(lookup);
  if (active) return active;
  // Only imported, previously active accounts may bind a new verified identity once.
  // A pending invite still requires its private activation link.
  await auditedWrite(
    prepare(
      "UPDATE team_members SET user_id = ?, legacy_identity = false, version = version + 1 WHERE email = ? AND status = 'active' AND legacy_identity = true AND (user_id IS NULL OR user_id LIKE 'sites:%')",
      [user.userId, user.email],
    ),
    user.email,
    "Acceso vinculado al nuevo inicio de sesión",
  );
  const member = await first<TeamMember>(lookup);
  if (!member) throw new AccessError();
  return member;
}

export async function teamContext(member: TeamMember): Promise<TeamContext> {
  const members =
    member.role === "admin"
      ? (
          await rows<TeamMember>(
            prepare(
              `SELECT ${columns} FROM team_members ORDER BY created_at, id`,
            ),
          )
        ).map(publicMember)
      : [];
  return {
    viewer: {
      id: member.id,
      name: member.name,
      role: member.role,
      vanId: member.vanId,
    },
    members,
  };
}

export const memberGuard = (adminOnly = false) =>
  `EXISTS (SELECT 1 FROM team_members WHERE id = ? AND user_id = ? AND version = ? AND status = 'active'${adminOnly ? " AND role = 'admin'" : ""})`;
export const guardValues = (member: TeamMember) => [
  member.id,
  member.userId,
  member.version,
];
export async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const normalizeEmail = (email: unknown) => {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw Error("Indica un correo válido.");
  return email.trim().toLowerCase();
};

export async function activateMember(user: PortalUser, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw Error("El enlace de activación no es válido.");
  const now = new Date().toISOString();
  const hash = await tokenHash(token);
  const row = await first<TeamMember>(
    prepare(
      `SELECT ${columns} FROM team_members WHERE invite_hash = ? AND status = 'pending' AND invite_expires > ?`,
      [hash, now],
    ),
  );
  if (!row)
    throw Error(
      "El enlace venció o ya fue utilizado. Pide uno nuevo a administración.",
    );
  if (normalizeEmail(user.email) !== row.email)
    throw new AccessError(
      `Inicia sesión con el correo al que corresponde esta invitación: ${row.email}.`,
    );
  const statement = prepare(
    "UPDATE team_members SET user_id = ?, status = 'active', legacy_identity = false, invite_hash = NULL, invite_expires = NULL, version = version + 1 WHERE id = ? AND version = ? AND invite_hash = ? AND status = 'pending' AND user_id IS NULL AND NOT EXISTS (SELECT 1 FROM team_members WHERE user_id = ?)",
    [user.userId, row.id, row.version, hash, user.userId],
  );
  if (
    !(await auditedWrite(statement, user.email, `Acceso activado: ${row.name}`))
  )
    throw new AccessError(
      "No se pudo activar este acceso. Actualiza y revisa la cuenta con la que entraste.",
    );
  return memberFor(user);
}

export async function changeMember(
  actor: TeamMember,
  command: Record<string, unknown>,
) {
  if (actor.role !== "admin")
    throw new AccessError("Solo administración puede cambiar accesos.");
  const now = new Date().toISOString();
  const id =
    command.type === "saveMember"
      ? (command.member as Record<string, unknown>)?.id
      : command.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    throw Error("Identificador de acceso inválido.");
  if (id === BOOTSTRAP_MEMBER_ID)
    throw Error("El acceso administrador inicial está protegido.");
  const existing = await first<TeamMember>(
    prepare(`SELECT ${columns} FROM team_members WHERE id = ?`, [id]),
  );
  let statement: Statement;
  let action: string;
  let token: string | undefined;
  const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
  if (command.type === "saveMember") {
    const input = command.member as Record<string, unknown>;
    const email = normalizeEmail(input.email);
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 120
    )
      throw Error("Indica el nombre de la persona.");
    if (!["admin", "groomer"].includes(String(input.role)))
      throw Error("Selecciona un rol válido.");
    const name = input.name.trim();
    const role = String(input.role);
    const vanId =
      role === "groomer" && typeof input.vanId === "string" ? input.vanId : "";
    if (vanId && !["v1", "v2", "v3", "v4"].includes(vanId))
      throw Error("Selecciona una camioneta válida.");
    if (existing) {
      if (email !== existing.email)
        throw Error(
          "El correo de un acceso no se puede cambiar. Da de alta una cuenta nueva.",
        );
      if (input.version !== existing.version)
        throw Error("El acceso cambió. Actualiza antes de editar.");
      statement = prepare(
        `UPDATE team_members SET name = ?, role = ?, van_id = ?, version = version + 1 WHERE id = ? AND version = ? AND ${memberGuard(true)}`,
        [name, role, vanId, id, existing.version, ...guardValues(actor)],
      );
    } else {
      if (
        await first(
          prepare("SELECT id FROM team_members WHERE email = ?", [email]),
        )
      )
        throw Error("Ya existe un acceso con ese correo.");
      token = newToken();
      statement = prepare(
        `INSERT INTO team_members (id, email, name, role, van_id, status, invite_hash, invite_expires, created_at) SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ? WHERE ${memberGuard(true)} ON CONFLICT DO NOTHING`,
        [
          id,
          email,
          name,
          role,
          vanId,
          await tokenHash(token),
          expiry,
          now,
          ...guardValues(actor),
        ],
      );
    }
    action = `Acceso ${existing ? "editado" : "creado"}: ${name} · ${role === "admin" ? "Administración" : "Bañador/a"}`;
  } else {
    if (!existing) throw Error("Acceso no encontrado.");
    if (command.version !== existing.version)
      throw Error("El acceso cambió. Actualiza antes de editar.");
    if (command.type === "renewInvite") {
      if (existing.userId || existing.status === "active")
        throw Error("Esta persona ya activó su cuenta.");
      token = newToken();
      statement = prepare(
        `UPDATE team_members SET status = 'pending', invite_hash = ?, invite_expires = ?, version = version + 1 WHERE id = ? AND version = ? AND ${memberGuard(true)}`,
        [
          await tokenHash(token),
          expiry,
          id,
          existing.version,
          ...guardValues(actor),
        ],
      );
      action = `Enlace de activación renovado: ${existing.name}`;
    } else if (command.type === "setMemberStatus") {
      if (command.active !== true && command.active !== false)
        throw Error("Selecciona el estado del acceso.");
      if (command.active && !existing.userId)
        throw Error("Genera un enlace de activación para esta persona.");
      statement = prepare(
        `UPDATE team_members SET status = ?, invite_hash = NULL, invite_expires = NULL, version = version + 1 WHERE id = ? AND version = ? AND ${memberGuard(true)}`,
        [
          command.active ? "active" : "inactive",
          id,
          existing.version,
          ...guardValues(actor),
        ],
      );
      action = `Acceso ${command.active ? "reactivado" : "desactivado"}: ${existing.name}`;
    } else {
      throw Error("Acción de equipo no reconocida.");
    }
  }
  if (!(await auditedWrite(statement, actor.name, action, actor)))
    throw new AccessError(
      "El acceso cambió o tus permisos ya no están activos. Actualiza antes de continuar.",
    );
  return { token, memberId: id };
}

export async function accessAudit() {
  return rows<{ at: string; actor: string; action: string }>(
    prepare(
      "SELECT at, actor, action FROM team_audit ORDER BY at DESC, id DESC LIMIT 30",
    ),
  );
}
