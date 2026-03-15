const TONE_KEY = "replymateTone";
const LENGTH_KEY = "replymateLength";
const USER_NAME_KEY = "replymateUserName";
const LANGUAGE_KEY = "replymateLanguage";
const USAGE_CACHE_KEY = "replymate_usage_cache";
const USAGE_CACHE_TTL = 30000; // 30 seconds

const DEFAULT_TONE = "auto";
const DEFAULT_LENGTH = "auto";
const DEFAULT_LANGUAGE = "english";

// Language translations
const TRANSLATIONS = {
  english: {
    settings: "ReplyMate Settings",
    replyTone: "Reply Tone",
    replyLength: "Reply Length",
    yourName: "Your Name",
    language: "Language",
    save: "Save",
    saved: "Saved!",
    loading: "Loading...",
    usageUnavailable: "Usage unavailable",
    upgradeMore: "Unlock more replies with Pro",
    upgradeUnlimited: "Unlock unlimited replies with Pro+",
    enjoyReplyMate: "Enjoy your ReplyMate!",
    upgradeToPro: "Upgrade to Pro",
    upgradeToProPlus: "Upgrade to Pro+",
    manageSubscription: "Manage subscription",
    planNames: {
      free: "Free Plan",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "replies left",
    cancelSubscription: "Cancel Subscription",
    cancelConfirmMessage: "Are you sure you want to cancel your subscription? You will still be able to use ReplyMate until the end of your current billing period.",
    cancelSuccessMessage: "Subscription cancellation scheduled. You can continue using ReplyMate for {days} more days.",
    cancelError: "Failed to cancel subscription.",
    signInWithGoogle: "Sign in with Google",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signInRequired: "⚠️ Please sign in with Google to use ReplyMate."
  },
  korean: {
    settings: "ReplyMate 설정",
    replyTone: "답장 톤",
    replyLength: "답장 길이",
    yourName: "사용자 이름",
    language: "언어",
    save: "저장",
    saved: "저장됨!",
    loading: "로딩 중...",
    usageUnavailable: "사용량을 사용할 수 없음",
    upgradeMore: "Pro로 더 많은 답장 잠금 해제",
    upgradeUnlimited: "Pro+로 무제한 답장 잠금 해제",
    enjoyReplyMate: "ReplyMate를 마음껏 즐기세요!",
    upgradeToPro: "Pro로 업그레이드",
    upgradeToProPlus: "Pro+로 업그레이드",
    manageSubscription: "구독 관리",
    planNames: {
      free: "무료 플랜",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "답장 남음",
    cancelSubscription: "구독 취소",
    cancelConfirmMessage: "구독을 취소하시겠습니까? 현재 결제 기간이 끝날 때까지 ReplyMate를 계속 사용할 수 있습니다.",
    cancelSuccessMessage: "구독 취소가 예약되었습니다. ReplyMate를 {days}일 더 사용할 수 있습니다.",
    cancelError: "구독 취소에 실패했습니다.",
    signInWithGoogle: "Google로 로그인",
    signedInAs: "로그인됨",
    signOut: "로그아웃",
    signInRequired: "⚠️ ReplyMate를 사용하려면 Google로 로그인해 주세요."
  },
  japanese: {
    settings: "設定",
    replyTone: "返信のトーン",
    replyLength: "返信返信の長さ長さ",
    yourName: "表示名",
    language: "言語",
    save: "保存",
    saved: "保存完了",
    loading: "読み込み中...",
    usageUnavailable: "現在この機能は利用できません",
    upgradeMore: "Proでより多くの返信をアンロック",
    upgradeUnlimited: "Pro+で無制限の返信をアンロック",
    enjoyReplyMate: "ReplyMateをお楽しみください！",
    upgradeToPro: "Proにアップグレード",
    upgradeToProPlus: "Pro+にアップグレード",
    manageSubscription: "サブスクリプション管理",
    planNames: {
      free: "無料プラン",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "残り返信可能数",
    cancelSubscription: "サブスクリプションをキャンセル",
    cancelConfirmMessage: "サブスクリプションをキャンセルしますか？現在の請求期間が終わるまでReplyMateをご利用いただけます。",
    cancelSuccessMessage: "サブスクリプションのキャンセルが予約されました。あと{days}日間ReplyMateをご利用いただけます。",
    cancelError: "キャンセルに失敗しました。",
    signInWithGoogle: "Googleでサインイン",
    signedInAs: "サインイン中",
    signOut: "サインアウト",
    signInRequired: "⚠️ ReplyMateをご利用になるには、Googleでサインインしてください。"
  }
};

// Get translation for current language
function getTranslation(key, language = DEFAULT_LANGUAGE) {
  const lang = TRANSLATIONS[language] || TRANSLATIONS.english;
  return lang[key] || TRANSLATIONS.english[key] || key;
}

// Get access token for API calls (requires login, no anonymous fallback)
async function getAccessToken() {
  if (typeof ReplyMateAuth !== "undefined") {
    return await ReplyMateAuth.getAccessToken();
  }
  if (typeof ReplyMateAuthShared !== "undefined") {
    return await ReplyMateAuthShared.getAccessToken();
  }
  return null;
}

// Get cached usage data if still valid
function getCachedUsage() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([USAGE_CACHE_KEY], (result) => {
        if (result && result[USAGE_CACHE_KEY]) {
          const { data, timestamp } = result[USAGE_CACHE_KEY];
          if (Date.now() - timestamp < USAGE_CACHE_TTL) {
            resolve(data);
            return;
          }
        }
        resolve(null);
      });
    } catch (error) {
      console.warn("[ReplyMate] Failed to get cached usage:", error);
      resolve(null);
    }
  });
}

