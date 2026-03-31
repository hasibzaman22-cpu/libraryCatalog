import "./loadEnv.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import { ObjectId } from "mongodb";
import { connect, getMongoConfig } from "./db.js";
import {
  createBookDocument,
  MAX_NOTES_LENGTH,
  MAX_ISBN_LENGTH,
} from "./book.js";
import { buildFilter } from "./bookQuery.js";
import { configurePassport } from "./configurePassport.js";
import { createAuthRouter } from "./authRouter.js";
import { scopeBooksToUser } from "./bookScope.js";
import {
  recommenderDisplayName,
  detectContactChannel,
  sendBookRecommendation,
  isSmtpConfigured,
  isTwilioConfigured,
  userFacingRecommendError,
} from "./recommendNotify.js";
import {
  ensureCoversDir,
  COVERS_DIR,
  extForImageMime,
  removeStoredCover,
} from "./coverStorage.js";

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

function ownerObjectId(user) {
  return user._id instanceof ObjectId
    ? user._id
    : new ObjectId(String(user._id));
}

const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  },
});

async function main() {
  const client = await connect();
  const db = client.db(getMongoConfig().dbName);
  const users = db.collection(USERS);
  const coll = () => db.collection(COLLECTION);

  await ensureCoversDir();

  await users.createIndex({ email: 1 }, { unique: true });

  configurePassport(users);

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  const sessionSecret =
    process.env.SESSION_SECRET || "dev-only-change-me-in-production";
  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET not set; using a default (not for production).");
  }

  const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
  const sessionCookieSecure = process.env.COOKIE_SECURE === "true";

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client,
        dbName: getMongoConfig().dbName,
        collectionName: "sessions",
        ttl: Math.floor(sessionMaxAgeMs / 1000),
      }),
      cookie: {
        httpOnly: true,
        maxAge: sessionMaxAgeMs,
        sameSite: "lax",
        secure: sessionCookieSecure,
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
    const { title, author, category, publisher, notes, isbn } = req.body ?? {};
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
    const notesStr = typeof notes === "string" ? notes : "";
    if (notesStr.length > MAX_NOTES_LENGTH) {
      res.status(400).json({
        error: `Notes must be at most ${MAX_NOTES_LENGTH} characters.`,
      });
      return;
    }
    let doc;
    try {
      doc = {
        userId: req.user._id,
        ...createBookDocument(title, author, category, publisher, notesStr),
      };
    } catch (err) {
      res.status(400).json({ error: String(err.message ?? err) });
      return;
    }
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
    const { title, author, category, publisher, notes, isbn } = req.body ?? {};
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
    if (notes !== undefined) {
      if (typeof notes !== "string") {
        res.status(400).json({ error: "notes must be a string." });
        return;
      }
      if (notes.length > MAX_NOTES_LENGTH) {
        res.status(400).json({
          error: `Notes must be at most ${MAX_NOTES_LENGTH} characters.`,
        });
        return;
      }
      $set["book.notes"] = notes.trim();
    }
    if (isbn !== undefined) {
      if (typeof isbn !== "string") {
        res.status(400).json({ error: "isbn must be a string." });
        return;
      }
      if (isbn.length > MAX_ISBN_LENGTH) {
        res.status(400).json({
          error: `ISBN must be at most ${MAX_ISBN_LENGTH} characters.`,
        });
        return;
      }
      $set["book.isbn"] = isbn.trim();
    }
    if (Object.keys($set).length === 0) {
      res.status(400).json({
        error:
          "Provide at least one of title, author, category, publisher, notes, isbn.",
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

  app.get("/books/:id/cover", requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      res.status(400).end();
      return;
    }
    const ownerId = ownerObjectId(req.user);
    const doc = await coll().findOne({ _id, userId: ownerId });
    const fn = doc?.book?.coverFilename;
    if (!doc?.book?.customCoverUploaded || typeof fn !== "string" || /[/\\]/.test(fn)) {
      res.status(404).end();
      return;
    }
    const abs = path.resolve(COVERS_DIR, fn);
    const root = path.resolve(COVERS_DIR);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      res.status(404).end();
      return;
    }
    try {
      await fs.access(abs);
    } catch {
      res.status(404).end();
      return;
    }
    const mime = doc.book.coverMime;
    if (typeof mime === "string" && mime) res.type(mime);
    res.sendFile(abs);
  });

  app.post(
    "/books/:id/cover",
    requireAuth,
    (req, res, next) => {
      uploadCover.single("cover")(req, res, (err) => {
        if (err?.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "Image must be 2 MB or smaller." });
          return;
        }
        if (err) {
          res.status(400).json({ error: "Invalid upload." });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      if (!req.file?.buffer) {
        res.status(400).json({
          error:
            'Send one image as form field "cover" (JPEG, PNG, WebP, or GIF, max 2 MB).',
        });
        return;
      }
      let _id;
      try {
        _id = new ObjectId(req.params.id);
      } catch {
        res.status(400).json({ error: "Invalid id." });
        return;
      }
      const ownerId = ownerObjectId(req.user);
      const doc = await coll().findOne({ _id, userId: ownerId });
      if (!doc) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      const ext = extForImageMime(req.file.mimetype);
      if (!ext) {
        res.status(400).json({ error: "Use JPEG, PNG, WebP, or GIF." });
        return;
      }
      const prev = doc.book?.coverFilename;
      if (typeof prev === "string") {
        await removeStoredCover(prev);
      }
      const filename = `${_id.toString()}${ext}`;
      await fs.writeFile(path.join(COVERS_DIR, filename), req.file.buffer);
      await coll().updateOne(
        { _id, userId: ownerId },
        {
          $set: {
            "book.customCoverUploaded": true,
            "book.coverMime": req.file.mimetype,
            "book.coverFilename": filename,
            "book.coverUpdatedAt": Date.now(),
          },
        }
      );
      const found = await coll().findOne({ _id });
      res.json(found);
    }
  );

  app.delete("/books/:id/cover", requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const ownerId = ownerObjectId(req.user);
    const doc = await coll().findOne({ _id, userId: ownerId });
    if (!doc) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    if (!doc.book?.customCoverUploaded) {
      res.status(400).json({ error: "No uploaded cover to remove." });
      return;
    }
    await removeStoredCover(doc.book?.coverFilename);
    await coll().updateOne(
      { _id, userId: ownerId },
      {
        $unset: {
          "book.customCoverUploaded": "",
          "book.coverMime": "",
          "book.coverFilename": "",
          "book.coverUpdatedAt": "",
        },
      }
    );
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
    const ownerId = ownerObjectId(req.user);
    const doc = await coll().findOne({ _id, userId: ownerId });
    if (!doc) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    await removeStoredCover(doc.book?.coverFilename);
    await coll().deleteOne({ _id, userId: ownerId });
    res.status(204).send();
  });

  app.post("/books/:id/recommend", requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const { recipientFirstName, recipientLastName, contact } = req.body ?? {};
    const first =
      typeof recipientFirstName === "string"
        ? recipientFirstName.trim()
        : "";
    const last =
      typeof recipientLastName === "string" ? recipientLastName.trim() : "";
    const c = typeof contact === "string" ? contact.trim() : "";

    if (!first || !last || !c) {
      res.status(400).json({
        error:
          "Provide recipientFirstName, recipientLastName, and contact (email or phone).",
      });
      return;
    }

    const channel = detectContactChannel(c);
    if (!channel) {
      res.status(400).json({ error: "Enter an email or phone number." });
      return;
    }

    const ownerId =
      req.user._id instanceof ObjectId
        ? req.user._id
        : new ObjectId(String(req.user._id));

    const doc = await coll().findOne({ _id, userId: ownerId });
    if (!doc) {
      res.status(404).json({ error: "Not found." });
      return;
    }

    const book = doc.book ?? {};
    const recommenderName = recommenderDisplayName(req.user);

    try {
      await sendBookRecommendation({
        channel,
        contact: c,
        recommenderName,
        recipientFirst: first,
        recipientLast: last,
        book,
      });
      res.json({ ok: true, channel });
    } catch (err) {
      if (err.code === "NOT_CONFIGURED") {
        res.status(503).json({ error: err.message });
        return;
      }
      if (err.code === "VALIDATION") {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error("[recommend]", err);
      const hint = userFacingRecommendError(err, channel);
      res.status(502).json({
        error:
          hint ||
          "Failed to send the recommendation. Check the server log for details.",
      });
    }
  });

  app.use(express.static(path.join(__dirname, "../public")));

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
    `Server: http://localhost:${listenPort}  (Al-Mawā’il — sign in required)`
  );
  console.log(
    `Recommendations: email ${isSmtpConfigured() ? "on" : "off"}, SMS ${isTwilioConfigured() ? "on" : "off"}`
  );

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
