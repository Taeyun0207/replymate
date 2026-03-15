/**
 * Shared auth helpers for content script and background (no Supabase client).
 * Reads session from chrome.storage, refreshes via Supabase REST API when expired.
 */
(function() {
  const SESSION_KEY = "replymate_supabase_session";
  const USER_KEY = "replymate_auth_user";
  const CONFIG_URL_KEY = "replymate_supabase_url";
  const CONFIG_ANON_KEY = "replymate_supabase_anon_key";

  async function getStored(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          resolve(null);
          return;
        }
        chrome.storage.local.get([key], (r) => {
          try {
            resolve(r && r[key] !== undefined ? r[key] : null);
          } catch (err) {
            resolve(null);
          }
        });
      } catch (err) {
        resolve(null);
      }
    });
  }

  async function setStored(obj) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          resolve();
          return;
        }
        chrome.storage.local.set(obj, () => {
          try {
            resolve();
          } catch (_) {
            resolve();
          }
        });
      } catch (_) {
        resolve();
      }
    });
  }

  function getConfigFromGlobal() {
    const g = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
    return {
      url: g.REPLYMATE_SUPABASE_URL || null,
      anonKey: g.REPLYMATE_SUPABASE_ANON_KEY || null,
    };
  }

  async function refreshSession() {
    const sessionRaw = await getStored(SESSION_KEY);
    if (!sessionRaw) return null;
    let session;
    try {
      session = JSON.parse(sessionRaw);
    } catch (_) {
      return null;
    }
    if (!session.refresh_token) return null;
    let url = await getStored(CONFIG_URL_KEY);
    let anonKey = await getStored(CONFIG_ANON_KEY);
    if (!url || !anonKey) {
      const fromGlobal = getConfigFromGlobal();
      url = url || fromGlobal.url;
      anonKey = anonKey || fromGlobal.anonKey;
    }
    if (!url || !anonKey) return null;
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || session.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      };
      await setStored({ [SESSION_KEY]: JSON.stringify(newSession) });
      if (data.user) {
        await setStored({
          [USER_KEY]: JSON.stringify({
            id: data.user.id,
            email: data.user.email || "",
          }),
        });
      }
      return newSession.access_token;
    } catch (_) {
      return null;
    }
  }

  const global = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {});
  const shared = {
    async getAccessToken() {
      const sessionRaw = await getStored(SESSION_KEY);
      if (!sessionRaw) return null;
      let session;
      try {
        session = JSON.parse(sessionRaw);
      } catch (_) {
        return null;
      }
      if (!session.access_token) return null;
      const expiresAt = (session.expires_at || 0) * 1000;
      const now = Date.now();
      if (now < expiresAt - 60000) return session.access_token;
      const newToken = await refreshSession();
      return newToken;
    },

    async isLoggedIn() {
      const token = await this.getAccessToken();
      return !!token;
    },

    async getUserId() {
      const userRaw = await getStored(USER_KEY);
      if (!userRaw) return null;
      try {
        const user = JSON.parse(userRaw);
        return user && user.id ? user.id : null;
      } catch (_) {
        return null;
      }
    },

    syncConfig(url, anonKey) {
      if (url && anonKey) {
        setStored({ [CONFIG_URL_KEY]: url, [CONFIG_ANON_KEY]: anonKey });
      }
    },
  };
  global.ReplyMateAuthShared = shared;
  // Sync config from globals to storage when available (background/content script may load before popup)
  const cfg = getConfigFromGlobal();
  if (cfg.url && cfg.anonKey) shared.syncConfig(cfg.url, cfg.anonKey);
})();
