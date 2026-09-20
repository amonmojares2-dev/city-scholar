import { useState } from 'react';
import Icon from '../../components/Icon';

const sections = [
  {
    id: 'general',
    title: 'General Provisions',
    content: [
      { heading: '1.1 Purpose', text: 'This guideline governs the implementation, administration, and management of the City Scholarship Program as mandated by City Ordinance No. 2019-045.' },
      { heading: '1.2 Coverage', text: 'These guidelines cover all scholarship grants administered by the City Scholarship Office (CSO), including the Academic Excellence Scholarship, Deserving Student Program, Technical-Vocational Scholarship, Graduate Studies Scholarship, and Special Programs.' },
      { heading: '1.3 Implementing Body', text: 'The City Scholarship Office, under the Office of the Mayor, shall be responsible for the implementation, monitoring, and evaluation of all scholarship programs covered by these guidelines.' },
    ],
  },
  {
    id: 'obligations',
    title: "Scholar's Obligations",
    content: [
      { heading: '2.1 Academic Performance', text: 'All scholars must maintain the required minimum GWA per scholarship program per academic term. Failure to maintain the required GWA shall result in suspension of the scholarship grant pending evaluation.' },
      { heading: '2.2 Residency', text: 'Scholars must remain residents of the city throughout the duration of the scholarship. Transfer of residency must be immediately reported to the CSO.' },
      { heading: '2.3 Event Attendance', text: 'Scholars are required to attend city-organized scholarship events, orientations, recognition ceremonies, and at least two (2) community service activities per year. Proof of attendance must be submitted through the portal.' },
      { heading: '2.4 Renewal', text: 'Scholarship grants are not automatic. Scholars must complete the renewal process within the prescribed period. Renewal requirements include updated academic records, proof of enrollment, and updated personal information.' },
    ],
  },
  {
    id: 'benefits',
    title: 'Benefits and Allowances',
    content: [
      { heading: '3.1 Tuition Assistance', text: 'Scholarship grants cover tuition and miscellaneous fees up to the amount specified per program. Fees exceeding the scholarship grant shall be shouldered by the scholar.' },
      { heading: '3.2 Monthly Allowance', text: 'All active scholars receive a monthly living allowance as specified in their grant certificate. Allowance is disbursed monthly through the city\'s designated disbursement channels.' },
      { heading: '3.3 Book Allowance', text: 'A book and supplies allowance is provided at the beginning of each academic term. Receipts or proof of purchase may be required.' },
      { heading: '3.4 Non-transferability', text: 'Scholarship benefits are personal and non-transferable. Any attempt to transfer or share scholarship benefits shall result in immediate cancellation.' },
    ],
  },
  {
    id: 'grounds',
    title: 'Grounds for Cancellation',
    content: [
      { heading: '4.1 Academic Failure', text: 'Failure to maintain the required GWA for two consecutive terms, or any failing grade in a major subject, without valid reason, constitutes grounds for scholarship cancellation.' },
      { heading: '4.2 Misconduct', text: 'Any act of dishonesty, misconduct, or violation of school policies, including academic dishonesty, shall result in immediate scholarship suspension and investigation.' },
      { heading: '4.3 Duplicate Grants', text: 'Receiving scholarship benefits from two or more government-funded scholarship programs simultaneously is strictly prohibited and shall result in immediate cancellation and recovery of improperly received grants.' },
      { heading: '4.4 Misrepresentation', text: 'Submission of fraudulent documents, false information, or misrepresentation in any part of the application or renewal process shall result in permanent disqualification from all city scholarship programs.' },
    ],
  },
  {
    id: 'appeals',
    title: 'Appeals and Complaints',
    content: [
      { heading: '5.1 Right to Appeal', text: 'Any applicant or scholar who disagrees with a decision by the CSO has the right to file a formal appeal within fifteen (15) calendar days from the date of notification.' },
      { heading: '5.2 Appeal Process', text: 'Appeals must be filed in writing through the scholarship portal or in person at the CSO. The appeal must state the grounds for appeal and attach supporting documents.' },
      { heading: '5.3 Resolution', text: 'The CSO shall resolve all appeals within thirty (30) calendar days. The decision of the CSO Review Committee shall be final and executory unless elevated to the City Mayor\'s Office.' },
    ],
  },
];

export default function GuidelinesPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [expanded, setExpanded] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="py-12">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Official Document</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>Scholarship Guidelines</h1>
          <p className="text-[#6B7280] max-w-lg mx-auto text-sm">City Scholarship Program Implementing Guidelines | AY 2025–2026</p>
        </div>

        <div className="flex gap-6">
          {/* TOC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-20 bg-white rounded-2xl border border-[#E5E7EB] p-4">
              <div className="text-xs font-700 text-[#6B7280] uppercase tracking-wide mb-3" style={{ fontWeight: 700 }}>Contents</div>
              <ul className="space-y-1">
                {sections.map(s => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveSection(s.id)}
                      className={`text-left w-full text-sm px-3 py-2 rounded-lg transition-colors ${
                        activeSection === s.id
                          ? 'bg-[#0B1F3A] text-white font-600'
                          : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F6F7F9]'
                      }`}
                      style={{ fontWeight: activeSection === s.id ? 600 : 400 }}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 space-y-4">
            {sections.map(section => (
              <div key={section.id} id={section.id} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <button
                  onClick={() => { setActiveSection(section.id); toggleExpand(section.id); }}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#F6F7F9] transition-colors"
                >
                  <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{section.title}</h2>
                  <Icon
                    name="chevron-down"
                    size={16}
                    className={`text-[#6B7280] transition-transform ${expanded.includes(section.id) || activeSection === section.id ? 'rotate-180' : ''}`}
                  />
                </button>
                {(expanded.includes(section.id) || activeSection === section.id) && (
                  <div className="px-6 pb-6 border-t border-[#E5E7EB] space-y-5">
                    {section.content.map(item => (
                      <div key={item.heading} className="pt-5">
                        <h3 className="font-600 text-sm text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>{item.heading}</h3>
                        <p className="text-sm text-[#6B7280] leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
