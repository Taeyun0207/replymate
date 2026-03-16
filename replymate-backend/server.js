const express = require("express");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { PLAN_LIMITS } = require("./src/config/plans");
const { getUser, updateUserPlan, recordUsage, testConnection, updateUserCancelScheduled, clearUserCancelScheduled, downgradeUserBySubscriptionId, syncPeriodBySubscriptionId } = require("./src/database");
const { getTotalTopupRemaining, createTopup } = require("./src/topup");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Please sign in with Google." });
  }
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
    }
    req.userId = user.id;
    next();
  } catch (err) {
    console.error("Auth verification error:", err);
    return res.status(401).json({ error: "Unauthorized." });
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Map plan names to Stripe price IDs
const PLAN_PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO,
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS,
};

// Top-up pack price IDs (one-time payment)
const TOPUP_PRICE_IDS = {
  100: process.env.STRIPE_PRICE_TOPUP_100,
  500: process.env.STRIPE_PRICE_TOPUP_500,
};

// ─────────────────────────────────────────────
// FIX 4: 언어별로 분리된 단순 응답 키워드 목록
// ─────────────────────────────────────────────
const ACKNOWLEDGEMENTS = {
  english: ["thanks", "thank you", "ok", "okay", "got it", "sounds good", "yes", "sure"],
  korean: ["네", "알겠습니다", "감사합니다", "고맙습니다", "예", "좋습니다"],
  japanese: ["はい", "了解", "ありがとう", "ありがとうございます", "分かりました"],
};
const ALL_ACKNOWLEDGEMENTS = Object.values(ACKNOWLEDGEMENTS).flat();

// ─────────────────────────────────────────────
// FIX 5: Auto 길이 판단 로직을 별도 함수로 분리
// FIX 1: 단순 응답 감지 오탐 수정 (.includes 단독 → 길이 조건 병행)
// FIX 2: 물음표 오버라이드에 글자 수 조건 추가
// FIX 3: Medium → Long 상향 경로 추가
// ─────────────────────────────────────────────
function determineAutoLength(latestMessage) {
  const latestMessageLower = (latestMessage || "").toLowerCase().trim();
  const messageLength = (latestMessage || "").length;

  // FIX 1: 단독 일치 OR (짧은 메시지 + includes) 조건으로 오탐 방지
  const isAcknowledgement =
    ALL_ACKNOWLEDGEMENTS.some((ack) => latestMessageLower === ack) ||
    (latestMessageLower.length < 30 &&
      ALL_ACKNOWLEDGEMENTS.some((ack) => latestMessageLower.includes(ack)));

  if (isAcknowledgement) {
    console.log("[DEBUG] Auto length: Acknowledgement → Short");
    return "Strict Short mode: Write exactly 1–2 sentences (maximum ~25 words). Be concise and direct with minimal padding.";
  }

  let determinedLength = "medium";
  if (messageLength < 20) determinedLength = "short";
  else if (messageLength > 120) determinedLength = "long";

  // FIX 2: 물음표 2개 이상이어도 메시지가 충분히 길 때만 Long으로 상향
  const questionCount = (latestMessage || "").split("?").length - 1;
  if (questionCount >= 2 && messageLength > 40) {
    console.log("[DEBUG] Auto length: Multiple questions → Long");
    determinedLength = "long";
  }

  const requestWords = [
    "please", "could you", "can you", "would you", "let me know",
    "send", "confirm", "제발", "부탁", "해주세요", "주세요",
    "お願い", "ください", "できますか", "お願いします",
  ];
  const hasRequest = requestWords.some((word) =>
    latestMessageLower.includes(word.toLowerCase())
  );

  // FIX 3: short → medium 뿐 아니라 medium → long 상향 경로도 추가
  if (hasRequest && determinedLength === "short") {
    console.log("[DEBUG] Auto length: Request detected → Medium");
    determinedLength = "medium";
  }
  if (hasRequest && determinedLength === "medium" && messageLength > 80) {
    console.log("[DEBUG] Auto length: Long request detected → Long");
    determinedLength = "long";
  }

  switch (determinedLength) {
    case "short":
      return "Strict Short mode: Write exactly 1–2 sentences (maximum ~25 words). Be concise and direct with minimal padding.";
    case "long":
      return "Strict Long mode: Write exactly 4–8 sentences (70–150 words). Expand with appreciation, context, clarifications, and a polished closing.";
    default:
      return "Strict Medium mode: Write exactly 2–4 sentences (25–70 words). Aim for balanced detail and politeness without sounding verbose.";
  }
}

