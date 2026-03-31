import nodemailer from "nodemailer";

function stripNewlines(s) {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function recommenderDisplayName(user) {
  if (typeof user?.name === "string" && user.name.trim()) {
    return stripNewlines(user.name);
  }
  return stripNewlines(user?.email ?? "Someone");
}

/** @returns {'email' | 'sms' | null} */
export function detectContactChannel(contact) {
  const c = String(contact ?? "").trim();
  if (!c) return null;
  if (c.includes("@")) return "email";
  return "sms";
}

function simpleEmailOk(email) {
  const e = String(email ?? "").trim();
  if (!e.includes("@") || e.length < 3) return false;
  const [local, domain] = e.split("@");
  return Boolean(local && domain && domain.includes("."));
}

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/** Best-effort E.164 for Twilio. */
export function normalizeSmsDestination(contact) {
  const c = String(contact ?? "").trim();
  if (!c) return null;
  if (c.startsWith("+")) {
    const d = digitsOnly(c.slice(1));
    return d.length >= 10 ? `+${d}` : null;
  }
  const d = digitsOnly(c);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length >= 10) return `+${d}`;
  return null;
}

export function isSmtpConfigured() {
  const from = process.env.SMTP_FROM?.trim();
  if (!from) return false;
  if (process.env.SMTP_URL?.trim()) return true;
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

export function buildRecommendationMessage({
  recommenderName,
  recipientFirst,
  recipientLast,
  book,
}) {
  const title = stripNewlines(book?.title ?? "");
  const author = stripNewlines(book?.author ?? "");
  const publisher = stripNewlines(book?.publisher ?? "");
  const greet = [recipientFirst, recipientLast]
    .map((x) => stripNewlines(x))
    .filter(Boolean)
    .join(" ");
  const lines = [
    greet ? `Hi ${greet},` : "Hi,",
    "",
    `${recommenderName} recommended this book to you:`,
    "",
    `Title: ${title}`,
    `Author: ${author}`,
  ];
  if (publisher) lines.push(`Publisher: ${publisher}`);
  const rawIsbn = typeof book?.isbn === "string" ? book.isbn.trim() : "";
  if (rawIsbn) lines.push(`ISBN: ${stripNewlines(rawIsbn)}`);
  const rawNotes =
    typeof book?.notes === "string" ? book.notes.trim() : "";
  if (rawNotes) {
    lines.push("", "Notes from the recommender:", rawNotes);
  }
  lines.push("", "Happy reading!");
  return lines.join("\n");
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

async function sendSmtpMail({ to, subject, text }) {
  const transport = createMailTransport();
  const from = process.env.SMTP_FROM?.trim();
  if (!from) throw new Error("SMTP_FROM is not set");
  await transport.sendMail({ from, to, subject, text });
}

/**
 * Safe, actionable message for the Al-Mawā’il UI (no secrets).
 * @param {unknown} err
 * @param {'email' | 'sms'} channel
 */
export function userFacingRecommendError(err, channel) {
  const msg = String(err?.message ?? err ?? "");
  const lower = msg.toLowerCase();
  const code = err && typeof err === "object" && "code" in err ? err.code : "";

  if (channel === "email") {
    if (code === "EAUTH" || lower.includes("535") || lower.includes("username and password not accepted")) {
      return (
        "Gmail (and many providers) no longer accept your normal account password for SMTP. " +
        "Use an app password: Google Account → Security → 2-Step Verification (on) → App passwords. " +
        "Set SMTP_USER to your full Gmail address and SMTP_PASS to the 16-character app password. " +
        "See https://support.google.com/mail/?p=BadCredentials"
      );
    }
    if (lower.includes("econnrefused") || lower.includes("etimedout") || lower.includes("enotfound")) {
      return "Could not reach the mail server. Check SMTP_HOST / SMTP_URL, port, and your network.";
    }
    if (lower.includes("certificate") || lower.includes("self signed")) {
      return "TLS/certificate error talking to SMTP. Check SMTP_SECURE and port (587 + STARTTLS vs 465).";
    }
  }

  if (channel === "sms") {
    if (msg.includes("20003") || (lower.includes("401") && lower.includes("twilio"))) {
      return (
        "Twilio rejected the credentials. Copy TWILIO_ACCOUNT_SID (starts with AC…) and TWILIO_AUTH_TOKEN " +
        "from the Twilio Console → Account Info (no extra spaces in .env). Do not use the API Key SID as the account SID."
      );
    }
    if (msg.includes("21211") || (lower.includes("invalid") && lower.includes("to"))) {
      return "Invalid SMS number. Use + and country code (e.g. +15551234567). Trial Twilio accounts can only text verified numbers.";
    }
    if (msg.includes("21608") || msg.includes("21610")) {
      return "Twilio trial: verify this phone number in the Twilio console, or upgrade the account.";
    }
    const twilioJson = msg.match(/Twilio \d+: (\{[\s\S]*\})/);
    if (twilioJson) {
      try {
        const j = JSON.parse(twilioJson[1]);
        if (j.message) return `SMS: ${j.message}`;
      } catch {
        /* ignore */
      }
    }
  }

  return "";
}

async function sendTwilioSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Twilio ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * @param {object} opts
 * @param {'email' | 'sms'} opts.channel
 * @param {string} opts.contact
 * @param {string} opts.recommenderName
 * @param {string} opts.recipientFirst
 * @param {string} opts.recipientLast
 * @param {object} opts.book
 */
export async function sendBookRecommendation(opts) {
  const {
    channel,
    contact,
    recommenderName,
    recipientFirst,
    recipientLast,
    book,
  } = opts;

  const text = buildRecommendationMessage({
    recommenderName,
    recipientFirst,
    recipientLast,
    book,
  });

  const subject = stripNewlines(
    `${recommenderName} recommended a book for you`
  ).slice(0, 200);

  if (channel === "email") {
    if (!isSmtpConfigured()) {
      const err = new Error(
        "Email is not configured on this server (set SMTP_URL or SMTP_HOST, SMTP_FROM, and auth)."
      );
      err.code = "NOT_CONFIGURED";
      throw err;
    }
    const to = String(contact).trim();
    if (!simpleEmailOk(to)) {
      const err = new Error("Invalid email address.");
      err.code = "VALIDATION";
      throw err;
    }
    await sendSmtpMail({ to, subject, text });
    return { channel: "email" };
  }

  if (channel === "sms") {
    if (!isTwilioConfigured()) {
      const err = new Error(
        "SMS is not configured on this server (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)."
      );
      err.code = "NOT_CONFIGURED";
      throw err;
    }
    const to = normalizeSmsDestination(contact);
    if (!to) {
      const err = new Error(
        "Invalid phone number. Use + and country code (e.g. +1 555 123 4567) or a 10-digit US number."
      );
      err.code = "VALIDATION";
      throw err;
    }
    await sendTwilioSms({ to, body: text });
    return { channel: "sms" };
  }

  const err = new Error("Unknown delivery channel.");
  err.code = "VALIDATION";
  throw err;
}
