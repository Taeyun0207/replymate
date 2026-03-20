/**
 * ReplyMate Outlook Web content script.
 * Same functionality as Gmail: AI Reply button, translation support.
 * Uses Outlook-specific DOM selectors for outlook.live.com and outlook.office.com.
 */
console.log("ReplyMate Outlook script loaded");

// Reuse shared logic from gmail.js structure - Outlook-specific DOM only.
// We load after auth-config and auth-shared. Config/translations match gmail.js.
function cleanEmailMessage(text) {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;
  const originalLength = cleaned.length;
  cleaned = cleaned.replace(/^(From:|Sent:|To:|Subject:|Cc:|Bcc:).*$/gm, "");
  cleaned = cleaned.replace(/^(받는\s*사람|참조|숨은\s*참조)\s*:?\s*.*$/gm, "");
  cleaned = cleaned.replace(/^(To|Cc|Bcc)\s*:?\s*.*$/gim, "");
  cleaned = cleaned.replace(/^(宛先|CC|BCC)\s*:?\s*.*$/gm, "");
  cleaned = cleaned.replace(/^(Para|CC|CCO)\s*:?\s*.*$/gim, "");
  cleaned = cleaned.replace(/^>.*$/gm, "");
  cleaned = cleaned.replace(/^--*[\s\S]*?On .*(wrote|writes):$/gm, "");
  if (cleaned.length > 100) {
    cleaned = cleaned.replace(/^--*[\s\S]*$/gm, "");
    cleaned = cleaned.replace(/^Best regards,[\s\S]*$/mi, "");
    cleaned = cleaned.replace(/^Regards,[\s\S]*$/mi, "");
    cleaned = cleaned.replace(/^Sincerely,[\s\S]*$/mi, "");
    cleaned = cleaned.replace(/^Thanks,[\s\S]*$/mi, "");
    cleaned = cleaned.replace(/^Thank you,[\s\S]*$/mi, "");
  }
  cleaned = cleaned.replace(/^---*[\s\S]*?---*$/gm, "");
  cleaned = cleaned.replace(/^\[.*\]$/gm, "");
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/^\s+|\s+$/g, "");
  if (cleaned.length === 0 && originalLength > 0) {
    let fallback = text;
    fallback = fallback.replace(/^(From:|Sent:|To:|Subject:|Cc:|Bcc:).*$/gm, "");
    fallback = fallback.replace(/^>.*$/gm, "");
    fallback = fallback.replace(/^\s+|\s+$/g, "");
    return fallback;
  }
  return cleaned.trim();
}

const REPLYMATE_CONFIG = {
  backend: {
    baseUrl: "https://replymate-backend-bot8.onrender.com",
    endpoints: { usage: "/usage", generate: "/generate-reply", generateStream: "/generate-reply?stream=true" },
    upgradeUrl: (typeof REPLYMATE_UPGRADE_URL !== "undefined" ? REPLYMATE_UPGRADE_URL : "https://replymateai.app/upgrade")
  },
  ui: {
    colors: { normal: "#7943f1", hover: "#b794f6", loading: "#9aa0a6", error: "#d93025", text: "#ffffff" },
    timeouts: { cache: 30000, poll: 8000, replyEditor: 12000, replyButton: 12000, message: 5000 }
  }
};

const REPLYMATE_TONE_KEY = "replymateTone";
const REPLYMATE_LENGTH_KEY = "replymateLength";
const REPLYMATE_USER_NAME_KEY = "replymateUserName";
const REPLYMATE_LANGUAGE_KEY = "replymateLanguage";
const DEFAULT_TONE = "auto";
const DEFAULT_LENGTH = "auto";
const DEFAULT_LANGUAGE = "english";

