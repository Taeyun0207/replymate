const { createClient } = require("@supabase/supabase-js");

// Use service role key for server-side table access (bypasses RLS); fallback to anon key
// Add SUPABASE_SERVICE_ROLE_KEY to .env (Supabase Dashboard → Settings → API)
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase table: user_usage (avoids conflict with auth.users)
// Run in Supabase SQL Editor:
// CREATE TABLE IF NOT EXISTS public.user_usage (
//   user_id TEXT PRIMARY KEY,
//   plan TEXT NOT NULL DEFAULT 'free',
//   used INTEGER NOT NULL DEFAULT 0,
//   billing_cycle_start TIMESTAMPTZ NOT NULL,
//   next_reset_at TIMESTAMPTZ NOT NULL,
//   stripe_customer_id TEXT,
//   stripe_subscription_id TEXT,
//   created_at TIMESTAMPTZ NOT NULL,
//   updated_at TIMESTAMPTZ NOT NULL
// );
// ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Service role full access" ON public.user_usage FOR ALL USING (true) WITH CHECK (true);
const TABLE_NAME = process.env.DB_TABLE_NAME || "users";

function toRow(obj) {
  if (!obj) return null;
  return {
    userId: obj.user_id ?? obj.userId,
    plan: obj.plan ?? "free",
    used: obj.used ?? 0,
    billingCycleStart: obj.billing_cycle_start ?? obj.billingCycleStart,
    nextResetAt: obj.next_reset_at ?? obj.nextResetAt,
    stripeCustomerId: obj.stripe_customer_id ?? obj.stripeCustomerId,
    stripeSubscriptionId: obj.stripe_subscription_id ?? obj.stripeSubscriptionId,
    cancelAtPeriodEnd: !!obj.cancel_at_period_end,
    periodEndAt: obj.period_end_at ?? null,
    createdAt: obj.created_at ?? obj.createdAt,
    updatedAt: obj.updated_at ?? obj.updatedAt,
  };
}

function toDb(obj) {
  return {
    user_id: obj.userId,
    plan: obj.plan,
    used: obj.used,
    billing_cycle_start: obj.billingCycleStart,
    next_reset_at: obj.nextResetAt,
    stripe_customer_id: obj.stripeCustomerId ?? null,
    stripe_subscription_id: obj.stripeSubscriptionId ?? null,
    created_at: obj.createdAt,
    updated_at: obj.updatedAt,
  };
}

