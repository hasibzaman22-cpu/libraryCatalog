import "dotenv/config";
import { connect, getMongoConfig } from "./db.js";
import { buildFilter } from "./bookQuery.js";

const COLLECTION = "books";

function printUsage() {
  console.log(`Usage:
  npm run list
  npm run list -- --category <category>    (alias: -c)
  npm run list -- --search <text>          (alias: -s; title, author, or publisher)
  npm run list -- --category Adab --search ghazali

Examples:
  npm run list -- -c "Science fiction"
  npm run list -- --search "Al Ghazali"`);
}

function parseArgs(argv) {
  let category;
  let search;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      return { help: true };
    }
    if (a === "--category" || a === "-c") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --category / -c");
      category = v;
      continue;
    }
    if (a === "--search" || a === "-s") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value after --search / -s");
      search = v;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return { category, search };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message));
    printUsage();
    process.exit(1);
  }

  if (parsed.help) {
    printUsage();
    return;
  }

  const filter = buildFilter(parsed);

  const { dbName } = getMongoConfig();
  const client = await connect();
  try {
    const db = client.db(dbName);
    const books = db.collection(COLLECTION);
    const all = await books.find(filter).sort({ _id: 1 }).toArray();
    console.log(JSON.stringify(all, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
