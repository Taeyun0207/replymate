console.log("ReplyMate Gmail script loaded");

// Keys used by the popup UI (chrome.storage.local).
const REPLYMATE_TONE_KEY = "replymateTone";
const REPLYMATE_LENGTH_KEY = "replymateLength";
const REPLYMATE_USER_NAME_KEY = "replymateUserName";

// Default values if nothing has been saved yet.
const DEFAULT_TONE = "polite";
const DEFAULT_LENGTH = "medium";

// Load tone/length/name settings saved by the popup.
function loadReplyMateSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        [REPLYMATE_TONE_KEY, REPLYMATE_LENGTH_KEY, REPLYMATE_USER_NAME_KEY],
        (result) => {
        const tone = result?.[REPLYMATE_TONE_KEY] || DEFAULT_TONE;
        const length = result?.[REPLYMATE_LENGTH_KEY] || DEFAULT_LENGTH;
          const userName = result?.[REPLYMATE_USER_NAME_KEY] || "";
          resolve({ tone, length, userName });
        }
      );
    } catch {
      // If chrome.storage isn't available for any reason, fall back to defaults.
      resolve({ tone: DEFAULT_TONE, length: DEFAULT_LENGTH, userName: "" });
    }
  });
}

// Get or create a persistent ReplyMate user ID
function getReplyMateUserId() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["replymate_user_id"], (result) => {
        if (result.replymate_user_id) {
          resolve(result.replymate_user_id);
        } else {
          const newUserId = crypto.randomUUID();
          chrome.storage.local.set({ replymate_user_id: newUserId }, () => {
            resolve(newUserId);
          });
        }
      });
    } catch {
      // Fallback to a simple ID if crypto.randomUUID() or storage fails
      const fallbackId = "fallback_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      resolve(fallbackId);
    }
  });
}

// Format usage display text with plan name and limit
function formatUsageDisplay(plan, remaining, limit) {
  const planNames = {
    'free': 'Free Plan',
    'pro': 'Pro Plan', 
    'pro_plus': 'Pro+ Plan'
  };
  
  const planName = planNames[plan] || 'Free Plan';
  return `${planName} · ${remaining} / ${limit} replies left`;
}

function showReplyMateMessage(message) {
  const box = document.createElement("div");

  box.textContent = message;

  box.style.position = "fixed";
  box.style.bottom = "20px";
  box.style.right = "20px";
  box.style.background = "#202124";
  box.style.color = "white";
  box.style.padding = "12px 16px";
  box.style.borderRadius = "8px";
  box.style.fontSize = "13px";
  box.style.zIndex = "999999";
  box.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";

  document.body.appendChild(box);

  setTimeout(() => {
    box.remove();
  }, 4000);
}

// Call the ReplyMate backend to generate an AI reply.
async function generateAIReply(payload) {
  const userId = await getReplyMateUserId();
  
  return fetch("http://localhost:3000/generate-reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": userId
    },
    body: JSON.stringify(payload || {}),
  })
  .then(async (response) => {

    if (!response.ok) {

      let errorData = {};

      try {
        errorData = await response.json();
      } catch (e) {
        console.warn("[ReplyMate] Failed to parse error JSON");
      }

      console.log("[ReplyMate] errorData:", errorData);

      if (response.status === 403 || errorData.error === "usage_limit_exceeded") {
        console.warn("[ReplyMate] Monthly limit reached");

        showReplyMateMessage(
  "⚠️ You've reached your monthly ReplyMate limit. Upgrade to generate more replies."
);

        const usageDisplay = document.querySelector(".replymate-usage-display");
        if (usageDisplay) {
          usageDisplay.textContent = formatUsageDisplay('free', 0, 50);
        }

        return "";
      }

      console.error("[ReplyMate] Backend error", response.status, response.statusText);
      return "";
    }

    const data = await response.json();

    if (data && typeof data.reply === "string") {
      console.log("[ReplyMate] Backend reply received");
      return data;
    }

    console.error("[ReplyMate] Unexpected backend response shape", data);
    return "";
  })
  .catch((error) => {
    console.error("[ReplyMate] Failed to call backend", error);
    return "";
  });
}