// Helper function to check if user has exceeded their limit
async function checkUsageLimit(userId) {
  const usage = await getUser(userId);
  const limit = PLAN_LIMITS[usage.plan] || PLAN_LIMITS.free;
  const subscriptionRemaining = Math.max(0, limit - usage.used);
  let topupRemaining = 0;
  try {
    topupRemaining = await getTotalTopupRemaining(userId);
  } catch (e) {
    console.warn("[Usage] getTotalTopupRemaining failed:", e?.message);
  }
  const totalRemaining = subscriptionRemaining + topupRemaining;
  return {
    proceed: totalRemaining > 0,
    remaining: subscriptionRemaining,
    topupRemaining,
    totalRemaining,
    used: usage.used,
    limit: limit,
    plan: usage.plan,
    cancelScheduled: !!usage.cancelAtPeriodEnd,
    periodEndDate: usage.periodEndAt || null,
    nextResetAt: usage.nextResetAt || null,
  };
}

app.use(cors());

// Stripe webhook handler - MUST be defined before express.json()
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const meta = session.metadata || {};
      console.log("[Stripe] Webhook received: checkout.session.completed", "mode:", session.mode, "metadata:", meta);

      try {
        const { userId, type, targetPlan, packSize } = meta;

        if (!userId) {
          console.error("Missing userId in checkout session:", session.id);
          return res.status(400).json({ error: "Missing required metadata" });
        }

        // Top-up (one-time payment)
        if (session.mode === "payment" && type === "topup") {
          const pack = parseInt(packSize, 10);
          if (![100, 500].includes(pack)) {
            console.error("Invalid top-up pack size:", packSize);
            return res.status(400).json({ error: "Invalid top-up pack" });
          }
          await createTopup(userId, pack);
          console.log(`[Stripe] Top-up ${pack} replies added for user ${userId}`);
          return res.status(200).json({ received: true });
        }

        // Subscription
        if (!targetPlan || !["pro", "pro_plus"].includes(targetPlan)) {
          console.error("Missing or invalid targetPlan in checkout session:", session.id);
          return res.status(400).json({ error: "Missing required metadata" });
        }

        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        let periodOptions = {};
        if (stripeSubscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
            const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
            const periodStart = subscription.current_period_start ?? subscription.items?.data?.[0]?.current_period_start;
            if (periodEnd && periodStart) {
              periodOptions = {
                billingCycleStart: new Date(periodStart * 1000).toISOString(),
                nextResetAt: new Date(periodEnd * 1000).toISOString(),
              };
              console.log("[Stripe] Using subscription period:", periodOptions);
            }
          } catch (subErr) {
            console.warn("[Stripe] Could not fetch subscription for period, using default:", subErr.message);
          }
        }

        await updateUserPlan(
          userId,
          targetPlan,
          stripeCustomerId,
          stripeSubscriptionId,
          periodOptions
        );

        console.log(`[Stripe] User ${userId} upgraded to ${targetPlan}`);
        console.log(`[Stripe] Subscription completed:`, {
          sessionId: session.id,
          userId,
          targetPlan,
          customerEmail: session.customer_email,
          subscriptionId: session.subscription,
          stripeCustomerId,
        });
      } catch (error) {
        console.error("Error processing checkout.session.completed:", error);
        return res.status(500).json({ error: "Failed to process webhook" });
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      try {
        const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
        const periodStart = subscription.current_period_start ?? subscription.items?.data?.[0]?.current_period_start;
        if (periodEnd && periodStart) {
          const periodStartIso = new Date(periodStart * 1000).toISOString();
          const periodEndIso = new Date(periodEnd * 1000).toISOString();
          const updated = await syncPeriodBySubscriptionId(subscription.id, periodStartIso, periodEndIso);
          if (updated) {
            console.log("[Stripe] Period synced for subscription (renewal/update):", subscription.id);
          }
        }
      } catch (error) {
        console.error("Error processing customer.subscription.updated:", error);
        return res.status(500).json({ error: "Failed to process webhook" });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      try {
        await downgradeUserBySubscriptionId(subscription.id);
        console.log("[Stripe] User downgraded to free (subscription ended):", subscription.id);
      } catch (error) {
        console.error("Error processing customer.subscription.deleted:", error);
        return res.status(500).json({ error: "Failed to process webhook" });
      }
    }

    res.status(200).json({ received: true });
  }
);

// Apply JSON parser to all other routes
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ReplyMate backend is running.");
});

