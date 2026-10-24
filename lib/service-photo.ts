import sharp from "sharp";
export async function normalizeServicePhoto(bytes: Buffer) {
  if (!bytes.length || bytes.length > 2500000)
    throw Error("Selecciona una foto de hasta 2.5 MB después de comprimir.");
  const image = sharp(bytes, {
    limitInputPixels: 40000000,
    failOn: "warning",
    animated: false,
  });
  const info = await image.metadata();
  if (
    !["jpeg", "png", "webp", "heif"].includes(info.format || "") ||
    !info.width ||
    !info.height ||
    (info.pages || 1) > 1
  )
    throw Error("Usa una fotografía JPG, PNG o WebP.");
  // Re-encoding removes EXIF/GPS and prevents preserving active file content.
  return image
    .autoOrient()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}
