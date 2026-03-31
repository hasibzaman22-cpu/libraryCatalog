const form = document.getElementById("add-form");
const messageEl = document.getElementById("form-message");
const shelvesEl = document.getElementById("shelves");
const categoryDatalist = document.getElementById("category-suggestions");
const categoryHint = document.getElementById("category-hint");
const authorDatalist = document.getElementById("author-suggestions");
const authorHint = document.getElementById("author-hint");
const publisherDatalist = document.getElementById("publisher-suggestions");
const publisherHint = document.getElementById("publisher-hint");
const userLabel = document.getElementById("user-label");
const logoutBtn = document.getElementById("logout-btn");
const loginLink = document.getElementById("login-link");
const recommendDialog = document.getElementById("recommend-dialog");
const recommendForm = document.getElementById("recommend-form");
const recommendBookSummary = document.getElementById("recommend-book-summary");
const recommendFormMessage = document.getElementById("recommend-form-message");
const recommendCancel = document.getElementById("recommend-cancel");
const recommendSend = document.getElementById("recommend-send");
const editBookDialog = document.getElementById("edit-book-dialog");
const editBookForm = document.getElementById("edit-book-form");
const editTitle = document.getElementById("edit-title");
const editAuthor = document.getElementById("edit-author");
const editPublisher = document.getElementById("edit-publisher");
const editCategory = document.getElementById("edit-category");
const editIsbn = document.getElementById("edit-isbn");
const editNotes = document.getElementById("edit-notes");
const editBookFormMessage = document.getElementById("edit-book-form-message");
const editBookCancel = document.getElementById("edit-book-cancel");
const editBookSave = document.getElementById("edit-book-save");

const fetchOpts = { credentials: "same-origin" };

/** @type {string | null} */
let recommendBookId = null;
/** @type {string | null} */
let editBookId = null;

/** Last loaded book documents (for re-render without refetch). */
let cachedBookDocs = [];
/** Per shelf category: when true, books on that shelf are sorted by title A–Z. */
const shelfSortAlpha = new Map();

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function bookIdString(doc) {
  const id = doc?._id;
  if (id == null) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "$oid" in id) {
    return String(/** @type {{ $oid: string }} */ (id).$oid);
  }
  return String(id);
}

function formatPublisher(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || "—";
}

/** Digits + X for ISBN-10 check digit; uppercase X. */
function normalizeIsbnDigits(isbn) {
  return String(isbn ?? "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
}

/** Open Library cover CDN — returns null if not a plausible ISBN length. */
function openLibraryCoverUrl(isbn) {
  const n = normalizeIsbnDigits(isbn);
  if (n.length !== 10 && n.length !== 13) return null;
  return `https://covers.openlibrary.org/b/isbn/${n}-M.jpg`;
}

/**
 * @param {"no-isbn" | "openlibrary-fail" | "custom-fail"} reason
 */
function coverFallbackInnerHtml(bookId, reason) {
  let msg;
  if (reason === "no-isbn") {
    msg = "Upload a photo of your book.";
  } else if (reason === "custom-fail") {
    msg = "Could not load your cover. Upload a new photo.";
  } else {
    msg =
      "Open Library has no cover for this ISBN. Upload a photo of your book.";
  }
  return (
    `<div class="book-cover book-cover-fallback">` +
    `<span class="book-cover-fallback-msg">${escapeHtml(msg)}</span>` +
    `<button type="button" class="btn-cover-upload">Upload cover</button>` +
    `<input type="file" class="book-cover-file-input" accept="image/jpeg,image/png,image/webp,image/gif" data-book-id="${escapeHtml(bookId)}" aria-label="Choose cover image file" />` +
    `</div>`
  );
}

function bookCoverHtml(doc) {
  const b = doc.book ?? {};
  const bid = bookIdString(doc);
  const title = typeof b.title === "string" ? b.title : "Book";
  const alt = escapeHtml(title);

  if (b.customCoverUploaded && typeof b.coverFilename === "string") {
    const t = Number(b.coverUpdatedAt) || 0;
    const src = `/books/${encodeURIComponent(bid)}/cover?t=${encodeURIComponent(String(t))}`;
    return (
      `<div class="book-cover-wrap book-cover-wrap--has-custom" data-book-id="${escapeHtml(bid)}">` +
      `<img class="book-cover book-cover--custom" src="${src}" alt="Cover: ${alt}" loading="lazy" decoding="async" width="72" height="108" />` +
      `<button type="button" class="btn-cover-remove" aria-label="Remove uploaded cover">Remove photo</button>` +
      `</div>`
    );
  }

  const raw = typeof b.isbn === "string" ? b.isbn.trim() : "";
  const url = openLibraryCoverUrl(raw);
  if (!url) {
    return (
      `<div class="book-cover-wrap" data-book-id="${escapeHtml(bid)}">` +
      coverFallbackInnerHtml(bid, "no-isbn") +
      `</div>`
    );
  }
  return (
    `<div class="book-cover-wrap" data-book-id="${escapeHtml(bid)}">` +
    `<img class="book-cover book-cover--openlibrary" src="${url}" alt="Cover: ${alt}" loading="lazy" decoding="async" width="72" height="108" />` +
    `</div>`
  );
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

  const authors = uniqueBookField(docs, "author");
  fillDatalist(authorDatalist, authors);

  const publishers = uniqueBookField(docs, "publisher");
  fillDatalist(publisherDatalist, publishers);
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
      const bid = bookIdString(doc);
      const hasNotes =
        typeof b.notes === "string" && b.notes.trim().length > 0;
      const editBtnClass = hasNotes ? "btn-edit has-notes" : "btn-edit";
      li.innerHTML =
        bookCoverHtml(doc) +
        `<div class="book-card-inner">` +
        `<div class="book-card-main">` +
        `<span class="book-title">${escapeHtml(b.title)}</span>` +
        `<span class="book-author">by ${escapeHtml(b.author)}</span>` +
        publisherHtml +
        `</div>` +
        `<div class="book-card-actions">` +
        `<button type="button" class="${editBtnClass}" data-book-id="${escapeHtml(bid)}" aria-label="Edit this book">Edit</button>` +
        `<button type="button" class="btn-recommend" data-book-id="${escapeHtml(bid)}" aria-label="Recommend this book">Recommend</button>` +
        `<button type="button" class="btn-delete-book" data-book-id="${escapeHtml(bid)}" aria-label="Remove this book from your library">Delete</button>` +
        `</div>` +
        `</div>`;
      ul.appendChild(li);
    }
    shelvesEl.appendChild(section);
  }
}

