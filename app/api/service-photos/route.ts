import { z } from "zod";
import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { AccessError } from "@/lib/team";
import { serviceTargetSchema } from "@/lib/service-closeout";
import { normalizeServicePhoto } from "@/lib/service-photo";
import {
  addServicePhoto,
  CloseoutError,
  removeServicePhoto,
  readCloseout,
} from "@/db/service-closeout";
export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  try {
    const user = await getPortalUser();
    if (!user)
      return json({ error: "Inicia sesión antes de guardar fotos." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Origen no permitido." }, 403);
    const member = await memberFor(user);
    if (member.role === "reception")
      throw new AccessError(
        "Recepción no puede acceder a las fotos de servicio.",
      );
    if (Number(request.headers.get("content-length") || 0) > 3000000)
      return json({ error: "La foto es demasiado grande." }, 413);
    const form = await request.formData();
    const target = serviceTargetSchema.safeParse({
      kind: form.get("kind"),
      id: form.get("id"),
    });
    const photoId = z.uuid().safeParse(form.get("photoId"));
    if (!target.success || !photoId.success)
      return json({ error: "Revisa la visita de esta foto." }, 400);
    await readCloseout(member, target.data);
    if (form.get("action") === "remove")
      return json({
        photos: await removeServicePhoto(member, target.data, photoId.data),
      });
    const file = form.get("file"),
      caption = String(form.get("caption") || "").trim();
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 2500000 ||
      caption.length > 160
    )
      return json(
        {
          error:
            "Selecciona una foto y un nombre de mascota de hasta 160 caracteres.",
        },
        400,
      );
    let bytes;
    try {
      bytes = await normalizeServicePhoto(
        Buffer.from(await file.arrayBuffer()),
      );
    } catch {
      return json(
        { error: "No se pudo abrir la imagen. Usa una foto JPG, PNG o WebP." },
        400,
      );
    }
    return json({
      photos: await addServicePhoto(
        member,
        target.data,
        photoId.data,
        caption,
        bytes,
      ),
    });
  } catch (e) {
    if (e instanceof AccessError) return json({ error: e.message }, 403);
    if (e instanceof CloseoutError) return json({ error: e.message }, 400);
    console.error(
      "Service photo failed",
      e instanceof Error ? e.name : "Unknown",
    );
    return json(
      {
        error:
          "No se pudo confirmar el guardado de la foto. Conserva la selección y reintenta.",
      },
      503,
    );
  }
}
