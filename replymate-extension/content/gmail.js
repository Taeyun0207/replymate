console.log("ReplyMate Gmail script loaded");

// Email message cleaning function
function cleanEmailMessage(text) {
  if (!text || typeof text !== 'string') return '';
  
  let cleaned = text;
  const originalLength = cleaned.length;
  
  // Remove quoted email headers (From:, Sent:, To:, Subject:, Cc:, Bcc:)
  cleaned = cleaned.replace(/^(From:|Sent:|To:|Subject:|Cc:|Bcc:).*$/gm, '');
  
  // Remove quoted reply lines starting with >
  cleaned = cleaned.replace(/^>.*$/gm, '');
  
  // Remove common Gmail quoted message separators
  cleaned = cleaned.replace(/^--*[\s\S]*?On .*(wrote|writes):$/gm, '');
  
  // Remove signature patterns (common indicators) - be more conservative for short messages
  // Only apply signature removal if message is reasonably long
  if (cleaned.length > 100) {
    cleaned = cleaned.replace(/^--*[\s\S]*$/gm, '');
    cleaned = cleaned.replace(/^Best regards,[\s\S]*$/mi, '');
    cleaned = cleaned.replace(/^Regards,[\s\S]*$/mi, '');
    cleaned = cleaned.replace(/^Sincerely,[\s\S]*$/mi, '');
    cleaned = cleaned.replace(/^Thanks,[\s\S]*$/mi, '');
    cleaned = cleaned.replace(/^Thank you,[\s\S]*$/mi, '');
  }
  
  // Remove common footer patterns
  cleaned = cleaned.replace(/^---*[\s\S]*?---*$/gm, '');
  cleaned = cleaned.replace(/^\[.*\]$/gm, '');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Reduce multiple blank lines to max 2
  cleaned = cleaned.replace(/[ \t]+/g, ' '); // Normalize spaces and tabs
  cleaned = cleaned.replace(/^\s+|\s+$/g, ''); // Trim leading/trailing whitespace
  
  // CRITICAL FIX: If cleaning removed ALL content but original had content, fall back to original
  if (cleaned.length === 0 && originalLength > 0) {
    console.warn("[ReplyMate DEBUG] Cleaning removed all content, using original text:", {
      originalLength,
      originalPreview: text.substring(0, 100) + (text.length > 100 ? "..." : "")
    });
    
    // Apply minimal cleaning only for very short content that was over-cleaned
    let fallbackCleaned = text;
    // Only remove obvious headers/quotes for short messages
    fallbackCleaned = fallbackCleaned.replace(/^(From:|Sent:|To:|Subject:|Cc:|Bcc:).*$/gm, '');
    fallbackCleaned = fallbackCleaned.replace(/^>.*$/gm, '');
    fallbackCleaned = fallbackCleaned.replace(/^\s+|\s+$/g, '');
    
    return fallbackCleaned;
  }
  
  return cleaned.trim();
}

// ReplyMate Configuration
const REPLYMATE_CONFIG = {
  // Backend configuration - can be overridden by environment variables in development
  backend: {
    baseUrl: "https://replymate-backend-bot8.onrender.com",
    endpoints: {
      usage: "/usage",
      generate: "/generate-reply"
    },
    upgradeUrl: "https://replymate.ai/upgrade"
  },
  // UI configuration
  ui: {
    colors: {
      normal: "#7943f1",      // Save 버튼 호버 전 색상
      hover: "#b794f6",       // Save 버튼 호버 색상
      loading: "#9aa0a6",
      error: "#d93025",
      text: "#ffffff"
    },
    timeouts: {
      cache: 30000,        // 30 seconds
      poll: 8000,          // 8 seconds
      replyEditor: 12000,  // 12 seconds
      replyButton: 12000, // 12 seconds
      message: 5000        // 5 seconds
    }
  }
};

// Keys used by the popup UI (chrome.storage.local).
const REPLYMATE_TONE_KEY = "replymateTone";
const REPLYMATE_LENGTH_KEY = "replymateLength";
const REPLYMATE_USER_NAME_KEY = "replymateUserName";
const REPLYMATE_LANGUAGE_KEY = "replymateLanguage";

// Default values if nothing has been saved yet.
const DEFAULT_TONE = "auto";
const DEFAULT_LENGTH = "auto";
const DEFAULT_LANGUAGE = "english";

// Language translations for Gmail UI
const TRANSLATIONS = {
  english: {
    aiReply: "AI Reply",
    aiReplyHover: "AI Reply",
    generating: "Generating...",
    tryAgain: "Try Again",
    limitReached: "Limit reached",
    usageUnavailable: "Usage unavailable",
    monthlyLimitReached: "⚠️You've reached your monthly ReplyMate limit. Upgrade to generate more replies.",
    replyLimitReached: "ReplyMate limit reached. Upgrade to generate more replies.",
    planNames: {
      free: "Free Plan",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "replies left",
    instructionPlaceholder: "Optional instructions (e.g. mention tomorrow)...",
    upgradeToPro: "Upgrade to Pro",
    upgradeToProPlus: "Upgrade to Pro+",
    enjoyReplyMate: "Enjoy ReplyMate!"
  },
  korean: {
    aiReply: "AI Reply",
    aiReplyHover: "AI Reply",
    generating: "생성 중...",
    tryAgain: "다시 시도",
    limitReached: "한도 도달",
    usageUnavailable: "사용량을 사용할 수 없음",
    monthlyLimitReached: "⚠️월간 ReplyMate 한도에 도달했습니다. 더 많은 답장을 생성하려면 업그레이드하세요.",
    replyLimitReached: "ReplyMate 한도에 도달했습니다. 더 많은 답장을 생성하려면 업그레이드하세요.",
    planNames: {
      free: "무료 플랜",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "답장 남음",
    instructionPlaceholder: "선택적 지침 추가 (예: 내일 언급해줘)...",
    upgradeToPro: "Pro로 업그레이드",
    upgradeToProPlus: "Pro+로 업그레이드",
    enjoyReplyMate: "ReplyMate를 즐겨보세요!"
  },
  japanese: {
    aiReply: "AI Reply",
    aiReplyHover: "AI Reply",
    generating: "返信を生成中...",
    tryAgain: "再試行",
    limitReached: "利用上限に達しました",
    usageUnavailable: "現在この機能は利用できません",
    monthlyLimitReached: "⚠️ 今月の返信回数の上限に達しました。続けて利用するには、プランをアップグレードしてください。",
    replyLimitReached: "返信回数の上限に達しました。続けて利用するには、プランをアップグレードしてください。",
    planNames: {
      free: "無料プラン",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "残り返信可能数",
    instructionPlaceholder: "追加の指示（例：明日について言及してください）...",
    upgradeToPro: "Proにアップグレード",
    upgradeToProPlus: "Pro+にアップグレード",
    enjoyReplyMate: "ReplyMateをお楽しみください！"
  }
};

// Get translation for current language
function getTranslation(key, language = DEFAULT_LANGUAGE) {
  const lang = TRANSLATIONS[language] || TRANSLATIONS.english;
  return lang[key] || TRANSLATIONS.english[key] || key;
}

// Get current language from storage
async function getCurrentLanguage() {
  return new Promise((resolve) => {
    try {
      // chrome 객체와 chrome.storage가 존재하는지 먼저 확인
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn("[ReplyMate] Chrome storage API not available, using default language");
        resolve(DEFAULT_LANGUAGE);
        return;
      }
      
      chrome.storage.local.get([REPLYMATE_LANGUAGE_KEY], (result) => {
        // Check for extension context invalidation
        if (chrome.runtime.lastError) {
          console.warn("[ReplyMate] Chrome storage error:", chrome.runtime.lastError.message);
          resolve(DEFAULT_LANGUAGE);
          return;
        }
        resolve(result[REPLYMATE_LANGUAGE_KEY] || DEFAULT_LANGUAGE);
      });
    } catch (error) {
      console.warn("[ReplyMate] Chrome storage not available, using default language:", error);
      resolve(DEFAULT_LANGUAGE);
    }
  });
}

// Load tone/length/name settings saved by the popup.
function loadReplyMateSettings() {
  return new Promise((resolve) => {
    try {
      // chrome 객체와 chrome.storage가 존재하는지 먼저 확인
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn("[ReplyMate] Chrome storage API not available, using default settings");
        resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
        return;
      }
      
      chrome.storage.local.get(
        [REPLYMATE_TONE_KEY, REPLYMATE_LENGTH_KEY, REPLYMATE_USER_NAME_KEY],
        (result) => {
          // Check for extension context invalidation
          if (chrome.runtime.lastError) {
            console.warn("[ReplyMate] Chrome storage error:", chrome.runtime.lastError.message);
            resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
            return;
          }
          
          const tone = result?.[REPLYMATE_TONE_KEY] || DEFAULT_TONE;
          const length = result?.[REPLYMATE_LENGTH_KEY] || DEFAULT_LENGTH;
          const userName = result?.[REPLYMATE_USER_NAME_KEY] || "";
          
          // Debug log for userName
          console.log("[ReplyMate Debug] Loaded settings.userName:", userName);
          console.log("[ReplyMate Debug] Storage result for userName key:", result?.[REPLYMATE_USER_NAME_KEY]);
          
          resolve({ tone, length, userName });
        }
      );
    } catch (error) {
      // If chrome.storage isn't available for any reason, fall back to defaults.
      console.warn("[ReplyMate] Settings load error, using defaults:", error);
      resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
    }
  });
}

// Get or create a persistent ReplyMate user ID
function getReplyMateUserId() {
  return new Promise((resolve) => {
    try {
      // chrome 객체와 chrome.storage가 존재하는지 먼저 확인
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn("[ReplyMate] Chrome storage API not available, using fallback ID");
        const fallbackId = "fallback_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        resolve(fallbackId);
        return;
      }
      
      chrome.storage.local.get(["replymate_user_id"], (result) => {
        // Check for extension context invalidation
        if (chrome.runtime.lastError) {
          console.warn("[ReplyMate] Chrome storage error:", chrome.runtime.lastError.message);
          const fallbackId = "fallback_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
          resolve(fallbackId);
          return;
        }
        
        if (result.replymate_user_id) {
          resolve(result.replymate_user_id);
        } else {
          const newUserId = crypto.randomUUID();
          chrome.storage.local.set({ replymate_user_id: newUserId }, () => {
            if (chrome.runtime.lastError) {
              console.warn("[ReplyMate] Failed to save user ID:", chrome.runtime.lastError.message);
            }
            resolve(newUserId);
          });
        }
      });
    } catch (error) {
      // Fallback to a simple ID if crypto.randomUUID() or storage fails
      console.warn("[ReplyMate] User ID generation error, using fallback:", error);
      const fallbackId = "fallback_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      resolve(fallbackId);
    }
  });
}