function renderShelvesUI() {
  renderShelves(shelvesGroupsForDisplay());
}

function patchCachedBook(updated) {
  const id = bookIdString(updated);
  const i = cachedBookDocs.findIndex((d) => bookIdString(d) === id);
  if (i >= 0) cachedBookDocs[i] = updated;
}

function removeCachedBookById(id) {
  const i = cachedBookDocs.findIndex((d) => bookIdString(d) === id);
  if (i >= 0) cachedBookDocs.splice(i, 1);
}

function setEditBookFormMessage(text, kind) {
  if (!editBookFormMessage) return;
  editBookFormMessage.textContent = text ?? "";
  editBookFormMessage.classList.remove("error", "ok");
  if (kind) editBookFormMessage.classList.add(kind);
}

function openEditBookModal(doc) {
  if (
    !editBookDialog ||
    !editBookForm ||
    !editTitle ||
    !editAuthor ||
    !editPublisher ||
    !editCategory ||
    !editIsbn ||
    !editNotes
  )
    return;
  editBookId = bookIdString(doc);
  const b = doc.book ?? {};
  editTitle.value = typeof b.title === "string" ? b.title : "";
  editAuthor.value = typeof b.author === "string" ? b.author : "";
  editPublisher.value = typeof b.publisher === "string" ? b.publisher : "";
  editCategory.value = typeof b.category === "string" ? b.category : "";
  editIsbn.value = typeof b.isbn === "string" ? b.isbn : "";
  editNotes.value = typeof b.notes === "string" ? b.notes : "";
  setEditBookFormMessage("");
  editBookDialog.showModal();
}

function closeEditBookModal() {
  if (editBookDialog?.open) editBookDialog.close();
  editBookId = null;
}

function setMessage(text, kind) {
  messageEl.textContent = text ?? "";
  messageEl.classList.remove("error", "ok");
  if (kind) messageEl.classList.add(kind);
}

function setRecommendMessage(text, kind) {
  if (!recommendFormMessage) return;
  recommendFormMessage.textContent = text ?? "";
  recommendFormMessage.classList.remove("error", "ok");
  if (kind) recommendFormMessage.classList.add(kind);
}

function openRecommendModal(doc) {
  if (!recommendDialog || !recommendForm || !recommendBookSummary) return;
  recommendBookId = bookIdString(doc);
  const b = doc.book ?? {};
  const pub = formatPublisher(b.publisher);
  const pubLine =
    pub === "—"
      ? ""
      : `<br /><span class="book-publisher-label">Publisher · </span>${escapeHtml(pub)}`;
  recommendBookSummary.innerHTML = `<strong>${escapeHtml(b.title)}</strong><br />by ${escapeHtml(b.author)}${pubLine}`;
  setRecommendMessage("");
  recommendForm.reset();
  recommendDialog.showModal();
}

