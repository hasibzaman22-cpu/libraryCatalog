const form = document.getElementById("add-form");
const messageEl = document.getElementById("form-message");
const shelvesEl = document.getElementById("shelves");
const categoryDatalist = document.getElementById("category-suggestions");
const categoryHint = document.getElementById("category-hint");
const authorDatalist = document.getElementById("author-suggestions");
const authorHint = document.getElementById("author-hint");
const publisherDatalist = document.getElementById("publisher-suggestions");
const publisherHint = document.getElementById("publisher-hint");
const refreshBtn = document.getElementById("refresh-btn");
const userLabel = document.getElementById("user-label");
const logoutBtn = document.getElementById("logout-btn");
const loginLink = document.getElementById("login-link");

const fetchOpts = { credentials: "same-origin" };

/** Last loaded book documents (for re-render without refetch). */
let cachedBookDocs = [];
/** Per shelf category: when true, books on that shelf are sorted by title A–Z. */
const shelfSortAlpha = new Map();

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function formatPublisher(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || "—";
}

function uniqueBookField(docs, field) {
  const set = new Set();
  for (const doc of docs) {
    const raw = doc.book?.[field];
    if (typeof raw === "string" && raw.trim()) {
      set.add(raw.trim());
    }
  }
  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function fillDatalist(datalistEl, values) {
  if (!datalistEl) return;
  datalistEl.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    datalistEl.appendChild(opt);
  }
}

function refreshFormSuggestions(docs) {
  const categories = uniqueBookField(docs, "category");
  fillDatalist(categoryDatalist, categories);
  if (categoryHint) {
    categoryHint.textContent =
      categories.length > 0
        ? `${categories.length} saved shelf${categories.length === 1 ? "" : "s"} — click the field to see them, or type a new name.`
        : "After your first book, previous shelves appear as suggestions here.";
  }

  const authors = uniqueBookField(docs, "author");
  fillDatalist(authorDatalist, authors);
  if (authorHint) {
    authorHint.textContent =
      authors.length > 0
        ? `${authors.length} saved author${authors.length === 1 ? "" : "s"} — click the field to pick one, or type a new name.`
        : "After your first book, previous authors appear as suggestions here.";
  }

  const publishers = uniqueBookField(docs, "publisher");
  fillDatalist(publisherDatalist, publishers);
  if (publisherHint) {
    publisherHint.textContent =
      publishers.length > 0
        ? `${publishers.length} saved publisher${publishers.length === 1 ? "" : "s"} — click the field to pick one, or type a new name.`
        : "After your first book, previous publishers appear as suggestions here.";
  }
}

function groupIntoShelves(docs) {
  const map = new Map();
  for (const doc of docs) {
    const b = doc.book ?? {};
    const raw = b.category;
    const shelf =
      typeof raw === "string" && raw.trim() ? raw.trim() : "Uncategorized";
    if (!map.has(shelf)) map.set(shelf, []);
    map.get(shelf).push(doc);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([category, books]) => ({ category, books }));
}

function shelvesGroupsForDisplay() {
  return groupIntoShelves(cachedBookDocs).map(({ category, books }) => ({
    category,
    books: shelfSortAlpha.get(category)
      ? [...books].sort((a, b) => {
          const ta = String(a.book?.title ?? "").trim();
          const tb = String(b.book?.title ?? "").trim();
          return ta.localeCompare(tb, undefined, { sensitivity: "base" });
        })
      : books,
  }));
}

function renderShelves(groups) {
  shelvesEl.innerHTML = "";
  if (groups.length === 0) {
    shelvesEl.innerHTML =
      '<p class="empty">No books yet. Add one on the left to create a shelf.</p>';
    return;
  }
  for (const { category, books } of groups) {
    const section = document.createElement("section");
    section.className = "shelf";
    const sortOn = Boolean(shelfSortAlpha.get(category));
    const dataCat = encodeURIComponent(category);
    section.innerHTML = `<div class="shelf-header"><h3 class="shelf-title">${escapeHtml(category)}</h3><button type="button" class="btn-shelf-sort" aria-pressed="${sortOn}" aria-label="Sort books on this shelf alphabetically by title" title="Toggle alphabetical order by title" data-category="${dataCat}">A–Z</button></div><ul class="book-list"></ul>`;
    const ul = section.querySelector("ul");
    for (const doc of books) {
      const b = doc.book ?? {};
      const li = document.createElement("li");
      li.className = "book-card";
      const pub = formatPublisher(b.publisher);
      const publisherHtml =
        pub === "—"
          ? '<span class="book-publisher book-publisher-missing">No publisher</span>'
          : `<span class="book-publisher"><span class="book-publisher-label">Publisher · </span>${escapeHtml(pub)}</span>`;
      li.innerHTML =
        `<span class="book-title">${escapeHtml(b.title)}</span>` +
        `<span class="book-author">by ${escapeHtml(b.author)}</span>` +
        publisherHtml;
      ul.appendChild(li);
    }
    shelvesEl.appendChild(section);
  }
}

function renderShelvesUI() {
  renderShelves(shelvesGroupsForDisplay());
}

function setMessage(text, kind) {
  messageEl.textContent = text ?? "";
  messageEl.classList.remove("error", "ok");
  if (kind) messageEl.classList.add(kind);
}

async function loadShelves() {
  shelvesEl.innerHTML = '<p class="loading">Loading shelves…</p>';
  const res = await fetch("/books", fetchOpts);
  if (res.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!res.ok) {
    shelvesEl.innerHTML =
      '<p class="empty">Could not load books. Try refresh.</p>';
    return;
  }
  const data = await res.json();
  cachedBookDocs = data;
  refreshFormSuggestions(data);
  renderShelvesUI();
}

async function init() {
  const me = await fetch("/auth/me", fetchOpts);
  if (me.status === 401) {
    userLabel.textContent = "";
    logoutBtn.hidden = true;
    loginLink.hidden = false;
    window.location.href = "/login.html";
    return;
  }
  const { user } = await me.json();
  const display =
    typeof user?.name === "string" && user.name.trim()
      ? user.name.trim()
      : (user?.email ?? "");
  userLabel.textContent = display;
  userLabel.title = user?.email ? `Signed in as ${user.email}` : "";
  logoutBtn.hidden = false;
  loginLink.hidden = true;

  shelvesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-shelf-sort");
    if (!btn) return;
    const encoded = btn.getAttribute("data-category");
    if (encoded == null) return;
    const category = decodeURIComponent(encoded);
    shelfSortAlpha.set(category, !shelfSortAlpha.get(category));
    renderShelvesUI();
  });

  logoutBtn.addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST", ...fetchOpts });
    window.location.href = "/login.html";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage("");

    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const author = String(fd.get("author") ?? "").trim();
    const publisher = String(fd.get("publisher") ?? "").trim();
    const category = String(fd.get("category") ?? "").trim();

    if (!title || !author || !publisher || !category) {
      setMessage("Fill in every field.", "error");
      return;
    }

    const res = await fetch("/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...fetchOpts,
      body: JSON.stringify({ title, author, category, publisher }),
    });

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        if (err.error) detail = err.error;
      } catch {
        /* ignore */
      }
      setMessage(detail, "error");
      return;
    }

    form.reset();
    setMessage("Saved.", "ok");
    await loadShelves();
  });

  refreshBtn.addEventListener("click", () => loadShelves());
  await loadShelves();
}

init();
