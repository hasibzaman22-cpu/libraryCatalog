import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

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

}

export { normalizeEmail };
