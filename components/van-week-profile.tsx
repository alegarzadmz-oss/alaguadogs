"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { RouteVisitEditor } from "@/components/route-capture";
import {
  RoutePriceDialog,
  type SaveRoutePrice,
} from "@/components/route-price-editor";
import { ServiceCloseout } from "@/components/service-closeout";
import { SavedRoutes } from "@/components/saved-routes";
import {
  money,
  type State,
  type Van,
  type Client,
  type Appointment,
} from "@/lib/operations";
import { vanWeekDetail } from "@/lib/van-week";
import type { BoardVisit, RouteVisit } from "@/lib/route-history";

const dayLabel = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const paymentLabel = (row: BoardVisit) =>
  row.price === null
    ? "Precio pendiente"
    : row.kind === "appointment" &&
        row.paidAmount > 0 &&
        row.paidAmount < row.price
      ? "Abono parcial"
      : row.received === true
        ? "Recibido"
        : row.received === false
          ? "Pendiente de recibir"
          : "Por verificar";

type Props = {
  s: State;
  visits: BoardVisit[];
  van: Van;
  date: string;
  loading: boolean;
  error: string;
  onBack: () => void;
  onReload: () => void;
  onVan: (id: string) => void;
  onRoute: (date: string) => void;
  onClient: (client: Client) => void;
  onAppointment: (appointment: Appointment) => void;
  onSave: SaveRoutePrice;
  onManage: (body: Record<string, unknown>) => Promise<boolean>;
  onExport: (visits: BoardVisit[]) => void;
};

