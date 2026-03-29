/**
 * Each stored document has shape: { book: { title, author, category, publisher }, ... }
 * @param {string} title
 * @param {string} author
 * @param {string} category
 * @param {string} publisher
 */
export function createBookDocument(title, author, category, publisher) {
  return {
    book: {
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      publisher: publisher.trim(),
    },
  };
}
