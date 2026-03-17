/**
 * ReplyMate Translation Panel
 * Lightweight translation feature for Gmail UI.
 * Uses existing app language as target. No auto-translate; all actions are user-initiated.
 */
(function () {
  "use strict";

  // Only run in main frame (not in iframes)
  if (typeof window !== "undefined" && window !== window.top) return;

  /** True if we're on Gmail (has extractThreadContext / findActiveReplyEditor from gmail.js). */
  function isGmailPage() {
    return typeof extractThreadContext === "function" && typeof findActiveReplyEditor === "function";
  }

  const TRANSLATION_ICON_ID = "replymate-translation-icon";
  const TRANSLATION_PANEL_ID = "replymate-translation-panel";
  const TRANSLATION_TOAST_ID = "replymate-translation-toast";
  const BACKEND_BASE = "https://replymate-backend-bot8.onrender.com";
  const STORAGE_ICON_POS = "replymate_translation_icon_pos";
  const STORAGE_PANEL_POS = "replymate_translation_panel_pos";
  const STORAGE_TARGET_LANG = "replymate_translation_target_lang";

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

    // Normalize whitespace
    cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/^\s+|\s+$/g, "");

    return cleaned.trim();
  }

  /**
   * Get subject + email body only (no Gmail UI) for translation.
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
   * Detect language from text. Uses existing detectLanguage from gmail.js when available.
   */
  function detectLanguageForTranslation(text) {
    if (!text || typeof text !== "string") return "english";
    if (_gmailDetectLanguage) return _gmailDetectLanguage(text);
    const lowerText = text.toLowerCase();
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return "zh";
    if (/[가-힣ㅋㅌㅎㅏ-ㅑㅒㅓㅔㅕㅟㅠㅢㅣㅡㅢㅥㅤㅦㅨㅧㅮㅯㅰㅱㅲㅴㅶㅷㅇㅈㅏㅑㅓㅒㅔㅕㅟㅠㅢㅣㅡㅢㅥㅤㅦㅨㅧㅮㅯㅰㅱㅲㅴㅶㅷㅇ]/.test(text)) return "korean";
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "japanese";
    if (/[ñáéíóúü]/.test(lowerText) || /\b(gracias|por favor|que|para|con|estoy|tengo|hola|buenos|días|noche|favor)\b/i.test(lowerText)) return "spanish";
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
  function showToast(message, withCheck = false) {
    let toast = document.getElementById(TRANSLATION_TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TRANSLATION_TOAST_ID;
      toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;z-index:2147483647;opacity:0;transition:opacity 0.25s ease, transform 0.25s ease;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;white-space:pre-line;";
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
    }, 1800);
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

  /**
   * Save position to chrome.storage.local.
   */
  function savePosition(key, x, y) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [key]: { x, y } });
      }
    } catch (e) { /* ignore */ }
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
   * Load position from chrome.storage.local.
   */
  function loadPosition(key, defaultX, defaultY) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get([key], (r) => {
            const v = r?.[key];
            resolve(v && typeof v.x === "number" && typeof v.y === "number"
              ? { x: v.x, y: v.y }
              : { x: defaultX, y: defaultY });
          });
        } else {
          resolve({ x: defaultX, y: defaultY });
        }
      } catch {
        resolve({ x: defaultX, y: defaultY });
      }
    });
  }

  /**
   * Clamp value between min and max.
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Make an element draggable, constrained to viewport.
   * Adds mousemove/mouseup on mousedown and removes them on mouseup so dragging works after first move.
   */
  function makeDraggable(el, onMove) {
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = el.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      const elW = rect.width;
      const elH = rect.height;
      el.style.cursor = "grabbing";

      const onMouseMove = (ev) => {
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

      const onMouseUp = () => {
        el.style.cursor = "grab";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  /**
   * Make a panel draggable by its header (drag handle moves the panel), constrained to viewport.
   * Uses same logic as icon drag for natural movement.
   */
  function makePanelDraggable(handle, panel, onMove) {
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      const initialLeft = rect.left;
      const initialTop = rect.top;
      const panelW = rect.width;
      const panelH = rect.height;

      const onMouseMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newLeft = clamp(initialLeft + dx, 0, window.innerWidth - panelW);
        const newTop = clamp(initialTop + dy, 0, window.innerHeight - panelH);
        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.transform = "none";
        if (onMove) onMove(newLeft, newTop);
      };
      const onMouseUp = () => {
        handle.style.cursor = "grab";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      handle.style.cursor = "grabbing";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
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
      width: 420px;
      max-width: 92vw;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.06);
      z-index: 2147483646;
      font-family: 'Google Sans', Roboto, -apple-system, sans-serif;
      font-size: 14px;
      overflow: hidden;
      display: none;
      opacity: 0;
      transform: scale(0.96);
      transition: opacity 0.2s ease, transform 0.2s ease;
    `;
    const style = document.createElement("style");
    style.textContent = `
      .replymate-translate-btn { padding:6px 10px;background:#7943f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;text-align:center;transition:background 0.2s,transform 0.15s,box-shadow 0.2s;box-shadow:0 1px 4px rgba(121,67,241,0.3); flex:1; min-width:0; }
      .replymate-translate-btn:hover { background:#6b3ad4;transform:translateY(-1px);box-shadow:0 2px 8px rgba(121,67,241,0.35); }
      .replymate-translate-btn:active { transform:translateY(0); }
      .replymate-translate-btn:focus-visible { outline:2px solid #7943f1;outline-offset:2px; }
      .replymate-translate-manual { padding:6px 12px;background:#7943f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;transition:background 0.2s,transform 0.15s; }
      .replymate-translate-manual:hover { background:#6b3ad4;transform:translateY(-1px); }
      .replymate-translate-manual:active { transform:translateY(0); }
      .replymate-translate-manual:focus-visible { outline:2px solid #7943f1;outline-offset:2px; }
      .replymate-translate-copy { padding:6px 12px;background:#e8eaed;color:#3c4043;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;transition:background 0.2s,transform 0.15s; }
      .replymate-translate-copy:hover { background:#dadce0;transform:translateY(-1px); }
      .replymate-translate-copy:active { transform:translateY(0); }
      .replymate-translate-copy:focus-visible { outline:2px solid #7943f1;outline-offset:2px; }
      #replymate-translate-close:hover { background:rgba(255,255,255,0.4) !important; }
      #replymate-translate-close:focus-visible { outline:2px solid rgba(255,255,255,0.8);outline-offset:2px; }
      #replymate-translate-header { cursor:grab; }
      #replymate-translate-header:active { cursor:grabbing; }
      #replymate-translate-input:focus { outline:none;border-color:#7943f1;box-shadow:0 0 0 2px rgba(121,67,241,0.2); }
      #replymate-translate-target:focus { outline:none;border-color:#7943f1;box-shadow:0 0 0 2px rgba(121,67,241,0.2); }
      #replymate-translate-result.replymate-loading { color:#5f6368;display:flex;align-items:center;gap:6px; }
      .replymate-spinner { width:14px;height:14px;border:2px solid #e8eaed;border-top-color:#7943f1;border-radius:50%;animation:replymate-spin 0.7s linear infinite; }
      @keyframes replymate-spin { to { transform:rotate(360deg); } }
    `;
    document.head.appendChild(style);

    const logoUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("icons/icon32.png") : "";
    panel.innerHTML = `
      <div id="replymate-translate-header" style="padding:8px 12px;background:linear-gradient(135deg,#7943f1 0%,#9d6cf7 100%);color:#fff;display:flex;justify-content:space-between;align-items:center;user-select:none;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${logoUrl ? `<img src="${logoUrl}" alt="ReplyMate" style="width:18px;height:18px;border-radius:4px;flex-shrink:0;" />` : ""}
          <span id="replymate-translate-title" style="font-weight:600;font-size:13px;letter-spacing:0.02em;">ReplyMate Translate</span>
        </div>
        <button id="replymate-translate-close" style="background:rgba(255,255,255,0.25);border:none;cursor:pointer;font-size:16px;color:#fff;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">&times;</button>
      </div>
      <div style="padding:12px;background:#fafafa;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div id="replymate-translate-gmail-buttons" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;">
            <button id="replymate-translate-latest" class="replymate-translate-btn">Translate latest message</button>
            <button id="replymate-translate-reply" class="replymate-translate-btn">Translate reply</button>
          </div>
          <div>
            <label id="replymate-translate-to-label" style="font-size:11px;color:#5f6368;margin-bottom:3px;display:block;">Translate to</label>
            <select id="replymate-translate-target" style="width:100%;padding:6px 10px;border:1px solid #dadce0;border-radius:6px;font-size:12px;box-sizing:border-box;font-family:inherit;background:#fff;margin-bottom:8px;cursor:pointer;">
              <option value="">System Language</option>
            </select>
          </div>
          <div>
            <label id="replymate-translate-paste-label" style="font-size:11px;color:#5f6368;margin-bottom:3px;display:block;">Paste text to translate</label>
            <textarea id="replymate-translate-input" placeholder="Paste text to translate..." rows="5" style="width:100%;min-height:100px;padding:10px;border:1px solid #dadce0;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;font-family:inherit;background:#fff;"></textarea>
            <button id="replymate-translate-manual" class="replymate-translate-manual" style="margin-top:6px;">Translate</button>
          </div>
          <div>
            <label id="replymate-translate-result-label" style="font-size:11px;color:#5f6368;margin-bottom:3px;display:block;">Result</label>
            <div id="replymate-translate-result" data-placeholder="" style="min-height:140px;max-height:400px;overflow-y:scroll;overflow-x:hidden;padding:10px;box-sizing:border-box;border:1px solid #e8eaed;border-radius:6px;background:#fff;white-space:pre-wrap;word-break:break-word;font-size:13px;color:#202124;line-height:1.5;transition:border-color 0.2s,box-shadow 0.2s;"></div>
            <button id="replymate-translate-copy" class="replymate-translate-copy" style="margin-top:6px;">Copy</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    return panel;
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
      input: document.getElementById("replymate-translate-input"),
      copy: document.getElementById("replymate-translate-copy"),
      close: document.getElementById("replymate-translate-close")
    };

    if (els.latest) els.latest.textContent = t("translateLatestMessage");
    if (els.reply) els.reply.textContent = t("translateReply");
    if (els.manual) els.manual.textContent = t("translateManual");
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
   * Set result area content.
   * For streaming: pass text to show incrementally (like reply generation).
   */
  function setResult(panel, text, isError = false, isLoading = false) {
    const el = panel && panel.querySelector("#replymate-translate-result");
    if (!el) return;
    el.classList.remove("replymate-loading");
    el.style.color = isError ? "#d93025" : "#202124";
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

    const detected = detectLanguageForTranslation(sourceText);
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
      } catch (streamErr) {
        if (streamErr.name === "AbortError") return;
        const translated = await translateText(sourceText, targetCode, signal);
        setResult(panel, translated);
        lastTranslatedSource = sourceText;
        lastTranslatedTarget = targetCode;
        lastTranslatedResult = translated;
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      const msg = err.message || String(err);
      const isLimitReached = msg.includes("translation_limit_reached");
      const displayMsg = isLimitReached ? t("translateLimitReached") : t("translateError") + msg;
      setResult(panel, displayMsg, true);
    } finally {
      setTranslateButtonsDisabled(panel, false);
      translateAbortController = null;
    }
  }

  /**
   * Initialize translation UI: icon + panel + handlers.
   */
  async function init() {
    if (document.getElementById(TRANSLATION_ICON_ID)) return;

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
      background: linear-gradient(135deg,#7943f1 0%,#9d6cf7 100%);
      color: #fff;
      border: none;
      cursor: grab;
      z-index: 2147483645;
      box-shadow: 0 4px 16px rgba(121,67,241,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: box-shadow 0.2s, transform 0.2s;
      user-select: none;
    `;
    const iconStyle = document.createElement("style");
    iconStyle.textContent = `#replymate-translation-icon:focus-visible { outline:2px solid #7943f1;outline-offset:2px; }`;
    document.head.appendChild(iconStyle);

    const defaultIconX = window.innerWidth - 24 - 48;
    const defaultIconY = window.innerHeight - 24 - 48;
    const iconPos = await loadPosition(STORAGE_ICON_POS, defaultIconX, defaultIconY);
    const iconX = clamp(iconPos.x, 0, window.innerWidth - 48);
    const iconY = clamp(iconPos.y, 0, window.innerHeight - 48);
    icon.style.left = iconX + "px";
    icon.style.top = iconY + "px";
    icon.style.right = "auto";
    icon.style.bottom = "auto";

    icon.addEventListener("mouseenter", () => {
      icon.style.boxShadow = "0 6px 20px rgba(121,67,241,0.5)";
      icon.style.transform = "scale(1.05)";
    });
    icon.addEventListener("mouseleave", () => {
      icon.style.boxShadow = "0 4px 16px rgba(121,67,241,0.4)";
      icon.style.transform = "scale(1)";
    });

    let iconDidDrag = false;
    icon.addEventListener("mousedown", () => { iconDidDrag = false; });
    makeDraggable(icon, (x, y) => {
      iconDidDrag = true;
      savePosition(STORAGE_ICON_POS, clamp(x, 0, window.innerWidth - 48), clamp(y, 0, window.innerHeight - 48));
    });

    const panel = createPanel();

    const defaultPanelX = Math.max(0, (window.innerWidth - 400) / 2);
    const defaultPanelY = Math.max(0, (window.innerHeight - 450) / 2);
    const panelPos = await loadPosition(STORAGE_PANEL_POS, defaultPanelX, defaultPanelY);
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width || 400;
    const panelH = panelRect.height || 450;
    const panelX = clamp(panelPos.x, 0, window.innerWidth - panelW);
    const panelY = clamp(panelPos.y, 0, window.innerHeight - panelH);
    panel.style.left = panelX + "px";
    panel.style.top = panelY + "px";
    panel.style.transform = "none";

    const header = document.getElementById("replymate-translate-header");
    if (header) {
      makePanelDraggable(header, panel, (x, y) => {
        const r = panel.getBoundingClientRect();
        savePosition(STORAGE_PANEL_POS, clamp(x, 0, window.innerWidth - r.width), clamp(y, 0, window.innerHeight - r.height));
      });
    }

    await updatePanelLabels(panel);

    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (iconDidDrag) return;
      const isVisible = panel.style.display === "block";
      if (isVisible) {
        panel.style.opacity = "0";
        panel.style.transform = "scale(0.96)";
        setTimeout(() => { panel.style.display = "none"; clearPanelState(panel); }, 200);
      } else {
        panel.style.display = "block";
        await updatePanelLabels(panel);
        requestAnimationFrame(() => {
          panel.style.opacity = "1";
          panel.style.transform = "scale(1)";
        });
        if (typeof getAccessToken === "function") getAccessToken().catch(() => {});
      }
    });
    icon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        icon.click();
      }
    });

    document.getElementById("replymate-translate-close").addEventListener("click", () => {
      panel.style.opacity = "0";
      panel.style.transform = "scale(0.96)";
      setTimeout(() => { panel.style.display = "none"; clearPanelState(panel); }, 200);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.style.display === "block") {
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

    document.body.appendChild(icon);
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

  /**
   * Apply saved position from storage (used on init and when another tab saves).
   */
  function applyStoredPositions() {
    loadPosition(STORAGE_ICON_POS, window.innerWidth - 24 - 48, window.innerHeight - 24 - 48).then((pos) => {
      const icon = document.getElementById(TRANSLATION_ICON_ID);
      if (icon) {
        const x = clamp(pos.x, 0, window.innerWidth - 48);
        const y = clamp(pos.y, 0, window.innerHeight - 48);
        icon.style.left = x + "px";
        icon.style.top = y + "px";
        icon.style.right = "auto";
        icon.style.bottom = "auto";
      }
    });
    loadPosition(STORAGE_PANEL_POS, Math.max(0, (window.innerWidth - 400) / 2), Math.max(0, (window.innerHeight - 450) / 2)).then((pos) => {
      const panel = document.getElementById(TRANSLATION_PANEL_ID);
      if (panel) {
        const r = panel.getBoundingClientRect();
        const w = r.width || 400;
        const h = r.height || 450;
        const x = clamp(pos.x, 0, window.innerWidth - w);
        const y = clamp(pos.y, 0, window.innerHeight - h);
        panel.style.left = x + "px";
        panel.style.top = y + "px";
        panel.style.transform = "none";
      }
    });
  }

  // Sync position across tabs: when user moves icon/panel in another tab, update this tab too
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[STORAGE_ICON_POS] || changes[STORAGE_PANEL_POS]) {
        applyStoredPositions();
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }
})();