import React, { useState } from 'react';
import { 
  Send, Bot, User, Moon, Sun, Plus, MessageSquare, 
  Settings, LogOut, UserCircle, Search, Sparkles, 
  Paperclip, Image as ImageIcon, Heart, Bell, Clock, Palette, HelpCircle 
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export default function RookAI() {
  const [messages, setMessages] = useState([
    { role: 'user', content: 'How will AI transform healthcare?', time: '2:34 PM' },
    { role: 'assistant', content: 'AI is revolutionizing healthcare in numerous ways: Disease Diagnosis, Drug Discovery, and Personalized Treatment.', time: '2:35 PM' }
  ]);
  const [isDark, setIsDark] = useState(true);
  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <div className={cn(
      "flex h-screen w-full font-sans transition-colors duration-500",
      isDark ? "bg-[#09090b] text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      
      {/* SIDEBAR - Exactly like the image */}
      <aside className={cn(
        "w-72 flex flex-col p-4 border-r transition-all",
        isDark ? "bg-[#0c0c0e] border-zinc-800" : "bg-white border-zinc-200"
      )}>
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded-lg">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Rook AI <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded ml-1 border border-indigo-500/30">PRO</span></span>
          </div>
        </div>

        <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white p-3 rounded-xl mb-6 shadow-lg shadow-indigo-500/20 transition-all font-medium">
          <Plus size={18} /> New Chat
        </button>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input 
            className={cn("w-full pl-10 pr-4 py-2 rounded-xl text-sm border focus:outline-none transition-all", 
              isDark ? "bg-zinc-900/50 border-zinc-800 focus:border-indigo-500" : "bg-zinc-100 border-zinc-200")} 
            placeholder="Search conversations..." 
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
          <p className="text-[10px] font-bold text-zinc-500 px-2 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Clock size={12}/> Recent
          </p>
          {['The Future of AI', 'Quantum Computing', 'Space Exploration'].map((chat, i) => (
            <div key={i} className={cn("group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all", 
              i === 0 ? (isDark ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-indigo-50") : "hover:bg-zinc-800/50")}>
              <MessageSquare size={16} className={i === 0 ? "text-indigo-500" : "text-zinc-500"} />
              <div className="flex-1 truncate">
                <p className="text-sm font-medium">{chat}</p>
                <p className="text-[11px] text-zinc-500 truncate">How will AI shape the future...</p>
              </div>
            </div>
          ))}
        </div>

        {/* Upgrade Card */}
        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 relative overflow-hidden group">
           <div className="relative z-10">
              <p className="text-sm font-bold flex items-center gap-2"><Sparkles size={14} className="text-yellow-400"/> Upgrade to Pro</p>
              <p className="text-[11px] text-zinc-400 mt-1 mb-3">Unlock unlimited chats & advanced models.</p>
              <button className="w-full py-2 bg-indigo-600 text-xs rounded-lg font-bold hover:bg-indigo-500 transition-all">Upgrade Now</button>
           </div>
           <Bot className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform" size={80} />
        </div>

        {/* Footer Navigation */}
        <div className="mt-6 pt-4 border-t border-zinc-800 space-y-1">
          <NavItem icon={<Settings size={18}/>} label="Settings" />
          <NavItem icon={<Palette size={18}/>} label="Appearance" onClick={() => setIsDark(!isDark)} />
          <NavItem icon={<HelpCircle size={18}/>} label="Help & Support" />
          <NavItem icon={<LogOut size={18}/>} label="Log out" className="text-red-400" />
        </div>
      </aside>

      {/* MAIN CHAT WINDOW */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />
        
        <header className="flex items-center justify-between p-4 px-8 border-b border-zinc-800/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
             <span className="font-semibold text-sm">The Future of AI</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsDark(!isDark)} className="p-2 hover:bg-zinc-800 rounded-full transition-all">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
               <div className="text-right">
                  <p className="text-[11px] font-bold">Bavan Rook</p>
                  <p className="text-[9px] text-indigo-400 uppercase tracking-tighter">Premium User</p>
               </div>
               <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-zinc-800" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-4 max-w-[70%]", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border", 
                  msg.role === 'assistant' ? "bg-indigo-600 border-indigo-400" : "bg-zinc-800 border-zinc-700")}>
                  {msg.role === 'assistant' ? <Bot size={20}/> : <User size={20}/>}
                </div>
                <div className={cn("space-y-1", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn("p-4 rounded-3xl shadow-xl", 
                    msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-zinc-900 border border-zinc-800 rounded-tl-none")}>
                    <p className="text-[14px] leading-relaxed">{msg.content}</p>
                  </div>
                  <p className="text-[10px] text-zinc-500 px-2">{msg.time}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 text-zinc-500 text-sm italic ml-14">
             <Bot size={14}/>
             <span>AI is typing<span className="animate-bounce inline-block">.</span><span className="animate-bounce delay-100 inline-block">.</span><span className="animate-bounce delay-200 inline-block">.</span></span>
          </div>
        </div>

        {/* INPUT AREA - Centered Floating Style */}
        <div className="p-8 pt-0">
          <div className={cn("max-w-4xl mx-auto rounded-[32px] p-2 transition-all shadow-2xl border backdrop-blur-xl", 
            isDark ? "bg-zinc-900/80 border-zinc-800 focus-within:border-indigo-500" : "bg-white border-zinc-200")}>
            <div className="flex items-center gap-2 px-4 py-2">
              <button className="p-2 text-zinc-500 hover:text-indigo-500 transition-colors"><Paperclip size={20}/></button>
              <button className="p-2 text-zinc-500 hover:text-indigo-500 transition-colors"><ImageIcon size={20}/></button>
              <input 
                className="flex-1 bg-transparent border-none outline-none text-[15px] px-2" 
                placeholder="Type your message..." 
              />
              <button className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-lg shadow-indigo-500/40 transition-all active:scale-95">
                <Send size={18} fill="currentColor" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-center mt-4 text-zinc-500 uppercase tracking-widest opacity-60 flex items-center justify-center gap-2">
            <HelpCircle size={10}/> AI can make mistakes. Consider checking important information.
          </p>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, className = "", onClick }: { icon: any, label: string, className?: string, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-zinc-800/50 transition-all text-sm font-medium text-zinc-400 hover:text-white group", className)}>
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      {label}
    </div>
  );
}
