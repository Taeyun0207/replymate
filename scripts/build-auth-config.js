#!/usr/bin/env node
/**
 * Build auth-config.js and patch manifest.json from environment variables.
 * Run: SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy GOOGLE_CLIENT_ID=zzz node scripts/build-auth-config.js
 * Optional: REPLYMATE_UPGRADE_URL (default https://replymateai.app/pricing)
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
    if (trimmed.startsWith("GOOGLE_CLIENT_ID=") && !process.env.GOOGLE_CLIENT_ID) {
      process.env.GOOGLE_CLIENT_ID = trimmed.slice("GOOGLE_CLIENT_ID=".length).trim();
    }
    if (trimmed.startsWith("REPLYMATE_UPGRADE_URL=") && !process.env.REPLYMATE_UPGRADE_URL) {
      process.env.REPLYMATE_UPGRADE_URL = trimmed.slice("REPLYMATE_UPGRADE_URL=".length).trim();
    }
  });
}

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const upgradeUrl = process.env.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing";

// Supabase anon keys are JWTs (start with "eyJ"). Stripe keys start with "pk_" or "sb_publishable_".
if (key && !key.startsWith("eyJ")) {
  console.warn("\n⚠️  WARNING: SUPABASE_ANON_KEY does not look like a Supabase key (expected JWT starting with eyJ).");
  console.warn("   You may have used a Stripe key by mistake. Get the correct key from:");
  console.warn("   Supabase Dashboard → Project Settings → API → anon public\n");
}

const content = `/**
 * Supabase Auth configuration (generated from env).
 * Works in popup, content script, and service worker.
 */
(function() {
  const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
  g.REPLYMATE_SUPABASE_URL = ${JSON.stringify(url)};
  g.REPLYMATE_SUPABASE_ANON_KEY = ${JSON.stringify(key)};
  g.REPLYMATE_GOOGLE_CLIENT_ID = ${JSON.stringify(googleClientId)};
  g.REPLYMATE_UPGRADE_URL = ${JSON.stringify(upgradeUrl)};
})();
`;

const outPath = path.join(__dirname, "../replymate-extension/lib/auth-config.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content);
console.log("auth-config.js written to", outPath);

// Patch manifest.json with Google OAuth client_id
const manifestPath = path.join(__dirname, "../replymate-extension/manifest.json");
if (fs.existsSync(manifestPath) && googleClientId) {
  let manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.oauth2) {
    manifest.oauth2.client_id = googleClientId;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log("manifest.json oauth2.client_id updated");
  }
}
