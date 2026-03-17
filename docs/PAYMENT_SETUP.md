# ReplyMate Payment Setup Guide

This guide explains how to enable payments on your upgrade page (https://taeyun0207.github.io/replymate-site/upgrade/index.html).

---

## 1. Backend Checklist (already configured)

Your `.env` has:
- `STRIPE_SECRET_KEY` (test mode)
- `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_PRO_PLUS_MONTHLY`, `STRIPE_PRICE_PRO_PLUS_ANNUAL`
- `STRIPE_WEBHOOK_SECRET`
- `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` → your upgrade page

---

## 2. Stripe Webhook (required)

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Add endpoint: `https://replymate-backend-bot8.onrender.com/stripe/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` in Render env

---

## 3. Google OAuth for Upgrade Page

The upgrade page needs Google Sign-In (same Supabase project as the extension).

1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Open your OAuth 2.0 Client ID (Web application)
3. Under **Authorized redirect URIs**, add:
   - `https://taeyun0207.github.io/replymate-site/upgrade/index.html`
   - `https://cmmoirdihefyswerkkay.supabase.co/auth/v1/callback` (if not already there)
4. Under **Authorized JavaScript origins**, add:
   - `https://taeyun0207.github.io`
   - `https://taeyun0207.github.io/replymate-site`

---

## 4. Upgrade Page Integration

Your upgrade page must:
1. **Sign in** the user with Supabase (Google)
2. **Call the backend** to create a checkout session
3. **Redirect** to the Stripe checkout URL

### Add to your upgrade page HTML

```html
<!-- Before </head> -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Before </body> -->
<script>
  window.REPLYMATE_BACKEND = "https://replymate-backend-bot8.onrender.com";
  window.REPLYMATE_SUPABASE_URL = "https://cmmoirdihefyswerkkay.supabase.co";
  window.REPLYMATE_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtbW9pcmRpaGVmeXN3ZXJra2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjIzNDUsImV4cCI6MjA4OTAzODM0NX0.gOButw9b4ZrUhVFMBwqf5le2rq7pAeJ0pFhSTKEOcek";
</script>
<script src="./upgrade-page-checkout.js"></script>
```

Copy `docs/upgrade-page-checkout.js` from this repo into your replymate-site project (e.g. next to `upgrade/index.html`) and reference it as above.

### Add data attributes to your buttons

```html
<!-- Pro Annual (default) -->
<button data-replymate-plan="pro" data-replymate-billing="annual">Upgrade to Pro</button>

<!-- Pro Monthly -->
<button data-replymate-plan="pro" data-replymate-billing="monthly">Monthly Plan</button>

<!-- Pro+ Annual -->
<button data-replymate-plan="pro_plus" data-replymate-billing="annual">Upgrade to Pro+</button>

<!-- Pro+ Monthly -->
<button data-replymate-plan="pro_plus" data-replymate-billing="monthly">Monthly Plan</button>

<!-- Cancel subscription (schedules cancel at period end) -->
<button data-replymate-cancel>Cancel subscription</button>
```

Flow: User clicks → if not logged in, Google sign-in opens → after sign-in, checkout is created → redirect to Stripe.

**Cancel subscription:** Calls the same backend as the extension. Schedules cancellation at period end; user keeps access until then.

---

## 5. Quick Option: Open Extension Popup

If you prefer not to add auth to the upgrade page, you can make the buttons open the extension popup instead:

```html
<!-- Upgrade to Pro - opens extension popup (user must have extension installed) -->
<a href="chrome-extension://YOUR_EXTENSION_ID/popup.html" target="_blank">
  Upgrade to Pro
</a>
```

Replace `YOUR_EXTENSION_ID` with your published extension ID (from Chrome Web Store → your extension → ID in URL).

**Limitation:** Only works when the user has the extension installed and clicks from a page that allows `chrome-extension://` links (some sites block it).

---

## 6. Full Option: API-Based Checkout on the Page

See `upgrade-page-checkout.js` in this folder for a ready-to-use script.
