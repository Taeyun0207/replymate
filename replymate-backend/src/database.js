const { createClient } = require("@supabase/supabase-js");

// Use service role key for server-side table access (bypasses RLS); fallback to anon key
// Add SUPABASE_SERVICE_ROLE_KEY to .env (Supabase Dashboard → Settings → API)
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase table: users (snake_case columns)
// CREATE TABLE users (
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
    .from("users")
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
        .from("users")
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
    .from("users")
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

  if (insertErr) throw insertErr;
  console.log("[DB] User created:", userId);
  return toRow(inserted);
}

async function updateUserPlan(
  userId,
  plan,
  stripeCustomerId = null,
  stripeSubscriptionId = null
) {
  const now = new Date().toISOString();
  const nextReset = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const existingUser = await getUser(userId);

  if (existingUser) {
    console.log("[DB] Updating existing user plan:", userId, "to:", plan);
    const { data, error } = await supabase
      .from("users")
      .update({
        plan,
        used: 0,
        billing_cycle_start: now,
        next_reset_at: nextReset,
        stripe_customer_id: stripeCustomerId ?? existingUser.stripeCustomerId,
        stripe_subscription_id:
          stripeSubscriptionId ?? existingUser.stripeSubscriptionId,
        updated_at: now,
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    return toRow(data);
  }

  console.log("[DB] Inserting new user with plan:", userId, plan);
  const { data, error } = await supabase
    .from("users")
    .insert(
      toDb({
        userId,
        plan,
        used: 0,
        billingCycleStart: now,
        nextResetAt: nextReset,
        stripeCustomerId,
        stripeSubscriptionId,
        createdAt: now,
        updatedAt: now,
      })
    )
    .select()
    .single();

  if (error) throw error;
  return toRow(data);
}

async function recordUsage(userId) {
  const now = new Date().toISOString();

  const { data: row, error: fetchErr } = await supabase
    .from("users")
    .select("used")
    .eq("user_id", userId)
    .single();

  if (fetchErr || !row) throw fetchErr || new Error("User not found");

  const newUsed = (row.used ?? 0) + 1;
  const { error: updateErr } = await supabase
    .from("users")
    .update({ used: newUsed, updated_at: now })
    .eq("user_id", userId);

  if (updateErr) throw updateErr;
  console.log("[DB] Usage incremented for user:", userId);
  return 1;
}

function closeDatabase() {
  // No-op: Supabase client does not require explicit connection close
}

module.exports = {
  getUser,
  updateUserPlan,
  recordUsage,
  closeDatabase,
};