// Update usage display with current remaining replies
async function updateUsageDisplay(usageDisplay) {
  try {
    const userId = await getReplyMateUserId();
    
    const response = await fetch("http://localhost:3000/usage", {
      method: "GET",
      headers: {
        "X-User-ID": userId
      }
    });

    const data = await response.json();

    if (data && typeof data.remaining !== "undefined") {
      const planLimits = {
        'free': 50,
        'pro': 300,
        'pro_plus': 1000
      };
      const limit = planLimits[data.plan] || 50;
      usageDisplay.textContent = formatUsageDisplay(data.plan, data.remaining, limit);
    } else {
      usageDisplay.textContent = formatUsageDisplay('free', 0, 50);
    }

  } catch (error) {
    console.error("[ReplyMate] Failed to fetch usage", error);
    usageDisplay.textContent = formatUsageDisplay('free', 0, 50);
  }
}

const REPLYMATE_BUTTON_COLOR_NORMAL = "#1a73e8";
const REPLYMATE_BUTTON_COLOR_HOVER = "#1558b0";
const REPLYMATE_BUTTON_COLOR_LOADING = "#9aa0a6";
const REPLYMATE_BUTTON_COLOR_ERROR = "#d93025";
const REPLYMATE_BUTTON_TEXT_COLOR = "#ffffff";

function setReplyMateButtonState(button, state) {
  // state: "idle" | "loading" | "error"
  button.dataset.replymateState = state;
  console.log("[ReplyMate] setReplyMateButtonState", { state, button });

  if (state === "loading") {
    button.disabled = true;
    button.style.cursor = "default";
    button.textContent = "Generating...";
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_LOADING;
  } else if (state === "error") {
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = "Try Again";
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_ERROR;
  } else {
    // idle
    button.disabled = false;
    button.style.cursor = "pointer";
    button.textContent = "AI Reply";
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
  }
}

function attachReplyMateButtonHoverStyles(button) {
  button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;

  button.addEventListener("mouseenter", () => {
    const state = button.dataset.replymateState || "idle";
    if (state === "idle") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_HOVER;
    }
  });

  button.addEventListener("mouseleave", () => {
    const state = button.dataset.replymateState || "idle";
    if (state === "idle") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
    } else if (state === "loading") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_LOADING;
    } else if (state === "error") {
      button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_ERROR;
    }
  });
}

function buildLengthInstruction(length) {
  const l = (length || DEFAULT_LENGTH).toLowerCase();

  if (l === "short") {
    return "Write a very concise reply that usually fits into 1–2 short sentences. Be practical and direct with minimal padding, and do not add extra small talk beyond what feels natural for this email.";
  }

  if (l === "long") {
    return "Write a noticeably more developed reply than a medium-length one. When the original email has enough substance, expand with more appreciation, context, clarifications, and a polished closing. Keep it natural and avoid unnecessary fluff if the email itself is very short.";
  }

  // medium / default
  return "Write a balanced, natural reply that feels clearly fuller than a short reply but lighter than a long one. Aim for moderate detail and politeness without sounding verbose, adapting the length to what feels appropriate for this email.";
}


// Finds the reply editor associated with a clicked ReplyMate button.
function findEditorForButton(button) {
  // Reply editors typically live inside the opened conversation thread area.
  // We first try to stay within the same conversation / reply container as the button.
  const replyContainer =
    button.closest("div[aria-label='Message Body']") ||
    button.closest("div[role='region']") ||
    button.closest("div[role='dialog']") ||
    button.parentElement;

  if (!replyContainer) return null;

  return replyContainer.querySelector(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );
}

// Heuristic: determine whether a given editor looks like a REPLY editor
// (in an opened email thread) rather than a standalone "New message" compose window.
function isReplyEditor(editor) {
  const dialog = editor.closest("div[role='dialog']");

  if (dialog) {
    // For this project, we want to focus on reply areas inside opened threads,
    // and avoid standalone compose dialogs as much as possible.
    return false;
  }

  // Inline reply areas often live directly inside the conversation region.
  const conversationRegion = editor.closest("div[role='region']");
  if (conversationRegion) {
    return true;
  }

  // Fallback: treat as non-reply to avoid over-injecting.
  return false;
}

