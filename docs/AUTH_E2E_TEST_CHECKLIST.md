# ReplyMate Auth – Implementation Audit & E2E Test Checklist

## Implementation Audit Summary

### Architecture Overview

| Component | Auth Flow |
|-----------|-----------|
| **Popup** | Uses `ReplyMateAuth` (auth.js) for sign-in, `getAccessToken()` for API calls. Syncs Supabase config to `chrome.storage` on load. |
| **Content script** | Uses `ReplyMateAuthShared` (auth-shared.js) for token/refresh. No Supabase client. |
| **Background** | Uses `ReplyMateAuthShared` via `importScripts`. Gets token for checkout. |
| **Backend** | `requireAuth` middleware verifies Bearer token via `supabase.auth.getUser(token)`, sets `req.userId`. |

---

## 1. Logged-Out Popup State

**Expected:** Sign-in button only; usage, plan, upgrade, cancel hidden.

**Implementation:**
- `updateLoginUI()` when `!isSignedIn`: sets `planUsageEl.style.display = "none"`, `upgradeBox.style.display = "none"`, `cancelSection.style.display = "none"`.
- `loadUsageData()` only runs when `ReplyMateAuth.isSignedIn()`.
- Login section hidden when `!ReplyMateAuth.isConfigured()`.

**Test checklist:**
- [ ] Open popup while logged out → only "Sign in with Google" visible
- [ ] Usage, plan, upgrade box, cancel section are hidden
- [ ] Settings (tone, length, name, language, Save) remain visible
- [ ] With empty Supabase config → login section hidden

---

## 2. Logged-Out AI Reply Blocking

**Expected:** Both in-email and hover buttons show "Please sign in with Google to use ReplyMate." and do not call the backend.

**Implementation:**
- **In-email button** (gmail.js ~1196): login check before `setReplyMateButtonState("loading")`; if `!token`, shows message and returns.
- **Hover button** (gmail.js ~2292): same check before usage fetch.
- `generateAIReply()` returns `""` immediately if `!token`.

**Test checklist:**
- [ ] Click in-email Generate Reply while logged out → sign-in message, no API call
- [ ] Click hover Generate Reply while logged out → sign-in message, no API call
- [ ] Message text matches `signInRequired` translation (EN/KO/JP)

---

## 3. Login Success Flow

**Expected:** OAuth completes, session stored, UI switches to signed-in state.

**Implementation:**
- `ReplyMateAuth.signInWithGoogle()` uses `chrome.identity.launchWebAuthFlow`.
- Stores `replymate_supabase_session` and `replymate_auth_user` in `chrome.storage.local`.
- Redirect URL: `chrome.identity.getRedirectURL()` (must be in Supabase redirect URLs).

**Test checklist:**
- [ ] Click "Sign in with Google" → OAuth popup opens
- [ ] Complete Google sign-in → popup closes, popup shows "Signed in as [email]"
- [ ] Usage, plan, upgrade box appear
- [ ] Config synced to storage (`replymate_supabase_url`, `replymate_supabase_anon_key`)

---

## 4. Authenticated Usage Fetch

**Expected:** `/usage` called with `Authorization: Bearer <token>`, returns plan/usage.

**Implementation:**
- Popup: `fetchUsageFromBackend()` uses `getAccessToken()` and `Authorization: Bearer`.
- Content script: same via `ReplyMateAuthShared.getAccessToken()`.
- Backend: `requireAuth` verifies token, uses `req.userId` for `checkUsageLimit()`.

**Test checklist:**
- [ ] Popup: after login, usage shows (e.g. "Standard · X / 25 replies left")
- [ ] Content script: usage display updates after reply generation
- [ ] 401 from backend → `fetchUsageFromBackend()` returns `null`, no crash

---

## 5. Authenticated Reply Generation

**Expected:** `POST /generate-reply` with Bearer token succeeds and inserts reply.

**Implementation:**
- `generateAIReply()` sends `Authorization: Bearer ${token}`.
- Backend uses `req.userId` for `checkUsageLimit`, `recordUsage`.
- 401 response → shows `signInRequired` message.

**Test checklist:**
- [ ] In-email button: generates reply and inserts into editor
- [ ] Hover button: opens thread, generates reply, inserts
- [ ] Usage decrements after successful generation
- [ ] 401 → "Please sign in" message, no reply inserted

---

## 6. Upgrade Flow with Bearer Token

**Expected:** Checkout session created with authenticated user.

**Implementation:**
- Popup/content sends `CREATE_STRIPE_CHECKOUT` to background.
- Background calls `ReplyMateAuthShared.getAccessToken()`.
- If no token → opens pricing page directly.
- Backend: `requireAuth` on `/billing/create-checkout-session`, `userId` in Stripe metadata.

**Test checklist:**
- [ ] Logged in, click Upgrade to Pro → Stripe checkout opens
- [ ] Logged in, click Upgrade to Pro+ → Stripe checkout opens
- [ ] Logged out: upgrade buttons hidden (no direct test)
- [ ] If token missing when message received → pricing page opens

