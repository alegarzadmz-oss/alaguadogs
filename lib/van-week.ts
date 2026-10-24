import type { Payment, State } from "./operations";
import {
  weeklyDashboard,
  summarizeVisits,
  type BoardVisit,
} from "./route-history";

export function needsPaymentReview(visit: BoardVisit) {
  return (
    visit.price === null ||
    (visit.kind === "history"
      ? visit.received !== true
      : visit.paidAmount < visit.price)
  );
}

export function vanWeekDetail(
  state: State,
  visits: BoardVisit[],
  date: string,
  vanId: string,
) {
  const week = weeklyDashboard(visits, state.vans, date, vanId);
  const rows = [...week.rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time || "99:99").localeCompare(b.time || "99:99") ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
  const directory = new Map(state.clients.map((client) => [client.id, client]));
  const grouped = new Map<string, BoardVisit[]>();
  const unlinked: BoardVisit[] = [];
  for (const row of rows) {
    if (row.clientId && directory.has(row.clientId)) {
      const group = grouped.get(row.clientId) || [];
      group.push(row);
      grouped.set(row.clientId, group);
    } else unlinked.push(row);
  }
  const byMethod = new Map<string, number>();
  const paymentsByAppointment = new Map<string, Payment[]>();
  const add = (method: string, amount: number) => {
    if (amount > 0) byMethod.set(method, (byMethod.get(method) || 0) + amount);
  };
  const appointmentIds = new Set(
    rows.filter((row) => row.kind === "appointment").map((row) => row.id),
  );
  for (const payment of state.payments)
    if (appointmentIds.has(payment.appointmentId)) {
      add(payment.method, payment.amount);
      const payments = paymentsByAppointment.get(payment.appointmentId) || [];
      payments.push(payment);
      paymentsByAppointment.set(payment.appointmentId, payments);
    }
  for (const row of rows)
    if (row.kind === "history")
      add(
        row.method === "Pendiente" ? "Forma por confirmar" : row.method,
        row.paidAmount,
      );
  return {
    ...week,
    rows,
    pending: rows.filter(needsPaymentReview),
    clients: [...grouped]
      .map(([id, clientRows]) => ({
        client: directory.get(id)!,
        rows: clientRows,
        summary: summarizeVisits(clientRows),
      }))
      .sort((a, b) => a.client.name.localeCompare(b.client.name, "es")),
    unlinked,
    paymentsByAppointment,
    incomeByMethod: [...byMethod].map(([method, amount]) => ({
      method,
      amount,
    })),
  };
}