function createReplyMateButton() {
  // Create a container for both button and input
  const container = document.createElement("div");
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.gap = "8px";
  container.style.pointerEvents = "auto";
  container.style.position = "relative";
  container.style.zIndex = "1";
  
  const button = document.createElement("button");
  button.className = "replymate-generate-button";

  button.style.padding = "6px 10px";
  button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
  button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "12px";

  // Create the additional instruction input
  const instructionInput = document.createElement("input");
  instructionInput.type = "text";
  instructionInput.placeholder = "Add optional instruction (e.g. mention tomorrow)...";
  instructionInput.className = "replymate-instruction-input";
  instructionInput.style.padding = "4px 8px";
  instructionInput.style.border = "1px solid #ccc";
  instructionInput.style.borderRadius = "4px";
  instructionInput.style.fontSize = "12px";
  instructionInput.style.width = "275px";
  instructionInput.style.minWidth = "150px";
  instructionInput.style.maxWidth = "300px";
  instructionInput.style.pointerEvents = "auto";
  instructionInput.style.userSelect = "auto";
  instructionInput.style.webkitUserSelect = "auto";
  instructionInput.style.outline = "none";
  instructionInput.style.backgroundColor = "#fff";
  instructionInput.style.color = "#000";

  // Prevent event bubbling but allow normal text selection
  instructionInput.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    // Don't preventDefault to allow text selection
    instructionInput.focus();
  });
  
  instructionInput.addEventListener("click", (e) => {
    e.stopPropagation();
    // Don't preventDefault to allow text selection
    instructionInput.focus();
  });
  
  instructionInput.addEventListener("focus", (e) => {
    e.stopPropagation();
  });

  attachReplyMateButtonHoverStyles(button);
  setReplyMateButtonState(button, "idle");

  // When clicked, call backend and insert generated reply into the correct editor.
  button.addEventListener("click", async (event) => {
    // Duplicate click prevention: ignore if already loading.
    if (button.dataset.replymateState === "loading") {
      console.log("[ReplyMate] Compose button click ignored (already loading)");
      return;
    }

    setReplyMateButtonState(button, "loading");

    const targetButton = event.currentTarget;
    const editor = findEditorForButton(targetButton);
    if (!editor) {
      setReplyMateButtonState(button, "idle");
      return;
    }

    const settings = await loadReplyMateSettings();
    const threadContext = extractThreadContext();

    const payload = {
      subject: threadContext.subject || "",
      latestMessage: threadContext.latestMessage || "",
      previousMessages: threadContext.previousMessages || [],
      recipientName: threadContext.recipientName || "",
      userName: settings.userName || threadContext.inferredUserName || "",
      tone: settings.tone || DEFAULT_TONE,
      length: settings.length || DEFAULT_LENGTH,
      lengthInstruction: buildLengthInstruction(settings.length || DEFAULT_LENGTH),
      additionalInstruction: instructionInput.value || "",
    };

    const replyData = await generateAIReply(payload);
    if (!replyData) {
      setReplyMateButtonState(button, "error");
      setTimeout(() => setReplyMateButtonState(button, "idle"), 2000);
      return;
    }

    insertReplyIntoEditor(editor, replyData.reply);
    setReplyMateButtonState(button, "idle");
    
    // Update usage display if usage info is available
    if (replyData && replyData.usage) {
      const usageDisplay = container.querySelector(".replymate-usage-display");
      if (usageDisplay) {
        const planLimits = {
          'free': 50,
          'pro': 300,
          'pro_plus': 1000
        };
        const limit = planLimits[replyData.usage.plan] || 50;
        usageDisplay.textContent = formatUsageDisplay(replyData.usage.plan, replyData.usage.remaining, limit);
      }
    } else {
      // Fallback: refresh usage display if no usage info in response
      const usageDisplay = container.querySelector(".replymate-usage-display");
      if (usageDisplay) {
        updateUsageDisplay(usageDisplay);
      }
    }
    // Note: We do NOT clear the instruction input - it persists for repeated use
  });

  // Add both elements to container
  container.appendChild(button);
  container.appendChild(instructionInput);
  
  // Add usage display element
  const usageDisplay = document.createElement("div");
  usageDisplay.className = "replymate-usage-display";
  usageDisplay.style.fontSize = "11px";
  usageDisplay.style.color = "#666";
  usageDisplay.style.marginTop = "4px";
  usageDisplay.textContent = "Remaining: - replies";
  container.appendChild(usageDisplay);
  
  // Fetch and update usage display
  updateUsageDisplay(usageDisplay);
  
  return container;
}

