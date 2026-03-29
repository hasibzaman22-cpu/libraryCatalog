/**
 * Google OAuth is off while credentials / UX are WIP.
 * Set to `true` and uncomment the Google blocks in login.html + signup.html to re-enable.
 */
export const GOOGLE_AUTH_ENABLED = false;

/** Trim and strip optional surrounding quotes from .env values */
function stripCredential(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function getGoogleCredentials() {
  if (!GOOGLE_AUTH_ENABLED) return null;
  const clientID = stripCredential(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = stripCredential(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientID || !clientSecret) return null;
  return { clientID, clientSecret };
}

export function isGoogleOAuthConfigured() {
  return getGoogleCredentials() !== null;
}

/** Callback URL for Passport; defaults to localhost + PORT */
export function getGoogleCallbackURL() {
  const fromEnv = stripCredential(process.env.GOOGLE_CALLBACK_URL);
  if (fromEnv) return fromEnv;
  return `http://localhost:${Number(process.env.PORT) || 3000}/auth/google/callback`;
}