// Shared usage cache and sync system
const USAGE_CACHE_KEY = "replymate_usage_cache";
const USAGE_CACHE_TTL = REPLYMATE_CONFIG.ui.timeouts.cache; // Use config timeout

// Get cached usage data if still valid
function getCachedUsage() {
  return new Promise((resolve) => {
    try {
      // chrome 객체와 chrome.storage가 존재하는지 먼저 확인
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn("[ReplyMate] Chrome storage API not available, no cache");
        resolve(null);
        return;
      }
      
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
    // chrome 객체와 chrome.storage가 존재하는지 먼저 확인
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn("[ReplyMate] Chrome storage API not available, skipping cache");
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

// Shared function to fetch usage from backend
async function fetchUsageFromBackend() {
  try {
    const userId = await getReplyMateUserId();
    
    const response = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
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

// Format usage display text with plan name and limit (with language support)
function formatUsageDisplay(plan, remaining, limit, language = DEFAULT_LANGUAGE) {
  const planTranslations = TRANSLATIONS[language]?.planNames || TRANSLATIONS.english.planNames;
  const planName = planTranslations[plan] || planTranslations.free || "Free Plan";
  // Gmail UI에서는 remaining replies 숨기고 플랜 이름만 표시
  return `${planName}`;
}

// Shared function to update all usage displays from backend data (with language support)
async function updateUsageDisplayFromData(usageData) {
  if (!usageData) return;
  
  const language = await getCurrentLanguage();
  const { plan, remaining, limit } = usageData;
  
  console.log(`[ReplyMate] Gmail UI - Updating usage display, current plan: ${plan}, remaining: ${remaining}`);
  
  const formattedText = formatUsageDisplay(plan, remaining, limit, language);
  
  // Update Gmail UI displays
  const usageDisplays = document.querySelectorAll(".replymate-usage-display");
  usageDisplays.forEach(display => {
    display.textContent = formattedText;
  });
  
  // Update all upgrade UI containers based on current plan and remaining replies
  const upgradeContainers = document.querySelectorAll(".replymate-upgrade-container");
  upgradeContainers.forEach(container => {
    if (container) {
      // Clear existing upgrade links
      container.innerHTML = "";

      // 남은 리플라이가 0일 때만 업그레이드 박스 표시
      if (remaining <= 0) {
        // Re-render upgrade UI based on current plan
        if (plan === 'pro_plus') {
          // Pro Plus plan - show enjoy message
          const enjoyText = document.createElement("div");
          enjoyText.style.fontSize = "11px";
          enjoyText.style.color = "#188038";
          enjoyText.style.fontWeight = "600";
          enjoyText.textContent = getTranslation("enjoyReplyMate", language);
          container.appendChild(enjoyText);
          console.log("[ReplyMate] Gmail UI - Billing UI updated: Pro Plus plan (enjoy message)");
        } else if (plan === 'pro') {
          // Pro plan - show upgrade to Pro Plus only
          const proPlusUpgradeLink = createUpgradeLink("pro_plus", language);
          container.appendChild(proPlusUpgradeLink);
          console.log("[ReplyMate] Gmail UI - Billing UI updated: Pro plan (upgrade to Pro Plus available)");
        } else {
          // Free plan - show both Pro and Pro Plus upgrades
          const proUpgradeLink = createUpgradeLink("pro", language);
          const proPlusUpgradeLink = createUpgradeLink("pro_plus", language);
          
          container.appendChild(proUpgradeLink);
          container.appendChild(proPlusUpgradeLink);
          console.log("[ReplyMate] Gmail UI - Billing UI updated: Free plan (upgrades to Pro and Pro Plus available)");
        }
      } else {
        // 남은 리플라이가 있으면 업그레이드 박스 숨기기 (빈 상태로 유지)
        console.log("[ReplyMate] Gmail UI - Upgrade boxes hidden (replies remaining)");
      }
    }
  });
  
  // Notify popup of usage update
  try {
    chrome.runtime.sendMessage({
      type: "USAGE_UPDATED",
      data: usageData
    });
  } catch (error) {
    // Ignore messaging errors
  }
}

// Update usage display with current remaining replies (fetches from backend)
async function updateUsageDisplay(usageDisplay) {
  try {
    const language = await getCurrentLanguage();
    const usageData = await getUsageData();
    
    if (usageData) {
      await updateUsageDisplayFromData(usageData);
    } else {
      // Fallback to empty display
      if (usageDisplay) {
        usageDisplay.textContent = getTranslation("usageUnavailable", language);
      }
    }

  } catch (error) {
    console.error("[ReplyMate] Failed to update usage display:", error);
    const language = await getCurrentLanguage();
    if (usageDisplay) {
      usageDisplay.textContent = getTranslation("usageUnavailable", language);
    }
  }
}

// Call the ReplyMate backend to generate an AI reply.
async function generateAIReply(payload) {
  try {
    const userId = await getReplyMateUserId();
    
    // Log payload shape without sensitive content
    const payloadShape = {
      hasSubject: !!payload.subject,
      subjectLength: payload.subject?.length || 0,
      hasLatestMessage: !!payload.latestMessage,
      latestMessageLength: payload.latestMessage?.length || 0,
      previousMessagesCount: Array.isArray(payload.previousMessages) ? payload.previousMessages.length : 0,
      hasRecipientName: !!payload.recipientName,
      hasUserName: !!payload.userName,
      hasTone: !!payload.tone,
      hasLengthInstruction: !!payload.lengthInstruction,
      hasLanguage: !!payload.language
    };
    console.log("[ReplyMate] Request payload shape:", payloadShape);
    
    // Validate payload before sending
    if (!payload || typeof payload !== 'object') {
      console.error("[ReplyMate] Invalid payload: not an object");
      return "";
    }
    
    if (!payload.latestMessage || typeof payload.latestMessage !== 'string') {
      console.error("[ReplyMate] Invalid payload: missing or invalid latestMessage");
      return "";
    }
    
    const url = `${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.generate}`;
    console.log("[ReplyMate] Calling backend URL:", url);
    
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId
      },
      body: JSON.stringify(payload || {}),
    })
    .then(async (response) => {
      console.log("[ReplyMate] Backend response status:", response.status, response.statusText);
      
      if (!response.ok) {
        let errorData = {};
        let responseText = "";

        try {
          responseText = await response.text();
          console.log("[ReplyMate] Error response body:", responseText);
          
          if (responseText) {
            try {
              errorData = JSON.parse(responseText);
            } catch (parseError) {
              console.warn("[ReplyMate] Failed to parse error JSON, raw text:", responseText);
              errorData = { error: "Invalid JSON response", rawText: responseText };
            }
          }
        } catch (e) {
          console.warn("[ReplyMate] Failed to read error response body:", e);
        }

        console.log("[ReplyMate] Parsed error data:", errorData);

        if (response.status === 403 || errorData.error === "usage_limit_exceeded") {
          console.warn("[ReplyMate] Monthly limit reached");
          
          const language = await getCurrentLanguage();
          showReplyMateMessage(getTranslation("monthlyLimitReached", language));

          // 리밋 도달 시 업그레이드 박스 표시
          const usageData = await getUsageData();
          if (usageData) {
            usageData.remaining = 0; // remaining을 0으로 설정하여 업그레이드 박스 표시
            await updateUsageDisplayFromData(usageData);
          }

          return "";
        }

        console.error("[ReplyMate] Backend error:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        return "";
      }

      const responseText = await response.text();
      console.log("[ReplyMate] Success response body length:", responseText.length);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("[ReplyMate] Failed to parse success response JSON:", parseError);
        console.log("[ReplyMate] Raw response text:", responseText);
        return "";
      }

      if (data && typeof data.reply === "string") {
        console.log("[ReplyMate] Backend reply received successfully");
        return data;
      }

      console.error("[ReplyMate] Unexpected backend response shape:", data);
      return "";
    })
    .catch((error) => {
      console.error("[ReplyMate] Network/fetch error:", {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      return "";
    });
  } catch (error) {
    console.error("[ReplyMate] generateAIReply function error:", error);
    return "";
  }
}

// Show ReplyMate message to user (with language support)
async function showReplyMateMessage(message) {
  const language = await getCurrentLanguage();
  
  // Create a temporary message element
  const messageEl = document.createElement("div");
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    right: 20px;
    bottom: 20px;
    left: auto;
    transform: none;
    background: #f8f9fa;
    color: #333;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #ddd;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: min(380px, calc(100vw - 24px));
    width: max-content;
    box-sizing: border-box;
    word-wrap: break-word;
    white-space: normal;
  `;
  
  // Add dark mode styles
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    messageEl.style.background = '#2d2e30';
    messageEl.style.color = '#e8eaed';
    messageEl.style.borderColor = '#5f6368';
  }
  
  // Append to document.body to avoid Gmail container clipping
  document.body.appendChild(messageEl);
  
  // Remove after 5 seconds
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.parentNode.removeChild(messageEl);
    }
  }, REPLYMATE_CONFIG.ui.timeouts.message); // Use config timeout
}

// Use configuration colors instead of hardcoded values
const REPLYMATE_BUTTON_COLOR_NORMAL = REPLYMATE_CONFIG.ui.colors.normal;
const REPLYMATE_BUTTON_COLOR_HOVER = REPLYMATE_CONFIG.ui.colors.hover;
const REPLYMATE_BUTTON_COLOR_LOADING = REPLYMATE_CONFIG.ui.colors.loading;
const REPLYMATE_BUTTON_COLOR_ERROR = REPLYMATE_CONFIG.ui.colors.error;
const REPLYMATE_BUTTON_TEXT_COLOR = REPLYMATE_CONFIG.ui.colors.text;

// Set button state with language support
async function setReplyMateButtonState(button, state) {
  // state: "idle" | "loading" | "error"
  const language = await getCurrentLanguage();
  button.dataset.replymateState = state;
  console.log("[ReplyMate] setReplyMateButtonState", { state, button });

  if (state === "loading") {
    button.disabled = true;
    button.style.cursor = "default";
    button.textContent = getTranslation("generating", language);
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_LOADING;
  } else if (state === "error") {
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = getTranslation("tryAgain", language);
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_ERROR;
  } else {
    // idle
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = getTranslation("aiReply", language);
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
  }
}

function attachReplyMateButtonHoverStyles(button) {
  button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;

  button.addEventListener("mouseenter", () => {
    const state = button.dataset.replymateState || "idle";
    if (state === "idle") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_HOVER;
    }
  });

  button.addEventListener("mouseleave", () => {
    const state = button.dataset.replymateState || "idle";
    if (state === "idle") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
    } else if (state === "loading") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_LOADING;
    } else if (state === "error") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_ERROR;
    }
  });
}

// Auto mode instructions for different languages
const autoInstructions = {
  english: "Auto-length mode: Determine reply length based on message context. Follow these rules:\n\nShort: 1–2 sentences (max ~25 words)\nMedium: 2–4 sentences (25–70 words)\nLong: 4–8 sentences (70–150 words)\n\nAuto-length determination:\n1. Acknowledgement messages (thanks, ok, yes, 알겠습니다, はい) → Short\n2. Message length: <20 chars → Short, 20-120 chars → Medium, >120 chars → Long\n3. Multiple questions (2+ ?) → Long\n4. Request words (please, could you, can you, would you, let me know, send, confirm) → at least Medium",
  korean: "자동 길이 모드: 메시지 컨텍스트에 따라 답장 길이를 결정하세요. 다음 규칙을 따르세요:\n\nShort: 1–2문장 (최대 ~25단어)\nMedium: 2–4문장 (25-70단어)\nLong: 4–8문장 (70-150단어)\n\n자동 길이 결정:\n1. 확인 메시지 (감사, ok, 예, 알겠습니다, はい) → Short\n2. 메시지 길이: <20자 → Short, 20-120자 → Medium, >120자 → Long\n3. 여러 질문 (2+ ?) → Long\n4. 요청 단어 (제발, 할 수 있나요, 보내, 확인) → 최소 Medium",
  japanese: "自動長モード：メッセージコンテキストに基づいて返信長を決定してください。以下のルールに従ってください：\n\nShort：1〜2文（最大〜25単語）\nMedium：2〜4文（25-70単語）\nLong：4〜8文（70-150単語）\n\n自動長決定：\n1. 確認メッセージ（ありがとう、OK、はい、알겠습니다、はい）→ Short\n2. メッセージ長：<20文字 → Short、20-120文字 → Medium、>120文字 → Long\n3. 複数の質問（2+ ?）→ Long\n4. 要求単語（お願い、できますか、送信、確認）→ 最低Medium"
};

// Convert UI language to OpenAI language code
function mapLanguageToOpenAI(language) {
  const languageMapping = {
    'english': 'en',
    'korean': 'ko', 
    'japanese': 'ja'
  };
  return languageMapping[language] || 'en';
}

function buildLengthInstruction(length, language = DEFAULT_LANGUAGE) {
  const l = (length || DEFAULT_LENGTH).toLowerCase();
  
  // Convert UI language to OpenAI language code
  const openAILanguage = mapLanguageToOpenAI(language);

  // Language-specific base instructions
  const languageInstructions = {
    en: "Write reply in English.",
    ko: "Write reply in Korean (한국어).",
    ja: "Write reply in Japanese (日本語)."
  };
  
  const languageInstruction = languageInstructions[openAILanguage] || languageInstructions.en;

  // Auto mode - let backend determine length
  if (l === "auto") {
    return `${languageInstruction} ${autoInstructions[(language || 'english')] || autoInstructions.english}`;
  }

  if (l === "short") {
    const shortInstructions = {
      english: "Strict Short mode: Write exactly 1–2 sentences (maximum ~25 words). Be concise and direct with minimal padding. Do not add extra small talk beyond what feels natural for this email.",
      korean: "엄격한 Short 모드: 정확히 1-2문장 (최대 ~25단어)으로 작성하세요. 간결하고 직접적으로, 최소한의 말로 작성하고, 이 이메일에 자연스럽게 느껴지는 것 이상의 잡담은 추가하지 마세요.",
      japanese: "厳格なShortモード：正確に1〜2文（最大〜25単語）で書いてください。簡潔で直接的に、最小限の言葉で、このメールに自然に感じられる以上の世間話を追加しないでください。"
    };
    return `${languageInstruction} ${shortInstructions[(language || 'english')] || shortInstructions.english}`;
  }

  if (l === "long") {
    const longInstructions = {
      english: "Strict Long mode: Write exactly 4–8 sentences (70–150 words). Expand with appreciation, context, clarifications, and a polished closing. Keep it natural and avoid unnecessary fluff if the email itself is very short.",
      korean: "엄격한 Long 모드: 정확히 4-8문장 (70-150단어)으로 작성하세요. 더 많은 감사 표현, 맥락, 명확화, 그리고 세련된 마무리로 확장하세요. 자연스럽게 유지하고 이메일 자체가 매우 짧을 경우 불필요한 미사여구를 피하세요.",
      japanese: "厳格なLongモード：正確に4〜8文（70-150単語）で書いてください。より多くの感謝、文脈、明確化、そして洗練された結びで拡張してください。自然に保ち、メール自体が非常に短い場合は不要な飾り言葉を避けてください。"
    };
    return `${languageInstruction} ${longInstructions[(language || 'english')] || longInstructions.english}`;
  }

  // medium / default
  const mediumInstructions = {
    english: "Strict Medium mode: Write exactly 2–4 sentences (25–70 words). Aim for balanced detail and politeness without sounding verbose, adapting the length to what feels appropriate for this email.",
    korean: "엄격한 Medium 모드: 정확히 2-4문장 (25-70단어)으로 작성하세요. 이 이메일에 적합하다고 느껴지는 길이에 맞춰 상세함과 예의를 조절하며, 장황하게 들리지 않도록 하세요.",
    japanese: "厳格なMediumモード：正確に2〜4文（25-70単語）で書いてください。このメールに適切だと感じられる長さに合わせて、適度な詳細と丁寧さを目指し、冗長に聞こえないようにしてください。"
  };
  return `${languageInstruction} ${mediumInstructions[(language || 'english')] || mediumInstructions.english}`;
}

// Finds the reply editor associated with a clicked ReplyMate button.
function findEditorForButton(button) {
  // Add null guard to prevent TypeError
  if (!button || !(button instanceof HTMLElement)) {
    console.log("[ReplyMate DEBUG] findEditorForButton: button is null or not HTMLElement");
    return null;
  }

  // Reply editors typically live inside the opened conversation thread area.
  // We first try to stay within the same conversation / reply container as the button.
  const replyContainer =
    button.closest("div[aria-label='Message Body']") ||
    button.closest("div[role='region']") ||
    button.closest("div[role='dialog']") ||
    button.parentElement;

  if (!replyContainer) {
    console.log("[ReplyMate DEBUG] findEditorForButton: no reply container found");
    return null;
  }

  const editor = replyContainer.querySelector(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );
  
  console.log("[ReplyMate DEBUG] findEditorForButton: editor found in container:", editor);
  return editor;
}

// Heuristic: determine whether a given editor looks like a REPLY editor
// (in an opened email thread) rather than a standalone "New message" compose window.
function isReplyEditor(editor) {
  const dialog = editor.closest("div[role='dialog']");

  if (dialog) {
    // For this project, we want to focus on reply areas inside opened threads,
    // and avoid standalone compose dialogs as much as possible.
    return false;
  }

  // Inline reply areas often live directly inside the conversation region.
  const conversationRegion = editor.closest("div[role='region']");
  if (conversationRegion) {
    return true;
  }

  // Fallback: treat as non-reply to avoid over-injecting.
  return false;
}

// Create ReplyMate button with language support
async function createReplyMateButton() {
  const language = await getCurrentLanguage();
  
  // Create a container for both button and input
  const container = document.createElement("div");
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.gap = "8px";
  container.style.pointerEvents = "auto";
  container.style.position = "relative";
  container.style.zIndex = "1";
  
  const button = document.createElement("button");
  button.className = "replymate-generate-button";

  button.style.padding = "6px 10px";
  button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
  button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "12px";

  // Create the additional instruction input with translated placeholder
  const instructionInput = document.createElement("input");
  instructionInput.type = "text";
  instructionInput.placeholder = getTranslation("instructionPlaceholder", language);
  instructionInput.className = "replymate-instruction-input";
  instructionInput.style.padding = "4px 8px";
  instructionInput.style.border = "1px solid #ccc";
  instructionInput.style.borderRadius = "4px";
  instructionInput.style.fontSize = "12px";
  instructionInput.style.width = "350px";
  instructionInput.style.minWidth = "150px";
  instructionInput.style.maxWidth = "300px";
  instructionInput.style.pointerEvents = "auto";
  instructionInput.style.userSelect = "auto";
  instructionInput.style.webkitUserSelect = "auto";
  instructionInput.style.outline = "none";
  instructionInput.style.backgroundColor = "#fff";
  instructionInput.style.color = "#000";

  // Prevent event bubbling but allow normal text selection
  instructionInput.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    instructionInput.focus();
  });
  
  instructionInput.addEventListener("click", (e) => {
    e.stopPropagation();
    instructionInput.focus();
  });
  
  instructionInput.addEventListener("focus", (e) => {
    e.stopPropagation();
  });

  attachReplyMateButtonHoverStyles(button);
  await setReplyMateButtonState(button, "idle");

  // When clicked, call backend and insert generated reply into the correct editor.
  button.addEventListener("click", async (event) => {
    console.log("[ReplyMate DEBUG] AI Reply button clicked");
    
    // Duplicate click prevention: ignore if already loading.
    if (button.dataset.replymateState === "loading") {
      console.log("[ReplyMate DEBUG] Compose button click ignored (already loading)");
      return;
    }

    console.log("[ReplyMate DEBUG] Setting button state to loading");
    await setReplyMateButtonState(button, "loading");

    console.log("[ReplyMate DEBUG] Finding editor for button:", button);
    const editor = findEditorForButton(button);
    console.log("[ReplyMate DEBUG] Editor found:", editor);
    if (!editor) {
      console.log("[ReplyMate DEBUG] No editor found, returning to idle state");
      await setReplyMateButtonState(button, "idle");
      return;
    }

    console.log("[ReplyMate DEBUG] Loading settings and extracting context");
    const settings = await loadReplyMateSettings();
    const threadContext = extractThreadContext();
    const language = await getCurrentLanguage();

    // Validate thread context before proceeding
    if (!threadContext.latestMessage || threadContext.latestMessage.length === 0) {
      console.error("[ReplyMate ERROR] Cannot proceed - no latest message extracted");
      console.error("[ReplyMate ERROR] Thread context details:", {
        hasSubject: !!threadContext.subject,
        subjectLength: threadContext.subject?.length || 0,
        latestMessageLength: threadContext.latestMessage?.length || 0,
        previousMessagesCount: threadContext.previousMessages?.length || 0,
        recipientName: threadContext.recipientName || "NONE"
      });
      
      await setReplyMateButtonState(button, "error");
      showReplyMateMessage("Unable to extract email content. Please try refreshing the page.");
      setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
      return;
    }

    const payload = {
      subject: threadContext.subject || "",
      latestMessage: threadContext.latestMessage || "",
      previousMessages: threadContext.previousMessages || [],
      recipientName: threadContext.recipientName || "",
      userName: settings.userName || threadContext.inferredUserName || "",
      tone: settings.tone || DEFAULT_TONE,
      length: settings.length || DEFAULT_LENGTH,
      lengthInstruction: buildLengthInstruction(settings.length || DEFAULT_LENGTH, language),
      additionalInstruction: instructionInput.value || "",
      language: language,
    };

    console.log("[ReplyMate Debug] userName sent to backend:", payload.userName);
    console.log("[ReplyMate Debug] settings.userName:", settings.userName);
    console.log("[ReplyMate Debug] threadContext.inferredUserName:", threadContext.inferredUserName);

    console.log("[ReplyMate DEBUG] Sending API request with payload:", payload);
    const replyData = await generateAIReply(payload);
    console.log("[ReplyMate DEBUG] API response received:", replyData);
    
    if (!replyData) {
      console.log("[ReplyMate DEBUG] No reply data received, showing error");
      await setReplyMateButtonState(button, "error");
      setTimeout(async () => await setReplyMateButtonState(button, "idle"), 2000);
      return;
    }

    console.log("[ReplyMate DEBUG] Reply text to insert:", replyData.reply);
    console.log("[ReplyMate DEBUG] Target editor element:", editor);
    console.log("[ReplyMate DEBUG] Editor is contenteditable:", editor.contentEditable);
    console.log("[ReplyMate DEBUG] Editor current content:", editor.innerHTML);
    
    try {
      await insertReplyIntoEditor(editor, replyData.reply);
      console.log("[ReplyMate DEBUG] Reply inserted successfully");
    } catch (error) {
      console.error("[ReplyMate DEBUG] Error inserting reply:", error);
    }
    
    await setReplyMateButtonState(button, "idle");
    
    // Update usage display if usage info is available
    if (replyData && replyData.usage) {
      updateUsageDisplayFromData(replyData.usage);
    } else {
      updateUsageDisplay(container.querySelector(".replymate-usage-display"));
    }
    
    console.log("[ReplyMate DEBUG] Button click flow completed");
  });

  // Add both elements to container
  container.appendChild(button);
  container.appendChild(instructionInput);
  
  // Add usage display element
  const usageDisplay = document.createElement("div");
  usageDisplay.className = "replymate-usage-display";
  usageDisplay.style.fontSize = "11px";
  usageDisplay.style.color = "#666";
  usageDisplay.style.marginTop = "4px";
  
  // Fetch and display current usage immediately
  (async () => {
    try {
      const usageData = await getUsageData();
      if (usageData) {
        const formattedText = formatUsageDisplay(
          usageData.plan || 'free',
          usageData.remaining !== undefined ? usageData.remaining : 0,
          usageData.limit || 0,
          language
        );
        usageDisplay.textContent = formattedText;
      } else {
        usageDisplay.textContent = getTranslation("usageUnavailable", language);
      }
    } catch (error) {
      console.error("[ReplyMate] Failed to fetch initial usage:", error);
      usageDisplay.textContent = getTranslation("usageUnavailable", language);
    }
  })();
  
  container.appendChild(usageDisplay);
  
  // Add upgrade links with plan-based UI
  const upgradeContainer = document.createElement("div");
  upgradeContainer.className = "replymate-upgrade-container";
  upgradeContainer.style.marginTop = "6px";
  upgradeContainer.style.display = "flex";
  upgradeContainer.style.gap = "8px";
  upgradeContainer.style.alignItems = "center";
  
  // Get current usage data to determine which upgrade options to show
  (async () => {
    try {
      const usageData = await getUsageData();
      const currentPlan = usageData?.plan || 'free';
      const remaining = usageData?.remaining || 0;
      const language = await getCurrentLanguage();
      
      console.log(`[ReplyMate] Gmail UI - Current plan from /usage: ${currentPlan}, remaining: ${remaining}`);
      console.log(`[ReplyMate] Gmail UI - Rendering billing UI for plan: ${currentPlan}`);
      
      // 남은 리플라이가 0일 때만 업그레이드 박스 표시
      if (remaining <= 0) {
        if (currentPlan === 'pro_plus') {
          // Pro Plus plan - show current plan only
          const currentPlanText = document.createElement("div");
          currentPlanText.style.fontSize = "11px";
          currentPlanText.style.color = "#188038";
          currentPlanText.style.fontWeight = "600";
          currentPlanText.textContent = `Current Plan: ${(TRANSLATIONS[language]?.planNames || TRANSLATIONS.english.planNames).pro_plus || "Pro+ Plan"}`;
          upgradeContainer.appendChild(currentPlanText);
          console.log("[ReplyMate] Gmail UI - Billing UI rendered: Pro Plus plan (no upgrades)");
        } else {
          // Free or Pro plan - show upgrade options horizontally
          if (currentPlan === 'free') {
            // Free plan - show both Pro and Pro Plus upgrades side by side
            const proUpgradeLink = createUpgradeLink("pro", language);
            const proPlusUpgradeLink = createUpgradeLink("pro_plus", language);
            
            upgradeContainer.appendChild(proUpgradeLink);
            upgradeContainer.appendChild(proPlusUpgradeLink);
            console.log("[ReplyMate] Gmail UI - Billing UI rendered: Free plan (upgrades to Pro and Pro Plus available)");
          } else if (currentPlan === 'pro') {
            // Pro plan - show upgrade to Pro Plus only (centered)
            const proPlusUpgradeLink = createUpgradeLink("pro_plus", language);
            upgradeContainer.appendChild(proPlusUpgradeLink);
            console.log("[ReplyMate] Gmail UI - Billing UI rendered: Pro plan (upgrade to Pro Plus available)");
          }
        }
      } else {
        // 남은 리플라이가 있으면 업그레이드 박스 숨기기 (빈 상태로 유지)
        console.log("[ReplyMate] Gmail UI - Upgrade boxes hidden in initial render (replies remaining)");
      }
    } catch (error) {
      console.error("[ReplyMate] Failed to load usage for upgrade UI:", error);
      // 남은 리플라이가 0일 때만 폴백 업그레이드 링크 표시
      try {
        const usageData = await getUsageData();
        const remaining = usageData?.remaining || 0;
        if (remaining <= 0) {
          const fallbackLink = createUpgradeLink("pro", await getCurrentLanguage());
          upgradeContainer.appendChild(fallbackLink);
        }
      } catch {
        // 에러 발생 시에도 업그레이드 박스 숨기기
        console.log("[ReplyMate] Gmail UI - Upgrade boxes hidden due to error");
      }
    }
  })();
  
  container.appendChild(upgradeContainer);
  
  return container;
}

// Helper function to create upgrade link
function createUpgradeLink(targetPlan, language) {
  const upgradeLink = document.createElement("a");
  upgradeLink.className = "replymate-upgrade-link";
  upgradeLink.href = "#";
  
  // Check if Gmail is in dark mode
  const isDarkMode = document.documentElement.classList.contains('dark') || 
                     document.body.classList.contains('dark') ||
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Set text based on target plan
  if (targetPlan === 'pro') {
    upgradeLink.textContent = getTranslation("upgradeToPro", language);
    upgradeLink.style.fontSize = "10px";
    upgradeLink.style.textDecoration = "none";
    upgradeLink.style.display = "inline-block";
    upgradeLink.style.padding = "3px 6px";
    upgradeLink.style.border = "1px solid #EFE8FF";
    upgradeLink.style.borderRadius = "3px";
    upgradeLink.style.backgroundColor = "#EFE8FF";
    upgradeLink.style.color = "#000000";
    upgradeLink.style.textAlign = "center";
    upgradeLink.style.fontWeight = "500";
    upgradeLink.style.transition = "all 0.2s ease";
    upgradeLink.style.whiteSpace = "nowrap";
    upgradeLink.style.lineHeight = "1.2";
    
    // Add hover effect for Pro button
    upgradeLink.addEventListener("mouseenter", () => {
      upgradeLink.style.backgroundColor = "#D6C5F0";
      upgradeLink.style.textDecoration = "none";
      upgradeLink.style.borderColor = "#D6C5F0";
    });
    
    upgradeLink.addEventListener("mouseleave", () => {
      upgradeLink.style.backgroundColor = "#EFE8FF";
      upgradeLink.style.textDecoration = "none";
      upgradeLink.style.borderColor = "#EFE8FF";
    });
  } else if (targetPlan === 'pro_plus') {
    upgradeLink.textContent = getTranslation("upgradeToProPlus", language);
    upgradeLink.style.fontSize = "10px";
    upgradeLink.style.textDecoration = "none";
    upgradeLink.style.display = "inline-block";
    upgradeLink.style.padding = "3px 6px";
    upgradeLink.style.border = "1px solid #FFFF99";
    upgradeLink.style.borderRadius = "3px";
    upgradeLink.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFFF99 100%)";
    upgradeLink.style.color = "#2C1810";
    upgradeLink.style.textAlign = "center";
    upgradeLink.style.fontWeight = "600";
    upgradeLink.style.boxShadow = "0 2px 4px rgba(212, 175, 55, 0.3)";
    upgradeLink.style.transition = "all 0.2s ease";
    upgradeLink.style.whiteSpace = "nowrap";
    upgradeLink.style.lineHeight = "1.2";
    
    // Add hover effect for Pro Plus button (lighter)
    upgradeLink.addEventListener("mouseenter", () => {
      upgradeLink.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFED4E 100%)";
      upgradeLink.style.textDecoration = "none";
      upgradeLink.style.boxShadow = "0 4px 8px rgba(212, 175, 55, 0.4)";
      upgradeLink.style.transform = "translateY(-1px)";
    });
    
    upgradeLink.addEventListener("mouseleave", () => {
      upgradeLink.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFFF99 100%)";
      upgradeLink.style.textDecoration = "none";
      upgradeLink.style.boxShadow = "0 2px 4px rgba(212, 175, 55, 0.3)";
      upgradeLink.style.transform = "translateY(0px)";
    });
  }
  
  upgradeLink.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log(`[ReplyMate] Gmail UI - Target plan passed to Stripe checkout: ${targetPlan}`);
    
    // Use background service worker for Stripe checkout
    try {
      chrome.runtime.sendMessage({
        type: "CREATE_STRIPE_CHECKOUT",
        targetPlan: targetPlan
      });
    } catch (error) {
      console.error("[ReplyMate] Failed to trigger Stripe checkout:", error);
      // Fallback to original upgrade page
      window.open(REPLYMATE_CONFIG.backend.upgradeUrl, "_blank");
    }
  });
  
  return upgradeLink;
}

// Insert the provided reply text into a Gmail rich-text editor (contenteditable).
async function insertReplyIntoEditor(editor, replyText) {
  if (!(editor instanceof HTMLElement)) return;

  let safeText = typeof replyText === "string" ? replyText : "";
  
  // Get current settings to replace [Your Name] placeholder
  try {
    const settings = await loadReplyMateSettings();
    const userName = settings.userName || "";
    
    // Replace [Your Name] placeholder with actual userName in all languages
    if (userName && userName.trim()) {
      // Replace various forms of [Your Name] placeholder
      const placeholderPatterns = [
        /\[Your Name\]/g,
        /\[Your name\]/g,
        /\[your name\]/g,
        /\[YOUR NAME\]/g
      ];
      
      placeholderPatterns.forEach(pattern => {
        safeText = safeText.replace(pattern, userName);
      });
      
      console.log("[ReplyMate Debug] Final reply after placeholder replacement:", safeText);
      console.log("[ReplyMate Debug] userName used for replacement:", userName);
    } else {
      console.log("[ReplyMate Debug] No userName available, keeping original text");
    }
  } catch (error) {
    console.warn("[ReplyMate Debug] Error getting userName for replacement:", error);
  }

  // Convert text into HTML with <br> to preserve line breaks.
  const html = safeText
    .split("\n")
    .map((line) => {
      if (line === "") return "<br>";
      return line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    })
    .join("<br>");

  editor.focus();
  editor.innerHTML = html;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// Extract sender name from email container
function extractSenderName(container) {
  if (!container || !(container instanceof HTMLElement)) return "";
  
  // Try to find sender name in various Gmail selectors
  const selectors = [
    "span[email]",  // Gmail email spans
    "span[role='link'][tabindex='-1']",  // Gmail name links
    "span[data-hovercard-id]",  // Gmail hovercard spans
    "div[role='gridcell'] span",  // Gmail grid cells with names
    "td span",  // Gmail table cells with names
    "div span"  // Generic fallback
  ];
  
  for (const selector of selectors) {
    const elements = container.querySelectorAll(selector);
    for (const element of elements) {
      if (element && element.textContent) {
        const text = element.textContent.trim();
        // Skip if it looks like an email address or common UI text
        if (text && 
            text.length > 1 && 
            text.length < 50 && 
            !text.includes('@') &&
            !text.toLowerCase().includes('reply') &&
            !text.toLowerCase().includes('forward') &&
            !text.toLowerCase().includes('me') &&
            !text.match(/^\d+$/)) {
          return text;
        }
      }
    }
  }
  
  return "";
}

// Extract participants and detect languages from message content
function extractParticipants(messages) {
  const participants = [];
  const languages = new Set();
  
  for (const message of messages) {
    if (message.text && message.senderName) {
      participants.push({
        name: message.senderName,
        language: detectLanguage(message.text)
      });
      languages.add(detectLanguage(message.text));
    }
  }
  
  return Array.from(participants);
}

// Detect language from text content
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'english';
  
  const lowerText = text.toLowerCase();
  
  // Korean detection
  if (/[가-힣ㅋㅌㅎㅏ-ㅑㅒㅓㅔㅕㅟㅠㅢㅣㅡㅢㅥㅤㅦㅨㅧㅮㅯㅰㅱㅲㅴㅶㅷㅇㅈㅏㅑㅓㅒㅔㅕㅟㅠㅢㅣㅡㅢㅥㅤㅦㅨㅧㅮㅯㅰㅱㅲㅴㅶㅷㅇ]/.test(text)) {
    return 'korean';
  }
  
  // Japanese detection - comprehensive patterns
  if (
    // Hiragana detection
    /[ひらがな]/.test(text) ||
    // Katakana detection  
    /[ァ-ヶ]/.test(text) ||
    // Common Japanese sentence endings
    /[です-ます]/.test(text) ||
    /[ます]/.test(text) ||
    /[だ]/.test(text) ||
    // Particles and common words
    /[の]/.test(text) ||
    /[に]/.test(text) ||
    /[と]/.test(text) ||
    /[で]/.test(text) ||
    /[から]/.test(text) ||
    // Common Japanese phrases
    /[こんにちは]/.test(text) ||
    /[ありがとう]/.test(text) ||
    /[お願い]/.test(text) ||
    // Japanese-specific punctuation and characters
    /[？]/.test(text) ||
    /[！]/.test(text) ||
    /[。]/.test(text) ||
    // Japanese Unicode range (basic coverage)
    /[\u3040-\u309F\u30A0-\u30FF]/.test(text)
  ) {
    return 'japanese';
  }
  
  // Chinese detection (basic patterns)
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'chinese';
  }
  
  // Default to English
  return 'english';
}

// Extract information about the currently opened Gmail thread (subject, messages, names).
// This is a best-effort DOM scrape and falls back safely if elements are not found.
function extractThreadContext() {
  try {
    const main = document.querySelector("div[role='main']") || document.body;

    // Subject: Gmail usually renders it with class "hP" inside the thread header.
    let subject = "";
    let subjectEl =
      main.querySelector("h2.hP") ||
      main.querySelector("h1.hP") ||
      main.querySelector("h2[role='heading']") ||
      main.querySelector("h1[role='heading']");

    if (subjectEl && subjectEl.textContent) {
      subject = subjectEl.textContent.trim();
    }

    // Collect visible message containers in the thread.
    const rawContainers = Array.from(
      main.querySelectorAll("div[data-message-id], div[role='listitem'], div[role='article']")
    );

    console.log(`[ReplyMate DEBUG] Found ${rawContainers.length} raw message containers`);

    const visibleMessages = [];

    for (const container of rawContainers) {
      if (!(container instanceof HTMLElement)) continue;
      if (container.offsetParent === null) continue;

      // Approximate message body: Gmail often uses div[dir="ltr"] for content.
      const bodyEl = container.querySelector("div[dir='ltr']") || container;
      const rawText = (bodyEl.innerText || bodyEl.textContent || "").trim();

      if (!rawText) {
        console.log("[ReplyMate DEBUG] Skipping container with no text content");
        continue;
      }

      // Clean message text
      const cleanedText = cleanEmailMessage(rawText);
      const cleaned = cleanedText; // Fix: Use the cleanedText variable
      
      // DIAGNOSTIC: Log cleaning results
      if (cleaned.length === 0 && rawText.length > 0) {
        console.warn("[ReplyMate DEBUG] Cleaning removed all content from message:", {
          rawLength: rawText.length,
          rawPreview: rawText.substring(0, 100) + (rawText.length > 100 ? "..." : ""),
          cleanedLength: cleaned.length
        });
      }
      
      if (!cleaned) {
        console.log("[ReplyMate DEBUG] Skipping container due to empty cleaned text");
        continue;
      }

      // Extract sender name
      const senderName = extractSenderName(container);

      visibleMessages.push({
        container,
        text: cleanedText,
        senderName
      });
    }

    console.log(`[ReplyMate DEBUG] Processed ${visibleMessages.length} visible messages`);

    let latestMessage = "";
    let previousMessages = [];
    let recipientName = "";
    let inferredUserName = "";

    if (visibleMessages.length > 0) {
      const latest = visibleMessages[visibleMessages.length - 1];
      
      // DIAGNOSTIC: Log latest message selection details
      console.log("[ReplyMate DEBUG] Latest message selection:", {
        totalMessages: visibleMessages.length,
        latestIndex: visibleMessages.length - 1,
        latestTextLength: latest.text ? latest.text.length : 0,
        latestTextPreview: latest.text ? latest.text.substring(0, 100) + (latest.text.length > 100 ? "..." : "") : "EMPTY",
        hasSenderName: !!latest.senderName,
        senderName: latest.senderName || "NONE",
        // Test cases for short message validation
        isShortMessage: latest.text ? latest.text.length <= 20 : false,
        containsThanks: latest.text ? latest.text.toLowerCase().includes('thanks') : false,
        containsOkay: latest.text ? latest.text.toLowerCase().includes('okay') : false,
        containsYes: latest.text ? latest.text.toLowerCase().includes('yes') : false,
        containsKorean: latest.text ? /[가-다]/.test(latest.text) : false,
        containsJapanese: latest.text ? /[はい]/.test(latest.text) : false
      });
      
      latestMessage = latest.text;

      // Up to 8 previous messages, in chronological order.
      const prev = visibleMessages
        .slice(Math.max(0, visibleMessages.length - 9), visibleMessages.length - 1)
        .map(function(item) {
          return {
            text: item.text,
            senderName: item.senderName
          };
        });
      previousMessages = prev;

      // Try to find a display name near the latest message.
      const nameElInLatest =
        latest.container.querySelector("span[email]") ||
        latest.container.querySelector("span[role='link'][tabindex='-1']");

      if (nameElInLatest && nameElInLatest.textContent) {
        recipientName = nameElInLatest.textContent.trim();
      }

      // Try to infer user's name from how they were addressed in the latest message
      const messageText = latest.text.toLowerCase();
      const greetings = ["hi ", "hello ", "dear ", "hey ", "good morning ", "good afternoon "];
      
      for (const greeting of greetings) {
        const index = messageText.indexOf(greeting);
        if (index !== -1) {
          const afterGreeting = messageText.substring(index + greeting.length);
          // Look for name up to 3 words after greeting
          const words = afterGreeting.split(/\s+/).slice(0, 3);
          const potentialName = words.join(" ").replace(/[,.!?;:]/g, "").trim();
          if (potentialName && potentialName.length > 1 && potentialName.length < 30) {
            inferredUserName = potentialName.charAt(0).toUpperCase() + potentialName.slice(1);
            break;
          }
        }
      }
    } else {
      console.warn("[ReplyMate DEBUG] No visible messages found in thread");
    }
    

    // Fallback: try to find any visible sender/recipient name in thread.
    if (!recipientName) {
      const anyNameEl =
        main.querySelector("span[email]") ||
        main.querySelector("span[role='link'][tabindex='-1']");
      if (anyNameEl && anyNameEl.textContent) {
        recipientName = anyNameEl.textContent.trim();
      }
    }

    const result = {
      subject: subject || "",
      latestMessage: latestMessage || "",
      previousMessages: previousMessages || [],
      recipientName: recipientName || "",
      inferredUserName: inferredUserName || "",
      participants: extractParticipants(visibleMessages)
    };

    // DIAGNOSTIC: Log final result
    console.log(`[ReplyMate DEBUG] Final thread context:`, {
      hasSubject: !!result.subject,
      subjectLength: result.subject.length,
      hasLatestMessage: !!result.latestMessage,
      latestMessageLength: result.latestMessage.length,
      previousMessagesCount: result.previousMessages.length,
      hasRecipientName: !!result.recipientName,
      recipientName: result.recipientName || "NONE",
      hasInferredUserName: !!result.inferredUserName,
      inferredUserName: result.inferredUserName || "NONE",
      participants: result.participants
    });

    // Send participant data to popup for multi-language detection
    if (result.participants && result.participants.length > 1) {
      chrome.runtime.sendMessage({
        type: "PARTICIPANTS_DETECTED",
        data: {
          participants: result.participants
        }
      });
    }

    return result;
  } catch (error) {
    console.error("[ReplyMate DEBUG] Error in extractThreadContext:", error);
    // Always return a safe object even if the DOM structure is unexpected.
    return {
      subject: "",
      latestMessage: "",
      previousMessages: [],
      recipientName: "",
      inferredUserName: "",
    };
  }
}

// Small polling helper for dynamic Gmail UI: repeatedly tries `getValue()` until
// it returns a truthy value or times out.
function poll(getValue, { timeoutMs = REPLYMATE_CONFIG.ui.timeouts.poll, intervalMs = 200 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();

    const tick = () => {
      let value = null;
      try {
        value = getValue();
      } catch {
        value = null;
      }

      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }

      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  function scrollMainThreadDown() {
    const main = document.querySelector("div[role='main']");
    if (!main) return;
  
    // Gmail 읽기 화면을 아래로 조금씩 내려서 Reply 버튼이 보이게 유도
    main.scrollBy({
      top: 800,
      left: 0,
      behavior: "instant",
    });
  }
  
  function getVisibleReplyCandidates() {
    const main = document.querySelector("div[role='main']") || document.body;
  
    const candidates = Array.from(
      main.querySelectorAll("div[role='button'], span[role='button'], td[role='button'], button, span, div")
    );
  
    return candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
  
      const ariaLabel = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      const dataTooltip = (el.getAttribute("data-tooltip") || "").trim().toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();
  
      const looksLikeReply =
        ariaLabel === "reply" ||
        ariaLabel.startsWith("reply") ||
        dataTooltip === "reply" ||
        dataTooltip.startsWith("reply") ||
        text === "reply";
  
      if (!looksLikeReply) return false;
  
      const looksWrong =
        ariaLabel.includes("forward") ||
        ariaLabel.includes("reply all") ||
        dataTooltip.includes("forward") ||
        dataTooltip.includes("reply all") ||
        text === "forward" ||
        text === "reply all";
  
      if (looksWrong) return false;
  
      return true;
    });
  }

// Find a "Reply" action button in the currently opened thread view.
// Gmail is heavily dynamic, so we try a few reasonable selectors.
function findReplyButtonInThread() {
    const candidates = getVisibleReplyCandidates();
  
    if (!candidates.length) return null;
  
    // 화면 아래쪽에 있는 Reply 버튼이 실제로 우리가 원하는 inline reply일 가능성이 큼
    candidates.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.top - rectA.top; // 더 아래에 있는 버튼 우선
    });
  
    return candidates[0] || null;
  }

  function clickElementLikeUser(element) {
    if (!(element instanceof Element)) return;
  
    const eventInit = { bubbles: true, cancelable: true, view: window };
  
    element.dispatchEvent(new MouseEvent("mouseover", eventInit));
    element.dispatchEvent(new MouseEvent("mousedown", eventInit));
    element.dispatchEvent(new MouseEvent("mouseup", eventInit));
    element.dispatchEvent(new MouseEvent("click", eventInit));
  }

// Find the reply editor that appears after clicking Reply.
function findActiveReplyEditor() {
  const main = document.querySelector("div[role='main']") || document.body;
  const editors = main.querySelectorAll(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );

  for (const editor of editors) {
    if (!(editor instanceof HTMLElement)) continue;
    if (editor.offsetParent === null) continue;
    if (!isReplyEditor(editor)) continue;
    return editor;
  }

  return null;
}

// ------------------------------
// Inbox / message list hover UI
// ------------------------------

// Class name used for the hover button so we can avoid duplicates.
const REPLYMATE_HOVER_BUTTON_CLASS = "replymate-hover-generate-button";

// Try to identify a Gmail message list row in a safe, conservative way.
// Gmail commonly uses either:
// - `tr.zA` rows (legacy table layout), or
// - `div[role="row"]` inside `div[role="grid"]` (newer layouts)
function findMessageListRowFromTarget(target) {
  if (!(target instanceof Element)) return null;

  const legacyRow = target.closest("tr.zA");
  if (legacyRow) return legacyRow;

  const ariaRow = target.closest("div[role='row']");
  if (ariaRow && ariaRow.closest("div[role='grid']")) return ariaRow;

  return null;
}

// Safely open the email thread for a given row by simulating a user click.
// Gmail sometimes relies on mouse events rather than just calling `.click()`.
function openThreadForRow(row) {
  if (!(row instanceof Element)) return;

  // Prefer a direct link if one exists (more deterministic than clicking the whole row).
  const links = row.querySelectorAll("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href") || "";

    // Gmail thread links typically use a hash route (e.g. "/mail/u/0/#inbox/...").
    // Avoid mailto and other non-navigation links that might exist in the row.
    if (href.includes("#") && !href.startsWith("mailto:")) {
      link.click();
      return;
    }
  }

  // Fallback: dispatch a small sequence of mouse events on the row.
  const eventInit = { bubbles: true, cancelable: true, view: window };
  row.dispatchEvent(new MouseEvent("mousedown", eventInit));
  row.dispatchEvent(new MouseEvent("mouseup", eventInit));
  row.dispatchEvent(new MouseEvent("click", eventInit));
}

// Full workflow for the hover button:
// 1) open the email thread
// 2) wait for thread UI, find & click Reply
// 3) wait for reply editor
// 4) insert the sample reply
async function runHoverGenerateReplyWorkflow(row, sourceButton) {
    if (!(row instanceof Element)) return;
  
    if (row.dataset.replymateWorkflowRunning === "1") return;
    row.dataset.replymateWorkflowRunning = "1";
  
    let inEmailButton = null;
    
    if (sourceButton) {
      // If already loading, prevent duplicate requests.
      if (sourceButton.dataset.replymateState === "loading") {
        console.log("[ReplyMate] Hover button workflow already running for this row");
        return;
      }
      await setReplyMateButtonState(sourceButton, "loading");
      // Mark button so hide logic can keep it visible during workflow.
      sourceButton.dataset.replymateGenerating = "1";
    }
  
    try {
      openThreadForRow(row);
  
      // 메일 열리는 시간 잠깐 대기
      await sleep(1200);
  
      // Reply 버튼이 스레드 아래쪽에 있을 수 있어서 스크롤 보정
      for (let i = 0; i < 4; i++) {
        scrollMainThreadDown();
        await sleep(400);
      }
  
      const replyButton = await poll(() => {
        scrollMainThreadDown();
        return findReplyButtonInThread();
      }, {
        timeoutMs: REPLYMATE_CONFIG.ui.timeouts.replyButton,
        intervalMs: 400,
      });
  
      if (!replyButton) {
        console.log("[ReplyMate] Reply button not found");
        const inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          await setReplyMateButtonState(inEmailButton, "error");
          setTimeout(async () => await setReplyMateButtonState(inEmailButton, "idle"), 2000);
        }
        return;
      }
  
      console.log("[ReplyMate] Reply button found:", replyButton);
  
      // 화면에 잘 보이게 한 뒤 클릭
      replyButton.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  
      await sleep(300);
      clickElementLikeUser(replyButton);
  
      const replyEditor = await poll(() => findActiveReplyEditor(), {
        timeoutMs: REPLYMATE_CONFIG.ui.timeouts.replyEditor,
        intervalMs: 300,
      });
  
      if (!replyEditor) {
        console.log("[ReplyMate] Reply editor not found");
        if (sourceButton) {
          await setReplyMateButtonState(sourceButton, "error");
          setTimeout(async () => await setReplyMateButtonState(sourceButton, "idle"), 2000);
        }
        const inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          await setReplyMateButtonState(inEmailButton, "error");
          setTimeout(async () => await setReplyMateButtonState(inEmailButton, "idle"), 2000);
        }
        return;
      }
  
      console.log("[ReplyMate] Reply editor found:", replyEditor);
  
      replyEditor.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  
      await sleep(200);

      try {
        // Find and update the in-email AI Reply button to show loading state
        inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          await setReplyMateButtonState(inEmailButton, "loading");
        }

        // Load user settings (tone, length, and user name).
        const settings = await loadReplyMateSettings();
        const language = await getCurrentLanguage();

        // Extract context from the currently opened Gmail thread.
        const threadContext = extractThreadContext();

        // Build the payload that would be sent to an AI backend.
        const payload = {
          subject: threadContext.subject || "",
          latestMessage: threadContext.latestMessage || "",
          recipientName: threadContext.recipientName || "",
          userName: settings.userName || threadContext.inferredUserName || "",
          tone: settings.tone || DEFAULT_TONE,
          length: settings.length || DEFAULT_LENGTH,
          lengthInstruction: buildLengthInstruction(settings.length || DEFAULT_LENGTH, language),
          language: language,
        };

        // Debug log for userName in payload
        console.log("[ReplyMate Debug] Hover mode - userName sent to backend:", payload.userName);
        console.log("[ReplyMate Debug] Hover mode - settings.userName:", settings.userName);
        console.log("[ReplyMate Debug] Hover mode - threadContext.inferredUserName:", threadContext.inferredUserName);

        // Only include previousMessages when we actually have some.
        if (Array.isArray(threadContext.previousMessages) && threadContext.previousMessages.length > 0) {
          // Add speaker labeling to previous messages
          const labeledPreviousMessages = threadContext.previousMessages.map(msg => {
            const userDisplayName = settings.userName || threadContext.inferredUserName || "";
            let speakerName = "Other";
            
            // Check if sender is the user
            if (msg.senderName && userDisplayName) {
              // Normalize both names for comparison (case insensitive, remove extra spaces)
              const normalizedSender = msg.senderName.toLowerCase().trim();
              const normalizedUser = userDisplayName.toLowerCase().trim();
              
              if (normalizedSender === normalizedUser || 
                  normalizedSender.includes(normalizedUser) || 
                  normalizedUser.includes(normalizedSender)) {
                speakerName = "You";
              } else {
                speakerName = msg.senderName;
              }
            } else if (msg.senderName) {
              speakerName = msg.senderName;
            }
            
            return {
              text: msg.text,
              speakerName: speakerName
            };
          });
          
          payload.previousMessages = labeledPreviousMessages;
        }

        console.log("[ReplyMate payload]", payload);
  
        const replyData = await generateAIReply(payload);
  
        if (!replyData) {
          if (sourceButton) {
            await setReplyMateButtonState(sourceButton, "error");
            setTimeout(async () => await setReplyMateButtonState(sourceButton, "idle"), 2000);
          }
          if (inEmailButton) {
            await setReplyMateButtonState(inEmailButton, "error");
            setTimeout(async () => await setReplyMateButtonState(inEmailButton, "idle"), 2000);
          }
          return;
        }
  
        await insertReplyIntoEditor(replyEditor, replyData.reply);
        if (sourceButton) {
          await setReplyMateButtonState(sourceButton, "idle");
        }
        if (inEmailButton) {
          await setReplyMateButtonState(inEmailButton, "idle");
        }

        // Update usage display if usage info is available (same as inner button)
        if (replyData && replyData.usage) {
          updateUsageDisplayFromData(replyData.usage);
        } else {
          // Fallback: refresh usage display if no usage info in response
          updateUsageDisplay(document.querySelector(".replymate-usage-display"));
        }
      } finally {
        row.dataset.replymateWorkflowRunning = "0";
        if (sourceButton) {
          delete sourceButton.dataset.replymateGenerating;
        }
      }
    } catch (error) {
      console.error("[ReplyMate] Error generating reply:", error);
      if (sourceButton) {
        await setReplyMateButtonState(sourceButton, "error");
        setTimeout(async () => await setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      if (inEmailButton) {
        await setReplyMateButtonState(inEmailButton, "error");
        setTimeout(async () => await setReplyMateButtonState(inEmailButton, "idle"), 2000);
      }
    }
  }

  async function createHoverGenerateButton(row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = REPLYMATE_HOVER_BUTTON_CLASS;

    button.style.padding = "4px 10px";
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
    button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.fontSize = "11px";
    button.style.fontWeight = "500";
    button.style.height = "28px";
    button.style.whiteSpace = "nowrap";

    attachReplyMateButtonHoverStyles(button);
    await setReplyMateButtonState(button, "idle");

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      // ...
      // Duplicate click prevention: ignore if already loading.
      if (button.dataset.replymateState === "loading") {
        console.log("[ReplyMate] Hover button click ignored (already loading)");
        return;
      }

      // Check usage before proceeding
      try {
        const userId = await getReplyMateUserId();
        
        const usageResponse = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
          method: "GET",
          headers: {
            "X-User-ID": userId
          }
        });

        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          if (usage.remaining <= 0) {
            const language = await getCurrentLanguage();
            showReplyMateMessage(getTranslation("replyLimitReached", language));
            await setReplyMateButtonState(button, "error");
            setTimeout(async () => await setReplyMateButtonState(button, "idle"), 2000);
            return;
          }
        }
      } catch (error) {
        console.error("[ReplyMate] Failed to check usage:", error);
        // Continue anyway on error
      }

      runHoverGenerateReplyWorkflow(row, button);
    });

    return button;
  }

  function findVisibleRightSideControls(row) {
    if (!(row instanceof Element)) return [];
  
    const rowRect = row.getBoundingClientRect();
    const actionZoneStart = rowRect.left + rowRect.width * 0.45;
  
    const candidates = Array.from(
      row.querySelectorAll(
        "[role='button'], button, a, span[role='button'], span[role='link'], div[role='button']"
      )
    );
  
    return candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
      if (el.classList.contains(REPLYMATE_HOVER_BUTTON_CLASS)) return false;
  
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
  
      // See reply / Unsubscribe 같은 큰 버튼도 허용
      if (rect.width > 260 || rect.height > 80) return false;
  
      // 오른쪽 액션 영역만 보기
      if (rect.right < actionZoneStart) return false;
  
      const text = (el.textContent || "").trim();
  
      // 긴 제목/본문 snippet 제외
      const looksLikeLongMessageText =
        text.length > 40 && rect.left < rowRect.left + rowRect.width * 0.75;
  
      if (looksLikeLongMessageText) return false;
  
      return true;
    });
  }

  function findVisibleDefaultGmailActionControls(row) {
    if (!(row instanceof Element)) return [];
  
    const selectors = [
      "[aria-label='Archive']",
      "[data-tooltip='Archive']",
      "[aria-label='Delete']",
      "[data-tooltip='Delete']",
      "[aria-label='Snooze']",
      "[data-tooltip='Snooze']",
      "[aria-label='Mark as read']",
      "[data-tooltip='Mark as read']",
      "[aria-label='Mark as unread']",
      "[data-tooltip='Mark as unread']",
      "[aria-label='Move to']",
      "[data-tooltip='Move to']",
      "[aria-label='Labels']",
      "[data-tooltip='Labels']"
    ];
  
    return selectors
      .flatMap((selector) => Array.from(row.querySelectorAll(selector)))
      .filter((el) => el instanceof HTMLElement && el.offsetParent !== null);
  }
  
  function positionHoverButton(row, button) {
    let controls = findVisibleRightSideControls(row);
  
    // 부가 버튼 포함 일반 탐지 실패 시, Gmail 기본 아이콘만 따로 탐지
    if (controls.length === 0) {
      controls = findVisibleDefaultGmailActionControls(row);
    }
  
    if (controls.length > 0) {
      const rowRect = row.getBoundingClientRect();
  
      const leftmost = controls.reduce((minEl, el) => {
        const rect = el.getBoundingClientRect();
        const minRect = minEl.getBoundingClientRect();
        return rect.left < minRect.left ? el : minEl;
      });
  
      const leftmostRect = leftmost.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
  
      const gap = 10;
      let left = leftmostRect.left - rowRect.left - buttonRect.width - gap;
      let top =
        leftmostRect.top -
        (leftmostRect.height - buttonRect.height) / 2;
      
      left = Math.max(8, left);
      top = Math.max(4, top);
  
      button.style.left = `${left}px`;
      button.style.top = `${top}px`;
      button.style.right = "auto";
      button.style.transform = "none";
  
      return true;
    }
  
    return false;
  }

  async function showHoverButtonForRow(row) {
    if (!(row instanceof Element)) return;
    if (row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`)) return;
  
    const button = await createHoverGenerateButton(row);
  
    const computed = window.getComputedStyle(row);
    if (computed.position === "static") {
      row.style.position = "relative";
    }
  
    button.style.position = "absolute";
    button.style.visibility = "hidden";
    button.style.zIndex = "9999";
    button.style.transform = "none";
    row.appendChild(button);
  
    let attempts = 0;
    const maxAttempts = 16;
  
    const tryPlace = () => {
      // row에서 버튼이 이미 사라졌으면 중단
      if (!document.body.contains(button)) return;
  
      const positioned = positionHoverButton(row, button);
  
      if (positioned) {
        button.style.visibility = "visible";
        return;
      }
  
      attempts += 1;
  
      if (attempts < maxAttempts) {
        setTimeout(tryPlace, 50);
        return;
      }
  
      // fallback
      button.style.right = "24px";
      button.style.top = "50%";
      button.style.left = "auto";
      button.style.transform = "translateY(-50%)";
      button.style.visibility = "visible";
    };
  
    tryPlace();
  }
  
  function hideHoverButtonForRow(row) {
    if (!(row instanceof Element)) return;
  
    const existingButton = row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`);
    if (!existingButton) return;

    // If a generation workflow is running for this row/button, keep it visible
    // so the user can see the loading / error state, even if the mouse leaves.
    if (
      row.dataset.replymateWorkflowRunning === "1" ||
      existingButton.dataset.replymateGenerating === "1"
    ) {
      console.log("[ReplyMate] hideHoverButtonForRow skipped (generating)");
      return;
    }

    // If the instruction input is focused, keep the button visible so user can type
    if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("replymate-instruction-input")) {
      console.log("[ReplyMate] hideHoverButtonForRow skipped (input focused)");
      return;
    }

    existingButton.remove();
  }  

// Use event delegation so we don't have to attach listeners to every row instance.
// `mouseover` / `mouseout` bubble, which makes them ideal for delegation.
function setupMessageListHoverHandlers() {
  if (window.__replymateHoverHandlersInstalled) return;
  window.__replymateHoverHandlersInstalled = true;

  document.addEventListener(
    "mouseover",
    (event) => {
      const row = findMessageListRowFromTarget(event.target);
      if (!row) return;

      // Only treat it as "enter" if the mouse came from outside the row.
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;

      showHoverButtonForRow(row);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const row = findMessageListRowFromTarget(event.target);
      if (!row) return;

      // Only treat it as "leave" if the mouse is going outside the row.
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;

      hideHoverButtonForRow(row);
    },
    true
  );
}

// Injects a single ReplyMate button per REPLY editor and avoids duplicates.
async function injectButtonIntoComposeAreas() {
  const editors = document.querySelectorAll(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );

  for (const editor of editors) {
    // Only target editors that look like reply editors, not generic compose.
    if (!isReplyEditor(editor)) {
      continue;
    }

    const composeContainer = editor.closest("div[role='dialog']") || editor.parentElement;
    if (!composeContainer) continue;

    // Check for existing ReplyMate UI in the actual parent where we append the button
    const actualParent = editor.parentElement;
    if (!actualParent) continue;
    
    // Skip if this parent already has any ReplyMate UI elements
    if (actualParent.querySelector(".replymate-generate-button") || 
        actualParent.querySelector(".replymate-instruction-input") ||
        actualParent.querySelector(".replymate-usage-display") ||
        actualParent.querySelector(".replymate-upgrade-link")) {
      continue;
    }

    // Mark this parent to prevent race conditions during async button creation
    if (actualParent.dataset.replymateInjecting === "true") {
      continue;
    }
    actualParent.dataset.replymateInjecting = "true";

    try {
      const button = await createReplyMateButton();

      const buttonWrapper = document.createElement("div");
      buttonWrapper.className = "replymate-button-wrapper";
      buttonWrapper.style.marginTop = "8px";
      buttonWrapper.style.pointerEvents = "auto";
      buttonWrapper.style.position = "relative";
      buttonWrapper.style.zIndex = "1";
      buttonWrapper.appendChild(button);

      actualParent.appendChild(buttonWrapper);
    } finally {
      // Always clear the injecting flag
      delete actualParent.dataset.replymateInjecting;
    }
  }
}

// Observe the Gmail DOM so that buttons are injected for new compose windows.
const observer = new MutationObserver(async () => {
  // Skip if user is typing in instruction input to avoid UI disruption
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("replymate-instruction-input")) {
    return;
  }
  await injectButtonIntoComposeAreas();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial injection for compose editors that already exist on page load.
injectButtonIntoComposeAreas().then(() => {
  setupMessageListHoverHandlers();
});