const TRANSLATIONS = {
  english: {
    aiReply: "AI Reply", generating: "Generating...", tryAgain: "Try Again", limitReached: "Limit reached",
    usageUnavailable: "Usage unavailable", monthlyLimitReached: "⚠️You've reached your monthly ReplyMate limit. Upgrade to generate more replies.",
    replyLimitReached: "⚠️ ReplyMate limit reached. Upgrade to generate more replies.",
    signInRequired: "⚠️ Sign in with Google to use ReplyMate.",
    planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" }, repliesLeft: "replies left",
    instructionPlaceholder: "Additional details (optional, e.g. date, time, location)",
    upgradeToPro: "Upgrade to Pro", upgradeToProPlus: "Upgrade to Pro+", manageSubscription: "Manage Subscription",
    enjoyReplyMate: "Enjoy ReplyMate!", currentPlan: "Current Plan: ",
    replyGenerationFailed: "Reply generation failed: ", invalidResponseFromServer: "Invalid response from server.",
    unexpectedResponseFormat: "Unexpected response format.",
    unableToExtractContent: "Unable to extract email content. Please try refreshing the page.",
    extensionContextInvalidated: "ReplyMate was updated. Please refresh this page to continue.",
    translateLatestMessage: "Translate latest email", translateReply: "Translate my reply", translateManual: "Translate",
    translateInputPlaceholder: "Paste text to translate...", noReplyFound: "No reply found. Generate a reply first.",
    noMessageFound: "No message found in this thread.", translatePanelTitle: "ReplyMate Translate",
    translateCycleTheme: "Cycle theme (saved for this panel only)",
    translatePasteLabel: "Paste text to translate", translateResultLabel: "Result", translateToLabel: "Translate to",
    systemLanguage: "System Language", translating: "Translating...", contentSame: "Same content.\nNo translation needed.",
    alreadyInYourLanguage: "Already in your selected language", translateCopy: "Copy",
    translateClose: "Close", translateError: "Translation failed: ", translateLimitReached: "You've reached your daily translation limit.",
    noTextToTranslate: "Please paste or enter text to translate.", nothingToCopy: "Nothing to copy. Translate something first.", copied: "Copied!",
    colorThemeProOnly:
      "Color themes are a Pro feature. Upgrade to Pro or Pro+ to unlock custom looks—in settings, the translation panel, and AI Reply buttons.",
    colorThemePlanCheckFailed: "Could not verify your plan. Check your connection and try again.",
    colorThemeUpgradePrompt: "Unlock Pro/Pro+",
    colorThemeToastPlanCheck: "We couldn’t verify your plan. Check your connection and try again.",
    signInToSeeUsage: "Sign in to use",
    translationsToday: "translations today",
    unlimitedTranslations: "Unlimited translations",
  },
  korean: {
    aiReply: "AI 답장", generating: "생성 중...", tryAgain: "다시 시도", limitReached: "한도 도달",
    monthlyLimitReached: "⚠️월간 ReplyMate 한도에 도달했습니다.", replyLimitReached: "⚠️ ReplyMate 한도에 도달했습니다.",
    signInRequired: "⚠️ ReplyMate를 사용하려면 Google로 로그인해 주세요.",
    planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" }, repliesLeft: "답장 남음",
    instructionPlaceholder: "추가 정보 입력 (선택 사항)", upgradeToPro: "Pro로 업그레이드", upgradeToProPlus: "Pro+로 업그레이드",
    manageSubscription: "구독 관리", unableToExtractContent: "이메일 내용을 추출할 수 없습니다.",
    noReplyFound: "답장이 없습니다.", noMessageFound: "이 메일에서 내용을 찾을 수 없습니다.",
    translateLatestMessage: "최근 메일 번역", translateReply: "내 답장 번역", translateManual: "번역",
    translatePanelTitle: "ReplyMate 번역", translateCycleTheme: "색 테마 (이 패널에만 저장)",
    translatePasteLabel: "번역할 텍스트 붙여넣기", translateResultLabel: "번역 결과",
    translateToLabel: "번역 대상 언어", systemLanguage: "시스템 언어", translating: "번역 중...", contentSame: "동일한 내용입니다.",
    alreadyInYourLanguage: "선택한 언어와 같습니다", translateCopy: "복사",
    translateClose: "닫기", translateError: "번역 실패: ", translateLimitReached: "오늘의 번역 한도를 모두 사용했습니다.",
    noTextToTranslate: "번역할 텍스트를 붙여넣거나 입력해 주세요.", nothingToCopy: "복사할 내용이 없습니다. 먼저 번역해 주세요.", copied: "복사됨!",
    colorThemeProOnly:
      "색 테마는 Pro 전용 기능입니다. Pro 또는 Pro+로 업그레이드하면 설정, 번역 패널, AI 답장 버튼 등에서 맞춤 색상을 사용할 수 있습니다.",
    colorThemePlanCheckFailed: "플랜을 확인할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    colorThemeUpgradePrompt: "Pro·Pro+ 잠금 해제",
    colorThemeToastPlanCheck: "플랜을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    signInToSeeUsage: "로그인하여 사용",
    translationsToday: "오늘 번역",
    unlimitedTranslations: "무제한 번역",
  },
  japanese: {
    aiReply: "AI Reply", generating: "返信を生成中...", tryAgain: "再試行", limitReached: "利用上限に達しました",
    monthlyLimitReached: "⚠️ 今月の返信回数の上限に達しました。", replyLimitReached: "⚠️ 返信回数の上限に達しました。",
    signInRequired: "⚠️ ReplyMateをご利用いただくには、Googleでログインしてください。",
    planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" }, repliesLeft: "残りの返信数",
    instructionPlaceholder: "追加情報（任意）", upgradeToPro: "Proにアップグレード", upgradeToProPlus: "Pro+にアップグレード",
    manageSubscription: "サブスクリプション管理", unableToExtractContent: "メールの内容を取得できません。",
    noReplyFound: "返信が見つかりません。", noMessageFound: "このメールに内容がありません。",
    translateLatestMessage: "直近のメールを翻訳", translateReply: "返信を翻訳", translateManual: "翻訳",
    translatePanelTitle: "ReplyMate 翻訳", translateCycleTheme: "テーマを切り替え（このパネルに保存）",
    translatePasteLabel: "翻訳するテキストを貼り付け", translateResultLabel: "翻訳結果",
    translateToLabel: "翻訳先", systemLanguage: "システム言語", translating: "翻訳中...", contentSame: "同じ内容です。",
    alreadyInYourLanguage: "選択した言語と同じです", translateCopy: "コピー",
    translateClose: "閉じる", translateError: "翻訳に失敗しました: ", translateLimitReached: "本日の翻訳上限に達しました。",
    noTextToTranslate: "翻訳するテキストを貼り付けるか入力してください。", nothingToCopy: "コピーする内容がありません。先に翻訳してください。", copied: "コピーしました！",
    colorThemeProOnly:
      "カラーテーマはPro向けの機能です。ProまたはPro+にアップグレードすると、設定・翻訳パネル・AI返信ボタンなどでカスタム配色が使えます。",
    colorThemePlanCheckFailed: "プランを確認できませんでした。接続を確認してもう一度お試しください。",
    colorThemeUpgradePrompt: "Pro／Pro+解除",
    colorThemeToastPlanCheck: "プランを確認できませんでした。接続を確認して再度お試しください。",
    signInToSeeUsage: "ログインしてご利用ください",
    translationsToday: "本日の翻訳",
    unlimitedTranslations: "無制限",
  },
  spanish: {
    aiReply: "Respuesta IA", generating: "Generando...", tryAgain: "Intentar de nuevo", limitReached: "Límite alcanzado",
    monthlyLimitReached: "⚠️ Has alcanzado el límite mensual de ReplyMate.", replyLimitReached: "⚠️ Límite de ReplyMate alcanzado.",
    signInRequired: "⚠️ Inicia sesión con Google para usar ReplyMate.",
    planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" }, repliesLeft: "respuestas restantes",
    instructionPlaceholder: "Detalles adicionales (opcional)", upgradeToPro: "Actualizar a Pro", upgradeToProPlus: "Actualizar a Pro+",
    manageSubscription: "Gestionar suscripción", unableToExtractContent: "No se puede extraer el contenido del correo.",
    noReplyFound: "No hay respuesta.", noMessageFound: "No hay contenido en este correo.",
    translateLatestMessage: "Traducir último correo", translateReply: "Traducir mi respuesta", translateManual: "Traducir",
    translatePanelTitle: "ReplyMate Traducir", translateCycleTheme: "Cambiar tema (solo guardado en este panel)",
    translatePasteLabel: "Pega texto para traducir", translateResultLabel: "Resultado",
    translateToLabel: "Traducir a", systemLanguage: "Idioma del sistema", translating: "Traduciendo...", contentSame: "Mismo contenido.",
    alreadyInYourLanguage: "Ya está en tu idioma seleccionado", translateCopy: "Copiar",
    translateClose: "Cerrar", translateError: "Error de traducción: ", translateLimitReached: "Has alcanzado el límite diario de traducción.",
    noTextToTranslate: "Pega o escribe texto para traducir.", nothingToCopy: "Nada que copiar. Traduce algo primero.", copied: "¡Copiado!",
    colorThemeProOnly:
      "Los temas de color son una función Pro. Mejora a Pro o Pro+ para desbloquear apariencias personalizadas en ajustes, el panel de traducción y los botones de respuesta con IA.",
    colorThemePlanCheckFailed: "No se pudo verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
    colorThemeUpgradePrompt: "Desbloquea Pro/Pro+",
    colorThemeToastPlanCheck: "No pudimos verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
    signInToSeeUsage: "Inicia sesión para usar",
    translationsToday: "traducciones hoy",
    unlimitedTranslations: "Traducciones ilimitadas",
  }
};

function getTranslation(key, language) {
  const lang = TRANSLATIONS[language] || TRANSLATIONS.english;
  return lang[key] || TRANSLATIONS.english[key] || key;
}
if (typeof window !== "undefined") window.getTranslation = getTranslation;

function isExtensionContextInvalidated(error) {
  const msg = error?.message || String(error);
  return msg.includes("Extension context invalidated") || msg.includes("context invalidated");
}

