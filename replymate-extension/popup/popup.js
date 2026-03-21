const TONE_KEY = "replymateTone";
const LENGTH_KEY = "replymateLength";
const USER_NAME_KEY = "replymateUserName";
const LANGUAGE_KEY = "replymateLanguage";
const TRANSLATION_ENABLED_KEY = "replymate_translation_enabled";
const POPUP_THEME_KEY = "replymate_popup_theme";
/** Floating translate panel theme — independent from popup settings (`replymate_popup_theme`). */
const TRANSLATION_PANEL_THEME_KEY = "replymate_translation_panel_theme";
/**
 * Popup look is user-controlled only (color wheel). We do not read prefers-color-scheme
 * or OS light/dark — new installs / missing key always start at DEFAULT_POPUP_THEME.
 * Order: basic → light → sepia → rose → slate → dark → basic-dark (color wheel). Persisted immediately on change.
 */
const DEFAULT_POPUP_THEME = "basic";
const POPUP_THEME_IDS = [DEFAULT_POPUP_THEME, "light", "sepia", "rose", "slate", "dark", "basic-dark"];
/** Synced in applyPopupTheme — lets popup.html head script paint the right theme before async storage. */
const POPUP_THEME_SESSION_KEY = "replymate_popup_theme_cache";
const USAGE_CACHE_KEY = "replymate_usage_cache";
const USAGE_CACHE_TTL = 30000; // 30 seconds

const DEFAULT_TONE = "auto";
const DEFAULT_LENGTH = "auto";
const DEFAULT_LANGUAGE = "english";

