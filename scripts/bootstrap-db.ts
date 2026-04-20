import { readFileSync } from "fs";
import { join } from "path";
import { getDatabasePool } from "../lib/aws/database";

async function main() {
  console.log("Bootstrapping database...");
  const sql = readFileSync(join(process.cwd(), "scripts/sql/bootstrap.sql"), "utf8");
  const pool = await getDatabasePool();
  
  try {
    await pool.query(sql);
    console.log("Database bootstrapped successfully.");
  } catch (err) {
    console.error("Failed to bootstrap database:", err);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
