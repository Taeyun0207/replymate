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

## 3. Stripe webhook (for upgrades and cancellations)

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Add endpoint: `https://replymate-backend-bot8.onrender.com/stripe/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.deleted`
4. Copy the **Signing secret** and add to Render env as `STRIPE_WEBHOOK_SECRET`

- `checkout.session.completed` – upgrades plan after payment
- `customer.subscription.deleted` – downgrades to free when subscription ends
