import "dotenv/config";
import { connect, getMongoConfig } from "./db.js";
import { createBookDocument } from "./book.js";

const COLLECTION = "books";

function printUsage() {
  console.error(
    'Usage: npm run add -- "<title>" "<author>" "<category>" "<publisher>"\n' +
      'Example: npm run add -- "Dune" "Frank Herbert" "Science fiction" "Ace Books"'
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    printUsage();
    process.exit(1);
  }

  const [title, author, category, publisher] = args;
  const doc = createBookDocument(title, author, category, publisher);

  const { dbName } = getMongoConfig();
  const client = await connect();
  try {
    const db = client.db(dbName);
    const books = db.collection(COLLECTION);
    const { insertedId } = await books.insertOne(doc);
    console.log("Inserted:", insertedId.toString());
    const found = await books.findOne({ _id: insertedId });
    console.log(JSON.stringify(found, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