function closeRecommendModal() {
  if (recommendDialog?.open) recommendDialog.close();
  recommendBookId = null;
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
      '<p class="empty">Could not load books. Reload the page to try again.</p>';
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

  shelvesEl.addEventListener(
    "error",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLImageElement)) return;
      const ol = t.classList.contains("book-cover--openlibrary");
      const cu = t.classList.contains("book-cover--custom");
      if (!ol && !cu) return;
      const wrap = t.closest(".book-cover-wrap");
      if (!wrap || wrap.querySelector(".book-cover-fallback")) return;
      const bookId = wrap.getAttribute("data-book-id");
      if (!bookId) return;
      const reason = cu ? "custom-fail" : "openlibrary-fail";
      wrap.innerHTML = coverFallbackInnerHtml(bookId, reason);
    },
    true
  );

  shelvesEl.addEventListener("change", async (e) => {
    const input = e.target;
    if (!input.classList?.contains("book-cover-file-input")) return;
    const file = input.files?.[0];
    if (!file) return;
    const bookId = input.getAttribute("data-book-id");
    if (!bookId) return;
    input.value = "";
    const wrap = input.closest(".book-cover-wrap");
    const fd = new FormData();
    fd.append("cover", file);
    const res = await fetch(`/books/${encodeURIComponent(bookId)}/cover`, {
      method: "POST",
      body: fd,
      ...fetchOpts,
    });
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      if (wrap) {
        wrap.innerHTML = coverFallbackInnerHtml(
          bookId,
          "openlibrary-fail"
        );
        const status = wrap.querySelector(".book-cover-fallback-msg");
        if (status) {
          status.textContent = body.error || "Upload failed. Try again.";
          status.classList.add("error");
        }
      }
      return;
    }
    patchCachedBook(body);
    renderShelvesUI();
  });

  shelvesEl.addEventListener("click", (e) => {
    const removeCoverBtn = e.target.closest(".btn-cover-remove");
    if (removeCoverBtn) {
      const wrap = removeCoverBtn.closest(".book-cover-wrap");
      const bookId = wrap?.getAttribute("data-book-id");
      if (
        !bookId ||
        !window.confirm(
          "Remove your uploaded cover? The shelf will use Open Library or an upload again if you add one."
        )
      ) {
        return;
      }
      removeCoverBtn.disabled = true;
      void (async () => {
        try {
          const res = await fetch(
            `/books/${encodeURIComponent(bookId)}/cover`,
            { method: "DELETE", ...fetchOpts }
          );
          let body = {};
          try {
            body = await res.json();
          } catch {
            /* ignore */
          }
          if (res.status === 401) {
            window.location.href = "/login.html";
            return;
          }
          if (!res.ok) {
            window.alert(body.error || "Could not remove the cover.");
            removeCoverBtn.disabled = false;
            return;
          }
          patchCachedBook(body);
          renderShelvesUI();
        } catch {
          removeCoverBtn.disabled = false;
        }
      })();
      return;
    }
    const uploadBtn = e.target.closest(".btn-cover-upload");
    if (uploadBtn) {
      const wrap = uploadBtn.closest(".book-cover-wrap");
      const input = wrap?.querySelector(".book-cover-file-input");
      input?.click();
      return;
    }
    const editBtn = e.target.closest(".btn-edit");
    if (editBtn) {
      const id = editBtn.getAttribute("data-book-id");
      const doc = cachedBookDocs.find((d) => bookIdString(d) === id);
      if (doc) openEditBookModal(doc);
      return;
    }
    const recBtn = e.target.closest(".btn-recommend");
    if (recBtn) {
      const id = recBtn.getAttribute("data-book-id");
      const doc = cachedBookDocs.find((d) => bookIdString(d) === id);
      if (doc) openRecommendModal(doc);
      return;
    }
    const delBtn = e.target.closest(".btn-delete-book");
    if (delBtn) {
      const bookId = delBtn.getAttribute("data-book-id");
      if (!bookId) return;
      const doc = cachedBookDocs.find((d) => bookIdString(d) === bookId);
      const title =
        doc && typeof doc.book?.title === "string" && doc.book.title.trim()
          ? doc.book.title.trim()
          : "this book";
      if (
        !window.confirm(
          `Remove “${title}” from your library? This cannot be undone.`
        )
      ) {
        return;
      }
      delBtn.disabled = true;
      void (async () => {
        try {
          const res = await fetch(`/books/${encodeURIComponent(bookId)}`, {
            method: "DELETE",
            ...fetchOpts,
          });
          if (res.status === 401) {
            window.location.href = "/login.html";
            return;
          }
          if (!res.ok) {
            let err = "Could not delete the book.";
            try {
              const body = await res.json();
              if (body?.error) err = body.error;
            } catch {
              /* ignore */
            }
            window.alert(err);
            delBtn.disabled = false;
            return;
          }
          removeCachedBookById(bookId);
          if (editBookId === bookId) closeEditBookModal();
          if (recommendBookId === bookId) closeRecommendModal();
          refreshFormSuggestions(cachedBookDocs);
          renderShelvesUI();
        } catch {
          delBtn.disabled = false;
        }
      })();
      return;
    }
    const btn = e.target.closest(".btn-shelf-sort");
    if (!btn) return;
    const encoded = btn.getAttribute("data-category");
    if (encoded == null) return;
    const category = decodeURIComponent(encoded);
    shelfSortAlpha.set(category, !shelfSortAlpha.get(category));
    renderShelvesUI();
  });

  editBookCancel?.addEventListener("click", () => closeEditBookModal());
  editBookDialog?.addEventListener("click", (e) => {
    if (e.target === editBookDialog) closeEditBookModal();
  });
  editBookDialog?.addEventListener("close", () => {
    editBookId = null;
    setEditBookFormMessage("");
  });

  editBookForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editBookId) return;
    setEditBookFormMessage("");
    const title = String(editTitle?.value ?? "").trim();
    const author = String(editAuthor?.value ?? "").trim();
    const publisher = String(editPublisher?.value ?? "").trim();
    const category = String(editCategory?.value ?? "").trim();
    const isbn = String(editIsbn?.value ?? "").trim();
    const notes = String(editNotes?.value ?? "");
    if (!title || !author || !publisher || !category) {
      setEditBookFormMessage(
        "Title, author, publisher, and shelf are required.",
        "error"
      );
      return;
    }
    editBookSave.disabled = true;
    try {
      const res = await fetch(`/books/${encodeURIComponent(editBookId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        ...fetchOpts,
        body: JSON.stringify({
          title,
          author,
          publisher,
          category,
          isbn,
          notes,
        }),
      });
      let body = {};
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) {
        setEditBookFormMessage(body.error || "Could not save changes.", "error");
        return;
      }
      patchCachedBook(body);
      refreshFormSuggestions(cachedBookDocs);
      setEditBookFormMessage("Saved.", "ok");
      renderShelvesUI();
      window.setTimeout(() => closeEditBookModal(), 450);
    } finally {
      editBookSave.disabled = false;
    }
  });

  recommendCancel?.addEventListener("click", () => closeRecommendModal());
  recommendDialog?.addEventListener("click", (e) => {
    if (e.target === recommendDialog) closeRecommendModal();
  });
  recommendDialog?.addEventListener("close", () => {
    recommendBookId = null;
    setRecommendMessage("");
  });

  recommendForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!recommendBookId) return;
    setRecommendMessage("");
    const fd = new FormData(recommendForm);
    const recipientFirstName = String(
      fd.get("recipientFirstName") ?? ""
    ).trim();
    const recipientLastName = String(fd.get("recipientLastName") ?? "").trim();
    const contact = String(fd.get("contact") ?? "").trim();
    if (!recipientFirstName || !recipientLastName || !contact) {
      setRecommendMessage("Fill in every field.", "error");
      return;
    }
    recommendSend.disabled = true;
    try {
      const res = await fetch(
        `/books/${encodeURIComponent(recommendBookId)}/recommend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...fetchOpts,
          body: JSON.stringify({
            recipientFirstName,
            recipientLastName,
            contact,
          }),
        }
      );
      let body = {};
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) {
        setRecommendMessage(body.error || res.statusText, "error");
        return;
      }
      setRecommendMessage(
        "Text message sent.",
        "ok"
      );
      recommendForm.reset();
      setTimeout(() => {
        closeRecommendModal();
      }, 900);
    } finally {
      recommendSend.disabled = false;
    }
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
    const notes = String(fd.get("notes") ?? "");
    const isbn = String(fd.get("isbn") ?? "").trim();

    if (!title || !author || !publisher || !category) {
      setMessage("Fill in every field.", "error");
      return;
    }

    const res = await fetch("/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...fetchOpts,
      body: JSON.stringify({ title, author, category, publisher, notes, isbn }),
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

  await loadShelves();
}

init();
