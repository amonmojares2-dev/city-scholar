import { Link } from 'react-router';
import Icon from '../../components/Icon';

const stats = [
  { value: '12,847', label: 'Graduates Supported', icon: 'award' },
  { value: '3,204', label: 'Active Scholars', icon: 'users' },
  { value: '500', label: 'Slots Available', icon: 'book' },
  { value: '99.2%', label: 'Application Success Rate', icon: 'check-circle' },
];

const steps = [
  { num: '01', title: 'Check Eligibility', desc: 'Review the scholarship requirements and confirm you meet all criteria before starting your application.' },
  { num: '02', title: 'Create an Account', desc: 'Register with your basic information to access the scholarship portal and track your application.' },
  { num: '03', title: 'Submit Requirements', desc: 'Upload all required documents through the secure portal. Our system tracks every submission.' },
  { num: '04', title: 'Track Application', desc: 'Monitor your application status in real time and respond to any requests from the scholarship office.' },
];

const testimonials = [
  {
    name: 'Jasmine Reyes',
    batch: 'Scholar, 2022',
    school: 'PHINMA University of Pangasinan',
    text: "The City Scholarship changed my life. The entire process was transparent and the office was always responsive to my questions. I'm now in my third year of BS Computer Science.",
  },
  {
    name: 'Carlo Mendoza',
    batch: 'Scholar, 2021',
    school: 'University of Luzon',
    text: "Coming from a family with limited income, I never thought college was within reach. This scholarship didn't just cover tuition — it gave me confidence and a future.",
  },
  {
    name: 'Liana Torres',
    batch: 'Scholar, 2023',
    school: 'Systems Technology Institute College',
    text: "I completed my course and landed a job immediately after. The portal made renewals easy and I always knew what documents I needed.",
  },
];

