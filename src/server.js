import "./loadEnv.js";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import session from "express-session";
import passport from "passport";
import { ObjectId } from "mongodb";
import { connect, getMongoConfig } from "./db.js";
import { createBookDocument } from "./book.js";
import { buildFilter } from "./bookQuery.js";
import { configurePassport } from "./configurePassport.js";
import { createAuthRouter } from "./authRouter.js";
import { scopeBooksToUser } from "./bookScope.js";
import { isGoogleOAuthConfigured } from "./googleEnv.js";

const COLLECTION = "books";
const USERS = "users";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function firstQueryParam(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function requireAuth(req, res, next) {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

async function main() {
  const client = await connect();
  const db = client.db(getMongoConfig().dbName);
  const users = db.collection(USERS);
  const coll = () => db.collection(COLLECTION);

  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ googleId: 1 }, { sparse: true });

  configurePassport(users);

  const app = express();
  app.use(express.json());

  const sessionSecret =
    process.env.SESSION_SECRET || "dev-only-change-me-in-production";
  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET not set; using a default (not for production).");
  }

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
      },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", createAuthRouter(users));

  app.get("/books", requireAuth, async (req, res) => {
    try {
      const category = firstQueryParam(req.query.category);
      const search = firstQueryParam(req.query.search);
      const filter = buildFilter({
        category: typeof category === "string" ? category : undefined,
        search: typeof search === "string" ? search : undefined,
      });
      const q = scopeBooksToUser(req.user._id, filter);
      const list = await coll().find(q).sort({ _id: 1 }).toArray();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: String(err.message ?? err) });
    }
  });

  app.post("/books", requireAuth, async (req, res) => {
    const { title, author, category, publisher } = req.body ?? {};
    if (
      typeof title !== "string" ||
      typeof author !== "string" ||
      typeof category !== "string" ||
      typeof publisher !== "string"
    ) {
      res.status(400).json({
        error:
          "JSON body must include title, author, category, and publisher as strings.",
      });
      return;
    }
    if (!title.trim() || !author.trim() || !category.trim() || !publisher.trim()) {
      res.status(400).json({
        error: "title, author, category, and publisher cannot be empty.",
      });
      return;
    }
    const doc = {
      userId: req.user._id,
      ...createBookDocument(title, author, category, publisher),
    };
    const result = await coll().insertOne(doc);
    const found = await coll().findOne({ _id: result.insertedId });
    res.status(201).json(found);
  });

  app.patch("/books/:id", requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const { title, author, category, publisher } = req.body ?? {};
    const $set = {};
    if (title !== undefined) {
      if (typeof title !== "string") {
        res.status(400).json({ error: "title must be a string." });
        return;
      }
      $set["book.title"] = title.trim();
    }
    if (author !== undefined) {
      if (typeof author !== "string") {
        res.status(400).json({ error: "author must be a string." });
        return;
      }
      $set["book.author"] = author.trim();
    }
    if (category !== undefined) {
      if (typeof category !== "string") {
        res.status(400).json({ error: "category must be a string." });
        return;
      }
      $set["book.category"] = category.trim();
    }
    if (publisher !== undefined) {
      if (typeof publisher !== "string") {
        res.status(400).json({ error: "publisher must be a string." });
        return;
      }
      $set["book.publisher"] = publisher.trim();
    }
    if (Object.keys($set).length === 0) {
      res.status(400).json({
        error: "Provide at least one of title, author, category, publisher.",
      });
      return;
    }
    const result = await coll().updateOne(
      { _id, userId: req.user._id },
      { $set }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const found = await coll().findOne({ _id });
    res.json(found);
  });

  app.delete("/books/:id", requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const result = await coll().deleteOne({ _id, userId: req.user._id });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    res.status(204).send();
  });

  app.use(express.static(path.join(__dirname, "../public")));

  app.use((err, req, res, next) => {
    const googlePath = req.originalUrl?.includes("/auth/google");
    if (googlePath && err) {
      console.error("[Google OAuth]", err.message || err);
      if (
        err.name === "TokenError" ||
        String(err.message || "").toLowerCase().includes("client secret") ||
        String(err.message || "").toLowerCase().includes("invalid_client")
      ) {
        res.redirect("/login.html?error=google_bad_secret");
        return;
      }
      res.redirect("/login.html?error=google");
      return;
    }
    next(err);
  });

  const PORT = Number(process.env.PORT) || 3000;
  const MAX_PORT_TRIES = 20;
  let server;
  let listenPort = PORT;
  for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt++) {
    server = app.listen(listenPort);
    try {
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      break;
    } catch (err) {
      if (err.code === "EADDRINUSE") {
        server.close();
        if (listenPort === PORT) {
          console.warn(
            `Port ${PORT} is already in use (often another "npm start"). Trying ${listenPort + 1}…`
          );
        }
        listenPort += 1;
        if (attempt === MAX_PORT_TRIES - 1) {
          console.error(
            `No free port from ${PORT} to ${listenPort}. Close the other process or set PORT in .env.`
          );
          await client.close();
          process.exit(1);
        }
      } else {
        await client.close();
        throw err;
      }
    }
  }

  console.log(
    `Server: http://localhost:${listenPort}  (catalog UI — sign in required)`
  );
  if (isGoogleOAuthConfigured()) {
    console.log("Google sign-in: enabled (OAuth routes active).");
  } else {
    console.log(
      "Google sign-in: off — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env next to package.json, then restart."
    );
  }

  const shutdown = async () => {
    server.close(() => {});
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