async function getCurrentLanguage() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve(DEFAULT_LANGUAGE);
        return;
      }
      chrome.storage.local.get([REPLYMATE_LANGUAGE_KEY], (result) => {
        try {
          if (chrome?.runtime?.lastError) resolve(DEFAULT_LANGUAGE);
          else resolve(result?.[REPLYMATE_LANGUAGE_KEY] || DEFAULT_LANGUAGE);
        } catch (e) {
          resolve(DEFAULT_LANGUAGE);
        }
      });
    } catch (e) {
      resolve(DEFAULT_LANGUAGE);
    }
  });
}

function loadReplyMateSettings() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
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
            resolve({
              tone: result?.[REPLYMATE_TONE_KEY] || DEFAULT_TONE,
              length: result?.[REPLYMATE_LENGTH_KEY] || DEFAULT_LENGTH,
              userName: result?.[REPLYMATE_USER_NAME_KEY] || ""
            });
          } catch (e) {
            resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
          }
        }
      );
    } catch (error) {
      resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
    }
  });
}

async function isLoggedIn() {
  const token = await getAccessToken();
  return !!token;
}

async function getAccessToken() {
  if (typeof ReplyMateAuthShared !== "undefined") {
    const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
    if (g.REPLYMATE_SUPABASE_URL && g.REPLYMATE_SUPABASE_ANON_KEY) {
      await ReplyMateAuthShared.syncConfig(g.REPLYMATE_SUPABASE_URL, g.REPLYMATE_SUPABASE_ANON_KEY);
    }
    const localToken = await ReplyMateAuthShared.getAccessToken();
    if (localToken) return localToken;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_ACCESS_TOKEN" });
    if (res && res.token) return res.token;
  } catch (e) {
    if (!isExtensionContextInvalidated(e)) console.warn("[ReplyMate] getAccessToken fallback error:", e);
  }
  return null;
}

const USAGE_CACHE_KEY = "replymate_usage_cache";
const USAGE_CACHE_TTL = REPLYMATE_CONFIG.ui.timeouts.cache;