// Cache usage data with timestamp
function setCachedUsage(usageData) {
  try {
    if (usageData === null || usageData === undefined) {
      chrome.storage.local.remove([USAGE_CACHE_KEY]);
      return;
    }
    const cacheData = {
      data: usageData,
      timestamp: Date.now()
    };
    chrome.storage.local.set({ [USAGE_CACHE_KEY]: cacheData });
  } catch (error) {
    console.warn("[ReplyMate] Failed to cache usage:", error);
  }
}

// Shared function to fetch usage from backend (requires auth)
async function fetchUsageFromBackend() {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch("https://replymate-backend-bot8.onrender.com/usage", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error("Failed to fetch usage");
    }

    const data = await response.json();
    setCachedUsage(data);
    return data;
  } catch (error) {
    console.error("[ReplyMate] Failed to fetch usage:", error);
    return null;
  }
}

// Shared function to get usage (cache first, then backend)
async function getUsageData(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await getCachedUsage();
    if (cached) return cached;
  }
  return await fetchUsageFromBackend();
}

// Update plan and usage display with language support
function updatePlanUsageDisplay(usageData, language = DEFAULT_LANGUAGE) {
  const planUsageEl = document.querySelector(".plan-usage");
  
  if (!planUsageEl) return;

  if (!usageData) {
    planUsageEl.textContent = getTranslation("usageUnavailable", language);
    return;
  }

  const planTranslations = TRANSLATIONS[language]?.planNames || TRANSLATIONS.english.planNames;
  const planName = planTranslations[usageData.plan] || planTranslations.free || "Free Plan";
  const limit = usageData.limit; // Only use backend limit, no fallback
  const remaining = usageData.remaining !== undefined ? usageData.remaining : 0;
  const repliesLeft = getTranslation("repliesLeft", language);

  // If no limit from backend, don't display anything
  if (limit === undefined) {
    planUsageEl.textContent = getTranslation("usageUnavailable", language);
    return;
  }

  planUsageEl.textContent = `${planName} · ${remaining} / ${limit} ${repliesLeft}`;
}

