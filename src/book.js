const MAX_NOTES_LENGTH = 10_000;
const MAX_ISBN_LENGTH = 32;

/**
 * Each stored document has shape:
 * { book: { title, author, category, publisher, notes, isbn, customCoverUploaded?, coverMime?, coverFilename?, coverUpdatedAt? }, ... }
 * @param {string} title
 * @param {string} author
 * @param {string} category
 * @param {string} [publisher]
 * @param {string} [notes]
 * @param {string} [isbn]
 */
export function createBookDocument(
  title,
  author,
  category,
  publisher = "",
  notes = "",
  isbn = ""
) {
  const n = typeof notes === "string" ? notes : "";
  if (n.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes must be at most ${MAX_NOTES_LENGTH} characters.`);
  }
  const i = typeof isbn === "string" ? isbn.trim() : "";
  if (i.length > MAX_ISBN_LENGTH) {
    throw new Error(`ISBN must be at most ${MAX_ISBN_LENGTH} characters.`);
  }
  return {
    book: {
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      publisher: String(publisher ?? "").trim(),
      notes: n.trim(),
      isbn: i,
    },
  };
}

export { MAX_NOTES_LENGTH, MAX_ISBN_LENGTH };
