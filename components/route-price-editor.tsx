"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";

export type SaveRoutePrice = (
  record: RouteVisit,
  changes: Record<string, unknown>,
) => Promise<boolean>;

export function RoutePriceDialog({
  record,
  onClose,
  onSave,
}: {
  record: RouteVisit | null;
  onClose: () => void;
  onSave: SaveRoutePrice;
}) {
  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rh-price-dialog">
        <DialogHeader>
          <DialogTitle>
            {record?.price === null ? "Capturar precio" : "Editar precio"}
          </DialogTitle>
          <DialogDescription>
            {record?.clientName} · {record?.date} ·{" "}
            {record?.pets.map((p) => p.name).join(", ")}
          </DialogDescription>
        </DialogHeader>
        {record && (
          <PriceForm
            key={record.id + ":" + record.revision}
            record={record}
            onClose={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({
  record,
  onClose,
  onSave,
}: {
  record: RouteVisit;
  onClose: () => void;
  onSave: SaveRoutePrice;
}) {
  const [value, setValue] = useState(
    record.price === null ? "" : (record.price / 100).toFixed(2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="rh-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const amount = value.trim().replace(",", ".");
        if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
          setError(
            "Captura un precio en pesos, con un máximo de dos decimales.",
          );
          return;
        }
        const [whole, fraction = ""] = amount.split(".");
        const price = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        if (!Number.isSafeInteger(price) || price > 100000000) {
          setError("El precio debe estar entre $0 y $1,000,000 MXN.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          if (
            await onSave(record, {
              price,
              method: record.method,
              received: record.received,
              clientId: record.clientId,
              vanId: record.vanId,
            })
          )
            onClose();
          else
            setError(
              "No se pudo guardar. Actualiza los datos si otra persona modificó esta visita.",
            );
        } catch {
          setError(
            "No se pudo confirmar el guardado. Actualiza antes de intentar de nuevo.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>{record.address}</p>
      <label>
        Precio total de la visita (MXN)
        <Input
          autoFocus
          required
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ejemplo: 650.00"
          disabled={busy}
        />
      </label>
      <p className="footnote">
        {record.price === null
          ? "El precio está pendiente."
          : `Precio actual: ${money(record.price)}.`}{" "}
        El importe corresponde a toda la visita, sin propina. Capturar o cambiar
        el precio no registra un pago y reinicia su confirmación de cobro cuando
        el importe cambia.
      </p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      <div className="button-row">
        <Button disabled={busy} type="submit">
          {busy ? "Guardando…" : "Guardar precio"}
        </Button>
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
