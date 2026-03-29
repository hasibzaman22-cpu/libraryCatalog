import "dotenv/config";
import { connect, getMongoConfig } from "./db.js";
import { createBookDocument } from "./book.js";

const COLLECTION = "books";

async function main() {
  const { dbName } = getMongoConfig();
  const client = await connect();
  try {
    const db = client.db(dbName);
    const books = db.collection(COLLECTION);

    const doc = createBookDocument(
      "The Left Hand of Darkness",
      "Ursula K. Le Guin",
      "Science fiction",
      "Ace Books"
    );
    const { insertedId } = await books.insertOne(doc);
    console.log("Inserted:", insertedId.toString());

    const found = await books.findOne({ _id: insertedId });
    console.log("Loaded:", JSON.stringify(found, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
