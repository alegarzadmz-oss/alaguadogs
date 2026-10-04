"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BOOTSTRAP_MEMBER_ID,
  roleLabel,
  type PublicMember,
  type TeamContext,
} from "@/lib/team";
import type { Van } from "@/lib/operations";

type AccessAudit = { at: string; actor: string; action: string };
export function TeamAccess({
  team,
  vans,
  onChange,
}: {
  team: TeamContext;
  vans: Van[];
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<PublicMember | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState("");
  const [audit, setAudit] = useState<AccessAudit[]>([]);
  const [form, setForm] = useState({
    id: "",
    email: "",
    name: "",
    role: "groomer",
    vanId: "",
    version: 0,
  });
  useEffect(() => {
    let alive = true;
    void fetch("/api/team", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as {
          audit: AccessAudit[];
          error: string;
          token?: string;
        };
        if (alive && r.ok) setAudit(data.audit);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  function edit(member: PublicMember | null) {
    setError("");
    setNotice("");
    setEditing(member);
    setAdding(!member);
    setForm(
      member
        ? { ...member }
        : {
            id: crypto.randomUUID(),
            email: "",
            name: "",
            role: "groomer",
            vanId: "",
            version: 0,
          },
    );
  }
  async function change(command: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setLink("");
    try {
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = (await r.json()) as {
        audit: AccessAudit[];
        error: string;
        token?: string;
      };
      if (!r.ok) throw Error(data.error);
      if (data.token)
        setLink(`${window.location.origin}/#equipo=${data.token}`);
      setAudit(data.audit);
      setNotice("Acceso guardado.");
      setAdding(false);
      setEditing(null);
      await onChange();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el acceso.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel team-access">
      <div className="section-row">
        <div>
          <h2>Accesos al negocio</h2>
          <p className="muted">Una agenda compartida para AL’AGUA DOGS.</p>
        </div>
        <Button disabled={busy} onClick={() => edit(null)}>
          Agregar integrante
        </Button>
      </div>
      <p className="muted">
        Administración gestiona agenda, clientes, cobros, costos y equipo. Cada
        bañador trabaja con sus citas asignadas, registra cobros e incidencias e
        inicia o termina los servicios.
      </p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      {link && (
        <div className="activation-link">
          <Label htmlFor="team-link">
            Enlace de activación · válido por 7 días
          </Label>
          <Input
            id="team-link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setNotice("Enlace copiado. Compártelo con esa persona.");
              } catch {
                setNotice("Selecciona y copia el enlace del campo.");
              }
            }}
          >
            Copiar enlace
          </Button>
          <small className="muted">
            Se muestra una sola vez. No se envía ningún correo desde el portal.
            La persona debe entrar con el correo registrado. Si cierras este
            aviso, puedes generar otro enlace.
          </small>
        </div>
      )}
      {(adding || editing) && (
        <form
          className="team-form"
          onSubmit={(e) => {
            e.preventDefault();
            void change({ type: "saveMember", member: form });
          }}
        >
          <div className="form-grid">
            <div className="field">
              <Label htmlFor="member-name">Nombre</Label>
              <Input
                id="member-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <Label htmlFor="member-email">Correo de acceso</Label>
              <Input
                id="member-email"
                required
                type="email"
                maxLength={254}
                disabled={!!editing}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <Label htmlFor="member-role">Permisos</Label>
              <select
                id="member-role"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value, vanId: "" })
                }
              >
                <option value="groomer">Bañador/a</option>
                <option value="admin">Administración / dueña</option>
              </select>
            </div>
            {form.role === "groomer" && (
              <div className="field">
                <Label htmlFor="member-van">Camioneta habitual</Label>
                <select
                  id="member-van"
                  value={form.vanId}
                  onChange={(e) => setForm({ ...form, vanId: e.target.value })}
                >
                  <option value="">Sin camioneta habitual</option>
                  {vans.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="muted">
            La camioneta habitual es una referencia. Asigna la cuenta del
            bañador en cada cita para que aparezca en su agenda.
          </p>
          <div className="button-row">
            <Button type="submit" disabled={busy}>
              {busy
                ? "Guardando…"
                : editing
                  ? "Guardar permisos"
                  : "Crear acceso y enlace"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cerrar
            </Button>
          </div>
        </form>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Integrante</TableHead>
            <TableHead>Permisos</TableHead>
            <TableHead>Camioneta habitual</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <b>{member.name}</b>
                <small className="cell-sub">{member.email}</small>
              </TableCell>
              <TableCell>{roleLabel(member.role)}</TableCell>
              <TableCell>
                {vans.find((v) => v.id === member.vanId)?.name || "—"}
              </TableCell>
              <TableCell>
                <span
                  className={`status ${member.status === "active" ? "done" : ""}`}
                >
                  {member.status === "active"
                    ? "Activo"
                    : member.status === "pending"
                      ? "Por activar"
                      : "Desactivado"}
                </span>
              </TableCell>
              <TableCell>
                {member.id === BOOTSTRAP_MEMBER_ID ? (
                  <small className="muted">
                    Administración inicial · protegida
                  </small>
                ) : (
                  <div className="button-row">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => edit(member)}
                    >
                      Editar
                    </Button>
                    {!member.activated && member.status !== "active" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          change({
                            type: "renewInvite",
                            id: member.id,
                            version: member.version,
                          })
                        }
                      >
                        Generar enlace
                      </Button>
                    )}
                    {member.status !== "inactive" && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          change({
                            type: "setMemberStatus",
                            id: member.id,
                            version: member.version,
                            active: false,
                          })
                        }
                      >
                        Desactivar
                      </Button>
                    )}
                    {member.activated && member.status === "inactive" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          change({
                            type: "setMemberStatus",
                            id: member.id,
                            version: member.version,
                            active: true,
                          })
                        }
                      >
                        Reactivar cuenta
                      </Button>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="footnote">
        Para entrar, cada persona debe iniciar sesión y verificar el correo de
        su invitación. Mantén los enlaces de activación privados. Desactivar una
        cuenta conserva su historial.
      </p>
      <h3>Historial de accesos</h3>
      {audit.map((entry, i) => (
        <div className="audit-item" key={`${entry.at}-${i}`}>
          <span>{entry.action}</span>
          <small>
            {new Date(entry.at).toLocaleString("es-MX", {
              timeZone: "America/Monterrey",
            })}{" "}
            · {entry.actor}
          </small>
        </div>
      ))}
      {!audit.length && (
        <p className="muted">
          Aquí aparecerán las altas y los cambios de permisos.
        </p>
      )}
    </section>
  );
}