---

## 7. Cancel Subscription Flow with Bearer Token

**Expected:** Cancel request sent with Bearer token, success message shown.

**Implementation:**
- Popup cancel handler checks `getAccessToken()` first; if missing, shows sign-in alert.
- Sends `Authorization: Bearer ${token}` to `/billing/cancel-subscription`.
- Backend: `requireAuth`, uses `req.userId` for `getUser()`.

**Test checklist:**
- [ ] Pro/Pro+ user: click Cancel Subscription → confirm → success message with remaining days
- [ ] Cancel section only visible for pro/pro_plus
- [ ] 401 or missing token → error handling

---

## 8. Expired Token Refresh

**Expected:** Expired token is refreshed via Supabase before API calls.

**Implementation:**
- `auth-shared.js`: `getAccessToken()` checks `expires_at`; if within 60s of expiry, calls `refreshSession()`.
- `refreshSession()`: `POST {url}/auth/v1/token?grant_type=refresh_token` with `refresh_token`.
- Needs `replymate_supabase_url` and `replymate_supabase_anon_key` in storage (synced from popup).

**Test checklist:**
- [ ] Wait for token to expire (or manually shorten `expires_at` in storage)
- [ ] Trigger usage fetch or reply generation → refresh succeeds, request succeeds
- [ ] New session stored in `replymate_supabase_session`

---

## 9. Refresh Failure → Forced Sign-In Again

**Expected:** When refresh fails, `getAccessToken()` returns `null`; user must sign in again.

**Implementation:**
- `refreshSession()` returns `null` on any failure.
- `getAccessToken()` returns `null` when refresh fails.
- All flows treat `null` token as logged-out (sign-in message or redirect).

**Test checklist:**
- [ ] Invalidate refresh token (e.g. revoke in Supabase) or expire it
- [ ] Try usage fetch or reply → "Please sign in" message
- [ ] Popup shows logged-out state
- [ ] User must click "Sign in with Google" again

---

## 10. Backend 401 Behavior Without Valid Token

**Expected:** Requests without valid Bearer token return 401.

**Implementation:**
- `requireAuth`: missing or invalid `Authorization: Bearer` → 401.
- `supabase.auth.getUser(token)` error or no user → 401.
- Protected routes: `/usage`, `/generate-reply`, `/billing/create-checkout-session`, `/billing/cancel-subscription`.

**Test checklist:**
- [ ] `GET /usage` without header → 401
- [ ] `GET /usage` with `Authorization: Bearer invalid` → 401
- [ ] `GET /usage` with expired token → 401
- [ ] `POST /generate-reply` without header → 401
- [ ] Stripe webhook remains unprotected (no auth)

---

## Reported Bugs & Edge Cases

### Bug 1: Hover Button Continues on 401 from Usage Check (Medium) — FIXED

**Location:** `gmail.js` ~2310–2325

**Issue:** If the usage fetch returns 401 (e.g. expired token), the code would fall through and call `runHoverGenerateReplyWorkflow`, wasting user time before failing at generate.

**Fix applied:** Explicit 401 check after usage fetch; return early with sign-in message.

---

### Edge Case 1: Config Availability (Resolved)

**Resolution:** auth-config.js is loaded by content script and background. Config: storage first, then global. Token refresh works without opening popup first. If the user signs in, closes the popup, and never opens it again before the token expires, the content script’s refresh will fail because `replymate_supabase_url` and `replymate_supabase_anon_key` may not be in storage.


---

### Edge Case 2: Sign-Out Calls loadUsageData (Minor)

**Location:** `popup.js` ~520

**Issue:** After sign-out, `loadUsageData(language)` is called. With no token, `fetchUsageFromBackend()` returns `null`. `updatePlanUsageDisplay(null)` and `updateUpgradeLink('free')` run on elements that are already hidden. Harmless but redundant.

---

### Edge Case 3: Supabase Refresh Response Format

**Location:** `auth-shared.js` ~46

**Issue:** Refresh assumes `data.access_token` and `data.expires_in` exist. Supabase’s token endpoint returns these, but if the format changes, refresh could break. Current implementation matches Supabase v1 token API.

---

## Quick Reference: Key Code Paths

| Flow | File | Function/Line |
|------|------|---------------|
| Popup login UI | popup.js | `updateLoginUI()` ~445 |
| Popup get token | popup.js | `getAccessToken()` ~116 |
| Content get token | gmail.js | `getAccessToken()` ~249 |
| Content login check (in-email) | gmail.js | ~1196 |
| Content login check (hover) | gmail.js | ~2292 |
| Backend auth | server.js | `requireAuth()` ~15 |
| Token refresh | auth-shared.js | `refreshSession()` ~23 |
| Config sync | popup.js | `syncAuthConfigToStorage()` ~428 |
