// ReplyMate background service worker (MV3).
importScripts("../lib/auth-config.js", "../lib/auth-shared.js");

// Shared function to create Stripe checkout session (requires auth)
async function createStripeCheckout(targetPlan) {
  console.log(`[ReplyMate Background] Creating Stripe checkout for ${targetPlan} plan`);

  const token = await ReplyMateAuthShared.getAccessToken();
  if (!token) {
    console.error("[ReplyMate Background] Not logged in - cannot create checkout");
    chrome.tabs.create({ url: "https://replymate.ai/upgrade", active: true });
    return false;
  }

  try {
    const response = await fetch("https://replymate-backend-bot8.onrender.com/billing/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetPlan: targetPlan
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
      url: "https://replymate.ai/upgrade",
      active: true
    });
    return false;
  }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CREATE_STRIPE_CHECKOUT" && message.targetPlan) {
    // Handle Stripe checkout request from popup or Gmail content script
    console.log(`[ReplyMate Background] Received Stripe checkout request for ${message.targetPlan} plan`);
    createStripeCheckout(message.targetPlan);
    sendResponse({ success: true });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ReplyMate] installed");
});

