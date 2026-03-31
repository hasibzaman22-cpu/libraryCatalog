const form = document.getElementById("reset-form");
const msg = document.getElementById("auth-message");
const submitBtn = document.getElementById("submit-btn");

const params = new URLSearchParams(window.location.search);
const token = String(params.get("token") ?? "").trim();

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Updating..." : "Update password";
}

if (!token) {
  msg.textContent = "Reset link is invalid. Request a new one.";
  msg.classList.add("error");
  submitBtn.disabled = true;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!token) return;

  msg.textContent = "";
  msg.classList.remove("error", "ok");

  const fd = new FormData(form);
  const password = String(fd.get("password") ?? "");
  const password2 = String(fd.get("password2") ?? "");

  if (password.length < 8) {
    msg.textContent = "Password must be at least 8 characters.";
    msg.classList.add("error");
    return;
  }
  if (password !== password2) {
    msg.textContent = "Passwords do not match.";
    msg.classList.add("error");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || "Could not reset password.";
      msg.classList.add("error");
      return;
    }
    msg.textContent = "Password updated. Redirecting to sign in...";
    msg.classList.add("ok");
    form.reset();
    setTimeout(() => {
      window.location.href = "/login.html?reset=1";
    }, 1200);
  } catch {
    msg.textContent = "Network error. Try again.";
    msg.classList.add("error");
  } finally {
    setLoading(false);
  }
});
