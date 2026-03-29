const form = document.getElementById("login-form");
const msg = document.getElementById("auth-message");
const submitBtn = document.getElementById("submit-btn");

const params = new URLSearchParams(window.location.search);
const err = params.get("error");
if (err === "google") {
  msg.textContent =
    "Google sign-in did not complete. Try again or use email and password.";
  msg.classList.add("error");
} else if (err === "google_config") {
  msg.textContent =
    "Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file. Restart the server after saving.";
  msg.classList.add("error");
} else if (err === "google_bad_secret") {
  msg.textContent =
    "Google rejected the client secret. In Google Cloud Console → Credentials, open your OAuth 2.0 Web client, copy the Client secret again (or reset it), paste into GOOGLE_CLIENT_SECRET in .env with no extra spaces, then restart the server.";
  msg.classList.add("error");
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Signing in…" : "Sign in";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("error", "ok");

  const fd = new FormData(form);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");

  if (!email || !password) {
    msg.textContent = "Enter email and password.";
    msg.classList.add("error");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || "Could not sign in.";
      msg.classList.add("error");
      return;
    }
    window.location.href = "/";
  } catch {
    msg.textContent = "Network error. Try again.";
    msg.classList.add("error");
  } finally {
    setLoading(false);
  }
});
