/**
 * @param {import("mongodb").ObjectId} userId
 * @param {import("mongodb").Filter} filter
 */
export function scopeBooksToUser(userId, filter) {
  const owner = { userId };
  if (!filter || Object.keys(filter).length === 0) {
    return owner;
  }
  return { $and: [owner, filter] };
}
