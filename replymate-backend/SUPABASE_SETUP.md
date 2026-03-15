# Supabase Setup

## 0. API keys (required for auth)

**Get keys from Supabase Dashboard → Project Settings → API**

- `SUPABASE_ANON_KEY` – **anon public** key (JWT format, starts with `eyJ`)
- `SUPABASE_SERVICE_ROLE_KEY` – **service_role** key (JWT format)

⚠️ **Do not use Stripe keys.** Keys starting with `sb_publishable_` or `pk_` are wrong.  
Add both to `replymate-backend/.env`, then run:

```bash
node scripts/build-auth-config.js
```

Reload the extension after rebuilding auth-config.

---

## 1. Create the table

Run this in **Supabase Dashboard → SQL Editor** (use snake_case; Postgres lowercases unquoted names):

```sql
CREATE TABLE IF NOT EXISTS public.users (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  used INTEGER NOT NULL DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ NOT NULL,
  next_reset_at TIMESTAMPTZ NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.users
  FOR ALL USING (true) WITH CHECK (true);
```

**If your table has camelCase columns** (userid, billingcyclestart, etc.), rename them to snake_case:

```sql
ALTER TABLE public.users RENAME COLUMN userid TO user_id;
ALTER TABLE public.users RENAME COLUMN billingcyclestart TO billing_cycle_start;
ALTER TABLE public.users RENAME COLUMN nextresetat TO next_reset_at;
ALTER TABLE public.users RENAME COLUMN stripecustomerid TO stripe_customer_id;
ALTER TABLE public.users RENAME COLUMN stripesubscriptionid TO stripe_subscription_id;
ALTER TABLE public.users RENAME COLUMN createdat TO created_at;
ALTER TABLE public.users RENAME COLUMN updatedat TO updated_at;
```

## 2. Cancel subscription columns (optional)

For "Cancel at period end" to show scheduled status in the UI:

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS period_end_at TIMESTAMPTZ;
```

## 2b. Top-up credits table (optional)

For one-time reply packs (100 / 500 replies). One row per user; expiry extends to 1 year from each purchase.

```sql
CREATE TABLE IF NOT EXISTS public.user_topups (
  user_id TEXT PRIMARY KEY,
  remaining_replies INTEGER NOT NULL DEFAULT 0,
  expiry_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_topups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.user_topups;
CREATE POLICY "Service role full access" ON public.user_topups FOR ALL USING (true) WITH CHECK (true);
```

**If you have the old multi-row schema**, migrate by dropping and recreating (existing top-up credits will be lost):

```sql
DROP TABLE IF EXISTS public.user_topups;
-- Then run the CREATE TABLE above
```

## 3. Stripe webhook (for upgrades, renewals, and cancellations)

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Add endpoint: `https://replymate-backend-bot8.onrender.com/stripe/webhook` (or your backend URL)
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** and add to Render env as `STRIPE_WEBHOOK_SECRET`

- `checkout.session.completed` – upgrades plan after payment; also handles top-up purchases (one-time payment)
- `customer.subscription.updated` – syncs billing period when subscription renews or changes
- `customer.subscription.deleted` – downgrades to free when subscription ends

**Top-up Stripe setup:** Create two one-time prices in Stripe ($3.99 for 100 replies, $7.99 for 500 replies) and add to `.env`:
- `STRIPE_PRICE_TOPUP_100` – price ID for +100 replies pack
- `STRIPE_PRICE_TOPUP_500` – price ID for +500 replies pack
