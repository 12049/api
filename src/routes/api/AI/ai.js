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

    let fullData = "";
    
    return new Promise((resolve, reject) => {
      res.data.on("data", chunk => {
        fullData += chunk.toString();
      });

      res.data.on("end", () => {
        try {
          // فصل الردود حسب الأسطر وجمع الـ chunks
          const lines = fullData.split('\n').filter(line => line.trim());
          let completeMessage = "";
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.substring(5).trim();
              if (jsonStr) {
                try {
                  const data = JSON.parse(jsonStr);
                  if (data.chunk) {
                    completeMessage += data.chunk;
                  }
                } catch (e) {
                  // تجاهل JSON غير صالح
                }
              }
            }
          }
          
          resolve({
            status: res.status,
            success: res.status === 200,
            message: completeMessage.trim(),
            raw: fullData
          });
        } catch (error) {
          reject(error);
        }
      });

      res.data.on("error", reject);
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
      status: false,
      message: "📌 أرسل سؤالك بـ ?q=نص_السؤال"
    });
  }

  try {
    const reply = await zahanatChat(q);
    
    if (reply.success && reply.message) {
      return res.json({
        status: true,
        response: reply.message
      });
    } else {
      return res.json({
        status: false,
        response: "❌ لم أتمكن من الحصول على رد",
        error: reply.error
      });
    }
    
  } catch (error) {
    return res.json({
      status: false,
      response: "❌ حدث خطأ في الخادم",
      error: error.message
    });
  }
});

export default router;
