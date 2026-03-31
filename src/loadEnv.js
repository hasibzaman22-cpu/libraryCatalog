import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env");

if (!existsSync(envPath) && !process.env.VERCEL) {
  console.warn(
    `No .env file at ${envPath}. Copy .env.example to .env and add your settings.`
  );
}

dotenv.config({ path: envPath });