// Language translations
const TRANSLATIONS = {
  english: {
    settings: "ReplyMate Settings",
    settingsLabel: "Settings",
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
    manageSubscription: "Manage Subscription",
    planNames: {
      free: "Free",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "replies left",
    cancelSubscription: "Cancel Subscription",
    keepSubscription: "Keep subscription",
    reactivating: "Reactivating...",
    reactivateSuccess: "Subscription reactivated. Your plan will continue to renew.",
    reactivateError: "Failed to reactivate subscription.",
    cancelConfirmMessage: "Are you sure you want to cancel your subscription? You will still be able to use ReplyMate until the end of your current billing period.",
    cancelSuccessMessage: "Subscription cancelled. You can continue using ReplyMate for {days} more days.",
    cancelError: "Failed to cancel subscription.",
    currentPlan: "Current Plan: ",
    renewsOn: "Renews on {date}",
    resetsOn: "Resets on {date}",
    activeUntil: "Active until {date}",
    cancelledActiveUntil: "Cancelled — active until {date}",
    planCancelled: "Plan Cancelled",
    signingIn: "Signing in...",
    cancelling: "Cancelling...",
    authErrorGeneric: "An error occurred during sign in. Please try again.",
    unableToExtractContent: "Unable to extract email content. Please try refreshing the page.",
    signInWithGoogle: "Sign in with Google",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signInRequired: "⚠️ Sign in with Google to use ReplyMate.",
    topUpReplies: "Top up replies",
    topup100: "+100",
    topup500: "+500",
    topupCredits: "Top-up credits: {count}",
    privacyPolicy: "Privacy Policy",
    support: "Support",
    reportIssue: "Report issue",
    giveFeedback: "Give feedback",
    enquiry: "Enquiry",
    reportIssueTitle: "Report Issue",
    reportIssuePlaceholder: "Please describe the issue you faced.",
    giveFeedbackTitle: "Provide Feedback",
    giveFeedbackPlaceholder: "Your feedback will help in improving the product.",
    enquiryTitle: "Submit Enquiry",
    enquiryMessage: "Write to us at",
    copyEmail: "Copy Email",
    submit: "Submit",
    copied: "Copied!",
    replyMateTranslate: "ReplyMate Translate",
    colorThemeProOnly:
      "Color themes are a Pro feature. Upgrade to Pro or Pro+ to unlock custom looks—in settings, the translation panel, and AI Reply buttons.",
    colorThemePlanCheckFailed: "Could not verify your plan. Check your connection and try again.",
    colorThemeUpgradePrompt: "Unlock Pro/Pro+",
    colorThemeToastPlanCheck: "We couldn’t verify your plan. Check your connection and try again.",
  },
  korean: {
    settings: "ReplyMate 설정",
    settingsLabel: "설정",
    replyTone: "답장 톤",
    replyLength: "답장 길이",
    yourName: "사용자 이름",
    language: "언어",
    save: "저장",
    saved: "저장됨!",
    loading: "로딩 중...",
    usageUnavailable: "사용량 정보 없음",
    upgradeMore: "Pro로 더 많은 답장 잠금 해제",
    upgradeUnlimited: "Pro+로 무제한 답장 잠금 해제",
    enjoyReplyMate: "ReplyMate를 즐겨보세요!",
    upgradeToPro: "Pro로 업그레이드",
    upgradeToProPlus: "Pro+로 업그레이드",
    manageSubscription: "구독 관리",
    planNames: {
      free: "Free",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "답장 남음",
    cancelSubscription: "구독 취소",
    keepSubscription: "구독 유지",
    reactivating: "복원 중...",
    reactivateSuccess: "구독이 복원되었습니다. 플랜이 계속 갱신됩니다.",
    reactivateError: "구독 복원에 실패했습니다.",
    cancelConfirmMessage: "구독을 취소하시겠습니까? 현재 결제 기간이 끝날 때까지 ReplyMate를 계속 사용할 수 있습니다.",
    cancelSuccessMessage: "구독이 취소되었습니다. ReplyMate를 {days}일 더 사용할 수 있습니다.",
    cancelError: "구독 취소에 실패했습니다.",
    currentPlan: "현재 플랜: ",
    renewsOn: "다음 갱신일: {date}",
    resetsOn: "리셋일: {date}",
    activeUntil: "{date}까지 사용 가능",
    cancelledActiveUntil: "취소됨 — {date}까지 활성",
    planCancelled: "플랜 취소됨",
    signingIn: "로그인 중...",
    cancelling: "취소 중...",
    authErrorGeneric: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
    unableToExtractContent: "이메일 내용을 추출할 수 없습니다. 페이지를 새로고침해 주세요.",
    signInWithGoogle: "Google로 로그인",
    signedInAs: "로그인됨",
    signOut: "로그아웃",
    signInRequired: "⚠️ ReplyMate를 사용하려면 Google로 로그인해 주세요.",
    topUpReplies: "답장 충전",
    topupCredits: "충전 크레딧: {count}",
    privacyPolicy: "개인정보 처리방침",
    support: "지원",
    reportIssue: "문제 신고",
    giveFeedback: "피드백 보내기",
    enquiry: "문의",
    reportIssueTitle: "문제 신고",
    reportIssuePlaceholder: "발생한 문제를 설명해 주세요.",
    giveFeedbackTitle: "피드백 제공",
    giveFeedbackPlaceholder: "피드백은 제품 개선에 도움이 됩니다.",
    enquiryTitle: "문의하기",
    enquiryMessage: "다음 주소로 연락해 주세요",
    copyEmail: "이메일 복사",
    submit: "제출",
    copied: "복사됨!",
    replyMateTranslate: "ReplyMate 번역",
    colorThemeProOnly:
      "색 테마는 Pro 전용 기능입니다. Pro 또는 Pro+로 업그레이드하면 설정, 번역 패널, AI 답장 버튼 등에서 맞춤 색상을 사용할 수 있습니다.",
    colorThemePlanCheckFailed: "플랜을 확인할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    colorThemeUpgradePrompt: "Pro·Pro+ 잠금 해제",
    colorThemeToastPlanCheck: "플랜을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
  },
  japanese: {
    settings: "ReplyMate 設定",
    settingsLabel: "設定",
    replyTone: "返信のトーン",
    replyLength: "返信の長さ",
    yourName: "表示名",
    language: "言語",
    save: "保存",
    saved: "保存完了",
    loading: "読み込み中...",
    usageUnavailable: "使用量を取得できません",
    upgradeMore: "Proでより多くの返信をアンロック",
    upgradeUnlimited: "Pro+で無制限の返信をアンロック",
    enjoyReplyMate: "ReplyMateをお楽しみください！",
    upgradeToPro: "Proにアップグレード",
    upgradeToProPlus: "Pro+にアップグレード",
    manageSubscription: "サブスクリプション管理",
    planNames: {
      free: "Free",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "残りの返信数",
    cancelSubscription: "サブスクリプションをキャンセル",
    keepSubscription: "サブスクリプションを継続",
    reactivating: "復元中...",
    reactivateSuccess: "サブスクリプションが復元されました。プランは引き続き更新されます。",
    reactivateError: "サブスクリプションの復元に失敗しました。",
    cancelConfirmMessage: "サブスクリプションをキャンセルしますか？現在の請求期間が終わるまでReplyMateをご利用いただけます。",
    cancelSuccessMessage: "サブスクリプションがキャンセルされました。あと{days}日間ReplyMateをご利用いただけます。",
    cancelError: "キャンセルに失敗しました。",
    currentPlan: "現在のプラン: ",
    renewsOn: "更新日: {date}",
    resetsOn: "リセット日: {date}",
    activeUntil: "{date}まで利用可能",
    cancelledActiveUntil: "キャンセル済み — {date}まで有効",
    planCancelled: "プランキャンセル",
    signingIn: "サインイン中...",
    cancelling: "キャンセル処理中...",
    authErrorGeneric: "サインイン中にエラーが発生しました。もう一度お試しください。",
    unableToExtractContent: "メールの内容を取得できません。ページを更新してください。",
    signInWithGoogle: "Googleでサインイン",
    signedInAs: "ログイン中",
    signOut: "サインアウト",
    signInRequired: "⚠️ ReplyMateをご利用いただくには、Googleでログインしてください。",
    topUpReplies: "返信を追加",
    topupCredits: "追加クレジット: {count}",
    privacyPolicy: "プライバシーポリシー",
    support: "サポート",
    reportIssue: "問題を報告",
    giveFeedback: "フィードバックを送る",
    enquiry: "お問い合わせ",
    reportIssueTitle: "問題を報告",
    reportIssuePlaceholder: "発生した問題を説明してください。",
    giveFeedbackTitle: "フィードバックを提供",
    giveFeedbackPlaceholder: "フィードバックは製品の改善に役立ちます。",
    enquiryTitle: "お問い合わせ",
    enquiryMessage: "以下のメールアドレスまでご連絡ください",
    copyEmail: "メールをコピー",
    submit: "送信",
    copied: "コピーしました！",
    replyMateTranslate: "ReplyMate 翻訳",
    colorThemeProOnly:
      "カラーテーマはPro向けの機能です。ProまたはPro+にアップグレードすると、設定・翻訳パネル・AI返信ボタンなどでカスタム配色が使えます。",
    colorThemePlanCheckFailed: "プランを確認できませんでした。接続を確認してもう一度お試しください。",
    colorThemeUpgradePrompt: "Pro／Pro+解除",
    colorThemeToastPlanCheck: "プランを確認できませんでした。接続を確認して再度お試しください。",
  },
  spanish: {
    settings: "Configuración de ReplyMate",
    settingsLabel: "Configuración",
    replyTone: "Tono de respuesta",
    replyLength: "Longitud de respuesta",
    yourName: "Tu nombre",
    language: "Idioma",
    save: "Guardar",
    saved: "¡Guardado!",
    loading: "Cargando...",
    usageUnavailable: "Uso no disponible",
    upgradeMore: "Desbloquea más respuestas con Pro",
    upgradeUnlimited: "Desbloquea respuestas ilimitadas con Pro+",
    enjoyReplyMate: "¡Disfruta tu ReplyMate!",
    upgradeToPro: "Actualizar a Pro",
    upgradeToProPlus: "Actualizar a Pro+",
    manageSubscription: "Administrar suscripción",
    planNames: {
      free: "Free",
      pro: "Pro",
      pro_plus: "Pro+"
    },
    repliesLeft: "respuestas restantes",
    cancelSubscription: "Cancelar suscripción",
    keepSubscription: "Mantener suscripción",
    reactivating: "Reactivando...",
    reactivateSuccess: "Suscripción reactivada. Tu plan continuará renovándose.",
    reactivateError: "Error al reactivar la suscripción.",
    cancelConfirmMessage: "¿Estás seguro de que deseas cancelar tu suscripción? Podrás seguir usando ReplyMate hasta el final de tu período de facturación actual.",
    cancelSuccessMessage: "Suscripción cancelada. Puedes seguir usando ReplyMate durante {days} días más.",
    cancelError: "Error al cancelar la suscripción.",
    currentPlan: "Plan actual: ",
    renewsOn: "Renueva el {date}",
    resetsOn: "Se reinicia el {date}",
    activeUntil: "Activo hasta el {date}",
    cancelledActiveUntil: "Cancelado — activo hasta el {date}",
    planCancelled: "Plan cancelado",
    signingIn: "Iniciando sesión...",
    cancelling: "Cancelando...",
    authErrorGeneric: "Ocurrió un error al iniciar sesión. Por favor, inténtalo de nuevo.",
    unableToExtractContent: "No se puede extraer el contenido del correo. Por favor, actualiza la página.",
    signInWithGoogle: "Iniciar sesión con Google",
    signedInAs: "Conectado como",
    signOut: "Cerrar sesión",
    signInRequired: "⚠️ Inicia sesión con Google para usar ReplyMate.",
    topUpReplies: "Añadir respuestas",
    topupCredits: "Créditos adicionales: {count}",
    privacyPolicy: "Política de Privacidad",
    support: "Soporte",
    reportIssue: "Reportar problema",
    giveFeedback: "Enviar comentarios",
    enquiry: "Consulta",
    reportIssueTitle: "Reportar problema",
    reportIssuePlaceholder: "Por favor describe el problema que encontraste.",
    giveFeedbackTitle: "Proporcionar comentarios",
    giveFeedbackPlaceholder: "Tus comentarios ayudarán a mejorar el producto.",
    enquiryTitle: "Enviar consulta",
    enquiryMessage: "Escríbenos a",
    copyEmail: "Copiar correo",
    submit: "Enviar",
    copied: "¡Copiado!",
    replyMateTranslate: "ReplyMate Traducir",
    colorThemeProOnly:
      "Los temas de color son una función Pro. Mejora a Pro o Pro+ para desbloquear apariencias personalizadas en ajustes, el panel de traducción y los botones de respuesta con IA.",
    colorThemePlanCheckFailed: "No se pudo verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
    colorThemeUpgradePrompt: "Desbloquea Pro/Pro+",
    colorThemeToastPlanCheck: "No pudimos verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
  }
};

function normalizePopupTheme(theme) {
  return POPUP_THEME_IDS.includes(theme) ? theme : DEFAULT_POPUP_THEME;
}

/** Pro and Pro+ can use color-wheel themes; Free (and logged-out) stay on basic unless upgrading. */
function planAllowsPremiumColorThemes(plan) {
  return plan === "pro" || plan === "pro_plus";
}

/**
 * If the user is not on Pro/Pro+, reset both popup and translation panel themes to basic.
 * Call when usage indicates free/downgrade, or when logged out (pass plan "free").
 */
function enforceColorThemesForPlan(plan) {
  return new Promise((resolve) => {
    if (planAllowsPremiumColorThemes(plan)) {
      resolve();
      return;
    }
    chrome.storage.local.get([POPUP_THEME_KEY, TRANSLATION_PANEL_THEME_KEY], (r) => {
      if (chrome.runtime?.lastError) {
        resolve();
        return;
      }
      const pt = normalizePopupTheme(r[POPUP_THEME_KEY]);
      const tt = normalizePopupTheme(r[TRANSLATION_PANEL_THEME_KEY]);
      if (pt === DEFAULT_POPUP_THEME && tt === DEFAULT_POPUP_THEME) {
        resolve();
        return;
      }
      chrome.storage.local.set(
        {
          [POPUP_THEME_KEY]: DEFAULT_POPUP_THEME,
          [TRANSLATION_PANEL_THEME_KEY]: DEFAULT_POPUP_THEME,
        },
        () => {
          applyPopupTheme(DEFAULT_POPUP_THEME);
          resolve();
        }
      );
    });
  });
}

/** Apply settings popup theme (see POPUP_THEME_IDS). */
function applyPopupTheme(theme) {
  const t = normalizePopupTheme(theme);
  document.documentElement.setAttribute("data-theme", t);
  try {
    sessionStorage.setItem(POPUP_THEME_SESSION_KEY, t);
  } catch (_) {
    /* ignore */
  }
}

/** Save popup theme only (floating translate uses `TRANSLATION_PANEL_THEME_KEY` separately). */
function persistPopupTheme(theme) {
  const t = normalizePopupTheme(theme);
  applyPopupTheme(t);
  chrome.storage.local.set({
    [POPUP_THEME_KEY]: t,
  });
}

function hideThemeProToast() {
  const root = document.getElementById("themeProToast");
  if (!root) return;
  document.documentElement.classList.remove("theme-pro-toast-open");
  document.body.style.minWidth = "";
  root.classList.remove("theme-pro-toast--visible");
  setTimeout(() => {
    root.hidden = true;
    root.style.left = "";
    root.style.top = "";
    root.style.right = "";
    root.style.bottom = "";
  }, 280);
  if (window.__themeProToastTimer) {
    clearTimeout(window.__themeProToastTimer);
    window.__themeProToastTimer = null;
  }
  if (window.__themeProToastReposition) {
    window.removeEventListener("resize", window.__themeProToastReposition);
    window.__themeProToastReposition = null;
  }
}

/** Place toast just under the header color wheel (right-aligned with wheel). */
function positionThemeProToastNearColorWheel() {
  const root = document.getElementById("themeProToast");
  const anchor = document.getElementById("themeToggleBtn");
  if (!root || !anchor || root.hidden) return;
  const ar = anchor.getBoundingClientRect();
  const gap = 6;
  const margin = 6;
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  let left = ar.right - w;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
  let top = ar.bottom + gap;
  if (top + h > window.innerHeight - margin) {
    top = Math.max(margin, ar.top - gap - h);
  }
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

function showThemeProToast(message) {
  const root = document.getElementById("themeProToast");
  const textEl = document.getElementById("themeProToastText");
  if (!root || !textEl) return;
  textEl.textContent = message;
  document.documentElement.classList.add("theme-pro-toast-open");
  root.hidden = false;
  document.body.style.minWidth = "";
  if (window.__themeProToastReposition) {
    window.removeEventListener("resize", window.__themeProToastReposition);
  }
  window.__themeProToastReposition = () => {
    if (!root.hidden && root.classList.contains("theme-pro-toast--visible")) {
      positionThemeProToastNearColorWheel();
      const w = root.offsetWidth;
      const pad = 16;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      document.body.style.minWidth = w + pad > vw ? `${Math.ceil(w + pad)}px` : "";
    }
  };
  window.addEventListener("resize", window.__themeProToastReposition);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionThemeProToastNearColorWheel();
      root.classList.add("theme-pro-toast--visible");
      setTimeout(() => {
        positionThemeProToastNearColorWheel();
        const w = root.offsetWidth;
        const pad = 16;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        if (w + pad > vw) {
          document.body.style.minWidth = `${Math.ceil(w + pad)}px`;
        }
      }, 40);
    });
  });
  if (window.__themeProToastTimer) clearTimeout(window.__themeProToastTimer);
  window.__themeProToastTimer = setTimeout(hideThemeProToast, 5500);
}

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
  const planName = planTranslations[usageData.plan] || planTranslations.free || "Free";
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
function updateUpgradeLink(plan, language = DEFAULT_LANGUAGE, cancelScheduled = false, periodEndDate = null, nextResetAt = null, topupRemaining = 0) {
  const manageLink = document.getElementById("manageSubscriptionLink");
  const upgradeTitle = document.querySelector(".upgrade-title");
  const upgradeBox = document.querySelector(".upgrade-box");
  const upgradeButtons = document.querySelector(".upgrade-buttons");
  const cancelSection = document.getElementById("cancelSection");
  const cancelLink = document.getElementById("cancelSubscriptionLink");
  const keepLink = document.getElementById("keepSubscriptionLink");
  const renewalDateEl = document.getElementById("renewalDate");
  const planExpiryEl = document.getElementById("planExpiry");
  const topupAvailableEl = document.getElementById("topupAvailable");
  const topupSection = document.getElementById("topupSection");
  const topupLabel = topupSection?.querySelector(".topup-label");
  
  if (!manageLink || !upgradeBox || !upgradeButtons) return;

  const locale = language === "korean" ? "ko-KR" : language === "japanese" ? "ja-JP" : language === "spanish" ? "es-ES" : "en-US";

  // Plan expiry / reset date: show for all plans (Pro/Pro+ renews; Free resets)
  // When cancelled: show "Active until {date}" instead of "Renews on"
  if (planExpiryEl) {
    let dateToShow = null;
    let textKey = null;
    if (plan === "pro" || plan === "pro_plus") {
      dateToShow = cancelScheduled && periodEndDate ? periodEndDate : nextResetAt;
      textKey = cancelScheduled ? "cancelledActiveUntil" : "renewsOn";
    } else if (plan === "free" && nextResetAt) {
      dateToShow = nextResetAt;
      textKey = "resetsOn";
    }
    if (textKey) {
      planExpiryEl.textContent = dateToShow
        ? getTranslation(textKey, language).replace("{date}", new Date(dateToShow).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }))
        : getTranslation(textKey, language);
      planExpiryEl.style.display = "block";
    } else {
      planExpiryEl.style.display = "none";
    }
  }

  // Renewal date (inside upgrade box): hide - we now show plan expiry in planExpiry div above
  if (renewalDateEl) renewalDateEl.style.display = "none";

  // Top-up available: show when user has top-up credits
  if (topupAvailableEl) {
    if (topupRemaining > 0) {
      topupAvailableEl.textContent = getTranslation("topupCredits", language).replace("{count}", topupRemaining);
      topupAvailableEl.style.display = "block";
    } else {
      topupAvailableEl.style.display = "none";
    }
  }

  // Top-up section label
  if (topupLabel) {
    topupLabel.textContent = getTranslation("topUpReplies", language);
  }

  // Cancel section: always hidden - subscription management is via webpage only
  if (cancelSection) cancelSection.style.display = "none";

  console.log(`[ReplyMate] Rendering billing UI for plan: ${plan}`);

  // Always show Manage Subscription button (opens upgrade page)
  if (upgradeTitle) upgradeTitle.style.display = "none";
  manageLink.textContent = getTranslation("manageSubscription", language);
  manageLink.style.display = "block";
  upgradeButtons.style.display = "flex";
  if (upgradeBox) {
    upgradeBox.style.background = "";
    upgradeBox.style.border = "";
    upgradeBox.style.color = "";
    upgradeBox.style.boxShadow = "";
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
  const translateToggleLabel = document.getElementById("translateToggleLabel");
  if (translateToggleLabel) translateToggleLabel.textContent = getTranslation("replyMateTranslate", uiLanguage);
  document.getElementById("saveButton").textContent = getTranslation("save", uiLanguage);
  const headerTitle = document.querySelector(".header-title");
  if (headerTitle) {
    headerTitle.innerHTML = "";
    const brand = document.createElement("span");
    brand.className = "header-brand";
    brand.textContent = "ReplyMate";
    const settings = document.createElement("span");
    settings.className = "header-settings";
    settings.textContent = getTranslation("settingsLabel", uiLanguage);
    const space = document.createTextNode(" ");
    if (uiLanguage === "spanish") {
      headerTitle.appendChild(settings);
      headerTitle.appendChild(space);
      headerTitle.appendChild(brand);
    } else {
      headerTitle.appendChild(brand);
      headerTitle.appendChild(space);
      headerTitle.appendChild(settings);
    }
  }
  const topupLabelEl = document.querySelector(".topup-label");
  if (topupLabelEl) topupLabelEl.textContent = getTranslation("topUpReplies", uiLanguage);
  const privacyPolicyLink = document.getElementById("privacyPolicyLink");
  if (privacyPolicyLink) privacyPolicyLink.textContent = getTranslation("privacyPolicy", uiLanguage);
  
  // Update placeholders
  document.getElementById("userNameInput").placeholder = getTranslation("yourName", uiLanguage);

  // Support dropdown and modal labels
  const supportTrigger = document.getElementById("supportTrigger");
  if (supportTrigger) supportTrigger.textContent = getTranslation("support", uiLanguage);
  const supportReportLabel = document.getElementById("supportReportLabel");
  if (supportReportLabel) supportReportLabel.textContent = getTranslation("reportIssue", uiLanguage);
  const supportFeedbackLabel = document.getElementById("supportFeedbackLabel");
  if (supportFeedbackLabel) supportFeedbackLabel.textContent = getTranslation("giveFeedback", uiLanguage);
  const supportEnquiryLabel = document.getElementById("supportEnquiryLabel");
  if (supportEnquiryLabel) supportEnquiryLabel.textContent = getTranslation("enquiry", uiLanguage);
  const modalReportTitle = document.getElementById("modalReportTitle");
  if (modalReportTitle) modalReportTitle.textContent = getTranslation("reportIssueTitle", uiLanguage);
  const reportText = document.getElementById("reportText");
  if (reportText) reportText.placeholder = getTranslation("reportIssuePlaceholder", uiLanguage);
  const modalFeedbackTitle = document.getElementById("modalFeedbackTitle");
  if (modalFeedbackTitle) modalFeedbackTitle.textContent = getTranslation("giveFeedbackTitle", uiLanguage);
  const feedbackText = document.getElementById("feedbackText");
  if (feedbackText) feedbackText.placeholder = getTranslation("giveFeedbackPlaceholder", uiLanguage);
  const modalEnquiryTitle = document.getElementById("modalEnquiryTitle");
  if (modalEnquiryTitle) modalEnquiryTitle.textContent = getTranslation("enquiryTitle", uiLanguage);
  const enquiryMessage = document.getElementById("enquiryMessage");
  if (enquiryMessage) enquiryMessage.textContent = getTranslation("enquiryMessage", uiLanguage) + " ";
  const copyEmailLabel = document.getElementById("copyEmailLabel");
  if (copyEmailLabel) copyEmailLabel.textContent = getTranslation("copyEmail", uiLanguage);
  const reportSubmit = document.getElementById("reportSubmit");
  if (reportSubmit) reportSubmit.textContent = getTranslation("submit", uiLanguage);
  const feedbackSubmit = document.getElementById("feedbackSubmit");
  if (feedbackSubmit) feedbackSubmit.textContent = getTranslation("submit", uiLanguage);
  
  // Update option labels for tone and length
  const toneLabels = { korean: { auto: "자동 (추천)", professional: "전문적인", polite: "정중한", friendly: "친근한", direct: "직설적인" }, japanese: { auto: "自動（推奨）", professional: "ビジネス用に", polite: "丁寧に", friendly: "カジュアルに", direct: "簡潔に" }, spanish: { auto: "Automático (recomendado)", professional: "Profesional", polite: "Educado", friendly: "Amigable", direct: "Directo" } };
  const toneOptions = {
    auto: toneLabels[uiLanguage]?.auto || "Auto (recommended)",
    professional: toneLabels[uiLanguage]?.professional || "Professional",
    polite: toneLabels[uiLanguage]?.polite || "Polite",
    friendly: toneLabels[uiLanguage]?.friendly || "Friendly",
    direct: toneLabels[uiLanguage]?.direct || "Direct"
  };
  
  const lengthLabels = { korean: { auto: "자동 (추천)", short: "짧음", medium: "보통", long: "김" }, japanese: { auto: "自動（推奨）", short: "短め", medium: "普通", long: "長め" }, spanish: { auto: "Automático (recomendado)", short: "Corto", medium: "Medio", long: "Largo" } };
  const lengthOptions = {
    auto: lengthLabels[uiLanguage]?.auto || "Auto (recommended)",
    short: lengthLabels[uiLanguage]?.short || "Short",
    medium: lengthLabels[uiLanguage]?.medium || "Medium",
    long: lengthLabels[uiLanguage]?.long || "Long"
  };
  
  // Update language select options with native language names
  const languageSelect = document.getElementById("languageSelect");
  if (languageSelect) {
    languageSelect.innerHTML = "";
    const languageOptions = [
      { value: "english", label: "English" },
      { value: "korean", label: "한국어" },
      { value: "japanese", label: "日本語" },
      { value: "spanish", label: "Español" }
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

// Refresh login UI when auth syncs from website (e.g. user logged in on homepage)
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.replymate_supabase_session || changes.replymate_auth_user) {
      chrome.storage.local.get([LANGUAGE_KEY], (r) => {
        updateLoginUI(r[LANGUAGE_KEY] || DEFAULT_LANGUAGE);
      });
    }
  });
}

