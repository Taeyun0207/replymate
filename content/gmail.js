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
    const label = (dialog.getAttribute("aria-label") || "").toLowerCase();

    // Standalone compose windows are usually labeled like "New message".
    if (label.includes("new message")) {
      return false;
    }

    // If it's a dialog but not explicitly a "new message", treat it as a reply/forward.
    return true;
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

    // Convert the sample reply into HTML with <br> to preserve line breaks.
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
  });

  return button;
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
  const link = row.querySelector("a[href]");
  if (link) {
    link.click();
    return;
  }

  // Fallback: dispatch a small sequence of mouse events on the row.
  const eventInit = { bubbles: true, cancelable: true, view: window };
  row.dispatchEvent(new MouseEvent("mousedown", eventInit));
  row.dispatchEvent(new MouseEvent("mouseup", eventInit));
  row.dispatchEvent(new MouseEvent("click", eventInit));
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
    openThreadForRow(row);
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