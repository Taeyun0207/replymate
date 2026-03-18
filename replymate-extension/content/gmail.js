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
      generate: "/generate-reply",
      generateStream: "/generate-reply?stream=true"
    },
    upgradeUrl: (typeof REPLYMATE_UPGRADE_URL !== "undefined" ? REPLYMATE_UPGRADE_URL : "https://replymate.ai/upgrade")
  },
  // UI configuration
  ui: {
    colors: {
      normal: "#7943f1",
      hover: "#b794f6",
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
    replyLimitReached: "⚠️ ReplyMate limit reached. Upgrade to generate more replies.",
    signInRequired: "⚠️ Please sign in with Google to use ReplyMate.",
    planNames: {
      free: "Standard",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "replies left",
    instructionPlaceholder: "Additional details (optional, e.g. date, time, location)",
    upgradeToPro: "Upgrade to Pro",
    upgradeToProPlus: "Upgrade to Pro+",
    manageSubscription: "Manage Subscription",
    enjoyReplyMate: "Enjoy ReplyMate!",
    currentPlan: "Current Plan: ",
    replyGenerationFailed: "Reply generation failed: ",
    invalidResponseFromServer: "Invalid response from server.",
    unexpectedResponseFormat: "Unexpected response format.",
    unableToExtractContent: "Unable to extract email content. Please try refreshing the page.",
    extensionContextInvalidated: "ReplyMate was updated. Please refresh this page to continue.",
    translateLatestMessage: "Translate latest email",
    translateReply: "Translate my reply",
    translateManual: "Translate",
    translateInputPlaceholder: "Paste text to translate...",
    alreadyInYourLanguage: "Already in your selected language",
    noReplyFound: "No reply found. Generate a reply first.",
    copied: "Copied!",
    translateClose: "Close",
    translateCopy: "Copy",
    translateError: "Translation failed: ",
    translateLimitReached: "You've reached your daily translation limit (15/day).\nUpgrade to Pro for unlimited translations.",
    noMessageFound: "No message found in this thread.",
    noTextToTranslate: "Please paste or enter text to translate.",
    nothingToCopy: "Nothing to copy. Translate something first.",
    translatePanelTitle: "ReplyMate Translate",
    translatePasteLabel: "Paste text to translate",
    translateResultLabel: "Result",
    translateToLabel: "Translate to",
    systemLanguage: "System Language",
    translating: "Translating...",
    contentSame: "Same content.\nNo translation needed."
  },
  korean: {
    aiReply: "AI Reply",
    aiReplyHover: "AI Reply",
    generating: "생성 중...",
    tryAgain: "다시 시도",
    limitReached: "한도 도달",
    usageUnavailable: "사용량을 사용할 수 없음",
    monthlyLimitReached: "⚠️월간 ReplyMate 한도에 도달했습니다. 더 많은 답장을 생성하려면 업그레이드하세요.",
    replyLimitReached: "⚠️ ReplyMate 한도에 도달했습니다. 더 많은 답장을 생성하려면 업그레이드하세요.",
    signInRequired: "⚠️ ReplyMate를 사용하려면 Google로 로그인해 주세요.",
    planNames: {
      free: "Standard",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "답장 남음",
    instructionPlaceholder: "추가 정보 입력 (선택 사항, 예: 날짜, 시간)",
    upgradeToPro: "Pro로 업그레이드",
    upgradeToProPlus: "Pro+로 업그레이드",
    manageSubscription: "구독 관리",
    enjoyReplyMate: "ReplyMate를 즐겨보세요!",
    currentPlan: "현재 플랜: ",
    replyGenerationFailed: "답장 생성 실패: ",
    invalidResponseFromServer: "서버에서 잘못된 응답을 받았습니다.",
    unexpectedResponseFormat: "예상치 못한 응답 형식입니다.",
    unableToExtractContent: "이메일 내용을 추출할 수 없습니다. 페이지를 새로고침해 주세요.",
    extensionContextInvalidated: "ReplyMate가 업데이트되었습니다. 계속하려면 페이지를 새로고침해 주세요.",
    translateLatestMessage: "최근 메일 번역",
    translateReply: "내 답장 번역",
    translateManual: "번역",
    translateInputPlaceholder: "번역할 텍스트를 붙여넣으세요...",
    alreadyInYourLanguage: "선택한 언어와 같습니다",
    noReplyFound: "답장이 없습니다. 먼저 답장을 생성해 주세요.",
    copied: "복사됨!",
    translateClose: "닫기",
    translateCopy: "복사",
    translateError: "번역 실패: ",
    translateLimitReached: "오늘의 번역 한도(15회)를 모두 사용했습니다.\nPro로 업그레이드하면 무제한입니다.",
    noMessageFound: "이 메일에서 내용을 찾을 수 없습니다.",
    noTextToTranslate: "번역할 텍스트를 붙여넣거나 입력해 주세요.",
    nothingToCopy: "복사할 내용이 없습니다. 먼저 번역해 주세요.",
    translatePanelTitle: "ReplyMate 번역",
    translatePasteLabel: "번역할 텍스트 붙여넣기",
    translateResultLabel: "번역 결과",
    translateToLabel: "번역 대상 언어",
    systemLanguage: "시스템 언어",
    translating: "번역 중...",
    contentSame: "동일한 내용입니다.\n번역할 필요가 없습니다."
  },
  japanese: {
    aiReply: "AI Reply",
    aiReplyHover: "AI Reply",
    generating: "返信を生成中...",
    tryAgain: "再試行",
    limitReached: "利用上限に達しました",
    usageUnavailable: "現在この機能は利用できません",
    monthlyLimitReached: "⚠️ 今月の返信回数の上限に達しました。続けて利用するには、プランをアップグレードしてください。",
    replyLimitReached: "⚠️ 返信回数の上限に達しました。続けて利用するには、プランをアップグレードしてください。",
    signInRequired: "⚠️ ReplyMateをご利用になるには、Googleでサインインしてください。",
    planNames: {
      free: "Standard",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "残り返信可能数",
    instructionPlaceholder: "追加情報（任意：日付、時間 など）",
    upgradeToPro: "Proにアップグレード",
    upgradeToProPlus: "Pro+にアップグレード",
    manageSubscription: "サブスクリプション管理",
    enjoyReplyMate: "ReplyMateをお楽しみください！",
    currentPlan: "現在のプラン: ",
    replyGenerationFailed: "返信の生成に失敗しました: ",
    invalidResponseFromServer: "サーバーから無効な応答を受け取りました。",
    unexpectedResponseFormat: "予期しない応答形式です。",
    unableToExtractContent: "メールの内容を取得できません。ページを更新してください。",
    extensionContextInvalidated: "ReplyMateが更新されました。続行するにはページを更新してください。",
    translateLatestMessage: "直近のメールを翻訳",
    translateReply: "返信を翻訳",
    translateManual: "翻訳",
    translateInputPlaceholder: "翻訳するテキストを貼り付けてください...",
    alreadyInYourLanguage: "選択した言語と同じです",
    noReplyFound: "返信が見つかりません。先に返信を生成してください。",
    copied: "コピーしました！",
    translateClose: "閉じる",
    translateCopy: "コピー",
    translateError: "翻訳に失敗しました: ",
    translateLimitReached: "本日の翻訳上限（15回）に達しました。\nProにアップグレードで無制限に。",
    noMessageFound: "このメールに内容がありません。",
    noTextToTranslate: "翻訳するテキストを貼り付けるか入力してください。",
    nothingToCopy: "コピーする内容がありません。先に翻訳してください。",
    translatePanelTitle: "ReplyMate 翻訳",
    translatePasteLabel: "翻訳するテキストを貼り付け",
    translateResultLabel: "翻訳結果",
    translateToLabel: "翻訳先",
    systemLanguage: "システム言語",
    translating: "翻訳中...",
    contentSame: "同じ内容です。\n翻訳の必要はありません。"
  },
  spanish: {
    aiReply: "Respuesta IA",
    aiReplyHover: "Respuesta IA",
    generating: "Generando...",
    tryAgain: "Intentar de nuevo",
    limitReached: "Límite alcanzado",
    usageUnavailable: "Uso no disponible",
    monthlyLimitReached: "⚠️ Has alcanzado el límite mensual de ReplyMate. Actualiza para generar más respuestas.",
    replyLimitReached: "⚠️ Límite de ReplyMate alcanzado. Actualiza para generar más respuestas.",
    signInRequired: "⚠️ Por favor, inicia sesión con Google para usar ReplyMate.",
    planNames: {
      free: "Standard",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "respuestas restantes",
    instructionPlaceholder: "Detalles adicionales (opcional, ej. fecha, hora, ubicación)",
    upgradeToPro: "Actualizar a Pro",
    upgradeToProPlus: "Actualizar a Pro+",
    manageSubscription: "Gestionar suscripción",
    enjoyReplyMate: "¡Disfruta ReplyMate!",
    currentPlan: "Plan actual: ",
    replyGenerationFailed: "Error al generar la respuesta: ",
    invalidResponseFromServer: "Respuesta inválida del servidor.",
    unexpectedResponseFormat: "Formato de respuesta inesperado.",
    unableToExtractContent: "No se puede extraer el contenido del correo. Por favor, actualiza la página.",
    extensionContextInvalidated: "ReplyMate se actualizó. Por favor, actualiza esta página para continuar.",
    translateLatestMessage: "Traducir último correo",
    translateReply: "Traducir mi respuesta",
    translateManual: "Traducir",
    translateInputPlaceholder: "Pega texto para traducir...",
    alreadyInYourLanguage: "Ya está en tu idioma seleccionado",
    noReplyFound: "No hay respuesta. Genera una respuesta primero.",
    copied: "¡Copiado!",
    translateClose: "Cerrar",
    translateCopy: "Copiar",
    translateError: "Error de traducción: ",
    translateLimitReached: "Has alcanzado el límite diario (15/día).\nActualiza a Pro para traducciones ilimitadas.",
    noMessageFound: "No hay contenido en este correo.",
    noTextToTranslate: "Pega o escribe texto para traducir.",
    nothingToCopy: "Nada que copiar. Traduce algo primero.",
    translatePanelTitle: "ReplyMate Traducir",
    translatePasteLabel: "Pega texto para traducir",
    translateResultLabel: "Resultado",
    translateToLabel: "Traducir a",
    systemLanguage: "Idioma del sistema",
    translating: "Traduciendo...",
    contentSame: "Mismo contenido.\nNo se necesita traducción."
  }
};

// Get translation for current language
function getTranslation(key, language = DEFAULT_LANGUAGE) {
  const lang = TRANSLATIONS[language] || TRANSLATIONS.english;
  return lang[key] || TRANSLATIONS.english[key] || key;
}
// Expose on window so translation-common does not overwrite with a partial set on Gmail
if (typeof window !== "undefined") window.getTranslation = getTranslation;

// Check if error is "Extension context invalidated" (happens when extension is reloaded while page is open)
function isExtensionContextInvalidated(error) {
  const msg = error?.message || String(error);
  return msg.includes("Extension context invalidated") || msg.includes("context invalidated");
}

// Get current language from storage
async function getCurrentLanguage() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve(DEFAULT_LANGUAGE);
        return;
      }
      chrome.storage.local.get([REPLYMATE_LANGUAGE_KEY], (result) => {
        try {
          if (chrome?.runtime?.lastError) resolve(DEFAULT_LANGUAGE);
          else resolve(result?.[REPLYMATE_LANGUAGE_KEY] || DEFAULT_LANGUAGE);
        } catch (e) {
          if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] getCurrentLanguage error:", e);
          resolve(DEFAULT_LANGUAGE);
        }
      });
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] getCurrentLanguage error:", e);
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
          try {
            if (chrome?.runtime?.lastError) {
              resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
              return;
            }
            const tone = result?.[REPLYMATE_TONE_KEY] || DEFAULT_TONE;
            const length = result?.[REPLYMATE_LENGTH_KEY] || DEFAULT_LENGTH;
            const userName = result?.[REPLYMATE_USER_NAME_KEY] || "";
            resolve({ tone, length, userName });
          } catch (e) {
            if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] loadReplyMateSettings error:", e);
            resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
          }
        }
      );
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) console.warn("[ReplyMate] Settings load error, using defaults:", error);
      resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
    }
  });
}

