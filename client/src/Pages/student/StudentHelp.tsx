import { useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';

const faqs = [
  { q: 'When is the scholarship application deadline?', a: 'Application deadlines vary per program. The Academic Excellence and Deserving Student Programs close on July 31, 2025. Check the Scholarship Programs page for program-specific deadlines.' },
  { q: 'What happens if I miss the document submission deadline?', a: 'Late submissions are not accepted. However, you may contact the City Scholarship Office to request a deadline extension with a valid reason and supporting documentation.' },
  { q: 'How do I check my GWA requirement?', a: 'Log in to your Student Portal and navigate to Scholar Profile > Academic Information. Your current GWA is displayed there. For more details, check with your school registrar.' },
  { q: 'Can I apply for multiple scholarships?', a: 'No. City scholarship recipients are not allowed to hold any other government scholarship simultaneously. You may only apply for one city scholarship program per academic year.' },
  { q: 'How long does the application review take?', a: 'The review process typically takes 2–4 weeks from the date of complete document submission. You will receive notifications via email and through your portal dashboard.' },
];

export default function StudentHelp() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div>
      <PageHeader
        title="Help Center"
        subtitle="Find answers to common questions and contact information"
        breadcrumb={['Student Portal', 'Help Center']}
      />

      <div className="relative mb-8">
        <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-[#E5E7EB] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Search help articles..." />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[
          { icon: 'book', label: 'Guidelines', desc: 'Official scholarship policies', link: '/guidelines' },
          { icon: 'message-square', label: 'AI Assistant', desc: 'Get instant answers', link: '/ai-assistant' },
          { icon: 'mail', label: 'Contact Office', desc: 'Email or call us', link: '#contact' },
        ].map(card => (
          <Link key={card.label} to={card.link}
            className="bg-white rounded-2xl border border-[#E5E7EB] p-5 hover:shadow-sm transition-shadow flex items-center gap-4">
            <div className="w-10 h-10 bg-[#F6F7F9] rounded-xl flex items-center justify-center">
              <Icon name={card.icon} size={18} className="text-[#163A63]" />
            </div>
            <div>
              <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{card.label}</div>
              <div className="text-xs text-[#6B7280]">{card.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <h3 className="font-700 text-[#1F2937] mb-4" style={{ fontWeight: 700 }}>Frequently Asked Questions</h3>
      <div className="space-y-3 mb-8">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
            <button onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-[#F6F7F9] transition-colors">
              <span className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{faq.q}</span>
              <Icon name="chevron-down" size={16} className={`text-[#6B7280] flex-shrink-0 ml-4 transition-transform ${expanded === i ? 'rotate-180' : ''}`} />
            </button>
            {expanded === i && (
              <div className="px-5 pb-4 pt-1 border-t border-[#E5E7EB]">
                <p className="text-sm text-[#6B7280] leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div id="contact" className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
        <h3 className="font-700 mb-4" style={{ fontWeight: 700 }}>Contact Information</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: 'phone', label: 'Phone', value: '(02) 8123-4567' },
            { icon: 'mail', label: 'Email', value: 'scholarship@citymail.gov.ph' },
            { icon: 'map-pin', label: 'Address', value: 'City Hall, Room 210, 2nd Floor' },
            { icon: 'calendar', label: 'Office Hours', value: 'Mon–Fri 8AM–5PM, Sat 8AM–12PM' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3">
              <Icon name={item.icon} size={16} className="text-[#D4A72C] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-white/40">{item.label}</div>
                <div className="text-sm text-white/80 font-500" style={{ fontWeight: 500 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
