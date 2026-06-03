import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import {
  Send, Bot, User, Moon, Sun, Plus,
  LogOut, Sparkles,
  Paperclip, Palette, Loader2, Mail, ShieldCheck,
  Image as ImageIcon, Wand2, Globe2, BookOpen, BadgeCheck, Phone, X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const API_BASE_URL = import.meta.env.VITE_ROOK_API_URL || '/api';
const TOKEN_KEY = 'rook_ai_token';
const CONTACT_KEY = 'rook_ai_contact';
const PROFILE_KEY = 'rook_ai_profile';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  time: string;
  imageUrl?: string;
  model?: string;
};

type UserSession = {
  email?: string;
  phone?: string;
  userId?: string;
  authChannel?: 'email' | 'sms';
  token: string;
};

type UserProfile = {
  name: string;
  age: string;
  role: string;
  goal: string;
};

type ChatMode = 'documents' | 'general';

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
  const savedContact = localStorage.getItem(CONTACT_KEY);
  const savedProfile = parseStoredProfile(localStorage.getItem(PROFILE_KEY));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<UserSession | null>(
    savedToken && savedContact ? { token: savedToken, email: savedContact.includes('@') ? savedContact : undefined, phone: savedContact.includes('@') ? undefined : savedContact } : null
  );
  const [profile, setProfile] = useState<UserProfile | null>(savedProfile);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: savedProfile
        ? `Hey ${savedProfile.name}! I am ready. Ask me anything, upload a file, or describe a study visual you want.`
        : 'Explore Rook AI freely. When you click the prompt bar or upload a file, I will ask for your details and verification.',
      time: now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('documents');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageName, setReferenceImageName] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [status, setStatus] = useState('Connected to Rook AI cloud');

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
  const isVerified = Boolean(user && profile);

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
    localStorage.removeItem(CONTACT_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setUser(null);
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = input.trim();

    if (!question || isSending) return;
    if (!isVerified) {
      setIsAuthOpen(true);
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question, time: now() }]);

    const imagePrompt = question.replace(/^\/(image|chart|graph|diagram|visual|draw|sketch|flowchart|mindmap)\s*/i, '').trim();
    const wantsImage = /^\/(image|chart|graph|diagram|visual|draw|sketch|flowchart|mindmap)\b/i.test(question)
      || /\b(draw|sketch|design|generate|create|make|visualize|plot|map)\b.*\b(image|chart|graph|diagram|visual|infographic|architecture|flowchart|mind\s*map|timeline|table|layers?|tiers?|cycle|process|model)\b/i.test(question)
      || /\b(chart|graph|diagram|infographic|architecture|flowchart|mind\s*map|timeline|layers?|tiers?)\b.*\b(about|for|of|showing|example|structure|model)\b/i.test(question);
    if (wantsImage && imagePrompt) {
      await generateImageFromPrompt(imagePrompt);
      return;
    }

    setIsSending(true);
    setStatus(chatMode === 'documents' ? 'Searching embedded documents...' : 'Thinking with general chat...');

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
          ? `Sorry, my bad. I could not reach the general chat engine: ${errorMessage}`
          : `I could not reach the document brain: ${errorMessage}`,
        time: now(),
      }]);
      setStatus('Cloud chat is not reachable');
    } finally {
      setIsSending(false);
    }
  };

  const generateImageFromPrompt = async (prompt: string) => {
    if (!prompt || isGeneratingImage || !isVerified) {
      if (!isVerified) setIsAuthOpen(true);
      return;
    }

    setIsGeneratingImage(true);
    setStatus('Generating image with Nano Banana...');

    try {
      const response = await fetch(`${API_BASE_URL}/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          prompt,
          referenceImage,
          mode: chatMode,
          profile,
          useWorkspaceContext: chatMode === 'documents',
        }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Image generation failed.');
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'Image generated successfully.',
        imageUrl: data.imageUrl,
        model: data.model,
        time: now(),
      }]);
      setStatus('Image generated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Image generation failed.';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage, time: now() }]);
      setStatus(errorMessage);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!isVerified) {
      setIsAuthOpen(true);
      return;
    }

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

  return (
    <div className={cn("flex h-screen w-full font-sans transition-colors duration-500", theme.app)}>
      {isAuthOpen && !isVerified && (
        <LoginScreen
          isDark={isDark}
          onClose={() => setIsAuthOpen(false)}
          onVerified={(session, nextProfile) => {
            localStorage.setItem(TOKEN_KEY, session.token);
            localStorage.setItem(CONTACT_KEY, session.email || session.phone || session.userId || '');
            localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
            setUser(session);
            setProfile(nextProfile);
            setIsAuthOpen(false);
            setMessages([{
              role: 'assistant',
              content: `Hey ${nextProfile.name}! You are verified now. Ask me anything, upload a file, or ask for a study visual.`,
              time: now(),
            }]);
          }}
        />
      )}
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

        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
          <p className={cn("text-[10px] font-bold px-2 uppercase tracking-widest mb-2 flex items-center gap-2", theme.muted)}>
            <Sparkles size={12}/> Workspace
          </p>
          {[
            { label: 'Document Q&A', icon: <BookOpen size={16} /> },
            { label: 'General questions', icon: <Globe2 size={16} /> },
            { label: 'Nano Banana images', icon: <Wand2 size={16} /> },
          ].map((item, i) => (
            <div key={item.label} className={cn("group flex items-center gap-3 p-3 rounded-xl transition-all",
              i === 0 ? (isDark ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-indigo-50 border border-indigo-100") : theme.navHover)}>
              <span className={i === 0 ? "text-indigo-500" : theme.muted}>{item.icon}</span>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium">{item.label}</p>
                <p className={cn("text-[11px] truncate", theme.muted)}>
                  {i === 0 ? 'Ask from uploaded study files' : i === 1 ? 'Everyday and research help' : 'Images, charts, and graphs'}
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
              onClick={() => isVerified ? fileInputRef.current?.click() : setIsAuthOpen(true)}
            >
              {isUploading ? 'Uploading...' : 'Upload file'}
            </button>
          </div>
          <Bot className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform" size={80} />
        </div>

        <div className={cn("mt-6 pt-4 border-t space-y-1", isDark ? "border-zinc-800" : "border-slate-200")}>
          <NavItem icon={<Palette size={18}/>} label="Appearance" onClick={() => setIsDark(!isDark)} theme={theme} />
          {isVerified ? (
            <NavItem icon={<LogOut size={18}/>} label="Log out" className="text-red-500" onClick={signOut} theme={theme} />
          ) : (
            <NavItem icon={<ShieldCheck size={18}/>} label="Sign in" onClick={() => setIsAuthOpen(true)} theme={theme} />
          )}
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
              <p className="font-medium">{profile?.name || 'Guest explorer'}</p>
              <p className="inline-flex items-center justify-end gap-1"><BadgeCheck size={12} /> {isVerified ? 'Verified' : 'Explore mode'}</p>
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
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="Generated study visual" className="mb-3 max-h-80 w-full rounded-2xl object-contain" />
                    )}
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.model && <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-fuchsia-500">{msg.model}</p>}
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
                className="p-2 text-zinc-500 hover:text-indigo-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUploading}
                onClick={() => isVerified ? fileInputRef.current?.click() : setIsAuthOpen(true)}
                aria-label="Upload document"
              >
                {isUploading ? <Loader2 size={20} className="animate-spin"/> : <Paperclip size={20}/>}
              </button>
              <button
                type="button"
                className="p-2 text-zinc-500 hover:text-fuchsia-500 transition-colors"
                onClick={() => isVerified ? imageInputRef.current?.click() : setIsAuthOpen(true)}
                aria-label="Attach image reference"
              >
                <ImageIcon size={20}/>
              </button>
              <button
                type="button"
                className="hidden sm:flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-fuchsia-500"
                onClick={() => setInput(prev => prev.trim() ? prev : '/image ')}
              >
                <Wand2 size={14} /> Nano Banana
              </button>
              <input
                className="flex-1 bg-transparent border-none outline-none text-[15px] px-2"
                placeholder={chatMode === 'documents' ? 'Ask about files, key points, charts, or images...' : 'Ask anything, or describe a study visual...'}
                value={input}
                onChange={event => setInput(event.target.value)}
                onFocus={() => {
                  if (!isVerified) setIsAuthOpen(true);
                }}
                onClick={() => {
                  if (!isVerified) setIsAuthOpen(true);
                }}
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
            {referenceImageName ? `Reference image attached: ${referenceImageName}` : 'Docs, chat, study images, charts, and graphs from one prompt bar.'}
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginScreen({
  isDark,
  onClose,
  onVerified,
}: {
  isDark: boolean;
  onClose: () => void;
  onVerified: (session: UserSession, profile: UserProfile) => void;
}) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    age: '',
    role: 'Student',
    goal: '',
  });
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'contact' | 'otp'>('contact');
  const [message, setMessage] = useState('Explore Rook AI, then verify by email or mobile when you are ready to chat.');
  const [isLoading, setIsLoading] = useState(false);

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage('Sending verification code through Supabase...');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, channel, profile }),
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
        body: JSON.stringify({ email, phone, channel, otp, profile }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) throw new Error(data.error || 'Verification failed.');

      onVerified({ ...data.user, token: data.token }, data.profile || profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center px-6 backdrop-blur-md transition-colors", isDark ? "bg-[#09090b]/90 text-zinc-100" : "bg-slate-50/90 text-slate-950")}>
      <button
        onClick={onClose}
        className={cn("absolute right-6 top-6 p-3 rounded-full border transition-colors", isDark ? "border-zinc-800 hover:bg-zinc-900" : "border-slate-200 bg-white hover:bg-slate-100")}
        aria-label="Close verification"
      >
        <X size={18} />
      </button>
      <div className={cn("w-full max-w-md rounded-2xl border p-8 shadow-2xl", isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-200")}>
        <div className="mb-8">
          <div className="mb-5 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 text-white">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Rook AI Login</h1>
          <p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>{message}</p>
        </div>

        {step === 'contact' ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Name
                <input
                  className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
                  required
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
            </div>
            <label className="space-y-2 text-sm font-medium block">
              Account title
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
            <div className={cn("grid grid-cols-2 rounded-xl border p-1 text-sm font-semibold", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}>
              <button type="button" className={cn("rounded-lg px-3 py-2", channel === 'email' && "bg-indigo-600 text-white")} onClick={() => setChannel('email')}>
                Email OTP
              </button>
              <button type="button" className={cn("rounded-lg px-3 py-2", channel === 'sms' && "bg-indigo-600 text-white")} onClick={() => setChannel('sms')}>
                SMS OTP
              </button>
            </div>
            <label className="block text-sm font-medium" htmlFor={channel === 'email' ? 'email' : 'phone'}>
              {channel === 'email' ? 'Email address' : 'Mobile number'}
            </label>
            <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}>
              {channel === 'email' ? <Mail size={18} className="text-indigo-500" /> : <Phone size={18} className="text-indigo-500" />}
              {channel === 'email' ? (
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  placeholder="you@example.com"
                />
              ) : (
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  placeholder="+94771234567"
                />
              )}
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
            <button type="button" className="w-full text-sm text-indigo-500" onClick={() => setStep('contact')}>
              Change verification method
            </button>
          </form>
        )}
      </div>
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
