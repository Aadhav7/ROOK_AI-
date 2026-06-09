import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Bot, User, Moon, Sun, Plus, LogOut, Sparkles, Paperclip, Palette, Loader2,
  Mail, ShieldCheck, Image as ImageIcon, Wand2, Globe2, BookOpen, BadgeCheck, Phone,
  X, Pin, PinOff, FolderPlus, MessageSquare, Trash2, Search, Shield, Library
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const API_BASE_URL = import.meta.env.VITE_ROOK_API_URL || '/api';
const TOKEN_KEY = 'rook_ai_token';
const CONTACT_KEY = 'rook_ai_contact';
const PROFILE_KEY = 'rook_ai_profile';
const HISTORY_KEY = 'rook_ai_private_history';
const FOLDERS_KEY = 'rook_ai_private_folders';

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

type ChatSession = {
  id: string;
  title: string;
  folder: string;
  pinned: boolean;
  updatedAt: number;
  messages: Message[];
};

const FAQ_TOPICS = [
  'account verification', 'email OTP', 'SMS OTP', 'Ollama brain setup', 'Gemini image generation',
  'Nano Banana prompts', 'document search', 'AnythingLLM workspace', 'private chat history',
  'pinned chats', 'folder organization', 'deployment readiness', 'API key security',
  'MongoDB logging', 'Supabase auth', 'fast local answers', 'study diagrams', 'reference images',
  'fallback engines', 'mobile number format'
];

const FAQ_BANK = Array.from({ length: 1200 }, (_, index) => {
  const topic = FAQ_TOPICS[index % FAQ_TOPICS.length];
  return {
    id: index + 1,
    question: `FAQ ${index + 1}: How does Rook AI handle ${topic}?`,
    answer: `Rook AI handles ${topic} through verified access, local-first UI state, and a backend route that prefers the configured AI engine while keeping secrets on the server.`,
  };
});

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function now() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseStoredProfile(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as UserProfile;
  } catch {
    return null;
  }
}

