const TONE_KEY = "replymateTone";
const LENGTH_KEY = "replymateLength";
const USER_NAME_KEY = "replymateUserName";
const LANGUAGE_KEY = "replymateLanguage";
const USAGE_CACHE_KEY = "replymate_usage_cache";
const USAGE_CACHE_TTL = 30000; // 30 seconds

const DEFAULT_TONE = "polite";
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
      pro: "Pro Plan",
      pro_plus: "Pro+ Plan"
    },
    repliesLeft: "replies left"
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
      pro: "Pro 플랜",
      pro_plus: "Pro+ 플랜"
    },
    repliesLeft: "답장 남음"
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
      pro: "Proプラン",
      pro_plus: "Pro+プラン"
    },
    repliesLeft: "残り返信可能数"
  }
};

// Get translation for current language
function getTranslation(key, language = DEFAULT_LANGUAGE) {
  const lang = TRANSLATIONS[language] || TRANSLATIONS.english;
  return lang[key] || TRANSLATIONS.english[key] || key;
}

// Get or create a persistent ReplyMate user ID (reused from gmail.js)
function getReplyMateUserId() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["replymate_user_id"], (result) => {
        if (result.replymate_user_id) {
          resolve(result.replymate_user_id);
        } else {
          const newUserId = crypto.randomUUID();
          chrome.storage.local.set({ replymate_user_id: newUserId }, () => {
            resolve(newUserId);
          });
        }
      });
    } catch (error) {
      // Fallback to a simple ID if crypto.randomUUID() or storage fails
      const fallbackId = crypto.getRandomValues(new Uint32Array(4)).join("-");
      resolve(fallbackId);
    }
  });
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
    const cacheData = {
      data: usageData,
      timestamp: Date.now()
    };
    chrome.storage.local.set({ [USAGE_CACHE_KEY]: cacheData });
  } catch (error) {
    console.warn("[ReplyMate] Failed to cache usage:", error);
  }
}

// Shared function to fetch usage from backend
async function fetchUsageFromBackend() {
  try {
    const userId = await getReplyMateUserId();
    
    const response = await fetch("https://replymate-backend-bot8.onrender.com/usage", {
      method: "GET",
      headers: {
        "X-User-ID": userId
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch usage');
    }

    const data = await response.json();
    
    // Cache the fresh data
    setCachedUsage(data);
    
    return data;
  } catch (error) {
    console.error("[ReplyMate] Failed to fetch usage:", error);
    return null;
  }
}

// Shared function to get usage (cache first, then backend)
async function getUsageData() {
  // Try cache first
  const cached = await getCachedUsage();
  if (cached) {
    return cached;
  }
  
  // Fetch fresh data
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
function updateUpgradeLink(plan, language = DEFAULT_LANGUAGE) {
  const upgradeProLink = document.getElementById("upgradeProLink");
  const upgradeProPlusLink = document.getElementById("upgradeProPlusLink");
  const upgradeTitle = document.querySelector(".upgrade-title");
  const upgradeBox = document.querySelector(".upgrade-box");
  const upgradeButtons = document.querySelector(".upgrade-buttons");
  
  if (!upgradeProLink || !upgradeProPlusLink || !upgradeTitle || !upgradeBox || !upgradeButtons) return;

  console.log(`[ReplyMate] Rendering billing UI for plan: ${plan}`);

  if (plan === 'pro_plus') {
    // Pro Plus plan - show enjoy message, hide all upgrade buttons
    upgradeTitle.textContent = getTranslation("enjoyReplyMate", language);
    upgradeButtons.style.display = "none"; // Hide all upgrade buttons
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
function applyLanguageToUI(language = DEFAULT_LANGUAGE) {
  // Update labels and static text
  document.querySelector('label[for="toneSelect"]').textContent = getTranslation("replyTone", language);
  document.querySelector('label[for="lengthSelect"]').textContent = getTranslation("replyLength", language);
  document.querySelector('label[for="userNameInput"]').textContent = getTranslation("yourName", language);
  document.querySelector('label[for="languageSelect"]').textContent = getTranslation("language", language);
  document.getElementById("saveButton").textContent = getTranslation("save", language);
  document.querySelector(".header-title").textContent = getTranslation("settings", language);
  
  // Update placeholders
  document.getElementById("userNameInput").placeholder = getTranslation("yourName", language);
  
  // Update option labels for tone and length
  const toneOptions = {
    professional: language === "korean" ? "전문적인" : language === "japanese" ? "ビジネス用に" : "Professional",
    polite: language === "korean" ? "정중한" : language === "japanese" ? "丁寧に" : "Polite", 
    friendly: language === "korean" ? "친근한" : language === "japanese" ? "カジュアルに" : "Friendly",
    direct: language === "korean" ? "직설적인" : language === "japanese" ? "簡潔に" : "Direct"
  };
  
  const lengthOptions = {
    short: language === "korean" ? "짧음" : language === "japanese" ? "短め" : "Short",
    medium: language === "korean" ? "보통" : language === "japanese" ? "普通" : "Medium",
    long: language === "korean" ? "김" : language === "japanese" ? "長め" : "Long"
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
}

// Listen for usage updates from Gmail content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "USAGE_UPDATED" && message.data) {
    // Get current language and update popup display
    chrome.storage.local.get([LANGUAGE_KEY], (result) => {
      const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
      updatePlanUsageDisplay(message.data, language);
      updateUpgradeLink(message.data.plan, language);
    });
  }
});

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

// Load saved values (tone, length, user name, and language) when the popup opens.
  chrome.storage.local.get([TONE_KEY, LENGTH_KEY, USER_NAME_KEY, LANGUAGE_KEY], (result) => {
    const tone = result[TONE_KEY] || DEFAULT_TONE;
    const length = result[LENGTH_KEY] || DEFAULT_LENGTH;
    const userName = result[USER_NAME_KEY] || "";
    const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;

    toneSelect.value = tone;
    lengthSelect.value = length;
    userNameInput.value = userName;
    languageSelect.value = language;
    
    // Apply language to all UI elements
    applyLanguageToUI(language);
    
    // Re-set select values after applying language (since options were recreated)
    toneSelect.value = tone;
    lengthSelect.value = length;
    languageSelect.value = language;
    // Load usage data with language
    loadUsageData(language);
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
          
          // Re-set select values after applying language (since options were recreated)
          toneSelect.value = tone;
          lengthSelect.value = length;
          languageSelect.value = language;
        }, 1000);
      }
    );
  });

// Load usage data and update UI with language
async function loadUsageData(language = DEFAULT_LANGUAGE) {
  const usageData = await getUsageData();
  
  if (usageData) {
    updatePlanUsageDisplay(usageData, language);
    updateUpgradeLink(usageData.plan, language);
  } else {
    // Fallback display
    updatePlanUsageDisplay(null, language);
    updateUpgradeLink('free', language);
  }
}
});