const express = require("express");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai");
const { PLAN_LIMITS } = require("./src/config/plans");
const { getUser, updateUserPlan, recordUsage } = require("./src/database");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
  try {
    const usage = await getUser(userId);
    const limit = PLAN_LIMITS[usage.plan] || PLAN_LIMITS.free;
    return {
      proceed: usage.used < limit,
      remaining: Math.max(0, limit - usage.used),
      used: usage.used,
      limit: limit,
      plan: usage.plan,
    };
  } catch (error) {
    console.error("Error checking usage limit:", error);
    return {
      proceed: false,
      remaining: 0,
      used: 0,
      limit: PLAN_LIMITS.free,
      plan: "free",
    };
  }
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

      try {
        const { userId, targetPlan } = session.metadata;

        if (!userId || !targetPlan) {
          console.error("Missing metadata in checkout session:", session.id);
          return res.status(400).json({ error: "Missing required metadata" });
        }

        if (!["pro", "pro_plus"].includes(targetPlan)) {
          console.error("Invalid target plan in metadata:", targetPlan);
          return res.status(400).json({ error: "Invalid target plan" });
        }

        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        await updateUserPlan(
          userId,
          targetPlan,
          stripeCustomerId,
          stripeSubscriptionId
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

    res.status(200).json({ received: true });
  }
);

// Apply JSON parser to all other routes
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ReplyMate backend is running.");
});

// Get current usage
app.get("/usage", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || "default_user";
    const usage = await checkUsageLimit(userId);
    res.json(usage);
  } catch (error) {
    console.error("Error getting usage:", error);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

app.post("/generate-reply", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || "default_user";

    console.log("[DEBUG] userId:", userId);

    const usageCheck = await checkUsageLimit(userId);
    console.log("[DEBUG] usageCheck:", usageCheck);

    if (!usageCheck.proceed) {
      return res.status(403).json({
        error: "usage_limit_exceeded",
        remaining: usageCheck.remaining,
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
Write an email reply from You to the latest message. Match the specified TONE and LENGTH exactly.

Core Quality Rules:
- Reply directly to what the latest message asks or states. Do not restate or paraphrase their message.
- If the latest message is only an acknowledgement (thanks, okay, yes, 네, 알겠습니다, はい), write a brief acknowledgement—do not expand into a full email.
- If the latest message does not ask a question or request action, do not add unnecessary follow-up questions or lines.
- Avoid generic AI phrases ("Thank you for your prompt response", "I appreciate your confirmation") unless the context genuinely warrants them.
- Avoid customer-service script tone or template-like phrasing. Sound like a real person writing to another real person.
- Respect the LENGTH setting: Short = very brief; Medium = balanced; Long = fuller and more complete.
- Respect the TONE setting: each tone (polite, professional, direct, friendly) must feel distinctly different in the output.

Instructions:
- Write only the email body.
- Do not include a subject line.
- ${toneInstructions}
- End with an appropriate closing. ${userName ? `Sign off with the name: "${userName}". Use this name exactly as written, regardless of the reply language.` : "Omit the sender name if unknown."}
${additionalInstruction ? `- Additional instruction: ${additionalInstruction}` : ""}
`;

    const languageSystemPrompts = {
      english:
        "CRITICAL: Generate replies ONLY in English. Never use any other language. Output must be natural, idiomatic English—not stiff or translated-sounding. Match the tone and length instructions exactly. Produce replies that native English speakers would find natural and well-written.",
      korean:
        "CRITICAL: Generate replies ONLY in Korean (한국어). Never use any other language. Output must be natural, idiomatic Korean—appropriate register (존댓말), natural expressions, and culturally appropriate phrasing. Match the tone and length instructions exactly. Produce replies that native Korean speakers would find natural and well-written.",
      japanese:
        "CRITICAL: Generate replies ONLY in Japanese (日本語). Never use any other language. Output must be natural, idiomatic Japanese—appropriate keigo (敬語), natural expressions, and culturally appropriate phrasing. Match the tone and length instructions exactly. Produce replies that native Japanese speakers would find natural and well-written.",
    };

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              languageSystemPrompts[language] || languageSystemPrompts.english,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 512,
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

// Create Stripe checkout session
app.post("/billing/create-checkout-session", async (req, res) => {
  try {
    const { targetPlan } = req.body;
    const userId = req.headers["x-user-id"] || "default_user";
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
    console.log("ENV STRIPE_PRICE_PRO:", process.env.STRIPE_PRICE_PRO);
console.log("ENV STRIPE_PRICE_PRO_PLUS:", process.env.STRIPE_PRICE_PRO_PLUS);
console.log("Requested targetPlan:", targetPlan);
  }
});

app.listen(PORT, () => {
  console.log(`ReplyMate API running on port ${PORT}`);
});