// Insert the provided reply text into a Gmail rich-text editor (contenteditable).
function insertReplyIntoEditor(editor, replyText) {
  if (!(editor instanceof HTMLElement)) return;

  const safeText = typeof replyText === "string" ? replyText : "";

  // Convert text into HTML with <br> to preserve line breaks.
  const html = safeText
    .split("\n")
    .map((line) => {
      if (line === "") return "<br>";
      return line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    })
    .join("<br>");

  editor.focus();
  editor.innerHTML = html;

  // Trigger input/change so Gmail notices the content update.
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

// Extract information about the currently opened Gmail thread (subject, messages, names).
// This is a best-effort DOM scrape and falls back safely if elements are not found.
function extractThreadContext() {
  try {
    const main = document.querySelector("div[role='main']") || document.body;

    // Subject: Gmail usually renders it with class "hP" inside the thread header.
    let subject = "";
    let subjectEl =
      main.querySelector("h2.hP") ||
      main.querySelector("h1.hP") ||
      main.querySelector("h2[role='heading']") ||
      main.querySelector("h1[role='heading']");

    if (subjectEl && subjectEl.textContent) {
      subject = subjectEl.textContent.trim();
    }

    // Collect visible message containers in the thread.
    const rawContainers = Array.from(
      main.querySelectorAll("div[data-message-id], div[role='listitem'], div[role='article']")
    );

    const visibleMessages = [];

    for (const container of rawContainers) {
      if (!(container instanceof HTMLElement)) continue;
      if (container.offsetParent === null) continue;

      // Approximate message body: Gmail often uses div[dir="ltr"] for content.
      const bodyEl = container.querySelector("div[dir='ltr']") || container;
      const text = (bodyEl.innerText || bodyEl.textContent || "").trim();

      if (!text) continue;

      visibleMessages.push({
        container,
        text,
      });
    }

    let latestMessage = "";
    let previousMessages = [];
    let recipientName = "";
    let inferredUserName = "";

    if (visibleMessages.length > 0) {
      const latest = visibleMessages[visibleMessages.length - 1];
      latestMessage = latest.text;

      // Up to 3 previous messages, in chronological order.
      const prev = visibleMessages
        .slice(Math.max(0, visibleMessages.length - 4), visibleMessages.length - 1)
        .map((item) => item.text);
      previousMessages = prev;

      // Try to find a display name near the latest message.
      const nameElInLatest =
        latest.container.querySelector("span[email]") ||
        latest.container.querySelector("span[role='link'][tabindex='-1']");

      if (nameElInLatest && nameElInLatest.textContent) {
        recipientName = nameElInLatest.textContent.trim();
      }

      // Try to infer user's name from how they were addressed in the latest message
      const messageText = latest.text.toLowerCase();
      const greetings = ["hi ", "hello ", "dear ", "hey ", "good morning ", "good afternoon "];
      
      for (const greeting of greetings) {
        const index = messageText.indexOf(greeting);
        if (index !== -1) {
          const afterGreeting = messageText.substring(index + greeting.length);
          // Look for name up to 3 words after greeting
          const words = afterGreeting.split(/\s+/).slice(0, 3);
          const potentialName = words.join(" ").replace(/[,.!?;:]/g, "").trim();
          if (potentialName && potentialName.length > 1 && potentialName.length < 30) {
            inferredUserName = potentialName.charAt(0).toUpperCase() + potentialName.slice(1);
            break;
          }
        }
      }
    }

    // Fallback: try to find any visible sender/recipient name in the thread.
    if (!recipientName) {
      const anyNameEl =
        main.querySelector("span[email]") ||
        main.querySelector("span[role='link'][tabindex='-1']");
      if (anyNameEl && anyNameEl.textContent) {
        recipientName = anyNameEl.textContent.trim();
      }
    }

    return {
      subject: subject || "",
      latestMessage: latestMessage || "",
      previousMessages: previousMessages || [],
      recipientName: recipientName || "",
      inferredUserName: inferredUserName || "",
    };
  } catch {
    // Always return a safe object even if the DOM structure is unexpected.
    return {
      subject: "",
      latestMessage: "",
      previousMessages: [],
      recipientName: "",
      inferredUserName: "",
    };
  }
}

// Small polling helper for dynamic Gmail UI: repeatedly tries `getValue()` until
// it returns a truthy value or times out.
function poll(getValue, { timeoutMs = 8000, intervalMs = 200 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();

    const tick = () => {
      let value = null;
      try {
        value = getValue();
      } catch {
        value = null;
      }

      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }

      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  function scrollMainThreadDown() {
    const main = document.querySelector("div[role='main']");
    if (!main) return;
  
    // Gmail 읽기 화면을 아래로 조금씩 내려서 Reply 버튼이 보이게 유도
    main.scrollBy({
      top: 800,
      left: 0,
      behavior: "instant",
    });
  }
  
  function getVisibleReplyCandidates() {
    const main = document.querySelector("div[role='main']") || document.body;
  
    const candidates = Array.from(
      main.querySelectorAll("div[role='button'], span[role='button'], td[role='button'], button, span, div")
    );
  
    return candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
  
      const ariaLabel = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      const dataTooltip = (el.getAttribute("data-tooltip") || "").trim().toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();
  
      const looksLikeReply =
        ariaLabel === "reply" ||
        ariaLabel.startsWith("reply") ||
        dataTooltip === "reply" ||
        dataTooltip.startsWith("reply") ||
        text === "reply";
  
      if (!looksLikeReply) return false;
  
      const looksWrong =
        ariaLabel.includes("forward") ||
        ariaLabel.includes("reply all") ||
        dataTooltip.includes("forward") ||
        dataTooltip.includes("reply all") ||
        text === "forward" ||
        text === "reply all";
  
      if (looksWrong) return false;
  
      return true;
    });
  }

// Find a "Reply" action button in the currently opened thread view.
// Gmail is heavily dynamic, so we try a few reasonable selectors.
function findReplyButtonInThread() {
    const candidates = getVisibleReplyCandidates();
  
    if (!candidates.length) return null;
  
    // 화면 아래쪽에 있는 Reply 버튼이 실제로 우리가 원하는 inline reply일 가능성이 큼
    candidates.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.top - rectA.top; // 더 아래에 있는 버튼 우선
    });
  
    return candidates[0] || null;
  }

  function clickElementLikeUser(element) {
    if (!(element instanceof Element)) return;
  
    const eventInit = { bubbles: true, cancelable: true, view: window };
  
    element.dispatchEvent(new MouseEvent("mouseover", eventInit));
    element.dispatchEvent(new MouseEvent("mousedown", eventInit));
    element.dispatchEvent(new MouseEvent("mouseup", eventInit));
    element.dispatchEvent(new MouseEvent("click", eventInit));
  }

