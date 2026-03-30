/**
 * ReplyMate Translation Panel
 * Lightweight translation feature for Gmail UI.
 * Uses existing app language as target. No auto-translate; all actions are user-initiated.
 */
(function () {
  "use strict";

  // Only run in main frame (not in iframes)
  if (typeof window !== "undefined" && window !== window.top) return;

  /** True if we're on Gmail or Outlook (has extractThreadContext / findActiveReplyEditor from gmail.js or outlook.js). */
  function isGmailPage() {
    return typeof extractThreadContext === "function" && typeof findActiveReplyEditor === "function";
  }

  const TRANSLATION_ICON_ID = "replymate-translation-icon";
  const TRANSLATION_PANEL_ID = "replymate-translation-panel";
  const TRANSLATION_TOAST_ID = "replymate-translation-toast";
  const BACKEND_BASE = "https://replymate-backend-bot8.onrender.com";
  /** `chrome.storage.local` key per tab id — survives refresh & Google in-tab navigation; removed when tab closes (see background). */
  const LAYOUT_TAB_KEY_PREFIX = "replymate_tl_";
  const STORAGE_TARGET_LANG = "replymate_translation_target_lang";

  /** Default when nothing valid is stored (new install / cleared). */
  const PANEL_DEFAULT_WIDTH = 460;
  const PANEL_DEFAULT_HEIGHT = 580;
  const PANEL_MIN_WIDTH = 300;
  const PANEL_MIN_HEIGHT = 260;

  /** Default FAB matches icon placement: 48×48, 24px inset — panel sits above it when no saved position. */
  const FAB_MARGIN = 24;
  const FAB_SIZE = 48;
  const PANEL_DEFAULT_GAP_ABOVE_FAB = 12;

  /** Set from loadPanelSizeState — used so we don't persist size before first user resize. */
  let panelUserSized = false;
  const STORAGE_TRANSLATION_ENABLED = "replymate_translation_enabled";
  /** Translate panel appearance only — same theme IDs / order as popup color wheel, separate storage. */
  const STORAGE_TRANSLATION_PANEL_THEME = "replymate_translation_panel_theme";
  /** Same cache key/TTL as popup.js — fast plan checks for theme without blocking. */
  const USAGE_CACHE_KEY = "replymate_usage_cache";
  const USAGE_CACHE_TTL = 30000;
  const TRANSLATION_PANEL_THEME_IDS = ["basic", "light", "sepia", "rose", "slate", "dark", "basic-dark"];
  const DEFAULT_TRANSLATION_PANEL_THEME = "basic";

  function getPricingPageUrl() {
    const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
    return g.REPLYMATE_UPGRADE_URL || "https://replymateai.app/pricing";
  }

  /** Opens marketing / pricing page (same URL as extension popup “Manage subscription”). */
  function openPricingPage() {
    const url = getPricingPageUrl();
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "OPEN_PRICING_PAGE" }, () => {
          if (chrome.runtime?.lastError) {
            try {
              window.open(url, "_blank", "noopener,noreferrer");
            } catch (_) { /* ignore */ }
          }
        });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (_) {
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (_2) { /* ignore */ }
    }
  }

  let translateAbortController = null;
  let lastTranslatedSource = "";
  let lastTranslatedTarget = "";
  let lastTranslatedResult = "";

  /**
   * Strip Gmail UI elements from scraped message (timestamps, buttons, unsubscribe, etc.).
   * Returns only the actual email body for translation.
   */
  function stripGmailUIFromMessage(text) {
    if (!text || typeof text !== "string") return "";
    let cleaned = text;

    // Remove sender line with Unsubscribe: "Name <email> Unsubscribe" or "Name <email> 구독 취소"
    cleaned = cleaned.replace(/^[^\n]*<[^>]*@[^>]*>[\s\u00a0]*(구독\s*취소|Unsubscribe|退订|退訂|Desuscribirse|Se désabonner|Abbestellen|退会|구독해지)[^\n]*$/gim, "");

    // Remove timestamp lines: "17:24 (1 hour ago)", "17:24 (1시간 전)", "Mar 14, 5:24 PM"
    cleaned = cleaned.replace(/^\d{1,2}:\d{2}\s*\([^)]*\)\s*$/gm, "");
    cleaned = cleaned.replace(/^[A-Za-z]{3}\s+\d{1,2},?\s+\d{1,2}:\d{2}\s*[AP]M\s*$/gm, "");
    cleaned = cleaned.replace(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s+\d{1,2}:\d{2}\s*$/gm, "");

    // Remove common Gmail UI (Reply, More, To me, etc.) - whole lines that are just these
    const uiPatterns = [
      /^답장\s*$/m, /^Reply\s*$/im, /^Reply all\s*$/im, /^Forward\s*$/im, /^返信\s*$/m, /^Responder\s*$/im, /^Répondre\s*$/im, /^Antworten\s*$/im,
      /^더보기\s*$/m, /^More\s*$/im, /^もっと見る\s*$/m, /^Más\s*$/im, /^Plus\s*$/im, /^Mehr\s*$/im,
      /^나에게\s*$/m, /^To me\s*$/im, /^自分へ\s*$/m, /^Para mí\s*$/im, /^À moi\s*$/im, /^An mich\s*$/im,
      /^그룹에 이모지로 반응할 수 없습니다\.\s*$/m,
      /^You can't react with emoji in groups\.\s*$/im,
      /^グループで絵文字に反応できません\.\s*$/m,
      /^No puedes reaccionar con emojis en grupos\.\s*$/im,
      /^구독 취소\s*$/m, /^Unsubscribe\s*$/im
    ];
    uiPatterns.forEach((p) => { cleaned = cleaned.replace(p, ""); });

    // Remove lines that are only "Unsubscribe" or similar
    cleaned = cleaned.replace(/^\s*(Unsubscribe|구독 취소|退订|退訂|Desuscribirse|Se désabonner)\s*$/gim, "");

    // Remove Outlook UI labels in ALL languages - translation must be based on EMAIL content only
    const outlookUiPatterns = [
      /^받는\s*사람\s*:?\s*.*$/m, /^참조\s*:?\s*.*$/m, /^숨은\s*참조\s*:?\s*.*$/m, /^보낸\s*사람\s*:?\s*.*$/m, /^제목\s*:?\s*.*$/m,
      /^To\s*:?\s*.*$/im, /^Cc\s*:?\s*.*$/im, /^Bcc\s*:?\s*.*$/im, /^From\s*:?\s*.*$/im, /^Subject\s*:?\s*.*$/im, /^Sent\s*:?\s*.*$/im,
      /^宛先\s*:?\s*.*$/m, /^CC\s*:?\s*.*$/m, /^BCC\s*:?\s*.*$/m, /^差出人\s*:?\s*.*$/m, /^件名\s*:?\s*.*$/m, /^送信日時\s*:?\s*.*$/m,
      /^Para\s*:?\s*.*$/im, /^CC\s*:?\s*.*$/im, /^CCO\s*:?\s*.*$/im, /^De\s*:?\s*.*$/im, /^Asunto\s*:?\s*.*$/im, /^Enviado\s*:?\s*.*$/im,
      /^보내기\s*$/m, /^취소\s*$/m, /^Send\s*$/im, /^Discard\s*$/im, /^Cancel\s*$/im,
      /^送信\s*$/m, /^キャンセル\s*$/m, /^破棄\s*$/m,
      /^Enviar\s*$/im, /^Cancelar\s*$/im, /^Descartar\s*$/im,
      /^추가\s*정보\s*입력.*$/m, /^답장\s*$/m, /^전체\s*답장\s*$/m, /^전달\s*$/m,
      /^返信\s*$/m, /^全員に返信\s*$/m, /^転送\s*$/m,
      /^Responder\s*$/im, /^Reenviar\s*$/im
    ];
    outlookUiPatterns.forEach((p) => { cleaned = cleaned.replace(p, ""); });

    // Normalize whitespace
    cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/^\s+|\s+$/g, "");

    return cleaned.trim();
  }

  /**
   * Strip UI labels so language detection is based on EMAIL content only, not Outlook/Gmail UI.
   */
  function stripForLanguageDetection(text) {
    if (!text || typeof text !== "string") return "";
    let t = text;
    const uiLines = [
      /^받는\s*사람\s*:?\s*.*$/gm, /^참조\s*:?\s*.*$/gm, /^숨은\s*참조\s*:?\s*.*$/gm, /^보낸\s*사람\s*:?\s*.*$/gm, /^제목\s*:?\s*.*$/gm,
      /^To\s*:?\s*.*$/gim, /^Cc\s*:?\s*.*$/gim, /^Bcc\s*:?\s*.*$/gim, /^From\s*:?\s*.*$/gim, /^Subject\s*:?\s*.*$/gim, /^Sent\s*:?\s*.*$/gim,
      /^宛先\s*:?\s*.*$/gm, /^差出人\s*:?\s*.*$/gm, /^件名\s*:?\s*.*$/gm, /^送信日時\s*:?\s*.*$/gm,
      /^Para\s*:?\s*.*$/gim, /^De\s*:?\s*.*$/gim, /^Asunto\s*:?\s*.*$/gim, /^Enviado\s*:?\s*.*$/gim,
      /^보내기\s*$/gm, /^취소\s*$/gm, /^送信\s*$/gm, /^キャンセル\s*$/gm, /^Enviar\s*$/gim, /^Cancelar\s*$/gim, /^Descartar\s*$/gim
    ];
    uiLines.forEach((p) => { t = t.replace(p, ""); });
    return t.replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  }

  /**
   * Get subject + email body only (no Gmail/Outlook UI) for translation.
   */
  function getLatestMessage() {
    try {
      const ctx = typeof extractThreadContext === "function" ? extractThreadContext() : null;
      if (!ctx) return "";

      const body = stripGmailUIFromMessage(ctx.latestMessage || "");
      const subject = (ctx.subject || "").trim();

      if (!subject && !body) return "";
      if (subject && body) return `Subject: ${subject}\n\n${body}`;
      return subject || body;
    } catch (e) {
      console.warn("[ReplyMate Translation] getLatestMessage error:", e);
      return "";
    }
  }

  /**
   * Get content from Gmail reply textarea (AI-generated reply).
   */
  function getReplyText() {
    try {
      const editor = typeof findActiveReplyEditor === "function" ? findActiveReplyEditor() : null;
      if (!editor || !(editor instanceof HTMLElement)) return "";
      const text = (editor.innerText || editor.textContent || "").trim();
      return text;
    } catch (e) {
      console.warn("[ReplyMate Translation] getReplyText error:", e);
      return "";
    }
  }

  // Use gmail.js detectLanguage when available (same content script context)
  const _gmailDetectLanguage = typeof detectLanguage === "function" ? detectLanguage : null;

  /**
   * Detect language from EMAIL content only - never from Outlook/Gmail UI language.
   * Uses dominant script: count chars per script and pick the winner.
   * This ensures English emails are detected as English even when UI is in Korean/Japanese/etc.
   */
  function detectLanguageForTranslation(text) {
    if (!text || typeof text !== "string") return "english";
    if (_gmailDetectLanguage) return _gmailDetectLanguage(text);

    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    const korean = (text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
    const japanese = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
    const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;

    const max = Math.max(latin, korean, japanese, chinese);
    if (max === 0) return "english";
    if (latin === max) return "english";
    if (korean === max) return "korean";
    if (japanese === max) return "japanese";
    if (chinese === max) return "zh";

    if (/[ñáéíóúü]/.test(text.toLowerCase()) || /\b(gracias|por favor|que|para|con|estoy|tengo|hola|buenos|días|noche|favor)\b/i.test(text)) return "spanish";
    return "english";
  }

  /**
   * Map app language or API code to API target code.
   */
  function mapToTargetCode(lang) {
    if (!lang || typeof lang !== "string") return "en";
    const s = lang.toLowerCase();
    const appToCode = { english: "en", korean: "ko", japanese: "ja", spanish: "es" };
    if (appToCode[s]) return appToCode[s];
    if (s.length === 2) return s;
    return "en";
  }

  /**
   * Call translation API (non-streaming fallback).
   */
  async function translateText(text, targetLang, signal) {
    const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
    if (!token) throw new Error("Sign in required");
    const targetCode = typeof targetLang === "string" ? mapToTargetCode(targetLang) : mapToTargetCode("english");
    const res = await fetch(`${BACKEND_BASE}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, targetLang: targetCode }),
      signal
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Translation failed");
    return data.translated || "";
  }

  /**
   * Stream translation and call onDelta for each chunk. Falls back to non-streaming on error.
   */
  async function translateTextStream(text, targetLang, onDelta, signal) {
    const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
    if (!token) throw new Error("Sign in required");
    const targetCode = typeof targetLang === "string" ? mapToTargetCode(targetLang) : mapToTargetCode("english");
    const res = await fetch(`${BACKEND_BASE}/translate-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, targetLang: targetCode }),
      signal
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Translation failed");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const obj = JSON.parse(trimmed.slice(6).trim());
          const chunk = obj.type === "chunk" ? obj.text : obj.delta;
          if (chunk) {
            fullText += chunk;
            if (onDelta) onDelta(fullText);
          }
          if (obj.error) throw new Error(obj.error);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ")) {
      try {
        const obj = JSON.parse(trimmed.slice(6).trim());
        const chunk = obj.type === "chunk" ? obj.text : obj.delta;
        if (chunk) {
          fullText += chunk;
          if (onDelta) onDelta(fullText);
        }
      } catch (_) {}
    }
    return fullText;
  }

  /**
   * Show temporary toast message.
   */
  function showToast(message, withCheck = false, durationMs = 1800) {
    let toast = document.getElementById(TRANSLATION_TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TRANSLATION_TOAST_ID;
      toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;z-index:2147483647;opacity:0;transition:opacity 0.25s ease, transform 0.25s ease;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;white-space:pre-line;max-width:min(420px,calc(100vw - 32px));text-align:center;line-height:1.45;";
      document.body.appendChild(toast);
    }
    if (withCheck) {
      toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span></span>`;
      toast.querySelector("span").textContent = message;
    } else {
      toast.textContent = message;
    }
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
    }, durationMs);
  }

  const THEME_ANCHOR_TOAST_ID = "replymate-theme-anchor-toast";

  function removeThemeAnchorToast() {
    const el = document.getElementById(THEME_ANCHOR_TOAST_ID);
    if (el) el.remove();
  }

  /** Place hint under header color wheel, inside panel (avoids viewport bottom-right bug + moves with panel). */
  function positionThemeToastInPanel(wrap, panel, anchor) {
    if (!wrap || !panel || !anchor) return;
    const pr = panel.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const w = wrap.offsetWidth || 1;
    const h = wrap.offsetHeight || 1;
    let left = ar.right - pr.left - w;
    left = Math.max(6, Math.min(left, pr.width - w - 6));
    let top = ar.bottom - pr.top + 4;
    if (top + h > pr.height - 8) {
      top = Math.max(6, ar.top - pr.top - h - 4);
    }
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
  }

  /**
   * Anchored under translate panel color wheel (inside #replymate-translation-panel).
   */
  function showThemeUpgradeNotice(message) {
    removeThemeAnchorToast();
    const panel = document.getElementById(TRANSLATION_PANEL_ID);
    const anchor = document.getElementById("replymate-translate-theme");
    if (!panel || !anchor) {
      showToast(message, false, 5500);
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = THEME_ANCHOR_TOAST_ID;
    wrap.setAttribute("role", "status");
    wrap.style.cssText = [
      "position:absolute",
      "z-index:60",
      "left:0",
      "top:0",
      "display:inline-flex",
      "flex-direction:row",
      "flex-wrap:nowrap",
      "align-items:center",
      "gap:6px",
      "padding:8px 10px",
      "background:#2b2b2b",
      "color:#fff",
      "border-radius:10px",
      "font-size:12px",
      "line-height:1.35",
      "font-weight:500",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "box-shadow:0 4px 20px rgba(0,0,0,0.35)",
      "white-space:normal",
      "box-sizing:border-box",
      "pointer-events:none",
    ].join(";");

    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u26A0\uFE0F";
    icon.style.cssText = "flex-shrink:0;font-size:13px;line-height:1";

    const text = document.createElement("span");
    text.textContent = message;
    text.style.cssText =
      "white-space:normal;max-width:min(280px,calc(100vw - 48px));line-height:1.35";

    wrap.appendChild(icon);
    wrap.appendChild(text);
    panel.appendChild(wrap);

    const reposition = () => {
      if (wrap.parentNode) positionThemeToastInPanel(wrap, panel, anchor);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reposition();
        setTimeout(reposition, 50);
      });
    });
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    const hideMs = 5500;
    setTimeout(() => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      removeThemeAnchorToast();
    }, hideMs);
  }

  /**
   * Copy text to clipboard.
   */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    }
  }

  let cachedLayoutStorageKey = null;
  let layoutScopePromise = null;

  function getLayoutTabIdFromBackground() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage({ type: "REPLYMATE_GET_TAB_ID" }, (r) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const id = typeof r?.tabId === "number" ? r.tabId : null;
          resolve(id);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function ensureLayoutTabScope() {
    if (layoutScopePromise) return layoutScopePromise;
    layoutScopePromise = (async () => {
      const id = await getLayoutTabIdFromBackground();
      cachedLayoutStorageKey = id != null ? LAYOUT_TAB_KEY_PREFIX + id : null;
    })();
    return layoutScopePromise;
  }

  function readLayoutFromStorage() {
    return ensureLayoutTabScope().then(() => {
      try {
        const area = chrome.storage?.local;
        const key = cachedLayoutStorageKey;
        if (!area || !key) return Promise.resolve(null);
        return new Promise((resolve) => {
          area.get([key], (r) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            const v = r?.[key];
            if (!v || typeof v !== "object") {
              resolve(null);
              return;
            }
            resolve(v);
          });
        });
      } catch {
        return Promise.resolve(null);
      }
    });
  }

  function writeLayoutToStorage(partial) {
    void ensureLayoutTabScope()
      .then(() => {
        const area = chrome.storage?.local;
        const key = cachedLayoutStorageKey;
        if (!area || !key) return null;
        return new Promise((resolve) => {
          area.get([key], (r) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            let prev = r?.[key];
            if (!prev || typeof prev !== "object") prev = {};
            const next = { ...prev };
            if (partial.icon && typeof partial.icon.x === "number" && typeof partial.icon.y === "number") {
              next.icon = { x: partial.icon.x, y: partial.icon.y };
            }
            if (partial.panel && typeof partial.panel.x === "number" && typeof partial.panel.y === "number") {
              next.panel = { x: partial.panel.x, y: partial.panel.y };
            }
            if (partial.size && typeof partial.size.w === "number" && typeof partial.size.h === "number") {
              next.size = { w: partial.size.w, h: partial.size.h };
            }
            if (typeof partial.userSized === "boolean") next.userSized = partial.userSized;
            resolve(next);
          });
        });
      })
      .then((next) => {
        if (!next) return;
        const area = chrome.storage?.local;
        const key = cachedLayoutStorageKey;
        if (!area || !key) return;
        area.set({ [key]: next }, () => { /* ignore lastError */ });
      })
      .catch(() => {});
  }

  function saveIconPosition(x, y) {
    writeLayoutToStorage({ icon: { x, y } });
  }

  function savePanelPosition(x, y) {
    writeLayoutToStorage({ panel: { x, y } });
  }

  function isValidStoredPos(v) {
    return (
      v &&
      typeof v.x === "number" &&
      typeof v.y === "number" &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y)
    );
  }

  function loadIconPosition(defaultX, defaultY) {
    return readLayoutFromStorage().then((L) => {
      try {
        const v = L?.icon;
        return isValidStoredPos(v) ? { x: v.x, y: v.y } : { x: defaultX, y: defaultY };
      } catch {
        return { x: defaultX, y: defaultY };
      }
    });
  }

  function loadPanelPosition(defaultX, defaultY) {
    return readLayoutFromStorage().then((L) => {
      try {
        const v = L?.panel;
        return isValidStoredPos(v) ? { x: v.x, y: v.y } : { x: defaultX, y: defaultY };
      } catch {
        return { x: defaultX, y: defaultY };
      }
    });
  }

  /**
   * Clamp translation panel size to viewport and min/max bounds.
   */
  function clampPanelSize(w, h) {
    const maxW = Math.min(window.innerWidth * 0.92, 920);
    const maxH = Math.min(window.innerHeight * 0.9, 900);
    return {
      w: clamp(w, PANEL_MIN_WIDTH, maxW),
      h: clamp(h, PANEL_MIN_HEIGHT, maxH),
    };
  }

  /** Right-aligned with FAB, stacked above the floating button (first-time default). */
  function getDefaultPanelAnchorPosition(panelW, panelH) {
    const { w, h } = clampPanelSize(panelW, panelH);
    const x = Math.max(0, window.innerWidth - FAB_MARGIN - w);
    const y = Math.max(
      0,
      window.innerHeight - FAB_MARGIN - FAB_SIZE - PANEL_DEFAULT_GAP_ABOVE_FAB - h
    );
    return { x, y };
  }

  /** When `display: none`, layout size is 0×0 — never treat that as real dimensions. */
  function isTranslationPanelExpanded(panel) {
    return !!(panel && panel.style.display === "flex");
  }

  function persistPanelSizeFromLayout(panel) {
    if (!isTranslationPanelExpanded(panel)) return;
    if (!panelUserSized) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    if (w >= PANEL_MIN_WIDTH && h >= PANEL_MIN_HEIGHT) {
      savePanelSize(w, h, false);
    }
  }

  function persistPanelSizeFromInlineStyle(panel) {
    if (!panel) return;
    if (!panelUserSized) return;
    const sw = parseFloat(panel.style.width);
    const sh = parseFloat(panel.style.height);
    if (Number.isFinite(sw) && Number.isFinite(sh) && sw >= PANEL_MIN_WIDTH && sh >= PANEL_MIN_HEIGHT) {
      savePanelSize(sw, sh, false);
    }
  }

  function isTruthyUserSizedFlag(flag) {
    return flag === true || flag === "true" || flag === 1;
  }

  /**
   * @param {boolean} [markUserSized] - true when the user finished dragging the resize handle.
   */
  function savePanelSize(w, h, markUserSized) {
    const c = clampPanelSize(w, h);
    if (markUserSized) panelUserSized = true;
    writeLayoutToStorage({
      size: { w: c.w, h: c.h },
      ...(markUserSized ? { userSized: true } : {}),
    });
  }

  /** Load panel size from per-tab local storage. */
  function loadPanelSizeState() {
    const fallback = { w: PANEL_DEFAULT_WIDTH, h: PANEL_DEFAULT_HEIGHT, userSized: false };
    return readLayoutFromStorage().then((L) => {
      try {
        if (!L) return fallback;
        const v = L.size;
        const flag = L.userSized;
        const rw = v != null ? Number(v.w) : NaN;
        const rh = v != null ? Number(v.h) : NaN;
        const ok = v && Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0;
        if (isTruthyUserSizedFlag(flag) && ok) {
          const c = clampPanelSize(rw, rh);
          return { w: c.w, h: c.h, userSized: true };
        }
        if (ok) {
          const c = clampPanelSize(rw, rh);
          return { w: c.w, h: c.h, userSized: !!isTruthyUserSizedFlag(flag) };
        }
        return fallback;
      } catch {
        return fallback;
      }
    });
  }

  function normalizeTranslationPanelTheme(theme) {
    return TRANSLATION_PANEL_THEME_IDS.includes(theme) ? theme : DEFAULT_TRANSLATION_PANEL_THEME;
  }

  /** Copy theme tokens from panel → FAB so host-page CSS cannot override our gradients/shadows. */
  function syncTranslationIconThemeVars(panel) {
    const icon = document.getElementById(TRANSLATION_ICON_ID);
    if (!panel || !icon) return;
    const ps = getComputedStyle(panel);
    const names = ["--tp-header-gradient", "--tp-fab-shadow", "--tp-fab-shadow-hover"];
    for (const n of names) {
      const v = ps.getPropertyValue(n).trim();
      if (v) icon.style.setProperty(n, v);
    }
  }

  function applyTranslationPanelTheme(panel, theme) {
    const t = normalizeTranslationPanelTheme(theme);
    if (panel) panel.setAttribute("data-theme", t);
    const icon = document.getElementById(TRANSLATION_ICON_ID);
    if (icon) icon.setAttribute("data-theme", t);
    if (panel && icon) {
      syncTranslationIconThemeVars(panel);
      requestAnimationFrame(() => syncTranslationIconThemeVars(panel));
    }
  }

  /** Pro/Pro+ only for non-basic themes (same rules as popup settings). */
  function planAllowsPremiumColorThemes(plan) {
    return plan === "pro" || plan === "pro_plus";
  }

  /**
   * Premium color wheel applies only for Pro and Pro+ (`replymate_translation_panel_theme` in storage
   * keeps the user’s choice for when they qualify again). Not signed in or Free → always basic UI.
   */
  function getEffectiveTranslationPanelTheme(savedTheme, usage) {
    const s = normalizeTranslationPanelTheme(savedTheme);
    if (usage && planAllowsPremiumColorThemes(usage.plan)) return s;
    return DEFAULT_TRANSLATION_PANEL_THEME;
  }

  /** Reconcile panel + FAB `data-theme` with current plan (call after fresh usage fetch). */
  async function applyTranslationPanelThemeForUsage(panel, usage) {
    if (!panel) return;
    const saved = await loadTranslationPanelTheme();
    applyTranslationPanelTheme(panel, getEffectiveTranslationPanelTheme(saved, usage));
  }

  function saveTranslationPanelTheme(theme) {
    const t = normalizeTranslationPanelTheme(theme);
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({
          [STORAGE_TRANSLATION_PANEL_THEME]: t,
        });
      }
    } catch (e) { /* ignore */ }
  }

  function getCachedUsageFromStorage() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          resolve(null);
          return;
        }
        chrome.storage.local.get([USAGE_CACHE_KEY], (result) => {
          if (chrome?.runtime?.lastError) {
            resolve(null);
            return;
          }
          const entry = result && result[USAGE_CACHE_KEY];
          if (entry && entry.data && entry.timestamp != null) {
            if (Date.now() - entry.timestamp < USAGE_CACHE_TTL) {
              resolve(entry.data);
              return;
            }
          }
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Usage for theme gating — same order as popup color wheel: must be signed in or cache can
   * still show a stale Pro plan after sign-out and incorrectly allow cycling themes.
   */
  async function getUsageForThemeGate() {
    const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
    if (!token) return null;
    const cached = await getCachedUsageFromStorage();
    if (cached) return cached;
    return fetchUsage();
  }

  function loadTranslationPanelTheme() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_TRANSLATION_PANEL_THEME], (r) => {
            if (chrome?.runtime?.lastError) {
              resolve(DEFAULT_TRANSLATION_PANEL_THEME);
              return;
            }
            const v = r?.[STORAGE_TRANSLATION_PANEL_THEME];
            resolve(typeof v === "string" ? normalizeTranslationPanelTheme(v) : DEFAULT_TRANSLATION_PANEL_THEME);
          });
        } else {
          resolve(DEFAULT_TRANSLATION_PANEL_THEME);
        }
      } catch {
        resolve(DEFAULT_TRANSLATION_PANEL_THEME);
      }
    });
  }

  /**
   * Save selected target language to chrome.storage.local.
   */
  function saveTargetLang(code) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_TARGET_LANG]: code || "" });
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Load saved target language from chrome.storage.local.
   */
  function loadTargetLang() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_TARGET_LANG], (r) => {
            const v = r?.[STORAGE_TARGET_LANG];
            resolve(typeof v === "string" ? v : "");
          });
        } else {
          resolve("");
        }
      } catch {
        resolve("");
      }
    });
  }

  /**
   * Get translation enabled state (default true).
   */
  function getTranslationEnabled() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_TRANSLATION_ENABLED], (r) => {
            const v = r?.[STORAGE_TRANSLATION_ENABLED];
            resolve(v === false ? false : true);
          });
        } else {
          resolve(true);
        }
      } catch {
        resolve(true);
      }
    });
  }

  /**
   * Set translation enabled state.
   */
  function setTranslationEnabled(enabled) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_TRANSLATION_ENABLED]: enabled });
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Clamp value between min and max.
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /** While dragging, lock page text selection + cursor so dense UIs (video lectures, many buttons) don’t feel “sticky”. */
  let dragSurfaceLockCount = 0;
  let dragSurfacePrevUserSelect = "";
  let dragSurfacePrevWebkitUserSelect = "";
  let dragSurfacePrevCursorHtml = "";
  let dragSurfacePrevCursorBody = "";

  function lockDragSurface() {
    dragSurfaceLockCount += 1;
    if (dragSurfaceLockCount !== 1) return;
    const b = document.body;
    const h = document.documentElement;
    dragSurfacePrevUserSelect = b.style.userSelect || "";
    dragSurfacePrevWebkitUserSelect = b.style.webkitUserSelect || "";
    dragSurfacePrevCursorBody = b.style.cursor || "";
    dragSurfacePrevCursorHtml = h.style.cursor || "";
    b.style.userSelect = "none";
    b.style.webkitUserSelect = "none";
    b.style.cursor = "grabbing";
    h.style.cursor = "grabbing";
  }

  function unlockDragSurface() {
    if (dragSurfaceLockCount < 1) return;
    dragSurfaceLockCount -= 1;
    if (dragSurfaceLockCount !== 0) return;
    const b = document.body;
    const h = document.documentElement;
    b.style.userSelect = dragSurfacePrevUserSelect;
    b.style.webkitUserSelect = dragSurfacePrevWebkitUserSelect;
    b.style.cursor = dragSurfacePrevCursorBody;
    h.style.cursor = dragSurfacePrevCursorHtml;
  }

  /**
   * Make an element draggable, constrained to viewport.
   * Uses Pointer Events + setPointerCapture so dragging stays smooth when the cursor moves over
   * iframes (Gmail/Outlook) or other elements that would otherwise steal mouse events.
   * @param {(x: number, y: number) => void} [onMove] - optional, e.g. track drag state
   * @param {(x: number, y: number) => void} [onEnd] - persist final position (recommended)
   */
  function makeDraggable(el, onMove, onEnd) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = el.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      const elW = rect.width;
      const elH = rect.height;
      el.style.cursor = "grabbing";
      el.setAttribute("data-replymate-dragging", "1");
      const capId = e.pointerId;
      try {
        el.setPointerCapture(capId);
      } catch (_) { /* ignore */ }
      lockDragSurface();

      const onPointerMove = (ev) => {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newLeft = clamp(startLeft + dx, 0, window.innerWidth - elW);
        const newTop = clamp(startTop + dy, 0, window.innerHeight - elH);
        el.style.left = newLeft + "px";
        el.style.top = newTop + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.transform = "none";
        if (onMove) onMove(newLeft, newTop);
      };

      let ended = false;
      const endDrag = () => {
        if (ended) return;
        ended = true;
        el.style.cursor = "grab";
        el.removeAttribute("data-replymate-dragging");
        unlockDragSurface();
        try {
          el.releasePointerCapture(capId);
        } catch (_) { /* ignore */ }
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", endDrag);
        el.removeEventListener("pointercancel", endDrag);
        window.removeEventListener("blur", endDrag);
        if (onEnd) {
          const r = el.getBoundingClientRect();
          onEnd(r.left, r.top);
        }
      };

      el.addEventListener("pointermove", onPointerMove, { passive: false });
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      window.addEventListener("blur", endDrag);
    });
  }

  /**
   * Make a panel draggable by its header (drag handle moves the panel), constrained to viewport.
   * Pointer capture keeps drag reliable over iframes and complex page layers.
   * @param {(x: number, y: number) => void} [onMove]
   * @param {(x: number, y: number) => void} [onEnd] - persist final position (recommended)
   */
  function makePanelDraggable(handle, panel, onMove, onEnd) {
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (
        e.target.closest
        && e.target.closest(
          'button, [role="button"], input, select, textarea, label, video, audio, #replymate-translate-resize'
        )
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      const initialLeft = rect.left;
      const initialTop = rect.top;
      const panelW = rect.width;
      const panelH = rect.height;
      handle.style.cursor = "grabbing";
      handle.setAttribute("data-replymate-dragging", "1");
      const capId = e.pointerId;
      try {
        handle.setPointerCapture(capId);
      } catch (_) { /* ignore */ }
      lockDragSurface();

      const onPointerMove = (ev) => {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newLeft = clamp(initialLeft + dx, 0, window.innerWidth - panelW);
        const newTop = clamp(initialTop + dy, 0, window.innerHeight - panelH);
        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.transform = "none";
        if (onMove) onMove(newLeft, newTop);
      };

      let ended = false;
      const endDrag = () => {
        if (ended) return;
        ended = true;
        handle.style.cursor = "grab";
        handle.removeAttribute("data-replymate-dragging");
        unlockDragSurface();
        try {
          handle.releasePointerCapture(capId);
        } catch (_) { /* ignore */ }
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", endDrag);
        handle.removeEventListener("pointercancel", endDrag);
        window.removeEventListener("blur", endDrag);
        if (onEnd) {
          const r = panel.getBoundingClientRect();
          onEnd(r.left, r.top);
        }
      };

      handle.addEventListener("pointermove", onPointerMove, { passive: false });
      handle.addEventListener("pointerup", endDrag);
      handle.addEventListener("pointercancel", endDrag);
      window.addEventListener("blur", endDrag);
    });
  }

  /**
   * Resize panel from bottom-right handle; size is clamped and persisted.
   */
  function makePanelResizable(panel, handle) {
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = rect.width;
      const startH = rect.height;
      const capId = e.pointerId;
      try {
        handle.setPointerCapture(capId);
      } catch (_) { /* ignore */ }
      lockDragSurface();

      const onPointerMove = (ev) => {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const { w, h } = clampPanelSize(startW + dx, startH + dy);
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
      };

      let ended = false;
      const endResize = () => {
        if (ended) return;
        ended = true;
        unlockDragSurface();
        try {
          handle.releasePointerCapture(capId);
        } catch (_) { /* ignore */ }
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", endResize);
        handle.removeEventListener("pointercancel", endResize);
        window.removeEventListener("blur", endResize);
        const r = panel.getBoundingClientRect();
        const { w, h } = clampPanelSize(r.width, r.height);
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
        savePanelSize(w, h, true);
      };

      handle.addEventListener("pointermove", onPointerMove, { passive: false });
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
      window.addEventListener("blur", endResize);
    });
  }

  /**
   * Create and inject the translation panel UI.
   */
  function createPanel() {
    if (document.getElementById(TRANSLATION_PANEL_ID)) return document.getElementById(TRANSLATION_PANEL_ID);

    const panel = document.createElement("div");
    panel.id = TRANSLATION_PANEL_ID;
    panel.style.cssText = `
      position: fixed;
      box-sizing: border-box;
      width: ${PANEL_DEFAULT_WIDTH}px;
      height: ${PANEL_DEFAULT_HEIGHT}px;
      border-radius: 12px;
      z-index: 2147483646;
      font-family: 'Google Sans', Roboto, -apple-system, sans-serif;
      font-size: 14px;
      overflow: hidden;
      display: none;
      flex-direction: column;
      opacity: 0;
      transform: scale(0.96);
      transition: opacity 0.2s ease, transform 0.2s ease;
    `;
    const style = document.createElement("style");
    style.textContent = `
      /* Translate panel themes — same palette as popup (html[data-theme]); storage is still independent. */
      #replymate-translation-panel[data-theme="basic"] {
        color-scheme: light;
        --tp-panel-bg: #ffffff;
        --tp-body: #f7f7f8;
        --tp-text: #1a1a1a;
        --tp-muted: #6b6b6b;
        --tp-border: #e0e0e0;
        --tp-input-bg: #ffffff;
        --tp-input-text: #1a1a1a;
        --tp-result-bg: #ffffff;
        --tp-result-text: #1a1a1a;
        --tp-footer-bg: #f7f7f8;
        --tp-footer-border: #dcdcdc;
        --tp-copy-bg: #ececef;
        --tp-copy-hover: #e2e2e8;
        --tp-copy-text: #1a1d21;
        --tp-copy-border: #c4c6cc;
        --tp-spinner-track: #e0e0e0;
        --tp-loading: #6b6b6b;
        --tp-error: #d93025;
        --tp-resize: rgba(0, 0, 0, 0.07);
        --tp-resize-hover: rgba(0, 0, 0, 0.11);
        --tp-resize-grip: rgba(121, 67, 241, 0.5);
        --tp-focus-ring: rgba(0, 0, 0, 0.14);
        --tp-primary: #7943f1;
        --tp-primary-hover: #6b3ad4;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(0, 0, 0, 0.07);
        --tp-primary-shadow-hover: rgba(0, 0, 0, 0.12);
        --tp-accent-soft: #f0f0f2;
        --tp-accent-border: #dcdcdc;
        --tp-accent-border-strong: #525252;
        --tp-accent-ring: rgba(0, 0, 0, 0.14);
        --tp-accent-shadow: rgba(0, 0, 0, 0.07);
        --tp-accent-glow: rgba(0, 0, 0, 0.04);
      }
      #replymate-translation-panel[data-theme="light"] {
        color-scheme: light;
        --tp-panel-bg: #ffffff;
        --tp-body: #f5f5f5;
        --tp-text: #222222;
        --tp-muted: #5f6368;
        --tp-border: #d0d7de;
        --tp-input-bg: #ffffff;
        --tp-input-text: #222222;
        --tp-result-bg: #ffffff;
        --tp-result-text: #222222;
        --tp-footer-bg: #f5f5f5;
        --tp-footer-border: #d4c9f5;
        --tp-copy-bg: #ede7ff;
        --tp-copy-hover: #e2dcfc;
        --tp-copy-text: #2d1f4d;
        --tp-copy-border: #c4b5f0;
        --tp-spinner-track: #e8eaed;
        --tp-loading: #5f6368;
        --tp-error: #d93025;
        --tp-resize: rgba(121, 67, 241, 0.12);
        --tp-resize-hover: rgba(121, 67, 241, 0.2);
        --tp-resize-grip: rgba(121, 67, 241, 0.5);
        --tp-focus-ring: rgba(121, 67, 241, 0.22);
        --tp-primary: #8b7ed4;
        --tp-primary-hover: #7d6fc8;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(91, 33, 182, 0.11);
        --tp-primary-shadow-hover: rgba(91, 33, 182, 0.17);
        --tp-accent-soft: #f0ebff;
        --tp-accent-border: #d4c9f5;
        --tp-accent-border-strong: #9370db;
        --tp-accent-ring: rgba(121, 67, 241, 0.22);
        --tp-accent-shadow: rgba(121, 67, 241, 0.14);
        --tp-accent-glow: rgba(121, 67, 241, 0.06);
      }
      #replymate-translation-panel[data-theme="sepia"] {
        color-scheme: light;
        --tp-panel-bg: #faf6f0;
        --tp-body: #efe8dc;
        --tp-text: #2c2416;
        --tp-muted: #6b5d4a;
        --tp-border: #c9b8a0;
        --tp-input-bg: #faf6f0;
        --tp-input-text: #2c2416;
        --tp-result-bg: #faf6f0;
        --tp-result-text: #2c2416;
        --tp-footer-bg: #efe8dc;
        --tp-footer-border: #c4b5c8;
        --tp-copy-bg: #ded4c8;
        --tp-copy-hover: #d2c6b8;
        --tp-copy-text: #1f160c;
        --tp-copy-border: #b5a896;
        --tp-spinner-track: #c9b8a0;
        --tp-loading: #6b5d4a;
        --tp-error: #b3261e;
        --tp-resize: rgba(107, 80, 150, 0.12);
        --tp-resize-hover: rgba(107, 80, 150, 0.2);
        --tp-resize-grip: rgba(121, 67, 241, 0.45);
        --tp-focus-ring: rgba(107, 80, 150, 0.28);
        --tp-primary: #8d7358;
        --tp-primary-hover: #7d664d;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(70, 50, 35, 0.12);
        --tp-primary-shadow-hover: rgba(70, 50, 35, 0.19);
        --tp-accent-soft: #ebe4f0;
        --tp-accent-border: #c4b5c8;
        --tp-accent-border-strong: #8b6bb5;
        --tp-accent-ring: rgba(107, 80, 150, 0.28);
        --tp-accent-shadow: rgba(121, 67, 241, 0.12);
        --tp-accent-glow: rgba(107, 80, 150, 0.08);
      }
      #replymate-translation-panel[data-theme="rose"] {
        color-scheme: light;
        --tp-panel-bg: #ffffff;
        --tp-body: #fdf2f8;
        --tp-text: #431a3a;
        --tp-muted: #9d6b8a;
        --tp-border: #e9c4d8;
        --tp-input-bg: #ffffff;
        --tp-input-text: #431a3a;
        --tp-result-bg: #ffffff;
        --tp-result-text: #431a3a;
        --tp-footer-bg: #fdf2f8;
        --tp-footer-border: #e8d4f0;
        --tp-copy-bg: #fce8f2;
        --tp-copy-hover: #f9d9e8;
        --tp-copy-text: #7c0f4a;
        --tp-copy-border: #f0b8d4;
        --tp-spinner-track: #e9c4d8;
        --tp-loading: #9d6b8a;
        --tp-error: #dc2626;
        --tp-resize: rgba(192, 132, 252, 0.14);
        --tp-resize-hover: rgba(192, 132, 252, 0.22);
        --tp-resize-grip: rgba(121, 67, 241, 0.5);
        --tp-focus-ring: rgba(192, 132, 252, 0.35);
        --tp-primary: #e06096;
        --tp-primary-hover: #d14b84;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(190, 70, 130, 0.14);
        --tp-primary-shadow-hover: rgba(190, 70, 130, 0.21);
        --tp-accent-soft: #faf0fc;
        --tp-accent-border: #e8d4f0;
        --tp-accent-border-strong: #c084fc;
        --tp-accent-ring: rgba(192, 132, 252, 0.35);
        --tp-accent-shadow: rgba(167, 139, 250, 0.18);
        --tp-accent-glow: rgba(192, 132, 252, 0.1);
      }
      #replymate-translation-panel[data-theme="slate"] {
        color-scheme: light;
        --tp-panel-bg: #ffffff;
        --tp-body: #f1f5f9;
        --tp-text: #0f172a;
        --tp-muted: #64748b;
        --tp-border: #cbd5e1;
        --tp-input-bg: #ffffff;
        --tp-input-text: #0f172a;
        --tp-result-bg: #ffffff;
        --tp-result-text: #0f172a;
        --tp-footer-bg: #f1f5f9;
        --tp-footer-border: #c7d2fe;
        --tp-copy-bg: #e2e8f0;
        --tp-copy-hover: #d6dee9;
        --tp-copy-text: #0f172a;
        --tp-copy-border: #94a3b8;
        --tp-spinner-track: #e2e8f0;
        --tp-loading: #64748b;
        --tp-error: #dc2626;
        --tp-resize: rgba(99, 102, 241, 0.14);
        --tp-resize-hover: rgba(99, 102, 241, 0.22);
        --tp-resize-grip: rgba(99, 102, 241, 0.5);
        --tp-focus-ring: rgba(99, 102, 241, 0.28);
        --tp-primary: #6670e8;
        --tp-primary-hover: #575fde;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(79, 70, 229, 0.1);
        --tp-primary-shadow-hover: rgba(79, 70, 229, 0.17);
        --tp-accent-soft: #e8eef5;
        --tp-accent-border: #c7d2fe;
        --tp-accent-border-strong: #6366f1;
        --tp-accent-ring: rgba(99, 102, 241, 0.28);
        --tp-accent-shadow: rgba(79, 70, 229, 0.14);
        --tp-accent-glow: rgba(99, 102, 241, 0.08);
      }
      #replymate-translation-panel[data-theme="dark"] {
        color-scheme: dark;
        --tp-panel-bg: #303134;
        --tp-body: #202124;
        --tp-text: #e8eaed;
        --tp-muted: #9aa0a6;
        --tp-border: #5f6368;
        --tp-input-bg: #303134;
        --tp-input-text: #e8eaed;
        --tp-result-bg: #303134;
        --tp-result-text: #e8eaed;
        --tp-footer-bg: #202124;
        --tp-footer-border: #5c4d78;
        --tp-copy-bg: #3f4044;
        --tp-copy-hover: #4a4b50;
        --tp-copy-text: #ffffff;
        --tp-copy-border: #6f7076;
        --tp-spinner-track: #5f6368;
        --tp-loading: #9aa0a6;
        --tp-error: #f28b82;
        --tp-resize: rgba(121, 67, 241, 0.2);
        --tp-resize-hover: rgba(167, 139, 250, 0.28);
        --tp-resize-grip: rgba(167, 139, 250, 0.55);
        --tp-focus-ring: rgba(167, 139, 250, 0.38);
        --tp-primary: #7d6ec8;
        --tp-primary-hover: #7060b8;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(100, 80, 200, 0.2);
        --tp-primary-shadow-hover: rgba(100, 80, 200, 0.28);
        --tp-accent-soft: #2a2438;
        --tp-accent-border: #5c4d78;
        --tp-accent-border-strong: #a78bfa;
        --tp-accent-ring: rgba(167, 139, 250, 0.38);
        --tp-accent-shadow: rgba(121, 67, 241, 0.28);
        --tp-accent-glow: rgba(121, 67, 241, 0.12);
      }
      #replymate-translation-panel[data-theme="basic-dark"] {
        color-scheme: dark;
        --tp-panel-bg: #2c2c2e;
        --tp-body: #1c1c1e;
        --tp-text: #e8e8ea;
        --tp-muted: #a1a1a6;
        --tp-border: #3a3a3c;
        --tp-input-bg: #2c2c2e;
        --tp-input-text: #f2f2f7;
        --tp-result-bg: #2c2c2e;
        --tp-result-text: #f2f2f7;
        --tp-footer-bg: #1c1c1e;
        --tp-footer-border: #48484a;
        --tp-copy-bg: #404042;
        --tp-copy-hover: #4a4a4e;
        --tp-copy-text: #ffffff;
        --tp-copy-border: #6c6c70;
        --tp-spinner-track: #48484a;
        --tp-loading: #a1a1a6;
        --tp-error: #ff453a;
        --tp-resize: rgba(255, 255, 255, 0.12);
        --tp-resize-hover: rgba(255, 255, 255, 0.18);
        --tp-resize-grip: rgba(255, 255, 255, 0.4);
        --tp-focus-ring: rgba(255, 255, 255, 0.18);
        --tp-primary: #6a6a6e;
        --tp-primary-hover: #5c5c60;
        --tp-primary-text: #ffffff;
        --tp-primary-shadow: rgba(0, 0, 0, 0.28);
        --tp-primary-shadow-hover: rgba(0, 0, 0, 0.36);
        --tp-accent-soft: #252528;
        --tp-accent-border: #48484a;
        --tp-accent-border-strong: #8e8e93;
        --tp-accent-ring: rgba(255, 255, 255, 0.18);
        --tp-accent-shadow: rgba(0, 0, 0, 0.45);
        --tp-accent-glow: rgba(0, 0, 0, 0.25);
      }
      /*
       * Header + floating FAB share --tp-header-gradient (same as popup wordmark where applicable).
       * In a 2-stop gradient: first color = start (135deg → toward top-left), second = end (toward bottom-right).
       */
      #replymate-translation-panel[data-theme="basic"],
      #replymate-translation-icon[data-theme="basic"] {
        --tp-header-gradient: linear-gradient(135deg, #7943f1, #9d6cf7);
        --tp-fab-shadow: rgba(121, 67, 241, 0.32);
        --tp-fab-shadow-hover: rgba(121, 67, 241, 0.48);
      }
      /* Light — soft lavender only (no dark violet #5b21b6); matches --tp-primary #8b7ed4 */
      #replymate-translation-panel[data-theme="light"],
      #replymate-translation-icon[data-theme="light"] {
        --tp-header-gradient: linear-gradient(135deg, #a090e0 0%, #8b7ed4 45%, #b4a3ee 100%);
        --tp-fab-shadow: rgba(139, 126, 212, 0.28);
        --tp-fab-shadow-hover: rgba(139, 126, 212, 0.42);
      }
      #replymate-translation-panel[data-theme="sepia"],
      #replymate-translation-icon[data-theme="sepia"] {
        --tp-header-gradient: linear-gradient(135deg, #5c4033 0%, #8b6914 38%, #6b4f3a 100%);
        --tp-fab-shadow: rgba(60, 40, 30, 0.35);
        --tp-fab-shadow-hover: rgba(60, 40, 30, 0.48);
      }
      #replymate-translation-panel[data-theme="rose"],
      #replymate-translation-icon[data-theme="rose"] {
        --tp-header-gradient: linear-gradient(135deg, #a21caf 0%, #ec4899 45%, #7c3aed 100%);
        --tp-fab-shadow: rgba(167, 80, 180, 0.3);
        --tp-fab-shadow-hover: rgba(167, 80, 180, 0.45);
      }
      #replymate-translation-panel[data-theme="slate"],
      #replymate-translation-icon[data-theme="slate"] {
        --tp-header-gradient: linear-gradient(135deg, #6366f1 0%, #475569 48%, #7943f1 100%);
        --tp-fab-shadow: rgba(79, 70, 229, 0.28);
        --tp-fab-shadow-hover: rgba(79, 70, 229, 0.42);
      }
      #replymate-translation-panel[data-theme="dark"],
      #replymate-translation-icon[data-theme="dark"] {
        --tp-header-gradient: linear-gradient(135deg, #5c4d78, #7943f1);
        --tp-fab-shadow: rgba(0, 0, 0, 0.45);
        --tp-fab-shadow-hover: rgba(121, 67, 241, 0.42);
      }
      #replymate-translation-panel[data-theme="basic-dark"],
      #replymate-translation-icon[data-theme="basic-dark"] {
        --tp-header-gradient: linear-gradient(135deg, #48484a, #636366);
        --tp-fab-shadow: rgba(0, 0, 0, 0.42);
        --tp-fab-shadow-hover: rgba(0, 0, 0, 0.55);
      }
      #replymate-translation-panel {
        background: var(--tp-panel-bg);
        color: var(--tp-text);
        border: 1px solid var(--tp-accent-border);
        box-shadow: 0 2px 14px var(--tp-accent-shadow), 0 0 0 1px var(--tp-accent-glow);
      }
      #replymate-translate-header {
        background: var(--tp-header-gradient) !important;
        color: #fff !important;
      }
      #replymate-translate-theme {
        background: transparent !important;
        border: none;
        box-shadow: none;
        border-radius: 6px;
        width: 28px;
        height: 28px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      #replymate-translate-theme:hover,
      #replymate-translate-theme:active {
        background: transparent !important;
        box-shadow: none;
      }
      #replymate-translate-theme:focus-visible {
        outline: 2px solid rgba(255,255,255,0.65);
        outline-offset: 2px;
      }
      #replymate-translate-theme img {
        display: block;
        opacity: 0.92;
        transition: opacity 0.15s ease, filter 0.15s ease;
        pointer-events: none;
      }
      #replymate-translate-theme:hover img {
        opacity: 1;
        filter: brightness(1.12);
      }
      #replymate-translation-panel select,
      #replymate-translation-panel textarea,
      #replymate-translation-panel select option {
        color: var(--tp-input-text) !important;
        background-color: var(--tp-input-bg) !important;
      }
      #replymate-translation-panel #replymate-translate-target,
      #replymate-translation-panel #replymate-translate-input {
        border-color: var(--tp-border) !important;
      }
      #replymate-translation-panel #replymate-translate-input::placeholder {
        color: var(--tp-muted) !important;
        opacity: 1;
      }
      #replymate-translation-panel .replymate-translate-body-inner {
        background: linear-gradient(165deg, var(--tp-accent-soft) 0%, var(--tp-body) 38%, var(--tp-body) 100%);
        color: var(--tp-text);
      }
      #replymate-translation-panel .replymate-translate-body-inner label { color: var(--tp-muted) !important; }
      #replymate-translation-panel #replymate-translate-usage {
        color: var(--tp-muted) !important;
        line-height: 1.35;
        flex: 0 1 auto;
        min-width: 0;
        text-align: left;
      }
      #replymate-translation-panel .replymate-translate-main {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-x: hidden;
        overflow-y: auto;
      }
      #replymate-translation-panel .replymate-translate-result-section {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #replymate-translation-panel #replymate-translate-result {
        flex: 1 1 auto;
        min-height: 96px;
        background: var(--tp-result-bg) !important;
        color: var(--tp-result-text) !important;
        border: 1px solid var(--tp-border) !important;
        box-shadow: none;
      }
      #replymate-translation-panel #replymate-translate-footer {
        flex-shrink: 0;
        margin-top: 4px;
        padding-top: 0;
        padding-bottom: 0;
        border-top: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        background: var(--tp-footer-bg);
        box-shadow: none;
        outline: none;
      }
      /* Primary actions: same highlight as panel header / FAB (--tp-header-gradient). */
      #replymate-translation-panel .replymate-translate-btn {
        padding: 6px 10px;
        background: var(--tp-header-gradient) !important;
        color: #fff !important;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        text-align: center;
        transition: filter 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        flex: 1;
        min-width: 0;
      }
      #replymate-translation-panel .replymate-translate-btn:hover {
        filter: brightness(1.12) saturate(1.05);
        transform: translateY(-1px);
        box-shadow: 0 5px 16px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12);
      }
      #replymate-translation-panel .replymate-translate-btn:active {
        filter: brightness(0.96);
        transform: translateY(0);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
      }
      #replymate-translation-panel .replymate-translate-btn:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.85);
        outline-offset: 2px;
      }
      #replymate-translation-panel .replymate-translate-manual {
        padding: 6px 12px;
        background: var(--tp-header-gradient) !important;
        color: #fff !important;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: filter 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }
      #replymate-translation-panel .replymate-translate-manual:hover {
        filter: brightness(1.12) saturate(1.05);
        transform: translateY(-1px);
        box-shadow: 0 5px 16px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12);
      }
      #replymate-translation-panel .replymate-translate-manual:active {
        filter: brightness(0.96);
        transform: translateY(0);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
      }
      #replymate-translation-panel .replymate-translate-manual:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.85);
        outline-offset: 2px;
      }
      #replymate-translation-panel .replymate-translate-actions {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      #replymate-translation-panel .replymate-translate-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 32px;
        padding: 0;
        flex-shrink: 0;
        background: var(--tp-copy-bg);
        color: var(--tp-copy-text);
        border: 1px solid var(--tp-copy-border, var(--tp-border));
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, color 0.18s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      }
      #replymate-translation-panel .replymate-translate-clear .replymate-translate-clear-icon {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }
      #replymate-translation-panel .replymate-translate-clear .replymate-translate-clear-icon path {
        fill: currentColor;
      }
      #replymate-translation-panel .replymate-translate-clear:hover {
        background: var(--tp-copy-hover);
        border-color: var(--tp-border);
        color: var(--tp-error);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      #replymate-translation-panel .replymate-translate-clear:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #replymate-translation-panel .replymate-translate-clear:focus-visible {
        outline: 2px solid var(--tp-primary);
        outline-offset: 2px;
      }
      #replymate-translation-panel .replymate-translate-copy {
        padding: 6px 12px;
        background: var(--tp-copy-bg);
        color: var(--tp-copy-text);
        border: 1px solid var(--tp-copy-border, var(--tp-border));
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      }
      #replymate-translation-panel .replymate-translate-copy:hover {
        background: var(--tp-copy-hover);
        border-color: var(--tp-border);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      #replymate-translation-panel[data-theme="dark"] .replymate-translate-copy,
      #replymate-translation-panel[data-theme="basic-dark"] .replymate-translate-copy,
      #replymate-translation-panel[data-theme="dark"] .replymate-translate-clear,
      #replymate-translation-panel[data-theme="basic-dark"] .replymate-translate-clear {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
      }
      #replymate-translation-panel[data-theme="dark"] .replymate-translate-copy:hover,
      #replymate-translation-panel[data-theme="basic-dark"] .replymate-translate-copy:hover,
      #replymate-translation-panel[data-theme="dark"] .replymate-translate-clear:hover,
      #replymate-translation-panel[data-theme="basic-dark"] .replymate-translate-clear:hover {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.55);
      }
      #replymate-translation-panel .replymate-translate-copy:active {
        transform: none;
      }
      #replymate-translation-panel .replymate-translate-copy:focus-visible {
        outline: 2px solid var(--tp-primary);
        outline-offset: 2px;
      }
      #replymate-translation-panel #replymate-translate-usage-wrap {
        flex: 1;
        min-width: 0;
        max-width: 82%;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      /* Gold CTA: lighter hover (same as Gmail reply bar); popup uses darker gold hover */
      #replymate-translation-panel .replymate-translate-pricing-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        border-radius: 6px;
        border: 1px solid #ffff99;
        cursor: pointer;
        font-family: inherit;
        background: linear-gradient(135deg, #ffd700 0%, #ffd700 50%, #ffff99 100%) !important;
        color: #2c1810 !important;
        box-shadow: 0 2px 4px rgba(212, 175, 55, 0.3);
        white-space: nowrap;
        transition: all 0.2s ease;
      }
      #replymate-translation-panel .replymate-translate-pricing-cta:hover {
        background: linear-gradient(135deg, #ffd700 0%, #ffd700 50%, #ffed4e 100%) !important;
        color: #2c1810 !important;
        box-shadow: 0 4px 8px rgba(212, 175, 55, 0.4);
        transform: translateY(-1px);
      }
      #replymate-translation-panel .replymate-translate-pricing-cta:focus-visible {
        outline: 2px solid #c9a227;
        outline-offset: 2px;
      }
      #replymate-translation-panel .replymate-translate-pricing-cta[hidden] {
        display: none !important;
      }
      #replymate-translate-close:hover { background:rgba(255,255,255,0.4) !important; }
      #replymate-translate-close:focus-visible { outline:2px solid rgba(255,255,255,0.8);outline-offset:2px; }
      #replymate-translate-header { cursor:grab; flex-shrink:0; }
      #replymate-translate-header:active { cursor:grabbing; }
      #replymate-translate-resize {
        position:absolute;
        right:0;
        bottom:0;
        width:22px;
        height:22px;
        cursor:nwse-resize;
        z-index:3;
        border-radius:0 0 12px 0;
        touch-action:none;
        background:linear-gradient(135deg,transparent 52%,var(--tp-resize) 52%);
      }
      #replymate-translate-resize:hover { background:linear-gradient(135deg,transparent 48%,var(--tp-resize-hover) 52%); }
      #replymate-translate-resize::after {
        content:"";
        position:absolute;
        right:5px;
        bottom:5px;
        width:8px;
        height:8px;
        border-right:2px solid var(--tp-resize-grip);
        border-bottom:2px solid var(--tp-resize-grip);
      }
      #replymate-translate-input:focus {
        outline: none;
        border-color: var(--tp-accent-border-strong) !important;
        box-shadow: 0 0 0 2px var(--tp-accent-ring);
      }
      #replymate-translate-target:focus {
        outline: none;
        border-color: var(--tp-accent-border-strong) !important;
        box-shadow: 0 0 0 2px var(--tp-accent-ring);
      }
      #replymate-translate-result.replymate-result-error { color:var(--tp-error) !important; }
      #replymate-translate-result.replymate-loading { color:var(--tp-loading);display:flex;align-items:center;gap:6px; }
      #replymate-translation-panel .replymate-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--tp-spinner-track);
        border-top-color: var(--tp-primary);
        border-radius: 50%;
        animation: replymate-spin 0.7s linear infinite;
      }
      #replymate-translation-icon {
        transition: box-shadow 0.2s ease, transform 0.2s ease;
        background: var(--tp-header-gradient) !important;
        box-shadow: 0 4px 16px var(--tp-fab-shadow) !important;
      }
      #replymate-translation-icon:hover:not([data-replymate-dragging="1"]) {
        box-shadow: 0 6px 20px var(--tp-fab-shadow-hover) !important;
        transform: scale(1.05);
      }
      #replymate-translation-icon:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.75);
        outline-offset: 2px;
      }
      #replymate-translation-icon[data-theme="basic-dark"]:focus-visible {
        outline-color: rgba(255, 255, 255, 0.45);
      }
      @keyframes replymate-spin { to { transform:rotate(360deg); } }
    `;
    document.head.appendChild(style);

    const logoUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("icons/icon32.png") : "";
    const colorWheelUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("icons/colorWheel.png") : "";
    panel.setAttribute("data-theme", DEFAULT_TRANSLATION_PANEL_THEME);
    panel.innerHTML = `
      <div id="replymate-translate-header" style="padding:8px 12px;color:#fff;display:flex;justify-content:space-between;align-items:center;user-select:none;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${logoUrl ? `<img src="${logoUrl}" alt="ReplyMate" style="width:18px;height:18px;border-radius:4px;flex-shrink:0;" />` : ""}
          <span id="replymate-translate-title" style="font-weight:600;font-size:13px;letter-spacing:0.02em;">ReplyMate Translate</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" id="replymate-translate-theme" aria-label="Cycle theme" title="Cycle theme">
            ${colorWheelUrl ? `<img src="${colorWheelUrl}" alt="" width="18" height="18" style="display:block;pointer-events:none;" />` : `<span style="font-size:14px;line-height:1;">◐</span>`}
          </button>
          <button type="button" id="replymate-translate-close" style="background:rgba(255,255,255,0.25);border:none;cursor:pointer;font-size:16px;color:#fff;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">&times;</button>
      </div>
      </div>
      <div class="replymate-translate-body-inner" style="padding:14px;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div id="replymate-translate-main" class="replymate-translate-main">
          <div id="replymate-translate-gmail-buttons" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;flex-shrink:0;">
            <button id="replymate-translate-latest" class="replymate-translate-btn">Translate latest message</button>
            <button id="replymate-translate-reply" class="replymate-translate-btn">Translate reply</button>
          </div>
          <div style="flex-shrink:0;">
            <label id="replymate-translate-to-label" style="font-size:11px;margin-bottom:3px;display:block;">Translate to</label>
            <select id="replymate-translate-target" style="width:100%;padding:6px 10px;border:1px solid;border-radius:6px;font-size:12px;box-sizing:border-box;font-family:inherit;margin-bottom:8px;cursor:pointer;">
              <option value="">System Language</option>
            </select>
          </div>
          <div style="flex-shrink:0;">
            <label id="replymate-translate-paste-label" style="font-size:11px;margin-bottom:3px;display:block;">Paste or type text to translate</label>
            <textarea id="replymate-translate-input" placeholder="Paste or type text to translate..." rows="5" style="width:100%;min-height:112px;padding:10px;border:1px solid;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;font-family:inherit;"></textarea>
            <div class="replymate-translate-actions">
              <button type="button" id="replymate-translate-manual" class="replymate-translate-manual">Translate</button>
              <button type="button" id="replymate-translate-clear" class="replymate-translate-clear" aria-label="Clear" title="Clear">
                <svg class="replymate-translate-clear-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7H6zm3 2h2v9H9V9zm4 0h2v9h-2V9zm5-4h-3.5l-1-1h-5l-1 1H5v2h14V5z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="replymate-translate-result-section">
            <label id="replymate-translate-result-label" style="font-size:11px;margin-bottom:3px;display:block;flex-shrink:0;">Result</label>
            <div id="replymate-translate-result" data-placeholder="" style="overflow-y:auto;overflow-x:hidden;padding:10px;box-sizing:border-box;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.5;transition:border-color 0.2s,box-shadow 0.2s;"></div>
          </div>
        </div>
        <div id="replymate-translate-footer">
          <button id="replymate-translate-copy" class="replymate-translate-copy">Copy</button>
          <div id="replymate-translate-usage-wrap">
            <button type="button" id="replymate-translate-pricing-cta" class="replymate-translate-pricing-cta" hidden>Manage Subscription</button>
            <span id="replymate-translate-usage" style="font-size:11px;"></span>
          </div>
      </div>
      </div>
      <div id="replymate-translate-resize" title="Resize" aria-label="Resize panel" role="separator"></div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  /**
   * Fetch usage from backend (plan, translation usage).
   */
  async function fetchUsage() {
    try {
      const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
      if (!token) return null;
      const res = await fetch(`${BACKEND_BASE}/usage`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.set({
            [USAGE_CACHE_KEY]: { data, timestamp: Date.now() },
          });
        }
      } catch (e) { /* ignore */ }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Update usage display (plan + translation usage) in bottom-right.
   */
  async function updateUsageDisplay(panel) {
    const usageEl = panel && panel.querySelector("#replymate-translate-usage");
    const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
    const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
    const usage = await fetchUsage();
    if (usageEl) {
      const planNames = (typeof getTranslation === "function" ? getTranslation("planNames", lang) : null) || { free: "Free", pro: "Pro", pro_plus: "Pro+" };
      if (typeof planNames === "object") {
        if (!usage) {
          usageEl.textContent = t("signInToSeeUsage");
        } else {
          const planName = planNames[usage.plan] || planNames.free || "Free";
          const used = usage.translationUsed;
          const limit = usage.translationLimit;
          let remaining = usage.translationRemaining;
          if (limit == null) {
            usageEl.textContent = `${planName} · ${t("unlimitedTranslations")}`;
          } else if (typeof limit === "number") {
            if (typeof remaining !== "number" && typeof used === "number") {
              remaining = Math.max(0, limit - used);
            }
            if (typeof remaining === "number") {
              const template = t("translationUsageDaily");
              const line = String(template)
                .replace(/\{remaining\}/g, String(remaining))
                .replace(/\{limit\}/g, String(limit));
              usageEl.textContent = `${planName} · ${line}`;
            } else {
              usageEl.textContent = planName;
            }
          } else {
            usageEl.textContent = planName;
          }
        }
      } else {
        usageEl.textContent = "";
      }
    }
    const pricingCta = panel && panel.querySelector("#replymate-translate-pricing-cta");
    if (pricingCta) {
      pricingCta.textContent = t("manageSubscription");
      let showPricing = false;
      if (usage && usage.translationLimit != null) {
        let rem = usage.translationRemaining;
        const lim = usage.translationLimit;
        const used = usage.translationUsed;
        if (typeof rem !== "number" && typeof used === "number" && typeof lim === "number") {
          rem = Math.max(0, lim - used);
        }
        showPricing = typeof rem === "number" && typeof lim === "number" && rem === 0;
      }
      pricingCta.hidden = !showPricing;
    }
    return usage;
  }

  /**
   * Update panel labels with current language.
   */
  async function updatePanelLabels(panel) {
    const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
    const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);

    const titleEl = document.getElementById("replymate-translate-title");
    if (titleEl) titleEl.textContent = t("translatePanelTitle");

    const gmailBtns = document.getElementById("replymate-translate-gmail-buttons");
    if (gmailBtns) gmailBtns.style.display = isGmailPage() ? "flex" : "none";

    const toLabel = document.getElementById("replymate-translate-to-label");
    if (toLabel) toLabel.textContent = t("translateToLabel");

    const usageForLock = await updateUsageDisplay(panel);

    const themeBtnLock = document.getElementById("replymate-translate-theme");
    if (themeBtnLock) {
      const locked = !usageForLock || !planAllowsPremiumColorThemes(usageForLock.plan);
      if (locked) {
        const hint = t("colorThemeUpgradePrompt");
        themeBtnLock.setAttribute("aria-label", hint);
        themeBtnLock.title = hint;
      } else {
        const tt = t("translateCycleTheme");
        themeBtnLock.setAttribute("aria-label", tt);
        themeBtnLock.title = tt;
      }
    }

    await applyTranslationPanelThemeForUsage(panel, usageForLock);

    const targetSelect = document.getElementById("replymate-translate-target");
    if (targetSelect) {
      const opts = targetSelect.querySelectorAll("option");
      if (opts[0]) opts[0].textContent = t("systemLanguage");
      if (typeof window.REPLYMATE_TARGET_LANGUAGES !== "undefined" && targetSelect.options.length <= 1) {
        window.REPLYMATE_TARGET_LANGUAGES.forEach(({ code, name }) => {
          const opt = document.createElement("option");
          opt.value = code;
          opt.textContent = name;
          targetSelect.appendChild(opt);
        });
      }
      loadTargetLang().then((saved) => {
        if (saved && targetSelect.querySelector(`option[value="${saved}"]`)) {
          targetSelect.value = saved;
        }
      });
    }

    const els = {
      latest: document.getElementById("replymate-translate-latest"),
      reply: document.getElementById("replymate-translate-reply"),
      manual: document.getElementById("replymate-translate-manual"),
      clear: document.getElementById("replymate-translate-clear"),
      input: document.getElementById("replymate-translate-input"),
      copy: document.getElementById("replymate-translate-copy"),
      close: document.getElementById("replymate-translate-close")
    };

    if (els.latest) els.latest.textContent = t("translateLatestMessage");
    if (els.reply) els.reply.textContent = t("translateReply");
    if (els.manual) els.manual.textContent = t("translateManual");
    if (els.clear) {
      const clearLabel = t("translateClear");
      els.clear.setAttribute("aria-label", clearLabel);
      els.clear.title = clearLabel;
    }
    if (els.input) els.input.placeholder = t("translateInputPlaceholder");
    if (els.copy) els.copy.textContent = t("translateCopy");
    if (els.close) els.close.title = t("translateClose");
    const pasteLabel = document.getElementById("replymate-translate-paste-label");
    const resultLabel = document.getElementById("replymate-translate-result-label");
    if (pasteLabel) pasteLabel.textContent = t("translatePasteLabel");
    if (resultLabel) resultLabel.textContent = t("translateResultLabel");
    const resultEl = document.getElementById("replymate-translate-result");
    if (resultEl) resultEl.dataset.placeholder = t("translating");
  }

  /**
   * Clear result and input when panel is closed.
   */
  function clearPanelState(panel) {
    setResult(panel, "");
    const input = document.getElementById("replymate-translate-input");
    if (input) input.value = "";
    lastTranslatedSource = "";
    lastTranslatedTarget = "";
    lastTranslatedResult = "";
  }

  /**
   * Limit reached: message + primary CTA to pricing (DOM-safe, no innerHTML from API text).
   */
  function setResultLimitReached(panel, messageText, t) {
    const el = panel && panel.querySelector("#replymate-translate-result");
    if (!el) return;
    el.classList.remove("replymate-loading");
    el.classList.add("replymate-result-error");
    el.style.color = "";
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "row";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "flex-start";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u26A0\uFE0F";
    icon.style.flexShrink = "0";
    icon.style.lineHeight = "1.45";
    const msg = document.createElement("p");
    msg.style.margin = "0";
    msg.style.lineHeight = "1.45";
    msg.style.whiteSpace = "pre-wrap";
    msg.style.wordBreak = "break-word";
    msg.style.flex = "1";
    msg.style.minWidth = "0";
    msg.textContent = messageText;
    wrap.appendChild(icon);
    wrap.appendChild(msg);
    el.appendChild(wrap);
    el.scrollTop = el.scrollHeight;
  }

  /**
   * Set result area content.
   * For streaming: pass text to show incrementally (like reply generation).
   */
  function setResult(panel, text, isError = false, isLoading = false) {
    const el = panel && panel.querySelector("#replymate-translate-result");
    if (!el) return;
    el.classList.remove("replymate-loading");
    el.classList.toggle("replymate-result-error", !!isError);
    el.style.color = "";
    if (isLoading) {
      el.classList.add("replymate-loading");
      const placeholder = el.dataset.placeholder || "...";
      el.innerHTML = `<span class="replymate-spinner"></span><span>${placeholder}</span>`;
    } else {
      el.textContent = text || "";
      el.scrollTop = el.scrollHeight;
    }
  }

  /**
   * Get effective target language code: from dropdown, or user's default when "My language".
   */
  async function getEffectiveTargetCode(panel) {
    const sel = panel && panel.querySelector("#replymate-translate-target");
    const chosen = sel && sel.value ? String(sel.value).trim() : "";
    if (chosen) return chosen;
    const userLang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
    return mapToTargetCode(userLang);
  }

  /**
   * Enable or disable translate buttons during translation.
   */
  function setTranslateButtonsDisabled(panel, disabled) {
    const ids = ["replymate-translate-latest", "replymate-translate-reply", "replymate-translate-manual"];
    ids.forEach((id) => {
      const btn = panel && panel.querySelector(`#${id}`);
      if (btn) {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? "0.6" : "1";
        btn.style.cursor = disabled ? "not-allowed" : "pointer";
      }
    });
  }

  /**
   * Run translation flow: detect language, skip if same, else translate.
   */
  async function runTranslateFlow(sourceText, panel) {
    if (!sourceText || !sourceText.trim()) {
      setResult(panel, "");
      return;
    }

    const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
    const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
    const targetCode = await getEffectiveTargetCode(panel);

    if (sourceText === lastTranslatedSource && targetCode === lastTranslatedTarget && lastTranslatedResult) {
      showToast(t("contentSame"));
      return;
    }

    const textForDetection = stripForLanguageDetection(sourceText) || sourceText;
    const detected = detectLanguageForTranslation(textForDetection);
    const detectedCode = mapToTargetCode(detected);
    if (detectedCode === targetCode) {
      setResult(panel, t("alreadyInYourLanguage"));
      return;
    }

    if (translateAbortController) {
      translateAbortController.abort();
    }
    translateAbortController = new AbortController();
    const signal = translateAbortController.signal;

    setTranslateButtonsDisabled(panel, true);
    const resultEl = panel && panel.querySelector("#replymate-translate-result");
    if (resultEl) resultEl.dataset.placeholder = t("translating");
    setResult(panel, "", false, true);

    try {
      try {
        const translated = await translateTextStream(sourceText, targetCode, (partial) => {
          setResult(panel, partial);
        }, signal);
        setResult(panel, translated);
        lastTranslatedSource = sourceText;
        lastTranslatedTarget = targetCode;
        lastTranslatedResult = translated;
        updateUsageDisplay(panel).catch(() => {});
      } catch (streamErr) {
        if (streamErr.name === "AbortError") return;
        const translated = await translateText(sourceText, targetCode, signal);
        setResult(panel, translated);
        lastTranslatedSource = sourceText;
        lastTranslatedTarget = targetCode;
        lastTranslatedResult = translated;
        updateUsageDisplay(panel).catch(() => {});
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      const msg = err.message || String(err);
      const isLimitReached = msg.includes("translation_limit_reached");
      const isAuthError = msg.includes("Unauthorized") || msg.includes("Invalid or expired token") || msg.includes("Sign in required");
      const displayMsg = isLimitReached ? t("translateLimitReached")
        : isAuthError ? t("signInRequired")
        : t("translateError") + msg;
      if (isLimitReached) {
        setResultLimitReached(panel, displayMsg, t);
        updateUsageDisplay(panel).catch(() => {});
      } else {
        setResult(panel, displayMsg, true);
      }
    } finally {
      setTranslateButtonsDisabled(panel, false);
      translateAbortController = null;
    }
  }

  /**
   * Show or hide the translation icon based on enabled state.
   */
  function setIconVisibility(visible) {
    const icon = document.getElementById(TRANSLATION_ICON_ID);
    if (icon) icon.style.display = visible ? "flex" : "none";
  }

  /**
   * Hide FAB + panel while any element is fullscreen (YouTube, Netflix, etc.).
   * Sites that use custom "theater" mode without the Fullscreen API are not covered.
   */
  function bindFullscreenHideForTranslationUi() {
    function sync() {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      const hide = !!fs;
      const icon = document.getElementById(TRANSLATION_ICON_ID);
      const panel = document.getElementById(TRANSLATION_PANEL_ID);
      if (icon) {
        icon.style.visibility = hide ? "hidden" : "";
        icon.style.pointerEvents = hide ? "none" : "";
      }
      if (panel) {
        panel.style.visibility = hide ? "hidden" : "";
        panel.style.pointerEvents = hide ? "none" : "";
      }
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
  }

  /**
   * Initialize translation UI: icon + panel + handlers.
   */
  async function init() {
    if (document.getElementById(TRANSLATION_ICON_ID)) return;

    const panel = createPanel();
    const [savedTheme, usageForTheme, enabled] = await Promise.all([
      loadTranslationPanelTheme(),
      getCachedUsageFromStorage(),
      getTranslationEnabled(),
    ]);
    const effectiveTheme = getEffectiveTranslationPanelTheme(savedTheme, usageForTheme);

    const icon = document.createElement("div");
    icon.id = TRANSLATION_ICON_ID;
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.setAttribute("aria-label", "ReplyMate Translate");
    icon.title = "ReplyMate Translate";
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style="display:block;"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.56 17.56 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;
    icon.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      color: #fff;
      border: none;
      cursor: grab;
      z-index: 2147483645;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    `;

    const defaultIconX = window.innerWidth - FAB_MARGIN - FAB_SIZE;
    const defaultIconY = window.innerHeight - FAB_MARGIN - FAB_SIZE;
    const [iconPos, sizeState] = await Promise.all([
      loadIconPosition(defaultIconX, defaultIconY),
      loadPanelSizeState(),
    ]);
    const iconX = clamp(iconPos.x, 0, window.innerWidth - 48);
    const iconY = clamp(iconPos.y, 0, window.innerHeight - 48);
    icon.style.left = iconX + "px";
    icon.style.top = iconY + "px";
    icon.style.right = "auto";
    icon.style.bottom = "auto";

    panelUserSized = sizeState.userSized;
    const { w: panelSavedW, h: panelSavedH } = clampPanelSize(sizeState.w, sizeState.h);
    panel.style.width = `${panelSavedW}px`;
    panel.style.height = `${panelSavedH}px`;

    const defaultPanelAnchor = getDefaultPanelAnchorPosition(panelSavedW, panelSavedH);
    const panelPos = await loadPanelPosition(defaultPanelAnchor.x, defaultPanelAnchor.y);
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width || panelSavedW;
    const panelH = panelRect.height || panelSavedH;
    const panelX = clamp(panelPos.x, 0, window.innerWidth - panelW);
    const panelY = clamp(panelPos.y, 0, window.innerHeight - panelH);
    panel.style.left = panelX + "px";
    panel.style.top = panelY + "px";
    panel.style.transform = "none";

    applyTranslationPanelTheme(panel, effectiveTheme);

    document.body.appendChild(icon);
    setIconVisibility(enabled);
    bindFullscreenHideForTranslationUi();
    applyTranslationPanelTheme(panel, normalizeTranslationPanelTheme(panel.getAttribute("data-theme")));
    void updatePanelLabels(panel).catch(() => {});

    let iconDidDrag = false;
    icon.addEventListener("pointerdown", () => { iconDidDrag = false; }, { capture: true });
    makeDraggable(
      icon,
      () => {
        iconDidDrag = true;
      },
      (x, y) => {
        saveIconPosition(clamp(x, 0, window.innerWidth - 48), clamp(y, 0, window.innerHeight - 48));
      }
    );

    const header = document.getElementById("replymate-translate-header");
    if (header) {
      makePanelDraggable(header, panel, null, (x, y) => {
        const r = panel.getBoundingClientRect();
        savePanelPosition(clamp(x, 0, window.innerWidth - r.width), clamp(y, 0, window.innerHeight - r.height));
      });
    }

    const resizeHandle = document.getElementById("replymate-translate-resize");
    if (resizeHandle) {
      makePanelResizable(panel, resizeHandle);
    }

    /** Keep panel size/position inside viewport when the window is resized. */
    let panelViewportResizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(panelViewportResizeTimer);
      panelViewportResizeTimer = setTimeout(() => {
        const p = document.getElementById(TRANSLATION_PANEL_ID);
        if (!p) return;
        /* Closed panel: getBoundingClientRect is 0×0 — would clamp to min size and overwrite storage. */
        if (!isTranslationPanelExpanded(p)) return;
        const r = p.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const { w, h } = clampPanelSize(r.width, r.height);
        if (Math.abs(w - r.width) > 0.5 || Math.abs(h - r.height) > 0.5) {
          p.style.width = `${w}px`;
          p.style.height = `${h}px`;
          /* Do not persist — narrow windows used to save tiny sizes. User size only via resize handle. */
        }
        const r2 = p.getBoundingClientRect();
        const px = parseFloat(p.style.left) || 0;
        const py = parseFloat(p.style.top) || 0;
        const nx = clamp(px, 0, window.innerWidth - r2.width);
        const ny = clamp(py, 0, window.innerHeight - r2.height);
        if (nx !== px || ny !== py) {
          p.style.left = `${nx}px`;
          p.style.top = `${ny}px`;
          savePanelPosition(nx, ny);
        }
      }, 150);
    });

    /** Flush last known size when leaving the page (tab close / navigation). */
    window.addEventListener("pagehide", () => {
      try {
        if (window.innerWidth < 120) return;
        const p = document.getElementById(TRANSLATION_PANEL_ID);
        if (!p) return;
        if (isTranslationPanelExpanded(p)) {
          persistPanelSizeFromLayout(p);
        } else {
          persistPanelSizeFromInlineStyle(p);
        }
      } catch (e) { /* ignore */ }
    });

    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (iconDidDrag) return;
      const isVisible = panel.style.display === "flex";
      if (isVisible) {
        persistPanelSizeFromLayout(panel);
        panel.style.opacity = "0";
        panel.style.transform = "scale(0.96)";
        setTimeout(() => { panel.style.display = "none"; clearPanelState(panel); }, 200);
      } else {
        panel.style.display = "flex";
        requestAnimationFrame(() => {
          panel.style.opacity = "1";
          panel.style.transform = "scale(1)";
        });
        updatePanelLabels(panel); // Run in background - don't block panel open
        if (typeof getAccessToken === "function") getAccessToken().catch(() => {});
      }
    });
    icon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        icon.click();
      }
    });

    const themeToggleEl = document.getElementById("replymate-translate-theme");
    if (themeToggleEl) {
      themeToggleEl.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
        const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
        /** Same as popup `themeToggleBtn` + `showThemeProToast(getTranslation("colorThemeUpgradePrompt"))`. */
        const msg = t("colorThemeUpgradePrompt");

        const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
        if (!token) {
          showThemeUpgradeNotice(msg);
          return;
        }

        let usage = await getUsageForThemeGate();
        if (!usage) {
          usage = await fetchUsage();
        }
        if (!usage) {
          showThemeUpgradeNotice(msg);
          return;
        }
        if (!planAllowsPremiumColorThemes(usage.plan)) {
          showThemeUpgradeNotice(msg);
          return;
        }
        const cur = normalizeTranslationPanelTheme(panel.getAttribute("data-theme"));
        const idx = TRANSLATION_PANEL_THEME_IDS.indexOf(cur);
        const next = TRANSLATION_PANEL_THEME_IDS[(idx + 1) % TRANSLATION_PANEL_THEME_IDS.length];
        applyTranslationPanelTheme(panel, next);
        saveTranslationPanelTheme(next);
      });
    }

    document.getElementById("replymate-translate-close").addEventListener("click", () => {
      persistPanelSizeFromLayout(panel);
      panel.style.opacity = "0";
      panel.style.transform = "scale(0.96)";
      setTimeout(() => { panel.style.display = "none"; clearPanelState(panel); }, 200);
    });

    const pricingFooterBtn = document.getElementById("replymate-translate-pricing-cta");
    if (pricingFooterBtn) {
      pricingFooterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPricingPage();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.style.display === "flex") {
        persistPanelSizeFromLayout(panel);
        panel.style.opacity = "0";
        panel.style.transform = "scale(0.96)";
        setTimeout(() => { panel.style.display = "none"; clearPanelState(panel); }, 200);
      }
    });

    document.getElementById("replymate-translate-latest").addEventListener("click", async () => {
      const text = getLatestMessage();
      const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
      const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
      if (!text) {
        setResult(panel, t("noMessageFound"));
        return;
      }
      await runTranslateFlow(text, panel);
    });

    document.getElementById("replymate-translate-reply").addEventListener("click", async () => {
      const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
      const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
      const text = getReplyText();
      if (!text) {
        setResult(panel, t("noReplyFound"));
        return;
      }
      await runTranslateFlow(text, panel);
    });

    document.getElementById("replymate-translate-manual").addEventListener("click", async () => {
      const input = document.getElementById("replymate-translate-input");
      const text = (input && input.value) ? String(input.value).trim() : "";
      const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
      const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
      if (!text) {
        showToast(t("noTextToTranslate"));
        return;
      }
      await runTranslateFlow(text, panel);
    });

    document.getElementById("replymate-translate-clear").addEventListener("click", () => {
      if (translateAbortController) {
        try {
          translateAbortController.abort();
        } catch (_) { /* ignore */ }
      }
      setTranslateButtonsDisabled(panel, false);
      clearPanelState(panel);
    });

    const targetSelectEl = document.getElementById("replymate-translate-target");
    if (targetSelectEl) {
      targetSelectEl.addEventListener("change", () => {
        saveTargetLang(targetSelectEl.value || "");
      });
    }

    document.getElementById("replymate-translate-copy").addEventListener("click", async () => {
      const resultEl = panel.querySelector("#replymate-translate-result");
      const text = resultEl ? resultEl.textContent : "";
      const lang = typeof getCurrentLanguage === "function" ? await getCurrentLanguage() : "english";
      const t = (key) => (typeof getTranslation === "function" ? getTranslation(key, lang) : key);
      if (!text) {
        showToast(t("nothingToCopy"));
        return;
      }
      await copyToClipboard(text);
      showToast(t("copied"), true);
    });

  }

  // Expose for tests / reuse
  window.ReplyMateTranslation = {
    getLatestMessage,
    getReplyText,
    detectLanguage: detectLanguageForTranslation,
    translateText,
    copyToClipboard,
    showToast
  };

  // Show/hide icon when ReplyMate Translate is toggled in popup; theme/usage from storage
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[USAGE_CACHE_KEY]) {
        const p = document.getElementById(TRANSLATION_PANEL_ID);
        if (!p) return;
        const entry = changes[USAGE_CACHE_KEY]?.newValue;
        const usage = entry && entry.data ? entry.data : null;
        applyTranslationPanelThemeForUsage(p, usage);
      }
      if (changes[STORAGE_TRANSLATION_PANEL_THEME]) {
        const p = document.getElementById(TRANSLATION_PANEL_ID);
        if (p && typeof changes[STORAGE_TRANSLATION_PANEL_THEME]?.newValue === "string") {
          getCachedUsageFromStorage().then((usage) => {
            applyTranslationPanelThemeForUsage(p, usage);
          });
        }
      }
      if (changes[STORAGE_TRANSLATION_ENABLED]) {
        const v = changes[STORAGE_TRANSLATION_ENABLED]?.newValue;
        setIconVisibility(v === false ? false : true);
      }
    });
  }

  // Initialize when DOM is ready (no artificial delay — FAB should appear quickly)
  function scheduleInit() {
    const run = () => {
      void init().catch(() => {});
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }
  scheduleInit();
})();