export function VanWeekProfile(props: Props) {
  const profileRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    profileRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  const { s, van, date } = props;
  const detail = useMemo(
    () => vanWeekDetail(s, props.visits, date, van.id),
    [s, props.visits, date, van.id],
  );
  const [tab, setTab] = useState("visits");
  const [paymentFilter, setPaymentFilter] = useState("pending");
  const [editing, setEditing] = useState<RouteVisit | null>(null);
  const [priceEditing, setPriceEditing] = useState<RouteVisit | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const openVisit = (row: BoardVisit) =>
    row.appointment ? props.onAppointment(row.appointment) : setEditing(row);
  const openPrice = (row: BoardVisit) =>
    row.appointment
      ? props.onAppointment(row.appointment)
      : setPriceEditing(row);
  const { summary } = detail;
  const methodLabel = (row: BoardVisit) =>
    row.kind === "history"
      ? row.method
      : [
          ...new Set(
            detail.paymentsByAppointment
              .get(row.id)
              ?.map((payment) => payment.method) || [],
          ),
        ].join(" / ") || "Sin pago registrado";
  return (
    <section
      ref={profileRef}
      className="route-dashboard van-week-profile"
      aria-label={`Ficha semanal de ${van.name}`}
    >
      <div className="button-row">
        <Button variant="outline" onClick={props.onBack}>
          <ArrowLeft size={16} /> Volver al resumen semanal
        </Button>
        <label className="van-week-select">
          VAN de la ficha
          <select value={van.id} onChange={(e) => props.onVan(e.target.value)}>
            {s.vans.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={!detail.rows.length}
          onClick={() => props.onExport(detail.rows)}
        >
          <Download size={16} /> Exportar ficha semanal
        </Button>
      </div>
      <header className="panel van-week-header">
        <p className="eyebrow">FICHA SEMANAL DE OPERACIÓN</p>
        <h2 ref={headingRef} tabIndex={-1}>
          {van.name} · {dayLabel(detail.days[0])} al {dayLabel(detail.days[6])}
        </h2>
        <p>
          Bañador habitual: <strong>{van.groomer || "Por asignar"}</strong>
        </p>
        {van.notes && <p className="muted">{van.notes}</p>}
        <p className="muted">
          Toda la operación de esta VAN en la semana seleccionada. Puedes
          cambiar de semana con los controles de fecha de arriba.
        </p>
      </header>
      {props.loading && (
        <p role="status">Actualizando las visitas de la VAN…</p>
      )}
      {props.error && (
        <div role="alert" className="message error">
          {props.error} El historial puede estar incompleto.{" "}
          <Button variant="outline" onClick={props.onReload}>
            Reintentar
          </Button>
        </div>
      )}
      {saveError && (
        <p role="alert" className="message error">
          {saveError}
        </p>
      )}
      <div className="metrics">
        <ProfileMetric
          label="Citas y visitas"
          value={String(summary.visits)}
          note={`${summary.appointments} citas con horario · ${summary.routeVisits} visitas de ruta · ${summary.pets} mascotas`}
        />
        <ProfileMetric
          label="Clientes con ficha"
          value={String(detail.clients.length)}
          note={`${detail.unlinked.length} visitas por vincular`}
        />
        <ProfileMetric
          label="Ingresos confirmados"
          value={money(summary.received)}
          note={`${money(summary.amount)} de importe registrado`}
        />
        <ProfileMetric
          label="Por cobrar / verificar"
          value={money(summary.toVerify)}
          note={`${detail.pending.length} visitas por revisar · ${summary.missingPrice} sin precio`}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="van-week-tabs">
        <TabsList aria-label="Secciones de la ficha semanal">
          <TabsTrigger value="visits">
            Citas y visitas ({summary.visits})
          </TabsTrigger>
          <TabsTrigger value="clients">
            Clientes ({detail.clients.length})
          </TabsTrigger>
          <TabsTrigger value="routes">Rutas por día</TabsTrigger>
          <TabsTrigger value="payments">
            Ingresos y pagos pendientes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="visits">
          <section className="panel van-week-section">
            <h3>Citas y visitas de la semana</h3>
            <p className="muted">
              Las citas muestran su horario y estado. Las visitas de ruta
              conservan el orden registrado y los datos pendientes.
            </p>
            {detail.rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día / hora</TableHead>
                    <TableHead>Cliente y mascotas</TableHead>
                    <TableHead>Domicilio / servicio</TableHead>
                    <TableHead>Importe y cobro</TableHead>
                    <TableHead>Revisar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.rows.map((row) => (
                    <TableRow key={row.kind + row.id}>
                      <TableCell>
                        <b>{dayLabel(row.date)}</b>
                        <span className="cell-sub">
                          {row.time || "Sin horario capturado"}
                        </span>
                        <span className="cell-sub">
                          {row.appointment?.status || "Visita de ruta"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <b>{row.clientName}</b>
                        <span className="cell-sub">
                          {row.pets.map((p) => p.name).join(", ")}
                        </span>
                        {!row.clientId && (
                          <small className="rh-warning">
                            Cliente por vincular
                          </small>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.address}
                        <span className="cell-sub">
                          {row.pets
                            .flatMap(
                              (p) =>
                                p.services?.map((service) => service.name) ||
                                [],
                            )
                            .join(" · ") || "Servicio por clasificar"}
                        </span>
                        {row.notes && (
                          <small className="cell-sub">{row.notes}</small>
                        )}
                      </TableCell>
                      <TableCell>
                        <b>
                          {row.price === null ? "Sin precio" : money(row.price)}
                        </b>
                        <span className="cell-sub">
                          {methodLabel(row)} · {paymentLabel(row)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`${row.price === null ? "Capturar" : "Editar"} precio de ${row.clientName} el ${row.date}`}
                          onClick={() => openPrice(row)}
                        >
                          {row.price === null
                            ? "Capturar precio"
                            : "Editar precio"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openVisit(row)}
                        >
                          {row.appointment ? "Ver cita" : "Revisar visita"}
                        </Button>
                        {row.clientId &&
                          s.clients.some((c) => c.id === row.clientId) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                props.onClient(
                                  s.clients.find((c) => c.id === row.clientId)!,
                                )
                              }
                            >
                              Ficha del cliente
                            </Button>
                          )}
                        {row.kind === "history" && (
                          <ServiceCloseout
                            target={{ kind: "history", id: row.id }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p>No hay citas ni visitas para esta VAN en esta semana.</p>
            )}
          </section>
        </TabsContent>
        <TabsContent value="clients">
          <section className="panel van-week-section">
            <h3>Clientes de la semana</h3>
            {detail.clients.map(({ client, rows, summary: totals }) => (
              <article className="van-week-client" key={client.id}>
                <div>
                  <h4>{client.name}</h4>
                  <p>
                    {rows.length} visitas ·{" "}
                    {rows
                      .flatMap((row) => row.pets.map((p) => p.name))
                      .filter((name, i, names) => names.indexOf(name) === i)
                      .join(", ")}
                  </p>
                  <small>
                    Registrado: {money(totals.amount)} · Recibido:{" "}
                    {money(totals.received)} · Por cobrar / verificar:{" "}
                    {money(totals.toVerify)}
                    {totals.missingPrice
                      ? ` · ${totals.missingPrice} sin precio`
                      : ""}
                  </small>
                </div>
                <Button
                  variant="outline"
                  onClick={() => props.onClient(client)}
                >
                  Abrir ficha de {client.name}
                </Button>
              </article>
            ))}
            {!detail.clients.length && (
              <p>No hay clientes vinculados a una ficha en esta selección.</p>
            )}
            {!!detail.unlinked.length && (
              <>
                <h3>
                  Visitas con cliente por vincular ({detail.unlinked.length})
                </h3>
                <p className="muted">
                  Se conservan por separado hasta que Administración revise la
                  identidad.
                </p>
                {detail.unlinked.map((row) => (
                  <div className="van-week-client" key={row.kind + row.id}>
                    <div>
                      <b>{row.clientName}</b>
                      <p>
                        {dayLabel(row.date)} · {row.address}
                      </p>
                      <small>{row.pets.map((p) => p.name).join(", ")}</small>
                    </div>
                    <Button variant="outline" onClick={() => openVisit(row)}>
                      Revisar cliente de la visita
                    </Button>
                  </div>
                ))}
              </>
            )}
          </section>
        </TabsContent>
        <TabsContent value="routes">
          <SavedRoutes
            from={detail.days[0]}
            to={detail.days[6]}
            vanId={van.id}
          />
          <section className="panel van-week-section">
            <h3>Rutas de lunes a domingo</h3>
            <p className="muted">
              Las visitas sin horario conservan su orden registrado. Las citas
              con hora se muestran antes; revisa el orden operativo cuando haya
              ambos tipos.
            </p>
            {detail.byDay.map((day) => (
              <article className="van-week-day" key={day.day}>
                <div className="section-row">
                  <div>
                    <h4>{dayLabel(day.day)}</h4>
                    <p>
                      {day.visits} citas y visitas · {day.stops} domicilios ·{" "}
                      {money(day.received)} confirmados
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => props.onRoute(day.day)}
                  >
                    Abrir ruta del {dayLabel(day.day)}
                  </Button>
                </div>
                {day.visits ? (
                  <ol>
                    {detail.rows
                      .filter((row) => row.date === day.day)
                      .map((row) => (
                        <li key={row.kind + row.id}>
                          <div>
                            <b>
                              {row.time ||
                                `Orden ${row.order || "por confirmar"}`}{" "}
                              · {row.clientName}
                            </b>
                            <p>{row.address}</p>
                            <small>
                              {row.pets.map((p) => p.name).join(", ")}
                            </small>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openVisit(row)}
                          >
                            Revisar visita
                          </Button>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="muted">Sin visitas registradas.</p>
                )}
              </article>
            ))}
          </section>
        </TabsContent>
        <TabsContent value="payments">
          <section className="panel van-week-section">
            <h3>Ingresos confirmados por forma de pago</h3>
            <p className="muted">
              Cobros de las visitas de esta semana, agrupados por fecha del
              servicio. Las propinas se registran por separado.
            </p>
            <dl className="van-week-methods">
              {detail.incomeByMethod.map((item) => (
                <div key={item.method}>
                  <dt>{item.method}</dt>
                  <dd>{money(item.amount)}</dd>
                </div>
              ))}
            </dl>
            {!detail.incomeByMethod.length && (
              <p>No hay ingresos confirmados para esta selección.</p>
            )}
            <div className="section-row">
              <h3>Pagos de la semana</h3>
              <label className="van-week-select">
                Estado de pago
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="pending">
                    Pendientes y por verificar ({detail.pending.length})
                  </option>
                  <option value="all">Todos los pagos</option>
                </select>
              </label>
            </div>
            <p className="footnote">
              Los importes sin confirmar requieren revisión; su estado no
              acredita por sí solo una deuda del cliente. Capturar precio no
              confirma el pago.
            </p>
            {(paymentFilter === "pending" ? detail.pending : detail.rows).map(
              (row) => (
                <article className="van-week-payment" key={row.kind + row.id}>
                  <div>
                    <b>
                      {row.clientName} · {dayLabel(row.date)}
                    </b>
                    <p>
                      {row.pets.map((p) => p.name).join(", ")} ·{" "}
                      {methodLabel(row)}
                    </p>
                    <span
                      className={
                        row.received === true && row.price !== null
                          ? "rh-received"
                          : "rh-warning"
                      }
                    >
                      {paymentLabel(row)}
                    </span>
                    <p>
                      Precio:{" "}
                      {row.price === null ? "Sin precio" : money(row.price)} ·
                      Confirmado:{" "}
                      {row.price === null
                        ? "Importe por confirmar"
                        : money(row.paidAmount)}{" "}
                      · Por cobrar / verificar:{" "}
                      {row.price === null
                        ? "Importe por confirmar"
                        : money(Math.max(0, row.price - row.paidAmount))}
                    </p>
                    {detail.paymentsByAppointment
                      .get(row.id)
                      ?.map((payment) => (
                        <p className="footnote" key={payment.id}>
                          {new Date(payment.date).toLocaleString("es-MX", {
                            timeZone: "America/Monterrey",
                          })}{" "}
                          · {money(payment.amount)} · {payment.method}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </p>
                      ))}
                    {(row.confirmedBy || row.confirmedAt) && (
                      <small>
                        Confirmó {row.confirmedBy || "Registro original"}
                        {row.confirmedAt
                          ? ` · ${new Date(row.confirmedAt).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`
                          : ""}
                      </small>
                    )}
                  </div>
                  <div className="button-row">
                    {row.kind === "history" && row.method !== "Pendiente" && (
                      <label className="rh-checkbox">
                        <input
                          type="checkbox"
                          aria-label={`Pago recibido de ${row.clientName} el ${row.date}`}
                          checked={row.received === true}
                          disabled={receiptBusy !== null || row.price === null}
                          onChange={async (e) => {
                            const received = e.target.checked;
                            setReceiptBusy(row.id);
                            setSaveError("");
                            try {
                              if (
                                !(await props.onSave(row, {
                                  price: row.price,
                                  method: row.method,
                                  received,
                                  clientId: row.clientId,
                                  vanId: row.vanId,
                                }))
                              )
                                setSaveError(
                                  "No se pudo confirmar el cambio. Actualiza si otra persona modificó la visita.",
                                );
                            } catch {
                              setSaveError(
                                "No se pudo guardar la confirmación del cobro.",
                              );
                            } finally {
                              setReceiptBusy(null);
                            }
                          }}
                        />{" "}
                        Pago recibido
                      </label>
                    )}
                    <Button variant="outline" onClick={() => openPrice(row)}>
                      {row.price === null ? "Capturar precio" : "Editar precio"}
                    </Button>
                    <Button variant="outline" onClick={() => openVisit(row)}>
                      Revisar cobro
                    </Button>
                  </div>
                </article>
              ),
            )}
            {!(paymentFilter === "pending" ? detail.pending : detail.rows)
              .length && <p>No hay pagos pendientes para esta selección.</p>}
          </section>
        </TabsContent>
      </Tabs>
      <RoutePriceDialog
        record={priceEditing}
        onClose={() => setPriceEditing(null)}
        onSave={props.onSave}
      />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="rh-dialog">
          <DialogHeader>
            <DialogTitle>Revisar visita de ruta</DialogTitle>
            <DialogDescription>
              Revisa los datos de esta visita de {van.name}.
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

function ProfileMetric({
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
