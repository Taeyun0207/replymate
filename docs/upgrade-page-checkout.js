/**
 * ReplyMate Upgrade Page - Checkout Integration
 *
 * Add this script to your upgrade page (e.g. replymateai.app/upgrade)
 * along with Supabase and the config below.
 *
 * Two flows land on this page with success:
 * - Regular checkout: User pays via Stripe Checkout → redirect with ?success=1&session_id=cs_xxx
 * - Switch flow: User switches monthly ↔ annual → backend redirects with ?success=1&switch=1 (no session_id)
 *
 * 1. Add to your HTML <head>:
 *    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *
 * 2. Add config and this script before </body>:
 *    <script>
 *      window.REPLYMATE_BACKEND = "https://replymate-backend-bot8.onrender.com";
 *      window.REPLYMATE_SUPABASE_URL = "https://cmmoirdihefyswerkkay.supabase.co";
 *      window.REPLYMATE_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // same as extension
 *      window.REPLYMATE_UPGRADE_URL = "https://replymateai.app/upgrade"; // redirect after sign-in
 *    </script>
 *    <script src="upgrade-page-checkout.js"></script>
 *
 * 3. Add data attributes to your buttons:
 *    Upgrade: <button data-replymate-plan="pro" data-replymate-billing="annual">Upgrade to Pro</button>
 *    Cancel:  <button data-replymate-cancel>Cancel subscription</button>
 *
 * 4. Success banner: Add <div id="replymate-success-banner" style="display:none">...</div> and it will
 *    be shown when success=1, switch=1, or session_id is present. session_id is optional (for future use).
 *
 * 5. Auth-ready: The script fires "replymate-auth-ready" when auth is settled (after OAuth redirect).
 *    Wait for this event before fetching /billing/me or rendering auth-dependent content to avoid blank page.
 */

(function () {
  "use strict";

  const BACKEND = window.REPLYMATE_BACKEND || "https://replymate-backend-bot8.onrender.com";
  const SUPABASE_URL = window.REPLYMATE_SUPABASE_URL;
  const SUPABASE_ANON = window.REPLYMATE_SUPABASE_ANON;

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.warn("[ReplyMate Upgrade] Missing REPLYMATE_SUPABASE_URL or REPLYMATE_SUPABASE_ANON");
    return;
  }

  const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON);
  if (!supabase) {
    console.warn("[ReplyMate Upgrade] Supabase not loaded. Add: <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script>");
    return;
  }

  async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function signInWithGoogle() {
    const isLocalhost = /localhost|127\.0\.0\.1/i.test(window.location.hostname);
    const redirectTo = isLocalhost
      ? (window.REPLYMATE_UPGRADE_URL || "https://replymateai.app/upgrade")
      : window.location.href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) throw error;
  }

  async function createCheckout(plan, billingType) {
    const token = await getAccessToken();
    if (!token) {
      await signInWithGoogle();
      return;
    }

    const res = await fetch(`${BACKEND}/billing/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        targetPlan: plan,
        billingType: billingType || "annual"
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Checkout failed");

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      throw new Error("No checkout URL received");
    }
  }

  async function cancelSubscription() {
    const token = await getAccessToken();
    if (!token) {
      await signInWithGoogle();
      return;
    }

    const res = await fetch(`${BACKEND}/billing/cancel-subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to cancel subscription");

    return data;
  }

  function checkSuccessAndShowBanner() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success") === "1";
    const switchDone = params.get("switch") === "1";
    const sessionId = params.get("session_id");
    const isSuccess = success || switchDone || !!sessionId;
    if (isSuccess) {
      const banner = document.getElementById("replymate-success-banner") || document.querySelector("[data-replymate-success-banner]");
      if (banner) {
        banner.style.display = "";
      }
      window.REPLYMATE_CHECKOUT_SUCCESS = true;
      window.REPLYMATE_CHECKOUT_SESSION_ID = sessionId || null;
    }
  }

  async function waitForAuthReady() {
    const hasHash = window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token"));
    if (hasHash) {
      await new Promise((r) => setTimeout(r, 100));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return session;
    }
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  function init() {
    checkSuccessAndShowBanner();

    document.querySelectorAll("[data-replymate-plan]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const plan = btn.getAttribute("data-replymate-plan");
        const billing = btn.getAttribute("data-replymate-billing") || "annual";
        if (!plan || !["pro", "pro_plus"].includes(plan)) return;

        btn.disabled = true;
        btn.textContent = "Loading...";
        try {
          await createCheckout(plan, billing);
        } catch (err) {
          console.error("[ReplyMate Upgrade]", err);
          alert(err.message || "Something went wrong. Please try again.");
          btn.disabled = false;
          btn.textContent = btn.getAttribute("data-replymate-original-text") || "Upgrade";
        }
      });
      btn.setAttribute("data-replymate-original-text", btn.textContent);
    });

    document.querySelectorAll("[data-replymate-cancel]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!confirm("Cancel your subscription? You'll keep access until the end of your billing period.")) return;

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Cancelling...";
        try {
          const data = await cancelSubscription();
          const endDate = data.cancelAt ? new Date(data.cancelAt).toLocaleDateString() : "";
          alert("Cancellation scheduled. You'll have access until " + endDate + ".");
          if (typeof window.location.reload === "function") window.location.reload();
        } catch (err) {
          console.error("[ReplyMate Upgrade]", err);
          alert(err.message || "Something went wrong. Please try again.");
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  }

  async function runInit() {
    try {
      const session = await waitForAuthReady();
      window.REPLYMATE_AUTH_READY = true;
      window.dispatchEvent(new CustomEvent("replymate-auth-ready", { detail: { user: session?.user || null } }));
    } catch (e) {
      console.warn("[ReplyMate Upgrade] Auth check:", e?.message);
    }
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => runInit());
  } else {
    runInit();
  }
})();