// Update upgrade link based on current plan with language support
function updateUpgradeLink(plan, language = DEFAULT_LANGUAGE, cancelScheduled = false, periodEndDate = null) {
  const upgradeProLink = document.getElementById("upgradeProLink");
  const upgradeProPlusLink = document.getElementById("upgradeProPlusLink");
  const upgradeTitle = document.querySelector(".upgrade-title");
  const upgradeBox = document.querySelector(".upgrade-box");
  const upgradeButtons = document.querySelector(".upgrade-buttons");
  const cancelSection = document.getElementById("cancelSection");
  const cancelLink = document.getElementById("cancelSubscriptionLink");
  
  if (!upgradeProLink || !upgradeProPlusLink || !upgradeTitle || !upgradeBox || !upgradeButtons) return;

  // Show cancel section only for pro / pro_plus (hide Cancel button if cancellation already scheduled)
  if (cancelSection && cancelLink) {
    if (plan === "pro" || plan === "pro_plus") {
      cancelSection.style.display = "block";
      if (cancelScheduled && periodEndDate) {
        const endDate = new Date(periodEndDate);
        const dateStr = endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        cancelLink.textContent = `Cancellation scheduled · active until ${dateStr}`;
        cancelLink.setAttribute("data-cancel-scheduled", "true");
        cancelLink.style.pointerEvents = "none";
        cancelLink.style.opacity = "0.8";
      } else {
        cancelLink.textContent = getTranslation("cancelSubscription", language);
        cancelLink.removeAttribute("data-cancel-scheduled");
        cancelLink.style.pointerEvents = "";
        cancelLink.style.opacity = "";
      }
    } else {
      cancelSection.style.display = "none";
    }
  }

  console.log(`[ReplyMate] Rendering billing UI for plan: ${plan}`);

  if (plan === 'pro_plus') {
    // Pro Plus plan - show enjoy message, hide all upgrade buttons
    upgradeTitle.textContent = getTranslation("enjoyReplyMate", language);
    upgradeButtons.style.display = "none"; // Hide all upgrade buttons
    
    // Pro Plus 버튼과 동일한 배경색과 글자색 적용
    upgradeBox.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFFF99 100%)";
    upgradeBox.style.border = "1px solid #FFFF99";
    upgradeBox.style.color = "#000000";
    upgradeTitle.style.color = "#000000";
    upgradeTitle.style.fontWeight = "600";
    upgradeBox.style.boxShadow = "0 2px 4px rgba(212, 175, 55, 0.3)";
    
    console.log("[ReplyMate] Billing UI rendered: Pro Plus plan (enjoy message)");
  } else if (plan === 'pro') {
    // Pro plan - show current plan + upgrade to Pro Plus only
    upgradeTitle.textContent = `Current Plan: ${getTranslation("planNames", language)?.pro || "Pro Plan"}`;
    upgradeProLink.style.display = "none"; // Hide Pro button
    upgradeProPlusLink.style.display = "block"; // Show Pro Plus button
    upgradeProPlusLink.textContent = getTranslation("upgradeToProPlus", language);
    upgradeButtons.style.display = "flex";
    console.log("[ReplyMate] Billing UI rendered: Pro plan (upgrade to Pro Plus available)");
  } else {
    // Free plan - show both upgrade buttons
    upgradeTitle.textContent = getTranslation("upgradeMore", language);
    upgradeProLink.style.display = "block"; // Show Pro button
    upgradeProPlusLink.style.display = "block"; // Show Pro Plus button
    upgradeProLink.textContent = getTranslation("upgradeToPro", language);
    upgradeProPlusLink.textContent = getTranslation("upgradeToProPlus", language);
    upgradeButtons.style.display = "flex";
    console.log("[ReplyMate] Billing UI rendered: Free plan (upgrades to Pro and Pro Plus available)");
  }
}

