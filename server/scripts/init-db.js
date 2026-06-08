import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, "../src/schema.sql");

try {
  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Database schema initialized.");
} finally {
  await pool.end();
}
