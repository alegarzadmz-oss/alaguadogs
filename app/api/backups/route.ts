import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { AccessError } from "@/lib/team";
import { BackupError } from "@/lib/backup/format";
import { backupStatus, performBackup } from "@/lib/backup/run";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
async function admin() {
  const user = await getPortalUser();
  if (!user) return null;
  const member = await memberFor(user);
  if (member.role !== "admin")
    throw new AccessError(
      "Solo Administración puede consultar o crear respaldos.",
    );
  return member;
}
function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof AccessError || e instanceof BackupError
          ? e.message
          : "No se pudo consultar el respaldo.",
      code: e instanceof BackupError ? e.code : undefined,
    },
    {
      status:
        e instanceof AccessError
          ? 403
          : e instanceof BackupError && e.code === "already_running"
            ? 409
            : 503,
      headers,
    },
  );
}
export async function GET() {
  try {
    if (!(await admin())) return new Response(null, { status: 401, headers });
    return Response.json(await backupStatus(), { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const member = await admin();
    if (!member) return new Response(null, { status: 401, headers });
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return new Response(null, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 500) return new Response(null, { status: 413, headers });
    let operationId: string;
    try {
      const data = JSON.parse(raw);
      operationId = data.operationId;
      if (!/^[a-f0-9-]{36}$/.test(operationId)) throw Error();
    } catch {
      return new Response(null, { status: 400, headers });
    }
    return Response.json(
      await performBackup({ scheduleKey: `manual:${operationId}`, member }),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
