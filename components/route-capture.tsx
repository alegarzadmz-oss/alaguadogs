"use client";
import { useState } from "react";
import { Plus, ClipboardPaste, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  duplicateVisits,
  parseRouteText,
  toCaptureInput,
  vanLabel,
  validateCapture,
  type CaptureInput,
  type CaptureRow,
} from "@/lib/route-capture";
import {
  classifyService,
  paymentMethods,
  serviceCounts,
  type RouteService,
  type RouteVisit,
} from "@/lib/route-history";
import type { State } from "@/lib/operations";

export function VisitFields({
  value,
  onChange,
  s,
}: {
  value: CaptureInput;
  onChange: (v: CaptureInput) => void;
  s: State;
}) {
  const edit = <K extends keyof CaptureInput>(key: K, next: CaptureInput[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="capture-fields">
      <div className="capture-two">
        <label>
          Fecha del servicio
          <Input
            type="date"
            value={value.date}
            onChange={(e) => edit("date", e.target.value)}
            required
          />
        </label>
        <label>
          Camioneta
          <select
            value={value.vanId}
            onChange={(e) => edit("vanId", e.target.value)}
          >
            {s.vans.map((v) => (
              <option key={v.id} value={v.id}>
                {vanLabel(v.id)} · {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Cliente
        <Input
          value={value.clientName}
          maxLength={160}
          placeholder="Nombre por confirmar"
          onChange={(e) => edit("clientName", e.target.value)}
        />
      </label>
      <label>
        Domicilio y referencias
        <textarea
          value={value.address}
          rows={2}
          maxLength={600}
          placeholder="Domicilio por confirmar"
          onChange={(e) => edit("address", e.target.value)}
        />
      </label>
      <label>
        Vincular con una ficha existente
        <select
          value={value.clientId || ""}
          onChange={(e) => edit("clientId", e.target.value || null)}
        >
          <option value="">
            Sin vincular · conservar los datos de esta visita
          </option>
          {s.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.address}
            </option>
          ))}
        </select>
      </label>
      {value.clientId && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const c = s.clients.find((c) => c.id === value.clientId);
            if (c)
              onChange({ ...value, clientName: c.name, address: c.address });
          }}
        >
          Usar nombre y domicilio de la ficha
        </Button>
      )}
      <div className="section-row">
        <h3>Mascotas y servicios</h3>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            edit("pets", [
              ...value.pets,
              {
                name: "Nombre por confirmar",
                breed: "",
                quantity: 1,
                services: [],
              },
            ])
          }
        >
          <Plus size={14} /> Mascota
        </Button>
      </div>
      {!value.pets.length && (
        <p className="rh-warning">
          Mascotas pendientes: no se supuso ninguna cantidad.
        </p>
      )}
      {value.pets.map((pet, i) => (
        <fieldset className="capture-pet" key={i}>
          <legend>Mascota {i + 1}</legend>
          <div className="capture-two">
            <label>
              Nombre
              <Input
                value={pet.name}
                maxLength={120}
                onChange={(e) =>
                  edit(
                    "pets",
                    value.pets.map((p, j) =>
                      j === i ? { ...p, name: e.target.value } : p,
                    ),
                  )
                }
              />
            </label>
            <label>
              Raza
              <Input
                value={pet.breed}
                maxLength={160}
                placeholder="Por confirmar"
                onChange={(e) =>
                  edit(
                    "pets",
                    value.pets.map((p, j) =>
                      j === i ? { ...p, breed: e.target.value } : p,
                    ),
                  )
                }
              />
            </label>
          </div>
          <label>
            Cantidad de mascotas de este grupo
            <Input
              type="number"
              min={1}
              max={100}
              value={pet.quantity ?? 1}
              onChange={(e) =>
                edit(
                  "pets",
                  value.pets.map((p, j) =>
                    j === i ? { ...p, quantity: Number(e.target.value) } : p,
                  ),
                )
              }
            />
          </label>
          <ServiceFields
            values={pet.services || []}
            onChange={(services) =>
              edit(
                "pets",
                value.pets.map((p, j) => (j === i ? { ...p, services } : p)),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              edit(
                "pets",
                value.pets.filter((_, j) => j !== i),
              )
            }
          >
            Quitar mascota de esta visita
          </Button>
        </fieldset>
      ))}
      <fieldset className="capture-pet">
        <legend>Adicionales del domicilio</legend>
        <p className="footnote">
          Por ejemplo, cuatro cortes de uñas. Se conservan sin contarlos como
          cuatro baños o cortes completos.
        </p>
        <ServiceFields
          extras
          values={value.extras}
          onChange={(v) => edit("extras", v)}
        />
      </fieldset>
      <div className="capture-two">
        <label>
          Importe total de la visita (MXN)
          <Input
            type="number"
            min={0}
            step="0.01"
            value={value.price === null ? "" : value.price / 100}
            placeholder="Pendiente"
            onChange={(e) =>
              edit(
                "price",
                e.target.value === ""
                  ? null
                  : Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
        <label>
          Forma de pago
          <select
            value={value.method}
            onChange={(e) =>
              edit("method", e.target.value as CaptureInput["method"])
            }
          >
            {paymentMethods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Observaciones
        <textarea
          value={value.notes}
          maxLength={4000}
          rows={3}
          onChange={(e) => edit("notes", e.target.value)}
        />
      </label>
    </div>
  );
}
function ServiceFields({
  values,
  onChange,
  extras = false,
}: {
  values: RouteService[];
  onChange: (v: RouteService[]) => void;
  extras?: boolean;
}) {
  return (
    <div className="capture-services">
      {!values.length && !extras && (
        <p className="footnote">Servicio por confirmar.</p>
      )}
      {values.map((service, i) => (
        <div className="capture-service" key={i}>
          <label>
            Servicio
            <Input
              value={service.name}
              maxLength={160}
              placeholder={extras ? "Corte de uñas" : "Baño, corte…"}
              onChange={(e) =>
                onChange(
                  values.map((s, j) =>
                    j === i
                      ? {
                          ...s,
                          name: e.target.value,
                          kind: extras
                            ? "additional"
                            : classifyService(e.target.value),
                        }
                      : s,
                  ),
                )
              }
            />
          </label>
          <label>
            Cuenta como
            <select
              value={service.kind}
              onChange={(e) =>
                onChange(
                  values.map((s, j) =>
                    j === i
                      ? { ...s, kind: e.target.value as RouteService["kind"] }
                      : s,
                  ),
                )
              }
            >
              {!extras && <option value="full">Servicio completo</option>}
              <option value="additional">Adicional</option>
              {!extras && <option value="unknown">Por clasificar</option>}
            </select>
          </label>
          <label>
            Cantidad
            <Input
              type="number"
              min={1}
              max={100}
              value={service.quantity}
              onChange={(e) =>
                onChange(
                  values.map((s, j) =>
                    j === i ? { ...s, quantity: Number(e.target.value) } : s,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            aria-label={`Quitar servicio ${service.name || i + 1}`}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...values,
            {
              name: extras ? "Corte de uñas" : "Servicio por confirmar",
              kind: extras ? "additional" : "unknown",
              quantity: 1,
            },
          ])
        }
      >
        <Plus size={14} /> {extras ? "Agregar adicional" : "Agregar servicio"}
      </Button>
    </div>
  );
}
type Preview = {
  visit: CaptureRow;
  include: boolean;
  duplicateConfirmed: boolean;
};
export function RouteCapture({
  s,
  history,
  date,
  van,
  onImported,
  onEditing,
}: {
  s: State;
  history: RouteVisit[];
  date: string;
  van: string;
  onImported: () => void;
  onEditing?: (editing: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          onEditing?.(true);
        }}
      >
        <ClipboardPaste size={16} /> Pegar o capturar ruta
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          onEditing?.(v);
        }}
      >
        <DialogContent className="capture-dialog">
          <DialogHeader>
            <DialogTitle>Agregar visitas a la ruta</DialogTitle>
            <DialogDescription>
              Pega la lista que ya utilizas o captura una visita. Revisa los
              datos antes de guardar.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <CaptureForm
              s={s}
              history={history}
              date={date}
              van={van}
              onDone={() => {
                setOpen(false);
                onEditing?.(false);
                onImported();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function CaptureForm({
  s,
  history,
  date,
  van,
  onDone,
}: {
  s: State;
  history: RouteVisit[];
  date: string;
  van: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState({
    date,
    vanId: van === "all" ? s.vans[0]?.id || "v1" : van,
  });
  const [preview, setPreview] = useState<Preview[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  function setRows(rows: CaptureRow[]) {
    setPreview(
      rows.map((visit, index) => ({
        visit,
        include: !duplicateVisits(visit, [...history, ...rows.slice(0, index)])
          .length,
        duplicateConfirmed: false,
      })),
    );
    setOperationId(crypto.randomUUID());
    setReviewed(false);
    setError("");
  }
  const matchesFor = (index: number) =>
    duplicateVisits(preview[index].visit, [
      ...history,
      ...preview
        .slice(0, index)
        .filter((p) => p.include)
        .map((p) => p.visit),
    ]);
  const included = preview.filter((p) => p.include);
  const duplicates = preview.some(
    (p, index) =>
      p.include && matchesFor(index).length && !p.duplicateConfirmed,
  );
  async function submit() {
    if (busy || !included.length || !reviewed || duplicates) return;
    setError("");
    let rows;
    try {
      rows = included.map((p) => ({
        visit: validateCapture(toCaptureInput(p.visit), s),
        duplicateConfirmed: p.duplicateConfirmed,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa los datos.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/route-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId, sourceText: text, rows }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "No se pudo importar.");
      onDone();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Conserva la vista previa para reintentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="capture-form">
      <div className="capture-two">
        <label>
          Fecha si la lista no la incluye
          <Input
            type="date"
            value={defaults.date}
            onChange={(e) => setDefaults({ ...defaults, date: e.target.value })}
          />
        </label>
        <label>
          Camioneta si la lista no la incluye
          <select
            value={defaults.vanId}
            onChange={(e) =>
              setDefaults({ ...defaults, vanId: e.target.value })
            }
          >
            {s.vans.map((v) => (
              <option key={v.id} value={v.id}>
                {vanLabel(v.id)} · {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Lista de rutas
        <textarea
          className="capture-source"
          value={text}
          maxLength={60000}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Viernes 23 de octubre — VAN C\nCliente Ejemplo\nCalle Ejemplo 123, Colonia Centro\nLuna — bichón — baño\nMax — criollo — corte\n4 cortes de uñas adicionales\nObservación: avisar cuando vayan en camino"
          }
        />
      </label>
      <div className="button-row">
        <Button
          disabled={busy || !text.trim()}
          onClick={() => {
            try {
              const rows = parseRouteText(
                text,
                defaults.date,
                defaults.vanId,
                s,
              );
              if (!rows.length)
                throw Error(
                  "No se identificaron visitas; usa la captura manual o revisa la lista.",
                );
              setRows(rows);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Revisa el texto.");
            }
          }}
        >
          Interpretar y revisar lista
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setRows([
              {
                ...defaults,
                clientId: null,
                clientName: "",
                address: "",
                pets: [],
                extras: [],
                notes: "",
                price: null,
                method: "Pendiente",
                warnings: [],
              },
            ])
          }
        >
          Captura manual
        </Button>
      </div>
      {!!preview.length && (
        <>
          <div className="capture-summary">
            <strong>Vista previa · {preview.length} visitas</strong>
            <p>
              {included.reduce((n, p) => n + serviceCounts(p.visit).full, 0)}{" "}
              mascotas con servicio completo o por clasificar ·{" "}
              {included.reduce(
                (n, p) => n + serviceCounts(p.visit).additional,
                0,
              )}{" "}
              adicionales
            </p>
            <small>
              Las fichas de clientes no se crean ni se fusionan al importar. Una
              visita sin precio conserva el importe pendiente.
            </small>
          </div>
          {preview.map((row, i) => {
            const matches = matchesFor(i);
            return (
              <section className="capture-preview" key={i}>
                <label className="rh-checkbox">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) =>
                      setPreview(
                        preview.map((p, j) =>
                          j === i ? { ...p, include: e.target.checked } : p,
                        ),
                      )
                    }
                  />{" "}
                  Incluir visita {i + 1} ·{" "}
                  {row.visit.clientName || "Cliente por confirmar"}
                </label>
                {!!matches.length && (
                  <div className="capture-warning">
                    <CircleAlert size={16} />
                    <div>
                      Posible repetido: ya existe una visita del mismo día con
                      cliente, domicilio y mascotas coincidentes (
                      {matches.map((m) => vanLabel(m.vanId)).join(", ")}).
                      <label className="rh-checkbox">
                        <input
                          type="checkbox"
                          checked={row.duplicateConfirmed}
                          onChange={(e) =>
                            setPreview(
                              preview.map((p, j) =>
                                j === i
                                  ? {
                                      ...p,
                                      duplicateConfirmed: e.target.checked,
                                    }
                                  : p,
                              ),
                            )
                          }
                        />{" "}
                        Revisé la coincidencia y esta es otra visita que sí debe
                        agregarse.
                      </label>
                    </div>
                  </div>
                )}
                {row.visit.warnings.length > 0 && (
                  <p className="rh-warning">
                    {[...new Set(row.visit.warnings)].join(" ")}
                  </p>
                )}
                <details open={i === 0}>
                  <summary>
                    Revisar fecha, domicilio, mascotas, servicios y cobro
                  </summary>
                  <VisitFields
                    value={row.visit}
                    s={s}
                    onChange={(visit) =>
                      setPreview(
                        preview.map((p, j) =>
                          j === i
                            ? {
                                ...p,
                                visit: { ...visit, warnings: p.visit.warnings },
                              }
                            : p,
                        ),
                      )
                    }
                  />
                </details>
              </section>
            );
          })}
          <label className="rh-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy}
            />{" "}
            Revisé fechas, camionetas, mascotas y campos que quedan pendientes.
          </label>
          <Button
            disabled={busy || !included.length || !reviewed || duplicates}
            onClick={() => void submit()}
          >
            {busy
              ? "Guardando…"
              : `Confirmar e importar ${included.length} visitas`}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </div>
  );
}
export function RouteVisitEditor({
  record,
  s,
  onAction,
}: {
  record: RouteVisit;
  s: State;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [value, setValue] = useState(() => toCaptureInput(record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  async function run(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        !(await onAction({ id: record.id, revision: record.revision, ...body }))
      )
        setError(
          "No se pudo guardar. Actualiza si otra persona cambió la visita.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="rh-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const visit = validateCapture(value, s);
          void run({ action: "details", visit });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Revisa los datos.");
        }
      }}
    >
      <VisitFields s={s} value={value} onChange={setValue} />
      <p className="footnote">
        Esta visita conserva su captura original y no cambia la ficha maestra
        del cliente. La confirmación del cobro se cambia con la casilla de la
        tabla; editar importe o método reinicia esa confirmación.
      </p>
      {record.confirmedAt && (
        <p className="muted">
          Cobro confirmado por{" "}
          {record.confirmedBy || "Recepción en el sistema de origen"} ·{" "}
          {new Date(record.confirmedAt).toLocaleString("es-MX")}
        </p>
      )}
      <Button disabled={busy} type="submit">
        {busy ? "Guardando…" : "Guardar visita"}
      </Button>
      <div className="capture-archive">
        <h3>Retirar esta visita de la ruta</h3>
        <p>
          Dejará de contar en rutas y totales. La captura y el cobro se
          conservarán en el archivo y podrás restaurarla.
        </p>
        <label className="rh-checkbox">
          <input
            type="checkbox"
            checked={deleteConfirmed}
            onChange={(e) => setDeleteConfirmed(e.target.checked)}
          />{" "}
          Confirmo que deseo retirarla
          {record.received ? " aunque tiene un cobro recibido" : ""}.
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !deleteConfirmed}
          onClick={() =>
            void run({ action: "archive", confirmReceived: deleteConfirmed })
          }
        >
          Retirar de la ruta y conservar en archivo
        </Button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </form>
  );
}