const announcements = [
  {
    tag: 'Application Open',
    date: 'May 28, 2025',
    title: 'Scholarship Applications Now Open for AY 2025–2026',
    excerpt: 'The City Scholarship Office is pleased to announce that applications are now open until July 31, 2025.',
  },
  {
    tag: 'Reminder',
    date: 'May 20, 2025',
    title: 'Document Submission Deadline Extended to June 15',
    excerpt: 'Due to high demand, the document submission deadline for continuing scholars has been extended.',
  },
  {
    tag: 'Event',
    date: 'May 15, 2025',
    title: 'Scholarship Orientation Seminar – June 5, 2025',
    excerpt: 'All new applicants are encouraged to attend the online orientation seminar on scholarship guidelines and requirements.',
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative bg-[#0B1F3A] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, #D4A72C 0%, transparent 50%), radial-gradient(circle at 80% 20%, #163A63 0%, transparent 60%)',
          }} />
        </div>
        <div className="absolute inset-0 opacity-5">
          <img
            src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1440&h=700&fit=crop&auto=format"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-[1280px] mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#D4A72C]/20 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4A72C]" />
              <span className="text-[#F8E7A8] text-xs font-600" style={{ fontWeight: 600 }}>AY 2025–2026 Applications Now Open</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-800 leading-tight mb-5" style={{ fontWeight: 800 }}>
              Empowering Students.<br />
              <span className="text-[#D4A72C]">Building Brighter Futures.</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-lg">
              The City Scholarship Program connects deserving students with educational opportunities. Transparent, accessible, and student-focused.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/eligibility"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#D4A72C] text-[#0B1F3A] font-700 rounded-xl hover:bg-[#F8E7A8] transition-colors text-sm"
                style={{ fontWeight: 700 }}
              >
                Check Eligibility
                <Icon name="arrow-right" size={16} />
              </Link>
              <Link
                to="/how-to-apply"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 text-white font-600 rounded-xl hover:bg-white/20 transition-colors text-sm border border-white/20"
                style={{ fontWeight: 600 }}
              >
                How to Apply
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-[1280px] mx-auto px-6 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map(stat => (
              <div key={stat.label} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-[#F6F7F9] flex items-center justify-center mx-auto mb-3">
                  <Icon name={stat.icon} size={18} className="text-[#163A63]" />
                </div>
                <div className="text-2xl lg:text-3xl font-800 text-[#0B1F3A] mb-1" style={{ fontWeight: 800 }}>{stat.value}</div>
                <div className="text-sm text-[#6B7280]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About the Scholarship */}
      <section className="bg-[#F6F7F9] py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-3" style={{ fontWeight: 600 }}>City Scholarship Program</div>
              <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A] mb-4" style={{ fontWeight: 800 }}>One Scholarship. Countless Opportunities.</h2>
              <p className="text-[#6B7280] leading-relaxed mb-5">
                The City Scholarship Program is a government-funded initiative that provides full financial support to qualified residents pursuing higher education. It covers tuition, allowances, and book stipends for approved scholars.
              </p>
              <div className="space-y-3 mb-6">
                {[
                  { icon: 'check-circle', text: 'Covers tuition and miscellaneous fees' },
                  { icon: 'check-circle', text: 'Monthly living allowance for active scholars' },
                  { icon: 'check-circle', text: 'Annual renewal for continuing scholars' },
                  { icon: 'check-circle', text: 'Open to city residents pursuing undergraduate studies' },
                ].map(item => (
                  <div key={item.text} className="flex items-center gap-3 text-sm text-[#1F2937]">
                    <Icon name={item.icon} size={16} className="text-[#22A06B] flex-shrink-0" />
                    {item.text}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 text-center">
                  <div className="font-800 text-[#0B1F3A] text-lg" style={{ fontWeight: 800 }}>₱30,000</div>
                  <div className="text-xs text-[#6B7280]">per semester</div>
                </div>
                <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 text-center">
                  <div className="font-800 text-[#0B1F3A] text-lg" style={{ fontWeight: 800 }}>500</div>
                  <div className="text-xs text-[#6B7280]">available slots</div>
                </div>
                <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 text-center">
                  <div className="font-800 text-[#D97706] text-lg" style={{ fontWeight: 800 }}>Jul 31</div>
                  <div className="text-xs text-[#6B7280]">application deadline</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[#D4A72C] flex items-center justify-center flex-shrink-0">
                    <Icon name="award" size={20} className="text-[#0B1F3A]" />
                  </div>
                  <div>
                    <div className="font-700 text-sm" style={{ fontWeight: 700 }}>City Scholarship Program</div>
                    <div className="text-white/50 text-xs">AY 2025–2026 · Now Open</div>
                  </div>
                  <span className="ml-auto px-2.5 py-1 bg-green-500/20 text-green-400 text-xs font-600 rounded-full" style={{ fontWeight: 600 }}>● Open</span>
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Application Period', value: 'June 1 – July 31, 2025' },
                    { label: 'Minimum GWA', value: '2.25 or higher' },
                    { label: 'Residency Requirement', value: 'City resident, 2+ years' },
                    { label: 'Available Slots', value: '500 scholars' },
                    { label: 'Benefit', value: '₱30,000 per semester' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-2 border-b border-white/10 last:border-0">
                      <span className="text-white/50">{row.label}</span>
                      <span className="font-600 text-white" style={{ fontWeight: 600 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/eligibility"
                  className="flex items-center justify-center gap-2 mt-5 py-2.5 bg-[#D4A72C] text-[#0B1F3A] rounded-xl text-sm font-700 hover:bg-[#F8E7A8] transition-colors"
                  style={{ fontWeight: 700 }}
                >
                  Check if You Qualify
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Simple Process</div>
            <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>How to Apply in 4 Steps</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={step.num} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-[calc(100%-12px)] w-6 h-0.5 bg-[#E5E7EB] z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] flex items-center justify-center mb-4">
                    <span className="text-[#D4A72C] font-800 text-sm" style={{ fontWeight: 800 }}>{step.num}</span>
                  </div>
                  <h3 className="font-700 text-[#1F2937] mb-2" style={{ fontWeight: 700 }}>{step.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm"
              style={{ fontWeight: 700 }}
            >
              Start Your Application
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-[#F6F7F9] py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="text-center mb-10">
            <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Scholar Stories</div>
            <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>Lives Changed Through Scholarship</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map(t => (
              <div key={t.name} className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-[#D4A72C] text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm text-[#1F2937] leading-relaxed mb-5 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700" style={{ fontWeight: 700 }}>
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="text-xs text-[#6B7280]">{t.batch} · {t.school}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Announcements */}
      <section className="bg-white py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Latest Updates</div>
              <h2 className="text-2xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>Announcements</h2>
            </div>
          </div>
          <div className="space-y-4">
            {announcements.map(ann => (
              <div key={ann.title} className="flex gap-5 p-5 rounded-2xl border border-[#E5E7EB] hover:border-[#163A63]/20 hover:shadow-sm transition-all">
                <div className="w-1 rounded-full bg-[#D4A72C] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="px-2 py-0.5 bg-[#0B1F3A]/5 text-[#163A63] text-xs font-600 rounded-md" style={{ fontWeight: 600 }}>{ann.tag}</span>
                    <span className="text-xs text-[#6B7280]">{ann.date}</span>
                  </div>
                  <h3 className="font-600 text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>{ann.title}</h3>
                  <p className="text-sm text-[#6B7280]">{ann.excerpt}</p>
                </div>
                <Icon name="chevron-right" size={16} className="text-[#6B7280] flex-shrink-0 self-center" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0B1F3A] py-16">
        <div className="max-w-[1280px] mx-auto px-6 text-center">
          <div className="w-14 h-14 bg-[#D4A72C] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Icon name="award" size={26} className="text-[#0B1F3A]" />
          </div>
          <h2 className="text-2xl lg:text-3xl font-800 text-white mb-4" style={{ fontWeight: 800 }}>
            Begin Your Scholarship Journey Today
          </h2>
          <p className="text-white/60 text-base max-w-lg mx-auto mb-8">
            Thousands of students from our city have taken the first step. Your education matters — and we're here to help make it possible.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/login?tab=register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#D4A72C] text-[#0B1F3A] font-700 rounded-xl hover:bg-[#F8E7A8] transition-colors text-sm"
              style={{ fontWeight: 700 }}
            >
              Apply Now
              <Icon name="arrow-right" size={16} />
            </Link>
            <Link
              to="/eligibility"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 text-white font-600 rounded-xl hover:bg-white/20 transition-colors text-sm border border-white/20"
              style={{ fontWeight: 600 }}
            >
              Check Eligibility
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