function welcomeMessage(profile: UserProfile | null): Message {
  return {
    role: 'assistant',
    content: profile
      ? `Hey ${profile.name}! I am ready with private history, folders, pins, document chat, Ollama thinking, and Nano Banana visuals.`
      : 'Explore Rook AI freely. When you chat or attach media, I will ask for email or SMS verification.',
    time: now(),
  };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

function deriveTitle(messages: Message[]) {
  const firstUser = messages.find(message => message.role === 'user')?.content.trim();
  return firstUser ? firstUser.slice(0, 42) : 'Private chat';
}

async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

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
  const storedSessions = loadJson<ChatSession[]>(HISTORY_KEY, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<UserSession | null>(
    savedToken && savedContact ? { token: savedToken, email: savedContact.includes('@') ? savedContact : undefined, phone: savedContact.includes('@') ? undefined : savedContact } : null
  );
  const [profile, setProfile] = useState<UserProfile | null>(savedProfile);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(storedSessions);
  const [folders, setFolders] = useState<string[]>(loadJson<string[]>(FOLDERS_KEY, ['Study', 'Projects', 'Ideas']));
  const [currentChatId, setCurrentChatId] = useState(storedSessions[0]?.id || uid());
  const [messages, setMessages] = useState<Message[]>(storedSessions[0]?.messages?.length ? storedSessions[0].messages : [welcomeMessage(savedProfile)]);
  const [input, setInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
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
    panel: isDark ? 'bg-zinc-900/85 border-zinc-800' : 'bg-white border-slate-200',
    muted: isDark ? 'text-zinc-500' : 'text-slate-500',
    navHover: isDark ? 'hover:bg-zinc-800/60 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950',
    headerBorder: isDark ? 'border-zinc-800/50' : 'border-slate-200',
    assistantBubble: isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 text-slate-900',
    userAvatar: isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-slate-200 border-slate-300 text-slate-900',
  };

  const authHeaders: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
  const isVerified = Boolean(user && profile);
  const isBusy = isSending || isGeneratingImage;

  const filteredFaq = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || q.length < 2) return FAQ_BANK.slice(0, 6);
    return FAQ_BANK.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(q)).slice(0, 8);
  }, [input]);

  const visibleSessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return chatSessions
      .filter(session => !q || `${session.title} ${session.folder}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [chatSessions, historySearch]);

  useEffect(() => {
    setChatSessions(prev => {
      const nextSession: ChatSession = {
        id: currentChatId,
        title: deriveTitle(messages),
        folder: prev.find(session => session.id === currentChatId)?.folder || 'Study',
        pinned: prev.find(session => session.id === currentChatId)?.pinned || false,
        updatedAt: Date.now(),
        messages,
      };
      const next = [nextSession, ...prev.filter(session => session.id !== currentChatId)].slice(0, 80);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [currentChatId, messages]);

  useEffect(() => {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);

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

  const startNewChat = () => {
    setCurrentChatId(uid());
    setMessages([welcomeMessage(profile)]);
    setInput('');
    setStatus('Ready');
  };

  const openSession = (session: ChatSession) => {
    setCurrentChatId(session.id);
    setMessages(session.messages);
  };

  const patchSession = (id: string, patch: Partial<ChatSession>) => {
    setChatSessions(prev => {
      const next = prev.map(session => session.id === id ? { ...session, ...patch } : session);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const deleteSession = (id: string) => {
    setChatSessions(prev => {
      const next = prev.filter(session => session.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      if (id === currentChatId) startNewChat();
      return next;
    });
  };

  const createFolder = () => {
    const name = window.prompt('Folder name')?.trim();
    if (name && !folders.includes(name)) setFolders(prev => [...prev, name].slice(0, 12));
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
    setStatus(chatMode === 'documents' ? 'Retrieving context, then thinking with Ollama...' : 'Thinking with Ollama brain...');

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ message: question, mode: chatMode, profile }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'The backend could not answer this question.');

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'No answer returned.',
        model: data.provider,
        time: now(),
      }]);
      setStatus(data.provider ? `Ready via ${data.provider}` : 'Ready');
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
    setStatus('Generating visual with Nano Banana...');

    try {
      const response = await fetch(`${API_BASE_URL}/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt, referenceImage, mode: chatMode, profile, useWorkspaceContext: chatMode === 'documents' }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Image generation failed.');

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
    formData.append('metadata', JSON.stringify({ title: file.name, docSource: 'Rook AI chat upload' }));

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', headers: authHeaders, body: formData });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Upload failed.');

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `${file.name} was uploaded and sent to the workspace for embedding. Ask a question once processing finishes.`,
        time: now(),
      }]);
      setStatus('Document uploaded');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not upload the file.';
      setMessages(prev => [...prev, { role: 'assistant', content: `Upload failed: ${errorMessage}`, time: now() }]);
      setStatus('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("flex h-screen w-screen overflow-hidden font-sans transition-colors duration-500", theme.app)}>
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
            setMessages([{ role: 'assistant', content: `Hey ${nextProfile.name}! You are verified now. Your private history, pins, folders, and AI tools are ready.`, time: now() }]);
          }}
        />
      )}

      <aside className={cn("w-80 shrink-0 flex flex-col p-4 border-r transition-all", theme.sidebar)}>
        <div className="mb-5 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-cyan-400 p-1.5">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Rook AI <span className="ml-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-300">Ollama RAG</span></span>
          </div>
        </div>

        <button
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-cyan-600 p-3 font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:brightness-110"
          onClick={startNewChat}
        >
          <Plus size={18} /> New Chat
        </button>

        <div className={cn("mb-3 flex items-center gap-2 rounded-xl border px-3 py-2", isDark ? "border-zinc-800 bg-zinc-950" : "border-slate-200 bg-slate-50")}>
          <Search size={15} className={theme.muted} />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search private chats"
            value={historySearch}
            onChange={event => setHistorySearch(event.target.value)}
          />
          <button type="button" onClick={createFolder} className={cn("rounded-lg p-1.5", theme.navHover)} aria-label="Create folder">
            <FolderPlus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          <p className={cn("flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-widest", theme.muted)}>
            <Shield size={12}/> Private History
          </p>
          {visibleSessions.map(session => (
            <div key={session.id} className={cn("rounded-xl border p-2", session.id === currentChatId ? "border-indigo-500/40 bg-indigo-500/10" : isDark ? "border-zinc-800 bg-zinc-950/50" : "border-slate-200 bg-white")}>
              <button className="flex w-full items-start gap-2 text-left" onClick={() => openSession(session)}>
                <MessageSquare size={15} className={cn("mt-1 shrink-0", session.pinned ? "text-cyan-400" : theme.muted)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{session.title}</span>
                  <span className={cn("block truncate text-[11px]", theme.muted)}>{session.folder} - {new Date(session.updatedAt).toLocaleDateString()}</span>
                </span>
              </button>
              <div className="mt-2 flex items-center gap-1">
                <button type="button" className={cn("rounded-lg p-1.5", theme.navHover)} onClick={() => patchSession(session.id, { pinned: !session.pinned })} aria-label={session.pinned ? 'Unpin chat' : 'Pin chat'}>
                  {session.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <select
                  className={cn("min-w-0 flex-1 rounded-lg border px-2 py-1 text-[11px] outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}
                  value={session.folder}
                  onChange={event => patchSession(session.id, { folder: event.target.value })}
                >
                  {folders.map(folder => <option key={folder}>{folder}</option>)}
                </select>
                <button type="button" className={cn("rounded-lg p-1.5 text-red-400", theme.navHover)} onClick={() => deleteSession(session.id)} aria-label="Delete chat">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <p className={cn("flex items-center gap-2 px-2 pt-3 text-[10px] font-bold uppercase tracking-widest", theme.muted)}>
            <Library size={12}/> FAQ Knowledge Base
          </p>
          {filteredFaq.map(item => (
            <button
              key={item.id}
              className={cn("w-full rounded-xl border p-3 text-left transition", isDark ? "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900" : "border-slate-200 bg-white hover:bg-slate-50")}
              onClick={() => setInput(item.question)}
            >
              <span className="block text-xs font-semibold">{item.question}</span>
              <span className={cn("mt-1 line-clamp-2 block text-[11px]", theme.muted)}>{item.answer}</span>
            </button>
          ))}
        </div>

        <div className={cn("mt-4 border-t pt-4 space-y-1", isDark ? "border-zinc-800" : "border-slate-200")}>
          <NavItem icon={<Palette size={18}/>} label="Appearance" onClick={() => setIsDark(!isDark)} theme={theme} />
          {isVerified ? (
            <NavItem icon={<LogOut size={18}/>} label="Log out" className="text-red-500" onClick={signOut} theme={theme} />
          ) : (
            <NavItem icon={<ShieldCheck size={18}/>} label="Sign in" onClick={() => setIsAuthOpen(true)} theme={theme} />
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className={cn("flex items-center justify-between border-b p-4 px-8 backdrop-blur-md", theme.headerBorder)}>
          <div className="flex items-center gap-3">
            <div className={cn("h-2 w-2 rounded-full", isBusy ? "bg-cyan-400 animate-pulse" : "bg-green-500")} />
            <div>
              <span className="text-sm font-semibold">{chatMode === 'documents' ? 'Document Chat' : 'General Chat'}</span>
              <p className={cn("text-[11px]", theme.muted)}>{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn("flex rounded-full border p-1 text-xs", isDark ? "border-zinc-800 bg-zinc-950" : "border-slate-200 bg-white")}>
              <button className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold transition", chatMode === 'documents' ? "bg-indigo-600 text-white" : theme.muted)} onClick={() => setChatMode('documents')}>
                <BookOpen size={13} /> Docs
              </button>
              <button className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold transition", chatMode === 'general' ? "bg-indigo-600 text-white" : theme.muted)} onClick={() => setChatMode('general')}>
                <Globe2 size={13} /> General
              </button>
            </div>
            <div className={cn("hidden text-right text-xs sm:block", theme.muted)}>
              <p className="font-medium">{profile?.name || 'Guest explorer'}</p>
              <p className="inline-flex items-center justify-end gap-1"><BadgeCheck size={12} /> {isVerified ? 'Verified' : 'Explore mode'}</p>
            </div>
            <button onClick={() => setIsDark(!isDark)} className={cn("rounded-full p-2 transition-all", theme.navHover)} aria-label="Toggle theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={`${msg.time}-${i}`} className={cn("flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn("flex max-w-[74%] gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", msg.role === 'assistant' ? "bg-gradient-to-br from-indigo-600 to-cyan-500 border-cyan-300/50 text-white" : theme.userAvatar)}>
                  {msg.role === 'assistant' ? <Bot size={20}/> : <User size={20}/>}
                </div>
                <div className={cn("space-y-1", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn("rounded-3xl border p-4 shadow-xl", msg.role === 'user' ? "rounded-tr-none bg-indigo-600 text-white border-indigo-500" : `${theme.assistantBubble} rounded-tl-none`)}>
                    {msg.imageUrl && <img src={msg.imageUrl} alt="Generated study visual" className="mb-3 max-h-80 w-full rounded-2xl object-contain" />}
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{msg.content}</p>
                    {msg.model && <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">{msg.model}</p>}
                  </div>
                  <p className={cn("px-2 text-[10px]", theme.muted)}>{msg.time}</p>
                </div>
              </div>
            </div>
          ))}
          {isBusy && <ThinkingSignal isDark={isDark} label={isGeneratingImage ? 'Rendering study visual' : 'Routing context through the AI brain'} />}
        </div>

        <div className="p-8 pt-0">
          <form onSubmit={sendMessage} className={cn("mx-auto max-w-4xl rounded-[28px] border p-2 shadow-2xl backdrop-blur-xl transition-all", theme.panel)}>
            <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-3 py-2">
              <input ref={fileInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
              <input ref={imageInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) readReferenceImage(file); }} />
              <ToolbarButton disabled={isUploading} onClick={() => isVerified ? fileInputRef.current?.click() : setIsAuthOpen(true)} label="Upload document">
                {isUploading ? <Loader2 size={19} className="animate-spin"/> : <Paperclip size={19}/>}
              </ToolbarButton>
              <ToolbarButton onClick={() => isVerified ? imageInputRef.current?.click() : setIsAuthOpen(true)} label="Attach reference image">
                <ImageIcon size={19}/>
              </ToolbarButton>
              <input
                className="min-w-0 bg-transparent px-2 text-[15px] outline-none"
                placeholder={chatMode === 'documents' ? 'Ask about files, key points, charts, or images...' : 'Ask anything, or start with /image...'}
                value={input}
                onChange={event => setInput(event.target.value)}
                onFocus={() => { if (!isVerified) setIsAuthOpen(true); }}
                onClick={() => { if (!isVerified) setIsAuthOpen(true); }}
              />
              <div className="flex items-center gap-2">
                <ToolbarButton onClick={() => setInput(prev => prev.trim() ? prev : '/image ')} label="Nano Banana prompt">
                  <Wand2 size={18}/>
                </ToolbarButton>
                <button type="submit" className="rounded-full bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-500/40 transition-all hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSending || !input.trim()} aria-label="Send message">
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} fill="currentColor" />}
                </button>
              </div>
            </div>
          </form>
          <p className={cn("mt-4 flex items-center justify-center gap-2 text-center text-[10px] uppercase tracking-widest opacity-70", theme.muted)}>
            {referenceImageName ? `Reference image attached: ${referenceImageName}` : `Private local history active. ${FAQ_BANK.length}+ FAQ entries indexed.`}
          </p>
        </div>
      </main>
    </div>
  );
}

function ThinkingSignal({ isDark, label }: { isDark: boolean; label: string }) {
  return (
    <div className={cn("ml-14 inline-flex items-center gap-4 rounded-2xl border px-4 py-3", isDark ? "border-cyan-400/20 bg-cyan-400/5" : "border-cyan-200 bg-cyan-50")}>
      <div className="rook-neural-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className={cn("text-[11px]", isDark ? "text-zinc-500" : "text-slate-500")}>Context, memory, and model routing are synchronizing.</p>
      </div>
    </div>
  );
}

function ToolbarButton({ children, label, disabled, onClick }: { children: ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
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
  const [profile, setProfile] = useState<UserProfile>({ name: '', age: '', role: 'Student', goal: '' });
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'contact' | 'otp'>('contact');
  const [message, setMessage] = useState('Verify by email or mobile. Development OTPs print in the backend terminal until a real provider webhook is configured.');
  const [isLoading, setIsLoading] = useState(false);

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(channel === 'sms' ? 'Sending verification code through the SMS gateway...' : 'Sending verification code through email...');

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
      <button onClick={onClose} className={cn("absolute right-6 top-6 rounded-full border p-3 transition-colors", isDark ? "border-zinc-800 hover:bg-zinc-900" : "border-slate-200 bg-white hover:bg-slate-100")} aria-label="Close verification">
        <X size={18} />
      </button>
      <div className={cn("w-full max-w-md rounded-2xl border p-8 shadow-2xl", isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-200")}>
        <div className="mb-8">
          <div className="mb-5 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 p-3 text-white">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Rook AI Verification</h1>
          <p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>{message}</p>
        </div>

        {step === 'contact' ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Name
                <input className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")} required value={profile.name} onChange={event => setProfile(prev => ({ ...prev, name: event.target.value }))} placeholder="Your name" />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Age
                <input className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")} value={profile.age} onChange={event => setProfile(prev => ({ ...prev, age: event.target.value }))} placeholder="18" />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              Account title
              <select className={cn("w-full rounded-xl border px-4 py-3 outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")} value={profile.role} onChange={event => setProfile(prev => ({ ...prev, role: event.target.value }))}>
                <option>Student</option>
                <option>Working professional</option>
                <option>Founder</option>
                <option>Researcher</option>
                <option>Other</option>
              </select>
            </label>
            <div className={cn("grid grid-cols-2 rounded-xl border p-1 text-sm font-semibold", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}>
              <button type="button" className={cn("rounded-lg px-3 py-2", channel === 'email' && "bg-indigo-600 text-white")} onClick={() => setChannel('email')}>Email OTP</button>
              <button type="button" className={cn("rounded-lg px-3 py-2", channel === 'sms' && "bg-indigo-600 text-white")} onClick={() => setChannel('sms')}>SMS OTP</button>
            </div>
            <label className="block text-sm font-medium" htmlFor={channel === 'email' ? 'email' : 'phone'}>
              {channel === 'email' ? 'Email address' : 'Mobile number'}
            </label>
            <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")}>
              {channel === 'email' ? <Mail size={18} className="text-indigo-500" /> : <Phone size={18} className="text-indigo-500" />}
              {channel === 'email' ? (
                <input id="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full bg-transparent outline-none" placeholder="you@example.com" />
              ) : (
                <input id="phone" type="tel" required value={phone} onChange={event => setPhone(event.target.value)} className="w-full bg-transparent outline-none" placeholder="+94771234567" />
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
            <input id="otp" inputMode="numeric" required minLength={6} maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className={cn("w-full rounded-xl border px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] outline-none", isDark ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-slate-50")} placeholder="000000" />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60" disabled={isLoading || otp.length !== 6}>
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              Verify and continue
            </button>
            <button type="button" className="w-full text-sm text-indigo-500" onClick={() => setStep('contact')}>Change verification method</button>
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
    <div onClick={onClick} className={cn("group flex cursor-pointer items-center gap-3 rounded-xl p-3 text-sm font-medium text-zinc-500 transition-all", theme.navHover, className)}>
      <span className="transition-transform group-hover:scale-110">{icon}</span>
      {label}
    </div>
  );
}
