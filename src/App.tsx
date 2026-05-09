import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import {
  Send, Bot, User, Moon, Sun, Plus,
  Settings, LogOut, Search, Sparkles,
  Paperclip, FileText, Clock, Palette, HelpCircle, Loader2, Mail, ShieldCheck,
  Image as ImageIcon, Wand2, Database, Globe2, BookOpen, BadgeCheck, FileImage
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const API_BASE_URL = import.meta.env.VITE_ROOK_API_URL || '/api';
const TOKEN_KEY = 'rook_ai_token';
const EMAIL_KEY = 'rook_ai_email';
const PROFILE_KEY = 'rook_ai_profile';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  time: string;
};

type UserSession = {
  email: string;
  token: string;
};

type UserProfile = {
  name: string;
  age: string;
  role: string;
  goal: string;
};

type ChatMode = 'documents' | 'general';

type GeneratedImage = {
  imageUrl: string;
  text: string;
  model: string;
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function now() {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function parseStoredProfile(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as UserProfile;
  } catch {
    return null;
  }
}

async function readApiResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The backend returned an unreadable response. Make sure npm run server is running.');
  }
}

export default function RookAI() {
  const savedToken = localStorage.getItem(TOKEN_KEY);
  const savedEmail = localStorage.getItem(EMAIL_KEY);
  const savedProfile = parseStoredProfile(localStorage.getItem(PROFILE_KEY));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<UserSession | null>(
    savedToken && savedEmail ? { token: savedToken, email: savedEmail } : null
  );
  const [profile, setProfile] = useState<UserProfile | null>(savedProfile);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: savedProfile
        ? `Hey ${savedProfile.name}! 😊 I’m ready. Ask me anything, or upload a file when you want document answers.`
        : 'Upload a PDF, DOCX, TXT, or other supported file, then ask me questions about it.',
      time: now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('documents');
  const [imagePrompt, setImagePrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageName, setReferenceImageName] = useState('');
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [status, setStatus] = useState('Connected through local backend');

  const theme = {
    app: isDark ? 'bg-[#09090b] text-zinc-100' : 'bg-slate-50 text-slate-950',
    sidebar: isDark ? 'bg-[#0c0c0e] border-zinc-800' : 'bg-white border-slate-200',
    panel: isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200',
    muted: isDark ? 'text-zinc-500' : 'text-slate-500',
    navHover: isDark ? 'hover:bg-zinc-800/50 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950',
    headerBorder: isDark ? 'border-zinc-800/50' : 'border-slate-200',
    input: isDark ? 'bg-zinc-900/50 border-zinc-800 focus:border-indigo-500' : 'bg-slate-100 border-slate-200 focus:border-indigo-500',
    assistantBubble: isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 text-slate-900',
    userAvatar: isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-slate-200 border-slate-300 text-slate-900',
  };

  const authHeaders: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};

  const readReferenceImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(typeof reader.result === 'string' ? reader.result : null);
      setReferenceImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setUser(null);
  };

  const saveProfile = async (nextProfile: UserProfile) => {
    if (!user) return;

    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(nextProfile),
    });
    const data = await readApiResponse(response);

    if (response.status === 401) {
      signOut();
      throw new Error('Your session expired after the backend restarted. Please login again.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Could not save your profile.');
    }

    const saved = data.profile || nextProfile;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(saved));
    setProfile(saved);
    setMessages([{
      role: 'assistant',
      content: `Hey ${saved.name}! 😊 Nice to meet you. I’ll keep things friendly and useful. Ask me anything, or switch to Docs when you want answers from uploaded files.`,
      time: now(),
    }]);
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = input.trim();

    if (!question || isSending || !user) return;

    setInput('');
    setIsSending(true);
    setStatus(chatMode === 'documents' ? 'Searching embedded documents...' : 'Thinking with general chat...');
    setMessages(prev => [...prev, { role: 'user', content: question, time: now() }]);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ message: question, mode: chatMode, profile }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'The backend could not answer this question.');
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'No answer returned.',
        time: now(),
      }]);
      setStatus('Ready');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not connect to the backend.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: chatMode === 'general'
          ? `Sorry, my bad 😅 I could not reach the general chat engine: ${errorMessage}`
          : `I could not reach the document brain: ${errorMessage}`,
        time: now(),
      }]);
      setStatus('Backend or AnythingLLM is not reachable');
    } finally {
      setIsSending(false);
    }
  };

  const generateImage = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = imagePrompt.trim();

    if (!prompt || isGeneratingImage || !user) return;

    setIsGeneratingImage(true);
    setGeneratedImage(null);
    setStatus('Generating image with Nano Banana...');

    try {
      const response = await fetch(`${API_BASE_URL}/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt, referenceImage }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Image generation failed.');
      }

      setGeneratedImage({
        imageUrl: data.imageUrl,
        text: data.text,
        model: data.model,
      });
      setStatus('Image generated');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image generation failed.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!user) return;

    setIsUploading(true);
    setStatus(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('addToWorkspaces', 'my-workspace');
    formData.append('metadata', JSON.stringify({
      title: file.name,
      docSource: 'Rook AI chat upload',
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `${file.name} was uploaded and sent to the workspace for embedding. Ask a question once processing finishes.`,
        time: now(),
      }]);
      setStatus('Document uploaded');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not upload the file.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Upload failed: ${errorMessage}`,
        time: now(),
      }]);
      setStatus('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!user) {
    return (
      <LoginScreen
        isDark={isDark}
        onToggleTheme={() => setIsDark(prev => !prev)}
        onVerified={(session) => {
          localStorage.setItem(TOKEN_KEY, session.token);
          localStorage.setItem(EMAIL_KEY, session.email);
          setUser(session);
        }}
      />
    );
  }

  return (
    <div className={cn("flex h-screen w-full font-sans transition-colors duration-500", theme.app)}>
      {!profile && <ProfileModal isDark={isDark} email={user.email} onSave={saveProfile} />}
      <aside className={cn("w-72 flex flex-col p-4 border-r transition-all", theme.sidebar)}>
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded-lg">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Rook AI <span className="text-[10px] bg-indigo-500/20 text-indigo-500 px-1.5 py-0.5 rounded ml-1 border border-indigo-500/30">RAG</span></span>
          </div>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white p-3 rounded-xl mb-6 shadow-lg shadow-indigo-500/20 transition-all font-medium"
          onClick={() => setMessages([{ role: 'assistant', content: 'New chat started. Upload a document or ask about the current workspace.', time: now() }])}
        >
          <Plus size={18} /> New Chat
        </button>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            className={cn("w-full pl-10 pr-4 py-2 rounded-xl text-sm border focus:outline-none transition-all", theme.input)}
            placeholder="Search conversations..."
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
          <p className={cn("text-[10px] font-bold px-2 uppercase tracking-widest mb-2 flex items-center gap-2", theme.muted)}>
            <Clock size={12}/> Workspace
          </p>
          {[
            { label: 'Document Q&A', icon: <BookOpen size={16} /> },
            { label: 'General questions', icon: <Globe2 size={16} /> },
            { label: 'Nano Banana images', icon: <Wand2 size={16} /> },
            { label: 'MongoDB activity', icon: <Database size={16} /> },
          ].map((item, i) => (
            <div key={item.label} className={cn("group flex items-center gap-3 p-3 rounded-xl transition-all",
              i === 0 ? (isDark ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-indigo-50 border border-indigo-100") : theme.navHover)}>
              <span className={i === 0 ? "text-indigo-500" : theme.muted}>{item.icon}</span>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium">{item.label}</p>
                <p className={cn("text-[11px] truncate", theme.muted)}>
                  {i === 0 ? 'AnythingLLM workspace: my-workspace' : i === 1 ? 'Ask anything after login' : i === 2 ? 'Gemini image model ready by API key' : 'Users and actions captured'}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className={cn("mt-4 p-4 rounded-2xl border relative overflow-hidden group", isDark ? "bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-indigo-500/20" : "bg-indigo-50 border-indigo-100")}>
          <div className="relative z-10">
            <p className="text-sm font-bold flex items-center gap-2"><Sparkles size={14} className="text-yellow-500"/> Knowledge base</p>
            <p className={cn("text-[11px] mt-1 mb-3", isDark ? "text-zinc-400" : "text-slate-600")}>Files are uploaded to AnythingLLM and embedded for answers.</p>
            <button
              className="w-full py-2 bg-indigo-600 text-white text-xs rounded-lg font-bold hover:bg-indigo-500 transition-all disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? 'Uploading...' : 'Upload file'}
            </button>
          </div>
          <Bot className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform" size={80} />
        </div>

        <div className={cn("mt-6 pt-4 border-t space-y-1", isDark ? "border-zinc-800" : "border-slate-200")}>
          <NavItem icon={<Settings size={18}/>} label="Settings" theme={theme} />
          <NavItem icon={<Palette size={18}/>} label="Appearance" onClick={() => setIsDark(!isDark)} theme={theme} />
          <NavItem icon={<HelpCircle size={18}/>} label="Help & Support" theme={theme} />
          <NavItem icon={<LogOut size={18}/>} label="Log out" className="text-red-500" onClick={signOut} theme={theme} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />

        <header className={cn("flex items-center justify-between p-4 px-8 border-b backdrop-blur-md", theme.headerBorder)}>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <div>
              <span className="font-semibold text-sm">{chatMode === 'documents' ? 'Document Chat' : 'General Chat'}</span>
              <p className={cn("text-[11px]", theme.muted)}>{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn("flex rounded-full border p-1 text-xs", isDark ? "border-zinc-800 bg-zinc-950" : "border-slate-200 bg-white")}>
              <button
                className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold transition", chatMode === 'documents' ? "bg-indigo-600 text-white" : theme.muted)}
                onClick={() => setChatMode('documents')}
              >
                <BookOpen size={13} /> Docs
              </button>
              <button
                className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold transition", chatMode === 'general' ? "bg-indigo-600 text-white" : theme.muted)}
                onClick={() => setChatMode('general')}
              >
                <Globe2 size={13} /> General
              </button>
            </div>
            <div className={cn("hidden sm:block text-right text-xs", theme.muted)}>
              <p className="font-medium">{profile?.name || user.email}</p>
              <p className="inline-flex items-center justify-end gap-1"><BadgeCheck size={12} /> Free access</p>
            </div>
            <button onClick={() => setIsDark(!isDark)} className={cn("p-2 rounded-full transition-all", theme.navHover)} aria-label="Toggle theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={`${msg.time}-${i}`} className={cn("flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-4 max-w-[70%]", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                  msg.role === 'assistant' ? "bg-indigo-600 border-indigo-400 text-white" : theme.userAvatar)}>
                  {msg.role === 'assistant' ? <Bot size={20}/> : <User size={20}/>}
                </div>
                <div className={cn("space-y-1", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn("p-4 rounded-3xl shadow-xl border",
                    msg.role === 'user' ? "bg-indigo-600 text-white border-indigo-500 rounded-tr-none" : `${theme.assistantBubble} rounded-tl-none`)}>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <p className={cn("text-[10px] px-2", theme.muted)}>{msg.time}</p>
                </div>
              </div>
            </div>
          ))}
          {isSending && (
            <div className={cn("flex items-center gap-3 text-sm italic ml-14", theme.muted)}>
              <Loader2 size={14} className="animate-spin"/>
              <span>Reading workspace documents...</span>
            </div>
          )}
        </div>

        <div className="p-8 pt-0">
          <form onSubmit={generateImage} className={cn("max-w-4xl mx-auto mb-4 rounded-2xl p-4 border", theme.panel)}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600 text-white">
                  <Wand2 size={18} />
                </div>
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  value={imagePrompt}
                  onChange={event => setImagePrompt(event.target.value)}
                  placeholder="Generate an image with Nano Banana..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={imageInputRef}
                  className="hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) readReferenceImage(file);
                  }}
                />
                <button
                  type="button"
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition", isDark ? "border-zinc-800 hover:bg-zinc-800" : "border-slate-200 hover:bg-slate-100")}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <FileImage size={15} />
                  {referenceImageName || 'Reference'}
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingImage || !imagePrompt.trim()}
                  className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingImage ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  Generate
                </button>
              </div>
            </div>
            {generatedImage && (
              <div className={cn("mt-4 grid gap-4 rounded-xl border p-3 md:grid-cols-[180px_1fr]", isDark ? "border-zinc-800 bg-zinc-950/60" : "border-slate-200 bg-slate-50")}>
                <img src={generatedImage.imageUrl} alt="Generated result" className="h-44 w-full rounded-lg object-cover" />
                <div className="flex flex-col justify-center">
                  <p className="text-sm font-semibold">Generated image ready</p>
                  <p className={cn("mt-1 text-xs leading-5", theme.muted)}>{generatedImage.text}</p>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-fuchsia-500">{generatedImage.model}</p>
                </div>
              </div>
            )}
          </form>

          <form onSubmit={sendMessage} className={cn("max-w-4xl mx-auto rounded-[32px] p-2 transition-all shadow-2xl border backdrop-blur-xl", theme.panel)}>
            <div className="flex items-center gap-2 px-4 py-2">
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <button
                type="button"
                className="p-2 text-zinc-500 hover:text-indigo-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload document"
              >
                {isUploading ? <Loader2 size={20} className="animate-spin"/> : <Paperclip size={20}/>}
              </button>
              <button
                type="button"
                className="p-2 text-zinc-500 hover:text-fuchsia-500 transition-colors"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Attach image reference"
              >
                <ImageIcon size={20}/>
              </button>
              <FileText size={18} className="text-zinc-500" />
              <input
                className="flex-1 bg-transparent border-none outline-none text-[15px] px-2"
                placeholder={chatMode === 'documents' ? 'Ask about uploaded files...' : 'Ask any random question...'}
                value={input}
                onChange={event => setInput(event.target.value)}
              />
              <button
                type="submit"
                className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-lg shadow-indigo-500/40 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSending || !input.trim()}
                aria-label="Send message"
              >
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} fill="currentColor" />}
              </button>
            </div>
          </form>
          <p className={cn("text-[10px] text-center mt-4 uppercase tracking-widest opacity-70 flex items-center justify-center gap-2", theme.muted)}>
            <HelpCircle size={10}/> Answers come from your AnythingLLM workspace documents.
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginScreen({
  isDark,
  onToggleTheme,
  onVerified,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
  onVerified: (session: UserSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [message, setMessage] = useState('Use your email to unlock the document chat workspace.');
  const [isLoading, setIsLoading] = useState(false);

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage('Sending verification code...');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) throw new Error(data.error || 'Could not send verification code.');

      setStep('otp');
      setMessage(data.devOtp ? `Development OTP: ${data.devOtp}` : data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage('Verifying code...');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) throw new Error(data.error || 'Verification failed.');

      onVerified({ email: data.user.email, token: data.token });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("min-h-screen w-full flex items-center justify-center px-6 transition-colors", isDark ? "bg-[#09090b] text-zinc-100" : "bg-slate-50 text-slate-950")}>
      <button
        onClick={onToggleTheme}
        className={cn("absolute right-6 top-6 p-3 rounded-full border transition-colors", isDark ? "border-zinc-800 hover:bg-zinc-900" : "border-slate-200 bg-white hover:bg-slate-100")}
        aria-label="Toggle theme"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className={cn("w-full max-w-md rounded-2xl border p-8 shadow-2xl", isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-200")}>
        <div className="mb-8">
          <div className="mb-5 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 text-white">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Rook AI Login</h1>
          <p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>{message}</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="email">Email address</label>
            <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}>
              <Mail size={18} className="text-indigo-500" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full bg-transparent outline-none"
                placeholder="you@example.com"
              />
            </div>
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60" disabled={isLoading}>
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              Send OTP
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="otp">Verification code</label>
            <input
              id="otp"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={6}
              value={otp}
              onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className={cn("w-full rounded-xl border px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
              placeholder="000000"
            />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60" disabled={isLoading || otp.length !== 6}>
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              Verify and continue
            </button>
            <button type="button" className="w-full text-sm text-indigo-500" onClick={() => setStep('email')}>
              Change email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ProfileModal({
  isDark,
  email,
  onSave,
}: {
  isDark: boolean;
  email: string;
  onSave: (profile: UserProfile) => Promise<void>;
}) {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    age: '',
    role: 'Student',
    goal: '',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!profile.name.trim()) {
      setError('Please add your name so Rook can greet you properly.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...profile,
        name: profile.name.trim(),
        age: profile.age.trim(),
        role: profile.role.trim(),
        goal: profile.goal.trim(),
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <form onSubmit={submitProfile} className={cn("w-full max-w-lg rounded-2xl border p-7 shadow-2xl", isDark ? "border-zinc-800 bg-zinc-950 text-zinc-100" : "border-slate-200 bg-white text-slate-950")}>
        <div className="mb-6">
          <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 p-3 text-white">
            <User size={22} />
          </div>
          <h2 className="text-2xl font-bold">Tell Rook about you</h2>
          <p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>
            You are verified as {email}. Add a few details so the chat feels personal and useful 😊
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            Name
            <input
              className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
              value={profile.name}
              onChange={event => setProfile(prev => ({ ...prev, name: event.target.value }))}
              placeholder="Your name"
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Age
            <input
              className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
              value={profile.age}
              onChange={event => setProfile(prev => ({ ...prev, age: event.target.value }))}
              placeholder="18"
            />
          </label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">
            Are you studying or working?
            <select
              className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
              value={profile.role}
              onChange={event => setProfile(prev => ({ ...prev, role: event.target.value }))}
            >
              <option>Student</option>
              <option>Working professional</option>
              <option>Founder</option>
              <option>Researcher</option>
              <option>Other</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">
            Main goal
            <input
              className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
              value={profile.goal}
              onChange={event => setProfile(prev => ({ ...prev, goal: event.target.value }))}
              placeholder="Study faster, build projects, create images..."
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          disabled={isSaving}
        >
          {isSaving && <Loader2 size={18} className="animate-spin" />}
          Start chatting
        </button>
      </form>
    </div>
  );
}

function NavItem({
  icon,
  label,
  className = "",
  onClick,
  theme,
}: {
  icon: ReactNode;
  label: string;
  className?: string;
  onClick?: () => void;
  theme: { navHover: string };
}) {
  return (
    <div onClick={onClick} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all text-sm font-medium text-zinc-500 group", theme.navHover, className)}>
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      {label}
    </div>
  );
}