function getCachedUsage() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get([USAGE_CACHE_KEY], (result) => {
        try {
          if (result && result[USAGE_CACHE_KEY]) {
            const { data, timestamp } = result[USAGE_CACHE_KEY];
            if (Date.now() - timestamp < USAGE_CACHE_TTL) resolve(data);
            else resolve(null);
          } else resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function setCachedUsage(usageData) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.set({ [USAGE_CACHE_KEY]: { data: usageData, timestamp: Date.now() } });
  } catch (_) {}
}

async function fetchUsageFromBackend() {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const response = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
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

async function getUsageData() {
  const cached = await getCachedUsage();
  if (cached) return cached;
  return await fetchUsageFromBackend();
}

function formatUsageDisplay(plan, remaining, limit, language) {
  const planNames = TRANSLATIONS[language]?.planNames || TRANSLATIONS.english.planNames;
  return planNames[plan] || planNames.free || "Free";
}

async function updateUsageDisplayFromData(usageData) {
  if (!usageData) return;
  const language = await getCurrentLanguage();
  const display = formatUsageDisplay(usageData.plan || "free", usageData.remaining ?? 0, usageData.limit ?? 0, language);
  document.querySelectorAll(".replymate-usage-display").forEach((el) => { el.textContent = display; });
}

async function updateUsageDisplay(usageDisplay) {
  try {
    const usageData = await getUsageData();
    const language = await getCurrentLanguage();
    if (usageData) {
      await updateUsageDisplayFromData(usageData);
    } else {
      if (usageDisplay) usageDisplay.textContent = formatUsageDisplay("free", 0, 0, language);
    }
  } catch (_) {
    if (usageDisplay) usageDisplay.textContent = formatUsageDisplay("free", 0, 0, await getCurrentLanguage());
  }
}

function textToEditorHtml(text) {
  if (typeof text !== "string") return "";
  const normalized = text.replace(/\n{3,}/g, "\n\n");
  return normalized.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function updateEditorWithStreamingText(editor, text) {
  if (!(editor instanceof HTMLElement)) return;
  const html = textToEditorHtml(text);
  editor.innerHTML = html;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

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
      if (onComplete) onComplete();
      return null;
    }
    const url = `${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.generateStream}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload)
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
    showReplyMateMessage(getTranslation("replyGenerationFailed", language) + (error?.message || "Network error"));
    if (onComplete) onComplete();
    return null;
  }
}

async function showReplyMateMessage(message) {
  try {
    const messageEl = document.createElement("div");
    messageEl.textContent = message;
    messageEl.className = "replymate-toast-message";
    messageEl.style.cssText = `
      position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#f8f9fa;color:#333;
      padding:14px 20px;border-radius:8px;border:1px solid #ddd;font-size:14px;font-weight:500;
      box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:min(360px,calc(100vw - 40px));word-wrap:break-word;white-space:normal;pointer-events:auto;
    `;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      messageEl.style.background = "#2d2e30";
      messageEl.style.color = "#e8eaed";
      messageEl.style.borderColor = "#5f6368";
    }
    document.body.appendChild(messageEl);
    setTimeout(() => { if (messageEl.parentNode) messageEl.parentNode.removeChild(messageEl); }, REPLYMATE_CONFIG.ui.timeouts.message);
  } catch (err) {
    console.error("[ReplyMate] showReplyMateMessage error:", err);
  }
}

/** AI Reply colors — follow popup color wheel (popup-theme-button.js); fallback to REPLYMATE_CONFIG. */
function getReplyMateBtnColor(key) {
  const fb = REPLYMATE_CONFIG.ui.colors;
  const api = typeof window !== "undefined" && window.ReplyMatePopupThemeButton;
  if (api && typeof api.getColors === "function") {
    const c = api.getColors();
    if (c && c[key] != null && c[key] !== "") return c[key];
  }
  return fb[key];
}

/**
 * @param {"idle"|"hover"|"loading"|"error"} mode
 */
function paintReplyMateAiButton(button, mode) {
  const api = typeof window !== "undefined" && window.ReplyMatePopupThemeButton;
  if (api && typeof api.applyButtonStyle === "function") {
    api.applyButtonStyle(button, mode);
    return;
  }
  const set = (p, v) => {
    try {
      button.style.setProperty(p, v, "important");
    } catch (_) {
      button.style[p.replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = v;
    }
  };
  set("background", "none");
  set("background-image", "none");
  set("box-shadow", "none");
  set("filter", "none");
  if (mode === "hover") set("background-color", getReplyMateBtnColor("hover"));
  else if (mode === "loading") set("background-color", getReplyMateBtnColor("loading"));
  else if (mode === "error") set("background-color", getReplyMateBtnColor("error"));
  else set("background-color", getReplyMateBtnColor("normal"));
  set("color", getReplyMateBtnColor("text"));
}

async function setReplyMateButtonState(button, state) {
  const language = await getCurrentLanguage();
  button.dataset.replymateState = state;
  if (state === "loading") {
    button.disabled = true;
    button.style.cursor = "default";
    button.textContent = getTranslation("generating", language);
    paintReplyMateAiButton(button, "loading");
  } else if (state === "error") {
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = getTranslation("tryAgain", language);
    paintReplyMateAiButton(button, "error");
  } else {
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = getTranslation("aiReply", language);
    paintReplyMateAiButton(button, "idle");
  }
}

function attachReplyMateButtonHoverStyles(button) {
  paintReplyMateAiButton(button, "idle");
  button.addEventListener("mouseenter", () => {
    if (button.dataset.replymateState === "idle") {
      paintReplyMateAiButton(button, "hover");
    }
  });
  button.addEventListener("mouseleave", () => {
    const state = button.dataset.replymateState || "idle";
    if (state === "idle") paintReplyMateAiButton(button, "idle");
    else if (state === "loading") paintReplyMateAiButton(button, "loading");
    else if (state === "error") paintReplyMateAiButton(button, "error");
  });
}

const autoInstructions = {
  english: `AUTO MODE: You have full control over tone and length. Read the email thread and respond as a real person would. Match the situation.`,
  korean: `AUTO MODE: 톤과 길이를 완전히 자유롭게 결정하세요. 이메일을 읽고 실제 사람처럼 답하세요.`,
  japanese: `AUTO MODE: トーンと長さを完全に自由に決めてください。メールを読んで実際の人のように返信してください。`,
  spanish: `AUTO MODE: Tienes control total sobre tono y longitud. Lee el hilo y responde como lo haría una persona real.`
};

function buildLengthInstruction(length, language) {
  const l = (length || DEFAULT_LENGTH).toLowerCase();
  const languageRule = "LANGUAGE: Reply in the same language as the email you are replying to.";
  if (l === "auto") return `${languageRule}\n\n${autoInstructions[language] || autoInstructions.english}`;
  if (l === "short") return `${languageRule}\n\nLENGTH: Short (1–2 sentences, ~20 words max).`;
  if (l === "long") return `${languageRule}\n\nLENGTH: Long (6–9 sentences, 70–150 words).`;
  return `${languageRule}\n\nLENGTH: Medium (3–5 sentences, 25–70 words).`;
}

function buildLengthInstructionWithAuto(length, language) {
  return buildLengthInstruction(length || DEFAULT_LENGTH, language);
}

async function insertReplyIntoEditor(editor, replyText) {
  if (!(editor instanceof HTMLElement)) return;
  let safeText = typeof replyText === "string" ? replyText : "";
  try {
    const settings = await loadReplyMateSettings();
    const userName = settings.userName || "";
    if (userName && userName.trim()) {
      [/\[Your Name\]/gi, /\[Your name\]/g, /\[your name\]/g, /\[YOUR NAME\]/g].forEach((p) => {
        safeText = safeText.replace(p, userName);
      });
    }
  } catch (_) {}
  const normalized = safeText.replace(/\n{3,}/g, "\n\n");
  const html = normalized.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  editor.focus();
  editor.innerHTML = html;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// --- Outlook-specific DOM ---

/**
 * Extract thread context from Outlook reading pane.
 * Outlook Web uses: div[role="main"], div[role="document"], etc.
 */
function extractThreadContext() {
  try {
    const main = document.querySelector("div[role='main']") || document.querySelector("[data-app-section='ReadingPane']") || document.body;

    let subject = "";
    const subjectEl = main.querySelector("h1") || main.querySelector("h2") || main.querySelector("[role='heading']") || main.querySelector(".Xb0hB");
    if (subjectEl && subjectEl.textContent) subject = subjectEl.textContent.trim();

    const visibleMessages = [];
    const containers = main.querySelectorAll(
      "div[role='article'], div[role='listitem'], div[data-convid], div[class*='messageBody'], div[class*='ReadingPane'] div[dir]"
    );

    for (const container of Array.from(containers)) {
      if (!(container instanceof HTMLElement) || container.offsetParent === null) continue;
      const bodyEl = container.querySelector("div[dir='ltr']") || container.querySelector("div[dir='rtl']") || container;
      const rawText = (bodyEl.innerText || bodyEl.textContent || "").trim();
      if (!rawText) continue;
      const cleanedText = cleanEmailMessage(rawText);
      if (!cleanedText) continue;

      let senderName = "";
      const nameEl = container.querySelector("span[title]") || container.querySelector("[aria-label]");
      if (nameEl && nameEl.textContent) {
        const t = nameEl.textContent.trim();
        if (t && t.length < 50 && !t.includes("@")) senderName = t;
      }

      visibleMessages.push({ container, text: cleanedText, senderName });
    }

    if (visibleMessages.length === 0) {
      const fallback = main.querySelector("div[role='document']") || main.querySelector(".Xb0hB");
      if (fallback) {
        const rawText = (fallback.innerText || fallback.textContent || "").trim();
        if (rawText) {
          const cleaned = cleanEmailMessage(rawText);
          if (cleaned) visibleMessages.push({ container: fallback, text: cleaned, senderName: "" });
        }
      }
    }

    let latestMessage = "";
    let previousMessages = [];
    let recipientName = "";
    let inferredUserName = "";

    if (visibleMessages.length > 0) {
      const latest = visibleMessages[visibleMessages.length - 1];
      latestMessage = latest.text;
      previousMessages = visibleMessages
        .slice(Math.max(0, visibleMessages.length - 9), visibleMessages.length - 1)
        .map((item) => ({ text: item.text, senderName: item.senderName }));
      recipientName = latest.senderName || "";

      const messageText = latest.text.toLowerCase();
      const greetings = ["hi ", "hello ", "dear ", "hey ", "good morning ", "good afternoon "];
      for (const greeting of greetings) {
        const index = messageText.indexOf(greeting);
        if (index !== -1) {
          const afterGreeting = messageText.substring(index + greeting.length);
          const words = afterGreeting.split(/\s+/).slice(0, 3);
          const potentialName = words.join(" ").replace(/[,.!?;:]/g, "").trim();
          if (potentialName && potentialName.length > 1 && potentialName.length < 30) {
            inferredUserName = potentialName.charAt(0).toUpperCase() + potentialName.slice(1);
            break;
          }
        }
      }
    }

    return {
      subject: subject || "",
      latestMessage: latestMessage || "",
      previousMessages: previousMessages || [],
      recipientName: recipientName || "",
      inferredUserName: inferredUserName || "",
      participants: visibleMessages.map((m) => ({ name: m.senderName, language: "english" }))
    };
  } catch (error) {
    console.error("[ReplyMate Outlook] extractThreadContext error:", error);
    return { subject: "", latestMessage: "", previousMessages: [], recipientName: "", inferredUserName: "", participants: [] };
  }
}

/**
 * Find the active reply/compose editor in Outlook.
 * Outlook uses contenteditable for the body.
 */
function findActiveReplyEditor() {
  const main = document.querySelector("div[role='main']") || document.body;
  const editors = main.querySelectorAll(
    'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="true"]'
  );

  for (const editor of editors) {
    if (!(editor instanceof HTMLElement)) continue;
    if (editor.offsetParent === null) continue;
    if (!isOutlookReplyEditor(editor)) continue;
    return editor;
  }
  return null;
}

function isOutlookReplyEditor(editor) {
  const text = (editor.innerText || editor.textContent || "").trim();
  if (text.length > 5000) return false;
  const parent = editor.closest("div[role='dialog']");
  if (parent && parent.querySelector("[aria-label*='New message']")) return false;
  const label = (editor.getAttribute("aria-label") || "").toLowerCase();
  if (label.includes("to") || label.includes("받는") || label.includes("recipient")) return false;
  return true;
}

function findEditorForButton(button) {
  if (!button || !(button instanceof HTMLElement)) return null;
  const container = button.closest("div[role='region']") || button.closest("div[contenteditable]")?.parentElement || button.parentElement;
  if (!container) return null;
  const editor = container.querySelector('div[contenteditable="true"]');
  return editor || null;
}

// --- Create ReplyMate button and inject ---

async function createReplyMateButton() {
  const language = await getCurrentLanguage();
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
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "12px";
  paintReplyMateAiButton(button, "idle");

  const instructionInput = document.createElement("input");
  instructionInput.type = "text";
  instructionInput.placeholder = getTranslation("instructionPlaceholder", language);
  instructionInput.className = "replymate-instruction-input";
  instructionInput.style.cssText = "padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;width:300px;min-width:150px;outline:none;background:#fff;color:#000;";

  instructionInput.addEventListener("mousedown", (e) => e.stopPropagation());
  instructionInput.addEventListener("click", (e) => e.stopPropagation());

  attachReplyMateButtonHoverStyles(button);
  await setReplyMateButtonState(button, "idle");

  requestAnimationFrame(() => {
    try {
      window.ReplyMatePopupThemeButton?.refreshAllButtons?.();
    } catch (_) {}
  });
  setTimeout(() => {
    try {
      window.ReplyMatePopupThemeButton?.refreshAllButtons?.();
    } catch (_) {}
  }, 400);

  button.addEventListener("click", async () => {
    if (button.dataset.replymateState === "loading") return;
    try {
      if (!(await isLoggedIn())) {
        await showReplyMateMessage(getTranslation("signInRequired", await getCurrentLanguage()));
        try { chrome.runtime.sendMessage({ type: "OPEN_POPUP_FOR_LOGIN" }); } catch (_) {}
        await setReplyMateButtonState(button, "error");
        setTimeout(() => setReplyMateButtonState(button, "idle"), 3000);
        return;
      }
    } catch (err) {
      await showReplyMateMessage("⚠️ " + (err?.message?.includes("Extension context invalidated") ? getTranslation("extensionContextInvalidated", await getCurrentLanguage()) : getTranslation("signInRequired", await getCurrentLanguage())));
      await setReplyMateButtonState(button, "error");
      setTimeout(() => setReplyMateButtonState(button, "idle"), 3000);
      return;
    }

    await setReplyMateButtonState(button, "loading");

    const editor = findEditorForButton(button) || findActiveReplyEditor();
    if (!editor) {
      await setReplyMateButtonState(button, "idle");
      return;
    }

    const settings = await loadReplyMateSettings();
    const threadContext = extractThreadContext();
    const lang = await getCurrentLanguage();

    if (!threadContext.latestMessage || threadContext.latestMessage.length === 0) {
      await setReplyMateButtonState(button, "error");
      showReplyMateMessage("⚠️ " + getTranslation("unableToExtractContent", lang));
      setTimeout(() => setReplyMateButtonState(button, "idle"), 3000);
      return;
    }

    const userTone = settings.tone || DEFAULT_TONE;
    const userLength = settings.length || DEFAULT_LENGTH;
    const finalTone = userTone === "auto" ? "auto" : userTone;
    const finalLength = userLength === "auto" ? "auto" : userLength;

    const payload = {
      subject: threadContext.subject || "",
      latestMessage: threadContext.latestMessage || "",
      previousMessages: (threadContext.previousMessages || []).map((msg) => ({ text: msg.text, speakerName: msg.senderName || "Other" })),
      recipientName: threadContext.recipientName || "",
      userName: settings.userName || threadContext.inferredUserName || "",
      tone: finalTone,
      length: finalLength,
      lengthInstruction: buildLengthInstructionWithAuto(finalLength, lang),
      additionalInstruction: instructionInput.value || "",
      language: lang
    };

    payload.lengthInstruction = `Tone: ${finalTone}\nLength: ${finalLength}\n\n${payload.lengthInstruction}`;

    editor.focus();
    editor.innerHTML = "";

    const hideUI = () => document.querySelectorAll(".replymate-ui-container").forEach((el) => { el.style.display = "none"; });
    const showUI = () => document.querySelectorAll(".replymate-ui-container").forEach((el) => { el.style.display = "inline-flex"; });

    let replyData;
    try {
      replyData = await generateAIReplyStreaming(payload, editor, { onFirstChunk: hideUI, onComplete: showUI });
    } finally {
      showUI();
    }

    if (!replyData) {
      await setReplyMateButtonState(button, "error");
      setTimeout(() => setReplyMateButtonState(button, "idle"), 2000);
      return;
    }

    await insertReplyIntoEditor(editor, replyData.reply);
    await setReplyMateButtonState(button, "idle");

    if (replyData.usage) {
      await updateUsageDisplayFromData(replyData.usage);
    } else {
      updateUsageDisplay(container.querySelector(".replymate-usage-display"));
    }
  });

  container.appendChild(button);
  container.appendChild(instructionInput);

  const usageDisplay = document.createElement("span");
  usageDisplay.className = "replymate-usage-display";
  usageDisplay.style.fontSize = "11px";
  usageDisplay.style.color = "#666";
  usageDisplay.style.marginLeft = "4px";
  usageDisplay.style.alignSelf = "center";
  container.appendChild(usageDisplay);

  (async () => {
    try {
      const usageData = await getUsageData();
      const lang = await getCurrentLanguage();
      usageDisplay.textContent = usageData ? formatUsageDisplay(usageData.plan || "free", usageData.remaining ?? 0, usageData.limit ?? 0, lang) : formatUsageDisplay("free", 0, 0, lang);
    } catch (_) {
      usageDisplay.textContent = formatUsageDisplay("free", 0, 0, await getCurrentLanguage());
    }
  })();

  return container;
}

// Outlook compose areas: contenteditable divs (reply and new message)
function findOutlookComposeEditors() {
  const selectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label*="Message"]',
    'div[contenteditable="true"][aria-label*="Message body"]',
    'div[contenteditable="true"]'
  ];
  const seen = new Set();
  const filtered = [];
  for (const sel of selectors) {
    for (const ed of document.querySelectorAll(sel)) {
      if (!(ed instanceof HTMLElement) || ed.offsetParent === null) continue;
      if (seen.has(ed)) continue;
      if (!isOutlookReplyEditor(ed)) continue;
      if (ed.closest(".replymate-button-wrapper")) continue;
      seen.add(ed);
      filtered.push(ed);
    }
  }
  return filtered;
}

/**
 * Find the toolbar that contains Cancel - so we can append to the right of it.
 * Prefer toolbar with Cancel over toolbar with only Send (Cancel toolbar is the right one).
 */
function findSendCancelToolbar(editor) {
  if (!editor || !(editor instanceof HTMLElement)) return null;
  const doc = editor.ownerDocument || document;

  const discardBtn = findDiscardButton(doc.body);
  if (discardBtn) {
    const footer = discardBtn.closest("div[role='toolbar']") || discardBtn.closest("div[style*='flex']") || discardBtn.closest("div[style*='display']") || discardBtn.parentElement;
    if (footer && !footer.querySelector(".replymate-button-wrapper")) return footer;
  }

  let el = editor;
  for (let i = 0; i < 20 && el; i++) {
    el = el.parentElement;
    if (!el) break;
    const send = Array.from(el.querySelectorAll("[role='button'], button")).find((b) => {
      const t = (b.textContent || "").trim();
      const l = (b.getAttribute("aria-label") || "").toLowerCase();
      return isSendButton(t, l);
    });
    if (send) {
      const row = send.closest("div[role='toolbar']") || send.closest("div[style*='flex']") || send.closest("div[style*='display']") || send.parentElement;
      if (row && !row.querySelector(".replymate-button-wrapper")) return row;
    }
  }
  return null;
}

/** Discard/Cancel - EN, KO, JA, ES. */
const DISCARD_PATTERNS = {
  text: ["취소", "Discard", "Cancel", "キャンセル", "破棄", "Cancelar", "Descartar"],
  label: ["discard", "descartar", "cancel", "취소", "キャンセル", "破棄", "cancelar"]
};

/** Send - EN, KO, JA, ES. */
const SEND_PATTERNS = {
  text: ["보내기", "Send", "送信", "Enviar"],
  label: ["send", "보내기", "送信", "enviar"]
};

function isSendButton(text, label) {
  const t = (text || "").trim();
  const l = (label || "").toLowerCase();
  return SEND_PATTERNS.text.some((p) => t === p) || SEND_PATTERNS.label.some((p) => l.includes(p));
}

function isDiscardButton(text, label) {
  const t = (text || "").trim();
  const l = (label || "").toLowerCase();
  if (isSendButton(t, l)) return false;
  return DISCARD_PATTERNS.text.some((p) => t === p) || DISCARD_PATTERNS.label.some((p) => l.includes(p));
}

/**
 * Find the main Discard/Cancel button - the one in the toolbar, not in dropdowns.
 * Exclude: Send button, inside Send group, inside menu/popover/listbox (dropdown options).
 * Must return the RIGHTMOST discard so we insert AI Reply after it (to the right of Cancel).
 */
function findDiscardButton(searchRoot) {
  if (!searchRoot) return null;
  const all = Array.from(searchRoot.querySelectorAll("[role='button'], button"));
  const discard = all.filter((btn) => {
    const text = (btn.textContent || "").trim();
    const label = (btn.getAttribute("aria-label") || "");
    if (!isDiscardButton(text, label)) return false;
    const inSend = btn.closest("[aria-label*='send'], [aria-label*='Send'], [aria-label*='보내기'], [aria-label*='送信'], [aria-label*='enviar']");
    if (inSend) return false;
    const inMenu = btn.closest("[role='menu'], [role='listbox']");
    if (inMenu) return false;
    if (!(btn instanceof HTMLElement) || btn.offsetParent === null) return false;
    const rect = btn.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    return true;
  });
  if (discard.length === 0) return null;
  if (discard.length === 1) return discard[0];
  discard.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.right - ra.right;
  });
  return discard[0];
}

/**
 * Find toolbar for compose. Prefer inserting after Cancel for consistent order [Send][Cancel][AI Reply].
 * Scopes search to compose root when available to avoid wrong toolbar with multiple composes.
 */
function findOutlookComposeInjectionPoint(editor) {
  if (!editor || !(editor instanceof HTMLElement)) return null;

  const doc = editor.ownerDocument || document;
  const composeRoot = getComposeRootWithSend(editor);
  const searchRoot = composeRoot || doc.body;

  const discardBtn = findDiscardButton(searchRoot);
  if (discardBtn) {
    const footer = discardBtn.closest("div[role='toolbar']") || discardBtn.closest("div[style*='flex']") || discardBtn.parentElement;
    if (footer && !footer.querySelector(".replymate-button-wrapper")) {
      return { container: footer, insertAfter: discardBtn };
    }
  }

  const toolbar = findSendCancelToolbar(editor);
  if (toolbar && !toolbar.querySelector(".replymate-button-wrapper")) return { container: toolbar, insertAfter: null };

  const toolbars = (composeRoot || doc.body).querySelectorAll("div[role='toolbar']");
  for (const t of toolbars) {
    const hasSend = Array.from(t.querySelectorAll("[role='button'], button")).some((b) => isSendButton((b.textContent || "").trim(), b.getAttribute("aria-label") || ""));
    const discard = findDiscardButton(t);
    if ((hasSend || discard) && !t.querySelector(".replymate-button-wrapper")) {
      return { container: t, insertAfter: discard || null };
    }
  }

  return null;
}

/**
 * Get the compose root that contains both editor and Send - for deduplication.
 */
function getComposeRootWithSend(editor) {
  if (!editor) return null;
  let el = editor;
  for (let i = 0; i < 25 && el; i++) {
    el = el.parentElement;
    if (!el) break;
    const hasSend = Array.from(el.querySelectorAll("[role='button'], button")).some((b) => isSendButton((b.textContent || "").trim(), b.getAttribute("aria-label") || ""));
    if (hasSend) return el;
  }
  return editor.closest("div[role='region']") || editor.closest("form") || editor.parentElement;
}

async function injectButtonIntoComposeAreas() {
  const editors = findOutlookComposeEditors();
  const injectedComposeRoots = new Set();

  for (const editor of editors) {
    const composeRoot = getComposeRootWithSend(editor) || editor.closest("div[role='region']") || editor.closest("form") || editor.parentElement?.parentElement;
    if (!composeRoot) continue;
    if (injectedComposeRoots.has(composeRoot)) continue;
    if (composeRoot.querySelector(".replymate-button-wrapper")) {
      injectedComposeRoots.add(composeRoot);
      continue;
    }
    if (composeRoot.dataset.replymateInjecting === "true") continue;

    const point = findOutlookComposeInjectionPoint(editor);
    if (!point || point.container.querySelector(".replymate-button-wrapper")) continue;

    composeRoot.dataset.replymateInjecting = "true";
    try {
      const button = await createReplyMateButton();
      const buttonWrapper = document.createElement("div");
      buttonWrapper.className = "replymate-button-wrapper";
      buttonWrapper.style.cssText = "display:inline-flex;align-items:center;margin-left:8px;margin-right:8px;pointer-events:auto;position:relative;z-index:1;";
      buttonWrapper.appendChild(button);

      injectedComposeRoots.add(composeRoot);
      point.container.style.display = point.container.style.display || "flex";
      point.container.style.alignItems = point.container.style.alignItems || "center";
      point.container.style.flexWrap = point.container.style.flexWrap || "wrap";
      point.container.style.gap = point.container.style.gap || "8px";

      if (point.insertAfter && point.insertAfter.parentNode) {
        point.insertAfter.insertAdjacentElement("afterend", buttonWrapper);
      } else {
        buttonWrapper.style.marginLeft = "auto";
        point.container.appendChild(buttonWrapper);
      }
    } finally {
      delete composeRoot.dataset.replymateInjecting;
    }
  }
}

// --- Hover button (same as Gmail) ---
const REPLYMATE_HOVER_BUTTON_CLASS = "replymate-hover-generate-button";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poll(getValue, { timeoutMs = 8000, intervalMs = 300 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try {
        const value = getValue();
        if (value) {
          resolve(value);
          return;
        }
      } catch (_) {}
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function clickElementLikeUser(element) {
  if (!(element instanceof Element)) return;
  const eventInit = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new MouseEvent("mouseover", eventInit));
  element.dispatchEvent(new MouseEvent("mousedown", eventInit));
  element.dispatchEvent(new MouseEvent("mouseup", eventInit));
  element.dispatchEvent(new MouseEvent("click", eventInit));
}

/**
 * Find the message list row - must contain action icons (envelope, flag, pin, trash).
 * Only return a row that has the action bar; never return subject-only cells.
 * This prevents AI Reply from appearing inline in the subject (like Gmail).
 */
function findOutlookMessageListRow(target) {
  if (!(target instanceof Element)) return null;
  let row = target.closest("div[role='option']") || target.closest("div[role='row']") || target.closest("div[role='listitem']");
  if (!row) return null;

  const hasActionIcons = (el) => findVisibleOutlookActionControls(el).length > 0;

  if (hasActionIcons(row)) return row;
  let parent = row.parentElement;
  while (parent && parent !== document.body) {
    if (hasActionIcons(parent)) return parent;
    const next = parent.closest("div[role='option']") || parent.closest("div[role='row']") || parent.closest("div[role='listitem']");
    if (next && next !== parent) {
      parent = next;
    } else {
      parent = parent.parentElement;
    }
  }
  return null;
}

/**
 * Outlook-specific aria-labels for action icons (mark read, flag, pin, delete).
 * Same as Gmail: find these first for reliable placement.
 */
function findVisibleDefaultOutlookActionControls(row) {
  if (!(row instanceof Element)) return [];
  const labels = [
    "mark as read", "mark as unread", "read", "unread",
    "delete", "flag", "pin", "archive", "move to",
    "읽음으로 표시", "읽지 않음으로 표시", "삭제", "플래그", "고정"
  ];
  return Array.from(row.querySelectorAll("[aria-label]")).filter((el) => {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) return false;
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    const rect = el.getBoundingClientRect();
    const isAction = labels.some((l) => label.includes(l));
    return isAction && rect.width > 0 && rect.width < 100 && rect.height > 0 && rect.height < 80;
  });
}

/**
 * Find action controls (mark unread, flag, pin, delete) - only actual buttons/icons.
 * Exclude subject text and other non-action elements. Same approach as Gmail.
 */
function findVisibleOutlookActionControls(row) {
  if (!(row instanceof Element)) return [];
  const rowRect = row.getBoundingClientRect();
  const actionZoneStart = rowRect.left + rowRect.width * 0.5;
  const candidates = Array.from(row.querySelectorAll("[role='button'], button, span[role='button']"));
  const filtered = candidates.filter((el) => {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) return false;
    if (el.classList.contains(REPLYMATE_HOVER_BUTTON_CLASS)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.width > 100 || rect.height > 70) return false;
    if (rect.right < actionZoneStart) return false;
    const text = (el.textContent || "").trim();
    if (text.length > 25) return false;
    return true;
  });
  if (filtered.length > 0) return filtered;
  const byAriaLabel = findVisibleDefaultOutlookActionControls(row);
  const actionZoneStart45 = rowRect.left + rowRect.width * 0.45;
  return byAriaLabel.filter((el) => el.getBoundingClientRect().right >= actionZoneStart45);
}

function findOutlookReplyButton() {
  const main = document.querySelector("div[role='main']") || document.body;
  const candidates = Array.from(main.querySelectorAll("[role='button'], button, span[role='button']"));
  const replyLike = candidates.filter((el) => {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) return false;
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    const text = (el.textContent || "").trim().toLowerCase();
    return (
      (label.includes("reply") || label.includes("답장") || label.includes("返信") || text === "reply" || text === "답장") &&
      !label.includes("reply all") &&
      !text.includes("reply all")
    );
  });
  if (replyLike.length > 0) {
    replyLike.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return replyLike[0];
  }
  return null;
}

function openOutlookThreadForRow(row) {
  if (!(row instanceof Element)) return;
  const link = row.querySelector("a[href]");
  if (link && link.getAttribute("href") && !link.getAttribute("href").startsWith("mailto:")) {
    link.click();
    return;
  }
  clickElementLikeUser(row);
}

function positionOutlookHoverButton(row, button) {
  const controls = findVisibleOutlookActionControls(row);
  if (controls.length === 0) return false;
  const rowRect = row.getBoundingClientRect();
  const leftmost = controls.reduce((min, el) => {
    const r = el.getBoundingClientRect();
    const minR = min.getBoundingClientRect();
    return r.left < minR.left ? el : min;
  });
  const leftmostRect = leftmost.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();
  const gap = 8;
  let left = leftmostRect.left - rowRect.left - btnRect.width - gap;
  let top = leftmostRect.top - rowRect.top + (leftmostRect.height - btnRect.height) / 2;
  left = Math.max(8, left);
  top = Math.max(4, top);
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  button.style.right = "auto";
  button.style.transform = "none";
  return true;
}

async function runHoverGenerateReplyWorkflow(row, sourceButton) {
  if (!(row instanceof Element)) return;
  if (row.dataset.replymateWorkflowRunning === "1") return;
  row.dataset.replymateWorkflowRunning = "1";

  if (sourceButton) {
    if (sourceButton.dataset.replymateState === "loading") return;
    await setReplyMateButtonState(sourceButton, "loading");
    sourceButton.dataset.replymateGenerating = "1";
  }

  try {
    openOutlookThreadForRow(row);
    await sleep(1000);

    const replyButton = await poll(() => findOutlookReplyButton(), {
      timeoutMs: REPLYMATE_CONFIG.ui.timeouts.replyButton,
      intervalMs: 400
    });

    if (!replyButton) {
      if (sourceButton) {
        await setReplyMateButtonState(sourceButton, "error");
        setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      return;
    }

    replyButton.scrollIntoView({ behavior: "instant", block: "center" });
    await sleep(300);
    clickElementLikeUser(replyButton);

    const replyEditor = await poll(() => findActiveReplyEditor(), {
      timeoutMs: REPLYMATE_CONFIG.ui.timeouts.replyEditor,
      intervalMs: 300
    });

    if (!replyEditor) {
      if (sourceButton) {
        await setReplyMateButtonState(sourceButton, "error");
        setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      return;
    }

    const settings = await loadReplyMateSettings();
    const threadContext = extractThreadContext();
    const lang = await getCurrentLanguage();

    if (!threadContext.latestMessage) {
      if (sourceButton) {
        await setReplyMateButtonState(sourceButton, "error");
        setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      return;
    }

    const payload = {
      subject: threadContext.subject || "",
      latestMessage: threadContext.latestMessage || "",
      previousMessages: (threadContext.previousMessages || []).map((m) => ({ text: m.text, speakerName: m.senderName || "Other" })),
      recipientName: threadContext.recipientName || "",
      userName: settings.userName || threadContext.inferredUserName || "",
      tone: settings.tone || DEFAULT_TONE,
      length: settings.length || DEFAULT_LENGTH,
      lengthInstruction: buildLengthInstructionWithAuto(settings.length || DEFAULT_LENGTH, lang),
      language: lang
    };
    payload.lengthInstruction = `Tone: ${payload.tone}\nLength: ${payload.length}\n\n${payload.lengthInstruction}`;

    replyEditor.focus();
    replyEditor.innerHTML = "";

    const hideUI = () => document.querySelectorAll(".replymate-ui-container").forEach((el) => { el.style.display = "none"; });
    const showUI = () => document.querySelectorAll(".replymate-ui-container").forEach((el) => { el.style.display = "inline-flex"; });

    const replyData = await generateAIReplyStreaming(payload, replyEditor, { onFirstChunk: hideUI, onComplete: showUI });
    showUI();

    if (!replyData) {
      if (sourceButton) {
        await setReplyMateButtonState(sourceButton, "error");
        setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      return;
    }

    await insertReplyIntoEditor(replyEditor, replyData.reply);
    if (sourceButton) await setReplyMateButtonState(sourceButton, "idle");
    if (replyData.usage) await updateUsageDisplayFromData(replyData.usage);
  } catch (err) {
    console.error("[ReplyMate Outlook] Hover workflow error:", err);
    if (sourceButton) {
      await setReplyMateButtonState(sourceButton, "error");
      setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
    }
  } finally {
    row.dataset.replymateWorkflowRunning = "0";
    if (sourceButton) delete sourceButton.dataset.replymateGenerating;
  }
}

async function createHoverGenerateButton(row) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = REPLYMATE_HOVER_BUTTON_CLASS;
  button.style.padding = "4px 10px";
  button.style.border = "none";
  button.style.borderRadius = "4px";
  button.style.cursor = "pointer";
  button.style.fontSize = "11px";
  button.style.fontWeight = "500";
  button.style.height = "28px";
  button.style.whiteSpace = "nowrap";
  paintReplyMateAiButton(button, "idle");

  attachReplyMateButtonHoverStyles(button);
  await setReplyMateButtonState(button, "idle");

  requestAnimationFrame(() => {
    try {
      window.ReplyMatePopupThemeButton?.refreshAllButtons?.();
    } catch (_) {}
  });
  setTimeout(() => {
    try {
      window.ReplyMatePopupThemeButton?.refreshAllButtons?.();
    } catch (_) {}
  }, 400);

  button.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (button.dataset.replymateState === "loading") return;

    try {
      const token = await getAccessToken();
      if (!token) {
        await showReplyMateMessage(getTranslation("signInRequired", await getCurrentLanguage()));
        try { chrome.runtime.sendMessage({ type: "OPEN_POPUP_FOR_LOGIN" }); } catch (_) {}
        await setReplyMateButtonState(button, "error");
        setTimeout(() => setReplyMateButtonState(button, "idle"), 3000);
        return;
      }
    } catch (err) {
      await showReplyMateMessage("⚠️ " + (err?.message?.includes("Extension context invalidated") ? getTranslation("extensionContextInvalidated", await getCurrentLanguage()) : getTranslation("signInRequired", await getCurrentLanguage())));
      await setReplyMateButtonState(button, "error");
      setTimeout(() => setReplyMateButtonState(button, "idle"), 3000);
      return;
    }

    try {
      const usageRes = await fetch(`${REPLYMATE_CONFIG.backend.baseUrl}${REPLYMATE_CONFIG.backend.endpoints.usage}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (usageRes.ok) {
        const usage = await usageRes.json();
        const total = (usage.remaining ?? 0) + (usage.topupRemaining ?? 0);
        if (total <= 0) {
          await showReplyMateMessage(getTranslation("replyLimitReached", await getCurrentLanguage()));
          await setReplyMateButtonState(button, "error");
          setTimeout(() => setReplyMateButtonState(button, "idle"), 2000);
          return;
        }
      }
    } catch (_) {}

    runHoverGenerateReplyWorkflow(row, button);
  });

  return button;
}

