"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GroomerDay } from "./groomer-day";
import { demoState, today } from "@/lib/operations";
import { workdayState } from "@/lib/workday";
import type { TeamMember } from "@/lib/team";
import { routeSource, type SavedRoute } from "@/lib/saved-routes";

export function GroomerPreview() {
  const [open, setOpen] = useState(false);
  const day = today();
  const member: TeamMember = {
    id: "example-groomer",
    name: "Bañador de ejemplo",
    email: "example@example.test",
    role: "groomer",
    status: "active",
    userId: null,
    vanId: "v1",
    version: 0,
  };
  const source = demoState();
  source.base.address = "Base del negocio";
  source.appointments = source.appointments.slice(0, 2).map((a, i) => ({
    ...a,
    vanId: "v1",
    groomerId: member.id,
    date: day,
    status: i === 0 ? ("En servicio" as const) : ("Confirmado" as const),
  }));
  const state = workdayState(source, member, day, []);
  const route: SavedRoute = {
    ...routeSource(source, [], day, "v1"),
    id: "example-route",
    status: "active",
    createdAt: "",
    createdBy: "Ejemplo",
    publishedAt: null,
    assignedTo: member.id,
    assignedName: member.name,
    revision: 0,
    stale: false,
  };
  return (
    <section className="panel app-team-panel">
      <h2>App del equipo</h2>
      <p>
        Administración conserva el portal completo. Cada bañador trabaja con sus
        servicios y rutas publicados, registra pagos e incidencias y guarda
        fotos y propinas. Los contactos de clientes quedan reservados a
        Administración.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Ver ejemplo de la vista del bañador
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="groomer-preview-dialog">
          <DialogHeader>
            <DialogTitle>Así trabaja el bañador en la app</DialogTitle>
            <DialogDescription>
              Ejemplo con datos ficticios. Los controles de trabajo están
              deshabilitados; no se modifica la operación.
            </DialogDescription>
          </DialogHeader>
          <GroomerDay
            s={state}
            viewer={member}
            date={day}
            data={{ routes: [route], visits: [] }}
            busy={false}
            error=""
            notice=""
            onRefresh={async () => {}}
            onOpen={() => {}}
            onSave={async () => false}
            onWork={async () => false}
            preview
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