// Debug: test Supabase connection (check Render logs)
app.get("/api/db-check", async (req, res) => {
  try {
    await testConnection();
    console.log("[DB-Check] OK");
    res.json({ ok: true, message: "Supabase connected" });
  } catch (e) {
    console.error("[DB-Check] Failed:", e?.message, e?.details);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get current usage (requires auth)
app.get("/usage", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const usage = await checkUsageLimit(userId);
    console.log("[Usage] userId:", userId?.slice(0, 8) + "...", "plan:", usage?.plan, "used:", usage?.used);
    res.json(usage);
  } catch (error) {
    console.error("[Usage] Error:", error?.message || error);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

app.post("/generate-reply", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    console.log("[DEBUG] userId:", userId);

    const usageCheck = await checkUsageLimit(userId);
    console.log("[DEBUG] usageCheck:", usageCheck);

    if (!usageCheck.proceed) {
      return res.status(403).json({
        error: "usage_limit_exceeded",
        remaining: usageCheck.remaining,
        topupRemaining: usageCheck.topupRemaining ?? 0,
      });
    }

    if (!req.body || typeof req.body !== "object") {
      return res
        .status(400)
        .json({ error: "Invalid request body: expected object" });
    }

    const {
      subject,
      latestMessage,
      previousMessages,
      recipientName,
      userName,
      tone,
      lengthInstruction,
      additionalInstruction,
      language,
    } = req.body;

    console.log("Incoming request:", req.body);

    if (!latestMessage || typeof latestMessage !== "string") {
      return res.status(400).json({
        error: "Invalid payload: latestMessage is required and must be a string",
      });
    }

    if (previousMessages && !Array.isArray(previousMessages)) {
      return res.status(400).json({
        error: "Invalid payload: previousMessages must be an array",
      });
    }

    if (Array.isArray(previousMessages)) {
      for (let i = 0; i < previousMessages.length; i++) {
        const msg = previousMessages[i];
        if (!msg || typeof msg !== "object") {
          return res.status(400).json({
            error: `Invalid payload: previousMessages[${i}] must be an object with text and speakerName`,
          });
        }
        if (!msg.text || typeof msg.text !== "string") {
          return res.status(400).json({
            error: `Invalid payload: previousMessages[${i}].text is required and must be a string`,
          });
        }
      }
    }

    // FIX 5: 길이 판단 로직을 분리된 함수로 호출
    let effectiveLengthInstruction = lengthInstruction;
    const length = req.body.length || "auto";

    if (!lengthInstruction && length.toLowerCase() === "auto") {
      console.log("[DEBUG] Auto length mode: analyzing message");
      effectiveLengthInstruction = determineAutoLength(latestMessage);
      console.log("[DEBUG] Auto length determined:", effectiveLengthInstruction);
    }

    // Tone instructions — each tone must feel clearly distinct in output
    let toneInstructions = "";
    switch ((tone || "").toLowerCase()) {
      case "auto":
        toneInstructions =
          "TONE: Auto (you decide). Read the email thread carefully and choose the most natural, appropriate tone. Match the sender's style and the relationship implied by the conversation. A quick 'thanks!' deserves a brief, warm reply; a formal business inquiry deserves professional clarity; a friendly check-in deserves conversational warmth. Vary your tone naturally—do not default to generic polite. Sound like a real person who has read the email and cares about the response.";
        break;
      case "professional":
        toneInstructions =
          "TONE: Professional. Use work-appropriate, clear, composed language. Sound like a competent colleague or business contact: structured, reliable, and focused. Avoid casual slang, excessive warmth, or emotional language. Be respectful and efficient without being cold.";
        break;
      case "friendly":
        toneInstructions =
          "TONE: Friendly. Use warm, approachable, conversational language. Sound like a helpful acquaintance or supportive colleague: personable, positive, and easy to talk to. Include natural warmth and a human touch. Avoid stiff formality or robotic phrasing.";
        break;
      case "direct":
        toneInstructions =
          "TONE: Direct. Be concise and efficient. Get to the point quickly—no unnecessary pleasantries, softeners, or padding. Skip small talk unless essential. Remain polite but avoid extra courtesy phrases. Prioritize clarity and brevity over warmth.";
        break;
      default:
        // polite
        toneInstructions =
          "TONE: Polite. Use respectful, warm, courteous language. Balance formality with approachability. Include appropriate expressions of thanks, acknowledgment, or consideration. Be gracious without being overly formal or stiff.";
    }

    // Build email thread text
    let emailThreadText = "";

    if (Array.isArray(previousMessages) && previousMessages.length > 0) {
      emailThreadText =
        previousMessages
          .map((msg, index) => {
            const speakerLabel = msg.speakerName || "Other";
            return `Previous message ${index + 1} (${speakerLabel}):\n${msg.text}`;
          })
          .join("\n\n") + "\n\n";
    }

    const userDisplayName = userName || "";
    let latestSpeakerName = recipientName || "Other";

    if (userDisplayName && recipientName) {
      const normalizedUser = userDisplayName.toLowerCase().trim();
      const normalizedRecipient = recipientName.toLowerCase().trim();

      if (
        normalizedRecipient === normalizedUser ||
        normalizedRecipient.includes(normalizedUser) ||
        normalizedUser.includes(normalizedRecipient)
      ) {
        latestSpeakerName = "You";
      }
    }

    emailThreadText += `Latest message (${latestSpeakerName}):\n${latestMessage || ""}`;

    const prompt = `
${effectiveLengthInstruction || ""}

Subject: ${subject || ""}

Email thread:

${emailThreadText}

Task:
Write an email reply from You to the latest message. Your reply should feel like it was written by a real person who read the email and is responding naturally—not by a template or script.

Quality priorities (in order):
1. Natural and human: Write as a real person would. Vary sentence structure. Use contractions when appropriate. Avoid stiff, formulaic openings like "I hope this email finds you well" or "Thank you for reaching out." Match the energy and formality of the incoming message.
2. Context-appropriate: A simple "Thanks!" gets a brief, warm reply. A complex request gets a thoughtful, complete response. Do not over-explain when a short reply is enough; do not under-explain when the situation needs more.
3. Complete: Address every question and request. If there are multiple points, respond to each naturally—not as a bullet-point list unless the context warrants it.
4. Direct: Do not restate or paraphrase the sender's message. Get to your response. No "I understand you're asking about..."—just answer.
5. No fabrication: Never invent dates, times, prices, locations, or any detail not in the email. If the sender asks for info you don't have, use a placeholder in [].

PLACEHOLDER RULE: Create context-appropriate placeholders (e.g. [date], [meeting link], [delivery date]) as needed. The placeholder text MUST be in the SAME language as your reply—no mixing. Examples by language: English [date],[time],[price],[location]; Korean [날짜],[시간],[가격],[장소]; Japanese [日付],[時間],[価格],[場所]; Spanish [fecha],[hora],[precio],[ubicación]. For other types (e.g. [meeting link]), use the equivalent in the reply language.

Instructions:
- Write only the email body. No subject line.
- Greeting: Choose the sender's name using this priority: (1) name in the email signature (e.g. Best, Michael), (2) name mentioned in the email body, (3) name from the From field${recipientName ? ` ("${recipientName}")` : " (see thread header)"}, (4) if none available or uncertain → use neutral greeting (Hi, / Hello,).
- ${toneInstructions}
- End with an appropriate closing. ${userName ? `Sign off with the name: "${userName}". Use this name exactly as written, regardless of the reply language.` : "Omit the sender name if unknown."}
${additionalInstruction ? `- Additional instruction: ${additionalInstruction}` : ""}
`;

    // Context-based language: reply in the same language as the email, not user settings
    const contextBasedSystemPrompt =
      "You are an expert at writing natural, human-sounding email replies. Your goal is to sound like a real person—warm when appropriate, concise when appropriate, never robotic or generic. CRITICAL: Reply in the SAME LANGUAGE as the email. If the email is in Korean, reply in Korean. If in Japanese, reply in Japanese. If in Spanish, reply in Spanish. If in English or another language, reply in that language. Match the register and formality of the incoming message. ANTI-HALLUCINATION: Never invent facts. If the sender asks for a date, time, price, location, or any detail not in the email, use a placeholder in []. Create context-appropriate placeholders as needed. PLACEHOLDER RULE: The placeholder text must be in the SAME language as your reply—English: [date],[time],[price]; Korean: [날짜],[시간],[가격]; Japanese: [日付],[時間],[価格]; Spanish: [fecha],[hora],[precio]. Never mix (e.g. no [날짜] in an English reply). GREETING RULE: Use sender name in this order—1) signature, 2) body, 3) From field, 4) neutral (Hi,/Hello,). Never guess. Prioritize natural, idiomatic phrasing over literal translation. Avoid AI-sounding phrases: no 'I'd be happy to help,' 'Please don't hesitate to reach out,' or similar clichés unless they genuinely fit the context.";

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: contextBasedSystemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 350,
      });

      const reply = completion.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        return res.status(500).json({ error: "OpenAI returned an empty reply." });
      }

      await recordUsage(userId);

      const updatedUsage = await checkUsageLimit(userId);

      res.json({
        reply,
        usage: {
          plan: updatedUsage.plan,
          used: updatedUsage.used,
          limit: updatedUsage.limit,
          remaining: updatedUsage.remaining,
          topupRemaining: updatedUsage.topupRemaining ?? 0,
          cancelScheduled: updatedUsage.cancelScheduled,
          periodEndDate: updatedUsage.periodEndDate,
          nextResetAt: updatedUsage.nextResetAt ?? null,
        },
      });
    } catch (error) {
      const errMsg = error?.message || String(error);
      console.error("OpenAI generation error:", errMsg);
      res.status(500).json({
        error: "Failed to generate AI reply.",
        detail: errMsg,
      });
    }
  } catch (error) {
    console.error("Generate reply error:", error);
    res.status(500).json({ error: "Failed to process reply request." });
  }
});

