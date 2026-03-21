// ReplyMate background service worker (MV3).
importScripts("../lib/auth-config.js", "../lib/auth-shared.js");

const BACKEND_URL = "https://replymate-backend-bot8.onrender.com";

// Shared function to create Stripe checkout session for subscription (requires auth)
async function createStripeCheckout(targetPlan, billingType = "annual") {
  console.log(`[ReplyMate Background] Creating Stripe checkout for ${targetPlan} (${billingType})`);

  const token = await ReplyMateAuthShared.getAccessToken();
  if (!token) {
    console.error("[ReplyMate Background] Not logged in - cannot create checkout");
    chrome.tabs.create({ url: (self.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing"), active: true });
    return false;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/billing/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetPlan,
        billingType: billingType === "monthly" ? "monthly" : "annual"
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.checkoutUrl) {
      throw new Error("No checkout URL received from server");
    }
    
    console.log("[ReplyMate Background] Checkout session created, opening URL:", data.checkoutUrl);
    
    // Open checkout in new tab
    chrome.tabs.create({
      url: data.checkoutUrl,
      active: true
    });
    
    return true;
  } catch (error) {
    console.error("[ReplyMate Background] Failed to create checkout session:", error);
    
    // Fallback to original upgrade page
    console.log("[ReplyMate Background] Falling back to original upgrade page");
    chrome.tabs.create({
      url: (self.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing"),
      active: true
    });
    return false;
  }
}

// Create Stripe checkout for top-up pack (one-time payment)
async function createStripeTopupCheckout(pack) {
  console.log(`[ReplyMate Background] Creating Stripe top-up checkout for +${pack} replies`);

  const token = await ReplyMateAuthShared.getAccessToken();
  if (!token) {
    console.error("[ReplyMate Background] Not logged in - cannot create top-up checkout");
    chrome.tabs.create({ url: (self.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing"), active: true });
    return false;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/billing/create-topup-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ pack: String(pack) })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.checkoutUrl) {
      throw new Error("No checkout URL received from server");
    }

    chrome.tabs.create({ url: data.checkoutUrl, active: true });
    return true;
  } catch (error) {
    console.error("[ReplyMate Background] Failed to create top-up checkout:", error);
    chrome.tabs.create({ url: (self.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing"), active: true });
    return false;
  }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_ACCESS_TOKEN") {
    ReplyMateAuthShared.getAccessToken().then((token) => {
      sendResponse({ token: token || null });
    }).catch(() => sendResponse({ token: null }));
    return true; // Keep channel open for async sendResponse
  } else if (message.type === "CREATE_STRIPE_CHECKOUT" && message.targetPlan) {
    // Handle Stripe checkout request from popup or Gmail content script
    const billingType = message.billingType === "monthly" ? "monthly" : "annual";
    console.log(`[ReplyMate Background] Received Stripe checkout request for ${message.targetPlan} (${billingType})`);
    createStripeCheckout(message.targetPlan, billingType);
    sendResponse({ success: true });
  } else if (message.type === "CREATE_STRIPE_TOPUP" && message.pack) {
    // Handle Stripe top-up checkout (100 or 500 replies)
    console.log(`[ReplyMate Background] Received Stripe top-up request for +${message.pack} replies`);
    createStripeTopupCheckout(message.pack);
    sendResponse({ success: true });
  } else if (message.type === "OPEN_POPUP_FOR_LOGIN") {
    // Open popup so user can sign in (called when AI Reply clicked while not logged in)
    chrome.action.openPopup().then(() => sendResponse({ success: true })).catch((err) => {
      console.warn("[ReplyMate] Could not open popup:", err);
      sendResponse({ success: false });
    });
    return true; // Keep channel open for async sendResponse
  } else if (message.type === "OPEN_PRICING_PAGE") {
    chrome.tabs.create({ url: (self.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing"), active: true });
    sendResponse({ success: true });
  } else if (message.type === "REPLYMATE_GET_TAB_ID") {
    const tabId = sender.tab?.id;
    sendResponse({ tabId: typeof tabId === "number" ? tabId : null });
  }
});

/** Drop translate FAB layout for a closed tab (must match `LAYOUT_TAB_KEY_PREFIX` in translation.js). */
const REPLYMATE_LAYOUT_TAB_PREFIX = "replymate_tl_";
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    chrome.storage.local.remove(REPLYMATE_LAYOUT_TAB_PREFIX + tabId, () => {});
  } catch (_) { /* ignore */ }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ReplyMate] installed");
});

