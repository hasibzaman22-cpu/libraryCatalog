import "dotenv/config";
import { ObjectId } from "mongodb";
import { connect, getMongoConfig } from "./db.js";

const COLLECTION = "books";

function printUsage() {
  console.error(
    "Usage: npm run remove -- <id>\n" +
      "Example: npm run remove -- 69c8cc8ddecd311f17711965\n" +
      "Use npm run list to see document _id values."
  );
}

function parseObjectId(hex) {
  try {
    return new ObjectId(hex);
  } catch {
    throw new Error(`Invalid id (expected 24-character hex): ${hex}`);
  }
}

async function main() {
  const idArg = process.argv[2];
  if (!idArg || idArg === "--help" || idArg === "-h") {
    printUsage();
    process.exit(idArg ? 0 : 1);
  }

  const _id = parseObjectId(idArg);

  const { dbName } = getMongoConfig();
  const client = await connect();
  try {
    const db = client.db(dbName);
    const books = db.collection(COLLECTION);
    const result = await books.deleteOne({ _id });
    if (result.deletedCount === 0) {
      console.error("No book found with that id.");
      process.exit(1);
    }
    console.log("Deleted:", idArg);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
