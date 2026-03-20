/**
 * AI Reply button look in Gmail/Outlook — sync with popup color wheel (replymate_popup_theme).
 * Colors match the Translation panel (translation.js): --tp-header-gradient for idle/hover,
 * --tp-primary / --tp-primary-hover as solid fallbacks, --tp-loading / --tp-error for states.
 * Keep in sync when you change translation.js theme tokens.
 * Must load before gmail.js / outlook.js.
 */
(function () {
  const POPUP_THEME_KEY = "replymate_popup_theme";
  const DEFAULT_POPUP_THEME = "basic";
  const POPUP_THEME_IDS = ["basic", "light", "sepia", "rose", "slate", "dark", "basic-dark"];

  /**
   * Per theme: same values as #replymate-translation-panel[data-theme] in translation.js
   * (headerGradient = --tp-header-gradient; normal/hover = --tp-primary / --tp-primary-hover).
   */
  const THEME_COLORS = {
    basic: {
      headerGradient: "linear-gradient(135deg, #7943f1, #9d6cf7)",
      normal: "#7943f1",
      hover: "#6b3ad4",
      loading: "#6b6b6b",
      error: "#d93025",
      text: "#ffffff",
    },
    light: {
      headerGradient:
        "linear-gradient(135deg, #a090e0 0%, #8b7ed4 45%, #b4a3ee 100%)",
      normal: "#8b7ed4",
      hover: "#7d6fc8",
      loading: "#5f6368",
      error: "#d93025",
      text: "#ffffff",
    },
    sepia: {
      headerGradient: "linear-gradient(135deg, #5c4033 0%, #8b6914 38%, #6b4f3a 100%)",
      normal: "#8d7358",
      hover: "#7d664d",
      loading: "#6b5d4a",
      error: "#b3261e",
      text: "#ffffff",
    },
    rose: {
      headerGradient: "linear-gradient(135deg, #a21caf 0%, #ec4899 45%, #7c3aed 100%)",
      normal: "#e06096",
      hover: "#d14b84",
      loading: "#9d6b8a",
      error: "#dc2626",
      text: "#ffffff",
    },
    slate: {
      headerGradient: "linear-gradient(135deg, #6366f1 0%, #475569 48%, #7943f1 100%)",
      normal: "#6670e8",
      hover: "#575fde",
      loading: "#64748b",
      error: "#dc2626",
      text: "#ffffff",
    },
    dark: {
      headerGradient: "linear-gradient(135deg, #5c4d78, #7943f1)",
      normal: "#7d6ec8",
      hover: "#7060b8",
      loading: "#9aa0a6",
      error: "#f28b82",
      text: "#ffffff",
    },
    "basic-dark": {
      headerGradient: "linear-gradient(135deg, #48484a, #636366)",
      normal: "#6a6a6e",
      hover: "#5c5c60",
      loading: "#a1a1a6",
      error: "#ff453a",
      text: "#ffffff",
    },
  };

  function normalize(theme) {
    return POPUP_THEME_IDS.includes(theme) ? theme : DEFAULT_POPUP_THEME;
  }

  let current = { ...THEME_COLORS[DEFAULT_POPUP_THEME] };

  /** Gmail/Outlook can style native buttons with high specificity — !important wins. */
  function injectBaseStylesheet() {
    if (document.getElementById("replymate-ai-reply-btn-styles")) return;
    const s = document.createElement("style");
    s.id = "replymate-ai-reply-btn-styles";
    s.textContent = `
      button.replymate-generate-button,
      button.replymate-hover-generate-button {
        -webkit-appearance: none !important;
        appearance: none !important;
        box-sizing: border-box !important;
        border: none !important;
        background-clip: padding-box !important;
        font-weight: inherit !important;
        font-family: inherit !important;
        font-style: inherit !important;
        letter-spacing: inherit !important;
        text-shadow: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  /**
   * @param {"idle"|"hover"|"loading"|"error"} visualState
   */
  function applyButtonStyle(button, visualState) {
    if (!button || !button.style) return;
    const c = current;
    const st = visualState || "idle";
    const imp = (prop, val) => {
      try {
        button.style.setProperty(prop, val, "important");
      } catch {
        button.style[prop] = val;
      }
    };

    imp("color", c.text);
    imp("text-shadow", "none");
    button.style.setProperty(
      "transition",
      "filter 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background 0.18s ease"
    );

    if (st === "loading") {
      imp("filter", "none");
      imp("transform", "none");
      imp("box-shadow", "none");
      imp("background", "none");
      imp("background-image", "none");
      imp("background-color", c.loading);
      return;
    }
    if (st === "error") {
      imp("filter", "none");
      imp("transform", "none");
      imp("box-shadow", "none");
      imp("background", "none");
      imp("background-image", "none");
      imp("background-color", c.error);
      return;
    }

    const g = c.headerGradient || `linear-gradient(135deg, ${c.normal}, ${c.hover})`;
    const idleShadow = "0 1px 3px rgba(0, 0, 0, 0.12)";
    const hoverShadow = "0 5px 16px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12)";

    if (st === "hover") {
      imp("background", g);
      imp("filter", "brightness(1.12) saturate(1.05)");
      imp("transform", "translateY(-1px)");
      imp("box-shadow", hoverShadow);
      return;
    }
    imp("background", g);
    imp("filter", "none");
    imp("transform", "none");
    imp("box-shadow", idleShadow);
  }

  function refreshAllButtons() {
    const sel = ".replymate-generate-button, .replymate-hover-generate-button";
    try {
      document.querySelectorAll(sel).forEach((btn) => {
        const state = btn.dataset.replymateState || "idle";
        if (state === "idle") applyButtonStyle(btn, "idle");
        else if (state === "loading") applyButtonStyle(btn, "loading");
        else if (state === "error") applyButtonStyle(btn, "error");
        else applyButtonStyle(btn, "idle");
      });
    } catch (_) {
      /* ignore */
    }
  }

  function applyTheme(themeId) {
    const t = normalize(themeId);
    current = { ...THEME_COLORS[t] };
    refreshAllButtons();
    requestAnimationFrame(() => {
      refreshAllButtons();
    });
  }

  function init() {
    injectBaseStylesheet();
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get([POPUP_THEME_KEY], (r) => {
          if (chrome.runtime?.lastError) {
            applyTheme(DEFAULT_POPUP_THEME);
            return;
          }
          const v = r?.[POPUP_THEME_KEY];
          applyTheme(typeof v === "string" ? v : DEFAULT_POPUP_THEME);
          setTimeout(refreshAllButtons, 250);
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== "local" || !changes[POPUP_THEME_KEY]) return;
          const v = changes[POPUP_THEME_KEY].newValue;
          if (typeof v === "string") applyTheme(v);
        });
      } else {
        applyTheme(DEFAULT_POPUP_THEME);
      }
    } catch {
      applyTheme(DEFAULT_POPUP_THEME);
    }
  }

  window.ReplyMatePopupThemeButton = {
    init,
    getColors: () => ({ ...current }),
    applyButtonStyle,
    refreshAllButtons,
    POPUP_THEME_KEY,
    DEFAULT_POPUP_THEME,
  };

  init();
})();
