import { Outlet, Link, useLocation } from 'react-router';
import { useState } from 'react';
import Icon from '../components/Icon';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Eligibility & Requirements', path: '/eligibility' },
  { label: 'How to Apply', path: '/how-to-apply' },
  { label: 'Guidelines', path: '/guidelines' },
];

const suggestions = [
  'What documents do I need?',
  'How do I apply?',
  'Am I eligible?',
  'How do I renew?',
];

const autoReplies: Record<string, string> = {
  'What documents do I need?': 'To apply, you will need: PSA Birth Certificate, Certificate of Residency, Transcript of Records, Certificate of Good Moral Character, Income Tax Return or Certificate of Indigency, Enrollment Certificate, and two government-issued IDs. All files must be in PDF or image format, max 5MB each.',
  'How do I apply?': 'To apply: (1) Check your eligibility on the Eligibility page, (2) Create an account via Login / Register, (3) Complete your scholar profile, (4) Upload all required documents, (5) Submit your application. You can track your status anytime through your Student Dashboard.',
  'Am I eligible?': 'General eligibility requires: Filipino citizenship, city residency for at least 2 years, no other active government scholarship, and good moral standing. Academic requirements vary by program — GWA 1.75 for Academic Excellence, GWA 2.25 for Deserving Student Program. Visit the Eligibility page for full details.',
  'How do I renew?': 'Log in to your Student Portal and go to the Renewal section. Upload updated documents including your latest grades, enrollment certificate, and residency proof. Submit before the deadline. Renewal is not automatic — you must complete it each academic year.',
};

interface Message {
  role: 'user' | 'ai';
  text: string;
}

function getTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hi! I'm the City Scholarship AI Assistant. Ask me anything about scholarships, eligibility, or the application process." },
  ]);

  const sendMessage = (text: string) => {
    const reply = autoReplies[text] ?? "For detailed or case-specific inquiries, please contact the City Scholarship Office at (02) 8123-4567 or scholarship@citymail.gov.ph.";
    setMessages(prev => [...prev, { role: 'user', text }, { role: 'ai', text: reply }]);
    setInput('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <nav className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] shadow-sm">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0B1F3A] rounded-lg flex items-center justify-center">
              <span className="text-[#D4A72C] font-800 text-sm" style={{ fontWeight: 800 }}>CS</span>
            </div>
            <div>
              <div className="text-[#0B1F3A] font-700 text-sm leading-tight" style={{ fontWeight: 700 }}>City Scholarship</div>
              <div className="text-[#6B7280] text-xs leading-tight">Management System</div>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === link.path
                    ? 'text-[#0B1F3A] font-600 bg-[#F6F7F9]'
                    : 'text-[#6B7280] hover:text-[#0B1F3A] hover:bg-[#F6F7F9]'
                }`}
                style={{ fontWeight: pathname === link.path ? 600 : 400 }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-600 rounded-lg hover:bg-[#163A63] transition-colors"
              style={{ fontWeight: 600 }}
            >
              Login / Register
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#1F2937]"
            >
              <Icon name={mobileOpen ? 'x' : 'menu'} size={20} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-[#E5E7EB] bg-white px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm ${
                  pathname === link.path ? 'text-[#0B1F3A] font-600 bg-[#F6F7F9]' : 'text-[#6B7280] hover:text-[#0B1F3A]'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="block mt-2 px-3 py-2 bg-[#0B1F3A] text-white text-sm font-600 rounded-lg text-center"
            >
              Login / Register
            </Link>
          </div>
        )}
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* AI Assistant floating widget */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

        {/* Chat popup */}
        {chatOpen && (
          <div
            className="w-[360px] bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] flex flex-col overflow-hidden"
            style={{ height: '480px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#0B1F3A] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D4A72C] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#0B1F3A] font-800 text-[10px]" style={{ fontWeight: 800 }}>AI</span>
                </div>
                <div>
                  <div className="text-sm font-700 text-white leading-tight" style={{ fontWeight: 700 }}>Scholarship Assistant</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-white/50 leading-tight">
                    <span className="w-1.5 h-1.5 bg-[#22A06B] rounded-full" />
                    Online · Available 24/7
                  </div>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F6F7F9]">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'ai' && (
                    <div className="w-6 h-6 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#D4A72C] font-800" style={{ fontWeight: 800, fontSize: 8 }}>AI</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'ai'
                        ? 'bg-white text-[#1F2937] border border-[#E5E7EB] rounded-tl-none shadow-sm'
                        : 'bg-[#0B1F3A] text-white rounded-tr-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            <div className="px-3 py-2 bg-white border-t border-[#E5E7EB] flex flex-wrap gap-1.5 flex-shrink-0">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-2.5 py-1 text-[10px] bg-[#F6F7F9] border border-[#E5E7EB] text-[#163A63] rounded-full hover:border-[#163A63] hover:bg-[#163A63]/5 transition-colors font-500"
                  style={{ fontWeight: 500 }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-2 bg-white flex gap-2 items-center flex-shrink-0">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && input.trim() && (e.preventDefault(), sendMessage(input))}
                className="flex-1 px-3 py-2 rounded-xl border border-[#E5E7EB] text-xs focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] placeholder-[#9CA3AF]"
                placeholder="Type your question..."
              />
              <button
                onClick={() => input.trim() && sendMessage(input)}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-xl bg-[#0B1F3A] flex items-center justify-center text-white hover:bg-[#163A63] transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Icon name="send" size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 ${
            chatOpen ? 'bg-[#163A63]' : 'bg-[#0B1F3A] hover:bg-[#163A63]'
          } text-white`}
          aria-label={chatOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
        >
          <div className="w-7 h-7 rounded-xl bg-[#D4A72C] flex items-center justify-center flex-shrink-0">
            <span className="text-[#0B1F3A] font-800 text-[10px]" style={{ fontWeight: 800 }}>AI</span>
          </div>
          <div className="text-left">
            <div className="text-xs font-700 leading-tight" style={{ fontWeight: 700 }}>AI Assistant</div>
            <div className="text-[10px] text-white/50 leading-tight">{chatOpen ? 'Click to close' : 'Ask me anything'}</div>
          </div>
          <Icon name={chatOpen ? 'chevron-down' : 'chevron-right'} size={14} className="text-white/60 ml-0.5" />
        </button>
      </div>

      <footer className="bg-[#0B1F3A] text-white">
        <div className="max-w-[1280px] mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-[#D4A72C] rounded-lg flex items-center justify-center">
                  <span className="text-[#0B1F3A] font-800 text-sm" style={{ fontWeight: 800 }}>CS</span>
                </div>
                <div>
                  <div className="font-700 text-sm" style={{ fontWeight: 700 }}>City Scholarship</div>
                  <div className="text-white/60 text-xs">Management System</div>
                </div>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">
                Empowering students through accessible, transparent scholarship management.
              </p>
            </div>
            <div>
              <h4 className="font-600 text-sm mb-3" style={{ fontWeight: 600 }}>Quick Links</h4>
              <ul className="space-y-2">
                {navLinks.map(l => (
                  <li key={l.path}>
                    <Link to={l.path} className="text-sm text-white/60 hover:text-white transition-colors">{l.label}</Link>
                  </li>
                ))}
                <li>
                  <button onClick={() => { setChatOpen(true); window.scrollTo({ top: 0 }); }} className="text-sm text-white/60 hover:text-white transition-colors">
                    AI Assistant
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-600 text-sm mb-3" style={{ fontWeight: 600 }}>Scholarship Office</h4>
              <div className="space-y-2 text-sm text-white/60">
                <div className="flex items-start gap-2"><Icon name="map-pin" size={14} className="mt-0.5 flex-shrink-0" /><span>City Hall, 2nd Floor, Room 210<br />Scholarship Office</span></div>
                <div className="flex items-center gap-2"><Icon name="phone" size={14} /><span>(02) 8123-4567</span></div>
                <div className="flex items-center gap-2"><Icon name="mail" size={14} /><span>scholarship@citymail.gov.ph</span></div>
              </div>
            </div>
            <div>
              <h4 className="font-600 text-sm mb-3" style={{ fontWeight: 600 }}>Office Hours</h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Monday – Friday</p>
                <p className="font-500" style={{ fontWeight: 500 }}>8:00 AM – 5:00 PM</p>
                <p className="mt-2">Saturdays</p>
                <p className="font-500" style={{ fontWeight: 500 }}>8:00 AM – 12:00 PM</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/40">© 2026 City Scholarship Management System. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className="hover:text-white/70 cursor-pointer">Privacy Policy</span>
              <span className="hover:text-white/70 cursor-pointer">Terms of Use</span>
              <span className="hover:text-white/70 cursor-pointer">Accessibility</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