// Check if user is signed in (uses auth-shared, no anonymous fallback)
async function isLoggedIn() {
  const token = await getAccessToken();
  return !!token;
}

// Get access token for API calls (requires login).
async function getAccessToken() {
  // Ensure config is in storage before refresh (content script may run in iframe)
  if (typeof ReplyMateAuthShared !== "undefined") {
    const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
    const url = g.REPLYMATE_SUPABASE_URL;
    const anonKey = g.REPLYMATE_SUPABASE_ANON_KEY;
    if (url && anonKey) await ReplyMateAuthShared.syncConfig(url, anonKey);
  }
  // 1. Try local auth-shared (direct storage access)
  if (typeof ReplyMateAuthShared !== "undefined") {
    const localToken = await ReplyMateAuthShared.getAccessToken();
    if (localToken) return localToken;
  }
  // 2. Fallback: ask background
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_ACCESS_TOKEN" });
    if (res && res.token) return res.token;
  } catch (e) {
    if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] getAccessToken fallback error:", e);
  }
  return null;
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
        resolve(null);
        return;
      }
      
      chrome.storage.local.get([USAGE_CACHE_KEY], (result) => {
        try {
          if (result && result[USAGE_CACHE_KEY]) {
            const { data, timestamp } = result[USAGE_CACHE_KEY];
            if (Date.now() - timestamp < USAGE_CACHE_TTL) {
              resolve(data);
              return;
            }
          }
        } catch (e) {
          if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] Cache read error:", e);
        }
        resolve(null);
      });
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        console.warn("[ReplyMate] Failed to get cached usage:", error);
      }
      resolve(null);
    }
  });
}