// Listen for usage updates from Gmail content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "USAGE_UPDATED" && message.data) {
    chrome.storage.local.get([LANGUAGE_KEY], async (result) => {
      const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
      updatePlanUsageDisplay(message.data, language);
      updateUpgradeLink(message.data.plan, language, message.data.cancelScheduled, message.data.periodEndDate, message.data.nextResetAt, message.data.topupRemaining ?? 0);
      await enforceColorThemesForPlan(message.data.plan);
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

  const topupSection = document.getElementById("topupSection");
  if (isSignedIn) {
    notSignedIn.style.display = "none";
    signedIn.style.display = "block";
    if (signedInEmail) signedInEmail.textContent = getTranslation("signedInAs", language) + " " + (email || "");
    if (signOutBtn) signOutBtn.textContent = getTranslation("signOut", language);
    if (planUsageEl) planUsageEl.style.display = "";
    if (upgradeBox) upgradeBox.style.display = "";
    if (topupSection) topupSection.style.display = "";
    if (cancelSection) cancelSection.style.display = "none";
  } else {
    notSignedIn.style.display = "block";
    signedIn.style.display = "none";
    if (signInBtn) {
      const textEl = signInBtn.querySelector(".gsi-material-button-contents");
      if (textEl) textEl.textContent = getTranslation("signInWithGoogle", language);
    }
    if (planUsageEl) planUsageEl.style.display = "none";
    if (upgradeBox) upgradeBox.style.display = "none";
    if (topupSection) topupSection.style.display = "none";
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
  if (!toneSelect || !lengthSelect || !userNameInput || !languageSelect || !saveButton || !statusMessage) {
    return;
  }

  // Login: Sign in with Google
  const signInButton = document.getElementById("signInButton");
  if (signInButton && typeof ReplyMateAuth !== "undefined") {
    signInButton.addEventListener("click", async () => {
      const textEl = signInButton.querySelector(".gsi-material-button-contents");
      signInButton.disabled = true;
      if (textEl) textEl.textContent = getTranslation("signingIn", languageSelect?.value || DEFAULT_LANGUAGE);
      const result = await ReplyMateAuth.signInWithGoogle();
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      if (result.error) {
        signInButton.disabled = false;
        if (textEl) textEl.textContent = getTranslation("signInWithGoogle", language);
        if (result.error !== "Auth cancelled") alert(getTranslation("authErrorGeneric", language));
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

  // Manage Subscription link - opens upgrade page
  const manageSubscriptionLink = document.getElementById("manageSubscriptionLink");
  if (manageSubscriptionLink) {
    const upgradeUrl = (typeof REPLYMATE_UPGRADE_URL !== "undefined" ? REPLYMATE_UPGRADE_URL : "https://replymateai.app/pricing");
    manageSubscriptionLink.href = upgradeUrl;
    manageSubscriptionLink.target = "_blank";
    manageSubscriptionLink.rel = "noopener noreferrer";
    manageSubscriptionLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: upgradeUrl, active: true });
    });
  }

  // Add click handlers for Top-up buttons
  const topup100Btn = document.getElementById("topup100Btn");
  const topup500Btn = document.getElementById("topup500Btn");
  if (topup100Btn) {
    topup100Btn.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "CREATE_STRIPE_TOPUP", pack: "100" });
    });
  }
  if (topup500Btn) {
    topup500Btn.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "CREATE_STRIPE_TOPUP", pack: "500" });
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
      cancelSubscriptionLink.textContent = getTranslation("cancelling", language);
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

  // Add click handler for Keep subscription link
  const keepSubscriptionLink = document.getElementById("keepSubscriptionLink");
  if (keepSubscriptionLink) {
    keepSubscriptionLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      const token = await getAccessToken();
      if (!token) {
        console.error("[ReplyMate] Reactivate failed: no access token (sign in may have expired)");
        alert(getTranslation("signInRequired", language));
        return;
      }
      keepSubscriptionLink.style.pointerEvents = "none";
      keepSubscriptionLink.textContent = getTranslation("reactivating", language);
      try {
        const response = await fetch("https://replymate-backend-bot8.onrender.com/billing/reactivate-subscription", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errMsg = data.error || `Request failed (${response.status})`;
          console.error("[ReplyMate] Reactivate subscription error:", response.status, errMsg);
          throw new Error(errMsg);
        }
        alert(getTranslation("reactivateSuccess", language));
        setCachedUsage(null);
        await loadUsageData(language, true);
      } catch (err) {
        const msg = err?.message || getTranslation("reactivateError", language);
        alert(msg);
        keepSubscriptionLink.textContent = getTranslation("keepSubscription", language);
      } finally {
        keepSubscriptionLink.style.pointerEvents = "";
      }
    });
  }

