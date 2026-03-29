import "dotenv/config";
import { ObjectId } from "mongodb";
import { connect, getMongoConfig } from "./db.js";

const COLLECTION = "books";

function printUsage() {
  console.log(`Usage:
  npm run edit -- <id> [--title <text>] [--author <text>] [--category <text>] [--publisher <text>]

Provide at least one of --title, --author, --category, or --publisher.

Examples:
  npm run edit -- 69c8cc8ddecd311f17711965 --title "New title"
  npm run edit -- 69c8cc8ddecd311f17711965 --publisher "Penguin"`);
}

function parseObjectId(hex) {
  try {
    return new ObjectId(hex);
  } catch {
    throw new Error(`Invalid id (expected 24-character hex): ${hex}`);
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const idArg = argv[0];
  if (idArg.startsWith("-")) {
    throw new Error("First argument must be the book _id (from npm run list).");
  }

  const _id = parseObjectId(idArg);
  const updates = {};

  for (let i = 1; i < argv.length; ) {
    const flag = argv[i];
    if (flag === "--title") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --title");
      updates.title = v;
      i++;
      continue;
    }
    if (flag === "--author") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --author");
      updates.author = v;
      i++;
      continue;
    }
    if (flag === "--category") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --category");
      updates.category = v;
      i++;
      continue;
    }
    if (flag === "--publisher") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --publisher");
      updates.publisher = v;
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error(
      "Provide at least one of --title, --author, --category, or --publisher."
    );
  }

  return { _id, updates };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    printUsage();
    process.exit(1);
  }

  if (parsed.help) {
    printUsage();
    return;
  }

  const { _id, updates } = parsed;
  const $set = {};
  if (updates.title !== undefined) $set["book.title"] = updates.title.trim();
  if (updates.author !== undefined) $set["book.author"] = updates.author.trim();
  if (updates.category !== undefined) $set["book.category"] = updates.category.trim();
  if (updates.publisher !== undefined)
    $set["book.publisher"] = updates.publisher.trim();

  const { dbName } = getMongoConfig();
  const client = await connect();
  try {
    const db = client.db(dbName);
    const books = db.collection(COLLECTION);
    const result = await books.updateOne({ _id }, { $set });
    if (result.matchedCount === 0) {
      console.error("No book found with that id.");
      process.exit(1);
    }
    const found = await books.findOne({ _id });
    console.log(JSON.stringify(found, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
