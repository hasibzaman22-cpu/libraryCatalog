import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import localtunnel from "localtunnel";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const port = Number(process.env.PORT) || 3000;

const tunnel = await localtunnel({ port });

console.log(`
  Public URL:  ${tunnel.url}
  Local app:   http://127.0.0.1:${port}

  Keep this terminal open. In another terminal run:  npm start
  If the server picked a different port, set PORT in .env or run:
    npx lt --port <that-port>
`);

tunnel.on("close", () => {
  process.exit(0);
});
