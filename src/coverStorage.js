import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_COVERS_DIR = path.join(__dirname, "../uploads/covers");
const SERVERLESS_COVERS_DIR = path.join(os.tmpdir(), "libraryCatalog", "covers");

// Vercel's deployment path is read-only; use tmp storage there.
export const COVERS_DIR = process.env.VERCEL ? SERVERLESS_COVERS_DIR : LOCAL_COVERS_DIR;

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
