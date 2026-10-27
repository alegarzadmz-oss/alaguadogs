import { z } from "zod";
import {
  classifyService,
  matchHistoryClient,
  normalized,
  paymentMethods,
  reviseHistoryVisit,
  validDay,
  type RouteService,
  type RouteVisit,
} from "./route-history";
import type { State } from "./operations";

const serviceSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    kind: z.enum(["full", "additional", "unknown"]),
    quantity: z.number().int().min(1).max(100),
  })
  .strict();
const petSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    breed: z.string().trim().max(160),
    quantity: z.number().int().min(1).max(100).optional(),
    services: z.array(serviceSchema).max(20).optional(),
  })
  .strict();
export const captureSchema = z
  .object({
    date: z.string().refine(validDay, "Fecha inválida"),
    vanId: z.string().min(1).max(100),
    clientId: z.string().max(100).nullable(),
    clientName: z.string().trim().max(160),
    address: z.string().trim().max(600),
    pets: z.array(petSchema).max(40),
    extras: z
      .array(serviceSchema)
      .max(30)
      .refine(
        (items) => items.every((s) => s.kind === "additional"),
        "Clasifica los servicios completos dentro de cada mascota.",
      ),
    notes: z.string().trim().max(4000),
    price: z.number().int().min(0).max(100000000).nullable(),
    method: z.enum(paymentMethods),
  })
  .strict();
export type CaptureInput = z.infer<typeof captureSchema>;
export type CaptureRow = CaptureInput & { warnings: string[] };
export function toCaptureInput(v: CaptureInput | RouteVisit): CaptureInput {
  return {
    date: v.date,
    vanId: v.vanId,
    clientId: v.clientId,
    clientName: v.clientName,
    address: v.address,
    pets: v.pets,
    extras: v.extras || [],
    notes: v.notes || "",
    price: v.price,
    method: v.method,
  };
}
export function validateCapture(input: unknown, state: State): CaptureInput {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success)
    throw Error(
      "Revisa la fecha, los nombres, mascotas, servicios e importes de la visita.",
    );
  const v = parsed.data;
  if (!state.vans.some((van) => van.id === v.vanId))
    throw Error("Selecciona una VAN existente.");
  if (v.clientId && !state.clients.some((c) => c.id === v.clientId))
    throw Error(
      "Selecciona una ficha existente o conserva la visita sin vincular.",
    );
  return {
    ...v,
    clientName: v.clientName || "Cliente por confirmar",
    address: v.address || "Dirección por confirmar",
  };
}
export function captureSignature(
  v: Pick<CaptureInput, "date" | "clientName" | "address" | "pets"> & {
    vanId?: string;
  },
  includeVan = true,
) {
  return JSON.stringify([
    v.date,
    includeVan ? v.vanId : "",
    normalized(v.clientName),
    normalized(v.address),
    v.pets
      .map((p) => [
        normalized(p.name),
        p.quantity ?? 1,
        p.services
          ?.map((s) => [normalized(s.name), s.kind, s.quantity])
          .sort() ?? [],
      ])
      .sort(),
  ]);
}
export function duplicateVisits<
  T extends Pick<
    RouteVisit,
    "date" | "clientName" | "address" | "pets" | "clientId"
  > & { deletedAt?: string | null },
>(v: CaptureInput, existing: T[]) {
  const pets = (values: RouteVisit["pets"]) =>
    JSON.stringify(
      values.map((p) => [normalized(p.name), p.quantity ?? 1]).sort(),
    );
  return existing.filter(
    (row) =>
      !row.deletedAt &&
      row.date === v.date &&
      normalized(row.address) === normalized(v.address) &&
      (normalized(row.clientName) === normalized(v.clientName) ||
        !!(v.clientId && row.clientId === v.clientId)) &&
      pets(row.pets) === pets(v.pets),
  );
}
export function newCapturedVisit(
  input: CaptureInput,
  id: string,
  order: number,
  state: State,
  now: string,
): RouteVisit {
  const v = validateCapture(input, state);
  return {
    ...v,
    id,
    order,
    origin: "captured",
    sourceVan: "",
    received: v.method === "Pendiente" ? null : false,
    confirmedAt: null,
    confirmedOn: null,
    confirmedBy: null,
    confirmationNote: "",
    source: "Captura en alagua.dog",
    importedAt: now,
    revision: 0,
  };
}
export function reviseVisitDetails(
  current: RouteVisit,
  input: unknown,
  state: State,
): RouteVisit {
  const v = validateCapture(input, state);
  const financial = reviseHistoryVisit(
    current,
    {
      price: v.price,
      method: v.method,
      received: current.received,
      clientId: v.clientId,
      vanId: v.vanId,
    },
    state,
  );
  return { ...financial, ...v };
}
const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const vanLabel = (id: string) =>
  /^v[1-4]$/.test(id)
    ? `VAN ${String.fromCharCode(64 + Number(id.slice(1)))}`
    : id;
