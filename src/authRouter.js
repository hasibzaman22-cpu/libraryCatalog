import express from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "./configurePassport.js";
import { isGoogleOAuthConfigured } from "./googleEnv.js";

const SALT_ROUNDS = 10;

function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? "",
  };
}

function isGoogleEnabled() {
  return isGoogleOAuthConfigured();
}

export function createAuthRouter(users) {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    res.json({ googleEnabled: isGoogleEnabled() });
  });

  router.post("/register", async (req, res) => {
    const { email, password, name } = req.body ?? {};
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
