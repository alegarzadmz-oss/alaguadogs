"use client";
import { money } from "@/lib/operations";
import type { ServiceReceipt } from "@/lib/service-closeout";
export function ReceiptAmounts({ receipt: r }: { receipt: ServiceReceipt }) {
  return (
    <dl className="service-receipt-amounts">
      <div>
        <dt>Servicio</dt>
        <dd>{r.price === null ? "Importe por confirmar" : money(r.price)}</dd>
      </div>
      <div>
        <dt>Pago del servicio</dt>
        <dd>{r.paid === null ? "Pendiente de confirmar" : money(r.paid)}</dd>
      </div>
      <div>
        <dt>Forma de pago</dt>
        <dd>{r.methods.join(" / ") || "Por confirmar"}</dd>
      </div>
      {r.balance !== null && (
        <div>
          <dt>Saldo del servicio</dt>
          <dd>{money(r.balance)}</dd>
        </div>
      )}
      <div>
        <dt>Propina recibida</dt>
        <dd>
          {r.tip === null ? "Por registrar" : money(r.tip)}
          {r.tip && r.tipMethod ? ` · ${r.tipMethod}` : ""}
        </dd>
      </div>
      {r.paid !== null && r.tip !== null && (
        <div className="service-receipt-total">
          <dt>Total recibido</dt>
          <dd>{money(r.paid + r.tip)}</dd>
        </div>
      )}
    </dl>
  );
}
