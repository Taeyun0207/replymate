const express = require("express");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ReplyMate backend is running.");
});

app.post("/generate-reply", async (req, res) => {
    try {
      const {
        subject,
        latestMessage,
        previousMessages,
        recipientName,
        userName,
        inferredUserName,
        tone,
        lengthInstruction,
        additionalInstruction,
      } = req.body;
  
      console.log("Incoming request:");
      console.log(req.body);
  
      const previousThreadText =
        Array.isArray(previousMessages) && previousMessages.length > 0
          ? previousMessages.join("\n\n")
          : "No previous messages.";
  
      // Generate tone-specific instructions
      let toneInstructions = "";
      switch ((tone || "").toLowerCase()) {
        case "professional":
          toneInstructions = "Write in a professional tone. Use formal language, proper business etiquette, and maintain a respectful, polished manner.";
          break;
        case "friendly":
          toneInstructions = "Write in a friendly, warm tone. Use conversational language, express warmth, and maintain a positive, approachable manner.";
          break;
        case "direct":
          toneInstructions = "Write in a direct, concise tone. Be practical and efficient with minimal padding. Focus on clarity and brevity while remaining polite. Avoid unnecessary small talk and get straight to the point.";
          break;
        default: // polite
          toneInstructions = "Write in a polite, balanced tone. Be courteous and respectful while maintaining natural warmth and professionalism.";
      }

      const prompt = `
  You are an AI assistant for ReplyMate, a Gmail reply generator.
  
  Write an email reply.
  
  Context:
  - Email subject: ${subject || ""}
  - Recipient name: ${recipientName || "there"}
  - Sender name: ${userName || ""}
  
  Previous thread:
  ${previousThreadText}
  
  Latest message:
  ${latestMessage || ""}
  
  Instructions:
  - Write only the email body.
  - Do not include a subject line.
  - ${toneInstructions}
  - ${lengthInstruction || "Keep the reply length appropriate for the message."}
  ${additionalInstruction ? `- Additional instruction: ${additionalInstruction}` : ""}
  - If recipient name is known, use it naturally.
  - End with an appropriate closing using the sender name if available.
  `;
  
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You generate polished email replies for Gmail users.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      });
  
      const reply = completion.choices?.[0]?.message?.content?.trim();
  
      if (!reply) {
        return res.status(500).json({
          error: "OpenAI returned an empty reply.",
        });
      }
  
      res.json({ reply });
    } catch (error) {
      console.error("OpenAI generation error:", error);
  
      res.status(500).json({
        error: "Failed to generate AI reply.",
      });
    }
  });

app.listen(PORT, () => {
  console.log(`ReplyMate API running on port ${PORT}`);
});