import express from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { normalizeEmail } from "./configurePassport.js";
import { isGoogleOAuthConfigured } from "./googleEnv.js";

const SALT_ROUNDS = 10;

function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? "",
    smsOptIn: Boolean(user.smsOptIn),
  };
}

function isGoogleEnabled() {
  return isGoogleOAuthConfigured();
}

function appBaseUrl(req) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function createMailTransport() {
  if (process.env.SMTP_URL?.trim()) {
    return nodemailer.createTransport(process.env.SMTP_URL.trim());
  }
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER?.trim(),
      pass: process.env.SMTP_PASS?.trim(),
    },
  });
}

function isSmtpConfigured() {
  const from = process.env.SMTP_FROM?.trim();
  if (!from) return false;
  if (process.env.SMTP_URL?.trim()) return true;
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function createAuthRouter(users) {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    res.json({ googleEnabled: isGoogleEnabled() });
  });

  router.post("/register", async (req, res) => {
    const { email, password, name, smsOptIn } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    const em = normalizeEmail(email);
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (smsOptIn !== true) {
      res.status(400).json({
        error:
          "You must agree to receive book recommendation texts before creating an account.",
      });
      return;
    }
    const displayName =
      typeof name === "string" && name.trim() ? name.trim() : em.split("@")[0];

    const existing = await users.findOne({ email: em });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const ins = await users.insertOne({
      email: em,
      name: displayName,
      passwordHash,
      smsOptIn: true,
      googleId: null,
      createdAt: new Date(),
    });
    const user = await users.findOne({ _id: ins.insertedId });

    req.login(user, (err) => {
      if (err) {
        res.status(500).json({ error: "Account created but sign-in failed." });
        return;
      }
      res.status(201).json({ user: publicUser(user) });
    });
  });

  router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        res.status(401).json({
          error: info?.message || "Invalid email or password",
        });
        return;
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({ user: publicUser(user) });
      });
    })(req, res, next);
  });

  router.post("/forgot-password", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const genericOk = {
      ok: true,
      message:
        "If an account exists for that email, we sent a password reset link.",
    };
    if (!email) {
      res.json(genericOk);
      return;
    }
    const user = await users.findOne({ email });
    if (!user) {
      res.json(genericOk);
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordTokenHash: tokenHash,
          resetPasswordExpiresAt: expiresAt,
        },
      }
    );

    if (!isSmtpConfigured()) {
      console.warn("Password reset requested but SMTP is not configured.");
      res.json(genericOk);
      return;
    }

    const link = `${appBaseUrl(req)}/reset-password.html?token=${encodeURIComponent(token)}`;
    const transport = createMailTransport();
    const from = process.env.SMTP_FROM?.trim();
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: "Reset your Library Catalog password",
        text:
          "You requested a password reset.\n\n" +
          `Use this link within 1 hour:\n${link}\n\n` +
          "If you did not request this, you can ignore this message.",
      });
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }
    res.json(genericOk);
  });

  router.post("/reset-password", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!token || token.length < 32) {
      res.status(400).json({ error: "Reset link is invalid." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await users.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      res.status(400).json({ error: "Reset link is invalid or expired." });
      return;
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await users.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash },
        $unset: {
          resetPasswordTokenHash: "",
          resetPasswordExpiresAt: "",
        },
      }
    );
    res.json({ ok: true });
  });

  router.post("/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  router.get("/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.json({ user: publicUser(req.user) });
  });

  if (isGoogleEnabled()) {
    router.get("/google", (req, res, next) => {
      passport.authenticate("google", { scope: ["profile", "email"] })(
        req,
        res,
        next
      );
    });

    router.get(
      "/google/callback",
      passport.authenticate("google", {
        failureRedirect: "/login.html?error=google",
      }),
      (_req, res) => {
        res.redirect("/");
      }
    );
  }

  return router;
}
