const form = document.getElementById("login-form");
const msg = document.getElementById("auth-message");
const submitBtn = document.getElementById("submit-btn");

const params = new URLSearchParams(window.location.search);
const reset = params.get("reset");
if (reset === "1") {
  msg.textContent = "Password reset successful. Sign in with your new password.";
  msg.classList.add("ok");
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
