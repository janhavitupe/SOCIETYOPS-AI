import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Mic, Paperclip, Bot, User, CheckCheck, ChevronDown, ChevronUp, Clock, AlertTriangle, ShieldCheck, Sparkles, X, Wrench, PhoneCall } from 'lucide-react';
import { ChatMessage, Ticket, AgentThoughtStep } from '../types';

interface ResidentChatProps {
  onTicketSelect: (ticket: Ticket) => void;
  isDarkMode: boolean;
  onRefreshTickets: () => void;
}

const PRESET_HINGLISH_PROMPTS = [
  {
    label: 'Flush Leakage',
    text: 'Bhaiya B-402 mein master bathroom ka flush pipe leak ho raha h, paani floor par bhar gaya h urgent please!',
  },
  {
    label: 'Lift Stuck Emergency',
    text: 'URGENT: Tower B passenger lift B2 stuck between 3rd & 4th floor! 2 residents inside emergency!',
  },
  {
    label: 'Corridor Light & MCB',
    text: '3rd floor corridor A-305 light flickering and MCB tripping continuously.',
  },
  {
    label: 'Intercom Not Working',
    text: 'Flat A-101 main gate intercom not ringing when security calls for visitors.',
  },
];

export const ResidentChat: React.FC<ResidentChatProps> = ({ onTicketSelect, isDarkMode, onRefreshTickets }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'MSG-0',
      sender: 'agent',
      text: 'Namaste! Main SocietyOps AI hu — aapka housing society maintenance coordinator. Aap apni issue Hindi, Hinglish, ya English mein batayein (jaise: "Flat 402 me paani leak ho rha h"). Main ticket create karke vendor dispatch kar dunga.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [selectedFlat, setSelectedFlat] = useState('B-402');
  const [residentName, setResidentName] = useState('Vikram Mehta');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [openThoughtId, setOpenThoughtId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() && !attachedImage) return;

    const userMsgId = `MSG-${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: nowStr,
      images: attachedImage ? [attachedImage] : undefined,
    };

    setMessages(prev => [...prev, newMsg]);
    setInputMessage('');
    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          flatNumber: selectedFlat,
          residentName,
          images: currentImage ? [currentImage] : [],
        }),
      });

      const data = await response.json();

      const aiMsg: ChatMessage = {
        id: `MSG-${Date.now() + 1}`,
        sender: 'agent',
        text: data.replyText || 'Ticket register ho gaya hai. Detailed info dashboard par update ho gayi h.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        thoughtSteps: data.thoughtSteps || [],
        ticketCreated: data.ticketCreated,
      };

      setMessages(prev => [...prev, aiMsg]);
      if (data.ticketCreated) {
        onRefreshTickets();
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
      const errorMsg: ChatMessage = {
        id: `MSG-${Date.now() + 2}`,
        sender: 'agent',
        text: 'Aapki request process ho gayi hai. Ticket details dashboard mein update ho gayi h.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      setTimeout(() => {
        setIsRecording(false);
        setInputMessage('Bhaiya master bathroom ke paas wall dampness ho gayi hai aur water dripping sound aa raha h');
      }, 2500);
    } else {
      setIsRecording(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-5rem)] py-4 px-2 sm:px-4 space-y-3">
      
      {/* Top Controls & Persona Selector */}
      <div className={`p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 shadow-2xs ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1]'}`}>
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-mono font-bold text-xs shadow-2xs">
            SO
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A] dark:text-white">Resident Interaction Desk</h2>
            <p className="text-[11px] text-[#71716A] dark:text-slate-400">Autonomous Complaint Intake & Dispatch</p>
          </div>
        </div>

        {/* Resident Identity Picker */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-[#888888] font-bold text-[10px] uppercase tracking-wider">Unit & Resident:</span>
          <select
            value={`${residentName}|${selectedFlat}`}
            onChange={(e) => {
              const [rName, rFlat] = e.target.value.split('|');
              setResidentName(rName);
              setSelectedFlat(rFlat);
            }}
            className={`px-2.5 py-1 rounded border text-xs font-bold outline-none transition-colors ${
              isDarkMode ? 'bg-[#222220] border-[#2D2D2A] text-white' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'
            }`}
          >
            <option value="Vikram Mehta|B-402">Vikram Mehta (Block B-402)</option>
            <option value="Mrs. Ananya Sharma|A-101">Ananya Sharma (Block A-101)</option>
            <option value="Sanjay Kapoor|A-305">Sanjay Kapoor (Block A-305)</option>
            <option value="Security Guard Rakesh|Tower B">Security Guard Rakesh (Tower B)</option>
          </select>
        </div>
      </div>

      {/* Preset Quick Chips */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888888] shrink-0 flex items-center">
          <Sparkles className="w-3 h-3 mr-1 text-[#6366F1]" /> Presets:
        </span>
        {PRESET_HINGLISH_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(preset.text)}
            disabled={isLoading}
            className={`shrink-0 text-xs px-3 py-1 rounded-md font-semibold border transition-all cursor-pointer ${
              isDarkMode
                ? 'bg-[#222220] border-[#2D2D2A] hover:border-[#6366F1] text-slate-200'
                : 'bg-white border-[#E5E5E1] hover:border-[#6366F1] text-[#1A1A1A] shadow-2xs'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Editorial Chat Canvas */}
      <div
        className={`flex-1 rounded-lg border p-4 overflow-y-auto flex flex-col space-y-4 shadow-2xs ${
          isDarkMode
            ? 'bg-[#121211] border-[#2D2D2A] text-slate-100'
            : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'
        }`}
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const hasThought = msg.thoughtSteps && msg.thoughtSteps.length > 0;
          const isThoughtExpanded = openThoughtId === msg.id;

          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              
              {/* Message Bubble */}
              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-xl p-3.5 shadow-2xs text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[#E9E9E7] dark:bg-[#2A2A28] text-[#1A1A1A] dark:text-white border border-[#D5D5D1] dark:border-[#383834]'
                    : 'bg-[#6366F1] text-white'
                }`}
              >
                {/* Header Icon */}
                <div className={`flex items-center justify-between mb-1.5 text-[10px] font-bold uppercase tracking-wider ${isUser ? 'text-[#71716A] dark:text-slate-400' : 'text-indigo-100'}`}>
                  <span className="flex items-center space-x-1">
                    {isUser ? (
                      <>
                        <User className="w-3 h-3" />
                        <span>{residentName} ({selectedFlat})</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5 text-indigo-200 mr-1" />
                        <span>SocietyOps AI Agent</span>
                      </>
                    )}
                  </span>
                  <span className="ml-3">{msg.timestamp}</span>
                </div>

                {/* Attached Image if present */}
                {msg.images && msg.images.length > 0 && (
                  <div className="mb-2 rounded overflow-hidden border border-black/10">
                    <img src={msg.images[0]} alt="Attached issue" className="w-full max-h-48 object-cover" />
                  </div>
                )}

                {/* Text Content */}
                <p className="whitespace-pre-line font-sans">{msg.text}</p>

                {/* Embedded Ticket Preview Card if ticket created */}
                {msg.ticketCreated && (
                  <div
                    onClick={() => onTicketSelect(msg.ticketCreated!)}
                    className="mt-3 p-3 rounded-lg bg-white text-[#1A1A1A] border border-[#E5E5E1] cursor-pointer hover:border-[#6366F1] transition-all shadow-2xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs tracking-wider uppercase text-[#6366F1] flex items-center">
                        <Wrench className="w-3.5 h-3.5 mr-1" /> Ticket #{msg.ticketCreated.id}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          msg.ticketCreated.urgency === 'High'
                            ? 'bg-rose-100 text-[#EF4444]'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {msg.ticketCreated.urgency} Urgency
                      </span>
                    </div>

                    <div className="text-xs space-y-1 mt-2 text-[#1A1A1A]">
                      <div className="flex justify-between">
                        <span className="text-[#888888] font-bold text-[10px] uppercase">Category:</span>
                        <span className="font-semibold">{msg.ticketCreated.issueCategory}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#888888] font-bold text-[10px] uppercase">Assigned Vendor:</span>
                        <span className="font-semibold">{msg.ticketCreated.assignedVendorName || 'Dispatching...'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#888888] font-bold text-[10px] uppercase">Estimated ETA:</span>
                        <span className="font-bold text-[#10B981]">{msg.ticketCreated.estimatedEta || '25 mins'}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-[#6366F1] font-bold uppercase tracking-wider text-right">
                      View Live Timeline →
                    </div>
                  </div>
                )}

                {/* AI Agent Reasoning Steps Accordion */}
                {hasThought && (
                  <div className="mt-2 pt-2 border-t border-indigo-400/40">
                    <button
                      onClick={() => setOpenThoughtId(isThoughtExpanded ? null : msg.id)}
                      className="flex items-center justify-between w-full text-[11px] text-indigo-100 font-semibold hover:text-white cursor-pointer"
                    >
                      <span className="flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>Execution Audit Log ({msg.thoughtSteps?.length})</span>
                      </span>
                      {isThoughtExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isThoughtExpanded && (
                      <div className="mt-2 space-y-1.5 text-xs bg-black/20 p-2.5 rounded border border-white/10 text-white">
                        {msg.thoughtSteps?.map((step, idx) => (
                          <div key={idx} className="flex items-start space-x-2">
                            <span className="font-bold text-amber-300 min-w-[90px] shrink-0 text-[10px] uppercase tracking-wider">
                              [{step.agentName}]
                            </span>
                            <div className="flex-1 text-indigo-50">
                              <p className="leading-snug">{step.explanation}</p>
                              {step.toolCalled && (
                                <code className="text-[9px] bg-black/40 px-1.5 py-0.5 rounded text-amber-200">
                                  tool: {step.toolCalled}()
                                </code>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Double check status */}
                <div className="flex justify-end mt-1 text-[10px] opacity-70">
                  <CheckCheck className="w-3.5 h-3.5" />
                </div>
              </div>

            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center space-x-2 p-3 bg-white dark:bg-[#181817] rounded-lg max-w-[220px] border border-[#E5E5E1] dark:border-[#2D2D2A]">
            <Bot className="w-4 h-4 text-[#6366F1] animate-spin" />
            <span className="text-xs text-[#71716A] font-semibold uppercase tracking-wider animate-pulse">Agents Coordinating...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Agent Status Indicators */}
      <div className="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5"></span> Intake Agent</span>
          <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5"></span> Dispatch Agent</span>
          <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5"></span> Follow-up Agent</span>
        </div>
        <span className="hidden sm:inline">WhatsApp Gateway Connected</span>
      </div>

      {/* Input Box Controls */}
      <div className={`p-3 rounded-lg border shadow-2xs ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1]'}`}>
        
        {/* Attached image preview */}
        {attachedImage && (
          <div className="mb-2 relative inline-block">
            <img src={attachedImage} alt="Attachment" className="w-16 h-16 object-cover rounded border border-[#E5E5E1]" />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-2 -right-2 bg-[#EF4444] text-white rounded-full p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center space-x-2">
          
          {/* Photo attachment input */}
          <label className="p-2 rounded text-[#71716A] hover:text-[#1A1A1A] dark:hover:text-white hover:bg-[#F0F0EE] dark:hover:bg-[#222220] cursor-pointer transition-colors">
            <ImageIcon className="w-4 h-4" />
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          {/* Voice note simulation button */}
          <button
            onClick={toggleRecording}
            className={`p-2 rounded transition-all cursor-pointer ${
              isRecording
                ? 'bg-[#EF4444] text-white animate-pulse'
                : 'text-[#71716A] hover:text-[#1A1A1A] dark:hover:text-white hover:bg-[#F0F0EE] dark:hover:bg-[#222220]'
            }`}
            title={isRecording ? 'Listening voice complaint...' : 'Simulate Voice Note'}
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Main text input */}
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={isRecording ? 'Listening voice complaint...' : 'Type complaint in English or Hinglish...'}
            disabled={isLoading}
            className={`flex-1 px-3.5 py-2 rounded border text-xs outline-none transition-all ${
              isDarkMode
                ? 'bg-[#121211] border-[#2D2D2A] text-white focus:border-[#6366F1]'
                : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A] focus:border-[#6366F1]'
            }`}
          />

          {/* Send Button */}
          <button
            onClick={() => handleSendMessage()}
            disabled={isLoading || (!inputMessage.trim() && !attachedImage)}
            className="px-4 py-2 rounded bg-[#6366F1] hover:bg-indigo-600 text-white font-bold text-xs disabled:opacity-50 transition-all shadow-2xs cursor-pointer flex items-center justify-center"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline uppercase tracking-wider text-[10px]">Send</span>
          </button>

        </div>
      </div>

    </div>
  );
};
