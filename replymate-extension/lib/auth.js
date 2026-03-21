/**
 * ReplyMate Supabase Auth - Google sign-in for Chrome extension.
 * Requires: lib/supabase.min.js, lib/auth-config.js loaded before this script.
 */
(function() {
  const AUTH_STORAGE_KEY = "replymate_supabase_session";
  const AUTH_USER_KEY = "replymate_auth_user";

  function getSupabaseClient() {
    const url = window.REPLYMATE_SUPABASE_URL;
    const key = window.REPLYMATE_SUPABASE_ANON_KEY;
    if (!url || !key || typeof supabase === "undefined") return null;
    return supabase.createClient(url, key, {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
        lock: async function(_name, _timeout, fn) { return fn(); }
      }
    });
  }

  function getStorage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return {
        getItem: (k) =>
          new Promise((resolve) => {
            chrome.storage.local.get([k], (r) => resolve(r[k] || null));
          }),
        setItem: (k, v) =>
          new Promise((resolve) => {
            chrome.storage.local.set({ [k]: v }, resolve);
          }),
        removeItem: (k) =>
          new Promise((resolve) => {
            chrome.storage.local.remove([k], resolve);
          }),
      };
    }
    return null;
  }

  window.ReplyMateAuth = {
    isConfigured() {
      const url = window.REPLYMATE_SUPABASE_URL;
      const key = window.REPLYMATE_SUPABASE_ANON_KEY;
      return !!(url && key);
    },

    async getSession() {
      const storage = getStorage();
      if (!storage) return null;
      const raw = await storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      try {
        const session = JSON.parse(raw);
        if (session && session.access_token && session.expires_at) {
          const expiresAt = session.expires_at * 1000;
          if (Date.now() < expiresAt - 60000) return session;
        }
      } catch (_) {}
      return null;
    },

    async getUser() {
      const storage = getStorage();
      if (!storage) return null;
      const raw = await storage.getItem(AUTH_USER_KEY);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch (_) {}
      }
      return null;
    },

    async isSignedIn() {
      const session = await this.getSession();
      if (session) return true;
      // Access token expired but refresh token may still be valid (persisted in chrome.storage.local).
      const refreshed = await this.refreshSessionIfNeeded();
      return !!refreshed;
    },

    async getUserId() {
      const user = await this.getUser();
      return user ? user.id : null;
    },

    async getEmail() {
      const user = await this.getUser();
      return user ? user.email || "" : "";
    },

    async getAccessToken() {
      let session = await this.getSession();
      if (session) return session.access_token;
      session = await this.refreshSessionIfNeeded();
      return session ? session.access_token : null;
    },

    async signInWithGoogle() {
      const client = getSupabaseClient();
      if (!client) return { error: "Supabase not configured" };
      if (typeof chrome === "undefined" || !chrome.identity) {
        return { error: "Chrome identity API not available" };
      }
      let clientId = window.REPLYMATE_GOOGLE_CLIENT_ID;
      if (!clientId && typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
        const manifest = chrome.runtime.getManifest();
        const manifestClientId = manifest?.oauth2?.client_id;
        if (manifestClientId && manifestClientId !== "REPLACE_WITH_GOOGLE_CLIENT_ID") {
          clientId = manifestClientId;
        }
      }
      if (!clientId || clientId === "REPLACE_WITH_GOOGLE_CLIENT_ID") {
        return { error: "Google OAuth client ID not configured. Add GOOGLE_CLIENT_ID to replymate-backend/.env and run: node scripts/build-auth-config.js" };
      }
      const redirectUri = chrome.identity.getRedirectURL();
      const rawNonce = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
      const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const scope = encodeURIComponent("openid email profile");
      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        "client_id=" + encodeURIComponent(clientId) +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&response_type=id_token" +
        "&scope=" + scope +
        "&nonce=" + encodeURIComponent(hashHex);
      return new Promise((resolve) => {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl, interactive: true },
          async (callbackUrl) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
              return;
            }
            if (!callbackUrl) {
              resolve({ error: "Auth cancelled" });
              return;
            }
            const hash = callbackUrl.split("#")[1];
            if (!hash) {
              resolve({ error: "No tokens in callback" });
              return;
            }
            const params = new URLSearchParams(hash);
            const idToken = params.get("id_token");
            const err = params.get("error");
            if (err) {
              resolve({ error: params.get("error_description") || err });
              return;
            }
            if (!idToken) {
              resolve({ error: "No ID token in callback" });
              return;
            }
            const { data, error } = await client.auth.signInWithIdToken({
              provider: "google",
              token: idToken,
              nonce: rawNonce,
            });
            if (error) {
              resolve({ error: error.message });
              return;
            }
            if (!data?.session) {
              resolve({ error: "No session from Supabase" });
              return;
            }
            const session = data.session;
            const user = data.user;
            const storage = getStorage();
            if (storage) {
              const sessionData = {
                access_token: session.access_token,
                refresh_token: session.refresh_token || "",
                expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
              };
              await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
              await storage.setItem(AUTH_USER_KEY, JSON.stringify({
                id: user?.id || "",
                email: user?.email || "",
              }));
            }
            resolve({ user });
          }
        );
      });
    },

    async signOut() {
      const storage = getStorage();
      if (storage) {
        await storage.removeItem(AUTH_STORAGE_KEY);
        await storage.removeItem(AUTH_USER_KEY);
      }
    },

    async refreshSessionIfNeeded() {
      // Read raw session from storage (getSession returns null when expired, but we need refresh_token)
      const storage = getStorage();
      if (!storage) return null;
      const raw = await storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      let session;
      try {
        session = JSON.parse(raw);
      } catch (_) {
        return null;
      }
      if (!session || !session.refresh_token) return null;
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      if (error || !data?.session) return null;
      const sessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token || session.refresh_token,
        expires_at: data.session.expires_at || Math.floor(Date.now() / 1000) + (data.session.expires_in || 3600),
      };
      await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
      if (data.user) {
        await storage.setItem(
          AUTH_USER_KEY,
          JSON.stringify({
            id: data.user.id,
            email: data.user.email || "",
          })
        );
      }
      return sessionData;
    },
  };
})();
