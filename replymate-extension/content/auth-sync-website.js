/**
 * Auth sync between ReplyMate website (homepage/pricing) and extension popup.
 * Runs on replymateai.app, taeyun0207.github.io/replymate-site and localhost.
 * - Website login -> chrome.storage (popup sees it)
 * - Popup login -> localStorage (website sees it)
 */
(function() {
  const SESSION_KEY = "replymate_supabase_session";
  const USER_KEY = "replymate_auth_user";
  const WEBSITE_SESSION_KEYS = ["replymate-auth", "sb-cmmoirdihefyswerkkay-auth-token"];
  const WEBSITE_USER_SUFFIX = "-user";

  function readChromeStorage(keys, cb) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      cb({});
      return;
    }
    chrome.storage.local.get(keys, cb);
  }

  function writeChromeStorage(obj, cb) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      if (cb) cb();
      return;
    }
    chrome.storage.local.set(obj, cb || (() => {}));
  }

  function syncChromeToLocalStorage() {
    readChromeStorage([SESSION_KEY, USER_KEY], (r) => {
      const sessionRaw = r[SESSION_KEY];
      const userRaw = r[USER_KEY];
      if (!sessionRaw) return;
      try {
        const session = JSON.parse(sessionRaw);
        if (!session || !session.access_token) return;
        const payload = {
          access_token: session.access_token,
          refresh_token: session.refresh_token || "",
          expires_at: session.expires_at,
          token_type: "bearer"
        };
        let userPayload = null;
        if (userRaw) {
          try {
            const user = JSON.parse(userRaw);
            if (user) userPayload = user;
          } catch (_) {}
        }
        for (const baseKey of WEBSITE_SESSION_KEYS) {
          try {
            localStorage.setItem(baseKey, JSON.stringify(payload));
            if (userPayload) localStorage.setItem(baseKey + WEBSITE_USER_SUFFIX, JSON.stringify(userPayload));
          } catch (_) {}
        }
      } catch (_) {}
    });
  }

  function syncLocalStorageToChrome() {
    let found = false;
    for (const baseKey of WEBSITE_SESSION_KEYS) {
      try {
        const sessionRaw = localStorage.getItem(baseKey);
        if (!sessionRaw) continue;
        const session = JSON.parse(sessionRaw);
        if (!session || !session.access_token) continue;
        found = true;
        const sessionData = {
          access_token: session.access_token,
          refresh_token: session.refresh_token || "",
          expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600
        };
        writeChromeStorage({ [SESSION_KEY]: JSON.stringify(sessionData) });
        const userRaw = localStorage.getItem(baseKey + WEBSITE_USER_SUFFIX);
        if (userRaw) {
          try {
            const user = JSON.parse(userRaw);
            if (user) writeChromeStorage({ [USER_KEY]: JSON.stringify({ id: user.id || "", email: user.email || "" }) });
          } catch (_) {}
        }
        break;
      } catch (_) {}
    }
    if (!found && typeof chrome !== "undefined" && chrome.storage?.local) {
      readChromeStorage([SESSION_KEY], (r) => {
        if (r[SESSION_KEY]) chrome.storage.local.remove([SESSION_KEY, USER_KEY]);
      });
    }
  }

  function runSync() {
    syncLocalStorageToChrome();
    const hasOAuthHash = typeof window !== "undefined" && window.location.hash &&
      (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token"));
    if (!hasOAuthHash) {
      syncChromeToLocalStorage();
    }
  }

  runSync();

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[SESSION_KEY]) {
        if (!changes[SESSION_KEY].newValue) {
          for (const baseKey of WEBSITE_SESSION_KEYS) {
            try {
              localStorage.removeItem(baseKey);
              localStorage.removeItem(baseKey + WEBSITE_USER_SUFFIX);
            } catch (_) {}
          }
        } else {
          syncChromeToLocalStorage();
        }
      } else if (changes[USER_KEY]) {
        syncChromeToLocalStorage();
      }
    });
  }

  setInterval(syncLocalStorageToChrome, 2500);
})();