// Find the reply editor that appears after clicking Reply.
function findActiveReplyEditor() {
  const main = document.querySelector("div[role='main']") || document.body;
  const editors = main.querySelectorAll(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );

  for (const editor of editors) {
    if (!(editor instanceof HTMLElement)) continue;
    if (editor.offsetParent === null) continue;
    if (!isReplyEditor(editor)) continue;
    return editor;
  }

  return null;
}

// ------------------------------
// Inbox / message list hover UI
// ------------------------------

// Class name used for the hover button so we can avoid duplicates.
const REPLYMATE_HOVER_BUTTON_CLASS = "replymate-hover-generate-button";

// Try to identify a Gmail message list row in a safe, conservative way.
// Gmail commonly uses either:
// - `tr.zA` rows (legacy table layout), or
// - `div[role="row"]` inside `div[role="grid"]` (newer layouts)
function findMessageListRowFromTarget(target) {
  if (!(target instanceof Element)) return null;

  const legacyRow = target.closest("tr.zA");
  if (legacyRow) return legacyRow;

  const ariaRow = target.closest("div[role='row']");
  if (ariaRow && ariaRow.closest("div[role='grid']")) return ariaRow;

  return null;
}



// Safely open the email thread for a given row by simulating a user click.
// Gmail sometimes relies on mouse events rather than just calling `.click()`.
function openThreadForRow(row) {
  if (!(row instanceof Element)) return;

  // Prefer a direct link if one exists (more deterministic than clicking the whole row).
  const links = row.querySelectorAll("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href") || "";

    // Gmail thread links typically use a hash route (e.g. "/mail/u/0/#inbox/...").
    // Avoid mailto and other non-navigation links that might exist in the row.
    if (href.includes("#") && !href.startsWith("mailto:")) {
      link.click();
      return;
    }
  }

  // Fallback: dispatch a small sequence of mouse events on the row.
  const eventInit = { bubbles: true, cancelable: true, view: window };
  row.dispatchEvent(new MouseEvent("mousedown", eventInit));
  row.dispatchEvent(new MouseEvent("mouseup", eventInit));
  row.dispatchEvent(new MouseEvent("click", eventInit));
}

