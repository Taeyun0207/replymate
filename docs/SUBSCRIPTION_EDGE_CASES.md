# Subscription & Database Edge Case Analysis

## Flow Overview

1. **checkout.session.completed** – New subscription or top-up purchased
2. **customer.subscription.updated** – Renewal, cancel-at-period-end, or period change
3. **customer.subscription.deleted** – Subscription ended (immediate cancel or period end)

---

## Edge Cases Analyzed

### 1. Pro user buys Pro+ (upgrade)

**Flow:** User on Pro → clicks Upgrade to Pro+ → new Stripe Checkout → new subscription created.

**What happens:**
- `checkout.session.completed` fires with `targetPlan: "pro_plus"`, `session.subscription` = new sub ID
- Code cancels **old** Pro subscription via `stripe.subscriptions.cancel(existingSubId)`
- `updateUserPlan(userId, "pro_plus", ..., newSubId)` → DB: plan=pro_plus, stripe_subscription_id=newSubId
- Stripe then fires `customer.subscription.deleted` for the **old** sub

**Race check:** `downgradeUserBySubscriptionId(oldSubId)` matches `stripe_subscription_id = oldSubId`. By then, the user already has `stripe_subscription_id = newSubId`, so **no row matches** → downgrade does nothing. Safe.

---

### 2. Pro+ user buys Pro (downgrade)

Same logic as above. Old Pro+ sub is cancelled, new Pro sub is stored. `subscription.deleted` for the old sub does not match because the user’s `stripe_subscription_id` is already the new one. Safe.

---

### 3. User cancels old sub but Stripe cancel fails

**Current code:**
```javascript
try {
  await stripe.subscriptions.cancel(existingSubId);
} catch (cancelErr) {
  console.warn("[Stripe] Could not cancel previous subscription:", cancelErr.message);
}
// Still proceeds with updateUserPlan
```

**Risk:** If cancel fails, the old subscription stays active in Stripe. The user still gets charged for the old plan until it ends. DB shows the new plan.

**Recommendation:** Add monitoring or retry logic. If cancel fails, consider:
- Returning an error to the user
- Or scheduling a retry / manual cleanup

---

### 4. `customer.subscription.updated` – plan not synced

**Current behavior:** Only syncs `billing_cycle_start`, `next_reset_at`, `cancel_at_period_end`. Does **not** update `plan`.

**Impact:** For your flow (new checkout per plan change), this is fine. Plan changes are handled by `checkout.session.completed`.

**If you ever use Stripe’s built-in plan change** (e.g. Customer Portal “change plan”), you would need to derive the plan from `subscription.items.data[0].price.id` and update the DB.

---

### 5. Cancel at period end, then upgrade before period ends

**Flow:** User on Pro, cancels at period end → later buys Pro+ before period ends.

**What happens:**
- `checkout.session.completed` fires with Pro+
- Code cancels the **old** Pro sub (immediate cancel, not at period end)
- `updateUserPlan(pro_plus, newSubId)` sets `cancel_at_period_end: false`, `period_end_at: null`
- User ends up on Pro+ with no cancellation scheduled. Correct.

---

### 6. User completes two checkouts in quick succession

**Flow:** User opens two checkout sessions (e.g. by clicking twice) and completes both.

**What happens:**
- First `checkout.session.completed` → update to first subscription
- Second `checkout.session.completed` → cancels first subscription, update to second subscription
- User ends up with the second subscription. DB matches the second subscription.

**Note:** Stripe may charge for both. The first subscription is cancelled immediately; refund behavior depends on Stripe’s settings. Consider adding a small debounce or warning if the user already has an active subscription.

---

### 7. `used` reset on upgrade

**Current behavior:** `updateUserPlan` sets `used: 0`.

**Effect:** Pro user with 80/100 → upgrades to Pro+ → gets 0/1000 used. This is a reasonable upgrade bonus.

---

### 8. Webhook retries / idempotency

**checkout.session.completed:** Calling `updateUserPlan` twice is idempotent; same result.

**subscription.deleted:** First run matches `stripe_subscription_id = oldSubId` and downgrades. Second run: no row has that ID anymore (set to null), so no rows match. Safe.

---

### 9. Top-up + subscription

**Flow:** Pro user buys a top-up pack.

**Behavior:** `checkout.session.completed` with `mode: "payment"`, `type: "topup"` → `createTopup(userId, pack)`. Plan is unchanged.

**Usage:** `recordUsage` consumes from subscription quota first, then from top-up. No conflict.

---

### 10. Free user with no prior subscription

**Flow:** Free user buys Pro.

**Behavior:** `existingSubId` is null → no cancel call. `updateUserPlan` runs. User is updated to Pro. Correct.

---

## Summary

| Edge case                         | Status |
|-----------------------------------|--------|
| Pro → Pro+ upgrade                | OK     |
| Pro+ → Pro downgrade              | OK     |
| Cancel old sub fails              | Risk – monitor |
| subscription.updated plan sync   | OK for current flow |
| Cancel at period end, then upgrade | OK |
| Double checkout                   | OK     |
| used reset on upgrade            | OK     |
| Webhook retries                  | OK     |
| Top-up + subscription            | OK     |
| Free → Pro                        | OK     |

---

## Suggested improvements

1. ~~**Cancel failure handling:**~~ ✅ Done – retry up to 3 times, return 500 if all fail.
2. ~~**Idempotency:**~~ ✅ Done – `stripe_webhook_events` table stores `event.id`; duplicate events return 200 without reprocessing.
3. **Plan change via subscription.updated:** If you later add Stripe Customer Portal or in-place plan changes, extend `subscription.updated` to map `price.id` → plan and update the DB.

---

## How Idempotency Works (Avoiding Same Event Twice)

Stripe may retry webhooks if your server is slow or returns 5xx. Without idempotency, the same event could be processed twice (e.g. user charged once but DB updated twice, or double top-up).

**Implementation:**
1. Create `stripe_webhook_events` table with `event_id` (primary key).
2. At the start of each webhook, try to insert `event.id`.
3. If insert succeeds → new event, process it.
4. If insert fails (unique violation) → already processed, return 200 immediately.
5. Stripe gets 200 and stops retrying.

**SQL to create the table:** See `SUPABASE_SETUP.md` section 2c.
