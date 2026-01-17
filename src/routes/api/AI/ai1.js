import express from 'express';
import axios from 'axios';

const router = express.Router();

// قائمة خدمات الذكاء الاصطناعي المختلفة
const aiServices = {
  openai: {
    base: "https://api.openai.com/v1",
    endpoints: {
      chat: "/chat/completions",
      image: "/images/generations",
      moderation: "/moderations"
    }
  },
  google: {
    base: "https://generativelanguage.googleapis.com/v1beta",
    endpoints: {
      chat: "/models/gemini-pro:generateContent"
    }
  },
  huggingface: {
    base: "https://api-inference.huggingface.co/models",
    endpoints: {
      summarization: "/facebook/bart-large-cnn",
      translation: "/Helsinki-NLP/opus-mt-ar-en",
      sentiment: "/distilbert-base-uncased-finetuned-sst-2-english"
    }
  }
};

// هيدرات عامة
const commonHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// وظيفة للتعامل مع الأخطاء
function handleError(service, error) {
  console.error(`❌ خطأ في خدمة ${service}:`, error.message);
  return {
    status: false,
    message: `حدث خطأ في خدمة ${service}`,
    error: error.message,
    details: error.response?.data || null
  };
}

// ==================== 1. طلب ChatGPT/OpenAI ====================
async function chatWithGPT(query, options = {}) {
  if (!query) return { status: false, message: "⚠️ يرجى كتابة نص للمحادثة!" };
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { 
      status: false, 
      message: "❌ مفتاح OpenAI غير موجود. اضبط OPENAI_API_KEY في البيئة." 
    };
  }

  const {
    model = "gpt-3.5-turbo",
    temperature = 0.7,
    max_tokens = 1000
  } = options;

  try {
    const { data } = await axios.post(
      `${aiServices.openai.base}${aiServices.openai.endpoints.chat}`,
      {
        model: model,
        messages: [
          { 
            role: "system", 
            content: "أنت مساعد ذكي يتحدث العربية بطلاقة. أجب بطريقة مفيدة ودقيقة." 
          },
          { role: "user", content: query }
        ],
        temperature: temperature,
        max_tokens: max_tokens
      },
      {
        headers: {
          ...commonHeaders,
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return {
      status: true,
      service: "OpenAI ChatGPT",
      model: data.model,
      response: data.choices[0].message.content,
      usage: {
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      },
      finish_reason: data.choices[0].finish_reason
    };
  } catch (error) {
    return handleError("OpenAI", error);
  }
}

// ==================== 2. توليد صور بـ DALL-E ====================
async function generateImage(prompt, options = {}) {
  if (!prompt) return { status: false, message: "⚠️ يرجى كتابة وصف للصورة!" };
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { 
      status: false, 
      message: "❌ مفتاح OpenAI غير موجود. اضبط OPENAI_API_KEY في البيئة." 
    };
  }

  const {
    size = "1024x1024",
    quality = "standard",
    n = 1
  } = options;

  try {
    const { data } = await axios.post(
      `${aiServices.openai.base}${aiServices.openai.endpoints.image}`,
      {
        prompt: prompt,
        n: parseInt(n),
        size: size,
        quality: quality
      },
      {
        headers: {
          ...commonHeaders,
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return {
      status: true,
      service: "OpenAI DALL-E",
      images: data.data.map((img, index) => ({
        id: `img_${Date.now()}_${index}`,
        url: img.url,
        prompt: prompt,
        revised_prompt: img.revised_prompt || prompt
      })),
      size: size,
      quality: quality
    };
  } catch (error) {
    return handleError("DALL-E", error);
  }
}

// ==================== 3. تلخيص النصوص ====================
async function summarizeText(text, options = {}) {
  if (!text) return { status: false, message: "⚠️ يرجى إدخال نص للتلخيص!" };
  
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const useOpenAI = options.useOpenAI || !apiKey;

  if (useOpenAI) {
    const prompt = `لخص النص التالي باللغة العربية باختصار:\n\n${text}`;
    return await chatWithGPT(prompt, { 
      model: "gpt-3.5-turbo-16k",
      max_tokens: 500 
    });
  }

  try {
    const { data } = await axios.post(
      `${aiServices.huggingface.base}${aiServices.huggingface.endpoints.summarization}`,
      {
        inputs: text,
        parameters: {
          max_length: 130,
          min_length: 30,
          do_sample: false
        }
      },
      {
        headers: {
          ...commonHeaders,
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return {
      status: true,
      service: "Hugging Face Summarization",
      original_length: text.length,
      summary: data[0].summary_text,
      model: "facebook/bart-large-cnn"
    };
  } catch (error) {
    return handleError("Hugging Face", error);
  }
}

// ==================== 4. ترجمة النصوص ====================
async function translateText(text, targetLang = "en", sourceLang = "ar") {
  if (!text) return { status: false, message: "⚠️ يرجى إدخال نص للترجمة!" };
  
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    // استخدام ChatGPT كبديل
    const prompt = `ترجم النص التالي من ${sourceLang} إلى ${targetLang}:\n\n${text}`;
    const result = await chatWithGPT(prompt, { max_tokens: 1000 });
    if (result.status) {
      return {
        ...result,
        service: "OpenAI Translation",
        original_text: text,
        source_language: sourceLang,
        target_language: targetLang
      };
    }
    return result;
  }

  const modelPath = sourceLang === "ar" && targetLang === "en" 
    ? aiServices.huggingface.endpoints.translation
    : `/Helsinki-NLP/opus-mt-${sourceLang}-${targetLang}`;

  try {
    const { data } = await axios.post(
      `${aiServices.huggingface.base}${modelPath}`,
      {
        inputs: text
      },
      {
        headers: {
          ...commonHeaders,
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return {
      status: true,
      service: "Hugging Face Translation",
      original_text: text,
      translated_text: data[0].translation_text,
      source_language: sourceLang,
      target_language: targetLang,
      model: modelPath.split('/').pop()
    };
  } catch (error) {
    return handleError("Translation Service", error);
  }
}

// ==================== 5. تحليل المشاعر ====================
async function analyzeSentiment(text) {
  if (!text) return { status: false, message: "⚠️ يرجى إدخال نص لتحليل المشاعر!" };
  
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const useOpenAI = !apiKey;

  if (useOpenAI) {
    const prompt = `حلل المشاعر في النص التالي وحدد إذا كانت إيجابية، سلبية، أو محايدة:\n\n${text}\n\nأجب بنموذج JSON: {"sentiment": "...", "confidence": ..., "explanation": "..."}`;
    const result = await chatWithGPT(prompt);
    if (result.status) {
      try {
        const analysis = JSON.parse(result.response);
        return {
          status: true,
          service: "OpenAI Sentiment Analysis",
          text: text,
          ...analysis
        };
      } catch (e) {
        return {
          status: true,
          service: "OpenAI Sentiment Analysis",
          text: text,
          sentiment: "unknown",
          analysis: result.response
        };
      }
    }
    return result;
  }

  try {
    const { data } = await axios.post(
      `${aiServices.huggingface.base}${aiServices.huggingface.endpoints.sentiment}`,
      {
        inputs: text
      },
      {
        headers: {
          ...commonHeaders,
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const sentiment = data[0][0].label;
    const score = data[0][0].score;

    return {
      status: true,
      service: "Hugging Face Sentiment Analysis",
      text: text,
      sentiment: sentiment === "POSITIVE" ? "positive" : "negative",
      confidence: score,
      scores: data[0]
    };
  } catch (error) {
    return handleError("Sentiment Analysis", error);
  }
}

// ==================== 6. توليد نصوص إبداعية ====================
async function generateCreativeText(prompt, options = {}) {
  if (!prompt) return { status: false, message: "⚠️ يرجى كتابة سؤال أو فكرة!" };
  
  const {
    type = "story",
    length = "medium",
    style = "formal"
  } = options;

  const instructions = {
    story: "اكتب قصة قصيرة",
    poem: "اكتب قصيدة",
    article: "اكتب مقالة",
    dialogue: "اكتب حواراً"
  }[type] || "اكتب نصاً";

  const lengthMap = {
    short: "قصير (100-200 كلمة)",
    medium: "متوسط (200-500 كلمة)",
    long: "طويل (500-1000 كلمة)"
  };

  const fullPrompt = `${instructions} حول: "${prompt}"\n\nالنمط: ${style}\nالطول: ${lengthMap[length] || length}`;

  return await chatWithGPT(fullPrompt, {
    model: "gpt-4",
    temperature: 0.8,
    max_tokens: length === "long" ? 2000 : length === "medium" ? 1000 : 500
  });
}

// ==================== 7. مقارنة بين نموذجين AI ====================
async function compareAIResponses(query, models = ["gpt-3.5-turbo", "gpt-4"]) {
  if (!query) return { status: false, message: "⚠️ يرجى كتابة سؤال للمقارنة!" };
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { 
      status: false, 
      message: "❌ مفتاح OpenAI غير موجود. اضبط OPENAI_API_KEY في البيئة." 
    };
  }

  try {
    const promises = models.map(model => 
      chatWithGPT(query, { model })
    );

    const results = await Promise.all(promises);
    
    return {
      status: true,
      service: "OpenAI Model Comparison",
      query: query,
      comparisons: results.map((result, index) => ({
        model: models[index],
        response: result.status ? result.response : result.message,
        status: result.status ? "success" : "failed",
        tokens: result.status ? result.usage?.total_tokens : null
      })),
      fastest_model: results[0]?.status ? models[0] : null,
      most_detailed: results.reduce((best, current, idx) => {
        if (!current.status) return best;
        const currentLength = current.response?.length || 0;
        const bestLength = best.response?.length || 0;
        return currentLength > bestLength ? { model: models[idx], response: current.response } : best;
      }, { model: null, response: null })
    };
  } catch (error) {
    return handleError("AI Comparison", error);
  }
}

// ==================== الرواتر الرئيسي ====================
router.get('/', async (req, res) => {
  const { service, query } = req.query;

  if (!service) {
    return res.json({
      status: true,
      creator: "AI Services API",
      message: "📌 اختر خدمة من القائمة:",
      available_services: [
        { name: "chat", endpoint: "/?service=chat&query=نصك" },
        { name: "image", endpoint: "/?service=image&query=وصف الصورة" },
        { name: "summarize", endpoint: "/?service=summarize&query=النص" },
        { name: "translate", endpoint: "/?service=translate&text=النص&target=en" },
        { name: "sentiment", endpoint: "/?service=sentiment&text=النص" },
        { name: "creative", endpoint: "/?service=creative&query=الفكرة&type=story" },
        { name: "compare", endpoint: "/?service=compare&query=السؤال&models=gpt-3.5,gpt-4" }
      ],
      examples: {
        chat: "/api/ai?service=chat&query=مرحبا، كيف حالك؟",
        image: "/api/ai?service=image&query=منظر طبيعي لغروب الشمس",
        summarize: "/api/ai?service=summarize&query=نص طويل للتلخيص..."
      }
    });
  }

  let result;
  switch (service.toLowerCase()) {
    case 'chat':
      result = await chatWithGPT(query, req.query);
      break;
    
    case 'image':
      result = await generateImage(query, req.query);
      break;
    
    case 'summarize':
      result = await summarizeText(query, req.query);
      break;
    
    case 'translate':
      result = await translateText(
        query || req.query.text, 
        req.query.target || 'en',
        req.query.source || 'ar'
      );
      break;
    
    case 'sentiment':
      result = await analyzeSentiment(query || req.query.text);
      break;
    
    case 'creative':
      result = await generateCreativeText(query, req.query);
      break;
    
    case 'compare':
      const models = req.query.models ? req.query.models.split(',') : ["gpt-3.5-turbo", "gpt-4"];
      result = await compareAIResponses(query, models);
      break;
    
    default:
      result = { status: false, message: "❌ خدمة غير معروفة!" };
  }

  return res.status(result.status ? 200 : 500).json(result);
});

// ==================== نقاط نهاية منفصلة ====================
router.get('/chat', async (req, res) => {
  const { query, model, temperature } = req.query;
  const result = await chatWithGPT(query, { model, temperature });
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/image', async (req, res) => {
  const { query, size, n } = req.query;
  const result = await generateImage(query, { size, n });
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/summarize', async (req, res) => {
  const { text, useOpenAI } = req.query;
  const result = await summarizeText(text, { useOpenAI: useOpenAI === 'true' });
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/translate', async (req, res) => {
  const { text, target, source } = req.query;
  const result = await translateText(text, target, source);
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/sentiment', async (req, res) => {
  const { text } = req.query;
  const result = await analyzeSentiment(text);
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/creative', async (req, res) => {
  const { prompt, type, length } = req.query;
  const result = await generateCreativeText(prompt, { type, length });
  res.status(result.status ? 200 : 500).json(result);
});

router.get('/compare', async (req, res) => {
  const { query, models } = req.query;
  const modelList = models ? models.split(',') : ["gpt-3.5-turbo", "gpt-4"];
  const result = await compareAIResponses(query, modelList);
  res.status(result.status ? 200 : 500).json(result);
});

// ==================== نقطة نهاية لجميع الخدمات ====================
router.get('/all-services', (req, res) => {
  res.json({
    status: true,
    services: [
      {
        name: "Chat with AI",
        description: "محادثة مع الذكاء الاصطناعي",
        endpoint: "/api/ai/chat?query=نصك",
        parameters: ["query", "model", "temperature"]
      },
      {
        name: "Generate Images",
        description: "توليد صور باستخدام الذكاء الاصطناعي",
        endpoint: "/api/ai/image?query=وصف الصورة",
        parameters: ["query", "size", "n"]
      },
      {
        name: "Text Summarization",
        description: "تلخيص النصوص الطويلة",
        endpoint: "/api/ai/summarize?text=النص",
        parameters: ["text", "useOpenAI"]
      },
      {
        name: "Translation",
        description: "ترجمة النصوص بين اللغات",
        endpoint: "/api/ai/translate?text=مرحبا&target=en&source=ar",
        parameters: ["text", "target", "source"]
      },
      {
        name: "Sentiment Analysis",
        description: "تحليل المشاعر في النصوص",
        endpoint: "/api/ai/sentiment?text=أنا سعيد جدا",
        parameters: ["text"]
      },
      {
        name: "Creative Writing",
        description: "توليد نصوص إبداعية (قصص، شعر، مقالات)",
        endpoint: "/api/ai/creative?prompt=فكرة القصة&type=story",
        parameters: ["prompt", "type", "length"]
      },
      {
        name: "AI Model Comparison",
        description: "مقارنة ردود نماذج الذكاء الاصطناعي المختلفة",
        endpoint: "/api/ai/compare?query=سؤال&models=gpt-3.5,gpt-4",
        parameters: ["query", "models"]
      }
    ],
    environment_variables: [
      "OPENAI_API_KEY (مطلوب لخدمات OpenAI)",
      "HUGGINGFACE_API_KEY (اختياري للخدمات المجانية)"
    ],
    examples: [
      "Chat: /api/ai/chat?query=اشرح نظرية النسبية",
      "Image: /api/ai/image?query=قطة تلعب بالكرة&size=512x512",
      "Translate: /api/ai/translate?text=مرحبا بالعالم&target=en"
    ]
  });
});

export default router;
