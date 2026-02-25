import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getUser, updateUserSubscription } from './server/db';
import crypto from 'crypto';

const app = express();
const PORT = Number(process.env.PORT) || 3005;

// Need to parse raw body for webhooks before express.json()
app.use('/api/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Request logging middleware
app.use('/api/*', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers));
  next();
});

// Mock authentication middleware
app.use(async (req, res, next) => {
  const userId = req.headers['x-user-id'] as string;
  if (userId) {
    req.user = await getUser(userId);
  }
  next();
});

app.post('/api/humanize', async (req, res) => {
  const { text, tone = 'Standard' } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const wordCount = text.trim().split(/\s+/).length;

  if (wordCount > 100 && !user.is_subscribed) {
    return res.status(403).json({ error: 'Subscription required for over 100 words.' });
  }

  let toneInstruction = "Write this as a fast, conversational rewrite while maintaining the exact original point of view.";
  if (tone === 'Friendly') {
    toneInstruction = "Make the tone warm, approachable, and encouraging. Use highly conversational, inviting language that puts the reader at ease, but strictly preserve the original author's point of view and perspective.";
  } else if (tone === 'Professional') {
    toneInstruction = "Make the tone sharp, articulate, and professional. It should sound intelligent and authoritative, yet still clear, without resorting to verbose academic jargon. Strictly preserve the original author's point of view and perspective.";
  } else if (tone === 'Narrator') {
    toneInstruction = "Give the text a slight storytelling quality—making the progression of ideas flow smoothly and vividly. Crucially, do NOT insert 'I', 'we', or 'us'; maintain the exact original point of view.";
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: `Role: You are an expert human copywriter. Your ONLY goal is to rewrite the provided text so that it registers as 0% AI-generated on all advanced AI detectors.

Tone Directive: ${toneInstruction}

Constraints for Extreme AI Evasion (Perplexity & Burstiness):

1. High Burstiness (Mandatory): You MUST radically vary your sentence lengths to create a high standard deviation (Burstiness). Never write three sentences of similar length in a row. Follow a sprawling, complex 30-word sentence immediately with a jarring 3-word or 5-word sentence. 

2. High Perplexity (Mandatory): Do NOT use predictable AI sentence structures. Avoid prepositional phrases at the start of sentences ("In the realm of", "As a", "Located in"). 

3. Vocabulary Blacklist: Use plain, precise, everyday English. STRICTLY FORBIDDEN WORDS: "delve", "tapestry", "crucial", "moreover", "furthermore", "overall", "in conclusion", "testament", "orchestrate", "seamless", "elevate", "nuance", "merely", "foster", "nurture", "champion".

4. Human Flaws & Informality: Start sentences with conjunctions (And, But, Yet) frequently. Use em-dashes (—) to disrupt the flow of a sentence organically. Be concise and direct, removing all filler.

5. Point of View: Maintain the EXACT original perspective (first-person, third-person, etc). If the text is informational and third-person, keep it that way. Do NOT insert yourself into the text as a narrator or participant. Do NOT summarize the text at the end.

6. Formatting: Output ONLY the rewritten text. Do not include any introductory remarks.`,
        temperature: 1.3,
        topP: 0.95,
        topK: 60,
      },
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("Gemini Humanize API Error:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({
      error: "Gemini API Error",
      details: error.message || "Failed to call Gemini API"
    });
  }
});