// Load saved values (tone, length, user name, language, translation toggle, theme) when the popup opens.
  chrome.storage.local.get([TONE_KEY, LENGTH_KEY, USER_NAME_KEY, LANGUAGE_KEY, TRANSLATION_ENABLED_KEY, POPUP_THEME_KEY], async (result) => {
    // Theme first — before await work — removes flash when sessionStorage was empty (cold open).
    applyPopupTheme(result[POPUP_THEME_KEY] || DEFAULT_POPUP_THEME);

    const tone = result[TONE_KEY] || DEFAULT_TONE;
    const length = result[LENGTH_KEY] || DEFAULT_LENGTH;
    const userName = result[USER_NAME_KEY] || "";
    const language = result[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
    const translationEnabled = result[TRANSLATION_ENABLED_KEY];
    const translateEnabled = translationEnabled === false ? false : true;

    toneSelect.value = tone;
    lengthSelect.value = length;
    userNameInput.value = userName;
    languageSelect.value = language;
    const translateToggleSelect = document.getElementById("translateToggleSelect");
    if (translateToggleSelect) translateToggleSelect.value = translateEnabled ? "on" : "off";

    // Update login UI (hides usage/upgrade when not logged in)
    await updateLoginUI(language);
    
    // Apply language to all UI elements
    applyLanguageToUI(language);
    
    // Re-set select values after applying language (since options were recreated)
    toneSelect.value = tone;
    lengthSelect.value = length;
    languageSelect.value = language;

    if (typeof ReplyMateAuth !== "undefined" && (await ReplyMateAuth.isSignedIn())) {
      await loadUsageData(language, true);
    } else {
      await enforceColorThemesForPlan("free");
    }

    // Re-apply after plan enforcement (free/downgrade may have reset storage to basic).
    chrome.storage.local.get([POPUP_THEME_KEY], (r) => {
      if (chrome.runtime?.lastError) return;
      applyPopupTheme(r[POPUP_THEME_KEY] || DEFAULT_POPUP_THEME);
    });
  });

  // ReplyMate Translate toggle - save immediately so icon shows/hides right away
  const translateToggleSelect = document.getElementById("translateToggleSelect");
  if (translateToggleSelect) {
    translateToggleSelect.addEventListener("change", () => {
      const enabled = translateToggleSelect.value === "on";
      chrome.storage.local.set({ [TRANSLATION_ENABLED_KEY]: enabled });
    });
  }

  // Color wheel: Pro / Pro+ only; saves popup theme only (translate panel has its own wheel)
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", async () => {
      const language = languageSelect?.value || DEFAULT_LANGUAGE;
      let signedIn = false;
      try {
        if (typeof ReplyMateAuth !== "undefined") signedIn = await ReplyMateAuth.isSignedIn();
      } catch (_) {}
      if (!signedIn) {
        showThemeProToast(getTranslation("colorThemeUpgradePrompt", language));
        return;
      }
      // Cache-first so the UI updates immediately (avoid force-refresh network on every click).
      let usage = await getUsageData(false);
      if (!usage) {
        usage = await getUsageData(true);
      }
      if (!usage) {
        showThemeProToast(getTranslation("colorThemeUpgradePrompt", language));
        return;
      }
      if (!planAllowsPremiumColorThemes(usage.plan)) {
        showThemeProToast(getTranslation("colorThemeUpgradePrompt", language));
        return;
      }
      const cur = normalizePopupTheme(document.documentElement.getAttribute("data-theme") || DEFAULT_POPUP_THEME);
      const idx = POPUP_THEME_IDS.indexOf(cur);
      const next = POPUP_THEME_IDS[(idx + 1) % POPUP_THEME_IDS.length];
      persistPopupTheme(next);
    });
  }

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

  // Support dropdown and modals
  const SUPPORT_EMAIL = "replymate.support@gmail.com";
  const supportTrigger = document.getElementById("supportTrigger");
  const supportDropdown = document.getElementById("supportDropdown");
  const modalReport = document.getElementById("modalReport");
  const modalFeedback = document.getElementById("modalFeedback");
  const modalEnquiry = document.getElementById("modalEnquiry");
  const reportTextEl = document.getElementById("reportText");
  const feedbackTextEl = document.getElementById("feedbackText");
  const reportSubmitBtn = document.getElementById("reportSubmit");
  const feedbackSubmitBtn = document.getElementById("feedbackSubmit");
  const copyEmailBtn = document.getElementById("copyEmailBtn");

  if (supportTrigger && supportDropdown) {
    supportTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      supportDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => supportDropdown.classList.remove("open"));
    supportDropdown.addEventListener("click", (e) => e.stopPropagation());

    supportDropdown.querySelectorAll(".support-dropdown-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        supportDropdown.classList.remove("open");
        const action = btn.dataset.action;
        if (action === "report") modalReport?.classList.add("open");
        else if (action === "feedback") modalFeedback?.classList.add("open");
        else if (action === "enquiry") modalEnquiry?.classList.add("open");
      });
    });
  }

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.close;
      document.getElementById(id)?.classList.remove("open");
    });
  });

  [modalReport, modalFeedback, modalEnquiry].forEach((overlay) => {
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });

  if (reportSubmitBtn && reportTextEl) {
    reportSubmitBtn.addEventListener("click", () => {
      const body = reportTextEl.value.trim() || reportTextEl.placeholder;
      const subject = encodeURIComponent("ReplyMate - Report Issue");
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.open(mailto);
      reportTextEl.value = "";
      modalReport?.classList.remove("open");
    });
  }

  if (feedbackSubmitBtn && feedbackTextEl) {
    feedbackSubmitBtn.addEventListener("click", () => {
      const body = feedbackTextEl.value.trim() || feedbackTextEl.placeholder;
      const subject = encodeURIComponent("ReplyMate - Feedback");
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.open(mailto);
      feedbackTextEl.value = "";
      modalFeedback?.classList.remove("open");
    });
  }

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", async () => {
      const lang = languageSelect?.value || DEFAULT_LANGUAGE;
      try {
        await navigator.clipboard.writeText(SUPPORT_EMAIL);
        const span = copyEmailBtn.querySelector("span");
        if (span) {
          span.textContent = getTranslation("copied", lang);
          setTimeout(() => { span.textContent = getTranslation("copyEmail", lang); }, 1500);
        }
      } catch (err) {
        console.warn("[ReplyMate] Copy failed:", err);
      }
    });
  }

// Load usage data and update UI with language
async function loadUsageData(language = DEFAULT_LANGUAGE, forceRefresh = false) {
  const usageData = await getUsageData(forceRefresh);

  if (usageData) {
    updatePlanUsageDisplay(usageData, language);
    updateUpgradeLink(usageData.plan, language, usageData.cancelScheduled, usageData.periodEndDate, usageData.nextResetAt, usageData.topupRemaining ?? 0);
    await enforceColorThemesForPlan(usageData.plan);
  } else {
    updatePlanUsageDisplay(null, language);
    updateUpgradeLink("free", language, false, null, null, 0);
    let signedIn = false;
    try {
      if (typeof ReplyMateAuth !== "undefined") signedIn = await ReplyMateAuth.isSignedIn();
    } catch (_) {}
    if (!signedIn) {
      await enforceColorThemesForPlan("free");
    }
  }
}
});