"use client";

/**
 * Redimensiona/comprime uma imagem no navegador (canvas) antes do upload.
 * Motivo: na Vercel o corpo de cada requisição é limitado a 4,5 MB, e fotos de celular
 * costumam ter 3–8 MB. Arquivos que não são imagem são devolvidos sem alteração.
 */
export async function comprimirImagem(file: File, maxLado = 1600, qualidade = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  // imagem já pequena: mantém o original
  if (escala === 1 && file.size <= 600 * 1024) {
    bitmap.close();
    return file;
  }
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // fundo branco para PNG com transparência
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
  if (!blob || blob.size >= file.size) return file;
  const nome = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
  return new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() });
}

/** Foto de perfil: quadrada, 512 px, JPEG (~30–80 KB). */
export async function prepararFotoPerfil(file: File): Promise<File> {
  if (!/^image\//.test(file.type)) throw new Error("Selecione um arquivo de imagem");
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;
  const out = Math.min(512, lado);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não foi possível processar a imagem");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