// Apply language to all UI elements
function applyLanguageToUI(language = DEFAULT_LANGUAGE, participants = []) {
  // Detect if multiple languages are present in participants
  const hasMultipleLanguages = participants.length > 1 && 
    new Set(participants.map(p => p.language || '')).size > 1;
  
  // Determine best language for UI display
  let uiLanguage = language;
  
  // LANGUAGE AUTO-ADJUSTMENT LOGIC
  // If multiple languages detected, try to find the best language for UI
  if (hasMultipleLanguages) {
    console.log("[ReplyMate] Multiple languages detected:", participants.map(p => p.language));
    
    // Count languages by frequency
    const languageCounts = {};
    participants.forEach(p => {
      if (p.language) {
        languageCounts[p.language] = (languageCounts[p.language] || 0) + 1;
      }
    });
    
    console.log("[ReplyMate] Language frequency counts:", languageCounts);
    
    // Find the most common language
    let mostCommonLanguage = language;
    let maxCount = 0;
    for (const [lang, count] of Object.entries(languageCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonLanguage = lang;
      }
    }
    
    // If we have a clear majority, use that language for UI
    if (maxCount > participants.length / 2) {
      uiLanguage = mostCommonLanguage;
      console.log(`[ReplyMate] Auto-adjusting UI to majority language: ${mostCommonLanguage} (${maxCount}/${participants.length} participants)`);
    } else {
      // No clear majority - default to English for consistency
      uiLanguage = "english";
      console.log("[ReplyMate] No clear language majority, defaulting UI to English for consistency");
    }
  }
  
  // Update labels and static text
  document.querySelector('label[for="toneSelect"]').textContent = getTranslation("replyTone", uiLanguage);
  document.querySelector('label[for="lengthSelect"]').textContent = getTranslation("replyLength", uiLanguage);
  document.querySelector('label[for="userNameInput"]').textContent = getTranslation("yourName", uiLanguage);
  document.querySelector('label[for="languageSelect"]').textContent = getTranslation("language", uiLanguage);
  document.getElementById("saveButton").textContent = getTranslation("save", uiLanguage);
  document.querySelector(".header-title").textContent = getTranslation("settings", uiLanguage);
  
  // Update placeholders
  document.getElementById("userNameInput").placeholder = getTranslation("yourName", uiLanguage);
  
  // Update option labels for tone and length
  const toneOptions = {
    auto: uiLanguage === "korean" ? "자동 (추천)" : uiLanguage === "japanese" ? "自動（推奨）" : "Auto (recommended)",
    professional: uiLanguage === "korean" ? "전문적인" : uiLanguage === "japanese" ? "ビジネス用に" : "Professional",
    polite: uiLanguage === "korean" ? "정중한" : uiLanguage === "japanese" ? "丁寧に" : "Polite", 
    friendly: uiLanguage === "korean" ? "친근한" : uiLanguage === "japanese" ? "カジュアルに" : "Friendly",
    direct: uiLanguage === "korean" ? "직설적인" : uiLanguage === "japanese" ? "簡潔に" : "Direct"
  };
  
  const lengthOptions = {
    auto: uiLanguage === "korean" ? "자동 (추천)" : uiLanguage === "japanese" ? "自動（推奨）" : "Auto (recommended)",
    short: uiLanguage === "korean" ? "짧음" : uiLanguage === "japanese" ? "短め" : "Short",
    medium: uiLanguage === "korean" ? "보통" : uiLanguage === "japanese" ? "普通" : "Medium",
    long: uiLanguage === "korean" ? "김" : uiLanguage === "japanese" ? "長め" : "Long"
  };
  
  // Update language select options with native language names
  const languageSelect = document.getElementById("languageSelect");
  if (languageSelect) {
    languageSelect.innerHTML = "";
    const languageOptions = [
      { value: "english", label: "English" },
      { value: "korean", label: "한국어" },
      { value: "japanese", label: "日本語" }
    ];
    languageOptions.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      languageSelect.appendChild(option);
    });
  }
  
  // Update tone select options
  const toneSelect = document.getElementById("toneSelect");
  if (toneSelect) {
    toneSelect.innerHTML = "";
    Object.entries(toneOptions).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      toneSelect.appendChild(option);
    });
  }
  
  // Update length select options
  const lengthSelect = document.getElementById("lengthSelect");
  if (lengthSelect) {
    lengthSelect.innerHTML = "";
    Object.entries(lengthOptions).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      lengthSelect.appendChild(option);
    });
  }
  
  // Log participant detection results
  if (participants.length > 0) {
    console.log("[ReplyMate] Participants detected:", participants);
    console.log("[ReplyMate] Multiple languages detected:", hasMultipleLanguages);
    console.log("[ReplyMate] UI language set to:", uiLanguage);
  }
}

