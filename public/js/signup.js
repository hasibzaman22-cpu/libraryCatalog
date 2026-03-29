const form = document.getElementById("signup-form");
const msg = document.getElementById("auth-message");
const submitBtn = document.getElementById("submit-btn");

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Creating…" : "Create account";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("error", "ok");

  const fd = new FormData(form);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const password2 = String(fd.get("password2") ?? "");
  const name = String(fd.get("name") ?? "").trim();

  if (!email || !password) {
    msg.textContent = "Email and password are required.";
    msg.classList.add("error");
    return;
  }
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
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.textContent = data.error || "Could not create account.";
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
