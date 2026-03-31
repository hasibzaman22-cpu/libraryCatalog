const form = document.getElementById("forgot-form");
const msg = document.getElementById("auth-message");
const submitBtn = document.getElementById("submit-btn");

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Sending..." : "Send reset link";
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("error", "ok");

  const fd = new FormData(form);
  const email = String(fd.get("email") ?? "").trim();
  if (!email) {
    msg.textContent = "Enter your email address.";
    msg.classList.add("error");
    return;
  }

  setLoading(true);
  try {
    const res = await fetch("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    msg.textContent =
      data.message ||
      "If an account exists for that email, we sent a password reset link.";
    msg.classList.add("ok");
    if (res.ok) form.reset();
  } catch {
    msg.textContent = "Network error. Try again.";
    msg.classList.add("error");
  } finally {
    setLoading(false);
  }
});