function showHoverButtonForRow(row) {
  if (!(row instanceof Element)) return;
  if (row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`)) return;

  createHoverGenerateButton(row).then((button) => {
    const computed = window.getComputedStyle(row);
    if (computed.position === "static") row.style.position = "relative";
    button.style.cssText = "position:absolute;visibility:hidden;z-index:9999;";
    row.appendChild(button);

    let attempts = 0;
    const tryPlace = () => {
      if (!document.body.contains(button)) return;
      if (positionOutlookHoverButton(row, button)) {
        button.style.visibility = "visible";
        return;
      }
      attempts++;
      if (attempts < 16) setTimeout(tryPlace, 50);
      else {
        button.style.right = "24px";
        button.style.top = "50%";
        button.style.left = "auto";
        button.style.transform = "translateY(-50%)";
        button.style.visibility = "visible";
      }
    };
    tryPlace();
  });
}

function hideHoverButtonForRow(row) {
  if (!(row instanceof Element)) return;
  const existing = row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`);
  if (!existing) return;
  if (row.dataset.replymateWorkflowRunning === "1" || existing.dataset.replymateGenerating === "1") return;
  if (document.activeElement?.classList?.contains("replymate-instruction-input")) return;
  existing.remove();
}

function setupMessageListHoverHandlers() {
  if (window.__replymateOutlookHoverHandlersInstalled) return;
  window.__replymateOutlookHoverHandlersInstalled = true;

  document.addEventListener(
    "mouseover",
    (event) => {
      const row = findOutlookMessageListRow(event.target);
      if (!row) return;
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;
      showHoverButtonForRow(row);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const row = findOutlookMessageListRow(event.target);
      if (!row) return;
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;
      hideHoverButtonForRow(row);
    },
    true
  );
}

// Expose for translation.js
if (typeof window !== "undefined") {
  window.extractThreadContext = extractThreadContext;
  window.findActiveReplyEditor = findActiveReplyEditor;
  window.detectLanguage = function (text) {
    if (!text || typeof text !== "string") return "english";
    if (/[가-힣]/.test(text)) return "korean";
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "japanese";
    if (/[\u4e00-\u9fff]/.test(text)) return "chinese";
    if (/[ñáéíóúü]/.test(text.toLowerCase()) || /\b(gracias|por favor|hola)\b/i.test(text)) return "spanish";
    return "english";
  };
}

const observer = new MutationObserver(async () => {
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("replymate-instruction-input")) return;
  await injectButtonIntoComposeAreas();
});

observer.observe(document.body, { childList: true, subtree: true });

injectButtonIntoComposeAreas();
