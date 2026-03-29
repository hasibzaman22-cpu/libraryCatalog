import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getGoogleCredentials, getGoogleCallbackURL } from "./googleEnv.js";

function normalizeEmail(email) {
  return String(email ?? "").toLowerCase().trim();
}

export function configurePassport(users) {
  passport.serializeUser((user, done) => {
    done(null, user._id.toString());
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await users.findOne({ _id: new ObjectId(id) });
      done(null, user ?? null);
    } catch (err) {
      done(err);
    }
  });

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await users.findOne({ email: normalizeEmail(email) });
          if (!user?.passwordHash) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  const googleCreds = getGoogleCredentials();
  if (googleCreds) {
    const callbackURL = getGoogleCallbackURL();

    passport.use(
      new GoogleStrategy(
        {
          clientID: googleCreds.clientID,
          clientSecret: googleCreds.clientSecret,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const gid = profile.id;
            const email = profile.emails?.[0]?.value
              ? normalizeEmail(profile.emails[0].value)
              : "";
            if (!email) {
              return done(new Error("Google did not return an email address"));
            }
            let user = await users.findOne({
              $or: [{ googleId: gid }, { email }],
            });
            if (!user) {
              const ins = await users.insertOne({
                email,
                name: profile.displayName || email.split("@")[0],
                passwordHash: null,
                googleId: gid,
                createdAt: new Date(),
              });
              user = await users.findOne({ _id: ins.insertedId });
            } else {
              const $set = {};
              if (!user.googleId) $set.googleId = gid;
              if (profile.displayName && !user.name) $set.name = profile.displayName;
              if (Object.keys($set).length) {
                await users.updateOne({ _id: user._id }, { $set });
                user = await users.findOne({ _id: user._id });
              }
            }
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }
}

export { normalizeEmail };
