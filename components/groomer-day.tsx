"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  MapPin,
  Navigation,
  PawPrint,
  RefreshCw,
  ClipboardList,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AppearanceSelector } from "./appearance-provider";
import { AppInstall } from "./app-install";
import { ServiceCloseout } from "./service-closeout";
import {
  balance,
  paid,
  money,
  type State,
  type Appointment,
} from "@/lib/operations";
import { navigationURL, type SavedRoute } from "@/lib/saved-routes";
import type { RouteVisit } from "@/lib/route-history";
import { incidentCategories, type WorkdayCommand } from "@/lib/workday";
import type { Viewer } from "@/lib/team";

export type WorkdayData = { routes: SavedRoute[]; visits: RouteVisit[] };
type Props = {
  s: State;
  viewer: Viewer;
  date: string;
  data: WorkdayData;
  busy: boolean;
  error: string;
  notice: string;
  onRefresh: () => Promise<void>;
  onOpen: (kind: string, record?: object) => void;
  onSave: (
    command: Record<string, unknown> & { type: string },
  ) => Promise<boolean>;
  onWork: (input: WorkdayCommand) => Promise<boolean>;
  preview?: boolean;
};

export function GroomerDay({
  s,
  viewer,
  date,
  data,
  busy,
  error,
  notice,
  onRefresh,
  onOpen,
  onSave,
  onWork,
  preview = false,
}: Props) {
  const appointments = s.appointments.filter(
    (a) => a.date === date && a.status !== "Cancelado",
  );
  const order = data.routes
    .filter((r) => !r.stale)
    .flatMap((r) => r.stops.map((stop) => stop.id));
  const stops = [
    ...appointments.map((a) => ({
      id: a.id,
      appointment: a,
      visit: null as RouteVisit | null,
    })),
    ...data.visits.map((v) => ({
      id: v.id,
      appointment: null as Appointment | null,
      visit: v,
    })),
  ].sort((a, b) => {
    const x = order.indexOf(a.id),
      y = order.indexOf(b.id);
    return (
      (x < 0 ? 999 : x) - (y < 0 ? 999 : y) ||
      (a.appointment?.time || "").localeCompare(b.appointment?.time || "")
    );
  });
  const complete = stops.filter(
    (x) => (x.appointment?.status || x.visit?.workStatus) === "Completado",
  ).length;
  const next = stops.find(
    (x) => (x.appointment?.status || x.visit?.workStatus) !== "Completado",
  );
  const nextAddress = next?.appointment
    ? s.clients.find((c) => c.id === next.appointment!.clientId)?.address
    : next?.visit?.address;
  return (
    <main className="groomer-workspace">
      <fieldset
        className="groomer-preview-lock"
        disabled={preview}
        onClickCapture={
          preview
            ? (e) => {
                if ((e.target as Element).closest("a")) e.preventDefault();
              }
            : undefined
        }
      >
        <header className="groomer-header">
          <div className="groomer-brand">
            <Image
              unoptimized
              src="/app-icons/icon-192.png"
              alt="AL’AGUA DOGS"
              width={52}
              height={52}
            />
            <div>
              <strong>Mi día de trabajo</strong>
              <small>{viewer.name}</small>
            </div>
            <Link href="/sign-out">Salir</Link>
          </div>
          <div className="groomer-tools">
            <AppearanceSelector />
            <AppInstall />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar mi día"
              disabled={busy}
              onClick={() => void onRefresh()}
            >
              <RefreshCw size={18} />
            </Button>
          </div>
        </header>
        <div className="groomer-content">
          <p className="eyebrow">MI RUTA · MIS SERVICIOS</p>
          <h1>
            {new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h1>
          <p className="muted">
            {stops.length} servicios · {complete} terminados ·{" "}
            {stops.length - complete} por atender
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
          <section
            className="panel groomer-route"
            aria-label="Mi ruta publicada"
          >
            <h2>
              <Navigation size={20} /> Ruta a seguir
            </h2>
            {data.routes.some((r) => r.stale) && (
              <p className="message error" role="alert">
                La ruta cambió. Pide a Administración que revise y vuelva a
                publicar el recorrido.
              </p>
            )}
            {!data.routes.length && (
              <p className="muted">
                Administración todavía no ha publicado tu ruta de hoy. Las citas
                asignadas aparecen por horario.
              </p>
            )}
            {nextAddress && (
              <a
                className="saved-route-start"
                href={navigationURL(nextAddress)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={18} /> Cómo llegar al próximo servicio
              </a>
            )}
            {data.routes
              .filter((r) => !r.stale)
              .map((r) => (
                <details key={r.id}>
                  <summary>
                    {r.van} · {r.stops.length} paradas en orden
                  </summary>
                  <ol className="groomer-route-list">
                    {r.stops.map((stop) => (
                      <li key={stop.id}>
                        <strong>{stop.client}</strong>
                        <span>{stop.address}</span>
                        <a
                          href={navigationURL(stop.address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Cómo llegar
                        </a>
                      </li>
                    ))}
                  </ol>
                  <a
                    href={navigationURL(r.base)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Regresar a la base
                  </a>
                </details>
              ))}
          </section>
          <h2 className="groomer-services-title">Mis servicios de hoy</h2>
          {!stops.length && (
            <section className="panel groomer-empty">
              <PawPrint size={32} />
              <h2>Sin servicios asignados</h2>
              <p>
                Cuando Administración asigne tus citas o publique tu ruta,
                aparecerán aquí. No se muestran visitas de otros bañadores.
              </p>
            </section>
          )}
          <div className="groomer-service-list">
            {stops.map((item, index) => {
              const a = item.appointment,
                v = item.visit,
                c = s.clients.find(
                  (c) => c.id === (a?.clientId || v?.clientId),
                );
              const pet = a ? c?.pets.find((p) => p.id === a.petId) : null;
              const amount = a ? a.price : v!.price,
                received = a
                  ? paid(s, a.id)
                  : v!.received === true
                    ? v!.price || 0
                    : 0;
              const status = a?.status || v?.workStatus || "Confirmado";
              return (
                <article className="panel groomer-service" key={item.id}>
                  <header>
                    <span className="saved-route-number">{index + 1}</span>
                    <div>
                      <h2>
                        {a
                          ? pet?.name || "Mascota"
                          : v!.pets.map((p) => p.name).join(" · ")}
                      </h2>
                      <p className="muted">
                        {a
                          ? `${a.time} · ${s.services.find((x) => x.id === a.serviceId)?.name || "Servicio"} · ${a.duration} min`
                          : "Visita de ruta · horario por confirmar"}
                      </p>
                    </div>
                    <span
                      className={`status ${status === "Completado" ? "done" : status === "En servicio" ? "active" : ""}`}
                    >
                      {status}
                    </span>
                  </header>
                  <p className="groomer-customer">{c?.name || v?.clientName}</p>
                  <p className="groomer-address">
                    <MapPin size={17} />
                    {c?.address || v?.address}
                  </p>
                  {(pet?.notes || a?.notes || v?.notes) && (
                    <p className="info-note">
                      {[pet?.notes, a?.notes, v?.notes]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <div className="groomer-amounts">
                    <span>
                      Servicio{" "}
                      <b>
                        {amount === null
                          ? "Precio por confirmar"
                          : money(amount!)}
                      </b>
                    </span>
                    <span>
                      Recibido <b>{money(received)}</b>
                    </span>
                    <span>
                      Pendiente{" "}
                      <b>
                        {amount === null
                          ? "Por confirmar"
                          : money(Math.max(0, amount! - received))}
                      </b>
                    </span>
                  </div>
                  <div className="button-row">
                    {a && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => onOpen("detail", a)}
                        >
                          Ver servicio
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            onOpen("clientDetail", { id: a.clientId })
                          }
                        >
                          Ficha del cliente
                        </Button>
                        {a.status === "Confirmado" && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void onSave({
                                type: "status",
                                id: a.id,
                                status: "En servicio",
                              })
                            }
                          >
                            Iniciar servicio
                          </Button>
                        )}
                        {a.status === "En servicio" && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void onSave({
                                type: "status",
                                id: a.id,
                                status: "Completado",
                              })
                            }
                          >
                            Finalizar servicio
                          </Button>
                        )}
                        {balance(s, a) > 0 && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              onOpen("payment", { appointmentId: a.id })
                            }
                          >
                            <Wallet size={16} />
                            Registrar pago
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() =>
                            onOpen("incident", {
                              clientId: a.clientId,
                              appointmentId: a.id,
                            })
                          }
                        >
                          <ClipboardList size={16} />
                          Incidencia
                        </Button>
                        {a.status === "Completado" && (
                          <ServiceCloseout
                            target={{ kind: "appointment", id: a.id }}
                            label="Fotos, propina y cierre"
                          />
                        )}
                      </>
                    )}
                    {v && (
                      <HistoryTools
                        visit={v}
                        state={s}
                        busy={busy}
                        onOpen={onOpen}
                        onWork={onWork}
                        error={error}
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="muted groomer-contact-note">
            Si necesitas contactar al cliente, comunícate con Administración.
            Los teléfonos y correos de clientes no están disponibles en esta
            vista.
          </p>
        </div>
      </fieldset>
    </main>
  );
}

function HistoryTools({
  visit: v,
  state,
  busy,
  onOpen,
  onWork,
  error,
}: {
  visit: RouteVisit;
  state: State;
  busy: boolean;
  onOpen: Props["onOpen"];
  onWork: Props["onWork"];
  error: string;
}) {
  const [mode, setMode] = useState<"payment" | "incident" | "profile" | null>(
    null,
  );
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState<string>("Manejo de mascota");
  const [description, setDescription] = useState("");
  const [operationId, setOperationId] = useState("");
  const open = (next: typeof mode) => {
    setMode(next);
    setOperationId(crypto.randomUUID());
  };
  const incidents = state.incidents.filter((i) => i.routeVisitId === v.id);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input =
      mode === "payment"
        ? {
            action: "payment" as const,
            visitId: v.id,
            revision: v.revision,
            operationId,
            method: method as "Efectivo" | "Tarjeta" | "Transferencia",
          }
        : {
            action: "incident" as const,
            visitId: v.id,
            operationId,
            category: category as (typeof incidentCategories)[number],
            description,
          };
    if (await onWork(input)) {
      setMode(null);
      setDescription("");
      setMethod("");
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          v.clientId
            ? onOpen("clientDetail", { id: v.clientId })
            : open("profile")
        }
      >
        Ficha del cliente
      </Button>
      {!v.workStatus && (
        <Button
          disabled={busy}
          onClick={() =>
            void onWork({
              action: "status",
              visitId: v.id,
              status: "En servicio",
            })
          }
        >
          Iniciar servicio
        </Button>
      )}
      {v.workStatus === "En servicio" && (
        <Button
          disabled={busy}
          onClick={() =>
            void onWork({
              action: "status",
              visitId: v.id,
              status: "Completado",
            })
          }
        >
          Finalizar servicio
        </Button>
      )}
      {v.received !== true && (
        <Button
          variant="outline"
          disabled={busy || v.price === null}
          onClick={() => open("payment")}
        >
          <Wallet size={16} />
          Registrar cobro completo
        </Button>
      )}
      <Button variant="outline" onClick={() => open("incident")}>
        <ClipboardList size={16} />
        Incidencia{incidents.length ? ` (${incidents.length})` : ""}
      </Button>
      {v.workStatus === "Completado" && (
        <ServiceCloseout
          target={{ kind: "history", id: v.id }}
          label="Fotos, propina y cierre"
        />
      )}
      {v.price === null && (
        <p className="muted">
          Administración debe capturar el precio antes de registrar el cobro.
        </p>
      )}
      <Dialog
        open={!!mode}
        onOpenChange={(value) => {
          if (!value && !busy) setMode(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>
              {mode === "payment"
                ? "Registrar cobro completo"
                : mode === "incident"
                  ? "Incidencia de la visita"
                  : "Ficha de la visita"}
            </DialogTitle>
            <DialogDescription>
              {v.clientName} · {v.pets.map((p) => p.name).join(" · ")}
            </DialogDescription>
          </DialogHeader>
          {mode === "profile" ? (
            <>
              <p>{v.address}</p>
              <p>{v.notes}</p>
              {v.pets.map((p) => (
                <p key={p.name}>
                  {p.name} · {p.breed}
                </p>
              ))}
              <p className="muted">
                Administración tiene pendiente vincular esta visita con su
                ficha. Puedes trabajar en el servicio sin crear clientes
                duplicados.
              </p>
            </>
          ) : (
            <form className="editor-form" onSubmit={submit}>
              {error && (
                <p className="message error" role="alert">
                  {error}
                </p>
              )}
              {mode === "payment" ? (
                <>
                  <p>
                    Importe del servicio: <strong>{money(v.price || 0)}</strong>
                    . La propina se registra por separado en el cierre.
                  </p>
                  <label>
                    Forma de pago
                    <select
                      required
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="">Seleccionar</option>
                      {["Efectivo", "Tarjeta", "Transferencia"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    Registra aquí el cobro completo. Para anticipos o pagos
                    parciales de una visita de ruta, pide la conciliación a
                    Administración. Las transferencias quedan pendientes de
                    verificación.
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Categoría
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {incidentCategories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    ¿Qué ocurrió?
                    <textarea
                      required
                      maxLength={2000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  {incidents.map((i) => (
                    <p key={i.id}>
                      <strong>{i.category}:</strong> {i.description}
                    </p>
                  ))}
                </>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar registro"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
