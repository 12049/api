import express from "express";
import axios from "axios";

const router = express.Router();

const API_URL = "https://api.zahanat.ai/conversation/messagesV1/";
const HEADERS = {
  "Authorization": "Token c02f166f9d84a5e00f90937c3225e8a81883fb6f",
  "Content-Type": "application/json",
  "Origin": "https://chat.zahanat.ai",
  "Referer": "https://chat.zahanat.ai/",
  "User-Agent": "Mozilla/5.0"
};

async function zahanatChat(message, opts = { userId: 436, conversationId: 0, webSearch: true }) {
  try {
    const res = await axios.post(
      API_URL,
      {
        user_id: opts.userId,
        sender: "user",
        message,
        new_conversation: opts.conversationId === 0,
        conversation_id: opts.conversationId,
        web_search: opts.webSearch
      },
      {
        headers: HEADERS,
        responseType: "stream"
      }
    );

    let buffer = "";

    return new Promise((resolve, reject) => {
      res.data.on("data", chunk => {
        buffer += chunk.toString("utf-8");
      });

      res.data.on("end", () => {
        const lines = buffer.split("\n").filter(l => l.startsWith("data:"));
        const msgs = [];

        for (const l of lines) {
          const jsonStr = l.replace(/^data:\s*/, "").trim();
          if (!jsonStr) continue;
          try {
            const obj = JSON.parse(jsonStr);
            if (obj.content) msgs.push(obj.content);
            else if (obj.message) msgs.push(obj.message);
            else if (obj.text) msgs.push(obj.text);
            else msgs.push(jsonStr);
          } catch {
            msgs.push(jsonStr);
          }
        }

        resolve({
          status: res.status,
          success: res.status === 200,
          message: msgs.join("") || buffer.trim() || "No response received",
          raw: lines
        });
      });

      res.data.on("error", err => reject(err));
    });

  } catch (err) {
    return {
      status: err.response?.status || 500,
      success: false,
      message: "",
      error: err.message
    };
  }
}

router.get("/", async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.json({
      status: true,
      creator: "Dark-Team",
      message: "📌 أرسل بـ ?q="
    });
  }

  const reply = await zahanatChat(q);
  return res.status(reply.success ? 200 : 500).json(reply);
});

export default router;
