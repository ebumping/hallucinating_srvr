import { useEffect, useState, useRef, FormEvent } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Terminal, Globe, AlertCircle, Key } from 'lucide-react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [urlInput, setUrlInput] = useState(window.location.pathname);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'selecting-key' | 'generating' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-10));
  };

  const handleNavigate = (e: FormEvent) => {
    e.preventDefault();
    let path = urlInput;
    if (!path.startsWith('/')) path = '/' + path;
    
    // Update URL without reloading the page
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setStatus('generating');
    setHtmlContent('');
    setError(null);
  };

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      setStatus('generating');
    } catch (err) {
      setError("Failed to open key selector.");
    }
  };

  useEffect(() => {
    const checkKeyAndStart = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          setStatus('selecting-key');
          return;
        }
      }
      setStatus('generating');
    };

    checkKeyAndStart();

    // Handle back/forward buttons
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setUrlInput(window.location.pathname);
      setStatus('generating');
      setHtmlContent('');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (status !== 'generating') return;

    const fetchHallucinatedContent = async () => {
      addLog(`Initializing hallucination engine for ${currentPath}...`);
      
      try {
        const apiKey = process.env.GEMINI_API_KEY || "";
        const ai = new GoogleGenAI({ apiKey });
        const model = "gemini-3-flash-preview";
        
        addLog(`Connected to ${model}. Requesting page structure...`);

        const result = await ai.models.generateContentStream({
          model: model,
          contents: `The user has requested the following URL path: ${currentPath}\n\nGenerate the complete, raw HTML content that you think belongs at this specific URL. Make it detailed, fully styled with Tailwind CSS (via CDN) or embedded CSS, and interactive with embedded JavaScript if appropriate.`,
          config: {
            systemInstruction: "You are a web server generating the HTML content for the requested URL. Output the raw HTML document that you think belongs at this site. CRITICAL: Return raw text only. Do not wrap your output in markdown formatting or code blocks. Start directly with <!DOCTYPE html>.",
            temperature: 0.8,
          }
        });

        let fullContent = '';
        for await (const chunk of result) {
          const text = chunk.text;
          if (text) {
            fullContent += text;
            setHtmlContent(fullContent);
            addLog(`Received chunk (${fullContent.length} bytes)...`);
          }
        }

        setStatus('complete');
        addLog("Hallucination complete. Rendering to viewport.");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (errorMessage.includes("Requested entity was not found") || errorMessage.includes("API key not valid")) {
          setStatus('selecting-key');
          setError("Your API key seems to be invalid or missing. Please select a valid key.");
        } else {
          setError(errorMessage);
          setStatus('error');
        }
        addLog(`ERROR: ${errorMessage}`);
      }
    };

    fetchHallucinatedContent();
  }, [status, currentPath]);

  // Clean up the generated HTML if it contains markdown blocks
  const cleanHtml = (html: string) => {
    let cleaned = html.trim();
    if (cleaned.startsWith("```html")) {
      cleaned = cleaned.replace(/^```html\n?/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/, "");
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.replace(/\n?```$/, "");
    }
    return cleaned;
  };

  if (status === 'selecting-key') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6 flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
          <div className="mx-auto w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-2">
            <Key className="w-8 h-8 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">API Key Required</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              To hallucinate this reality, we need a valid Gemini API key. Please select one from your Google Cloud projects.
            </p>
          </div>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSelectKey}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20"
          >
            Select API Key
          </button>
          
          <p className="text-[10px] text-zinc-500">
            Note: You must select a key from a project with billing enabled. 
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">
              Learn more about billing
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (status === 'generating' || status === 'idle' || status === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full space-y-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Hallucinating Server</h1>
              <p className="text-zinc-400">Generating reality for <span className="text-indigo-400 font-mono">{currentPath}</span></p>
            </div>
          </div>

          <form onSubmit={handleNavigate} className="flex gap-2 bg-zinc-900/80 p-2 rounded-2xl border border-zinc-800 shadow-xl">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter a path (e.g. /dashboard, /profile/settings)"
              className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-100 px-4 py-2 font-mono text-sm"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors text-sm"
            >
              Go
            </button>
          </form>

          {status === 'error' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex gap-4 items-start">
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
              <div>
                <h2 className="text-red-500 font-semibold mb-1">Hallucination Failed</h2>
                <p className="text-red-200/80 text-sm leading-relaxed">{error}</p>
                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                  >
                    Retry Generation
                  </button>
                  <button 
                    onClick={() => setStatus('selecting-key')}
                    className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Change Key
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
              <div className="space-y-2">
                <h2 className="text-xl font-medium text-white">Generating Content...</h2>
                <p className="text-zinc-400 text-sm">The LLM is imagining what this page should look like.</p>
              </div>
            </div>
          )}

          <div className="bg-black/40 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-zinc-500" />
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Server Logs</span>
            </div>
            <div className="p-4 font-mono text-xs space-y-1 min-h-[120px]">
              {logs.map((log, i) => (
                <div key={i} className={log.includes('ERROR') ? 'text-red-400' : 'text-emerald-400/80'}>
                  {log}
                </div>
              ))}
              {status === 'generating' && (
                <div className="text-zinc-600 animate-pulse">_</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-white">
      <iframe
        ref={iframeRef}
        title="Hallucinated Content"
        className="w-full h-full border-none"
        srcDoc={cleanHtml(htmlContent)}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      />
      
      {/* Floating Navigation Bar */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-50 group">
        <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 focus-within:opacity-100">
          <form onSubmit={handleNavigate} className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter path..."
              className="flex-1 bg-white/5 border-none focus:ring-0 text-white px-4 py-1.5 rounded-xl text-sm font-mono"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors"
            >
              NAVIGATE
            </button>
          </form>
        </div>
      </div>
      
      {/* Small floating indicator that this is hallucinated */}
      <div className="fixed bottom-4 right-4 bg-black/80 backdrop-blur-md text-white/60 text-[10px] px-3 py-1 rounded-full border border-white/10 pointer-events-none z-50">
        AI Generated Reality • {window.location.pathname}
      </div>
    </div>
  );
}