function header(line: string, date: string) {
  let nextDate = date;
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const numeric = line.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  const named = line
    .toLowerCase()
    .match(
      new RegExp(
        `\\b(\\d{1,2})\\s+(?:de\\s+)?(${months.join("|")})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`,
      ),
    );
  if (iso) nextDate = iso[1];
  else if (numeric)
    nextDate = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  else if (named)
    nextDate = `${named[3] || date.slice(0, 4)}-${String(months.indexOf(named[2]) + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  const van =
    line.match(/\bVAN\s*[:#-]?\s*([ABCD])\b/i) ||
    line.match(/\b(?:Camioneta|VAN)\s*0?([1-4])\b/i);
  return {
    date: nextDate,
    vanId: van
      ? `v${/[ABCD]/i.test(van[1]) ? van[1].toUpperCase().charCodeAt(0) - 64 : Number(van[1])}`
      : null,
    found: !!(iso || numeric || named || van),
  };
}
function amount(value: string) {
  const clean = value
    .replace(/\$/g, "")
    .replace(/\b(?:MXN|pesos)\b/gi, "")
    .trim()
    .replace(/,(?=\d{3}(?:\D|$))/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(clean)
    ? Math.round(Number(clean) * 100)
    : null;
}
function method(value: string): CaptureInput["method"] {
  const v = normalized(value);
  return /transfer/.test(v)
    ? "Transferencia"
    : /efectivo|cash/.test(v)
      ? "Efectivo"
      : /tarjeta/.test(v)
        ? "Tarjeta"
        : "Pendiente";
}
function newRow(date: string, vanId: string): CaptureRow {
  return {
    date,
    vanId,
    clientId: null,
    clientName: "",
    address: "",
    pets: [],
    extras: [],
    notes: "",
    price: null,
    method: "Pendiente",
    warnings: [],
  };
}
function addNote(v: CaptureRow, note: string) {
  v.notes = [v.notes, note].filter(Boolean).join("\n");
}
function parseServices(text: string): RouteService[] {
  return text
    .split(/\s*(?:[·;,+]|\s+(?:y|con)\s+)\s*/i)
    .filter(Boolean)
    .map((part) => {
      const count = part.match(/^(\d+)\s+(.+)$/);
      const name = count ? count[2] : part;
      return {
        name,
        kind: classifyService(name),
        quantity: count ? Number(count[1]) : 1,
      };
    });
}
function petLine(text: string, row: CaptureRow): boolean {
  const line = text
    .replace(/^\s*(?:mascotas?|perros?|gatos?)\s*:\s*/i, "")
    .trim();
  const countService = line.match(
    /^(\d+)\s+(baños?|banos?|cortes?\s+de\s+uñas?|cortes?\s+de\s+unas?)(.*)$/i,
  );
  if (countService) {
    const quantity = Number(countService[1]),
      name = countService[2],
      kind = classifyService(name);
    if (kind === "additional") row.extras.push({ name, kind, quantity });
    else
      row.pets.push({
        name: "Nombres por confirmar",
        breed: "",
        quantity,
        services: [{ name, kind, quantity: 1 }],
      });
    const rest = countService[3]
      .replace(/^\s*(?:y|\+|,|adicionales?)\s*/i, "")
      .trim();
    if (rest && !petLine(rest, row)) addNote(row, rest);
    return true;
  }
  const parts = line
    .split(/\s*[—–|]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    if (/^mascotas?\s*:/i.test(text)) {
      for (const name of line.split(/\s*(?:,|;|\sy\s)\s*/).filter(Boolean))
        row.pets.push({ name, breed: "", services: [] });
      return true;
    }
    return false;
  }
  const names = parts[0].split(/\s+y\s+|\s*[,;]\s*/).filter(Boolean);
  const serviceAt = parts.findIndex(
    (p, i) => i > 0 && classifyService(p) !== "unknown",
  );
  const breed = serviceAt === 1 ? "" : parts[1] || "";
  const services: RouteService[] =
    serviceAt > 0 ? parseServices(parts.slice(serviceAt).join(" · ")) : [];
  for (const name of names) row.pets.push({ name, breed, services });
  return true;
}
function parseDelimited(
  text: string,
  fallbackDate: string,
  fallbackVan: string,
): CaptureRow[] | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const clean = (line: string) => line.trim().replace(/^\*+|\*+$/g, "");
  function cells(line: string, separator: string) {
    let input = line;
    if (separator === "|") {
      input = input.trim();
      if (input.startsWith("|"))
        input = input.slice(1).replace(/(?<!\\)\|$/, "");
    }
    const values: string[] = [];
    let value = "",
      quoted = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (separator === "|" && c === "\\" && input[i + 1] === "|") {
        value += "|";
        i++;
      } else if (separator !== "|" && c === '"' && (quoted || !value.trim())) {
        if (quoted && input[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === separator && !quoted) {
        values.push(value.trim());
        value = "";
      } else value += c;
    }
    values.push(value.trim());
    return { values, quoted };
  }
  const isHeading = (values: string[]) =>
    values.map(normalized).some((h) => /^(cliente|nombre)$/.test(h)) &&
    values.map(normalized).some((h) => /^(direccion|domicilio)$/.test(h));
  const first = lines.findIndex((line) =>
    ["\t", "|", ","].some((s) => isHeading(cells(line, s).values)),
  );
  if (first < 0) return null;
  const separator = ["\t", "|", ","].find((s) =>
    isHeading(cells(lines[first], s).values),
  )!;
  let headings: string[] = [],
    selectedDate = fallbackDate,
    selectedVan = fallbackVan;
  const result: CaptureRow[] = [];
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    if (!line.trim() || /^\s*```/.test(line)) continue;
    const h = header(clean(line), selectedDate);
    if (index < first || (!line.includes(separator) && h.found)) {
      if (h.found) {
        selectedDate = h.date;
        selectedVan = h.vanId || selectedVan;
      } else if (index >= first || line.includes(separator)) {
        throw Error(
          `La línea ${index + 1} no es una fila de la tabla. Revísala antes de importar.`,
        );
      }
      continue;
    }
    let record = cells(line, separator);
    const lineNumber = index + 1;
    while (record.quoted && index + 1 < lines.length) {
      line += "\n" + lines[++index];
      record = cells(line, separator);
    }
    if (record.quoted)
      throw Error(
        `Hay comillas sin cerrar en la fila que empieza en la línea ${lineNumber}.`,
      );
    const values = record.values;
    if (isHeading(values)) {
      headings = values.map(normalized);
      continue;
    }
    if (values.every((v) => /^:?-{3,}:?$/.test(v))) continue;
    if (values.every((v) => !v)) continue;
    if (values.length !== headings.length)
      throw Error(
        `La línea ${lineNumber} tiene ${values.length} columnas; se esperaban ${headings.length}. Revisa separadores y celdas antes de importar.`,
      );
    const get = (re: RegExp) =>
      values[headings.findIndex((h) => re.test(h))] || "";
    const rowHeader = header(
      `${get(/^fecha$/)} ${get(/^(van|unidad|camioneta)$/)}`,
      selectedDate,
    );
    const row = newRow(rowHeader.date, rowHeader.vanId || selectedVan);
    row.clientName = get(/^(cliente|nombre)$/);
    row.address = get(/^(direccion|domicilio)$/);
    if (!row.clientName && !row.address && !get(/^mascotas?$/)) {
      throw Error(
        `La línea ${lineNumber} no identifica una visita. Conserva las observaciones dentro de la fila de su cliente.`,
      );
    }
    const names = get(/^mascotas?$/),
      breeds = get(/^razas?$/),
      services = get(/^servicios?$/);
    for (const name of names.split(/\s*[;]\s*/).filter(Boolean)) {
      if (!petLine(name, row))
        for (const petName of name.split(/\s*,\s*|\s+y\s+/i).filter(Boolean))
          row.pets.push({ name: petName, breed: breeds, services: [] });
    }
    if (services)
      for (const pet of row.pets) {
        if (!pet.breed) pet.breed = breeds;
        if (!pet.services?.length) pet.services = parseServices(services);
      }
    const price = get(/^(precio|preciomxn|importe|importemxn)$/);
    row.price = price ? amount(price) : null;
    row.notes = [get(/^(notas|observaciones)$/), row.notes]
      .filter(Boolean)
      .join("\n");
    const knownHeading =
      /^(?:numero|orden|fecha|van|unidad|camioneta|cliente|nombre|direccion|domicilio|mascotas?|razas?|servicios?|precio|preciomxn|importe|importemxn|pago|formadepago|metododepago|efectivotransferencia|efectivotransferenciatarjeta|notas|observaciones)$/;
    for (const [column, key] of headings.entries()) {
      if (key && !knownHeading.test(key) && values[column])
        addNote(row, `${key}: ${values[column]}`);
    }
    const payment = get(
      /^(pago|formadepago|metododepago|efectivotransferencia|efectivotransferenciatarjeta)$/,
    );
    const paymentKey = normalized(payment);
    row.method =
      /^(efectivo|cash|tarjeta|transferencia|transferenciabancaria)$/.test(
        paymentKey,
      )
        ? method(payment)
        : "Pendiente";
    if (
      payment &&
      !/^(pendiente|porconfirmar|sinpago)$/.test(paymentKey) &&
      row.method === "Pendiente"
    ) {
      row.warnings.push(
        "La forma de pago requiere revisión; no se eligió automáticamente.",
      );
      addNote(row, "Pago del texto por revisar: " + payment);
    }
    if (price && row.price === null) {
      row.warnings.push("No se interpretó el importe; quedó pendiente.");
      addNote(row, "Importe del texto por revisar: " + price);
    }
    result.push(row);
  }
  return result;
}
export function parseRouteTable(
  text: string,
  date: string,
  vanId: string,
  state?: State,
): CaptureRow[] {
  return parseRouteText(text, date, vanId, state, "table");
}
export function parseRouteText(
  text: string,
  date: string,
  vanId: string,
  state?: State,
  format: "auto" | "table" = "auto",
): CaptureRow[] {
  if (text.length > 60000)
    throw Error("Pega una ruta de hasta 60,000 caracteres.");
  let rows = parseDelimited(text.trim(), date, vanId);
  if (!rows && format === "table")
    throw Error(
      "Pega una tabla con encabezados Cliente, Dirección y Mascota(s). También puedes elegir Texto de WhatsApp para una lista en párrafos.",
    );
  if (!rows) {
    rows = [];
    let row: CaptureRow | null = null;
    let selectedDate = date,
      selectedVan = vanId;
    const finish = () => {
      if (
        row &&
        (row.clientName || row.address || row.pets.length || row.extras.length)
      ) {
        rows!.push(row);
        row = null;
      }
    };
    const lines = text.split(/\r?\n/).map((raw) =>
      raw
        .trim()
        .replace(/^[•]\s*/, "")
        .replace(/^\*+|\*+$/g, "")
        .trim(),
    );
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line) {
        if (row?.pets.length) finish();
        continue;
      }
      const h = header(line, selectedDate);
      if (
        h.found &&
        (h.vanId ||
          /^(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|fecha\s*:|20\d{2})/i.test(
            line,
          ))
      ) {
        finish();
        selectedDate = h.date;
        selectedVan = h.vanId || selectedVan;
        continue;
      }
      if (/^(?:cliente|nombre)\s*:/i.test(line)) {
        finish();
        row = newRow(selectedDate, selectedVan);
        row.clientName = line.replace(/^[^:]+:\s*/, "");
        continue;
      }
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      const nextLine =
        lines.slice(index + 1).find((value) => value.trim()) || "";
      const nextIsAddress =
        /^(?:direcci[oó]n|domicilio)\s*:/i.test(nextLine) ||
        (/[\p{L}]/u.test(nextLine) &&
          /\d/.test(nextLine) &&
          !/^\d+[.)]\s/.test(nextLine) &&
          !/[—–]|\s-\s/.test(nextLine) &&
          !header(nextLine, selectedDate).found &&
          !/^(?:precio|importe|total|pago|mascotas?|observaci[oó]n|nota|\$|\+?\d[\d ().-]{8,}$|\d+\s+(?:baños?|banos?|cortes?))/i.test(
            nextLine,
          ));
      const plainClient =
        /^[\p{L}][\p{L} .’'&-]{0,159}$/u.test(line) &&
        !/^(?:observaci[oó]n|notas?|referencias?|precio|importe|total|pago|direcci[oó]n|domicilio|mascotas?)\b/i.test(
          line,
        );
      const numberedClient = numbered && !/[—–]|\s-\s/.test(numbered[1]);
      if (numberedClient || (plainClient && nextIsAddress)) {
        finish();
        row = newRow(selectedDate, selectedVan);
        row.clientName = numberedClient ? numbered[1] : line;
        continue;
      }
      if (
        !row &&
        rows.length &&
        /^(?:observaci[oó]n(?:es)?|notas?|referencias?|precio|importe|total|pago|forma de pago|m[eé]todo de pago)\s*:/i.test(
          line,
        )
      )
        row = rows.pop()!;
      row ||= newRow(selectedDate, selectedVan);
      if (/^(?:observaci[oó]n(?:es)?|notas?|referencias?)\s*:/i.test(line)) {
        addNote(row, line.replace(/^[^:]+:\s*/, ""));
        continue;
      }
      if (/^(?:precio|importe|total)\s*:|^\$\s*\d/i.test(line)) {
        const value = line.replace(/^[^:$]+:\s*/, "");
        row.price = amount(value);
        if (row.price === null) {
          row.warnings.push("Revisar el importe indicado en el texto.");
          addNote(row, "Importe del texto por revisar: " + value);
        }
        continue;
      }
      if (
        /^(?:pago|forma de pago|m[eé]todo de pago)\s*:|^(?:efectivo|transferencia|tarjeta|pendiente)$/i.test(
          line,
        )
      ) {
        row.method = method(line);
        continue;
      }
      if (/^(?:direcci[oó]n|domicilio)\s*:/i.test(line)) {
        row.address = line.replace(/^[^:]+:\s*/, "");
        continue;
      }
      if (row.address && petLine(line, row)) continue;
      if (/\d/.test(line) && !row.address) {
        row.address = line;
        continue;
      }
      if (!row.clientName) {
        row.clientName = line.replace(/^\d+[.)]\s*/, "");
        continue;
      }
      addNote(row, line);
      row.warnings.push(
        "Hay texto sin interpretar; se conservó en observaciones.",
      );
    }
    finish();
  }
  if (rows.length > 100)
    throw Error("Revisa hasta 100 visitas por importación.");
  return rows.map((row) => {
    if (!validDay(row.date))
      row.warnings.push("La fecha no es válida; corrígela antes de guardar.");
    if (!row.clientName) row.warnings.push("Cliente por confirmar.");
    if (!row.address) row.warnings.push("Domicilio por confirmar.");
    if (!row.pets.length)
      row.warnings.push("Faltan las mascotas; no se supuso ninguna cantidad.");
    if (row.pets.some((p) => !p.services?.length))
      row.warnings.push("Hay servicios por confirmar.");
    if (state)
      row.clientId = matchHistoryClient(
        {
          ...row,
          clientName: row.clientName || "",
          address: row.address || "",
        },
        state.clients.filter(
          (c) => normalized(c.name) === normalized(row.clientName),
        ),
      );
    return row;
  });
}