async function getUser(userId) {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const nextResetDefault = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: row, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[DB] Supabase getUser error:", error.message);
    throw error;
  }

  if (row) {
    const r = toRow(row);
    const nextResetMs = new Date(r.nextResetAt).getTime();
    if (isNaN(nextResetMs)) {
      console.warn("[DB] Invalid nextResetAt for user:", userId, r.nextResetAt);
    }
    if (nowMs >= nextResetMs) {
      const newCycleStart = new Date(nowMs).toISOString();
      const nextReset = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();
      console.log("[DB] Monthly reset triggered for user:", userId);

      const { data: updated, error: updateErr } = await supabase
        .from(TABLE_NAME)
        .update({
          used: 0,
          billing_cycle_start: newCycleStart,
          next_reset_at: nextReset,
          updated_at: now,
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return toRow(updated);
    }
    return r;
  }

  // Create new user
  const { data: inserted, error: insertErr } = await supabase
    .from(TABLE_NAME)
    .insert(
      toDb({
        userId,
        plan: "free",
        used: 0,
        billingCycleStart: now,
        nextResetAt: nextResetDefault,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        createdAt: now,
        updatedAt: now,
      })
    )
    .select()
    .single();

  if (insertErr) {
    console.error("[DB] Insert user failed:", insertErr.message, insertErr.details);
    throw insertErr;
  }
  console.log("[DB] User created:", userId);
  return toRow(inserted);
}

async function updateUserPlan(
  userId,
  plan,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  options = {}
) {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const defaultNextReset = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Use Stripe period if provided; otherwise fall back to 30 days
  const billingCycleStart = options.billingCycleStart ?? now;
  const nextReset = options.nextResetAt ?? defaultNextReset;

  const existingUser = await getUser(userId);

  if (existingUser) {
    console.log("[DB] Updating existing user plan:", userId, "to:", plan, options.billingCycleStart ? "(Stripe period)" : "(default 30d)");
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({
        plan,
        used: 0,
        billing_cycle_start: billingCycleStart,
        next_reset_at: nextReset,
        stripe_customer_id: stripeCustomerId ?? existingUser.stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId ?? existingUser.stripeSubscriptionId,
        cancel_at_period_end: false,
        period_end_at: null,
        updated_at: now,
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("[DB] Update plan failed:", error.message, error.details);
      throw error;
    }
    return toRow(data);
  }

  console.log("[DB] Inserting new user with plan:", userId, plan);
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(
      toDb({
        userId,
        plan,
        used: 0,
        billingCycleStart,
        nextResetAt: nextReset,
        stripeCustomerId,
        stripeSubscriptionId,
        createdAt: now,
        updatedAt: now,
      })
    )
    .select()
    .single();

  if (error) {
    console.error("[DB] Insert user with plan failed:", error.message, error.details);
    throw error;
  }
  return toRow(data);
}

async function recordUsage(userId) {
  const { PLAN_LIMITS } = require("./config/plans");
  const { consumeTopupReply } = require("./topup");

  const { data: row, error: fetchErr } = await supabase
    .from(TABLE_NAME)
    .select("used, plan")
    .eq("user_id", userId)
    .single();

  if (fetchErr || !row) throw fetchErr || new Error("User not found");

  const limit = PLAN_LIMITS[row.plan] || PLAN_LIMITS.free;
  const used = row.used ?? 0;

  // Priority 1: consume from subscription (monthly quota)
  if (used < limit) {
    const now = new Date().toISOString();
    const newUsed = used + 1;
    const { error: updateErr } = await supabase
      .from(TABLE_NAME)
      .update({ used: newUsed, updated_at: now })
      .eq("user_id", userId);

    if (updateErr) {
      console.error("[DB] recordUsage failed:", updateErr.message, updateErr.details);
      throw updateErr;
    }
    console.log("[DB] Usage incremented (subscription) for user:", userId);
    return 1;
  }

  // Priority 2: consume from top-up (earliest expiry first)
  const consumed = await consumeTopupReply(userId);
  if (consumed) return 1;

  throw new Error("No replies available");
}

function closeDatabase() {
  // No-op: Supabase client does not require explicit connection close
}

async function updateUserCancelScheduled(userId, periodEndAt) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      cancel_at_period_end: true,
      period_end_at: periodEndAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw error;
}

async function syncPeriodBySubscriptionId(subscriptionId, periodStartIso, periodEndIso) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      billing_cycle_start: periodStartIso,
      next_reset_at: periodEndIso,
      updated_at: now,
    })
    .eq("stripe_subscription_id", subscriptionId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (data) console.log("[DB] Period synced from Stripe for user:", data.user_id);
  return data;
}

async function downgradeUserBySubscriptionId(subscriptionId) {
  const now = new Date().toISOString();
  const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      plan: "free",
      used: 0,
      billing_cycle_start: now,
      next_reset_at: nextReset,
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      period_end_at: null,
      updated_at: now,
    })
    .eq("stripe_subscription_id", subscriptionId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (data) console.log("[DB] User downgraded to free (subscription ended):", data.user_id);
  return data;
}

async function testConnection() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return true;
}

module.exports = {
  getUser,
  updateUserPlan,
  recordUsage,
  closeDatabase,
  testConnection,
  updateUserCancelScheduled,
  downgradeUserBySubscriptionId,
  syncPeriodBySubscriptionId,
};