app.post('/api/detect-ai', async (req, res) => {
  const { text } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!text || !text.trim()) {
    return res.json({ aiPercentage: 0 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: `Role: You are an expert AI content detector.
Your task is to analyze the provided text and determine what percentage of it was generated by an AI model like ChatGPT or Claude. Look for common AI tropes: perfect grammar but lack of substance, "hedging" language, overuse of words like "crucial", "tapestry", "delve", predictable transitions ("Furthermore", "In conclusion"), and symmetrical paragraph lengths.
If it looks highly predictable and robotic or uses these tropes, give it a score of 80 to 100.
If it has asymmetrical paragraphs, uses natural contractions, starts sentences with conjunctions (And, But), uses active voice, and sounds conversational, give it a low score (0 to 20).
Output ONLY a single integer from 0 to 100 representing the probability or percentage.
Do not include a percent sign, any letters, extra words, or explanations. Just the number.`,
        temperature: 0.1, // Keep it deterministic
      },
    });

    const outputText = response.text?.trim() || "0";
    let aiPercentage = parseInt(outputText, 10);

    // Fallback if the AI returned something unparsable
    if (isNaN(aiPercentage)) {
      aiPercentage = 0;
    }

    // Clamp to 0-100
    aiPercentage = Math.max(0, Math.min(100, aiPercentage));

    res.json({ aiPercentage });
  } catch (error: any) {
    console.error("Gemini AI Detection Error:", {
      message: error.message,
      stack: error.stack,
      textPreview: text?.substring(0, 100)
    });
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Failed to detect AI probability",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get('/api/user', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ is_subscribed: !!req.user.is_subscribed });
  } catch (error: any) {
    console.error("Fetch User Error:", error);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

// Lemon Squeezy Checkout Endpoint
app.post('/api/checkout', async (req, res) => {
  const { variantId } = req.body;
  const user = req.user;

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
    const storeId = process.env.LEMON_SQUEEZY_STORE_ID;

    if (!apiKey || !storeId) {
      // Mock checkout for demo if no API key is set
      console.warn('No Lemon Squeezy API key or Store ID configured. Using mock checkout URL.');
      return res.json({ url: `https://demo.lemonsqueezy.com/checkout/buy/${variantId}?checkout[custom][user_id]=${user.id}` });
    }

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: {
                user_id: user.id
              }
            }
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: storeId
              }
            },
            variant: {
              data: {
                type: "variants",
                id: variantId
              }
            }
          }
        }
      })
    });

    const data = await response.json();
    if (data.errors) {
      const detail = data.errors[0].detail;
      if (detail === 'The related resource does not exist.') {
        throw new Error('Invalid Store ID or Variant ID. Please check your Lemon Squeezy configuration.');
      }
      throw new Error(detail);
    }

    res.json({ url: data.data.attributes.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Lemon Squeezy Webhook Endpoint
app.post('/api/webhooks/lemonsqueezy', (req, res) => {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('No Lemon Squeezy webhook secret configured. Accepting webhook blindly for demo.');
  } else {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
    const signature = Buffer.from(req.get('X-Signature') || '', 'utf8');

    if (digest.length !== signature.length || !crypto.timingSafeEqual(digest, signature)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }
  }

  try {
    const payload = JSON.parse(req.body.toString());
    const eventName = payload.meta.event_name;
    const customData = payload.meta.custom_data;
    const userId = customData?.user_id;

    if (!userId) {
      return res.status(400).json({ error: 'No user_id in custom_data' });
    }

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const status = payload.data.attributes.status;
      const isSubscribed = status === 'active' || status === 'past_due' || status === 'on_trial';
      updateUserSubscription(userId, isSubscribed, payload.data.id);
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      updateUserSubscription(userId, false, payload.data.id);
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(500).send('Webhook Error');
  }
});

app.get('/api/health', (req, res) => {
  console.log('HIT /api/health');
  res.json({ status: 'ok' });
});



async function startServer() {
  console.log('[SERVER] STARTING...');
  // Check for critical env vars
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. AI features will fail.');
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error('Vite startup error:', e);
    }
  } else if (!process.env.VERCEL) {
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Global error handling middleware - MUST be last
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('UNHANDLED ERROR:', err);

  const isApiRequest = req.originalUrl.startsWith('/api/');

  if (isApiRequest) {
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
      path: req.originalUrl
    });
  } else {
    next(err);
  }
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// SAFETY WRAP: Catch any module-level or startup crashes to report them in Vercel logs
try {
  if (!process.env.VERCEL) {
    startServer().catch(err => {
      console.error('[CRITICAL] Server failed to start:', err);
    });
  }
} catch (fatal) {
  console.error('[FATAL] Top-level server crash:', fatal);
}

export default app;
