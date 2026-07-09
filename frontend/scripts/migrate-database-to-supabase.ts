import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

type DatabaseJson = Record<string, Record<string, unknown>[] | undefined>;

const TABLES = [
  "roles",
  "users",
  "assessments",
  "questions",
  "applicant_assessments",
  "answers",
  "recordings",
  "reviews",
] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in frontend/.env");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function readDatabaseJson(): DatabaseJson {
  const databasePath = path.join(projectRoot, "database.json");

  if (!fs.existsSync(databasePath)) {
    throw new Error(`database.json was not found at ${databasePath}`);
  }

  return JSON.parse(fs.readFileSync(databasePath, "utf-8")) as DatabaseJson;
}

function normalizeRows(table: string, rows: Record<string, unknown>[]) {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }

  if (table === "questions") {
    columns.add("options");
  }

  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};

    for (const column of columns) {
      normalized[column] = row[column] ?? null;
    }

    if (table === "questions") {
      normalized.options = Array.isArray(row.options) ? row.options : null;
    }

    return normalized;
  });
}

async function upsertTable(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    console.log(`${table}: inserted 0 rows`);
    return;
  }

  const normalizedRows = normalizeRows(table, rows);
  const { data, error } = await supabase
    .from(table)
    .upsert(normalizedRows, { onConflict: "id" })
    .select("id");

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table}: inserted ${data?.length ?? rows.length} rows`);
}

async function main() {
  const db = readDatabaseJson();

  for (const table of TABLES) {
    await upsertTable(table, db[table] ?? []);
  }

  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