// Listen for usage updates from Gmail content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "USAGE_UPDATED" && message.data) {
    chrome.storage.local.get([LANGUAGE_KEY], (result) => {
      const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
      updatePlanUsageDisplay(message.data, language);
      updateUpgradeLink(message.data.plan, language, message.data.cancelScheduled, message.data.periodEndDate);
    });
  }
  
  // Handle participant detection for multi-language scenarios
  if (message.type === "PARTICIPANTS_DETECTED" && message.data) {
    chrome.storage.local.get([LANGUAGE_KEY], (result) => {
      const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
      applyLanguageToUI(language, message.data.participants || []);
    });
  }
});

// Sync Supabase config to storage for content script and background
function syncAuthConfigToStorage() {
  if (typeof ReplyMateAuth !== "undefined" && ReplyMateAuth.isConfigured() &&
      typeof window.REPLYMATE_SUPABASE_URL !== "undefined" && window.REPLYMATE_SUPABASE_URL &&
      typeof window.REPLYMATE_SUPABASE_ANON_KEY !== "undefined" && window.REPLYMATE_SUPABASE_ANON_KEY) {
    chrome.storage.local.set({
      replymate_supabase_url: window.REPLYMATE_SUPABASE_URL,
      replymate_supabase_anon_key: window.REPLYMATE_SUPABASE_ANON_KEY,
    });
  }
}

