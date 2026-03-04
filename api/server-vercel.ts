import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';

const app = express();

// Hyper-isolated in-memory store for Vercel
const memoryStore = new Map<string, any>();

// In-memory DB methods
const getMemoryUser = (id: string) => {
    let user = memoryStore.get(id);
    if (!user) {
        user = { id, is_subscribed: 1, subscription_id: null };
        memoryStore.set(id, user);
    }
    return user;
};

// Middleware
app.use(express.json({ limit: '1mb' }));

app.use(async (req, res, next) => {
    const userId = req.headers['x-user-id'] as string;
    if (userId) {
        (req as any).user = getMemoryUser(userId);
    }
    next();
});

// Routes
app.post('/api/humanize', async (req, res) => {
    const { text, tone = 'Standard', strength = 70 } = req.body;
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

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
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY missing");

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

2. Unpredictable Perplexity: Avoid the "orderly" progression of AI. Use varied sentence openings. Don't start every sentence with the Subject. Use introductory phrases, conjunctions (And, But, Yet), and parenthetical asides to break the robotic rhythm.

3. Vocabulary Authenticity: AI loves words like "tapestry", "delve", "pivotal", "vibrant", "comprehensive", and "meticulous". DELETE THEM. Use precise, earthy, and sometimes slightly informal English. Use "huge" instead of "substantial", "look into" instead of "delve", "key" instead of "crucial".

4. Human Flow: Start sentences with conjunctions frequently. Use commas, periods, and semicolons for natural pauses. Remove all "filler" phrases typical of AI summaries (e.g., "In conclusion", "Ultimately", "It is important to note").

5. STRICT DASH BAN: NEVER use em-dashes (—), en-dashes (–), or any form of dash as punctuation. These are a hallmark of AI-generated content. Instead, use commas, periods, semicolons, or restructure the sentence. If a dash exists in the input text, replace it with a comma or split into two sentences.

Constraint: Output ONLY the rewritten text. No preamble, no explanation. Preserve the EXACT original perspective and meaning.`,
                temperature: 1.0 + (strength / 100) * 0.5,
                topP: 0.95,
                topK: 60,
            },
        });

        // Post-process: strip any em-dashes, en-dashes that slipped through
        let cleanedText = (response.text || "")
            .replace(/—/g, ', ')   // em-dash → comma
            .replace(/–/g, ', ')   // en-dash → comma
            .replace(/\s*,\s*,/g, ',')  // clean up double commas
            .replace(/\s+/g, ' ')       // normalize whitespace
            .trim();

        res.json({ text: cleanedText });
    } catch (error: any) {
        console.error("Vercel Humanize Error:", error);
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
        console.error("Vercel AI Detect Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', (req, res) => {
    res.json({ is_subscribed: true });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    const { name, email, type, message } = req.body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const contactEmail = process.env.CONTACT_EMAIL || 'akfskk2001@gmail.com';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
        console.error('SMTP_USER or SMTP_PASS not configured.');
        return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        const typeLabels: Record<string, string> = {
            suggestion: '💡 Suggestion',
            bug: '🐛 Bug Report',
            feature: '🚀 Feature Request',
            project: '🤝 Project Idea',
            other: '📩 Other',
        };

        await transporter.sendMail({
            from: `"Zero Nonsense Contact" <${smtpUser}>`,
            to: contactEmail,
            replyTo: email,
            subject: `[Zero Nonsense] ${typeLabels[type] || type} from ${name}`,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <div style="background: #18181b; padding: 20px 24px; border-radius: 12px 12px 0 0;">
                        <h2 style="color: #fff; margin: 0; font-size: 18px;">New Contact Form Submission</h2>
                    </div>
                    <div style="background: #fafafa; padding: 24px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="margin: 0 0 12px;"><strong>From:</strong> ${name} (${email})</p>
                        <p style="margin: 0 0 12px;"><strong>Type:</strong> ${typeLabels[type] || type}</p>
                        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 16px 0;" />
                        <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${message}</p>
                    </div>
                </div>
            `,
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Contact email error:', error.message);
        res.status(500).json({ error: 'Failed to send your message. Please try again later.' });
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('VERCEL UNHANDLED ERROR:', err);
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred'
    });
});

export default app;
