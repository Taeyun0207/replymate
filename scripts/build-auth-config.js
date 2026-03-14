#!/usr/bin/env node
/**
 * Build auth-config.js from environment variables.
 * Run: SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy node scripts/build-auth-config.js
 * Or: node scripts/build-auth-config.js (reads from replymate-backend/.env if present)
 */
const fs = require("fs");
const path = require("path");

// Try to load from backend .env
const backendEnv = path.join(__dirname, "../replymate-backend/.env");
if (fs.existsSync(backendEnv)) {
  const envContent = fs.readFileSync(backendEnv, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("SUPABASE_URL=") && !process.env.SUPABASE_URL) {
      process.env.SUPABASE_URL = trimmed.slice("SUPABASE_URL=".length).trim();
    }
    if (trimmed.startsWith("SUPABASE_ANON_KEY=") && !process.env.SUPABASE_ANON_KEY) {
      process.env.SUPABASE_ANON_KEY = trimmed.slice("SUPABASE_ANON_KEY=".length).trim();
    }
  });
}

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";

const content = `/**
 * Supabase Auth configuration (generated from env).
 * Works in popup, content script, and service worker.
 */
(function() {
  const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
  g.REPLYMATE_SUPABASE_URL = ${JSON.stringify(url)};
  g.REPLYMATE_SUPABASE_ANON_KEY = ${JSON.stringify(key)};
})();
`;

const outPath = path.join(__dirname, "../replymate-extension/lib/auth-config.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content);
console.log("auth-config.js written to", outPath);