// Create Stripe checkout session for subscription (requires auth)
app.post("/billing/create-checkout-session", requireAuth, async (req, res) => {
  try {
    const { targetPlan } = req.body;
    const userId = req.userId;
    const userEmail = req.headers["x-user-email"] || null;

    if (!targetPlan || !["pro", "pro_plus"].includes(targetPlan)) {
      return res
        .status(400)
        .json({ error: "Invalid plan. Must be 'pro' or 'pro_plus'" });
    }

    const priceId = PLAN_PRICE_IDS[targetPlan];
    if (!priceId) {
      return res
        .status(500)
        .json({ error: `Stripe price ID not configured for plan: ${targetPlan}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get("host")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get("host")}/billing/cancel`,
      metadata: {
        userId,
        targetPlan,
        ...(userEmail && { userEmail }),
      },
      customer_email: userEmail || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe checkout session error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Create Stripe checkout session for top-up pack (one-time payment)
app.post("/billing/create-topup-checkout", requireAuth, async (req, res) => {
  try {
    const { pack } = req.body;
    const userId = req.userId;
    const userEmail = req.headers["x-user-email"] || null;

    const packSize = pack === "100" ? 100 : pack === "500" ? 500 : null;
    if (!packSize) {
      return res
        .status(400)
        .json({ error: "Invalid pack. Must be '100' or '500'" });
    }

    const priceId = TOPUP_PRICE_IDS[packSize];
    if (!priceId) {
      return res
        .status(500)
        .json({ error: `Stripe price ID not configured for top-up ${packSize}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get("host")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get("host")}/billing/cancel`,
      metadata: {
        userId,
        type: "topup",
        packSize: String(packSize),
      },
      customer_email: userEmail || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe top-up checkout error:", error);
    res.status(500).json({ error: "Failed to create top-up checkout session" });
  }
});

// Cancel subscription at period end (requires auth)
app.post("/billing/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!["pro", "pro_plus"].includes(user.plan)) {
      return res.status(400).json({ error: "Only pro or pro_plus users can cancel" });
    }

    const subscriptionId = user.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Stripe Basil API (2025+) moved current_period_end to items; fallback to top-level for older API
    const periodEnd =
      subscription.current_period_end ??
      subscription.items?.data?.[0]?.current_period_end;
    if (periodEnd == null || typeof periodEnd !== "number" || periodEnd <= 0) {
      console.error("Cancel subscription: invalid current_period_end from Stripe", { subscriptionId, periodEnd });
      return res.status(500).json({ error: "Invalid subscription data from Stripe" });
    }
    const periodEndMs = periodEnd * 1000;
    let periodEndDate;
    try {
      periodEndDate = new Date(periodEndMs).toISOString();
    } catch (e) {
      console.error("Cancel subscription: invalid date from period_end", { periodEnd, periodEndMs, err: e.message });
      return res.status(500).json({ error: "Invalid subscription period" });
    }
    const remainingDays = Math.ceil((periodEndMs - Date.now()) / (24 * 60 * 60 * 1000));

    await updateUserCancelScheduled(userId, periodEndDate);

    res.json({
      success: true,
      cancelAt: periodEndDate,
      remainingDays: Math.max(0, remainingDays),
      cancelScheduled: true,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// Reactivate subscription (undo cancel at period end) - requires auth
app.post("/billing/reactivate-subscription", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.cancelAtPeriodEnd) {
      return res.status(400).json({ error: "No cancellation scheduled" });
    }

    const subscriptionId = user.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    await clearUserCancelScheduled(userId);

    res.json({
      success: true,
      cancelScheduled: false,
    });
  } catch (error) {
    console.error("Reactivate subscription error:", error);
    res.status(500).json({ error: "Failed to reactivate subscription" });
  }
});

app.listen(PORT, () => {
  console.log(`ReplyMate API running on port ${PORT}`);
});