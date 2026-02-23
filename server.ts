import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { getUser, updateUserSubscription } from './server/db';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

// Need to parse raw body for webhooks before express.json()
app.use('/api/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }));
app.use(express.json());

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Mock authentication middleware (using a simple client-generated ID for demo)
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'] as string;
  if (userId) {
    req.user = getUser(userId);
  }
  next();
});

app.post('/api/humanize', async (req, res) => {
  const { text } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const wordCount = text.trim().split(/\\s+/).length;

  if (wordCount > 100 && !user.is_subscribed) {
    return res.status(403).json({ error: 'Subscription required for over 100 words.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: text,
      config: {
        systemInstruction: `Role: You are an expert human copywriter who writes in a highly conversational, punchy, and structurally unpredictable style. Your ONLY goal is to rewrite the provided text so that it registers as 0% AI-generated on all advanced AI detectors.

Directives for 0% Detection:

1. Asymmetrical Paragraphs (Crucial): Humans write in uneven blocks. Never make two paragraphs the same length. Mix a sprawling, detailed 5-sentence paragraph immediately followed by a jarring 1-sentence paragraph.

2. Target Flesch Reading Ease (70+): Keep it punchy. Use plain, everyday English. Strip out all corporate jargon, buzzwords, and complex academic vocabulary.

3. Ban "Hedging" and "Fluff": AI constantly hedges and uses predictable transitions. STRICTLY FORBIDDEN PHRASES: "In conclusion," "It is important to note," "Overall," "While it may seem," "In today's digital landscape," "Moreover," "Furthermore," "Crucial," and "Tapestry."

4. Human Imperfections & Pacing: Start sentences with conjunctions (And, But, Because, So) frequently. Use em-dashes (—) to connect thoughts abruptly. Use natural contractions aggressively (they're, won't, it's, I've).

5. Zero Passive Voice: Rewrite everything in the active voice. (e.g., Instead of "The application was designed to...", write "We designed the application to...").

6. Formatting: Output ONLY the rewritten text. Do not include any introductory or concluding remarks.`,
        temperature: 0.85,
      },
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ is_subscribed: !!req.user.is_subscribed });
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

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
