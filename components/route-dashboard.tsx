"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, ArrowUpRight, CircleAlert, RefreshCw } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  money,
  type Appointment,
  type Client,
  type State,
} from "@/lib/operations";
import {
  boardVisits,
  paymentMethods,
  routeCSV,
  summarizeVisits,
  vanLoads,
  weekDays,
  type BoardVisit,
  type RouteVisit,
} from "@/lib/route-history";

type Props = {
  s: State;
  history: RouteVisit[];
  view: "routes" | "weekly" | "transfers" | "payments";
  date: string;
  van: string;
  error: string;
  loading: boolean;
  onDate: (date: string) => void;
  onVan: (id: string) => void;
  onView: (view: string) => void;
  onReload: () => void;
  onAppointment: (appointment: Appointment) => void;
  onClient: (client: Client) => void;
  onSave: (
    record: RouteVisit,
    changes: Record<string, unknown>,
  ) => Promise<boolean>;
};
const shortDay = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const receiptLabel = (v: BoardVisit | RouteVisit) =>
  v.received === true
    ? "Recibido"
    : v.received === false
      ? "Pendiente de recibir"
      : "Por verificar";
function downloadRows(visits: BoardVisit[], state: State, date: string) {
  const url = URL.createObjectURL(
    new Blob([routeCSV(visits, state.vans)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `alagua-rutas-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
export function RouteDashboard(props: Props) {
  const { s, history, view, date, van, onView, onDate, onVan } = props;
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState<"pets" | "stops" | "amount">("pets");
  const [period, setPeriod] = useState("day");
  const [status, setStatus] = useState("all");
  const [linkStatus, setLinkStatus] = useState("all");
  const [editing, setEditing] = useState<RouteVisit | null>(null);
  const all = useMemo(() => boardVisits(s, history), [s, history]);
  const days = weekDays(date);
  const inWeek = all.filter(
    (v) => days.includes(v.date) && (van === "all" || v.vanId === van),
  );
  const dayRows = all.filter(
    (v) => v.date === date && (van === "all" || v.vanId === van),
  );
  const paymentRows = all.filter(
    (v) =>
      (view === "payments"
        ? v.kind === "history"
        : v.method === "Transferencia" &&
          (period === "week" ? days.includes(v.date) : v.date === date)) &&
      (van === "all" || v.vanId === van),
  );
  const sourceRows =
    view === "weekly" ? inWeek : view === "routes" ? dayRows : paymentRows;
  const visible = sourceRows.filter(
    (v) =>
      (!search ||
        [v.clientName, v.address, ...v.pets.map((p) => `${p.name} ${p.breed}`)]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(search.toLocaleLowerCase("es"))) &&
      (linkStatus !== "unlinked" || (v.kind === "history" && !v.clientId)) &&
      (status === "all" ||
        (status === "received"
          ? v.received === true
          : status === "pending"
            ? v.received === false
            : v.received === null)),
  );
  const summary = summarizeVisits(sourceRows);
  const loads = vanLoads(
    all.filter((v) => v.date === date),
    s.vans,
  );
  const maxLoad = Math.max(0, ...loads.map((v) => v.pets));
  const actualMin = loads.length ? Math.min(...loads.map((v) => v.pets)) : 0;
  const difference = maxLoad - actualMin;
  const weeklyTransfers = inWeek.filter((v) => v.method === "Transferencia");
  const receivedTransfers = weeklyTransfers.filter((v) => v.received === true);
  const pendingTransfers = weeklyTransfers.filter((v) => v.received !== true);
  const metricText = {
    pets: "Mascotas",
    stops: "Domicilios",
    amount: "Importe MXN",
  };

  const openRow = (v: BoardVisit) =>
    v.appointment ? props.onAppointment(v.appointment) : setEditing(v);
  return (
    <section
      className="route-dashboard"
      aria-label={
        view === "payments" ? "Cobros de rutas importadas" : "Tablero de rutas"
      }
    >
      {view !== "payments" && (
        <div className="rh-tabs" aria-label="Vistas de rutas">
          {(
            [
              ["routes", "Rutas del día"],
              ["weekly", "Resumen semanal"],
              ["transfers", "Transferencias"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={view === key ? "default" : "outline"}
              aria-pressed={view === key}
              onClick={() => onView(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {props.error && (
        <div role="alert" className="message error">
          <CircleAlert size={18} />
          <span>
            {props.error} El historial puede estar incompleto en esta vista.
          </span>
          <Button variant="outline" onClick={props.onReload}>
            Reintentar
          </Button>
        </div>
      )}
      {props.loading && (
        <p role="status" className="muted">
          Cargando historial de rutas…
        </p>
      )}
      <p className="footnote rh-origin">
        Agenda actual e historial importado comparten este tablero. Las visitas
        importadas conservan su domicilio y mascotas originales; sus horarios,
        servicios y costos no están confirmados. La importación es una copia del
        historial, sin sincronización automática con el portal anterior.{" "}
        {history.length} visitas importadas;{" "}
        {history.filter((v) => !v.clientId).length} por vincular con una ficha.
      </p>
      {view === "transfers" ? (
        <>
          <h2>
            Transferencias · {shortDay(days[0])} al {shortDay(days[6])}
          </h2>
          <div className="metrics">
            <Metric
              label="Pendientes de la semana"
              value={String(pendingTransfers.length)}
              note={
                money(summarizeVisits(pendingTransfers).toVerify) +
                " por confirmar"
              }
            />
            <Metric
              label="Recibidas de la semana"
              value={String(receivedTransfers.length)}
              note={
                money(summarizeVisits(receivedTransfers).received) +
                " confirmados"
              }
            />
            <Metric
              label="Total por transferencia"
              value={money(summarizeVisits(weeklyTransfers).amount)}
              note={`${weeklyTransfers.length} registros por fecha de servicio`}
            />
            <Metric
              label="Precios por capturar"
              value={String(summarizeVisits(weeklyTransfers).missingPrice)}
              note="Un importe pendiente no equivale a $0"
            />
          </div>
          <div className="rh-days">
            {days.map((d) => (
              <Button
                key={d}
                variant={date === d ? "default" : "outline"}
                onClick={() => onDate(d)}
              >
                {shortDay(d)}
              </Button>
            ))}
          </div>
          <div className="rh-tabs">
            <Button
              variant={period === "day" ? "default" : "outline"}
              aria-pressed={period === "day"}
              onClick={() => setPeriod("day")}
            >
              Día seleccionado
            </Button>
            <Button
              variant={period === "week" ? "default" : "outline"}
              aria-pressed={period === "week"}
              onClick={() => setPeriod("week")}
            >
              Semana completa
            </Button>
          </div>
        </>
      ) : (
        <div className="metrics">
          <Metric
            label={
              view === "weekly"
                ? "Mascotas de la semana"
                : "Mascotas programadas"
            }
            value={String(summary.pets)}
            note={`${summary.stops} visitas a domicilios`}
          />
          <Metric
            label="Importe registrado"
            value={money(summary.amount)}
            note={`${summary.missingPrice} visitas sin precio capturado`}
          />
          <Metric
            label="Cobros confirmados"
            value={money(summary.received)}
            note="Según registros y confirmaciones manuales"
          />
          <Metric
            label="Importe por verificar"
            value={money(summary.toVerify)}
            note="Incluye registros sin confirmación de cobro"
          />
        </div>
      )}
      {view === "routes" && (
        <section className="panel rh-loads">
          <div className="section-row">
            <div>
              <h2>Carga de las cuatro camionetas</h2>
              <p className="muted">
                {difference >= 3
                  ? `${difference} mascotas de diferencia entre la mayor y menor carga.`
                  : "Carga equilibrada por cantidad de mascotas."}
              </p>
            </div>
            <Button variant="ghost" onClick={() => onVan("all")}>
              Ver todas
            </Button>
          </div>
          <div className="rh-load-grid">
            {loads.map((v, i) => (
              <button
                className={`rh-load rh-van-${i}`}
                key={v.id}
                onClick={() => onVan(v.id)}
                aria-pressed={van === v.id}
              >
                <span>{v.name}</span>
                <strong>
                  {v.pets} <small>mascotas</small>
                </strong>
                <div className="rh-bar">
                  <span
                    style={{
                      width: `${maxLoad ? (v.pets / maxLoad) * 100 : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {v.stops} domicilios · {money(v.amount)}
                </small>
              </button>
            ))}
          </div>
          <p className="footnote">
            La carga se compara por mascotas. Antes de reasignar una visita,
            revisa la zona, el tipo de servicio y el tiempo disponible.
          </p>
        </section>
      )}
      {view === "weekly" ? (
        <section className="panel">
          <div className="section-row">
            <div>
              <h2>
                Semana del {shortDay(days[0])} al {shortDay(days[6])}
              </h2>
              <p className="muted">Selecciona una celda para abrir su ruta.</p>
            </div>
            <div className="rh-tabs">
              {(["pets", "stops", "amount"] as const).map((key) => (
                <Button
                  key={key}
                  variant={metric === key ? "default" : "outline"}
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                >
                  {metricText[key]}
                </Button>
              ))}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Día</TableHead>
                {s.vans
                  .filter((v) => van === "all" || v.id === van)
                  .map((v) => (
                    <TableHead key={v.id}>{v.name}</TableHead>
                  ))}
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((d) => (
                <TableRow key={d}>
                  <TableCell>
                    <b>{shortDay(d)}</b>
                  </TableCell>
                  {s.vans
                    .filter((v) => van === "all" || v.id === van)
                    .map((v) => {
                      const rows = inWeek.filter(
                        (row) => row.date === d && row.vanId === v.id,
                      );
                      const totals = summarizeVisits(rows);
                      return (
                        <TableCell key={v.id}>
                          <button
                            className="rh-week-cell"
                            onClick={() => {
                              onDate(d);
                              onVan(v.id);
                              onView("routes");
                            }}
                          >
                            <strong>
                              {metric === "amount"
                                ? money(totals.amount)
                                : totals[metric]}
                            </strong>
                            <small>
                              {totals.pets} mascotas · {totals.stops} domicilios
                            </small>
                            <small>
                              {totals.missingPrice
                                ? `${totals.missingPrice} sin precio`
                                : money(totals.amount)}
                            </small>
                          </button>
                        </TableCell>
                      );
                    })}
                  <TableCell>
                    <b>
                      {metric === "amount"
                        ? money(
                            summarizeVisits(inWeek.filter((v) => v.date === d))
                              .amount,
                          )
                        : summarizeVisits(inWeek.filter((v) => v.date === d))[
                            metric
                          ]}
                    </b>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <b>Total semanal</b>
                </TableCell>
                {s.vans
                  .filter((v) => van === "all" || v.id === van)
                  .map((v) => {
                    const totals = summarizeVisits(
                      inWeek.filter((row) => row.vanId === v.id),
                    );
                    return (
                      <TableCell key={v.id}>
                        <b>
                          {metric === "amount"
                            ? money(totals.amount)
                            : totals[metric]}
                        </b>
                      </TableCell>
                    );
                  })}
                <TableCell>
                  <b>
                    {metric === "amount"
                      ? money(summary.amount)
                      : summary[metric]}
                  </b>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="footnote">
            Los domicilios se cuentan por dirección, camioneta y día. Los
            importes se agrupan por fecha del servicio; la confirmación de cobro
            conserva su propia fecha.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="section-row">
            <div>
              <h2>
                {view === "routes"
                  ? "Domicilios de la ruta"
                  : view === "transfers"
                    ? "Control de transferencias"
                    : "Historial de cobros de rutas"}
              </h2>
              <p className="muted">
                {visible.length} registros · {summarizeVisits(visible).pets}{" "}
                mascotas
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!visible.length}
              onClick={() => downloadRows(visible, s, date)}
            >
              <Download size={16} /> Exportar CSV
            </Button>
          </div>
          <div className="rh-filters">
            <Input
              aria-label="Buscar en las rutas"
              placeholder="Cliente, mascota o domicilio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label>
              Estado de cobro
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="pending">Pendientes de recibir</option>
                <option value="received">Recibidos</option>
                <option value="unknown">Por verificar</option>
              </select>
            </label>
            <label>
              Ficha de cliente
              <select
                value={linkStatus}
                onChange={(e) => setLinkStatus(e.target.value)}
              >
                <option value="all">Todas las visitas</option>
                <option value="unlinked">Por vincular</option>
              </select>
            </label>
            <Button
              aria-label="Actualizar historial de rutas"
              variant="outline"
              onClick={props.onReload}
              disabled={props.loading}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha / cliente</TableHead>
                <TableHead>Mascotas</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Cobro</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible
                .sort(
                  (a, b) =>
                    a.date.localeCompare(b.date) ||
                    a.vanId.localeCompare(b.vanId) ||
                    (a.time || "").localeCompare(b.time || "") ||
                    a.order - b.order,
                )
                .map((v) => (
                  <TableRow key={v.kind + v.id}>
                    <TableCell>
                      <small className="cell-sub">
                        {shortDay(v.date)} · {v.time || "Horario no capturado"}
                      </small>
                      <b>{v.clientName}</b>
                      <small className="cell-sub">{v.address}</small>
                      {v.kind === "history" && !v.clientId && (
                        <small className="rh-warning">
                          Cliente por vincular
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.pets.map((p, i) => (
                        <div key={i}>
                          <b>{p.name}</b>
                          <small className="cell-sub">
                            {p.breed || "Raza por confirmar"}
                          </small>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      {s.vans.find((van) => van.id === v.vanId)?.name ||
                        v.sourceVan}
                      {v.sourceVan && (
                        <small className="cell-sub">
                          Origen: {v.sourceVan}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      <b>{v.price === null ? "Sin precio" : money(v.price)}</b>
                      {v.pets.length > 1 && (
                        <small className="cell-sub">Total de la visita</small>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.method}
                      <small
                        className={`cell-sub ${v.received ? "rh-received" : "rh-warning"}`}
                      >
                        {receiptLabel(v)}
                      </small>
                      {v.kind === "appointment" &&
                        v.paidAmount > 0 &&
                        !v.received && (
                          <small className="cell-sub">
                            Abonado: {money(v.paidAmount)}
                          </small>
                        )}
                      {v.confirmationNote && (
                        <small className="cell-sub">{v.confirmationNote}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" onClick={() => openRow(v)}>
                        {v.kind === "history" ? "Revisar" : "Ver cita"}
                        <ArrowUpRight size={15} />
                      </Button>
                      {v.clientId && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            const client = s.clients.find(
                              (c) => c.id === v.clientId,
                            );
                            if (client) props.onClient(client);
                          }}
                        >
                          Ficha
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!visible.length && (
            <p className="rh-empty">No hay registros para esta selección.</p>
          )}
          <p className="footnote">
            El método de pago y la recepción del dinero son datos distintos. Los
            registros de efectivo o tarjeta sin confirmación original se
            muestran por verificar.
          </p>
        </section>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="rh-dialog">
          <DialogHeader>
            <DialogTitle>Revisar visita importada</DialogTitle>
            <DialogDescription>
              Corrige el importe, vincula la ficha o confirma el cobro después
              de verificarlo.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <HistoryEditor
              key={editing.id + editing.revision}
              record={editing}
              s={s}
              onSave={async (changes) => {
                const saved = await props.onSave(editing, changes);
                if (saved) setEditing(null);
                return saved;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function HistoryEditor({
  record,
  s,
  onSave,
}: {
  record: RouteVisit;
  s: State;
  onSave: (changes: Record<string, unknown>) => Promise<boolean>;
}) {
  const [price, setPrice] = useState(
    record.price === null ? "" : (record.price / 100).toFixed(2),
  );
  const [method, setMethod] = useState(record.method);
  const [received, setReceived] = useState(record.received);
  const [clientId, setClient] = useState(record.clientId || "");
  const [vanId, setVan] = useState(record.vanId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cents = price === "" ? null : Math.round(Number(price) * 100);
  const changed = cents !== record.price || method !== record.method;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (
      price !== "" &&
      (!/^\d+(\.\d{1,2})?$/.test(price) ||
        !Number.isSafeInteger(cents) ||
        Number(cents) < 0)
    ) {
      setError("Indica un precio válido con hasta dos decimales.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (
        !(await onSave({
          price: cents,
          method,
          received,
          clientId: clientId || null,
          vanId,
        }))
      )
        setError(
          "No se pudo guardar. Si otra persona cambió la visita, cierra y vuelve a abrir su revisión para ver los datos actuales.",
        );
    } catch {
      setError("No se pudo guardar. Reintenta sin cerrar el formulario.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="rh-editor" onSubmit={submit}>
      <div>
        <h2>{record.clientName}</h2>
        <p>{record.address}</p>
        <p className="muted">
          {shortDay(record.date)} · {record.pets.map((p) => p.name).join(", ")}
        </p>
      </div>
      <label>
        Ficha de cliente
        <select value={clientId} onChange={(e) => setClient(e.target.value)}>
          <option value="">Sin vincular · conservar dato original</option>
          {s.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.address}
            </option>
          ))}
        </select>
      </label>
      <label>
        Camioneta
        <select value={vanId} onChange={(e) => setVan(e.target.value)}>
          {s.vans.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Importe total de la visita (MXN)
        <Input
          type="number"
          min="0"
          step="0.01"
          value={price}
          placeholder="Sin precio capturado"
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        Forma de pago
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as RouteVisit["method"])}
        >
          {paymentMethods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {changed ? (
        <p className="rh-warning" role="status">
          Al cambiar el importe o la forma de pago se reinicia la confirmación.
          Guarda y vuelve a revisar el cobro.
        </p>
      ) : (
        <label className="rh-checkbox">
          <input
            type="checkbox"
            checked={received === true}
            disabled={saving || cents === null || method === "Pendiente"}
            onChange={(e) => setReceived(e.target.checked)}
          />{" "}
          Confirmo que este pago fue recibido
        </label>
      )}
      {record.confirmationNote && (
        <p className="muted">
          Confirmación original: {record.confirmationNote}
        </p>
      )}
      <p className="footnote">
        Esta visita conserva el domicilio original y no crea una cita con
        horarios o servicios supuestos. Vincular una ficha no cambia los datos
        del cliente.
      </p>
      {error && (
        <p role="alert" className="rh-warning">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Guardando…" : "Guardar revisión"}
      </Button>
    </form>
  );
}
export function ClientRouteHistory({ visits }: { visits: RouteVisit[] }) {
  if (!visits.length) return null;
  return (
    <section className="rh-client-history">
      <h2>Rutas importadas</h2>
      <p className="muted">
        Estos registros conservan su importe por visita y su confirmación de
        cobro.
      </p>
      {[...visits]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((v) => (
          <div className="history-item" key={v.id}>
            <div>
              <b>
                {shortDay(v.date)} · {v.pets.map((p) => p.name).join(", ")}
              </b>
              <span>
                {v.sourceVan} · {v.method} · {receiptLabel(v)}
              </span>
              <small>{v.confirmationNote}</small>
            </div>
            <b>{v.price === null ? "Sin precio" : money(v.price)}</b>
          </div>
        ))}
    </section>
  );
}
