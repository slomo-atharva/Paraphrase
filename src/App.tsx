import React, { useState, useEffect } from 'react';
import { Copy, Sparkles, Loader2, Check, ArrowRightLeft, Lock } from 'lucide-react';
import PricingModal from './components/PricingModal';
import SEO from './components/SEO';
import { Analytics } from '@vercel/analytics/react';

// Generate a simple unique ID for the user session if one doesn't exist
const getUserId = () => {
  let id = localStorage.getItem('app_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('app_user_id', id);
  }
  return id;
};

export default function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [userId] = useState(getUserId());
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  const [inputAiScore, setInputAiScore] = useState<number | null>(null);
  const [outputAiScore, setOutputAiScore] = useState<number | null>(null);
  const [isDetectingInput, setIsDetectingInput] = useState(false);
  const [isDetectingOutput, setIsDetectingOutput] = useState(false);

  const [selectedTone, setSelectedTone] = useState('Standard');
  const tones = ['Standard', 'Friendly', 'Professional', 'Narrator'];

  useEffect(() => {
    // Check subscription status on load
    fetch('/api/user', {
      headers: { 'x-user-id': userId }
    })
      .then(async res => {
        const contentType = res.headers.get('content-type');
        if (!res.ok || !contentType || !contentType.includes('application/json')) {
          throw new Error('Server error');
        }
        return res.json();
      })
      .then(data => {
        if (data.is_subscribed !== undefined) {
          setIsSubscribed(data.is_subscribed);
        }
      })
      .catch(err => console.error('Failed to fetch user status:', err));
  }, [userId]);

  const getWordCount = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  const wordCount = getWordCount(inputText);
  const isOverLimit = wordCount > 100 && !isSubscribed;

  const handleHumanize = async () => {
    if (!inputText.trim() || isOverLimit) return;

    setIsLoading(true);
    setError('');
    setOutputText('');
    setInputAiScore(null);
    setOutputAiScore(null);

    // Fire off input score detection
    setIsDetectingInput(true);
    const detectInputPromise = fetch('/api/detect-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ text: inputText })
    })
      .then(async res => {
        const contentType = res.headers.get('content-type');
        if (!res.ok) {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            throw new Error(errorData.error || errorData.details || 'AI Detection Service Error');
          }
          throw new Error('AI Detection Service Unavailable');
        }
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Unexpected response from AI Detection Service');
        }
        return res.json();
      })
      .then(data => setInputAiScore(data.aiPercentage))
      .catch(err => console.error("Input AI Detection Failed:", err))
      .finally(() => setIsDetectingInput(false));

    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ text: inputText, tone: selectedTone })
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        let errorMessage = 'The server is currently unavailable or returned an unexpected response.';
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            console.error('API Error Response:', errorData);
            errorMessage = errorData.error || errorData.details || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            console.error('Non-JSON Server Response:', errorText.substring(0, 1000));
            // Check if it looks like typical Vercel/Cloudflare/Hosting error HTML
            if (errorText.includes('<html') || errorText.includes('<!DOCTYPE')) {
              errorMessage = `Server Error: Received an HTML response instead of JSON. (Status: ${response.status})`;
            } else {
              errorMessage = `Server Error: ${errorText.substring(0, 50)}... (Status: ${response.status})`;
            }
          }
        } catch (e) {
          console.error('Error parsing error response:', e);
          errorMessage = `Connection Error: Failed to parse server response. (Status: ${response.status})`;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Unexpected Content-Type:', contentType, 'Body:', text.substring(0, 100));
        throw new Error(`Server returned an unexpected response format: ${contentType || 'missing'}`);
      }

      const data = await response.json();

      const generatedText = data.text;
      setOutputText(generatedText);

      // Now fire off the output detection
      setIsDetectingOutput(true);
      fetch('/api/detect-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ text: generatedText })
      })
        .then(async res => {
          const contentType = res.headers.get('content-type');
          if (!res.ok) {
            if (contentType && contentType.includes('application/json')) {
              const errorData = await res.json();
              throw new Error(errorData.error || errorData.details || 'AI Detection Service Error');
            }
            throw new Error('AI Detection Service Unavailable');
          }
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Unexpected response from AI Detection Service');
          }
          return res.json();
        })
        .then(data => setOutputAiScore(data.aiPercentage))
        .catch(err => console.error("Output AI Detection Failed:", err))
        .finally(() => setIsDetectingOutput(false));

    } catch (err: any) {
      setError(err.message || 'An error occurred while humanizing the text.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-zinc-900 font-sans selection:bg-zinc-200">
      <SEO />
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 p-2 rounded-lg">
            <ArrowRightLeft className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">AI-to-Human</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-zinc-500 hidden sm:block">
            Bypass detectors with natural, bursty writing.
          </div>
          {!isSubscribed && isSubscribed !== null && (
            <button
              onClick={() => setIsPricingOpen(true)}
              className="text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition-colors"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 h-[calc(100vh-4.5rem)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-1">Paraphraser</h2>
            <p className="text-zinc-500 text-sm">Transform robotic AI text into natural, human-like writing.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isOverLimit && (
              <div className="flex items-center gap-3 bg-red-50 text-red-700 px-4 py-2 rounded-full text-sm font-medium border border-red-100 animate-in fade-in slide-in-from-right-4">
                <Lock className="w-4 h-4" />
                <span>Limit exceeded: Max 100 words</span>
                <button
                  onClick={() => setIsPricingOpen(true)}
                  className="bg-red-600 text-white px-3 py-1 rounded-full text-xs hover:bg-red-700 transition-colors ml-1 shadow-sm"
                >
                  Upgrade for $2/mo
                </button>
              </div>
            )}

            <button
              onClick={handleHumanize}
              disabled={isLoading || !inputText.trim() || isOverLimit}
              className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2.5 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 whitespace-nowrap"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Humanize Text
            </button>
          </div>
        </div>

        {/* Tone Selector */}
        <div className="flex bg-white rounded-xl shadow-sm border border-zinc-200 p-1.5 w-full sm:w-max mx-auto sm:mx-0">
          {tones.map(tone => (
            <button
              key={tone}
              onClick={() => setSelectedTone(tone)}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-lg text-sm font-medium transition-all ${selectedTone === tone
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
            >
              {tone}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Input */}
          <div className={`flex-1 flex flex-col bg-white rounded-2xl shadow-sm border overflow-hidden transition-colors ${isOverLimit ? 'border-red-300 ring-1 ring-red-300' : 'border-zinc-200'}`}>
            <div className={`px-5 py-3 border-b flex justify-between items-center ${isOverLimit ? 'bg-red-50/50 border-red-100' : 'bg-zinc-50/50 border-zinc-100'}`}>
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Input AI Text</h2>
              <div className="flex items-center gap-3">
                {isDetectingInput && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-100/80 px-2 py-1 rounded-md border border-zinc-200/50">
                    <Loader2 className="w-3 h-3 animate-spin" /> Detecting AI...
                  </span>
                )}
                {inputAiScore !== null && !isDetectingInput && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${inputAiScore > 50
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : inputAiScore > 20
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}>
                    AI Detected: {inputAiScore}%
                  </span>
                )}
                <span className={`text-xs font-mono px-2.5 py-1 rounded-md ${isOverLimit ? 'bg-red-100 text-red-700 font-bold' : 'bg-zinc-100 text-zinc-500'}`}>
                  {wordCount} {isSubscribed ? 'words' : '/ 100 words'}
                </span>
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your AI-generated text here..."
              className="flex-1 w-full p-5 resize-none focus:outline-none focus:ring-0 text-zinc-800 leading-relaxed bg-transparent text-base"
            />
          </div>

          {/* Output */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden relative">
            <div className="px-5 py-3 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Humanized Output</h2>
              <div className="flex items-center gap-3">
                {isDetectingOutput && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-100/80 px-2 py-1 rounded-md border border-zinc-200/50">
                    <Loader2 className="w-3 h-3 animate-spin" /> Detecting AI...
                  </span>
                )}
                {outputAiScore !== null && !isDetectingOutput && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${outputAiScore > 50
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : outputAiScore > 20
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}>
                    AI Detected: {outputAiScore}%
                  </span>
                )}
                <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-md">{getWordCount(outputText)} words</span>
                <button
                  onClick={handleCopy}
                  disabled={!outputText}
                  className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 transition-colors p-1"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex-1 relative p-5 overflow-y-auto bg-zinc-50/30">
              {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
                  <Loader2 className="w-8 h-8 text-zinc-900 animate-spin mb-4" />
                  <p className="text-sm text-zinc-600 font-medium animate-pulse">Humanizing your text...</p>
                </div>
              ) : null}

              {error ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              ) : (
                <div className="text-zinc-800 leading-relaxed whitespace-pre-wrap text-base">
                  {outputText || <span className="text-zinc-400 italic">Humanized text will appear here...</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        userId={userId}
      />
      <Analytics />
    </div>
  );
}
