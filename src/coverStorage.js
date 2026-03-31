import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COVERS_DIR = path.join(__dirname, "../uploads/covers");

export async function ensureCoversDir() {
  await fs.mkdir(COVERS_DIR, { recursive: true });
}

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function extForImageMime(mime) {
  return MIME_TO_EXT[mime] ?? null;
}

/** @param {string | undefined} filename basename only */
export async function removeStoredCover(filename) {
  if (!filename || typeof filename !== "string" || /[/\\]/.test(filename)) {
    return;
  }
  try {
    await fs.unlink(path.join(COVERS_DIR, filename));
  } catch {
    /* missing file is fine */
  }
}
