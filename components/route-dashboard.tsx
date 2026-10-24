"use client";

import { useMemo, useState } from "react";
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
  today,
  type Appointment,
  type Client,
  type State,
} from "@/lib/operations";
import {
  boardVisits,
  routeCSV,
  summarizeVisits,
  vanLoads,
  weeklyDashboard,
  type BoardVisit,
  type RouteVisit,
} from "@/lib/route-history";
import { RouteCapture, RouteVisitEditor } from "@/components/route-capture";
import { ServiceCloseout } from "@/components/service-closeout";
import {
  RoutePriceDialog,
  type SaveRoutePrice,
} from "@/components/route-price-editor";

type Props = {
  s: State;
  history: RouteVisit[];
  view: "routes" | "weekly" | "transfers" | "payments";
  date: string;
  van: string;
  error: string;
  loading: boolean;
  reception?: boolean;
  onManage: (body: Record<string, unknown>) => Promise<boolean>;
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
  const [metric, setMetric] = useState<
    "visits" | "pets" | "stops" | "amount" | "received"
  >("visits");
  const [period, setPeriod] = useState("day");
  const [status, setStatus] = useState("all");
  const [linkStatus, setLinkStatus] = useState("all");
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<RouteVisit | null>(null);
  const [priceEditing, setPriceEditing] = useState<RouteVisit | null>(null);
  const all = useMemo(() => boardVisits(s, history), [s, history]);
  const weekly = useMemo(
    () => weeklyDashboard(all, s.vans, date, van),
    [all, s.vans, date, van],
  );
  const { days, rows: inWeek } = weekly;
  const dayRows = all.filter(
    (v) => v.date === date && (van === "all" || v.vanId === van),
  );
  const paymentRows = all.filter(
    (v) =>
      (view === "payments"
        ? v.kind === "history"
        : v.method === "Transferencia" &&
          (period === "all" ||
            (period === "week" ? days.includes(v.date) : v.date === date))) &&
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
            ? v.method === "Transferencia"
              ? v.received !== true
              : v.received === false
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
  const weeklyTransfers = paymentRows.filter(
    (v) => v.method === "Transferencia",
  );
  const elapsed = summarizeVisits(inWeek.filter((v) => v.date <= today()));
  const future = summarizeVisits(inWeek.filter((v) => v.date > today()));
  const receivedTransfers = weeklyTransfers.filter((v) => v.received === true);
  const pendingTransfers = weeklyTransfers.filter((v) => v.received !== true);
  const metricText = {
    visits: "Citas y visitas",
    pets: "Mascotas",
    stops: "Domicilios",
    amount: "Importe registrado",
    received: "Ingresos confirmados",
  };
  const metricValue = (totals: ReturnType<typeof summarizeVisits>) =>
    metric === "amount" || metric === "received"
      ? money(totals[metric])
      : totals[metric];
  const missingPrices = inWeek.filter((v) => v.price === null);
  const maxWeeklyIncome = Math.max(0, ...weekly.byVan.map((v) => v.received));

  const openRow = (v: BoardVisit) =>
    v.appointment ? props.onAppointment(v.appointment) : setEditing(v);
  return (
    <section
      className="route-dashboard"
      aria-label={view === "payments" ? "Cobros de rutas" : "Tablero de rutas"}
    >
      {view !== "payments" && !props.reception && (
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
      {!props.reception && (
        <>
          <div className="button-row">
            {(view === "routes" || view === "weekly") && (
              <RouteCapture
                s={s}
                history={history}
                date={date}
                van={van}
                onImported={props.onReload}
              />
            )}
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL("/transferencias", window.location.origin).href,
                  );
                  setCopied(true);
                } catch {
                  setLocalError(
                    "Copia este enlace: " +
                      new URL("/transferencias", window.location.origin).href,
                  );
                }
              }}
            >
              {copied ? "Enlace copiado" : "Copiar enlace para Recepción"}
            </Button>
            {view === "routes" && (
              <Button
                variant="ghost"
                onClick={() => setShowArchive(!showArchive)}
              >
                Archivo ({history.filter((v) => v.deletedAt).length})
              </Button>
            )}
          </div>
          <p className="footnote rh-origin">
            Agenda y rutas utilizan los mismos registros en las vistas de
            operación, cobros y estadísticas.{" "}
            {
              history.filter((v) => !v.deletedAt && v.origin !== "captured")
                .length
            }{" "}
            visitas históricas importadas y{" "}
            {
              history.filter((v) => !v.deletedAt && v.origin === "captured")
                .length
            }{" "}
            capturadas aquí;{" "}
            {history.filter((v) => !v.deletedAt && !v.clientId).length} por
            vincular con una ficha. Las rutas sin horario no sustituyen citas
            con hora confirmada.
          </p>
        </>
      )}
      {localError && (
        <p role="alert" className="message error">
          {localError}
        </p>
      )}
      {props.reception && (
        <p className="footnote">
          Acceso de Recepción: consulta y marca transferencias después de
          revisar el comprobante. No hay conexión bancaria ni verificación
          automática de WhatsApp.
        </p>
      )}
      {view === "transfers" ? (
        <>
          <h2>
            Transferencias ·{" "}
            {period === "all"
              ? "todo el historial"
              : period === "week"
                ? `${shortDay(days[0])} al ${shortDay(days[6])}`
                : shortDay(date)}
          </h2>
          <div className="metrics">
            <Metric
              label="Pendientes del periodo"
              value={String(pendingTransfers.length)}
              note={
                money(summarizeVisits(pendingTransfers).toVerify) +
                " por confirmar"
              }
            />
            <Metric
              label="Recibidas del periodo"
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
            <Button
              variant={period === "all" ? "default" : "outline"}
              aria-pressed={period === "all"}
              onClick={() => {
                setPeriod("all");
              }}
            >
              Todo el historial
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPeriod("all");
                setStatus("pending");
              }}
            >
              Ver todos los pendientes
            </Button>
          </div>
        </>
      ) : (
        <div className="metrics">
          <Metric
            label={
              view === "weekly"
                ? "Citas y visitas de la semana"
                : "Mascotas programadas"
            }
            value={String(view === "weekly" ? summary.visits : summary.pets)}
            note={
              view === "weekly"
                ? `${summary.appointments} citas con horario · ${summary.routeVisits} visitas de ruta · ${summary.pets} mascotas`
                : `${summary.stops} visitas a domicilios`
            }
          />
          <Metric
            label="Importe registrado"
            value={money(summary.amount)}
            note={`${summary.missingPrice} visitas sin precio capturado`}
          />
          <Metric
            label={
              view === "weekly" ? "Ingresos confirmados" : "Cobros confirmados"
            }
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
      {view === "weekly" && (
        <>
          <section className="panel rh-week-overview">
            <div className="section-row">
              <div>
                <h2>
                  Las cuatro camionetas · semana del {shortDay(days[0])} al{" "}
                  {shortDay(days[6])}
                </h2>
                <p className="muted">
                  Selecciona una camioneta para filtrar los indicadores y el
                  detalle diario.
                </p>
              </div>
              <Button
                variant="outline"
                aria-pressed={van === "all"}
                onClick={() => onVan("all")}
              >
                Todas las camionetas
              </Button>
            </div>
            <div className="rh-load-grid">
              {weekly.byVan.map((v, i) => (
                <button
                  type="button"
                  className={`rh-load rh-van-${i} rh-week-van`}
                  key={v.id}
                  aria-pressed={van === v.id}
                  aria-label={`Ver semana de ${v.name}`}
                  onClick={() => onVan(v.id)}
                >
                  <b>{v.name}</b>
                  <strong>
                    {v.visits} <small>citas y visitas</small>
                  </strong>
                  <small>
                    {v.appointments} con horario · {v.routeVisits} de ruta ·{" "}
                    {v.pets} mascotas
                  </small>
                  <span className="rh-week-income">{money(v.received)}</span>
                  <small>Ingresos confirmados</small>
                  <div className="rh-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${maxWeeklyIncome ? (v.received / maxWeeklyIncome) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>Registrado: {money(v.amount)}</small>
                  <small>Por cobrar / verificar: {money(v.toVerify)}</small>
                  <small>{v.missingPrice} precios pendientes</small>
                </button>
              ))}
            </div>
            <p className="footnote">
              Los ingresos son cobros confirmados de las visitas de esta semana,
              agrupados por fecha del servicio. El importe registrado incluye
              precios aún no cobrados; las propinas se conservan por separado.
              Las visitas sin precio no se consideran gratuitas.
            </p>
          </section>
          <div className="metrics capture-week-metrics">
            <Metric
              label="Acumulado hasta hoy"
              value={money(elapsed.amount)}
              note={`${elapsed.pets} mascotas · ${elapsed.missingPrice} visitas sin precio`}
            />
            <Metric
              label="Días futuros"
              value={money(future.amount)}
              note={`${future.pets} mascotas · ${future.missingPrice} visitas sin precio`}
            />
            <Metric
              label="Servicios adicionales"
              value={String(summary.additional)}
              note="No incrementan el conteo de servicios completos"
            />
          </div>
        </>
      )}
      {summary.unclassified > 0 && !props.reception && (
        <p className="footnote">
          {summary.unclassified} mascotas tienen servicios por clasificar. Se
          conservan sus conteos anteriores hasta que se revisen; los adicionales
          identificados se cuentan aparte.
        </p>
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
                  {v.stops} domicilios · {v.additional} adicionales ·{" "}
                  {money(v.amount)}
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
              {(["visits", "pets", "stops", "amount", "received"] as const).map(
                (key) => (
                  <Button
                    key={key}
                    variant={metric === key ? "default" : "outline"}
                    aria-pressed={metric === key}
                    onClick={() => setMetric(key)}
                  >
                    {metricText[key]}
                  </Button>
                ),
              )}
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
                <TableRow
                  key={d}
                  className={
                    d > today()
                      ? "capture-future-day"
                      : d === today()
                        ? "capture-today"
                        : ""
                  }
                >
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
                            <strong>{metricValue(totals)}</strong>
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
                      {metricValue(
                        summarizeVisits(inWeek.filter((v) => v.date === d)),
                      )}
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
                        <b>{metricValue(totals)}</b>
                      </TableCell>
                    );
                  })}
                <TableCell>
                  <b>{metricValue(summary)}</b>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="footnote">
            Los domicilios se cuentan por dirección, camioneta y día. Los
            importes se agrupan por fecha del servicio; la confirmación de cobro
            conserva su propia fecha.
          </p>
          <Button
            variant="outline"
            disabled={!inWeek.length}
            onClick={() => downloadRows(inWeek, s, days[0])}
          >
            <Download size={16} /> Exportar visitas de la semana
          </Button>
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
            {!props.reception && (
              <>
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
              </>
            )}
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
                      {!props.reception &&
                        v.kind === "history" &&
                        !v.clientId && (
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
                            {(p.quantity ?? 1) > 1
                              ? ` · ${p.quantity} mascotas`
                              : ""}
                            {p.services?.map((service, j) => (
                              <span className="cell-sub" key={j}>
                                {service.name} ·{" "}
                                {service.kind === "additional"
                                  ? `${service.quantity} adicional(es)`
                                  : service.kind === "full"
                                    ? "Completo"
                                    : "Por clasificar"}
                              </span>
                            ))}
                          </small>
                        </div>
                      ))}
                      {v.extras?.map((extra, i) => (
                        <small className="cell-sub" key={i}>
                          {extra.quantity} × {extra.name} · adicional
                        </small>
                      ))}
                      {v.notes && <small className="cell-sub">{v.notes}</small>}
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
                      {!props.reception && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`${v.price === null ? "Capturar" : "Editar"} precio de ${v.clientName} el ${v.date}`}
                          onClick={() =>
                            v.kind === "history"
                              ? setPriceEditing(v)
                              : props.onAppointment(v.appointment!)
                          }
                        >
                          {v.price === null
                            ? "Capturar precio"
                            : "Editar precio"}
                        </Button>
                      )}
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
                      {v.kind === "history" &&
                        v.method !== "Pendiente" &&
                        (!props.reception || v.method === "Transferencia") && (
                          <label className="rh-checkbox">
                            <input
                              type="checkbox"
                              aria-label={`Pago recibido de ${v.clientName} el ${v.date}`}
                              checked={v.received === true}
                              disabled={
                                receiptBusy !== null || v.price === null
                              }
                              onChange={async (e) => {
                                const received = e.target.checked;
                                setReceiptBusy(v.id);
                                setLocalError("");
                                try {
                                  const changes = props.reception
                                    ? { received }
                                    : {
                                        price: v.price,
                                        method: v.method,
                                        received,
                                        clientId: v.clientId,
                                        vanId: v.vanId,
                                      };
                                  if (!(await props.onSave(v, changes)))
                                    setLocalError(
                                      "No se pudo actualizar el cobro. Revisa el aviso y actualiza antes de intentar otra vez.",
                                    );
                                } finally {
                                  setReceiptBusy(null);
                                }
                              }}
                            />{" "}
                            Recibido
                          </label>
                        )}
                      {v.confirmedBy && (
                        <small className="cell-sub">
                          Confirmó {v.confirmedBy}
                          {v.confirmedAt
                            ? ` · ${new Date(v.confirmedAt).toLocaleString("es-MX")}`
                            : ""}
                        </small>
                      )}
                      {v.receiptUpdatedBy && v.received !== true && (
                        <small className="cell-sub">
                          Último cambio: {v.receiptUpdatedBy}
                          {v.receiptUpdatedAt
                            ? ` · ${new Date(v.receiptUpdatedAt).toLocaleString("es-MX")}`
                            : ""}
                        </small>
                      )}
                      {v.confirmationNote && (
                        <small className="cell-sub">{v.confirmationNote}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      {!props.reception && (
                        <Button variant="ghost" onClick={() => openRow(v)}>
                          {v.kind === "history" ? "Revisar" : "Ver cita"}
                          <ArrowUpRight size={15} />
                        </Button>
                      )}
                      {!props.reception && v.kind === "history" && (
                        <ServiceCloseout
                          target={{ kind: "history", id: v.id }}
                        />
                      )}
                      {!props.reception && v.clientId && (
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
      {view === "weekly" && (
        <section className="panel rh-week-prices">
          <h2>Precios pendientes de la semana ({missingPrices.length})</h2>
          <p className="muted">
            {van === "all"
              ? "Todas las camionetas"
              : s.vans.find((v) => v.id === van)?.name}
            . Administración puede capturar el importe total de cada visita.
          </p>
          {missingPrices.length ? (
            missingPrices
              .toSorted(
                (a, b) =>
                  a.date.localeCompare(b.date) ||
                  a.vanId.localeCompare(b.vanId) ||
                  a.order - b.order,
              )
              .map((v) => (
                <div key={v.kind + v.id} className="rh-pending-price">
                  <div>
                    <b>{v.clientName}</b>
                    <span>
                      {shortDay(v.date)} ·{" "}
                      {s.vans.find((x) => x.id === v.vanId)?.name} ·{" "}
                      {v.pets.map((p) => p.name).join(", ")}
                    </span>
                    <small>{v.address}</small>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Capturar precio de ${v.clientName} el ${v.date}`}
                    onClick={() =>
                      v.kind === "history"
                        ? setPriceEditing(v)
                        : props.onAppointment(v.appointment!)
                    }
                  >
                    Capturar precio
                  </Button>
                </div>
              ))
          ) : (
            <p>No hay precios pendientes para esta selección.</p>
          )}
        </section>
      )}
      {showArchive && !props.reception && (
        <section className="panel">
          <h2>Archivo recuperable</h2>
          <p>
            Las visitas retiradas no participan en los totales. Se conservan sus
            datos y cobros.
          </p>
          {history
            .filter((v) => v.deletedAt)
            .map((v) => (
              <div className="capture-archived" key={v.id}>
                <div>
                  <b>
                    {v.clientName} · {shortDay(v.date)}
                  </b>
                  <p>{v.address}</p>
                  <small>
                    Retiró {v.deletedBy || "Administración"} ·{" "}
                    {v.deletedAt &&
                      new Date(v.deletedAt).toLocaleString("es-MX")}
                  </small>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (
                      !(await props.onManage({
                        action: "restore",
                        id: v.id,
                        revision: v.revision,
                      }))
                    )
                      setLocalError(
                        "No se pudo restaurar. Actualiza antes de intentar otra vez.",
                      );
                  }}
                >
                  Restaurar visita
                </Button>
              </div>
            ))}
        </section>
      )}
      {!props.reception && (
        <RoutePriceDialog
          record={priceEditing}
          onClose={() => setPriceEditing(null)}
          onSave={props.onSave}
        />
      )}
      <Dialog
        open={!!editing && !props.reception}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="rh-dialog">
          <DialogHeader>
            <DialogTitle>Revisar visita de ruta</DialogTitle>
            <DialogDescription>
              Corrige el importe, vincula la ficha o confirma el cobro después
              de verificarlo.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <RouteVisitEditor
              key={editing.id + editing.revision}
              record={editing}
              s={s}
              onAction={async (body) => {
                const saved = await props.onManage(body);
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
export function ClientRouteHistory({
  visits,
  onSave,
}: {
  visits: RouteVisit[];
  onSave?: SaveRoutePrice;
}) {
  const [priceEditing, setPriceEditing] = useState<RouteVisit | null>(null);
  visits = visits.filter((v) => !v.deletedAt);
  if (!visits.length) return null;
  return (
    <section className="rh-client-history">
      <h2>Visitas de rutas</h2>
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
            <div className="rh-history-price">
              <b>{v.price === null ? "Sin precio" : money(v.price)}</b>
              {onSave && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${v.price === null ? "Capturar" : "Editar"} precio de ${v.clientName} el ${v.date}`}
                  onClick={() => setPriceEditing(v)}
                >
                  {v.price === null ? "Capturar precio" : "Editar precio"}
                </Button>
              )}
            </div>
          </div>
        ))}
      {onSave && (
        <RoutePriceDialog
          record={priceEditing}
          onClose={() => setPriceEditing(null)}
          onSave={onSave}
        />
      )}
    </section>
  );
}