// Full workflow for the hover button:
// 1) open the email thread
// 2) wait for thread UI, find & click Reply
// 3) wait for reply editor
// 4) insert the sample reply
async function runHoverGenerateReplyWorkflow(row, sourceButton) {
    if (!(row instanceof Element)) return;
  
    if (row.dataset.replymateWorkflowRunning === "1") return;
    row.dataset.replymateWorkflowRunning = "1";
  
    if (sourceButton) {
      // If already loading, prevent duplicate requests.
      if (sourceButton.dataset.replymateState === "loading") {
        console.log("[ReplyMate] Hover button workflow already running for this row");
        return;
      }
      setReplyMateButtonState(sourceButton, "loading");
      // Mark button so hide logic can keep it visible during workflow.
      sourceButton.dataset.replymateGenerating = "1";
    }
  
    try {
      openThreadForRow(row);
  
      // 메일 열리는 시간 잠깐 대기
      await sleep(1200);
  
      // Reply 버튼이 스레드 아래쪽에 있을 수 있어서 스크롤 보정
      for (let i = 0; i < 4; i++) {
        scrollMainThreadDown();
        await sleep(400);
      }
  
      const replyButton = await poll(() => {
        scrollMainThreadDown();
        return findReplyButtonInThread();
      }, {
        timeoutMs: 12000,
        intervalMs: 400,
      });
  
      if (!replyButton) {
        console.log("[ReplyMate] Reply button not found");
        const inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          setReplyMateButtonState(inEmailButton, "error");
          setTimeout(() => setReplyMateButtonState(inEmailButton, "idle"), 2000);
        }
        return;
      }
  
      console.log("[ReplyMate] Reply button found:", replyButton);
  
      // 화면에 잘 보이게 한 뒤 클릭
      replyButton.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  
      await sleep(300);
      clickElementLikeUser(replyButton);
  
      const replyEditor = await poll(() => findActiveReplyEditor(), {
        timeoutMs: 12000,
        intervalMs: 300,
      });
  
      if (!replyEditor) {
        console.log("[ReplyMate] Reply editor not found");
        if (sourceButton) {
          setReplyMateButtonState(sourceButton, "error");
          setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
        }
        const inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          setReplyMateButtonState(inEmailButton, "error");
          setTimeout(() => setReplyMateButtonState(inEmailButton, "idle"), 2000);
        }
        return;
      }
  
      console.log("[ReplyMate] Reply editor found:", replyEditor);
  
      replyEditor.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  
      await sleep(200);

      try {
        // Find and update the in-email AI Reply button to show loading state
        const inEmailButton = document.querySelector(".replymate-generate-button");
        if (inEmailButton) {
          setReplyMateButtonState(inEmailButton, "loading");
        }

        // Load user settings (tone, length, and user name).
        const settings = await loadReplyMateSettings();

        // Extract context from the currently opened Gmail thread.
        const threadContext = extractThreadContext();

        // Build the payload that would be sent to an AI backend.
        const payload = {
          subject: threadContext.subject || "",
          latestMessage: threadContext.latestMessage || "",
          recipientName: threadContext.recipientName || "",
          userName: settings.userName || "",
          tone: settings.tone || DEFAULT_TONE,
          length: settings.length || DEFAULT_LENGTH,
          lengthInstruction: buildLengthInstruction(settings.length || DEFAULT_LENGTH),
        };

        // Only include previousMessages when we actually have some.
        if (Array.isArray(threadContext.previousMessages) && threadContext.previousMessages.length > 0) {
          payload.previousMessages = threadContext.previousMessages;
        }

        console.log("[ReplyMate payload]", payload);
  
        const replyData = await generateAIReply(payload);
  
        if (!replyData) {
          if (sourceButton) {
            setReplyMateButtonState(sourceButton, "error");
            setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
          }
          if (inEmailButton) {
            setReplyMateButtonState(inEmailButton, "error");
            setTimeout(() => setReplyMateButtonState(inEmailButton, "idle"), 2000);
          }
          return;
        }
  
        insertReplyIntoEditor(replyEditor, replyData.reply);
        if (sourceButton) {
          setReplyMateButtonState(sourceButton, "idle");
        }
        if (inEmailButton) {
          setReplyMateButtonState(inEmailButton, "idle");
        }

        // Update usage display if usage info is available (same as inner button)
        if (replyData && replyData.usage) {
          const usageDisplay = document.querySelector(".replymate-usage-display");
          if (usageDisplay) {
            const planLimits = {
              'free': 50,
              'pro': 300,
              'pro_plus': 1000
            };
            const limit = planLimits[replyData.usage.plan] || 50;
            usageDisplay.textContent = formatUsageDisplay(replyData.usage.plan, replyData.usage.remaining, limit);
          }
        } else {
          // Fallback: refresh usage display if no usage info in response
          const usageDisplay = document.querySelector(".replymate-usage-display");
          if (usageDisplay) {
            updateUsageDisplay(usageDisplay);
          }
        }
      } finally {
        row.dataset.replymateWorkflowRunning = "0";
        if (sourceButton) {
          delete sourceButton.dataset.replymateGenerating;
        }
      }
    } catch (error) {
      console.error("[ReplyMate] Error generating reply:", error);
      if (sourceButton) {
        setReplyMateButtonState(sourceButton, "error");
        setTimeout(() => setReplyMateButtonState(sourceButton, "idle"), 2000);
      }
      if (inEmailButton) {
        setReplyMateButtonState(inEmailButton, "error");
        setTimeout(() => setReplyMateButtonState(inEmailButton, "idle"), 2000);
      }
    }
  }
  
  function createHoverGenerateButton(row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = REPLYMATE_HOVER_BUTTON_CLASS;

    button.style.padding = "4px 10px";
    button.style.backgroundColor = REPLYMATE_BUTTON_COLOR_NORMAL;
    button.style.color = REPLYMATE_BUTTON_TEXT_COLOR;
    button.style.border = "none";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.fontSize = "12px";
    button.style.lineHeight = "1";
    button.style.height = "28px";
    button.style.whiteSpace = "nowrap";

    attachReplyMateButtonHoverStyles(button);
    setReplyMateButtonState(button, "idle");

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      // Duplicate click prevention: ignore if already loading.
      if (button.dataset.replymateState === "loading") {
        console.log("[ReplyMate] Hover button click ignored (already loading)");
        return;
      }

      // Check usage before proceeding
      try {
        const userId = await getReplyMateUserId();
        
        const usageResponse = await fetch("http://localhost:3000/usage", {
          method: "GET",
          headers: {
            "X-User-ID": userId
          }
        });

        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          if (usage.remaining <= 0) {
            showReplyMateMessage("⚠ ReplyMate limit reached. Upgrade to generate more replies.");
            setReplyMateButtonState(button, "error");
            setTimeout(() => setReplyMateButtonState(button, "idle"), 2000);
            return;
          }
        }
      } catch (error) {
        console.error("[ReplyMate] Failed to check usage:", error);
        // Continue anyway on error
      }

      runHoverGenerateReplyWorkflow(row, button);
    });

    return button;
  }

  function findVisibleRightSideControls(row) {
    if (!(row instanceof Element)) return [];
  
    const rowRect = row.getBoundingClientRect();
    const actionZoneStart = rowRect.left + rowRect.width * 0.45;
  
    const candidates = Array.from(
      row.querySelectorAll(
        "[role='button'], button, a, span[role='button'], span[role='link'], div[role='button']"
      )
    );
  
    return candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.offsetParent === null) return false;
      if (el.classList.contains(REPLYMATE_HOVER_BUTTON_CLASS)) return false;
  
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
  
      // See reply / Unsubscribe 같은 큰 버튼도 허용
      if (rect.width > 260 || rect.height > 80) return false;
  
      // 오른쪽 액션 영역만 보기
      if (rect.right < actionZoneStart) return false;
  
      const text = (el.textContent || "").trim();
  
      // 긴 제목/본문 snippet 제외
      const looksLikeLongMessageText =
        text.length > 40 && rect.left < rowRect.left + rowRect.width * 0.75;
  
      if (looksLikeLongMessageText) return false;
  
      return true;
    });
  }

  function findVisibleDefaultGmailActionControls(row) {
    if (!(row instanceof Element)) return [];
  
    const selectors = [
      "[aria-label='Archive']",
      "[data-tooltip='Archive']",
      "[aria-label='Delete']",
      "[data-tooltip='Delete']",
      "[aria-label='Snooze']",
      "[data-tooltip='Snooze']",
      "[aria-label='Mark as read']",
      "[data-tooltip='Mark as read']",
      "[aria-label='Mark as unread']",
      "[data-tooltip='Mark as unread']",
      "[aria-label='Move to']",
      "[data-tooltip='Move to']",
      "[aria-label='Labels']",
      "[data-tooltip='Labels']"
    ];
  
    return selectors
      .flatMap((selector) => Array.from(row.querySelectorAll(selector)))
      .filter((el) => el instanceof HTMLElement && el.offsetParent !== null);
  }
  
  function positionHoverButton(row, button) {
    let controls = findVisibleRightSideControls(row);
  
    // 부가 버튼 포함 일반 탐지 실패 시, Gmail 기본 아이콘만 따로 탐지
    if (controls.length === 0) {
      controls = findVisibleDefaultGmailActionControls(row);
    }
  
    if (controls.length > 0) {
      const rowRect = row.getBoundingClientRect();
  
      const leftmost = controls.reduce((minEl, el) => {
        const rect = el.getBoundingClientRect();
        const minRect = minEl.getBoundingClientRect();
        return rect.left < minRect.left ? el : minEl;
      });
  
      const leftmostRect = leftmost.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
  
      const gap = 10;
      let left = leftmostRect.left - rowRect.left - buttonRect.width - gap;
      let top =
        leftmostRect.top -
        rowRect.top +
        (leftmostRect.height - buttonRect.height) / 2;
  
      left = Math.max(8, left);
      top = Math.max(4, top);
  
      button.style.left = `${left}px`;
      button.style.top = `${top}px`;
      button.style.right = "auto";
      button.style.transform = "none";
  
      return true;
    }
  
    return false;
  }

  function showHoverButtonForRow(row) {
    if (!(row instanceof Element)) return;
    if (row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`)) return;
  
    const button = createHoverGenerateButton(row);
  
    const computed = window.getComputedStyle(row);
    if (computed.position === "static") {
      row.style.position = "relative";
    }
  
    button.style.position = "absolute";
    button.style.visibility = "hidden";
    button.style.zIndex = "9999";
    button.style.transform = "none";
    row.appendChild(button);
  
    let attempts = 0;
    const maxAttempts = 16;
  
    const tryPlace = () => {
      // row에서 버튼이 이미 사라졌으면 중단
      if (!document.body.contains(button)) return;
  
      const positioned = positionHoverButton(row, button);
  
      if (positioned) {
        button.style.visibility = "visible";
        return;
      }
  
      attempts += 1;
  
      if (attempts < maxAttempts) {
        setTimeout(tryPlace, 50);
        return;
      }
  
      // fallback
      button.style.right = "24px";
      button.style.top = "50%";
      button.style.left = "auto";
      button.style.transform = "translateY(-50%)";
      button.style.visibility = "visible";
    };
  
    tryPlace();
  }
  
  function hideHoverButtonForRow(row) {
    if (!(row instanceof Element)) return;
  
    const existingButton = row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`);
    if (!existingButton) return;

    // If a generation workflow is running for this row/button, keep it visible
    // so the user can see the loading / error state, even if the mouse leaves.
    if (
      row.dataset.replymateWorkflowRunning === "1" ||
      existingButton.dataset.replymateGenerating === "1"
    ) {
      console.log("[ReplyMate] hideHoverButtonForRow skipped (generating)");
      return;
    }

    // If the instruction input is focused, keep the button visible so user can type
    if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("replymate-instruction-input")) {
      console.log("[ReplyMate] hideHoverButtonForRow skipped (input focused)");
      return;
    }

    existingButton.remove();
  }  

