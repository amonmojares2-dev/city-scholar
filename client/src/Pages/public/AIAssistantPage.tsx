import { useState } from 'react';
import Icon from '../../components/Icon';

interface Message {
  role: 'user' | 'ai';
  text: string;
  time: string;
}

const suggestions = [
  'What documents do I need to apply?',
  'How do I check my application status?',
  'Am I eligible for the scholarship?',
  'How do I renew my scholarship?',
  'When is the application deadline?',
  'What is the scholarship benefit amount?',
];

const autoReplies: Record<string, string> = {
  'What documents do I need to apply?': `To apply for the City Scholarship, you will need to prepare the following documents:\n\n• Accomplished Application Form (downloadable from the portal)\n• Certificate of Residency from your Barangay\n• Latest Income Tax Return or Certificate of Indigency\n• PSA-authenticated Birth Certificate\n• Certified True Copy of Grades / Transcript of Records\n• Certificate of Good Moral Character\n• Two (2) government-issued IDs\n• School Enrollment Certificate\n\nAll documents must be clear and uploaded in PDF or image format (max 5MB each). Need more details about any specific document?`,
  'How do I check my application status?': `Checking your application status is easy!\n\n1. Log in to your Student Portal at the scholarship website\n2. Your current status is displayed on your Dashboard\n3. You can also click on "Scholar Profile" for detailed information\n\nApplication statuses include: Draft, Submitted, Under Review, Additional Requirements Needed, Approved, or Rejected.\n\nYou will also receive email notifications whenever your status changes. Is there a specific status you'd like me to explain?`,
  'Am I eligible for the scholarship?': `Eligibility depends on the specific scholarship program you're interested in. Generally, you must:\n\n✓ Be a Filipino citizen\n✓ Be a city resident for at least 2 years\n✓ Not be a recipient of any other government scholarship\n✓ Be of good moral character\n\nFor Academic Excellence: GWA of 1.75 or higher is required.\nFor Deserving Student Program: GWA of 2.25 or higher, plus family income ≤ ₱250,000/year.\nFor Technical-Vocational: Senior high school completion required.\n\nWould you like me to help you check eligibility for a specific program?`,
  'How do I renew my scholarship?': `Scholarship renewal must be completed each academic year. Here's how:\n\n1. Log in to your Student Portal\n2. Go to the "Renewal" section in your sidebar\n3. Check the list of renewal requirements\n4. Upload updated documents (grades, enrollment, IDs)\n5. Review and submit your renewal application\n\nImportant: Renewal is not automatic. You must maintain the required GWA and submit all requirements within the renewal period.\n\nRenewal period for AY 2025–2026 is May 1 – June 30, 2025. Do you need help with specific renewal requirements?`,
  'When is the application deadline?': `Current application deadlines for AY 2025–2026:\n\n• Academic Excellence Scholarship: July 31, 2025\n• Deserving Student Program: July 31, 2025\n• Technical-Vocational Scholarship: August 15, 2025\n• Graduate Studies Scholarship: September 30, 2025 (opens August 1)\n• PWD Scholarship: August 31, 2025\n\nI recommend applying as early as possible to avoid last-minute document issues. Applications are processed on a first-come, first-served basis within the available slots. Shall I help you with the application process?`,
  'What is the scholarship benefit amount?': `Here are the benefit amounts for each scholarship program:\n\n• Academic Excellence: ₱30,000 per semester\n  (Includes tuition + ₱5,000 allowance)\n• Deserving Student Program: ₱25,000 per semester\n  (Includes tuition + ₱4,000 allowance)\n• Technical-Vocational: ₱15,000 per term\n• Graduate Studies: ₱50,000 per semester\n• PWD Scholarship: ₱25,000 per semester\n\nNote: Benefits are subject to annual review and may be adjusted based on city budget allocations. A book allowance is provided at the start of each term. Would you like to know more about the application process for any specific program?`,
};

function getTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: "Hello! I'm the City Scholarship AI Assistant. I can help you with questions about scholarship programs, eligibility, requirements, application process, and more.\n\nHow can I assist you today?",
      time: getTime(),
    },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = (text: string) => {
    const userMsg: Message = { role: 'user', text, time: getTime() };
    const aiReply: Message = {
      role: 'ai',
      text: autoReplies[text] || "Thank you for your question! For specific inquiries not covered by my knowledge base, please contact the City Scholarship Office directly at (02) 8123-4567 or scholarship@citymail.gov.ph.\n\nOffice hours are Monday–Friday, 8:00 AM – 5:00 PM.",
      time: getTime(),
    };
    setMessages(prev => [...prev, userMsg, aiReply]);
    setInput('');
  };

  return (
    <div className="py-12">
      <div className="max-w-[900px] mx-auto px-6">
        <div className="text-center mb-8">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>AI-Powered</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>Scholarship Assistant</h1>
          <p className="text-[#6B7280] max-w-md mx-auto text-sm">Get instant answers about scholarship programs, requirements, and the application process.</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E5E7EB] bg-[#F6F7F9]">
            <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
              <span className="text-[#D4A72C] font-800 text-xs" style={{ fontWeight: 800 }}>AI</span>
            </div>
            <div>
              <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>City Scholarship Assistant</div>
              <div className="flex items-center gap-1.5 text-xs text-[#22A06B]">
                <span className="w-1.5 h-1.5 bg-[#22A06B] rounded-full" />
                Online · Available 24/7
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="h-[420px] overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#D4A72C] font-800 text-[9px]" style={{ fontWeight: 800 }}>AI</span>
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'ai'
                      ? 'bg-[#F6F7F9] text-[#1F2937] rounded-tl-none'
                      : 'bg-[#0B1F3A] text-white rounded-tr-none'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-[#9CA3AF] px-1">{msg.time}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          <div className="px-5 py-3 border-t border-[#E5E7EB] bg-[#F6F7F9]">
            <p className="text-xs text-[#6B7280] mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 text-xs bg-white border border-[#E5E7EB] text-[#163A63] rounded-full hover:border-[#163A63] hover:bg-[#163A63]/5 transition-colors font-500"
                  style={{ fontWeight: 500 }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-[#E5E7EB] flex gap-3 items-end">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && input.trim() && (e.preventDefault(), sendMessage(input))}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] placeholder-[#9CA3AF] resize-none"
              placeholder="Type your question here..."
            />
            <button
              onClick={() => input.trim() && sendMessage(input)}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center text-white hover:bg-[#163A63] transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>

        <div className="mt-5 p-4 bg-[#F8E7A8] border border-[#D4A72C]/30 rounded-xl flex gap-3">
          <Icon name="info" size={16} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B7280]">
            This AI Assistant provides general information only. For official decisions and specific case inquiries, please contact the City Scholarship Office at (02) 8123-4567 or visit us at City Hall, Room 210.
          </p>
        </div>
      </div>
    </div>
  );
}