// Cache usage data with timestamp
function setCachedUsage(usageData) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const cacheData = { data: usageData, timestamp: Date.now() };
    chrome.storage.local.set({ [USAGE_CACHE_KEY]: cacheData });
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) console.warn("[ReplyMate] Failed to cache usage:", error);
  }
}

// Shared function to fetch usage from backend (requires auth)
async function fetchUsageFromBackend() {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
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
async function getUsageData() {
  // Try cache first
  const cached = await getCachedUsage();
  if (cached) {
    return cached;
  }
  
  // Fetch fresh data
  return await fetchUsageFromBackend();
}

// Format usage display text - plan name only (same for pre-login and logged-in Standard plan)
function formatUsageDisplay(plan, remaining, limit, language = DEFAULT_LANGUAGE) {
  const planTranslations = TRANSLATIONS[language]?.planNames || TRANSLATIONS.english.planNames;
  const planName = planTranslations[plan] || planTranslations.free || "Standard";
  return planName;
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
  
  // Update all upgrade UI containers - show Manage Subscription only when remaining === 0
  const upgradeContainers = document.querySelectorAll(".replymate-upgrade-container");
  upgradeContainers.forEach(container => {
    if (container) {
      container.innerHTML = "";
      if (remaining === 0) {
        container.style.display = "flex";
        const manageLink = createManageSubscriptionLink(language);
        container.appendChild(manageLink);
      } else {
        container.style.display = "none";
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
      // Not logged in: show "Standard" (same as logged-in Standard plan)
      if (usageDisplay) {
        usageDisplay.textContent = formatUsageDisplay("free", 0, 0, language);
      }
    }

  } catch (error) {
    console.error("[ReplyMate] Failed to update usage display:", error);
    const language = await getCurrentLanguage();
    if (usageDisplay) {
      usageDisplay.textContent = formatUsageDisplay("free", 0, 0, language);
    }
  }
}

// Convert plain text to HTML for editor display (used during streaming).
function textToEditorHtml(text) {
  if (typeof text !== "string") return "";
  const normalized = text.replace(/\n{3,}/g, "\n\n");
  return normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// Update editor with streaming text (no [Your Name] replacement - done at end).
function updateEditorWithStreamingText(editor, text) {
  if (!(editor instanceof HTMLElement)) return;
  const html = textToEditorHtml(text);
  editor.innerHTML = html;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// Generate AI reply with streaming - text appears as it generates.
// Optional callbacks: onFirstChunk (when first text appears), onComplete (when done or error).
async function generateAIReplyStreaming(payload, editor, callbacks = {}) {
  const { onFirstChunk, onComplete } = callbacks;
  let firstChunkFired = false;

  const fireOnFirstChunk = () => {
    if (!firstChunkFired && onFirstChunk) {
      firstChunkFired = true;
      onFirstChunk();
    }
  };

  try {
    const token = await getAccessToken();
    if (!token) {
      if (onComplete) onComplete();
      return null;
    }

    if (!payload?.latestMessage || typeof payload.latestMessage !== "string") {
      console.error("[ReplyMate] Invalid payload for streaming");
      if (onComplete) onComplete();
      return null;
    }

    const url = `${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.generateStream}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const language = await getCurrentLanguage();

    if (!response.ok) {
      const text = await response.text();
      let errorData = {};
      try { errorData = JSON.parse(text) || {}; } catch (_) {}
      if (response.status === 401) {
        showReplyMateMessage(getTranslation("signInRequired", language));
        if (onComplete) onComplete();
        return null;
      }
      if (response.status === 403 || errorData.error === "usage_limit_exceeded") {
        showReplyMateMessage(getTranslation("monthlyLimitReached", language));
        const usageData = await getUsageData();
        if (usageData) {
          usageData.remaining = 0;
          await updateUsageDisplayFromData(usageData);
        }
        if (onComplete) onComplete();
        return null;
      }
      const msg = errorData.error || errorData.detail || `Request failed (${response.status})`;
      showReplyMateMessage(getTranslation("replyGenerationFailed", language) + msg);
      if (onComplete) onComplete();
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullReply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk" && data.text) {
              fireOnFirstChunk();
              fullReply += data.text;
              if (editor) updateEditorWithStreamingText(editor, fullReply);
            } else if (data.type === "done" && data.usage) {
              if (onComplete) onComplete();
              return { reply: fullReply, usage: data.usage };
            } else if (data.type === "error") {
              showReplyMateMessage(getTranslation("replyGenerationFailed", language) + (data.error || ""));
              if (onComplete) onComplete();
              return null;
            }
          } catch (_) {}
        }
      }
    }

    if (onComplete) onComplete();
    return { reply: fullReply, usage: null };
  } catch (error) {
    const language = await getCurrentLanguage();
    const msg = error?.message || "Network error";
    console.error("[ReplyMate] Streaming error:", msg);
    showReplyMateMessage(getTranslation("replyGenerationFailed", language) + msg);
    if (onComplete) onComplete();
    return null;
  }
}

// Call the ReplyMate backend to generate an AI reply (requires auth).
async function generateAIReply(payload) {
  try {
    const token = await getAccessToken();
    if (!token) return "";

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
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    })
    .then(async (response) => {
      const language = await getCurrentLanguage();
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

        if (response.status === 401) {
          showReplyMateMessage(getTranslation("signInRequired", language));
          return "";
        }

        if (response.status === 403 || errorData.error === "usage_limit_exceeded") {
          console.warn("[ReplyMate] Monthly limit reached");
          showReplyMateMessage(getTranslation("monthlyLimitReached", language));

          // 리밋 도달 시 업그레이드 박스 표시
          const usageData = await getUsageData();
          if (usageData) {
            usageData.remaining = 0; // remaining을 0으로 설정하여 업그레이드 박스 표시
            await updateUsageDisplayFromData(usageData);
          }

          return "";
        }

        // Extract user-friendly error message (avoid [object Object])
        const baseMsg = typeof errorData.error === "string"
          ? errorData.error
          : errorData.rawText || `Request failed (${response.status})`;
        const errorMsg = errorData.detail ? `${baseMsg} (${errorData.detail})` : baseMsg;
        console.error("[ReplyMate] Backend error:", response.status, response.statusText, errorMsg);
        showReplyMateMessage(getTranslation("replyGenerationFailed", language) + errorMsg);
        return "";
      }

      const responseText = await response.text();
      console.log("[ReplyMate] Success response body length:", responseText.length);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("[ReplyMate] Failed to parse success response JSON:", parseError);
        showReplyMateMessage(getTranslation("invalidResponseFromServer", language));
        return "";
      }

      if (data && typeof data.reply === "string") {
        console.log("[ReplyMate] Backend reply received successfully");
        return data;
      }

      console.error("[ReplyMate] Unexpected backend response shape:", data);
      showReplyMateMessage(getTranslation("unexpectedResponseFormat", language));
      return "";
    })
    .catch(async (error) => {
      const language = await getCurrentLanguage();
      const msg = error && typeof error.message === "string" ? error.message : "Network error";
      console.error("[ReplyMate] Network/fetch error:", msg);
      showReplyMateMessage(getTranslation("replyGenerationFailed", language) + msg);
      return "";
    });
  } catch (error) {
    const language = await getCurrentLanguage();
    const msg = error && typeof error.message === "string" ? error.message : "Unexpected error";
    console.error("[ReplyMate] generateAIReply function error:", msg);
    showReplyMateMessage(getTranslation("replyGenerationFailed", language) + msg);
    return "";
  }
}

// Show ReplyMate message to user (with language support)
async function showReplyMateMessage(message, anchorElement = null) {
  try {
    const messageEl = document.createElement("div");
    messageEl.textContent = message;
    messageEl.className = "replymate-toast-message";
    messageEl.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      background: #f8f9fa;
      color: #333;
      padding: 14px 20px;
      border-radius: 8px;
      border: 1px solid #ddd;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      max-width: min(360px, calc(100vw - 40px));
      width: max-content;
      box-sizing: border-box;
      word-wrap: break-word;
      white-space: normal;
      pointer-events: auto;
    `;

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      messageEl.style.background = '#2d2e30';
      messageEl.style.color = '#e8eaed';
      messageEl.style.borderColor = '#5f6368';
    }

    document.body.appendChild(messageEl);

    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, REPLYMATE_CONFIG.ui.timeouts.message);
  } catch (err) {
    console.error("[ReplyMate] showReplyMateMessage error:", err);
  }
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

// Auto mode: AI has full control. Decide length and tone from context. Prioritize natural, appropriate response.
const autoInstructions = {
  english: `AUTO MODE (you decide everything): You have full control over tone and length. Read the email thread and respond as a real person would.

LENGTH: Match the situation. A quick "Thanks!" → 1–2 sentences. A complex request with multiple questions → as long as needed to address everything naturally. Do not pad short emails with filler; do not cut corners on emails that deserve a thoughtful reply. Natural > word count.

TONE: Match the sender. Formal business email → professional. Friendly check-in → warm and conversational. Brief acknowledgment → brief and warm back. Vary naturally—avoid defaulting to generic polite.`,
  korean: `AUTO MODE (당신이 모두 결정): 톤과 길이를 완전히 자유롭게 결정하세요. 이메일을 읽고 실제 사람처럼 답하세요.

LENGTH: 상황에 맞게. "감사합니다!" → 1–2문장. 복잡한 요청/여러 질문 → 필요한 만큼 자연스럽게. 짧은 이메일에 filler 추가하지 말고, 신중한 답이 필요한 이메일은 충분히 답하세요. 자연스러움 > 단어 수.

TONE: 발신자에 맞게. 격식 있는 업무 이메일 → 전문적. 친근한 연락 → 따뜻하고 대화체. 짧은 확인 → 짧고 따뜻하게. 자연스럽게 변화—일반적인 정중함에만 의존하지 마세요.`,
  japanese: `AUTO MODE（すべてあなたが決定）: トーンと長さを完全に自由に決めてください。メールを読んで実際の人のように返信してください。

LENGTH: 状況に合わせて。「ありがとう！」→ 1〜2文。複雑な依頼・複数の質問 → 必要な分だけ自然に。短いメールに filler を足さず、丁寧な返信が必要なメールは十分に返してください。自然さ > 語数。

TONE: 送信者に合わせて。フォーマルなビジネスメール → プロフェッショナル。親しみのある連絡 → 温かく会話調。短い確認 → 短く温かく。自然に変化—一般的な丁寧さに頼りすぎないでください。`,
  spanish: `AUTO MODE (tú decides todo): Tienes control total sobre tono y longitud. Lee el hilo y responde como lo haría una persona real.

LENGTH: Ajusta a la situación. Un "¡Gracias!" rápido → 1–2 oraciones. Una solicitud compleja con varias preguntas → lo que haga falta para responder todo naturalmente. No rellenes correos cortos; no recortes correos que merecen una respuesta reflexiva. Natural > conteo de palabras.

TONE: Ajusta al remitente. Correo formal de negocios → profesional. Mensaje amigable → cálido y conversacional. Breve confirmación → breve y cálido. Varía naturalmente—evita el tono genérico cortés por defecto.`
};

// Convert UI language to OpenAI language code
function mapLanguageToOpenAI(language) {
  const languageMapping = {
    'english': 'en',
    'korean': 'ko',
    'japanese': 'ja',
    'spanish': 'es'
  };
  return languageMapping[language] || 'en';
}

function buildLengthInstruction(length, language = DEFAULT_LANGUAGE) {
  const l = (length || DEFAULT_LENGTH).toLowerCase();
  
  // Context-based language: reply matches email; placeholders follow user's language setting
  const languageRule = "LANGUAGE: Reply in the same language as the email you are replying to. Match the language, tone, and register of the incoming message. Placeholders in [] must be in the user's language setting (from popup).";

  // Auto mode - let backend determine length
  if (l === "auto") {
    return `${languageRule}\n\n${autoInstructions[language] || autoInstructions.english}`;
  }

  if (l === "short") {
    const shortInstructions = {
      english: "LENGTH: Short (very brief, minimal, fast). Write exactly 1–2 sentences, maximum ~20 words. Be extremely concise. No preamble, no extra pleasantries, no follow-up questions. Reply and stop. Short must feel noticeably shorter than a typical email.",
      korean: "LENGTH: Short (매우 짧고 간결). 정확히 1–2문장, 최대 ~20단어. 극도로 간결하게. 서론·추가 인사·추가 질문 없음. 답하고 끝. Short는 일반 이메일보다 확실히 짧아야 함.",
      japanese: "LENGTH: Short（非常に短く簡潔）. 正確に1〜2文、最大〜20語。極めて簡潔に。前置き・余計な挨拶・追加の質問なし。返事して終わり。Shortは通常のメールより明らかに短くすること。",
      spanish: "LENGTH: Short (muy breve, mínimo, rápido). Escribe exactamente 1–2 oraciones, máximo ~20 palabras. Sé extremadamente conciso. Sin preámbulo, sin cortesías extra, sin preguntas de seguimiento. Responde y termina. Short debe sentirse notablemente más corto que un correo típico."
    };
    return `${languageRule}\n\n${shortInstructions[(language || 'english')] || shortInstructions.english}`;
  }

  if (l === "long") {
    const longInstructions = {
      english: "LENGTH: Long (fuller, complete, thoughtful). Write 6–9 sentences, 70–150 words. Include: brief context or acknowledgment, main response with detail, appreciation or next steps, and a polished closing. Long must feel noticeably more complete and considered than a typical quick reply.",
      korean: "LENGTH: Long (충분하고 완전하며 신중함). 6–9문장, 70–150단어. 포함: 맥락/인지, 상세한 본론, 감사/다음 단계, 세련된 마무리. Long은 일반적인 짧은 답장보다 확실히 더 완전하고 신중해야 함.",
      japanese: "LENGTH: Long（十分で丁寧な返信）. 6〜9文、70〜150語。含める：文脈・確認、詳細な本論、感謝・次のステップ、洗練された結び。Longは通常の短い返信より明らかに完全で丁寧であること。",
      spanish: "LENGTH: Long (más completo, detallado, reflexivo). Escribe 6–9 oraciones, 70–150 palabras. Incluye: breve contexto o reconocimiento, respuesta principal con detalle, agradecimiento o próximos pasos, y un cierre pulido. Long debe sentirse notablemente más completo que una respuesta rápida típica."
    };
    return `${languageRule}\n\n${longInstructions[(language || 'english')] || longInstructions.english}`;
  }

  // medium / default
  const mediumInstructions = {
    english: "LENGTH: Medium (balanced, natural). Write 3–5 sentences, 25–70 words. One brief acknowledgment, the main point, and a natural closing. Not too brief, not too long. Medium should feel like a normal, well-proportioned email reply.",
    korean: "LENGTH: Medium (균형 잡힌 자연스러운 길이). 3–5문장, 25–70단어. 짧은 인지, 핵심 내용, 자연스러운 마무리. 너무 짧지도 길지도 않게. Medium은 일반적이고 균형 잡힌 이메일 답장처럼 느껴져야 함.",
    japanese: "LENGTH: Medium（バランスの取れた自然な長さ）. 3〜5文、25〜70語。短い確認、本題、自然な結び。短すぎず長すぎず。Mediumは普通のバランスの取れた返信のように感じること。",
    spanish: "LENGTH: Medium (equilibrado, natural). Escribe 3–5 oraciones, 25–70 palabras. Un breve reconocimiento, el punto principal y un cierre natural. Ni muy breve ni muy largo. Medium debe sentirse como una respuesta de correo normal y bien proporcionada."
  };
  return `${languageRule}\n\n${mediumInstructions[(language || 'english')] || mediumInstructions.english}`;
}

// Auto-detect optimal tone based on email context — intentional, not generic
function detectOptimalTone(threadContext, latestMessage) {
  const message = latestMessage.toLowerCase();
  const subject = (threadContext.subject || "").toLowerCase();
  
  // Step 1: Detect message intent
  let intent = 'unknown';
  let complexity = 'simple';
  
  if (message.includes('thank') || message.includes('감사') || message.includes('ありがとう') || message.includes('gracias') ||
      message.includes('got it') || message.includes('알겠습니다') || message.includes('de acuerdo') || message.includes('entendido') ||
      message.includes('received') || message.includes('받았습니다') || message.includes('recibido') ||
      message.includes('ok ') || message.includes('okay') || message.includes('네 ') || message.includes('예 ')) {
    intent = 'acknowledgement';
    complexity = 'simple';
  } else if (message.includes('meeting') || message.includes('회의') || message.includes('ミーティング') || 
             message.includes('schedule') || message.includes('일정') || message.includes('予定') ||
             subject.includes('meeting') || subject.includes('회의') || subject.includes('schedule')) {
    intent = 'scheduling';
    complexity = 'medium';
  } else if (message.includes('?') && (message.includes('when') || message.includes('what time') || 
             message.includes('몇 시') || message.includes('언제') || message.includes('いつ') || 
             message.includes('how much') || message.includes('가격') || message.includes('価格') || 
             message.includes('price') || message.includes('release') || message.includes('출시') || message.includes('発売'))) {
    intent = 'scheduling_question';
    complexity = 'medium';
  } else if (message.includes('price') || message.includes('pricing') || message.includes('가격') || 
             message.includes('비용') || message.includes('価格') || message.includes('料金') ||
             message.includes('release') || message.includes('출시') || message.includes('発売') ||
             message.includes('when will') || message.includes('언제')) {
    intent = 'inquiry';
    complexity = 'medium';
  } else if (message.includes('could you') || message.includes('부탁') || message.includes('ください') || 
             message.includes('would you') || message.includes('해주시겠습니까') ||
             message.includes('please') || message.includes('제발') || message.includes('お願い')) {
    intent = 'request';
    complexity = 'medium';
  } else if (message.includes('let me know') || message.includes('알려주세요') || 
             message.includes('inform') || message.includes('공유') || 
             message.includes('update') || message.includes('업데이트') || message.includes('更新')) {
    intent = 'information';
    complexity = 'simple';
  } else if (message.includes('check') || message.includes('확인') || 
             message.includes('status') || message.includes('상황') || message.includes('状況') ||
             message.includes('follow up') || message.includes('진행') || message.includes('進捗')) {
    intent = 'follow_up';
    complexity = 'simple';
  } else if (message.includes('sorry') || message.includes('apolog') || message.includes('죄송') || 
             message.includes('미안') || message.includes('申し訳') || message.includes('すみません')) {
    intent = 'apology';
    complexity = 'medium';
  } else if (message.includes('issue') || message.includes('problem') || message.includes('문제') || 
             message.includes('問題') || message.includes('concern') ||
             message.includes('disappoint') || message.includes('실망') || message.includes('残念')) {
    intent = 'complaint';
    complexity = 'complex';
  }
  
  // Step 2: Detect complexity and formality cues
  const messageLength = latestMessage.length;
  const questionCount = (message.match(/\?/g) || []).length;
  const hasUrgency = message.includes('urgent') || message.includes('긴급') || 
                     message.includes('asap') || message.includes('지금') || message.includes('急');
  const hasWorkKeywords = message.includes('project') || message.includes('report') || 
                        message.includes('deadline') || message.includes('마감') || 
                        message.includes('업무') || message.includes('業務') || message.includes('契約');
  
  if (messageLength > 120 || questionCount > 2) {
    complexity = 'complex';
  } else if (questionCount > 0 || hasUrgency) {
    complexity = 'medium';
  }
  
  // Step 3: Auto tone selection — match tone to what the situation needs
  let chosenTone = 'polite';
  let toneReason = 'unclear context → polite (safe default)';
  
  if (intent === 'acknowledgement') {
    chosenTone = 'direct';
    toneReason = 'acknowledgement → direct (brief, efficient)';
  } else if (intent === 'scheduling' || intent === 'scheduling_question' || intent === 'inquiry') {
    chosenTone = 'professional';
    toneReason = 'scheduling/inquiry → professional (clear, composed)';
  } else if (hasWorkKeywords || intent === 'follow_up') {
    chosenTone = 'professional';
    toneReason = 'work-related → professional';
  } else if (intent === 'complaint' || intent === 'apology') {
    chosenTone = 'polite';
    toneReason = 'complaint/apology → polite (respectful, considerate)';
  } else if (intent === 'request' || complexity === 'complex') {
    chosenTone = 'polite';
    toneReason = 'request/complex → polite (warm, courteous)';
  } else if (intent === 'information' && complexity === 'simple') {
    chosenTone = 'direct';
    toneReason = 'simple info → direct (efficient)';
  }
  
  console.log("[ReplyMate Auto] Tone intent detected:", intent);
  console.log("[ReplyMate Auto] Tone complexity:", complexity);
  console.log("[ReplyMate Auto] Chosen tone:", chosenTone, `(${toneReason})`);
  
  return {
    tone: chosenTone,
    intent: intent,
    complexity: complexity,
    reason: toneReason
  };
}

// Auto-detect optimal length based on email context — intentional, not generic
function detectOptimalLength(threadContext, latestMessage) {
  const message = latestMessage.toLowerCase();
  const subject = (threadContext.subject || "").toLowerCase();
  const messageLength = latestMessage.length;
  const questionCount = (message.match(/\?/g) || []).length;
  
  // Step 1: Detect message intent
  let intent = 'unknown';
  let complexity = 'simple';
  
  if (message.includes('thank') || message.includes('감사') || message.includes('ありがとう') || 
      message.includes('got it') || message.includes('알겠습니다') || 
      message.includes('received') || message.includes('받았습니다') ||
      message.includes('ok ') || message.includes('okay') || message.includes('네 ') || message.includes('예 ') ||
      message.includes('좋아요') || message.includes('いいです')) {
    intent = 'acknowledgement';
    complexity = 'simple';
  } else if (message.includes('meeting') || message.includes('회의') || message.includes('ミーティング') || 
             message.includes('schedule') || message.includes('일정') || message.includes('予定') ||
             subject.includes('meeting') || subject.includes('회의') || subject.includes('schedule')) {
    intent = 'scheduling';
    complexity = 'medium';
  } else if (message.includes('?') && (message.includes('when') || message.includes('what time') || 
             message.includes('몇 시') || message.includes('언제') || message.includes('いつ') || 
             message.includes('how much') || message.includes('가격') || message.includes('価格') || 
             message.includes('price') || message.includes('release') || message.includes('출시') || message.includes('発売'))) {
    intent = 'scheduling_question';
    complexity = 'medium';
  } else if (message.includes('price') || message.includes('pricing') || message.includes('가격') || 
             message.includes('비용') || message.includes('価格') || message.includes('料金') ||
             message.includes('release') || message.includes('출시') || message.includes('発売')) {
    intent = 'inquiry';
    complexity = 'medium';
  } else if (message.includes('could you') || message.includes('부탁') || message.includes('ください') || 
             message.includes('would you') || message.includes('해주시겠습니까') ||
             message.includes('please') || message.includes('제발') || message.includes('お願い')) {
    intent = 'request';
    complexity = 'medium';
  } else if (message.includes('let me know') || message.includes('알려주세요') || 
             message.includes('inform') || message.includes('공유') || 
             message.includes('update') || message.includes('업데이트') || message.includes('更新')) {
    intent = 'information';
    complexity = 'simple';
  } else if (message.includes('check') || message.includes('확인') || 
             message.includes('status') || message.includes('상황') || message.includes('状況') ||
             message.includes('follow up') || message.includes('진행') || message.includes('進捗')) {
    intent = 'follow_up';
    complexity = 'simple';
  } else if (message.includes('sorry') || message.includes('apolog') || message.includes('죄송') || 
             message.includes('미안') || message.includes('申し訳') || message.includes('すみません')) {
    intent = 'apology';
    complexity = 'medium';
  } else if (message.includes('issue') || message.includes('problem') || message.includes('문제') || 
             message.includes('問題') || message.includes('concern') ||
             message.includes('disappoint') || message.includes('실망') || message.includes('残念')) {
    intent = 'complaint';
    complexity = 'complex';
  }
  
  // Step 2: Refine complexity
  const hasUrgency = message.includes('urgent') || message.includes('긴급') || 
                     message.includes('asap') || message.includes('지금') || message.includes('急');
  const hasRequest = message.includes('please') || message.includes('could you') || message.includes('부탁') || 
                     message.includes('ください') || message.includes('해주세요');
  
  if (messageLength > 120 || questionCount > 2) {
    complexity = 'complex';
  } else if (questionCount > 0 || hasUrgency) {
    complexity = 'medium';
  }
  
  // Step 3: Auto length selection — match length to what the message deserves
  let chosenLength = 'medium';
  let lengthReason = 'default → medium (balanced)';
  
  if (intent === 'acknowledgement') {
    chosenLength = 'short';
    lengthReason = 'acknowledgement → short (1-2 sentences, brief and done)';
  } else if (intent === 'scheduling' || intent === 'scheduling_question') {
    chosenLength = 'medium';
    lengthReason = 'scheduling → medium (3-5 sentences, balanced)';
  } else if (intent === 'inquiry' || intent === 'complaint') {
    chosenLength = 'long';
    lengthReason = 'inquiry/complaint → long (fuller, thoughtful response)';
  } else if (intent === 'request' && messageLength > 60) {
    chosenLength = 'long';
    lengthReason = 'substantial request → long (deserves full reply)';
  } else if (intent === 'request' || questionCount > 0) {
    chosenLength = 'medium';
    lengthReason = 'request/question → medium (2-4 sentences)';
  } else if (complexity === 'complex' || messageLength > 120) {
    chosenLength = 'long';
    lengthReason = 'complex/long message → long (6-9 sentences)';
  } else if (intent === 'apology') {
    chosenLength = 'medium';
    lengthReason = 'apology → medium (appropriate depth)';
  } else if (intent === 'information' && messageLength < 40) {
    chosenLength = 'short';
    lengthReason = 'simple info request → short';
  }
  
  console.log("[ReplyMate Auto] Length intent detected:", intent);
  console.log("[ReplyMate Auto] Length complexity:", complexity);
  console.log("[ReplyMate Auto] Chosen length:", chosenLength, `(${lengthReason})`);
  
  return {
    length: chosenLength,
    intent: intent,
    complexity: complexity,
    reason: lengthReason
  };
}

// Detect message scope for Auto mode (questions, requests, topics)
function getMessageScope(latestMessage) {
  if (!latestMessage || typeof latestMessage !== "string") return null;
  const msg = latestMessage.toLowerCase();
  const questionCount = (msg.match(/\?/g) || []).length;
  const requestMarkers = ["please", "could you", "would you", "can you", "부탁", "해주세요", "お願い", "ください", "send", "confirm", "let me know", "알려주세요", "inform"];
  const requestCount = requestMarkers.filter((m) => msg.includes(m)).length;
  const topicMarkers = ["and", "also", "또한", "그리고", "また", "さらに", "when", "what", "how", "언제", "무엇", "어떻게", "いつ", "何", "どの"];
  const topicCount = Math.min(questionCount + requestCount + topicMarkers.filter((m) => msg.includes(m)).length, 10);
  return { questionCount, requestCount, topicCount };
}

// Build length instruction with auto-detection and anti-hallucination rules
function buildLengthInstructionWithAuto(length, language = DEFAULT_LANGUAGE, autoDetectedLength = null, scopeContext = null) {
  // When user selected Auto, use "auto" (no pre-resolution). Manual stays as-is.
  const effectiveLength = autoDetectedLength || length || DEFAULT_LENGTH;
  const baseInstruction = buildLengthInstruction(effectiveLength, language);
  
  // When Auto mode, append scope hint (number-based helps model treat as checklist)
  let scopeHint = "";
  if (effectiveLength === "auto" && scopeContext && scopeContext.latestMessage) {
    const scope = getMessageScope(scopeContext.latestMessage);
    if (scope && (scope.questionCount > 0 || scope.requestCount > 0)) {
      scopeHint = `\n\nAddress all questions and requests. There are ${scope.questionCount} question(s) and ${scope.requestCount} request(s).`;
    }
  }

  return `${baseInstruction}${scopeHint}`;
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
  container.className = "replymate-ui-container";
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
  instructionInput.style.width = "320px";
  instructionInput.style.minWidth = "150px";
  instructionInput.style.maxWidth = "400px";
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

    // Login required for AI reply
    try {
      if (!(await isLoggedIn())) {
        const language = await getCurrentLanguage();
        await showReplyMateMessage(getTranslation("signInRequired", language), button);
        try {
          chrome.runtime.sendMessage({ type: "OPEN_POPUP_FOR_LOGIN" }).catch(() => {});
        } catch (_) {}
        await setReplyMateButtonState(button, "error");
        setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
        return;
      }
    } catch (err) {
      const language = await getCurrentLanguage();
      const msg = err?.message?.includes("Extension context invalidated")
        ? getTranslation("extensionContextInvalidated", language)
        : getTranslation("signInRequired", language);
      await showReplyMateMessage("⚠️ " + msg, button);
      await setReplyMateButtonState(button, "error");
      setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
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

    console.log("[ReplyMate Debug] User settings loaded:", {
      userName: settings.userName,
      tone: settings.tone,
      length: settings.length
    });

    console.log("[ReplyMate Debug] userName:", settings.userName);
    console.log("[ReplyMate Debug] threadContext.inferredUserName:", threadContext.inferredUserName);

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
      showReplyMateMessage("⚠️ " + getTranslation("unableToExtractContent", language));
      setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
      return;
    }

    // Auto mode: pass "auto" to backend so AI decides tone and length from full context (best quality)
    const userTone = settings.tone || DEFAULT_TONE;
    const userLength = settings.length || DEFAULT_LENGTH;
    
    const finalTone = userTone === "auto" ? "auto" : userTone;
    const finalLength = userLength === "auto" ? "auto" : userLength;
    
    const toneReason = userTone === "auto" ? "auto (AI decides from context)" : "user setting";
    const lengthReason = userLength === "auto" ? "auto (AI decides from context)" : "user setting";

    console.log("[ReplyMate Auto] User selected tone:", userTone);
    console.log("[ReplyMate Auto] User selected length:", userLength);
    console.log("[ReplyMate Auto] Final tone:", finalTone, `(${toneReason})`);
    console.log("[ReplyMate Auto] Final length:", finalLength, `(${lengthReason})`);

    const payload = {
      subject: threadContext.subject || "",
      latestMessage: threadContext.latestMessage || "",
      previousMessages: threadContext.previousMessages || [],
      recipientName: threadContext.recipientName || "",
      userName: settings.userName || threadContext.inferredUserName || "",
      tone: finalTone,
      length: finalLength,
      lengthInstruction: buildLengthInstructionWithAuto(finalLength, language, null, threadContext),
      additionalInstruction: instructionInput.value || "",
      language: language,
    };

    // Add explicit Tone and Length to the prompt
    const explicitInstructions = `
Tone: ${finalTone}
Length: ${finalLength}
`;

    // Update payload with explicit instructions at the top
    payload.lengthInstruction = `${explicitInstructions}\n\n${payload.lengthInstruction}`;

    console.log("[ReplyMate Debug] userName sent to backend:", payload.userName);
    console.log("[ReplyMate Debug] settings.userName:", settings.userName);
    console.log("[ReplyMate Debug] threadContext.inferredUserName:", threadContext.inferredUserName);
    console.log("[ReplyMate Auto] Final tone:", finalTone, `(${toneReason})`);
    console.log("[ReplyMate Auto] Final length:", finalLength, `(${lengthReason})`);
    console.log("[ReplyMate Auto] Final prompt used for AI generation:", payload.lengthInstruction);
    console.log("[ReplyMate Anti-Hallucination] Anti-hallucination rules applied to prevent fact fabrication");

    console.log("[ReplyMate DEBUG] Sending API request with payload (streaming):", payload);
    editor.focus();
    editor.innerHTML = "";

    const hideUI = () => {
      document.querySelectorAll(".replymate-ui-container").forEach((el) => {
        el.style.display = "none";
      });
    };
    const showUI = () => {
      document.querySelectorAll(".replymate-ui-container").forEach((el) => {
        el.style.display = "inline-flex";
      });
    };

    let replyData;
    try {
      replyData = await generateAIReplyStreaming(payload, editor, {
        onFirstChunk: hideUI,
        onComplete: showUI,
      });
    } finally {
      showUI();
    }
    console.log("[ReplyMate DEBUG] Streaming complete:", replyData ? "success" : "failed");
    
    if (!replyData) {
      console.log("[ReplyMate DEBUG] No reply data received, showing error");
      showUI();
      await setReplyMateButtonState(button, "error");
      setTimeout(async () => await setReplyMateButtonState(button, "idle"), 2000);
      return;
    }

    try {
      await insertReplyIntoEditor(editor, replyData.reply);
      console.log("[ReplyMate DEBUG] Reply finalized with [Your Name] replacement");
    } catch (error) {
      console.error("[ReplyMate DEBUG] Error finalizing reply:", error);
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
        // Not logged in: show "Standard" (same as logged-in Standard plan)
        usageDisplay.textContent = formatUsageDisplay("free", 0, 0, language);
      }
    } catch (error) {
      console.error("[ReplyMate] Failed to fetch initial usage:", error);
      usageDisplay.textContent = formatUsageDisplay("free", 0, 0, language);
    }
  })();
  
  container.appendChild(usageDisplay);
  
  // Add upgrade links with plan-based UI (only when logged in)
  const upgradeContainer = document.createElement("div");
  upgradeContainer.className = "replymate-upgrade-container";
  upgradeContainer.style.marginTop = "6px";
  upgradeContainer.style.display = "flex";
  upgradeContainer.style.gap = "8px";
  upgradeContainer.style.alignItems = "center";
  
  (async () => {
    try {
      if (!(await isLoggedIn())) {
        upgradeContainer.style.display = "none";
        return;
      }
      const usageData = await getUsageData();
      if (usageData && usageData.remaining === 0) {
        const language = await getCurrentLanguage();
        const manageLink = createManageSubscriptionLink(language);
        upgradeContainer.appendChild(manageLink);
      } else {
        upgradeContainer.style.display = "none";
      }
    } catch (error) {
      console.error("[ReplyMate] Failed to load usage for upgrade UI:", error);
      upgradeContainer.style.display = "none";
    }
  })();
  
  container.appendChild(upgradeContainer);
  
  return container;
}

// Helper function to create Manage Subscription link (opens upgrade page) - Pro+ gold styling
function createManageSubscriptionLink(language) {
  const link = document.createElement("a");
  link.className = "replymate-upgrade-link";
  link.href = REPLYMATE_CONFIG.backend.upgradeUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = getTranslation("manageSubscription", language);
  link.style.fontSize = "10px";
  link.style.textDecoration = "none";
  link.style.display = "inline-block";
  link.style.padding = "3px 6px";
  link.style.border = "1px solid #FFFF99";
  link.style.borderRadius = "3px";
  link.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFFF99 100%)";
  link.style.color = "#2C1810";
  link.style.textAlign = "center";
  link.style.fontWeight = "600";
  link.style.boxShadow = "0 2px 4px rgba(212, 175, 55, 0.3)";
  link.style.transition = "all 0.2s ease";
  link.style.whiteSpace = "nowrap";
  link.style.lineHeight = "1.2";
  link.addEventListener("mouseenter", () => {
    link.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFED4E 100%)";
    link.style.boxShadow = "0 4px 8px rgba(212, 175, 55, 0.4)";
    link.style.transform = "translateY(-1px)";
  });
  link.addEventListener("mouseleave", () => {
    link.style.background = "linear-gradient(135deg, #FFD700 0%, #FFD700 50%, #FFFF99 100%)";
    link.style.boxShadow = "0 2px 4px rgba(212, 175, 55, 0.3)";
    link.style.transform = "translateY(0px)";
  });
  link.addEventListener("click", (e) => {
    e.stopPropagation();
    window.open(REPLYMATE_CONFIG.backend.upgradeUrl, "_blank");
  });
  return link;
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

  // Normalize: collapse 3+ consecutive newlines to 2 (prevents excessive blank lines from model)
  const normalized = safeText.replace(/\n{3,}/g, "\n\n");
  // Convert text into HTML: each \n → one <br> (no double conversion)
  const html = normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

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
  
  // Spanish detection - accented chars and common words
  if (/[ñáéíóúü]/.test(lowerText) ||
      /\b(gracias|por favor|que|para|con|estoy|tengo|hola|buenos|días|noche|favor|información|solicitud|correo|respuesta)\b/i.test(lowerText)) {
    return 'spanish';
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

        // Auto mode: pass "auto" to backend so AI decides tone and length from full context
        const userTone = settings.tone || DEFAULT_TONE;
        const userLength = settings.length || DEFAULT_LENGTH;
        
        const finalTone = userTone === "auto" ? "auto" : userTone;
        const finalLength = userLength === "auto" ? "auto" : userLength;
        
        const toneReason = userTone === "auto" ? "auto (AI decides from context)" : "user setting";
        const lengthReason = userLength === "auto" ? "auto (AI decides from context)" : "user setting";

        console.log("[ReplyMate Auto] Hover mode - User selected tone:", userTone);
        console.log("[ReplyMate Auto] Hover mode - User selected length:", userLength);
        console.log("[ReplyMate Auto] Hover mode - Final tone:", finalTone, `(${toneReason})`);
        console.log("[ReplyMate Auto] Hover mode - Final length:", finalLength, `(${lengthReason})`);

        // Build the payload that would be sent to an AI backend.
        const payload = {
          subject: threadContext.subject || "",
          latestMessage: threadContext.latestMessage || "",
          recipientName: threadContext.recipientName || "",
          userName: settings.userName || threadContext.inferredUserName || "",
          tone: finalTone,
          length: finalLength,
          lengthInstruction: buildLengthInstructionWithAuto(finalLength, language, null, threadContext),
          language: language,
        };

        // Add explicit Tone and Length to the prompt
        const explicitInstructions = `
Tone: ${finalTone}
Length: ${finalLength}
`;

        // Update payload with explicit instructions at the top
        payload.lengthInstruction = `${explicitInstructions}\n\n${payload.lengthInstruction}`;

        console.log("[ReplyMate Debug] Hover mode - userName sent to backend:", payload.userName);
        console.log("[ReplyMate Debug] Hover mode - settings.userName:", settings.userName);
        console.log("[ReplyMate Debug] Hover mode - threadContext.inferredUserName:", threadContext.inferredUserName);
        console.log("[ReplyMate Auto] Hover mode - Final tone:", finalTone, `(${toneReason})`);
        console.log("[ReplyMate Auto] Hover mode - Final length:", finalLength, `(${lengthReason})`);
        console.log("[ReplyMate Auto] Hover mode - Final prompt used for AI generation:", payload.lengthInstruction);
        console.log("[ReplyMate Anti-Hallucination] Hover mode - Anti-hallucination rules applied to prevent fact fabrication");

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
  
        replyEditor.focus();
        replyEditor.innerHTML = "";

        const hideUI = () => {
          document.querySelectorAll(".replymate-ui-container").forEach((el) => {
            el.style.display = "none";
          });
        };
        const showUI = () => {
          document.querySelectorAll(".replymate-ui-container").forEach((el) => {
            el.style.display = "inline-flex";
          });
        };

        let replyData;
        try {
          replyData = await generateAIReplyStreaming(payload, replyEditor, {
            onFirstChunk: hideUI,
            onComplete: showUI,
          });
        } finally {
          showUI();
        }
  
        if (!replyData) {
          showUI();
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

      // Login required for AI reply
      try {
        const token = await getAccessToken();
        if (!token) {
          const language = await getCurrentLanguage();
          await showReplyMateMessage(getTranslation("signInRequired", language), button);
          try {
            chrome.runtime.sendMessage({ type: "OPEN_POPUP_FOR_LOGIN" }).catch(() => {});
          } catch (_) {}
          await setReplyMateButtonState(button, "error");
          setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
          return;
        }
      } catch (err) {
        const language = await getCurrentLanguage();
        const msg = err?.message?.includes("Extension context invalidated")
          ? getTranslation("extensionContextInvalidated", language)
          : getTranslation("signInRequired", language);
        await showReplyMateMessage("⚠️ " + msg, button);
        await setReplyMateButtonState(button, "error");
        setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
        return;
      }

      // Check usage before proceeding
      try {
        const usageResponse = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (usageResponse.status === 401) {
          const language = await getCurrentLanguage();
          showReplyMateMessage(getTranslation("signInRequired", language));
          await setReplyMateButtonState(button, "error");
          setTimeout(async () => await setReplyMateButtonState(button, "idle"), 3000);
          return;
        }
        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          const totalRemaining = (usage.remaining ?? 0) + (usage.topupRemaining ?? 0);
          if (totalRemaining <= 0) {
            const language = await getCurrentLanguage();
            showReplyMateMessage(getTranslation("replyLimitReached", language));
            await setReplyMateButtonState(button, "error");
            setTimeout(async () => await setReplyMateButtonState(button, "idle"), 2000);
            return;
          }
        }
      } catch (error) {
        console.error("[ReplyMate] Failed to check usage:", error);
        // Continue anyway on error (e.g. network)
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
        leftmostRect.top - rowRect.top + (leftmostRect.height - buttonRect.height) / 2;
      
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