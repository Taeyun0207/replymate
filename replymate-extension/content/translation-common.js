/**
 * Shared translation helpers for ReplyMate translation panel.
 * Provides getAccessToken, getCurrentLanguage, getTranslation for use on any page.
 * Used by translation.js when running outside Gmail (or as fallback).
 */
(function () {
  "use strict";

  const LANGUAGE_KEY = "replymateLanguage";
  const DEFAULT_LANGUAGE = "english";

  const TRANSLATIONS = {
    english: {
      aiReply: "AI Reply",
      instructionPlaceholder: "Additional details (optional, e.g. date, time, location)",
      translateLatestMessage: "Translate latest email",
      translateReply: "Translate my reply",
      translateManual: "Translate",
      translateClear: "Clear",
      translateInputPlaceholder: "Paste or type text to translate...",
      alreadyInYourLanguage: "Already in your selected language",
      noReplyFound: "No reply found. Generate a reply first.",
      copied: "Copied!",
      translateClose: "Close",
      translateCopy: "Copy",
      translateError: "Translation failed: ",
      translateLimitReached: "Daily limit reached. Upgrade below for more translations.",
      noMessageFound: "No message found in this thread.",
      noTextToTranslate: "Please paste or enter text to translate.",
      nothingToCopy: "Nothing to copy. Translate something first.",
      translatePanelTitle: "ReplyMate Translate",
      translateCycleTheme: "Cycle theme (saved for this panel only)",
      planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" },
      signInToSeeUsage: "Sign in to use",
      translationDisabled: "Translation is disabled",
      translationsToday: "translations today",
      /** Placeholders: {remaining} {limit} (use " / " between numbers) */
      translationUsageDaily: "{remaining} / {limit} left today",
      manageSubscription: "Manage Subscription",
      unlimitedTranslations: "Unlimited translations",
      translatePasteLabel: "Paste or type text to translate",
      translateResultLabel: "Result",
      translateToLabel: "Translate to",
      systemLanguage: "System Language",
      translating: "Translating...",
      contentSame: "Same content.\nNo translation needed.",
      signInRequired: "Please sign in with Google to use ReplyMate translation.",
      colorThemeProOnly:
        "Color themes are a Pro feature. Upgrade to Pro or Pro+ to unlock custom looks—in settings, the translation panel, and AI Reply buttons.",
      colorThemePlanCheckFailed: "Could not verify your plan. Check your connection and try again.",
      colorThemeUpgradePrompt: "Unlock Pro/Pro+",
      colorThemeToastPlanCheck: "We couldn’t verify your plan. Check your connection and try again.",
    },
    korean: {
      aiReply: "AI 답장",
      instructionPlaceholder: "추가 정보 (선택, 예: 날짜, 시간, 장소)",
      translateLatestMessage: "최근 메일 번역",
      translateReply: "내 답장 번역",
      translateManual: "번역",
      translateClear: "지우기",
      translateInputPlaceholder: "번역할 텍스트를 붙여넣거나 입력하세요...",
      alreadyInYourLanguage: "선택한 언어와 동일합니다",
      noReplyFound: "답장이 없습니다. 먼저 답장을 생성해 주세요.",
      copied: "복사되었습니다!",
      translateClose: "닫기",
      translateCopy: "복사",
      translateError: "번역 실패: ",
      translateLimitReached: "오늘 한도에 도달했습니다. 아래에서 업그레이드하면 더 사용할 수 있어요.",
      noMessageFound: "이 메일에서 내용을 찾을 수 없습니다.",
      noTextToTranslate: "번역할 텍스트를 붙여넣거나 입력해 주세요.",
      nothingToCopy: "복사할 내용이 없습니다. 먼저 번역해 주세요.",
      translatePanelTitle: "ReplyMate 번역",
      translateCycleTheme: "색 테마 (이 패널에만 저장)",
      planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" },
      signInToSeeUsage: "로그인하여 사용",
      translationDisabled: "번역이 꺼져 있습니다",
      translationsToday: "오늘 번역",
      translationUsageDaily: "오늘 {remaining} / {limit}회 남음",
      manageSubscription: "구독 관리",
      unlimitedTranslations: "무제한 번역",
      translatePasteLabel: "번역할 텍스트 붙여넣기 또는 입력",
      translateResultLabel: "번역 결과",
      translateToLabel: "번역할 언어",
      systemLanguage: "시스템 언어",
      translating: "번역 중...",
      contentSame: "동일한 내용입니다.\n번역이 필요하지 않습니다.",
      signInRequired: "ReplyMate 번역을 사용하려면 Google로 로그인해 주세요.",
      colorThemeProOnly:
        "색 테마는 Pro 전용 기능입니다. Pro 또는 Pro+로 업그레이드하면 설정, 번역 패널, AI 답장 버튼 등에서 맞춤 색상을 사용할 수 있습니다.",
      colorThemePlanCheckFailed: "플랜을 확인할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      colorThemeUpgradePrompt: "Pro·Pro+ 잠금 해제",
      colorThemeToastPlanCheck: "플랜을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    },
    japanese: {
      aiReply: "AI返信",
      instructionPlaceholder: "追加情報（任意・日付・時間など）",
      translateLatestMessage: "最新メールを翻訳",
      translateReply: "返信を翻訳",
      translateManual: "翻訳",
      translateClear: "クリア",
      translateInputPlaceholder: "翻訳するテキストを貼り付けまたは入力...",
      alreadyInYourLanguage: "選択中の言語と同じです",
      noReplyFound: "返信がありません。先に返信を生成してください。",
      copied: "コピーしました！",
      translateClose: "閉じる",
      translateCopy: "コピー",
      translateError: "翻訳に失敗しました: ",
      translateLimitReached: "本日の上限に達しました。下からプランをアップグレードすると続けて使えます。",
      noMessageFound: "このメールに内容がありません。",
      noTextToTranslate: "翻訳するテキストを貼り付けるか入力してください。",
      nothingToCopy: "コピーする内容がありません。先に翻訳してください。",
      translatePanelTitle: "ReplyMate 翻訳",
      translateCycleTheme: "テーマを切り替え（このパネルに保存）",
      planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" },
      signInToSeeUsage: "ログインしてご利用ください",
      translationDisabled: "翻訳はオフになっています",
      translationsToday: "本日の翻訳",
      translationUsageDaily: "本日 残り {remaining} / {limit} 回",
      manageSubscription: "サブスクリプション管理",
      unlimitedTranslations: "無制限",
      translatePasteLabel: "翻訳するテキストを貼り付けまたは入力",
      translateResultLabel: "翻訳結果",
      translateToLabel: "翻訳先",
      systemLanguage: "システムの言語",
      translating: "翻訳中...",
      contentSame: "同じ内容です。\n翻訳の必要はありません。",
      signInRequired: "ReplyMate翻訳をご利用いただくには、Googleでログインしてください。",
      colorThemeProOnly:
        "カラーテーマはPro向けの機能です。ProまたはPro+にアップグレードすると、設定・翻訳パネル・AI返信ボタンなどでカスタム配色が使えます。",
      colorThemePlanCheckFailed: "プランを確認できませんでした。接続を確認してもう一度お試しください。",
      colorThemeUpgradePrompt: "Pro／Pro+解除",
      colorThemeToastPlanCheck: "プランを確認できませんでした。接続を確認して再度お試しください。",
    },
    spanish: {
      aiReply: "Respuesta IA",
      instructionPlaceholder: "Detalles adicionales (opcional, ej. fecha, hora, ubicación)",
      translateLatestMessage: "Traducir último correo",
      translateReply: "Traducir mi respuesta",
      translateManual: "Traducir",
      translateClear: "Borrar",
      translateInputPlaceholder: "Pega o escribe el texto a traducir...",
      alreadyInYourLanguage: "Ya está en el idioma seleccionado",
      noReplyFound: "No hay respuesta. Genera una respuesta primero.",
      copied: "¡Copiado!",
      translateClose: "Cerrar",
      translateCopy: "Copiar",
      translateError: "Error al traducir: ",
      translateLimitReached: "Has alcanzado el límite diario. Mejora tu plan abajo para seguir traduciendo.",
      noMessageFound: "No hay contenido en este correo.",
      noTextToTranslate: "Pega o escribe el texto que quieras traducir.",
      nothingToCopy: "No hay nada que copiar. Traduce algo primero.",
      translatePanelTitle: "ReplyMate Traducir",
      translateCycleTheme: "Cambiar tema (solo guardado en este panel)",
      planNames: { free: "Free", pro: "Pro", pro_plus: "Pro+" },
      signInToSeeUsage: "Inicia sesión para usar",
      translationDisabled: "La traducción está desactivada",
      translationsToday: "traducciones hoy",
      translationUsageDaily: "Quedan {remaining} / {limit} hoy",
      manageSubscription: "Administrar suscripción",
      unlimitedTranslations: "Traducciones ilimitadas",
      translatePasteLabel: "Pega o escribe el texto a traducir",
      translateResultLabel: "Resultado",
      translateToLabel: "Traducir a",
      systemLanguage: "Idioma del sistema",
      translating: "Traduciendo...",
      contentSame: "Mismo contenido.\nNo hace falta traducir.",
      signInRequired: "Inicia sesión con Google para usar la traducción de ReplyMate.",
      colorThemeProOnly:
        "Los temas de color son una función Pro. Mejora a Pro o Pro+ para desbloquear apariencias personalizadas en ajustes, el panel de traducción y los botones de respuesta con IA.",
      colorThemePlanCheckFailed: "No se pudo verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
      colorThemeUpgradePrompt: "Desbloquea Pro/Pro+",
      colorThemeToastPlanCheck: "No pudimos verificar tu plan. Comprueba la conexión e inténtalo de nuevo.",
    }
  };

  /** Widely-used target languages for the dropdown (code, display name). */
  window.REPLYMATE_TARGET_LANGUAGES = [
    { code: "en", name: "English" },
    { code: "zh", name: "中文" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "pt", name: "Português" },
    { code: "ar", name: "العربية" },
    { code: "ru", name: "Русский" },
    { code: "hi", name: "हिन्दी" },
    { code: "it", name: "Italiano" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "th", name: "ไทย" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "tr", name: "Türkçe" },
    { code: "nl", name: "Nederlands" },
    { code: "pl", name: "Polski" }
  ];

  function getTranslation(key, language) {
    const lang = TRANSLATIONS[language || DEFAULT_LANGUAGE] || TRANSLATIONS.english;
    return lang[key] || TRANSLATIONS.english[key] || key;
  }

  const LANG_ATTR_MAP = { ko: "korean", ja: "japanese", es: "spanish", en: "english", "en-US": "english", "en-GB": "english" };

  function detectPageLanguage() {
    try {
      const lang = (typeof document !== "undefined" && document.documentElement?.getAttribute?.("lang")) || "";
      const code = (lang || "").split("-")[0].toLowerCase();
      return LANG_ATTR_MAP[code] || LANG_ATTR_MAP[lang] || null;
    } catch (e) {
      return null;
    }
  }

  async function getCurrentLanguage() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          resolve(detectPageLanguage() || DEFAULT_LANGUAGE);
          return;
        }
        chrome.storage.local.get([LANGUAGE_KEY], (result) => {
          try {
            if (chrome?.runtime?.lastError) {
              resolve(detectPageLanguage() || DEFAULT_LANGUAGE);
              return;
            }
            const stored = result?.[LANGUAGE_KEY];
            if (stored) {
              resolve(stored);
              return;
            }
            resolve(detectPageLanguage() || DEFAULT_LANGUAGE);
          } catch (e) {
            resolve(detectPageLanguage() || DEFAULT_LANGUAGE);
          }
        });
      } catch (e) {
        resolve(detectPageLanguage() || DEFAULT_LANGUAGE);
      }
    });
  }

  async function getAccessToken() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_ACCESS_TOKEN" });
      if (res && res.token) return res.token;
    } catch (e) {
      /* ignore */
    }
    if (typeof ReplyMateAuthShared !== "undefined") {
      const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
      const url = g.REPLYMATE_SUPABASE_URL;
      const anonKey = g.REPLYMATE_SUPABASE_ANON_KEY;
      if (url && anonKey) await ReplyMateAuthShared.syncConfig(url, anonKey);
      const token = await ReplyMateAuthShared.getAccessToken();
      if (token) return token;
    }
    return null;
  }

  // Only set getTranslation if not already defined (e.g. by gmail.js on Gmail).
  // gmail.js has the full set including aiReply, instructionPlaceholder; we only have translation panel keys.
  if (typeof window.getTranslation !== "function") {
    window.getTranslation = getTranslation;
  }
  window.getCurrentLanguage = getCurrentLanguage;
  window.getAccessToken = getAccessToken;
})();