// Use event delegation so we don't have to attach listeners to every row instance.
// `mouseover` / `mouseout` bubble, which makes them ideal for delegation.
function setupMessageListHoverHandlers() {
  if (window.__replymateHoverHandlersInstalled) return;
  window.__replymateHoverHandlersInstalled = true;

  document.addEventListener(
    "mouseover",
    (event) => {
      const row = findMessageListRowFromTarget(event.target);
      if (!row) return;

      // Only treat it as "enter" if the mouse came from outside the row.
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;

      showHoverButtonForRow(row);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const row = findMessageListRowFromTarget(event.target);
      if (!row) return;

      // Only treat it as "leave" if the mouse is going outside the row.
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;

      hideHoverButtonForRow(row);
    },
    true
  );
}

// Injects a single ReplyMate button per REPLY editor and avoids duplicates.
function injectButtonIntoComposeAreas() {
  const editors = document.querySelectorAll(
    'div[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );

  editors.forEach((editor) => {
    // Only target editors that look like reply editors, not generic compose.
    if (!isReplyEditor(editor)) {
      return;
    }

    const composeContainer = editor.closest("div[role='dialog']") || editor.parentElement;
    if (!composeContainer) return;

    // Skip if this compose already has a ReplyMate button or instruction input.
    if (composeContainer.querySelector(".replymate-generate-button") || 
        composeContainer.querySelector(".replymate-instruction-input")) {
      return;
    }

    const button = createReplyMateButton();

    const buttonWrapper = document.createElement("div");
    buttonWrapper.style.marginTop = "8px";
    buttonWrapper.style.pointerEvents = "auto";
    buttonWrapper.style.position = "relative";
    buttonWrapper.style.zIndex = "1";
    buttonWrapper.appendChild(button);

    editor.parentElement.appendChild(buttonWrapper);
  });
}

// Observe the Gmail DOM so that buttons are injected for new compose windows.
const observer = new MutationObserver(() => {
  // Skip if user is typing in instruction input to avoid UI disruption
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("replymate-instruction-input")) {
    return;
  }
  injectButtonIntoComposeAreas();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial injection for compose editors that already exist on page load.
injectButtonIntoComposeAreas();
setupMessageListHoverHandlers();