import { MongoClient } from "mongodb";

const DEFAULT_URI = "mongodb://127.0.0.1:27017";
const DEFAULT_DB = "libraryCatalog";

export function getMongoConfig() {
  const uri = process.env.MONGODB_URI ?? DEFAULT_URI;
  const dbName = process.env.MONGODB_DB ?? DEFAULT_DB;
  return { uri, dbName };
}

/**
 * @param {string} [uri]
 */
export async function connect(uri) {
  const { uri: u } = getMongoConfig();
  const client = new MongoClient(uri ?? u, {
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  return client;
}
