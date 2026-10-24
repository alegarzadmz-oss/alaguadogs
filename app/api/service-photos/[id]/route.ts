import { get } from "@vercel/blob";
import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { AccessError } from "@/lib/team";
import { CloseoutError, servicePhotoPath } from "@/db/service-closeout";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getPortalUser();
    if (!user) return new Response(null, { status: 401 });
    const member = await memberFor(user),
      { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const path = await servicePhotoPath(member, id);
    const result = await get(path, { access: "private" });
    if (!result || result.statusCode !== 200)
      return new Response(null, { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return new Response(null, {
      status:
        e instanceof AccessError ? 403 : e instanceof CloseoutError ? 404 : 503,
    });
  }
}
