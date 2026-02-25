import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';

const app = express();

// Hyper-isolated in-memory store for Vercel
const memoryStore = new Map<string, any>();

// In-memory DB methods directly in the entry point to avoid any tracing to db.ts
const getMemoryUser = (id: string) => {
    let user = memoryStore.get(id);
    if (!user) {
        user = { id, is_subscribed: 0, subscription_id: null };
        memoryStore.set(id, user);
    }
    return user;
};

const updateMemorySubscription = (id: string, isSubscribed: boolean, subscriptionId: string | null) => {
    const user = getMemoryUser(id);
    memoryStore.set(id, { ...user, is_subscribed: isSubscribed ? 1 : 0, subscription_id: subscriptionId });
};

// Middleware
app.use('/api/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

app.use(async (req, res, next) => {
    const userId = req.headers['x-user-id'] as string;
    if (userId) {
        (req as any).user = getMemoryUser(userId);
    }
    next();
});

// Routes (Copied and simplified from server.ts)
app.post('/api/humanize', async (req, res) => {
    const { text, tone = 'Standard' } = req.body;
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let toneInstruction = "Write this as a fast, conversational rewrite while maintaining the exact original point of view.";
    if (tone === 'Friendly') {
        toneInstruction = "Make the tone warm, approachable, and encouraging. Use highly conversational, inviting language that puts the reader at ease, but strictly preserve the original author's point of view and perspective.";
    } else if (tone === 'Professional') {
        toneInstruction = "Make the tone sharp, articulate, and professional. It should sound intelligent and authoritative, yet still clear, without resorting to verbose academic jargon. Strictly preserve the original author's point of view and perspective.";
    } else if (tone === 'Narrator') {
        toneInstruction = "Give the text a slight storytelling quality—making the progression of ideas flow smoothly and vividly. Crucially, do NOT insert 'I', 'we', or 'us'; maintain the exact original point of view.";
    }

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY missing");

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
        console.error("Vercel AI Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/detect-ai', async (req, res) => {
    const { text } = req.body;
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!text || !text.trim()) return res.json({ aiPercentage: 0 });

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
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
                temperature: 0.1,
            },
        });

        const outputText = response.text?.trim() || "0";
        let aiPercentage = parseInt(outputText, 10);
        if (isNaN(aiPercentage)) aiPercentage = 0;
        res.json({ aiPercentage: Math.max(0, Math.min(100, aiPercentage)) });
    } catch (error: any) {
        console.error("Vercel AI Detect Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ is_subscribed: !!user.is_subscribed });
});

// Lemon Squeezy Checkout Endpoint
app.post('/api/checkout', async (req, res) => {
    const { variantId } = req.body;
    const user = (req as any).user;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
        const storeId = process.env.LEMON_SQUEEZY_STORE_ID;

        if (!apiKey || !storeId) {
            console.warn('No Lemon Squeezy config. Using mock checkout URL.');
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
                        checkout_data: { custom: { user_id: user.id } }
                    },
                    relationships: {
                        store: { data: { type: "stores", id: storeId } },
                        variant: { data: { type: "variants", id: variantId } }
                    }
                }
            })
        });

        const data = await response.json();
        if (data.errors) {
            const detail = data.errors[0].detail;
            if (detail === 'The related resource does not exist.') {
                throw new Error('Invalid Store ID or Variant ID. Check Lemon Squeezy config.');
            }
            throw new Error(detail);
        }

        res.json({ url: data.data.attributes.url });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Global error handling middleware - MUST be last
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('VERCEL UNHANDLED ERROR:', err);
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred'
    });
});

app.post('/api/webhooks/lemonsqueezy', (req, res) => {
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const hmac = crypto.createHmac('sha256', secret || '');
    const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
    const signature = Buffer.from(req.get('X-Signature') || '', 'utf8');

    if (secret && !crypto.timingSafeEqual(digest, signature)) {
        return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
        const payload = JSON.parse(req.body.toString());
        const userId = payload.meta.custom_data?.user_id;
        if (userId) {
            const event = payload.meta.event_name;
            const isSub = event.includes('created') || event.includes('updated');
            updateMemorySubscription(userId, isSub, payload.data.id);
        }
        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'vercel-ok' }));

export default app;
