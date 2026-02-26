/**
 * Prints the checksum and INSERT for a Prisma migration so you can record it
 * in _prisma_migrations via Supabase SQL Editor (no Prisma DB connection needed).
 *
 * Usage: node scripts/print-migration-checksum.js [migration_folder_name]
 * Example: node scripts/print-migration-checksum.js 20260226120000_add_user_phone_sms_optout
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const migrationName = process.argv[2] || "20260226120000_add_user_phone_sms_optout";
const migrationDir = path.join(__dirname, "..", "prisma", "migrations", migrationName);
const migrationFile = path.join(migrationDir, "migration.sql");

if (!fs.existsSync(migrationFile)) {
  console.error("Migration not found:", migrationFile);
  process.exit(1);
}

const content = fs.readFileSync(migrationFile, "utf8");
const checksum = crypto.createHash("sha256").update(content).digest("hex");

console.log("Migration:", migrationName);
console.log("Checksum:", checksum);
console.log("");
console.log("-- Run this in Supabase SQL Editor to record the migration:");
console.log("");
console.log(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)`);
console.log(`VALUES (gen_random_uuid()::text, '${checksum}', '${migrationName}', NOW(), NOW(), 1);`);