// Update login UI based on auth state
async function updateLoginUI(language = DEFAULT_LANGUAGE) {
  syncAuthConfigToStorage();
  const loginSection = document.getElementById("loginSection");
  const notSignedIn = document.getElementById("loginNotSignedIn");
  const signedIn = document.getElementById("loginSignedIn");
  const signedInEmail = document.getElementById("signedInEmail");
  const signInBtn = document.getElementById("signInButton");
  const signOutBtn = document.getElementById("signOutButton");
  const planUsageEl = document.querySelector(".plan-usage");
  const upgradeBox = document.querySelector(".upgrade-box");
  const cancelSection = document.getElementById("cancelSection");

  if (!loginSection || !notSignedIn || !signedIn) return;

  if (typeof ReplyMateAuth === "undefined" || !ReplyMateAuth.isConfigured()) {
    loginSection.style.display = "none";
    return;
  }
  loginSection.style.display = "block";

  const isSignedIn = await ReplyMateAuth.isSignedIn();
  const email = await ReplyMateAuth.getEmail();

  if (isSignedIn) {
    notSignedIn.style.display = "none";
    signedIn.style.display = "block";
    if (signedInEmail) signedInEmail.textContent = getTranslation("signedInAs", language) + " " + (email || "");
    if (signOutBtn) signOutBtn.textContent = getTranslation("signOut", language);
    if (planUsageEl) planUsageEl.style.display = "";
    if (upgradeBox) upgradeBox.style.display = "";
    if (cancelSection) cancelSection.style.display = "";
  } else {
    notSignedIn.style.display = "block";
    signedIn.style.display = "none";
    if (signInBtn) {
      const textEl = signInBtn.querySelector(".gsi-material-button-contents");
      if (textEl) textEl.textContent = getTranslation("signInWithGoogle", language);
    }
    if (planUsageEl) planUsageEl.style.display = "none";
    if (upgradeBox) upgradeBox.style.display = "none";
    if (cancelSection) cancelSection.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const toneSelect = document.getElementById("toneSelect");
  const lengthSelect = document.getElementById("lengthSelect");
  const userNameInput = document.getElementById("userNameInput");
  const languageSelect = document.getElementById("languageSelect");
  const saveButton = document.getElementById("saveButton");
  const statusMessage = document.getElementById("statusMessage");
  const upgradeProLink = document.getElementById("upgradeProLink");
  const upgradeProPlusLink = document.getElementById("upgradeProPlusLink");

  if (!toneSelect || !lengthSelect || !userNameInput || !languageSelect || !saveButton || !statusMessage) {
    return;
  }

  // Login: Sign in with Google
  const signInButton = document.getElementById("signInButton");
  if (signInButton && typeof ReplyMateAuth !== "undefined") {
    signInButton.addEventListener("click", async () => {
      const textEl = signInButton.querySelector(".gsi-material-button-contents");
      signInButton.disabled = true;
      if (textEl) textEl.textContent = "Signing in...";
      const result = await ReplyMateAuth.signInWithGoogle();
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      if (result.error) {
        signInButton.disabled = false;
        if (textEl) textEl.textContent = getTranslation("signInWithGoogle", language);
        if (result.error !== "Auth cancelled") alert(result.error);
      } else {
        await updateLoginUI(language);
        setCachedUsage(null);
        loadUsageData(language);
        syncAuthConfigToStorage();
      }
    });
  }

  // Login: Sign out
  const signOutButton = document.getElementById("signOutButton");
  if (signOutButton && typeof ReplyMateAuth !== "undefined") {
    signOutButton.addEventListener("click", async () => {
      await ReplyMateAuth.signOut();
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      await updateLoginUI(language);
      setCachedUsage(null);
      loadUsageData(language);
    });
  }

  // Add click handler for Pro upgrade link
  if (upgradeProLink) {
    upgradeProLink.addEventListener("click", async (e) => {
      e.preventDefault();
      
      console.log(`[ReplyMate] Pro upgrade button clicked - Target plan: pro`);
      
      // Use background service worker for Stripe checkout
      chrome.runtime.sendMessage({
        type: "CREATE_STRIPE_CHECKOUT",
        targetPlan: "pro"
      });
    });
  }

  // Add click handler for Pro Plus upgrade link
  if (upgradeProPlusLink) {
    upgradeProPlusLink.addEventListener("click", async (e) => {
      e.preventDefault();
      
      console.log(`[ReplyMate] Pro Plus upgrade button clicked - Target plan: pro_plus`);
      
      // Use background service worker for Stripe checkout
      chrome.runtime.sendMessage({
        type: "CREATE_STRIPE_CHECKOUT",
        targetPlan: "pro_plus"
      });
    });
  }

  // Add click handler for Cancel Subscription link
  const cancelSubscriptionLink = document.getElementById("cancelSubscriptionLink");
  if (cancelSubscriptionLink) {
    cancelSubscriptionLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (cancelSubscriptionLink.getAttribute("data-cancel-scheduled") === "true") return;
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      const token = await getAccessToken();
      if (!token) {
        console.error("[ReplyMate] Cancel failed: no access token (sign in may have expired)");
        alert(getTranslation("signInRequired", language));
        return;
      }
      const confirmMsg = getTranslation("cancelConfirmMessage", language);
      if (!confirm(confirmMsg)) return;
      cancelSubscriptionLink.style.pointerEvents = "none";
      cancelSubscriptionLink.textContent = "Cancelling...";
      try {
        const response = await fetch("https://replymate-backend-bot8.onrender.com/billing/cancel-subscription", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errMsg = data.error || `Request failed (${response.status})`;
          console.error("[ReplyMate] Cancel subscription error:", response.status, errMsg);
          throw new Error(errMsg);
        }
        const days = data.remainingDays ?? 0;
        const successMsg = getTranslation("cancelSuccessMessage", language).replace("{days}", days);
        alert(successMsg);
        setCachedUsage(null);
        await loadUsageData(language, true);
      } catch (err) {
        const msg = err?.message || getTranslation("cancelError", language);
        alert(msg);
        cancelSubscriptionLink.textContent = getTranslation("cancelSubscription", language);
      } finally {
        cancelSubscriptionLink.style.pointerEvents = "";
      }
    });
  }

