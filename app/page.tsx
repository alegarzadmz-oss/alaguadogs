"use client";
import Link from "next/link";
import { useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import {
  PawPrint,
  CalendarDays,
  Truck,
  Users,
  Wallet,
  ChartNoAxesCombined,
  ClipboardList,
  Plus,
  ArrowUpRight,
  Clock3,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  Settings2,
  Navigation,
  RefreshCw,
  CircleAlert,
  Droplets,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  demoState,
  today,
  money,
  minute,
  timeLabel,
  balance,
  paid,
  clientBalance,
  routeProposal,
  type State,
  type Appointment,
  type Client,
  type Command,
} from "@/lib/operations";
import { TeamAccess } from "@/components/team-access";
import { roleLabel, type TeamContext, type PublicMember } from "@/lib/team";
const blankState = (): State => ({
  ...demoState(),
  clients: [],
  appointments: [],
  payments: [],
  incidents: [],
  audit: [],
  operations: [],
});
const views = [
  { id: "agenda", label: "Agenda del día", icon: CalendarDays },
  { id: "routes", label: "Camionetas y rutas", icon: Truck },
  { id: "clients", label: "Clientes y mascotas", icon: Users },
  { id: "payments", label: "Pagos y saldos", icon: Wallet },
  { id: "analytics", label: "Rentabilidad", icon: ChartNoAxesCombined },
  { id: "incidents", label: "Incidencias", icon: ClipboardList },
  { id: "settings", label: "Equipo y servicios", icon: Settings2 },
];
type Modal = { kind: string; record?: any };
const uid = () => crypto.randomUUID();
const dateText = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const addDay = (date: string, n: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <Label>{label}</Label>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
function NavigationMenu({
  view,
  onView,
  items,
}: {
  view: string;
  onView: (v: string) => void;
  items: typeof views;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((v) => (
        <SidebarMenuItem key={v.id}>
          <SidebarMenuButton
            isActive={view === v.id}
            onClick={() => {
              onView(v.id);
              setOpenMobile(false);
            }}
          >
            <v.icon />
            <span>{v.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
export default function Home() {
  const [s, setS] = useState<State>(blankState);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [chosenView, setView] = useState("agenda");
  const [date, setDate] = useState(today);
  const [van, setVan] = useState("all");
  const [mode, setMode] = useState("day");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [paymentTab, setPaymentTab] = useState("pending");
  const [team, setTeam] = useState<TeamContext | null>(null);
  const [joinToken, setJoinToken] = useState("");
  const requestNumber = useRef(0);
  const admin = team?.viewer.role === "admin";
  const view =
    !admin && ["analytics", "settings"].includes(chosenView)
      ? "agenda"
      : chosenView;
  const allowedViews = views.filter(
    (v) => admin || !["analytics", "settings"].includes(v.id),
  );
  function denyAccess() {
    setReady(false);
    setTeam(null);
    setS(blankState());
    setModal(null);
  }
  async function refresh() {
    const ticket = ++requestNumber.current;
    setError("");
    try {
      const r = await fetch("/api/operations", { cache: "no-store" });
      const d = (await r.json()) as {
        state: State;
        revision: number;
        team: TeamContext;
        error: string;
        signIn?: boolean;
      };
      if (ticket !== requestNumber.current) return;
      if (!r.ok) {
        setSignIn(!!d.signIn);
        if (r.status === 401 || r.status === 403) denyAccess();
        throw Error(d.error);
      }
      setS(d.state);
      setRevision(d.revision);
      setTeam(d.team);
      setReady(true);
      setSignIn(false);
    } catch (e) {
      if (ticket === requestNumber.current)
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los datos.",
        );
    }
  }
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "equipo",
    );
    queueMicrotask(() => {
      if (token) setJoinToken(token);
      void refresh();
    });
  }, []);
  useEffect(() => {
    if (!ready || busy || modal) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [ready, busy, modal]);
  async function activate() {
    if (busy) return;
    setBusy(true);
    setError("");
    ++requestNumber.current;
    try {
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "activate", token: joinToken }),
      });
      const d = (await r.json()) as { error: string; signIn?: boolean };
      if (!r.ok) {
        setSignIn(!!d.signIn);
        throw Error(d.error);
      }
      setJoinToken("");
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      await refresh();
      setNotice("Tu acceso al equipo está activo.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo activar el acceso.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(command: Command, operationId = uid()) {
    if (!ready || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    ++requestNumber.current;
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, command, operationId }),
      });
      const d = (await r.json()) as {
        state: State;
        revision: number;
        team: TeamContext;
        error: string;
        signIn?: boolean;
      };
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          await refresh();
        }
        throw Error(d.error);
      }
      setS(d.state);
      setRevision(d.revision);
      setTeam(d.team);
      setNotice("Cambios guardados.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "open_operations_view",
      title: "Abrir una sección del portal",
      description:
        "Abre una sección visible y opcionalmente selecciona la fecha de agenda. No modifica registros.",
      inputSchema: {
        type: "object",
        properties: {
          view: { type: "string", enum: allowedViews.map((v) => v.id) },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input: any) => {
        if (
          !input ||
          Object.keys(input).some((k) => !["view", "date"].includes(k)) ||
          !allowedViews.some((v) => v.id === input.view)
        )
          throw Error("Sección inválida.");
        if (
          input.date &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
            !Number.isFinite(Date.parse(input.date)))
        )
          throw Error("Fecha inválida.");
        setView(input.view);
        if (input.date) setDate(input.date);
        return { view: input.view, date: input.date || date };
      },
    };
    try {
      Promise.resolve(
        ctx.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [date, admin]);
  const open = (kind: string, record?: any) => {
    if (!ready) return;
    if (
      !admin &&
      [
        "appointment",
        "client",
        "outcome",
        "resolve",
        "van",
        "service",
        "base",
        "route",
        "clearDemo",
      ].includes(kind)
    )
      return;
    setError("");
    setModal({ kind, record });
  };
  const active = s.appointments.filter(
    (a) => a.date === date && a.status !== "Cancelado",
  );
  const filtered = active.filter((a) => van === "all" || a.vanId === van);
  const due = active.reduce((n, a) => n + balance(s, a), 0);
  const total = active.reduce((n, a) => n + a.price, 0);
  const cn = (id: string) => s.clients.find((c) => c.id === id);
  const pet = (a: Appointment) =>
    cn(a.clientId)?.pets.find((p) => p.id === a.petId);
  const service = (id: string) => s.services.find((v) => v.id === id)?.name;
  const pending = s.appointments
    .filter((a) => balance(s, a) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const vanList = van === "all" ? s.vans : s.vans.filter((v) => v.id === van);
  const dayPayments = s.payments.filter(
    (p) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
      }).format(new Date(p.date)) === date,
  );
  const details = (a: Appointment) => open("detail", a);
  const card = (a: Appointment) => (
    <button className="job-card" key={a.id} onClick={() => details(a)}>
      <div className="job-top">
        <b>
          {a.time}{" "}
          <span className="end-time">
            – {timeLabel(minute(a.time) + a.duration)}
          </span>
        </b>
        <span
          className={`status ${a.status === "Completado" ? "done" : a.status === "En servicio" ? "active" : ""}`}
        >
          {a.status}
        </span>
      </div>
      <div className="pet-name">
        <PawPrint size={18} />
        {pet(a)?.name}
      </div>
      <p>{service(a.serviceId)}</p>
      <p className="customer">
        {cn(a.clientId)?.name} · {cn(a.clientId)?.zone || "Sin zona"}
      </p>
      <div className="job-bottom">
        <span>
          <Clock3 size={14} />
          {a.duration} min
        </span>
        <span>
          {money(a.price)}
          <ArrowUpRight size={15} />
        </span>
      </div>
      {a.actualMinutes !== undefined && (
        <small className="actual-time">
          Tiempo real: {a.actualMinutes} min
        </small>
      )}
    </button>
  );
  const signInLink =
    "/sign-in?redirect_url=" +
    encodeURIComponent("/" + (joinToken ? "#equipo=" + joinToken : ""));
  if (!ready)
    return (
      <main className="access-page">
        <section className="panel access-card">
          <img
            src="/brand/alagua-dogs-logo.jpg"
            alt="AL’AGUA DOGS · Pets Spa"
            width={180}
            height={180}
          />
          <p className="eyebrow">ESPACIO DEL EQUIPO</p>
          <h1>{joinToken ? "Activa tu acceso" : "AL’AGUA DOGS"}</h1>
          <p className="muted">
            {joinToken
              ? "Entra con el correo registrado por administración y activa tu cuenta para trabajar en la agenda compartida."
              : "Inicia sesión con una cuenta del equipo. Si aún no tienes acceso, solicita a administración tu enlace de activación."}
          </p>
          {error && (
            <p role="alert" className="message error">
              {error}
            </p>
          )}
          <div className="button-row">
            {signIn && (
              <Button asChild>
                <Link href={signInLink} target="_top">
                  Iniciar sesión
                </Link>
              </Button>
            )}
            {joinToken && !signIn && (
              <Button disabled={busy} onClick={activate}>
                {busy ? "Activando…" : "Activar mi acceso"}
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={refresh}>
              Actualizar
            </Button>
            {!signIn && (
              <Link href="/sign-out" target="_top">
                Cambiar de cuenta
              </Link>
            )}
          </div>
        </section>
      </main>
    );
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <img
              className="brand-logo"
              src="/brand/alagua-dogs-logo.jpg"
              alt="AL’AGUA DOGS · Pets Spa"
              width={447}
              height={447}
            />
            <small>OPERACIÓN A DOMICILIO</small>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">MI NEGOCIO</p>
          <NavigationMenu
            items={allowedViews}
            view={view}
            onView={(v) => {
              setView(v);
              setSearch("");
            }}
          />
          <div className="sidebar-note">
            <Droplets size={22} />
            <p>
              Su bienestar,
              <br />
              <b>en cada visita.</b>
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="owners">
            <span>{team?.viewer.name.slice(0, 2).toUpperCase()}</span>
            <div>
              {team?.viewer.name}
              <small>{team && roleLabel(team.viewer.role)}</small>
              <Link href="/sign-out" target="_top">
                Cerrar sesión
              </Link>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="inline">
            <SidebarTrigger />
            <img
              className="mobile-brand-logo"
              src="/brand/alagua-dogs-logo.jpg"
              alt="AL’AGUA DOGS"
              width={447}
              height={447}
            />
            <span>Centro de operaciones</span>
          </div>
          <div className="inline">
            <span className="preview-label">
              {s.demo
                ? "Primera versión · Datos de ejemplo"
                : admin
                  ? "Agenda compartida"
                  : "Mis citas asignadas"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              aria-label="Actualizar datos"
              disabled={busy}
            >
              <RefreshCw size={17} />
            </Button>
          </div>
        </header>
        <div className="page">
          {error && (
            <div role="alert" className="message error">
              <CircleAlert size={19} />
              <div>
                {error}
                {signIn && (
                  <Link href="/sign-in?redirect_url=/" target="_top">
                    Iniciar sesión
                  </Link>
                )}
              </div>
              <Button variant="outline" onClick={refresh}>
                Actualizar
              </Button>
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              <Check size={17} />
              {notice}
              <button onClick={() => setNotice("")} aria-label="Cerrar aviso">
                ×
              </button>
            </div>
          )}
          <div className="page-title">
            <div>
              <p className="eyebrow">
                {view === "agenda"
                  ? "CADA VISITA, EN SU LUGAR"
                  : "AL’AGUA DOGS / ADMINISTRACIÓN"}
              </p>
              <h1>{views.find((v) => v.id === view)?.label}</h1>
              <p className="muted">
                {
                  (
                    {
                      agenda: admin
                        ? "Cuatro camionetas. Una agenda en orden."
                        : "Tus servicios y domicilios asignados, en orden.",
                      routes: "Del primer domicilio al regreso a la base.",
                      clients: "Conoce a cada familia y a cada mascota.",
                      payments: "Cobros, anticipos y saldos en un solo lugar.",
                      analytics: "Ingresos y costos registrados, con contexto.",
                      incidents: "Hechos, seguimiento y soluciones.",
                      settings: "Los datos que dan forma a tu operación.",
                    } as any
                  )[view]
                }
              </p>
            </div>
            {admin && ["agenda", "routes"].includes(view) ? (
              <Button disabled={!ready} onClick={() => open("appointment")}>
                <Plus /> Nueva cita
              </Button>
            ) : admin && view === "clients" ? (
              <Button disabled={!ready} onClick={() => open("client")}>
                <Plus /> Nuevo cliente
              </Button>
            ) : view === "payments" ? (
              <Button
                disabled={!ready || !pending.length}
                onClick={() => open("payment")}
              >
                <Plus /> Registrar pago
              </Button>
            ) : view === "incidents" ? (
              <Button
                disabled={!ready || !s.clients.length}
                onClick={() => open("incident")}
              >
                <Plus /> Registrar incidencia
              </Button>
            ) : null}
          </div>
          {["agenda", "routes"].includes(view) && (
            <div className="toolbar">
              <div className="date-controls">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Día anterior"
                  onClick={() => setDate(addDay(date, -1))}
                >
                  <ChevronLeft />
                </Button>
                <Input
                  aria-label="Fecha de agenda"
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Día siguiente"
                  onClick={() => setDate(addDay(date, 1))}
                >
                  <ChevronRight />
                </Button>
                <Button variant="outline" onClick={() => setDate(today())}>
                  Hoy
                </Button>
              </div>
              <Choice
                label="Camioneta"
                value={van}
                onChange={setVan}
                options={[
                  { value: "all", label: "Todas las camionetas" },
                  ...s.vans.map((v) => ({ value: v.id, label: v.name })),
                ]}
              />
            </div>
          )}
          {view === "agenda" && (
            <>
              <div className="metrics">
                {[
                  [
                    "Servicios del día",
                    `${active.length}`,
                    `${active.filter((a) => a.status === "Completado").length} completados · ${active.filter((a) => a.status === "En servicio").length} en curso`,
                  ],
                  [
                    "Tiempo programado",
                    `${Math.floor(active.reduce((n, a) => n + a.duration, 0) / 60)} h ${active.reduce((n, a) => n + a.duration, 0) % 60} m`,
                    admin
                      ? "Tiempo de servicio de las 4 unidades"
                      : "Tiempo de tus citas asignadas",
                  ],
                  [
                    "Ingresos programados",
                    money(total),
                    "Valor de las citas del día",
                  ],
                  [
                    "Por cobrar del día",
                    money(due),
                    "Incluye próximas citas y anticipos",
                  ],
                ].map(([a, b, c]) => (
                  <div className="metric" key={a}>
                    <span>{a}</span>
                    <strong>{b}</strong>
                    <small>{c}</small>
                  </div>
                ))}
              </div>
              <Tabs value={mode} onValueChange={setMode}>
                <div className="section-row">
                  <h2 className="capitalize">{dateText(date)}</h2>
                  <TabsList>
                    <TabsTrigger value="day">Día</TabsTrigger>
                    <TabsTrigger value="week">7 días</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="day">
                  <section className="panel">
                    <div
                      className={`van-grid ${van !== "all" ? "single" : ""}`}
                    >
                      {vanList.map((v) => {
                        const jobs = filtered
                          .filter((a) => a.vanId === v.id)
                          .sort((a, b) => a.time.localeCompare(b.time));
                        const next =
                          jobs.find((a) => a.status === "En servicio") ||
                          jobs.find((a) => a.status === "Confirmado");
                        return (
                          <article
                            className={`van-column van-${s.vans.indexOf(v)}`}
                            key={v.id}
                          >
                            <div className="van-heading">
                              <span className="van-icon">
                                <Truck />
                              </span>
                              <div>
                                <h3>{v.name}</h3>
                                <small>
                                  {v.groomer} · {jobs.length} servicios
                                </small>
                              </div>
                            </div>
                            <div className="next-label">
                              {next
                                ? `${next.status === "En servicio" ? "En atención" : "Próxima cita"}: ${pet(next)?.name} · ${next.time}`
                                : "Sin servicios pendientes"}
                            </div>
                            <div className="job-stack">
                              {jobs.map(card)}
                              {!jobs.length && (
                                <div className="empty-mini">
                                  <CalendarDays />
                                  <p>Agenda disponible</p>
                                  {admin && (
                                    <Button
                                      variant="outline"
                                      disabled={!ready}
                                      onClick={() =>
                                        open("appointment", { vanId: v.id })
                                      }
                                    >
                                      Agendar aquí
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="van-summary">
                              <Clock3 size={14} />
                              {jobs.reduce((n, a) => n + a.duration, 0)} min de
                              servicio
                              <span>
                                {money(jobs.reduce((n, a) => n + a.price, 0))}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </TabsContent>
                <TabsContent value="week">
                  <div className="week-grid">
                    {Array.from({ length: 7 }, (_, i) => addDay(date, i)).map(
                      (d) => (
                        <section className="panel day-panel" key={d}>
                          <button
                            className="day-title"
                            onClick={() => {
                              setDate(d);
                              setMode("day");
                            }}
                          >
                            {dateText(d)}
                          </button>
                          {s.appointments
                            .filter(
                              (a) =>
                                a.date === d &&
                                a.status !== "Cancelado" &&
                                (van === "all" || a.vanId === van),
                            )
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((a) => (
                              <button
                                className="week-job"
                                onClick={() => details(a)}
                                key={a.id}
                              >
                                <b>
                                  {a.time} · {pet(a)?.name}
                                </b>
                                <span>
                                  {s.vans.find((v) => v.id === a.vanId)?.name}
                                </span>
                              </button>
                            ))}
                          {!s.appointments.some(
                            (a) =>
                              a.date === d &&
                              a.status !== "Cancelado" &&
                              (van === "all" || a.vanId === van),
                          ) && <p className="muted">Sin citas</p>}
                        </section>
                      ),
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              <p className="footnote">
                El traslado se captura por cita. Los tiempos de baño y corte
                pueden ajustarse a cada mascota.
              </p>
            </>
          )}
          {view === "routes" && (
            <>
              <div className="route-base panel">
                <span className="route-base-icon">
                  <MapPin />
                </span>
                <div>
                  <h2>Base de salida y regreso</h2>
                  <p className="muted">
                    {s.base.address ||
                      "Pendiente de configurar ciudad y domicilio."}
                  </p>
                </div>
                {admin && (
                  <Button
                    variant="outline"
                    onClick={() => open("base")}
                    disabled={!ready}
                  >
                    Configurar base
                  </Button>
                )}
              </div>
              <div className="route-grid">
                {vanList.map((v) => {
                  const jobs = filtered
                    .filter((a) => a.vanId === v.id)
                    .sort((a, b) => a.time.localeCompare(b.time));
                  return (
                    <section
                      className={`panel route-panel van-${s.vans.indexOf(v)}`}
                      key={v.id}
                    >
                      <div className="section-row">
                        <div>
                          <h2>{v.name}</h2>
                          <p className="muted">
                            {v.groomer} · {jobs.length} paradas
                          </p>
                        </div>
                        <Truck />
                      </div>
                      <ol className="route-stops">
                        {jobs.map((a, i) => (
                          <li key={a.id}>
                            <span
                              className={`stop-number ${a.status === "Completado" ? "finished" : ""}`}
                            >
                              {a.status === "Completado" ? (
                                <Check size={15} />
                              ) : (
                                i + 1
                              )}
                            </span>
                            <button onClick={() => details(a)}>
                              <b>
                                {a.time} · {pet(a)?.name}
                              </b>
                              <span>{cn(a.clientId)?.name}</span>
                              <small>{cn(a.clientId)?.address}</small>
                              <small>
                                {a.duration} min de servicio · {a.travel} min de
                                traslado previsto
                              </small>
                            </button>
                          </li>
                        ))}
                      </ol>
                      {!jobs.length && (
                        <p className="muted">No hay citas en esta fecha.</p>
                      )}
                      {admin && (
                        <Button
                          variant="outline"
                          disabled={!ready || !jobs.length}
                          onClick={() => open("route", { vanId: v.id, date })}
                        >
                          <Navigation size={17} /> Revisar orden sugerido
                        </Button>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="info-note">
                <CircleAlert size={19} />
                <p>
                  El esquema muestra el orden de atención. La sugerencia usa
                  coordenadas y distancias en línea recta; no incluye calles,
                  tráfico ni restricciones viales. Confirma los horarios con los
                  clientes antes de aplicarla.
                </p>
              </div>
            </>
          )}
          {view === "clients" && (
            <>
              <div className="search-field">
                <Search size={18} />
                <Input
                  aria-label="Buscar cliente o mascota"
                  placeholder="Buscar por cliente, mascota, teléfono o zona…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <section className="panel">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente y mascotas</TableHead>
                      <TableHead>Zona y domicilio</TableHead>
                      <TableHead>Saldo abierto</TableHead>
                      <TableHead>Seguimiento</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.clients
                      .filter((c) =>
                        [c.name, c.phone, c.zone, ...c.pets.map((p) => p.name)]
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <button
                              className="cell-link"
                              onClick={() => open("clientDetail", c)}
                            >
                              {c.name}
                            </button>
                            <small className="cell-sub">
                              {c.pets.map((p) => p.name).join(", ")} ·{" "}
                              {c.phone || "Teléfono por registrar"}
                            </small>
                          </TableCell>
                          <TableCell>
                            {c.zone || "Sin zona"}
                            <small className="cell-sub">{c.address}</small>
                          </TableCell>
                          <TableCell>
                            <b
                              className={
                                clientBalance(s, c.id) > 0 ? "debt" : ""
                              }
                            >
                              {money(clientBalance(s, c.id))}
                            </b>
                          </TableCell>
                          <TableCell>
                            {s.incidents.filter(
                              (i) => i.clientId === c.id && !i.resolved,
                            ).length ? (
                              `${s.incidents.filter((i) => i.clientId === c.id && !i.resolved).length} pendiente(s)`
                            ) : (
                              <span className="muted">Sin pendientes</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              onClick={() => open("clientDetail", c)}
                            >
                              Ver ficha <ArrowUpRight size={16} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {!s.clients.length && (
                  <Empty
                    title="Aquí comienza el historial de cada familia"
                    text={
                      admin
                        ? "Agrega un cliente y su mascota para agendar la primera visita."
                        : "Tus clientes aparecerán cuando administración te asigne citas."
                    }
                  />
                )}
              </section>
            </>
          )}
          {view === "payments" && (
            <>
              <div className="toolbar">
                <div className="inline">
                  <Label htmlFor="cash-date">Cobros del día</Label>
                  <Input
                    id="cash-date"
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                </div>
                <span className="muted">
                  Los saldos abarcan todas las fechas.
                </span>
              </div>
              <div className="metrics">
                {["Efectivo", "Tarjeta", "Transferencia"].map((m) => (
                  <div className="metric" key={m}>
                    <span>{m}</span>
                    <strong>
                      {money(
                        dayPayments
                          .filter((p) => p.method === m)
                          .reduce((n, p) => n + p.amount, 0),
                      )}
                    </strong>
                    <small>Registrado el {date}</small>
                  </div>
                ))}
                <div className="metric">
                  <span>Por cobrar · todas las fechas</span>
                  <strong>
                    {money(pending.reduce((n, a) => n + balance(s, a), 0))}
                  </strong>
                  <small>{pending.length} citas con saldo abierto</small>
                </div>
              </div>
              <Tabs value={paymentTab} onValueChange={setPaymentTab}>
                <TabsList>
                  <TabsTrigger value="pending">Saldos abiertos</TabsTrigger>
                  <TabsTrigger value="history">Historial de pagos</TabsTrigger>
                </TabsList>
                <TabsContent value="pending">
                  <section className="panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente / mascota</TableHead>
                          <TableHead>Servicio</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Pagado</TableHead>
                          <TableHead>Pendiente</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pending.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <b>{cn(a.clientId)?.name}</b>
                              <small className="cell-sub">
                                {pet(a)?.name} · {a.date}
                              </small>
                            </TableCell>
                            <TableCell>
                              {service(a.serviceId)}
                              <small className="cell-sub">
                                {a.status === "Completado"
                                  ? "Servicio realizado"
                                  : "Servicio por realizar"}
                              </small>
                            </TableCell>
                            <TableCell>{money(a.price)}</TableCell>
                            <TableCell>{money(paid(s, a.id))}</TableCell>
                            <TableCell className="debt">
                              {money(balance(s, a))}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                disabled={!ready}
                                onClick={() =>
                                  open("payment", { appointmentId: a.id })
                                }
                              >
                                Registrar pago
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!pending.length && (
                      <Empty
                        title="Todo al corriente"
                        text="No hay citas con saldo pendiente."
                      />
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="history">
                  <section className="panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Forma</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...s.payments].reverse().map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              {new Date(p.date).toLocaleString("es-MX", {
                                timeZone: "America/Mexico_City",
                              })}
                            </TableCell>
                            <TableCell>
                              {
                                cn(
                                  s.appointments.find(
                                    (a) => a.id === p.appointmentId,
                                  )?.clientId || "",
                                )?.name
                              }
                            </TableCell>
                            <TableCell>{p.method}</TableCell>
                            <TableCell>{p.reference || "—"}</TableCell>
                            <TableCell>
                              <b>{money(p.amount)}</b>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!s.payments.length && (
                      <Empty
                        title="Sin pagos registrados"
                        text="Los cobros y anticipos aparecerán aquí."
                      />
                    )}
                  </section>
                </TabsContent>
              </Tabs>
              <p className="footnote">
                Registro administrativo de pagos recibidos. La tarjeta se cobra
                en tu terminal y la transferencia se verifica en tu banco.
              </p>
            </>
          )}
          {admin && view === "analytics" && (
            <Analytics s={s} onClient={(c) => open("clientDetail", c)} />
          )}
          {view === "incidents" && (
            <>
              <div className="info-note">
                <ClipboardList size={19} />
                <p>
                  Documenta lo ocurrido, el impacto y la solución. Las
                  incidencias se revisan por separado de la rentabilidad.
                </p>
              </div>
              <div className="incident-grid">
                {s.incidents.map((i) => (
                  <section className="panel incident-card" key={i.id}>
                    <div className="section-row">
                      <span className={`status ${i.resolved ? "done" : ""}`}>
                        {i.resolved ? "Resuelto" : "Por atender"}
                      </span>
                      <small className="muted">
                        {new Date(i.createdAt).toLocaleDateString("es-MX")}
                      </small>
                    </div>
                    <h2>{i.category}</h2>
                    <button
                      className="cell-link"
                      onClick={() => open("clientDetail", cn(i.clientId))}
                    >
                      {cn(i.clientId)?.name}
                    </button>
                    <p>{i.description}</p>
                    {i.resolution && (
                      <div className="resolution">
                        <b>Seguimiento</b>
                        <p>{i.resolution}</p>
                      </div>
                    )}
                    {admin && !i.resolved && (
                      <Button
                        variant="outline"
                        disabled={!ready}
                        onClick={() => open("resolve", i)}
                      >
                        Registrar solución
                      </Button>
                    )}
                  </section>
                ))}
              </div>
              {!s.incidents.length && (
                <section className="panel">
                  <Empty
                    title="Sin incidencias registradas"
                    text="Aquí se conserva el seguimiento de pagos, mascotas, atención y equipo."
                  />
                </section>
              )}
            </>
          )}
          {admin && view === "settings" && (
            <>
              {team && (
                <TeamAccess team={team} vans={s.vans} onChange={refresh} />
              )}
              <h2 className="section-heading">Las cuatro camionetas</h2>
              <div className="settings-grid">
                {s.vans.map((v) => (
                  <section className="panel settings-card" key={v.id}>
                    <Truck />
                    <h2>{v.name}</h2>
                    <p className="muted">Bañador habitual: {v.groomer}</p>
                    <p className="muted">{v.notes || "Sin notas de equipo."}</p>
                    <Button
                      variant="outline"
                      disabled={!ready}
                      onClick={() => open("van", v)}
                    >
                      Editar equipo
                    </Button>
                  </section>
                ))}
              </div>
              <h2 className="section-heading">Servicios y valores iniciales</h2>
              <p className="muted section-desc">
                Valores provisionales, ajustables por mascota al agendar.
                Cambiarlos no modifica citas anteriores.
              </p>
              <div className="settings-grid services">
                {s.services.map((v) => (
                  <section className="panel settings-card" key={v.id}>
                    <h2>{v.name}</h2>
                    <strong>{money(v.price)}</strong>
                    <p>{v.duration} minutos</p>
                    <small className="muted">
                      Costo estimado: {money(v.cost)}
                    </small>
                    <Button
                      variant="outline"
                      disabled={!ready}
                      onClick={() => open("service", v)}
                    >
                      Editar valores
                    </Button>
                  </section>
                ))}
              </div>
              <section className="panel settings-card">
                <h2>Base de salida y regreso</h2>
                <p>{s.base.address || "Por configurar"}</p>
                <Button
                  variant="outline"
                  disabled={!ready}
                  onClick={() => open("base")}
                >
                  Configurar base
                </Button>
              </section>
              {s.demo && (
                <section className="panel settings-card">
                  <h2>Datos de ejemplo</h2>
                  <p className="muted">
                    Esta versión contiene familias y servicios ficticios para
                    explorar los flujos. Al empezar, se retirarán todos los
                    clientes, citas, pagos e incidencias de este espacio,
                    incluidos los que hayas agregado durante la prueba.
                  </p>
                  <Button
                    variant="outline"
                    disabled={!ready}
                    onClick={() => open("clearDemo")}
                  >
                    Empezar sin datos de ejemplo
                  </Button>
                </section>
              )}
              <section className="panel settings-card">
                <h2>Actividad reciente</h2>
                {s.audit.slice(0, 12).map((a, i) => (
                  <div className="audit-item" key={i}>
                    <span>{a.action}</span>
                    <small>
                      {new Date(a.at).toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}{" "}
                      · {a.actor}
                    </small>
                  </div>
                ))}
                {!s.audit.length && (
                  <p className="muted">
                    Aquí aparecerán los cambios guardados.
                  </p>
                )}
              </section>
              <p className="footnote">
                Los registros son compartidos por el equipo autorizado. La
                agenda se actualiza cada 30 segundos mientras estás fuera de un
                formulario. Si dos personas editan a la vez, se pedirá
                actualizar antes de guardar.
              </p>
            </>
          )}
          {s.demo && (
            <p className="footnote demo-foot">
              <span>DEMO</span> Clientes, importes y tiempos ficticios.
            </p>
          )}
        </div>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v && !busy) setModal(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    appointment: modal?.record?.id
                      ? "Editar cita"
                      : "Nueva cita",
                    client: modal?.record?.id
                      ? "Editar cliente"
                      : "Nuevo cliente",
                    detail: "Detalle del servicio",
                    clientDetail: "Ficha del cliente",
                    payment: "Registrar pago recibido",
                    incident: "Registrar incidencia",
                    resolve: "Resolver incidencia",
                    outcome: "Tiempo y costos del servicio",
                    van: "Editar camioneta",
                    service: "Valores del servicio",
                    base: "Base de salida y regreso",
                    route: "Revisar orden sugerido",
                    clearDemo: "Empezar sin datos de ejemplo",
                  } as any
                )[modal?.kind || ""]
              }
            </DialogTitle>
            <DialogDescription>
              {modal?.kind === "payment"
                ? "Registra un cobro o anticipo ya recibido."
                : "AL’AGUA DOGS · Centro de operaciones"}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div role="alert" className="message error">
              {error}
              <Button
                type="button"
                variant="outline"
                onClick={refresh}
                disabled={busy}
              >
                Actualizar datos
              </Button>
            </div>
          )}
          {modal?.kind === "detail" ? (
            <AppointmentDetail
              id={modal.record.id}
              s={s}
              admin={!!admin}
              ready={ready}
              busy={busy}
              open={open}
              save={save}
              setCancel={setCancel}
            />
          ) : modal?.kind === "clientDetail" ? (
            (() => {
              const c = cn(modal.record.id);
              if (!c)
                return (
                  <p>
                    Este cliente ya no está disponible. Cierra la ficha y
                    actualiza.
                  </p>
                );
              const visits = s.appointments
                .filter((a) => a.clientId === c.id)
                .sort((a, b) => b.date.localeCompare(a.date));
              return (
                <>
                  <div className="section-row">
                    <div>
                      <h2>{c.name}</h2>
                      <p className="muted">
                        {c.phone || "Sin teléfono"} · {c.zone || "Sin zona"}
                      </p>
                    </div>
                    {admin && (
                      <Button
                        variant="outline"
                        onClick={() => open("client", c)}
                      >
                        Editar ficha
                      </Button>
                    )}
                  </div>
                  <p>{c.address}</p>
                  {c.notes && <p className="muted">{c.notes}</p>}
                  <div className="pet-list">
                    {c.pets.map((p) => (
                      <div key={p.id}>
                        <PawPrint />
                        <b>{p.name}</b>
                        <span>
                          {p.species} · {p.breed}
                        </span>
                        {p.notes && <p>{p.notes}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="payment-summary">
                    <span>
                      Saldo abierto{" "}
                      <b className="debt">{money(clientBalance(s, c.id))}</b>
                    </span>
                    <span>
                      Servicios realizados{" "}
                      <b>
                        {visits.filter((a) => a.status === "Completado").length}
                      </b>
                    </span>
                  </div>
                  <h2>Historial de visitas</h2>
                  {visits.map((a) => (
                    <button
                      className="history-item"
                      key={a.id}
                      onClick={() => details(a)}
                    >
                      <div>
                        <b>
                          {a.date} · {pet(a)?.name}
                        </b>
                        <span>
                          {service(a.serviceId)} · {a.status}
                        </span>
                      </div>
                      <span>
                        {money(a.price)} <ArrowUpRight size={15} />
                      </span>
                    </button>
                  ))}
                  {!visits.length && (
                    <p className="muted">Aún no hay visitas.</p>
                  )}
                  <h2>Incidencias</h2>
                  {s.incidents
                    .filter((i) => i.clientId === c.id)
                    .map((i) => (
                      <div className="client-incident" key={i.id}>
                        <b>
                          {i.category} · {i.resolved ? "Resuelto" : "Pendiente"}
                        </b>
                        <p>{i.description}</p>
                        {i.resolution && <small>{i.resolution}</small>}
                      </div>
                    ))}
                  <div className="button-row">
                    {admin && (
                      <Button
                        onClick={() =>
                          open("appointment", {
                            clientId: c.id,
                            petId: c.pets[0].id,
                          })
                        }
                      >
                        Agendar visita
                      </Button>
                    )}
                    {admin && (
                      <Button
                        variant="outline"
                        onClick={() => open("incident", { clientId: c.id })}
                      >
                        Registrar incidencia
                      </Button>
                    )}
                  </div>
                </>
              );
            })()
          ) : (
            modal && (
              <Editor
                key={modal.kind + (modal.record?.id || "")}
                modal={modal}
                s={s}
                members={team?.members || []}
                admin={!!admin}
                date={date}
                ready={ready}
                busy={busy}
                save={save}
                onDone={() => setModal(null)}
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
            <AlertDialogDescription>
              La cita de {cancel && pet(cancel)?.name} dejará de ocupar lugar en
              la agenda. Se conservará en su historial. Las citas con pagos
              necesitan conciliación antes de cancelarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conservar cita</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (
                  cancel &&
                  (await save({
                    type: "status",
                    id: cancel.id,
                    status: "Cancelado",
                  }))
                ) {
                  setModal(null);
                }
                setCancel(null);
              }}
            >
              Cancelar cita
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <PawPrint size={30} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Analytics({
  s,
  onClient,
}: {
  s: State;
  onClient: (c: Client) => void;
}) {
  const [period, setPeriod] = useState("all");
  const completed = s.appointments.filter(
    (a) =>
      a.status === "Completado" &&
      (period === "all" || a.date >= addDay(today(), -30)),
  );
  const rows = s.clients
    .map((c) => {
      const a = completed.filter((a) => a.clientId === c.id);
      const revenue = a.reduce((n, a) => n + a.price, 0),
        cost = a.reduce((n, a) => n + a.cost + a.extraCost, 0),
        minutes = a.reduce(
          (n, a) => n + (a.actualMinutes ?? a.duration) + a.travel,
          0,
        );
      return {
        c,
        visits: a.length,
        revenue,
        cost,
        margin: revenue - cost,
        minutes,
        balance: s.appointments
          .filter((a) => a.clientId === c.id && a.status === "Completado")
          .reduce((n, a) => n + balance(s, a), 0),
        incidents: s.incidents.filter((i) => i.clientId === c.id && !i.resolved)
          .length,
      };
    })
    .sort((a, b) => b.margin - a.margin);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0),
    cost = rows.reduce((n, r) => n + r.cost, 0);
  return (
    <>
      <div className="toolbar">
        <Choice
          label="Periodo"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "all", label: "Todo el historial" },
            { value: "30", label: "Últimos 30 días" },
          ]}
        />
        <span className="muted">Margen sobre servicios completados</span>
      </div>
      <div className="metrics">
        {[
          [
            "Servicios completados",
            `${completed.length}`,
            "En el periodo seleccionado",
          ],
          [
            "Ingresos por servicios",
            money(revenue),
            "Precio acordado, cobrado o pendiente",
          ],
          [
            "Costos registrados",
            money(cost),
            "Servicio, traslado y extras capturados",
          ],
          [
            "Margen estimado",
            money(revenue - cost),
            "Ingresos menos costos registrados",
          ],
        ].map(([a, b, c]) => (
          <div className="metric" key={a}>
            <span>{a}</span>
            <strong>{b}</strong>
            <small>{c}</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Valor por cliente</h2>
            <p className="muted">
              Ordenado por margen estimado. Saldos e incidencias muestran todo
              el historial.
            </p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Visitas</TableHead>
              <TableHead>Ingresos</TableHead>
              <TableHead>Costos</TableHead>
              <TableHead>Margen</TableHead>
              <TableHead>Margen / hora</TableHead>
              <TableHead>Saldo de servicios realizados</TableHead>
              <TableHead>Incidencias abiertas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.c.id}>
                <TableCell>
                  <button className="cell-link" onClick={() => onClient(r.c)}>
                    {r.c.name}
                  </button>
                </TableCell>
                <TableCell>{r.visits}</TableCell>
                <TableCell>{money(r.revenue)}</TableCell>
                <TableCell>{money(r.cost)}</TableCell>
                <TableCell>
                  <span className={r.margin < 0 ? "debt" : "positive"}>
                    {r.visits ? money(r.margin) : "Sin historial"}
                  </span>
                  {r.visits > 0 && (
                    <div className="margin-bar">
                      <span
                        style={{
                          width: `${Math.max(0, Math.min(100, (r.margin / Math.max(r.revenue, 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {r.minutes
                    ? money(Math.round((r.margin / r.minutes) * 60))
                    : "—"}
                </TableCell>
                <TableCell className={r.balance ? "debt" : ""}>
                  {money(r.balance)}
                </TableCell>
                <TableCell>{r.incidents}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div className="info-note">
        <ChartNoAxesCombined size={20} />
        <p>
          El margen es una estimación: captura mano de obra, insumos y traslado
          en el costo de cada cita. No representa utilidad neta ni incluye
          automáticamente gastos fijos o impuestos. El tiempo por hora incluye
          traslado y tiempo real cuando está disponible.
        </p>
      </div>
    </>
  );
}
function Editor({
  modal,
  s,
  members,
  admin,
  date,
  ready,
  busy,
  save,
  onDone,
}: {
  modal: Modal;
  s: State;
  members: PublicMember[];
  admin: boolean;
  date: string;
  ready: boolean;
  busy: boolean;
  save: (c: Command, id?: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const [operationId] = useState(uid);
  const kind = modal.kind;
  const record = modal.record || {};
  const [localError, setLocalError] = useState("");
  const [f, setF] = useState<any>(() => {
    if (kind === "appointment") {
      const v = s.vans.find((v) => v.id === record.vanId) || s.vans[0];
      const cl =
        s.clients.find((c) => c.id === record.clientId) || s.clients[0];
      const svc = s.services[0];
      const habitual = members.find(
        (m) =>
          m.role === "groomer" && m.status !== "inactive" && m.vanId === v.id,
      );
      return {
        id: uid(),
        date,
        time: "09:00",
        clientId: cl?.id || "",
        petId: cl?.pets[0]?.id || "",
        vanId: v.id,
        groomer: habitual?.name || v.groomer,
        groomerId: habitual?.id || "",
        serviceId: svc.id,
        duration: svc.duration,
        travel: 20,
        price: svc.price,
        cost: svc.cost,
        extraCost: 0,
        notes: "",
        ...record,
      };
    }
    if (kind === "client")
      return {
        id: uid(),
        name: "",
        phone: "",
        address: "",
        zone: "",
        notes: "",
        lat: null,
        lng: null,
        pets: [{ id: uid(), name: "", species: "Perro", breed: "", notes: "" }],
        ...record,
      };
    if (kind === "payment") {
      const a =
        s.appointments.find((a) => a.id === record.appointmentId) ||
        s.appointments.find((a) => balance(s, a) > 0);
      return {
        id: uid(),
        appointmentId: a?.id || "",
        amount: a ? balance(s, a) : 0,
        method: "Efectivo",
        reference: "",
      };
    }
    if (kind === "incident")
      return {
        id: uid(),
        clientId: s.clients[0]?.id || "",
        appointmentId: "",
        category: "Atención al cliente",
        description: "",
        ...record,
      };
    if (kind === "base") return { ...s.base };
    if (kind === "outcome")
      return {
        id: record.id,
        cost: record.cost,
        extraCost: record.extraCost,
        actualMinutes: record.actualMinutes ?? record.duration,
      };
    if (kind === "resolve") return { id: record.id, resolution: "" };
    if (kind === "route") return { start: "08:00" };
    if (kind === "clearDemo") return { confirm: "" };
    return { ...record };
  });
  const set = (key: string, value: any) =>
    setF((v: any) => ({ ...v, [key]: value }));
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
    extra: any = {},
  ) => (
    <Field label={label}>
      <Input
        aria-label={label}
        type={type}
        value={f[key] ?? ""}
        required={required}
        onChange={(e) =>
          set(
            key,
            type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
        {...extra}
      />
    </Field>
  );
  const cents = (key: string, label: string) => (
    <Field label={label}>
      <Input
        aria-label={label}
        type="number"
        required
        min="0"
        step="0.01"
        value={typeof f[key] === "number" ? f[key] / 100 : ""}
        onChange={(e) =>
          set(
            key,
            e.target.value === ""
              ? ""
              : Math.round(Number(e.target.value) * 100),
          )
        }
      />
    </Field>
  );
  const choice = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    change?: (v: string) => void,
  ) => (
    <Field label={label}>
      <Choice
        label={label}
        value={f[key] || ""}
        onChange={change || ((v) => set(key, v))}
        options={options}
      />
    </Field>
  );
  const textarea = (key: string, label: string, required = false) => (
    <Field label={label}>
      <Textarea
        aria-label={label}
        required={required}
        value={f[key] || ""}
        onChange={(e) => set(key, e.target.value)}
        maxLength={2000}
      />
    </Field>
  );
  const coordinates = (
    <div className="form-grid">
      {(["lat", "lng"] as const).map((k) => (
        <Field
          label={k === "lat" ? "Latitud (opcional)" : "Longitud (opcional)"}
          key={k}
        >
          <Input
            aria-label={k === "lat" ? "Latitud" : "Longitud"}
            type="number"
            step="any"
            min={k === "lat" ? -90 : -180}
            max={k === "lat" ? 90 : 180}
            value={f[k] ?? ""}
            onChange={(e) =>
              set(k, e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
      ))}
    </div>
  );
  const route = useMemo(
    () =>
      kind === "route" ? routeProposal(s, record.vanId, record.date) : null,
    [kind, s, record.vanId, record.date],
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    let c: Command;
    switch (kind) {
      case "appointment":
        c = { type: "saveAppointment", appointment: f };
        break;
      case "client":
        c = { type: "saveClient", client: f };
        break;
      case "payment":
        c = { type: "payment", ...f };
        break;
      case "incident":
        c = { type: "incident", ...f };
        break;
      case "outcome":
        c = { type: "outcome", ...f };
        break;
      case "resolve":
        c = { type: "resolve", ...f };
        break;
      case "van":
        c = { type: "saveVan", van: f };
        break;
      case "service":
        c = { type: "saveService", service: f };
        break;
      case "base":
        c = { type: "saveBase", base: f };
        break;
      case "route":
        c = { type: "applyRoute", ...record, ...f };
        break;
      case "clearDemo":
        c = { type: "clearDemo", ...f };
        break;
      default:
        return;
    }
    if (await save(c, operationId)) onDone();
  }
  return (
    <form onSubmit={submit} className="editor-form">
      {localError && <p role="alert">{localError}</p>}
      {kind === "appointment" && (
        <>
          {!s.clients.length && (
            <div className="info-note">
              Primero registra un cliente con su mascota en Clientes y mascotas.
            </div>
          )}
          <div className="form-grid">
            {choice(
              "clientId",
              "Cliente",
              s.clients.map((c) => ({ value: c.id, label: c.name })),
              (v) => {
                set("clientId", v);
                set(
                  "petId",
                  s.clients.find((c) => c.id === v)?.pets[0]?.id || "",
                );
              },
            )}
            {choice(
              "petId",
              "Mascota",
              (s.clients.find((c) => c.id === f.clientId)?.pets || []).map(
                (p) => ({ value: p.id, label: `${p.name} · ${p.species}` }),
              ),
            )}
            {choice(
              "serviceId",
              "Servicio",
              s.services.map((v) => ({ value: v.id, label: v.name })),
              (id) => {
                const v = s.services.find((v) => v.id === id)!;
                setF((f: any) => ({
                  ...f,
                  serviceId: id,
                  duration: v.duration,
                  price: v.price,
                  cost: v.cost,
                }));
              },
            )}
            {choice(
              "vanId",
              "Camioneta",
              s.vans.map((v) => ({ value: v.id, label: v.name })),
              (id) => {
                set("vanId", id);
                const habitual = members.find(
                  (m) =>
                    m.role === "groomer" &&
                    m.status !== "inactive" &&
                    m.vanId === id,
                );
                set(
                  "groomer",
                  habitual?.name || s.vans.find((v) => v.id === id)?.groomer,
                );
                set("groomerId", habitual?.id || "");
              },
            )}
            <Field
              label="Cuenta del bañador"
              hint="Esta cuenta recibirá la cita en su agenda."
            >
              <Choice
                label="Cuenta del bañador"
                value={f.groomerId || "manual"}
                onChange={(id) => {
                  const member = members.find((m) => m.id === id);
                  set("groomerId", member?.id || "");
                  if (member) set("groomer", member.name);
                }}
                options={[
                  { value: "manual", label: "Nombre sin cuenta de acceso" },
                  ...members
                    .filter(
                      (m) => m.role === "groomer" && m.status !== "inactive",
                    )
                    .map((m) => ({
                      value: m.id,
                      label:
                        m.name +
                        (m.status === "pending" ? " · por activar" : ""),
                    })),
                ]}
              />
            </Field>
            {!f.groomerId && input("groomer", "Bañador asignado")}
            {input("date", "Fecha", "date")}
            {input("time", "Hora del servicio", "time")}
            {input("duration", "Servicio (minutos)", "number", true, {
              min: 5,
              max: 720,
            })}
            {input("travel", "Traslado previo (minutos)", "number", true, {
              min: 0,
              max: 300,
            })}
            {cents("price", "Precio (MXN)")}
            {cents("cost", "Costo total estimado (MXN)")}
            {cents("extraCost", "Costos adicionales (MXN)")}
          </div>
          <p className="muted">
            Incluye mano de obra, insumos y traslado en el costo estimado. Se
            reserva también el tiempo de traslado previo.
          </p>
          {textarea("notes", "Indicaciones para la visita")}
        </>
      )}
      {kind === "client" && (
        <>
          <div className="form-grid">
            {input("name", "Nombre del cliente")}
            {input("phone", "Teléfono", "tel", false)}
            {input("zone", "Zona o colonia", "text", false)}
          </div>
          {input("address", "Domicilio completo")}
          {coordinates}
          {textarea("notes", "Notas de atención")}
          <h2>Mascotas</h2>
          {f.pets.map((p: any, i: number) => (
            <div className="pet-editor" key={p.id}>
              <div className="form-grid">
                <Field label="Nombre de la mascota">
                  <Input
                    aria-label={`Nombre de mascota ${i + 1}`}
                    required
                    value={p.name}
                    onChange={(e) =>
                      set(
                        "pets",
                        f.pets.map((x: any, j: number) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Especie">
                  <Choice
                    label={`Especie de mascota ${i + 1}`}
                    value={p.species}
                    onChange={(v) =>
                      set(
                        "pets",
                        f.pets.map((x: any, j: number) =>
                          j === i ? { ...x, species: v } : x,
                        ),
                      )
                    }
                    options={["Perro", "Gato"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </Field>
                <Field label="Raza / tamaño">
                  <Input
                    aria-label={`Raza o tamaño de mascota ${i + 1}`}
                    value={p.breed}
                    onChange={(e) =>
                      set(
                        "pets",
                        f.pets.map((x: any, j: number) =>
                          j === i ? { ...x, breed: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Cuidados y manejo">
                <Textarea
                  aria-label={`Cuidados de mascota ${i + 1}`}
                  value={p.notes}
                  onChange={(e) =>
                    set(
                      "pets",
                      f.pets.map((x: any, j: number) =>
                        j === i ? { ...x, notes: e.target.value } : x,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              set("pets", [
                ...f.pets,
                { id: uid(), name: "", species: "Perro", breed: "", notes: "" },
              ])
            }
          >
            <Plus size={16} /> Agregar otra mascota
          </Button>
        </>
      )}
      {kind === "payment" && (
        <>
          {choice(
            "appointmentId",
            "Cita",
            s.appointments
              .filter((a) => balance(s, a) > 0)
              .map((a) => ({
                value: a.id,
                label: `${s.clients.find((c) => c.id === a.clientId)?.name} · ${a.date} · ${s.clients.find((c) => c.id === a.clientId)?.pets.find((p) => p.id === a.petId)?.name}`,
              })),
            (id) => {
              set("appointmentId", id);
              set(
                "amount",
                balance(
                  s,
                  s.appointments.find((a) => a.id === id)!,
                ),
              );
            },
          )}
          <div className="payment-summary">
            <span>
              Saldo de la cita{" "}
              <b>
                {money(
                  s.appointments.find((a) => a.id === f.appointmentId)
                    ? balance(
                        s,
                        s.appointments.find((a) => a.id === f.appointmentId)!,
                      )
                    : 0,
                )}
              </b>
            </span>
          </div>
          <div className="form-grid">
            {cents("amount", "Importe recibido (MXN)")}
            {choice(
              "method",
              "Forma de pago",
              ["Efectivo", "Tarjeta", "Transferencia"].map((v) => ({
                value: v,
                label: v,
              })),
            )}
          </div>
          {input(
            "reference",
            "Referencia o nota (sin datos de tarjeta)",
            "text",
            false,
          )}
          <p className="muted">
            Puedes registrar un anticipo. El resto permanecerá como saldo
            pendiente.
          </p>
        </>
      )}
      {kind === "incident" && (
        <>
          {choice(
            "clientId",
            "Cliente",
            s.clients.map((c) => ({ value: c.id, label: c.name })),
            (v) => {
              set("clientId", v);
              set("appointmentId", "");
            },
          )}
          <Field label="Visita relacionada">
            <Choice
              label="Visita relacionada"
              value={f.appointmentId || "none"}
              onChange={(v) => set("appointmentId", v === "none" ? "" : v)}
              options={[
                ...(admin
                  ? [{ value: "none", label: "Sin visita específica" }]
                  : []),
                ...s.appointments
                  .filter((a) => a.clientId === f.clientId)
                  .map((a) => ({
                    value: a.id,
                    label: `${a.date} · ${a.time}`,
                  })),
              ]}
            />
          </Field>
          {choice(
            "category",
            "Categoría",
            [
              "Pago pendiente",
              "Cancelación",
              "Demora",
              "Atención al cliente",
              "Manejo de mascota",
              "Camioneta / equipo",
              "Otro",
            ].map((v) => ({ value: v, label: v })),
          )}
          {textarea("description", "¿Qué ocurrió y qué impacto tuvo?", true)}
          <p className="muted">
            Describe hechos concretos y evita etiquetas personales.
          </p>
        </>
      )}
      {kind === "outcome" && (
        <>
          {record.status === "Completado" &&
            input(
              "actualMinutes",
              "Tiempo real de servicio (minutos)",
              "number",
              true,
              { min: 1, max: 1440 },
            )}
          {cents("cost", "Costo del servicio y traslado (MXN)")}
          {cents("extraCost", "Costos adicionales (MXN)")}
          <p className="muted">
            Incluye todos los costos directos de la visita. Este ajuste
            actualiza el margen del cliente.
          </p>
        </>
      )}
      {kind === "resolve" && (
        <>
          <p>{record.description}</p>
          {textarea("resolution", "Solución y seguimiento", true)}
        </>
      )}
      {kind === "van" && (
        <>
          {input("name", "Nombre de la camioneta")}
          {input("groomer", "Bañador habitual")}
          {textarea("notes", "Notas de camioneta o equipo")}
          <p className="muted">
            El bañador habitual se usará en citas nuevas. Las asignaciones
            existentes se conservan.
          </p>
        </>
      )}
      {kind === "service" && (
        <>
          <h2>{record.name}</h2>
          {input("duration", "Duración inicial (minutos)", "number", true, {
            min: 5,
            max: 720,
          })}
          {cents("price", "Precio inicial (MXN)")}
          {cents("cost", "Costo total estimado (MXN)")}
        </>
      )}
      {kind === "base" && (
        <>
          {input("address", "Domicilio de salida y regreso")}
          {coordinates}
          <p className="muted">
            La sugerencia de orden requiere latitud y longitud. Usa el punto de
            salida real de las camionetas.
          </p>
        </>
      )}
      {kind === "route" && route && (
        <>
          {route.error ? (
            <div className="info-note">
              <CircleAlert size={20} />
              <p>{route.error}</p>
            </div>
          ) : (
            <>
              <div className="payment-summary">
                <span>
                  Recorrido actual <b>{route.originalDistance} km</b>
                </span>
                <span>
                  Orden sugerido <b>{route.distance} km</b>
                </span>
              </div>
              <p className="muted">
                Distancias en línea recta, incluyendo regreso a la base.
                Traslado estimado a 25 km/h con factor 1.3 y mínimo 5 minutos;
                no representa tráfico real.
              </p>
              <ol className="suggested-list">
                {route.appointments.map((a, i) => (
                  <li key={a.id}>
                    <b>
                      {i + 1}.{" "}
                      {
                        s.clients
                          .find((c) => c.id === a.clientId)
                          ?.pets.find((p) => p.id === a.petId)?.name
                      }
                    </b>
                    <span>
                      {s.clients.find((c) => c.id === a.clientId)?.address} ·{" "}
                      {route.legs[i]} min de traslado
                    </span>
                  </li>
                ))}
              </ol>
              {input("start", "Hora de salida de la base", "time")}
              <div className="info-note">
                <CircleAlert size={20} />
                <p>
                  Al aplicar, se cambiarán los horarios de todas estas citas
                  según el orden sugerido. Confirma disponibilidad con cada
                  cliente. No se enviarán notificaciones.
                </p>
              </div>
            </>
          )}
        </>
      )}
      {kind === "clearDemo" && (
        <>
          <div className="info-note">
            <CircleAlert />
            <p>
              Se retirarán TODOS los clientes, citas, pagos e incidencias de
              este espacio de prueba, incluidos los que hayas agregado. El
              equipo y las tarifas se conservarán.
            </p>
          </div>
          {input("confirm", "Escribe EMPEZAR para confirmar")}
        </>
      )}
      <div className="dialog-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={busy}
        >
          Cerrar
        </Button>
        <Button
          type="submit"
          disabled={
            busy ||
            !ready ||
            (kind === "route" && !!route?.error) ||
            (kind === "appointment" && !s.clients.length) ||
            (kind === "clearDemo" && f.confirm !== "EMPEZAR")
          }
        >
          {busy
            ? "Guardando…"
            : kind === "route"
              ? "Aplicar orden y horarios"
              : kind === "payment"
                ? "Guardar pago recibido"
                : kind === "clearDemo"
                  ? "Retirar datos y empezar"
                  : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

function AppointmentDetail({
  id,
  s,
  admin,
  ready,
  busy,
  open,
  save,
  setCancel,
}: {
  id: string;
  s: State;
  admin: boolean;
  ready: boolean;
  busy: boolean;
  open: (
    kind: string,
    record?:
      | Appointment
      | { appointmentId: string }
      | { clientId: string; appointmentId: string },
  ) => void;
  save: (c: Command) => Promise<boolean>;
  setCancel: (a: Appointment) => void;
}) {
  const cn = (id: string) => s.clients.find((c) => c.id === id);
  const pet = (a: Appointment) =>
    cn(a.clientId)?.pets.find((p) => p.id === a.petId);
  const service = (id: string) => s.services.find((v) => v.id === id)?.name;
  const a = s.appointments.find((a) => a.id === id);
  if (!a)
    return (
      <p>Esta cita ya no está disponible. Cierra el detalle y actualiza.</p>
    );
  return (
    <>
      <div className="detail-pet">
        <span>
          <PawPrint size={30} />
        </span>
        <div>
          <h2>{pet(a)?.name}</h2>
          <p>
            {pet(a)?.species} · {pet(a)?.breed}
          </p>
        </div>
        <span className={`status ${a.status === "Completado" ? "done" : ""}`}>
          {a.status}
        </span>
      </div>
      <div className="detail-grid">
        <Field label="Cliente">
          <p>{cn(a.clientId)?.name}</p>
        </Field>
        <Field label="Servicio">
          <p>{service(a.serviceId)}</p>
        </Field>
        <Field label="Fecha y hora">
          <p>
            {a.date} · {a.time}
          </p>
        </Field>
        <Field label="Camioneta y bañador">
          <p>
            {s.vans.find((v) => v.id === a.vanId)?.name} · {a.groomer}
          </p>
        </Field>
        <Field label="Duración prevista">
          <p>
            {a.duration} min + {a.travel} min de traslado
          </p>
        </Field>
        <Field label="Tiempo real">
          <p>
            {a.actualMinutes !== undefined
              ? `${a.actualMinutes} minutos`
              : a.status === "En servicio"
                ? "Cronómetro iniciado"
                : "Por registrar"}
          </p>
        </Field>
      </div>
      <div className="detail-address">
        <MapPin size={18} />
        <p>{cn(a.clientId)?.address}</p>
      </div>
      {pet(a)?.notes && (
        <div className="info-note">
          <CircleAlert />
          <p>{pet(a)?.notes}</p>
        </div>
      )}
      {a.notes && <p className="muted">{a.notes}</p>}
      <div className="payment-summary">
        <span>
          Total <b>{money(a.price)}</b>
        </span>
        <span>
          Pagado <b>{money(paid(s, a.id))}</b>
        </span>
        <span>
          Pendiente <b className="debt">{money(balance(s, a))}</b>
        </span>
      </div>
      <div className="button-row">
        {a.status === "Confirmado" && (
          <>
            <Button
              disabled={busy || !ready}
              onClick={() =>
                save({ type: "status", id: a.id, status: "En servicio" })
              }
            >
              Iniciar servicio
            </Button>
            {admin && (
              <Button variant="outline" onClick={() => open("appointment", a)}>
                Editar cita
              </Button>
            )}
          </>
        )}
        {a.status === "En servicio" && (
          <Button
            disabled={busy || !ready}
            onClick={() =>
              save({ type: "status", id: a.id, status: "Completado" })
            }
          >
            Finalizar servicio
          </Button>
        )}
        {balance(s, a) > 0 && (
          <Button
            variant="outline"
            onClick={() => open("payment", { appointmentId: a.id })}
          >
            Registrar pago
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            open("incident", { clientId: a.clientId, appointmentId: a.id })
          }
        >
          Incidencia
        </Button>
        {admin && a.status !== "Cancelado" && (
          <Button variant="outline" onClick={() => open("outcome", a)}>
            Ajustar tiempo y costos
          </Button>
        )}
        {admin && a.status === "Confirmado" && (
          <Button variant="ghost" onClick={() => setCancel(a)}>
            Cancelar cita
          </Button>
        )}
      </div>
    </>
  );
}
