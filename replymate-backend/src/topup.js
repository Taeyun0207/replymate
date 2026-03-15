const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const TOPUP_TABLE = "user_topups";

/**
 * Add top-up credits after purchase. One row per user.
 * Adds packSize to existing balance; sets expiry to 1 year from now (lenient).
 * @param {string} userId
 * @param {number} packSize - 100 or 500
 */
async function createTopup(userId, packSize) {
  try {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const { data: existing, error: fetchErr } = await supabase
      .from(TOPUP_TABLE)
      .select("remaining_replies")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.warn("[DB] createTopup fetch failed:", fetchErr.message);
      throw fetchErr;
    }

    if (existing) {
      const newRemaining = (existing.remaining_replies || 0) + packSize;
      const { error: updateErr } = await supabase
        .from(TOPUP_TABLE)
        .update({
          remaining_replies: newRemaining,
          expiry_date: expiryDate,
          updated_at: nowIso,
        })
        .eq("user_id", userId);

      if (updateErr) throw updateErr;
      console.log("[DB] Top-up added:", userId, "+" + packSize, "total:", newRemaining);
    } else {
      const { error: insertErr } = await supabase
        .from(TOPUP_TABLE)
        .insert({
          user_id: userId,
          remaining_replies: packSize,
          expiry_date: expiryDate,
          updated_at: nowIso,
        });

      if (insertErr) throw insertErr;
      console.log("[DB] Top-up created:", userId, packSize, "replies");
    }
  } catch (e) {
    console.error("[DB] createTopup failed:", e?.message);
    throw e;
  }
}

/**
 * Get total remaining top-up replies for user (one row per user).
 * Returns 0 if expired, no row, or table missing.
 */
async function getTotalTopupRemaining(userId) {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TOPUP_TABLE)
      .select("remaining_replies, expiry_date")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[DB] getTotalTopupRemaining failed:", error.message);
      return 0;
    }
    if (!data || !data.expiry_date || data.expiry_date <= now) return 0;
    return Math.max(0, data.remaining_replies || 0);
  } catch (e) {
    console.warn("[DB] getTotalTopupRemaining error:", e?.message);
    return 0;
  }
}

/**
 * Consume 1 reply from top-up.
 * @returns {boolean} true if consumed, false if none available
 */
async function consumeTopupReply(userId) {
  try {
    const now = new Date().toISOString();
    const { data, error: fetchErr } = await supabase
      .from(TOPUP_TABLE)
      .select("remaining_replies, expiry_date")
      .eq("user_id", userId)
      .single();

    if (fetchErr || !data) return false;
    if (!data.expiry_date || data.expiry_date <= now) return false;

    const current = data.remaining_replies || 0;
    if (current <= 0) return false;

    const newRemaining = current - 1;
    const { error: updateErr } = await supabase
      .from(TOPUP_TABLE)
      .update({
        remaining_replies: newRemaining,
        updated_at: now,
      })
      .eq("user_id", userId);

    if (updateErr) {
      console.warn("[DB] consumeTopupReply failed:", updateErr.message);
      return false;
    }
    console.log("[DB] Top-up consumed 1 for user:", userId, "remaining:", newRemaining);
    return true;
  } catch (e) {
    console.warn("[DB] consumeTopupReply error:", e?.message);
    return false;
  }
}

module.exports = {
  createTopup,
  getTotalTopupRemaining,
  consumeTopupReply,
};
