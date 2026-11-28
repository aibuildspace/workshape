import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup } from "node:sqlite";
import { db } from "../src/lib/db";

const target = process.argv[2];
if (!target || target.startsWith("-")) {
  console.error("Usage: npm run backup -- /absolute/path/workshape-backup.sqlite");
  process.exit(2);
}
const destination = resolve(target);
if (existsSync(destination)) {
  console.error("Backup destination already exists. Choose a new file.");
  process.exit(2);
}
if (process.env.WORKSHAPE_DB === ":memory:") {
  console.error("An in-memory database cannot be backed up with this command.");
  process.exit(2);
}
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
process.umask(0o077);
await backup(db(), destination);
chmodSync(destination, 0o600);
console.log(`Backup created: ${destination}`);
