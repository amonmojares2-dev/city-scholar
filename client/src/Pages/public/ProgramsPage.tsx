import { useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';

const programs = [
  {
    id: 1,
    name: 'Academic Excellence Scholarship',
    description: 'For graduating students with outstanding academic performance from any city barangay. Covers full tuition, allowances, and book stipends.',
    eligibility: ['GPA 1.75 or higher', 'City resident for at least 2 years', 'Undergraduate enrollment', 'Not a grantee of other government scholarships'],
    period: 'June 1 – July 31, 2025',
    status: 'active' as const,
    slots: 150,
    benefit: '₱30,000/semester',
    category: 'Academic',
  },
  {
    id: 2,
    name: 'Deserving Student Program',
    description: 'Supporting financially challenged but academically capable students pursuing higher education in the city.',
    eligibility: ['Annual family income ≤ ₱250,000', 'GPA 2.25 or higher', 'City resident', 'First-time college entrant or continuing scholar'],
    period: 'June 1 – July 31, 2025',
    status: 'active' as const,
    slots: 300,
    benefit: '₱25,000/semester',
    category: 'Financial Need',
  },
  {
    id: 3,
    name: 'Technical-Vocational Scholarship',
    description: 'Full support for students enrolled in TESDA-accredited technical-vocational courses leading to NC certifications.',
    eligibility: ['TESDA-accredited program enrollment', 'City resident', 'No age limit', 'Not employed'],
    period: 'June 1 – August 15, 2025',
    status: 'active' as const,
    slots: 200,
    benefit: '₱15,000/term',
    category: 'TVET',
  },
  {
    id: 4,
    name: 'Graduate Studies Scholarship',
    description: 'Supporting city residents pursuing master\'s or doctoral degrees at accredited universities.',
    eligibility: ['Accepted to a graduate program', 'Bachelor\'s degree with honors', 'City resident for 3+ years', 'Commitment to serve the city after graduation'],
    period: 'August 1 – September 30, 2025',
    status: 'upcoming' as const,
    slots: 30,
    benefit: '₱50,000/semester',
    category: 'Graduate',
  },
  {
    id: 5,
    name: 'Persons with Disability Scholarship',
    description: 'Dedicated scholarship program for city residents with disabilities pursuing any level of higher education.',
    eligibility: ['PWD ID holder', 'City resident', 'Any accredited program', 'Recommendation from MSWD'],
    period: 'June 1 – August 31, 2025',
    status: 'active' as const,
    slots: 50,
    benefit: '₱25,000/semester',
    category: 'Special',
  },
  {
    id: 6,
    name: "Indigenous People's Scholarship",
    description: 'Supporting indigenous community members in pursuing higher education while preserving cultural heritage.',
    eligibility: ['IP community member', 'Certificate from NCIP', 'City resident', 'High school graduate'],
    period: 'Closed for AY 2024–2025',
    status: 'closed' as const,
    slots: 0,
    benefit: '₱20,000/semester',
    category: 'Special',
  },
];

export default function ProgramsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<typeof programs[0] | null>(null);

  const filtered = programs.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="py-12">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>City Scholarship Office</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>Scholarship Programs</h1>
          <p className="text-[#6B7280] max-w-lg mx-auto text-sm">Explore all available scholarship programs. Find the one that matches your profile and start your application today.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] bg-white"
              placeholder="Search scholarship programs..."
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'upcoming', 'closed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-xl text-sm font-600 border transition-colors ${
                  filter === f ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#163A63]'
                }`}
                style={{ fontWeight: 600 }}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(prog => (
            <div key={prog.id} className="bg-white rounded-2xl border border-[#E5E7EB] p-6 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#F6F7F9] flex items-center justify-center">
                  <Icon name="award" size={18} className="text-[#163A63]" />
                </div>
                <StatusBadge status={prog.status} />
              </div>
              <h3 className="font-700 text-[#1F2937] mb-2" style={{ fontWeight: 700 }}>{prog.name}</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed mb-4 flex-1">{prog.description}</p>
              <div className="space-y-2 mb-4 py-4 border-t border-[#E5E7EB]">
                <div className="flex justify-between text-xs">
                  <span className="text-[#6B7280]">Benefit</span>
                  <span className="font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{prog.benefit}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#6B7280]">Application Period</span>
                  <span className="font-500 text-[#1F2937] text-right" style={{ fontWeight: 500 }}>{prog.period}</span>
                </div>
                {prog.slots > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7280]">Available Slots</span>
                    <span className="font-600 text-[#163A63]" style={{ fontWeight: 600 }}>{prog.slots}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(prog)}
                className="flex items-center justify-center gap-2 py-2.5 border border-[#0B1F3A] text-[#0B1F3A] rounded-xl text-sm font-600 hover:bg-[#0B1F3A] hover:text-white transition-colors"
                style={{ fontWeight: 600 }}
              >
                View Details
              </button>
            </div>
          ))}
        </div>

        {/* Modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between">
                <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{selected.name}</h2>
                <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                  <Icon name="x" size={16} />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs px-2 py-1 bg-[#F6F7F9] rounded-md text-[#6B7280]">{selected.category}</span>
                </div>
                <p className="text-sm text-[#6B7280] leading-relaxed">{selected.description}</p>
                <div>
                  <h4 className="font-600 text-sm text-[#1F2937] mb-3" style={{ fontWeight: 600 }}>Eligibility Requirements</h4>
                  <ul className="space-y-2">
                    {selected.eligibility.map(e => (
                      <li key={e} className="flex items-start gap-2.5 text-sm text-[#6B7280]">
                        <Icon name="check-circle" size={14} className="text-[#22A06B] flex-shrink-0 mt-0.5" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 bg-[#F6F7F9] rounded-xl">
                  <div>
                    <div className="text-xs text-[#6B7280] mb-1">Benefit per Semester</div>
                    <div className="font-700 text-[#0B1F3A]" style={{ fontWeight: 700 }}>{selected.benefit}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B7280] mb-1">Available Slots</div>
                    <div className="font-700 text-[#0B1F3A]" style={{ fontWeight: 700 }}>{selected.slots || 'Closed'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-[#6B7280] mb-1">Application Period</div>
                    <div className="font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{selected.period}</div>
                  </div>
                </div>
                {selected.status === 'active' && (
                  <Link
                    to="/login"
                    className="flex items-center justify-center gap-2 py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm w-full"
                    style={{ fontWeight: 700 }}
                  >
                    Apply Now
                    <Icon name="arrow-right" size={16} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
