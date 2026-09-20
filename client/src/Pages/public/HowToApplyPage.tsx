import { Link } from 'react-router';
import Icon from '../../components/Icon';

const steps = [
  {
    num: '01',
    title: 'Check Eligibility',
    desc: 'Review the eligibility criteria for each scholarship program. Make sure you meet the academic, residency, and financial requirements before proceeding.',
    icon: 'check-circle',
    tips: ['Read all requirements carefully', 'Prepare supporting documents in advance', 'Contact the office if you have questions'],
    link: '/eligibility',
    linkLabel: 'Check Eligibility Now',
  },
  {
    num: '02',
    title: 'Create an Account',
    desc: 'Register through the scholarship portal using your email address. You will receive a verification email before you can proceed.',
    icon: 'user-plus',
    tips: ['Use a valid and accessible email', 'Keep your password secure', 'Verify your email immediately after registration'],
    link: '/login',
    linkLabel: 'Register Now',
  },
  {
    num: '03',
    title: 'Complete Your Profile',
    desc: 'Fill in all required personal, academic, and contact information accurately. Inaccurate information may result in disqualification.',
    icon: 'edit',
    tips: ['Match all information with your IDs', 'Provide your barangay and school details', 'Double-check all entries before saving'],
    link: null,
    linkLabel: null,
  },
  {
    num: '04',
    title: 'Submit Requirements',
    desc: 'Upload all required documents through the secure portal. Each document must be clear, complete, and in PDF or image format.',
    icon: 'upload',
    tips: ['Scan documents at 300 DPI or higher', 'Files must not exceed 5MB each', 'All documents must be recent (within 6 months)'],
    link: null,
    linkLabel: null,
  },
  {
    num: '05',
    title: 'Application Review',
    desc: 'The City Scholarship Office will review your application and documents. You will be notified of any additional requirements.',
    icon: 'eye',
    tips: ['Review takes 2–4 weeks', 'Check your email and portal regularly', 'Respond promptly to any requests'],
    link: null,
    linkLabel: null,
  },
  {
    num: '06',
    title: 'Track Your Status',
    desc: 'Monitor your application status in real time through your student dashboard. Approved scholars will receive an official notification.',
    icon: 'bar-chart-2',
    tips: ['Status updates appear in your dashboard', 'You will receive email notifications', 'Approved scholars must attend orientation'],
    link: null,
    linkLabel: null,
  },
];

export default function HowToApplyPage() {
  return (
    <div className="py-12">
      <div className="max-w-[900px] mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Step-by-Step Guide</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>How to Apply</h1>
          <p className="text-[#6B7280] max-w-lg mx-auto text-sm">Follow these steps to complete your scholarship application. The entire process is done online through this portal.</p>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#E5E7EB] hidden md:block" />
          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={step.num} className="relative flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[#0B1F3A] flex flex-col items-center justify-center z-10 text-[#D4A72C]">
                  <Icon name={step.icon} size={20} />
                </div>
                <div className="flex-1 bg-white rounded-2xl border border-[#E5E7EB] p-6 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-700 text-[#D4A72C]" style={{ fontWeight: 700 }}>Step {step.num}</span>
                    {i === 0 && <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-600 rounded-full" style={{ fontWeight: 600 }}>Start here</span>}
                  </div>
                  <h3 className="font-700 text-[#1F2937] text-lg mb-2" style={{ fontWeight: 700 }}>{step.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed mb-4">{step.desc}</p>
                  <div className="space-y-1.5 mb-4">
                    {step.tips.map(tip => (
                      <div key={tip} className="flex items-start gap-2 text-xs text-[#6B7280]">
                        <span className="text-[#D4A72C] font-700 mt-0.5" style={{ fontWeight: 700 }}>→</span>
                        {tip}
                      </div>
                    ))}
                  </div>
                  {step.link && (
                    <Link
                      to={step.link}
                      className="inline-flex items-center gap-1.5 text-sm font-600 text-[#163A63] hover:text-[#0B1F3A]"
                      style={{ fontWeight: 600 }}
                    >
                      {step.linkLabel}
                      <Icon name="arrow-right" size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="bg-[#F6F7F9] rounded-2xl p-5 border border-[#E5E7EB]">
            <Icon name="help-circle" size={20} className="text-[#163A63] mb-3" />
            <h4 className="font-600 text-[#1F2937] mb-2" style={{ fontWeight: 600 }}>Need Help?</h4>
            <p className="text-sm text-[#6B7280] mb-3">Our AI Assistant can answer your questions anytime, or contact the scholarship office directly.</p>
            <Link to="/ai-assistant" className="text-sm font-600 text-[#163A63] hover:text-[#0B1F3A]" style={{ fontWeight: 600 }}>
              Ask the AI Assistant →
            </Link>
          </div>
          <div className="bg-[#0B1F3A] rounded-2xl p-5">
            <Icon name="award" size={20} className="text-[#D4A72C] mb-3" />
            <h4 className="font-600 text-white mb-2" style={{ fontWeight: 600 }}>Ready to Start?</h4>
            <p className="text-sm text-white/60 mb-3">Create your account and begin your scholarship application today.</p>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-600 text-[#D4A72C] hover:text-[#F8E7A8]" style={{ fontWeight: 600 }}>
              Apply Now →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