// Load saved values (tone, length, user name, and language) when the popup opens.
  chrome.storage.local.get([TONE_KEY, LENGTH_KEY, USER_NAME_KEY, LANGUAGE_KEY], async (result) => {
    const tone = result[TONE_KEY] || DEFAULT_TONE;
    const length = result[LENGTH_KEY] || DEFAULT_LENGTH;
    const userName = result[USER_NAME_KEY] || "";
    const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;

    toneSelect.value = tone;
    lengthSelect.value = length;
    userNameInput.value = userName;
    languageSelect.value = language;

    // Update login UI (hides usage/upgrade when not logged in)
    await updateLoginUI(language);
    
    // Apply language to all UI elements
    applyLanguageToUI(language);
    
    // Re-set select values after applying language (since options were recreated)
    toneSelect.value = tone;
    lengthSelect.value = length;
    languageSelect.value = language;
    // Load usage data only when logged in (force refresh on popup open for fresh plan/usage)
    if (typeof ReplyMateAuth !== "undefined" && (await ReplyMateAuth.isSignedIn())) {
      loadUsageData(language, true);
    }
  });

  // Handle language change - don't apply immediately, wait for save
  languageSelect.addEventListener("change", () => {
    // Don't apply language immediately - wait for save button
    // Just update the language selection value
    const selectedLanguage = languageSelect.value;
    console.log("[ReplyMate] Language selected but not applied yet:", selectedLanguage);
  });

  // Save all settings together when the user clicks Save.
  saveButton.addEventListener("click", () => {
    const originalText = saveButton.textContent;
    saveButton.disabled = true;
    
    // Show larger green check mark with popup background
    saveButton.textContent = "✓";
    saveButton.style.background = "var(--bg)"; // Same as popup background
    saveButton.style.color = "#22c55e";      // Green check mark
    saveButton.style.fontSize = "18px";     // Larger check mark
    saveButton.style.fontWeight = "bold";    // Bold check mark

    const tone = toneSelect.value;
    const length = lengthSelect.value;
    const userName = userNameInput.value || "";
    const language = languageSelect.value;

    chrome.storage.local.set(
      {
        [TONE_KEY]: tone,
        [LENGTH_KEY]: length,
        [USER_NAME_KEY]: userName,
        [LANGUAGE_KEY]: language,
      },
      () => {
        // Update usage display with new language
        loadUsageData(language);
        
        // Reset button after 1 second
        setTimeout(() => {
          saveButton.textContent = getTranslation("save", language);
          saveButton.disabled = false;
          saveButton.style.background = ""; // Reset to original background
          saveButton.style.color = ""; // Reset to original color
          saveButton.style.fontSize = ""; // Reset to original font size
          saveButton.style.fontWeight = ""; // Reset to original font weight
          
          // Apply the new language to UI after resetting button
          applyLanguageToUI(language);
          updateLoginUI(language);
          
          // Re-set select values after applying language (since options were recreated)
          toneSelect.value = tone;
          lengthSelect.value = length;
          languageSelect.value = language;
        }, 1000);
      }
    );
  });

// Load usage data and update UI with language
async function loadUsageData(language = DEFAULT_LANGUAGE, forceRefresh = false) {
  const usageData = await getUsageData(forceRefresh);
  
  if (usageData) {
    updatePlanUsageDisplay(usageData, language);
    updateUpgradeLink(usageData.plan, language, usageData.cancelScheduled, usageData.periodEndDate);
  } else {
    updatePlanUsageDisplay(null, language);
    updateUpgradeLink("free", language);
  }
}
});