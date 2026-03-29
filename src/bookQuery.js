function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {{ category?: string, search?: string }} opts
 */
export function buildFilter(opts) {
  const { category, search } = opts;
  const parts = [];

  if (category?.trim()) {
    parts.push({ "book.category": category.trim() });
  }

  if (search?.trim()) {
    const re = new RegExp(escapeRegex(search.trim()), "i");
    parts.push({
      $or: [
        { "book.title": re },
        { "book.author": re },
        { "book.publisher": re },
      ],
    });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}
