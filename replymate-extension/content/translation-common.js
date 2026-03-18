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
      contentSame: "Same content.\nNo translation needed.",
      signInRequired: "Please sign in with Google to use ReplyMate translation."
    },
    korean: {
      aiReply: "AI Reply",
      instructionPlaceholder: "추가 정보 입력 (선택 사항, 예: 날짜, 시간)",
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
      contentSame: "동일한 내용입니다.\n번역할 필요가 없습니다.",
      signInRequired: "ReplyMate 번역을 사용하려면 Google로 로그인해 주세요."
    },
    japanese: {
      aiReply: "AI Reply",
      instructionPlaceholder: "追加情報（任意：日付、時間 など）",
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
      contentSame: "同じ内容です。\n翻訳の必要はありません。",
      signInRequired: "ReplyMate翻訳をご利用になるには、Googleでサインインしてください。"
    },
    spanish: {
      aiReply: "Respuesta IA",
      instructionPlaceholder: "Detalles adicionales (opcional, ej. fecha, hora, ubicación)",
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
      contentSame: "Mismo contenido.\nNo se necesita traducción.",
      signInRequired: "Por favor, inicia sesión con Google para usar la traducción de ReplyMate."
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
