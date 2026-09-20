import Icon from '../../components/Icon';

const requirements = [
  {
    category: 'General Eligibility',
    icon: 'check-circle',
    color: 'text-[#22A06B]',
    bg: 'bg-green-50',
    items: [
      'Must be a Filipino citizen',
      'Must be a resident of the city for at least two (2) consecutive years',
      'Must not be a recipient of any other government scholarship grant',
      'Must be of good moral character with no pending criminal case',
      'Must maintain satisfactory academic performance throughout the program',
    ],
  },
  {
    category: 'Academic Requirements',
    icon: 'book',
    color: 'text-[#2563EB]',
    bg: 'bg-blue-50',
    items: [
      'Must have a General Weighted Average (GWA) of 2.00 or better for the most recent term',
      'Must be enrolled or planning to enroll in a recognized educational institution',
      'For continuing scholars: No failing or incomplete grades in the previous term',
      'Must maintain satisfactory academic standing throughout the scholarship period',
    ],
  },
  {
    category: 'Residency Requirements',
    icon: 'map-pin',
    color: 'text-[#7C3AED]',
    bg: 'bg-purple-50',
    items: [
      'Valid proof of residency from the barangay where the applicant resides',
      'Household must be registered in the city\'s civil registry or equivalent',
      'Parents or guardians must also be residents of the city',
      'Residency must be continuous and verifiable for at least 2 years prior to application',
    ],
  },
  {
    category: 'Required Documents',
    icon: 'file-text',
    color: 'text-[#D97706]',
    bg: 'bg-amber-50',
    items: [
      'Accomplished Scholarship Application Form (downloadable from the portal)',
      'Certificate of Residency from the Barangay',
      'Latest Income Tax Return (ITR) or Certificate of Indigency',
      'PSA-authenticated Birth Certificate',
      'Certified True Copy of Grades / Transcript of Records',
      'Certificate of Good Moral Character from the school',
      'Two (2) government-issued IDs of the applicant',
      'School Enrollment / Prospective Enrollment Certificate',
    ],
  },
  {
    category: 'Additional Qualifications',
    icon: 'award',
    color: 'text-[#D4A72C]',
    bg: 'bg-yellow-50',
    items: [
      'Priority given to students from low-income families (below the poverty threshold)',
      'Priority given to applicants from barangays with lower scholarship representation',
      'Students with siblings currently enrolled in higher education may be prioritized',
      'Applicants enrolled in graduate or post-graduate programs may be considered on a case-by-case basis',
      'PWD and indigenous applicants may have relaxed academic requirements',
    ],
  },
];

export default function EligibilityPage() {
  return (
    <div className="py-12">
      <div className="max-w-[900px] mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Requirements</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>Eligibility & Requirements</h1>
          <p className="text-[#6B7280] max-w-lg mx-auto text-sm">Review all requirements carefully before submitting your application. Incomplete applications will not be processed.</p>
        </div>

        <div className="bg-[#F8E7A8] border border-[#D4A72C]/30 rounded-2xl p-5 mb-8 flex gap-3">
          <Icon name="alert-triangle" size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-600 text-sm text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>Important Notice</div>
            <p className="text-sm text-[#6B7280]">
              Meeting the minimum requirements does not guarantee scholarship award. All applications are subject to review and the number of available slots. The City Scholarship Office reserves the right to verify all submitted information.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {requirements.map(req => (
            <div key={req.category} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#E5E7EB]">
                <div className={`w-9 h-9 rounded-xl ${req.bg} flex items-center justify-center`}>
                  <Icon name={req.icon} size={16} className={req.color} />
                </div>
                <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{req.category}</h2>
              </div>
              <div className="px-6 py-4">
                <ul className="space-y-3">
                  {req.items.map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#6B7280]">
                      <Icon name="check" size={14} className={`${req.color} flex-shrink-0 mt-0.5`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-[#0B1F3A] rounded-2xl p-8 text-center text-white">
          <Icon name="check-circle" size={32} className="text-[#D4A72C] mx-auto mb-4" />
          <h3 className="font-700 text-lg mb-2" style={{ fontWeight: 700 }}>Ready to Apply?</h3>
          <p className="text-white/60 text-sm mb-5">Create your account to begin your scholarship application. Our system will guide you through every step.</p>
          <a href="/login?tab=register" className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4A72C] text-[#0B1F3A] font-700 rounded-xl hover:bg-[#F8E7A8] transition-colors text-sm" style={{ fontWeight: 700 }}>
            Start Application
            <Icon name="arrow-right" size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}
