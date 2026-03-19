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
    billingInterval: obj.billing_interval ?? obj.billingInterval ?? null,
    cancelAtPeriodEnd: !!obj.cancel_at_period_end,
    periodEndAt: obj.period_end_at ?? null,
    createdAt: obj.created_at ?? obj.createdAt,
    updatedAt: obj.updated_at ?? obj.updatedAt,
    translationUsed: obj.translation_used ?? 0,
    translationResetAt: obj.translation_reset_at ?? null,
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
    billing_interval: obj.billingInterval ?? null,
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
      const daysUntilNextReset = r.billingInterval === "annual" ? 365 : 30;
      const nextReset = new Date(nowMs + daysUntilNextReset * 24 * 60 * 60 * 1000).toISOString();
      console.log("[DB] Usage reset triggered for user:", userId, "interval:", r.billingInterval || "monthly");

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
    const updates = {
    plan,
    used: 0,
    billing_cycle_start: billingCycleStart,
    next_reset_at: nextReset,
    stripe_customer_id: stripeCustomerId ?? existingUser.stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId ?? existingUser.stripeSubscriptionId,
    cancel_at_period_end: false,
    period_end_at: null,
    updated_at: now,
  };
  if (options.billingInterval !== undefined) updates.billing_interval = options.billingInterval;
  const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updates)
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
  const insertData = {
    userId,
    plan,
    used: 0,
    billingCycleStart,
    nextResetAt: nextReset,
    stripeCustomerId,
    stripeSubscriptionId,
    createdAt: now,
    updatedAt: now,
  };
  if (options.billingInterval !== undefined) insertData.billingInterval = options.billingInterval;
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(toDb(insertData))
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

async function clearUserCancelScheduled(userId) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      cancel_at_period_end: false,
      period_end_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw error;
}

async function syncPeriodBySubscriptionId(subscriptionId, periodStartIso, periodEndIso, cancelAtPeriodEnd = null, periodEndAt = null, billingInterval = null, plan = null) {
  const now = new Date().toISOString();
  const updates = {
    billing_cycle_start: periodStartIso,
    next_reset_at: periodEndIso,
    updated_at: now,
  };
  if (billingInterval !== null) updates.billing_interval = billingInterval;
  if (plan !== null && ["pro", "pro_plus"].includes(plan)) updates.plan = plan;
  if (cancelAtPeriodEnd !== null) {
    updates.cancel_at_period_end = !!cancelAtPeriodEnd;
    updates.period_end_at = cancelAtPeriodEnd ? periodEndAt : null;
  }
  // Reset usage only when the billing period actually changed (renewal, plan switch).
  // Do NOT reset when: cancel_at_period_end only, or reactivation (undo cancel) - same period.
  const { data: existing } = await supabase
    .from(TABLE_NAME)
    .select("billing_cycle_start")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  const periodChanged = !existing || !existing.billing_cycle_start || existing.billing_cycle_start !== periodStartIso;
  if (periodChanged && cancelAtPeriodEnd !== true) {
    updates.used = 0;
    updates.translation_used = 0;
  }
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(updates)
    .eq("stripe_subscription_id", subscriptionId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const action = cancelAtPeriodEnd === true ? "cancel scheduled, usage preserved" : periodChanged ? "new period, usage reset" : "same period, usage preserved";
    console.log("[DB] Period synced from Stripe for user:", data.user_id, "(" + action + ")");
  }
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
      translation_used: 0,
      translation_reset_at: null,
      billing_cycle_start: now,
      next_reset_at: nextReset,
      stripe_subscription_id: null,
      billing_interval: null,
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

const WEBHOOK_EVENTS_TABLE = "stripe_webhook_events";

/**
 * Check if a Stripe webhook event was already processed (idempotency).
 * Returns true if already processed, false if new.
 */
async function isStripeEventProcessed(eventId) {
  const { data, error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) return false; // Table might not exist yet
  return !!data;
}

/**
 * Record that a Stripe webhook event was processed.
 * Call this at the start of processing to prevent duplicate handling.
 * Returns true if newly recorded, false if already processed (duplicate).
 */
async function recordStripeEventProcessed(eventId) {
  const now = new Date().toISOString();
  const { error } = await supabase.from(WEBHOOK_EVENTS_TABLE).insert({
    event_id: eventId,
    processed_at: now,
  });
  if (error) {
    if (error.code === "23505" || error.message?.includes("duplicate")) return false;
    throw error;
  }
  return true;
}

/**
 * Check if user can translate (does not consume). Free: 15/day. Pro: 50/day. Pro+: unlimited.
 * Returns { allowed: boolean, remaining?: number }.
 */
async function checkTranslationLimit(userId) {
  const { getTranslationLimit, getTranslationResetType } = require("./config/plans");

  const { data: row, error: fetchErr } = await supabase
    .from(TABLE_NAME)
    .select("plan, translation_used, translation_reset_at, next_reset_at")
    .eq("user_id", userId)
    .single();

  if (fetchErr || !row) throw fetchErr || new Error("User not found");

  const plan = row.plan ?? "free";
  const limit = getTranslationLimit(plan);

  if (limit === null) return { allowed: true, remaining: null };

  const now = new Date();
  const nowMs = now.getTime();
  let translationUsed = row.translation_used ?? 0;
  let translationResetAt = row.translation_reset_at;
  const resetType = getTranslationResetType(plan);

  const startOfNextDayUtc = () => {
    const d = new Date(now);
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  };

  if (resetType === "monthly" && (!translationResetAt || nowMs >= new Date(translationResetAt).getTime())) {
    translationResetAt = row.next_reset_at;
  }
  if (!translationResetAt || nowMs >= new Date(translationResetAt).getTime()) {
    translationUsed = 0;
  }

  if (translationUsed >= limit) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: limit - translationUsed };
}

/**
 * Consume one translation for the user. Call only after successful translation.
 */
async function recordTranslationUsage(userId) {
  const { getTranslationLimit, getTranslationResetType } = require("./config/plans");

  const { data: row, error: fetchErr } = await supabase
    .from(TABLE_NAME)
    .select("plan, translation_used, translation_reset_at, next_reset_at")
    .eq("user_id", userId)
    .single();

  if (fetchErr || !row) throw fetchErr || new Error("User not found");

  const plan = row.plan ?? "free";
  const limit = getTranslationLimit(plan);
  if (limit === null) return;

  const now = new Date();
  const nowMs = now.getTime();
  let translationUsed = row.translation_used ?? 0;
  let translationResetAt = row.translation_reset_at;
  const resetType = getTranslationResetType(plan);

  const startOfNextDayUtc = () => {
    const d = new Date(now);
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  };

  if (!translationResetAt || nowMs >= new Date(translationResetAt).getTime()) {
    translationUsed = 0;
    translationResetAt = resetType === "monthly" ? (row.next_reset_at || startOfNextDayUtc()) : startOfNextDayUtc();
  }

  const { error: updateErr } = await supabase
    .from(TABLE_NAME)
    .update({
      translation_used: translationUsed + 1,
      translation_reset_at: translationResetAt,
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId);

  if (updateErr) throw updateErr;
}

module.exports = {
  getUser,
  updateUserPlan,
  recordUsage,
  checkTranslationLimit,
  recordTranslationUsage,
  closeDatabase,
  testConnection,
  updateUserCancelScheduled,
  clearUserCancelScheduled,
  downgradeUserBySubscriptionId,
  syncPeriodBySubscriptionId,
  isStripeEventProcessed,
  recordStripeEventProcessed,
};
