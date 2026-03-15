const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const TOPUP_TABLE = "user_topups";

/**
 * Create a top-up record after purchase.
 * @param {string} userId
 * @param {number} packSize - 100 or 500
 * @param {string} purchaseDateIso
 * @param {string} expiryDateIso
 * @param {string} stripePaymentIntentId - optional, for idempotency
 */
async function createTopup(userId, packSize, purchaseDateIso, expiryDateIso, stripePaymentIntentId = null) {
  const { data, error } = await supabase
    .from(TOPUP_TABLE)
    .insert({
      user_id: userId,
      pack_size: packSize,
      remaining_replies: packSize,
      purchase_date: purchaseDateIso,
      expiry_date: expiryDateIso,
      stripe_payment_intent_id: stripePaymentIntentId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[DB] createTopup failed:", error.message);
    throw error;
  }
  console.log("[DB] Top-up created:", userId, packSize, "replies, id:", data?.id);
  return data;
}

/**
 * Get valid (non-expired) top-ups for user, ordered by expiry (earliest first).
 * Returns [] if table does not exist or query fails (graceful degradation).
 */
async function getValidTopups(userId) {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TOPUP_TABLE)
      .select("id, remaining_replies, expiry_date")
      .eq("user_id", userId)
      .gt("expiry_date", now)
      .gt("remaining_replies", 0)
      .order("expiry_date", { ascending: true });

    if (error) {
      console.warn("[DB] getValidTopups failed (table may not exist):", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn("[DB] getValidTopups error:", e?.message);
    return [];
  }
}

/**
 * Get total remaining top-up replies for user.
 */
async function getTotalTopupRemaining(userId) {
  const topups = await getValidTopups(userId);
  return topups.reduce((sum, t) => sum + (t.remaining_replies || 0), 0);
}

/**
 * Consume 1 reply from top-up. Uses earliest-expiry-first.
 * @returns {boolean} true if consumed, false if no top-up available or table missing
 */
async function consumeTopupReply(userId) {
  try {
    const topups = await getValidTopups(userId);
    if (topups.length === 0) return false;

    const topup = topups[0];
    const newRemaining = Math.max(0, (topup.remaining_replies || 0) - 1);

    const { error } = await supabase
      .from(TOPUP_TABLE)
      .update({
        remaining_replies: newRemaining,
        updated_at: new Date().toISOString(),
      })
      .eq("id", topup.id);

    if (error) {
      console.warn("[DB] consumeTopupReply failed:", error.message);
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
  getValidTopups,
  getTotalTopupRemaining,
  consumeTopupReply,
};
