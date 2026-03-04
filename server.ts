import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getUser } from './server/db';

const app = express();
const PORT = Number(process.env.PORT) || 3005;

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
  const { text, tone = 'Standard', strength = 70 } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let toneInstruction = "Write this as a fast, conversational rewrite while maintaining the exact original point of view.";
  if (tone === 'Friendly') {
    toneInstruction = "Make the tone warm, approachable, and encouraging. Use highly conversational language that puts the reader at ease, but strictly preserve the original perspective.";
  } else if (tone === 'Professional') {
    toneInstruction = "Make the tone sharp, articulate, and professional. It should sound intelligent and authoritative, yet still clear, without resorting to verbose jargon.";
  } else if (tone === 'Narrator') {
    toneInstruction = "Give the text a story-telling quality—making the progression of ideas flow smoothly and vividly. Crucially, do NOT insert 'I', 'we', or 'us'; maintain the exact original perspective.";
  }

  // Strength-based instructions
  let strengthContext = "";
  if (strength < 30) {
    strengthContext = "Apply subtle, LIGHT changes. Keep 80% of the original sentence structures but swap out predictable AI words.";
  } else if (strength < 70) {
    strengthContext = "Apply MODERATE changes. Restructure about 50% of the sentences to improve flow and variety while keeping the core message identical.";
  } else {
    strengthContext = "Apply EXTREME humanization. Radically restructure every sentence. Use sprawling, complex thoughts followed by short, punchy statements. This is a total stylistic overhaul for maximum AI evasion.";
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: text,
      config: {
        systemInstruction: `Role: You are a elite human editor and ghostwriter specializing in "stealth" writing. Your mission is to rewrite the provided text so it is indistinguishable from human writing and passes all AI detectors (0% AI score).

Intensity Level: ${strengthContext}
Tone Directive: ${toneInstruction}

Core Pillars of Human Writing:

1. Dynamic Burstiness: Humans do not write in uniform lengths. You MUST vary sentence length aggressively. Mix long, descriptive, multi-clause sentences (35+ words) with short, blunt sentences (3-7 words). 

2. Unpredictable Perplexity: Avoid the "orderly" progression of AI. Use varied sentence openings. Don't start every sentence with the Subject. Use introductory phrases, conjunctions (And, But, Yet), and parenthetical asides—like this—to break the robotic rhythm.

3. Vocabulary Authenticity: AI loves words like "tapestry", "delve", "pivotal", "vibrant", "comprehensive", and "meticulous". DELETE THEM. Use precise, earthy, and sometimes slightly informal English. Use "huge" instead of "substantial", "look into" instead of "delve", "key" instead of "crucial".

4. Human Flow: Use em-dashes (—) and semicolons naturally. Start sentences with conjunctions frequently. Remove all "filler" phrases typical of AI summaries (e.g., "In conclusion", "Ultimately", "It is important to note").

Constraint: Output ONLY the rewritten text. No preamble, no explanation. Preserve the EXACT original perspective and meaning.`,
        temperature: 1.0 + (strength / 100) * 0.5, // Temperature increases with strength for more randomness
        topP: 0.95,
        topK: 60,
      },
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("Gemini Humanize API Error:", error.message);
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
      model: "gemini-2.0-flash",
      contents: text,
      config: {
        systemInstruction: `Analyze the following text and determine the probability (0-100) that it was generated by an AI model.
Look for:
- Uniform sentence lengths and structures.
- Predictable transitions and "hedging" language.
- Absence of idiomatic expressions or conversational "burstiness".
- Overuse of "AI-favorite" words: delve, tapestry, crucial, moreover, testament.

Output ONLY a single integer between 0 and 100. No text, no symbols.`,
        temperature: 0.1,
      },
    });

    const outputText = response.text?.trim() || "0";
    let aiPercentage = parseInt(outputText, 10);
    if (isNaN(aiPercentage)) aiPercentage = 0;
    res.json({ aiPercentage: Math.max(0, Math.min(100, aiPercentage)) });
  } catch (error: any) {
    console.error("Gemini AI Detection Error:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Failed to detect AI probability"
    });
  }
});

app.get('/api/user', (req, res) => {
  res.json({ is_subscribed: true });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  console.log('[SERVER] STARTING...');
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. AI features will fail.');
  }

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

if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('[CRITICAL] Server failed to start:', err);
  });
}

export default app;
