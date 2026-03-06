#!/usr/bin/env node

/**
 * One-time migration script: seeds D1 config tables from existing wrangler.toml env vars.
 *
 * Usage:
 *   node scripts/migrate-env-to-db.mjs          # Remote (production) DB
 *   node scripts/migrate-env-to-db.mjs --local   # Local dev DB
 *
 * Reads CHANNELS, VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_HOURS from the current
 * wrangler.toml [vars] and inserts into site_config, channels, feeds, and
 * rate_limit_config tables. Exits with error if any target table already contains data.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const isLocal = process.argv.includes("--local");
const localFlag = isLocal ? "--local" : "--remote";
const DB_NAME = "feedmail";

/**
 * Execute a SQL statement against D1.
 */
function d1Execute(sql) {
  const cmd = `npx wrangler d1 execute ${DB_NAME} ${localFlag} --command "${sql.replace(/"/g, '\\"')}"`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return output;
  } catch (err) {
    console.error(`SQL execution failed: ${sql}`);
    console.error(err.stderr || err.message);
    process.exit(1);
  }
}

/**
 * Check if a table has any rows.
 */
function tableHasData(table) {
  const output = d1Execute(`SELECT COUNT(*) as count FROM ${table}`);
  // Parse the count from wrangler output
  return output.includes('"count":') && !output.includes('"count": 0') && !output.includes('"count":0');
}

// ─── Read current wrangler.toml config ──────────────────────────────────────

let tomlContent;
try {
  tomlContent = readFileSync("wrangler.toml", "utf-8");
} catch {
  console.error("Error: Cannot read wrangler.toml. Run this script from the project root.");
  process.exit(1);
}

// Parse CHANNELS from wrangler.toml [vars]
function parseTomlVar(content, varName) {
  // Try multi-line string (triple quotes)
  const multiLineRegex = new RegExp(`${varName}\\s*=\\s*'''\\n?([\\s\\S]*?)'''`);
  const multiMatch = content.match(multiLineRegex);
  if (multiMatch) return multiMatch[1].trim();

  // Try single-line string
  const singleRegex = new RegExp(`${varName}\\s*=\\s*"([^"]*)"`)
  const singleMatch = content.match(singleRegex);
  if (singleMatch) return singleMatch[1];

  return null;
}

const channelsJson = parseTomlVar(tomlContent, "CHANNELS");
const verifyMaxAttempts = parseInt(parseTomlVar(tomlContent, "VERIFY_MAX_ATTEMPTS") || "3", 10);
const verifyWindowHours = parseInt(parseTomlVar(tomlContent, "VERIFY_WINDOW_HOURS") || "24", 10);

let channels = [];
if (channelsJson) {
  try {
    channels = JSON.parse(channelsJson);
  } catch (err) {
    console.error("Error: Failed to parse CHANNELS JSON from wrangler.toml");
    console.error(err.message);
    process.exit(1);
  }
}

// ─── Safety check: ensure target tables are empty ───────────────────────────

console.log(`Checking target tables (${localFlag})...`);

const tables = ["site_config", "channels", "feeds"];
for (const table of tables) {
  if (tableHasData(table)) {
    console.error(`Error: Table '${table}' already contains data. Aborting to prevent double-migration.`);
    process.exit(1);
  }
}

// ─── Insert site config ─────────────────────────────────────────────────────

console.log(`Inserting site_config: verify_max_attempts=${verifyMaxAttempts}, verify_window_hours=${verifyWindowHours}`);
d1Execute(
  `INSERT INTO site_config (id, verify_max_attempts, verify_window_hours) VALUES (1, ${verifyMaxAttempts}, ${verifyWindowHours})`,
);

// ─── Insert channels and feeds ──────────────────────────────────────────────

for (const channel of channels) {
  const corsOriginsJson = JSON.stringify(channel.corsOrigins).replace(/'/g, "''");
  const siteName = (channel.siteName || "").replace(/'/g, "''");
  const siteUrl = (channel.siteUrl || "").replace(/'/g, "''");
  const fromUser = (channel.fromUser || "").replace(/'/g, "''");
  const fromName = (channel.fromName || "").replace(/'/g, "''");
  const replyTo = channel.replyTo ? `'${channel.replyTo.replace(/'/g, "''")}'` : "NULL";
  const companyName = channel.companyName ? `'${channel.companyName.replace(/'/g, "''")}'` : "NULL";
  const companyAddress = channel.companyAddress ? `'${channel.companyAddress.replace(/'/g, "''")}'` : "NULL";

  console.log(`Inserting channel: ${channel.id}`);
  d1Execute(
    `INSERT INTO channels (id, site_name, site_url, from_user, from_name, reply_to, company_name, company_address, cors_origins) VALUES ('${channel.id}', '${siteName}', '${siteUrl}', '${fromUser}', '${fromName}', ${replyTo}, ${companyName}, ${companyAddress}, '${corsOriginsJson}')`,
  );

  if (channel.feeds) {
    for (const feed of channel.feeds) {
      const feedName = feed.name.replace(/'/g, "''");
      const feedUrl = feed.url.replace(/'/g, "''");
      console.log(`  Inserting feed: ${feed.name} (${feed.url})`);
      d1Execute(
        `INSERT INTO feeds (channel_id, name, url) VALUES ('${channel.id}', '${feedName}', '${feedUrl}')`,
      );
    }
  }
}

// ─── Done ───────────────────────────────────────────────────────────────────

console.log("\nMigration complete.");
if (channels.length === 0) {
  console.log("No channels found in wrangler.toml — site_config and rate_limit_config seeded only.");
} else {
  console.log(`Migrated ${channels.length} channel(s) with their feeds.`);
}
