import dotenv from "dotenv";
import { sql } from "drizzle-orm";

// Load env vars before importing database config
dotenv.config({ path: ".env.local" });

async function main() {
  console.log("Attempting to fix user_types enum...");
  try {
    // Dynamic import to ensure env vars are loaded first
    const { db } = await import("../src/config/database.ts");
    
    console.log("Wiping public schema to remove all orphaned data and dependencies...");
    // Drop schema public and recreate. This removes all tables, types, and data.
    await db.execute(sql`DROP SCHEMA public CASCADE;`);
    await db.execute(sql`CREATE SCHEMA public;`);
    await db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
    await db.execute(sql`COMMENT ON SCHEMA public IS 'standard public schema';`);
    
    console.log("Successfully wiped and recreated public schema.");
  } catch (error) {
    console.error("Error updating enum:", error);
  }
  process.exit(0);
}

main();
