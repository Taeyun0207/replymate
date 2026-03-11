console.log("ReplyMate Gmail script loaded");

// Sample reply text that will be inserted into the Gmail reply editor.
const REPLYMATE_SAMPLE_REPLY = [
  "Hello,",
  "",
  "Thank you for your email. I will get back to you soon.",
  "",
  "Best regards,",
  "Taeyun",
].join("\n");

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
  const button = document.createElement("button");
  button.textContent = "Generate Reply";
  button.className = "replymate-generate-button";

  button.style.marginLeft = "8px";
  button.style.padding = "6px 10px";
  button.style.backgroundColor = "#1a73e8";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "12px";

  // When clicked, insert the sample reply into the correct compose editor.
  button.addEventListener("click", (event) => {
    const targetButton = event.currentTarget;
    const editor = findEditorForButton(targetButton);
    if (!editor) {
      return;
    }

    insertSampleReplyIntoEditor(editor);
  });

  return button;
}

// Insert the sample reply into a Gmail rich-text editor (contenteditable).
function insertSampleReplyIntoEditor(editor) {
    if (!(editor instanceof HTMLElement)) return;
  
    const html = REPLYMATE_SAMPLE_REPLY.split("\n")
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
  
    // Gmail이 입력 변화를 인식하도록 이벤트도 발생
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
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
async function runHoverGenerateReplyWorkflow(row) {
    if (!(row instanceof Element)) return;
  
    if (row.dataset.replymateWorkflowRunning === "1") return;
    row.dataset.replymateWorkflowRunning = "1";
  
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
        return;
      }
  
      console.log("[ReplyMate] Reply editor found:", replyEditor);
  
      replyEditor.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  
      await sleep(200);
      insertSampleReplyIntoEditor(replyEditor);
    } finally {
      row.dataset.replymateWorkflowRunning = "0";
    }
  }

function createHoverGenerateButton(row) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Generate Reply";
  button.className = REPLYMATE_HOVER_BUTTON_CLASS;

  // Position near the right side of the message row.
  button.style.position = "absolute";
  button.style.right = "10px";
  button.style.top = "50%";
  button.style.transform = "translateY(-50%)";

  // Match the style of the reply-editor "Generate Reply" button for consistency.
  button.style.padding = "6px 10px";
  button.style.backgroundColor = "#1a73e8";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "12px";
  button.style.zIndex = "10";

  button.addEventListener("click", (e) => {
    // Prevent Gmail's row click handler from firing twice; we will open the thread ourselves.
    e.stopPropagation();
    e.preventDefault();

    // Run the full workflow: open thread -> click Reply -> insert sample reply.
    runHoverGenerateReplyWorkflow(row);
  });

  return button;
}

function showHoverButtonForRow(row) {
  if (!(row instanceof Element)) return;

  // Avoid duplicate hover buttons.
  if (row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`)) return;

  // Ensure the row is a positioning context for the absolute-positioned button.
  // We only set this if needed to avoid interfering with Gmail layout.
  const computed = window.getComputedStyle(row);
  if (computed.position === "static") {
    row.style.position = "relative";
  }

  row.appendChild(createHoverGenerateButton(row));
}

function hideHoverButtonForRow(row) {
  if (!(row instanceof Element)) return;
  const existing = row.querySelector(`.${REPLYMATE_HOVER_BUTTON_CLASS}`);
  if (existing) existing.remove();
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

    // Skip if this compose already has a ReplyMate button.
    if (composeContainer.querySelector(".replymate-generate-button")) {
      return;
    }

    const button = createReplyMateButton();

    const buttonWrapper = document.createElement("div");
    buttonWrapper.style.marginTop = "8px";
    buttonWrapper.appendChild(button);

    editor.parentElement.appendChild(buttonWrapper);
  });
}

// Observe the Gmail DOM so that buttons are injected for new compose windows.
const observer = new MutationObserver(() => {
  injectButtonIntoComposeAreas();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial injection for compose editors that already exist on page load.
injectButtonIntoComposeAreas();
setupMessageListHoverHandlers();