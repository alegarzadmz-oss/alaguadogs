import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  matchHistoryClient,
  normalized,
  ROUTE_SOURCE,
  validDay,
  weekDays,
  type RouteMethod,
  type RouteVisit,
} from "../lib/route-history";
import type { State } from "../lib/operations";

// CSV exports and the DOM-derived transfer confirmations stay in an ignored private folder.
const directory = resolve(process.argv[2] || "");
if (!process.argv[2] || !directory.includes("/private/"))
  throw Error("Indica una carpeta privada de exportación.");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL no configurada.");
const apply = process.argv.includes("--apply");
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
async function keepBackup(name: string, value: unknown) {
  try {
    await writeFile(join(directory, name), JSON.stringify(value, null, 2), {
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
function csv(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) result.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw Error("CSV incompleto.");
  if (value || row.length) {
    row.push(value);
    result.push(row);
  }
  return result;
}
type Transfer = {
  serviceDate: string;
  van: string;
  dateLabel: string;
  clientName: string;
  address: string;
  petsLabel: string;
  priceLabel: string;
  received: boolean;
  confirmedLabel: string | null;
};
const vanIds: Record<string, string> = {
  "VAN A": "v1",
  "VAN B": "v2",
  "VAN C": "v3",
  "VAN D": "v4",
};
const transferKey = (v: {
  van: string;
  serviceDate: string;
  clientName: string;
  address: string;
}) => [v.van, v.serviceDate, v.clientName, v.address].map(normalized).join("|");
try {
  const [before] =
    await db`SELECT payload,revision FROM operation_state WHERE owner='business:alagua-dogs'`;
  if (!before) throw Error("Estado de operaciones no encontrado.");
  const state = JSON.parse(before.payload) as State;
  if (!Object.values(vanIds).every((id) => state.vans.some((v) => v.id === id)))
    throw Error("Revisa la correspondencia de las cuatro unidades.");
  await keepBackup("before-state.json", before);
  const names = (await readdir(directory)).sort();
  const transfers: Transfer[] = [];
  for (const file of names.filter((name) =>
    /^transfers-week-\d{4}-\d{2}-\d{2}\.json$/.test(name),
  )) {
    const week = file.slice("transfers-week-".length, -5);
    if (!validDay(week))
      throw Error("Fecha de exportación de transferencias inválida.");
    const records = JSON.parse(
      await readFile(join(directory, file), "utf8"),
    ) as Omit<Transfer, "serviceDate">[];
    for (const record of records) {
      const serviceDate = weekDays(week).find(
        (day) =>
          normalized(
            new Intl.DateTimeFormat("es-MX", {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            }).format(new Date(day + "T12:00:00Z")),
          ) === normalized(record.dateLabel),
      );
      if (!serviceDate || typeof record.received !== "boolean")
        throw Error("Transferencia con fecha o confirmación inválida.");
      transfers.push({ ...record, serviceDate });
    }
  }
  const transferMap = new Map<string, Transfer>();
  for (const t of transfers) {
    const key = transferKey(t);
    if (transferMap.has(key))
      throw Error("Confirmación de transferencia ambigua.");
    transferMap.set(key, t);
  }
  const files = names
    .filter((name) => /^routes-\d{4}-\d{2}-\d{2}\.csv$/.test(name))
    .sort();
  const visits: RouteVisit[] = [];
  const originals: Record<string, unknown> = {};
  const usedTransfers = new Set<string>();
  const importedAt = new Date().toISOString();
  for (const file of files) {
    const records = csv(await readFile(join(directory, file), "utf8"));
    const expected = [
      "Fecha",
      "VAN",
      "Nombre",
      "Dirección",
      "Mascotas",
      "Razas",
      "Precio MXN",
      "Forma de pago",
    ];
    if (JSON.stringify(records.shift()) !== JSON.stringify(expected))
      throw Error("Esquema CSV no reconocido.");
    const order: Record<string, number> = {};
    for (const row of records) {
      if (row.length !== 8) throw Error("Fila CSV incompleta.");
      const [
        date,
        sourceVan,
        clientName,
        address,
        names,
        breeds,
        priceText,
        methodText,
      ] = row;
      if (!validDay(date) || !vanIds[sourceVan] || !clientName || !address)
        throw Error("Visita con datos básicos incompletos.");
      const method = methodText as RouteMethod;
      if (
        !["Pendiente", "Efectivo", "Tarjeta", "Transferencia"].includes(method)
      )
        throw Error("Forma de pago desconocida.");
      if (priceText !== "" && !/^\d+(\.\d{1,2})?$/.test(priceText))
        throw Error("Precio CSV inválido.");
      const price =
        priceText === "" ? null : Math.round(Number(priceText) * 100);
      const breedParts = breeds.split(";").map((p) => p.trim());
      const pets = names.split(";").map((part, i) => {
        const [name, ...rest] = part.trim().split(/\s+—\s+/);
        return {
          name: name.trim(),
          breed: breedParts[i] || rest.join(" — ").trim(),
        };
      });
      if (!pets.length || pets.some((p) => !p.name))
        throw Error("Mascota vacía en CSV.");
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            ROUTE_SOURCE,
            date,
            sourceVan,
            clientName,
            address,
            pets,
          ]),
        )
        .digest("hex");
      const visit: RouteVisit = {
        id: "routes-" + key.slice(0, 40),
        date,
        vanId: vanIds[sourceVan],
        sourceVan,
        order: (order[sourceVan] = (order[sourceVan] || 0) + 1),
        clientId: null,
        clientName,
        address,
        pets,
        price,
        method,
        received: null,
        confirmedAt: null,
        confirmedOn: null,
        confirmationNote: "",
        source: ROUTE_SOURCE,
        importedAt,
        revision: 0,
      };
      visit.clientId = matchHistoryClient(visit, state.clients);
      if (method === "Transferencia") {
        const tk = transferKey({
          van: sourceVan,
          serviceDate: date,
          clientName,
          address,
        });
        const transfer = transferMap.get(tk);
        if (!transfer || usedTransfers.has(tk))
          throw Error(
            "Transferencia no conciliada de forma única con su ruta.",
          );
        const transferAmount = Number(
          transfer.priceLabel.replace(/[^\d.]/g, ""),
        );
        if (price === null || Math.round(transferAmount * 100) !== price)
          throw Error(
            "El importe de la transferencia no coincide con la ruta.",
          );
        visit.received = transfer.received;
        visit.confirmationNote = transfer.confirmedLabel || "";
        usedTransfers.add(tk);
      }
      if (visits.some((v) => v.id === visit.id))
        throw Error("Dos visitas indistinguibles requieren revisión manual.");
      originals[visit.id] = {
        file,
        row,
        transfer:
          method === "Transferencia"
            ? transfers.find(
                (t) =>
                  t.van === sourceVan &&
                  t.clientName === clientName &&
                  t.address === address &&
                  t.serviceDate === date,
              )
            : null,
      };
      visits.push(visit);
    }
  }
  if (usedTransfers.size !== transfers.length)
    throw Error("Hay confirmaciones sin ruta exportada.");
  const existing =
    await db`SELECT id, payload, revision FROM route_visits WHERE owner='business:alagua-dogs'`;
  await keepBackup("before-history.json", existing);
  const report = {
    mode: apply ? "apply" : "dry-run",
    dates: [...new Set(visits.map((v) => v.date))],
    visits: visits.length,
    pets: visits.reduce((n, v) => n + v.pets.length, 0),
    amount: visits.reduce((n, v) => n + (v.price || 0), 0),
    missingPrice: visits.filter((v) => v.price === null).length,
    linked: visits.filter((v) => v.clientId).length,
    unlinked: visits.filter((v) => !v.clientId).length,
    transfers: transfers.length,
    receivedTransfers: visits.filter(
      (v) => v.method === "Transferencia" && v.received,
    ).length,
    receivedAmount: visits
      .filter((v) => v.received)
      .reduce((n, v) => n + (v.price || 0), 0),
    pendingTransfers: visits.filter(
      (v) => v.method === "Transferencia" && !v.received,
    ).length,
    pendingAmount: visits
      .filter((v) => v.method === "Transferencia" && !v.received)
      .reduce((n, v) => n + (v.price || 0), 0),
    newRecords: visits.filter((v) => !existing.some((e) => e.id === v.id))
      .length,
  };
  await writeFile(
    join(directory, "prepared-visits.json"),
    JSON.stringify(visits, null, 2),
  );
  await writeFile(
    join(directory, "import-report.json"),
    JSON.stringify(report, null, 2),
  );
  if (apply) {
    await db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('alaguadogs-route-history-import'))`;
      const [latest] =
        await tx`SELECT revision FROM operation_state WHERE owner='business:alagua-dogs' FOR SHARE`;
      if (latest.revision !== before.revision)
        throw Error(
          "Los clientes cambiaron. Repite la revisión de importación.",
        );
      for (const visit of visits)
        await tx`INSERT INTO route_visits (owner,id,service_date,payload,original) VALUES ('business:alagua-dogs',${visit.id},${visit.date},${tx.json(visit)},${tx.json(originals[visit.id] as never)}) ON CONFLICT (owner,id) DO NOTHING`;
      await tx`INSERT INTO team_audit (id,at,actor,action) VALUES (${crypto.randomUUID()},${importedAt},'Importación autorizada de rutas',${`Historial del ${report.dates[0]} al ${report.dates.at(-1)}: ${report.visits} visitas verificadas, ${report.transfers} transferencias conciliadas. Los registros existentes se conservaron.`})`;
    });
    const [verified] =
      await db`SELECT count(*)::integer AS visits, sum(jsonb_array_length(payload->'pets'))::integer AS pets, sum((payload->>'price')::bigint)::bigint AS amount FROM route_visits WHERE owner='business:alagua-dogs' AND id IN ${db(visits.map((v) => v.id))}`;
    if (
      verified.visits !== report.visits ||
      verified.pets !== report.pets ||
      Number(verified.amount) !== report.amount
    )
      throw Error("La comprobación posterior requiere revisión.");
    await writeFile(
      join(directory, "after-verification.json"),
      JSON.stringify(verified, null, 2),
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.end();
}
