import { Link } from 'react-router';
import Icon from '../../components/Icon';
import { usePublicContent } from '../../lib/publicContent';
import type { HomeStat, HomeTestimonial } from '../../lib/publicContent';

// Shipped copy. The City Office edits this content from Program Settings >
// Public pages > Home page; these values render while the request is in flight
// (or if it fails), so the landing page never appears empty.
const shippedStats: HomeStat[] = [
  { value: '12,847', label: 'Graduates Supported', icon: 'award' },
  { value: '3,204', label: 'Active Scholars', icon: 'users' },
  { value: '500', label: 'Slots Available', icon: 'book' },
  { value: '99.2%', label: 'Application Success Rate', icon: 'check-circle' },
];

const shippedSteps = [
  { num: '01', title: 'Check Eligibility', description: 'Review the scholarship requirements and confirm you meet all criteria before starting your application.' },
  { num: '02', title: 'Create an Account', description: 'Register with your basic information to access the scholarship portal and track your application.' },
  { num: '03', title: 'Submit Requirements', description: 'Upload all required documents through the secure portal. Our system tracks every submission.' },
  { num: '04', title: 'Track Application', description: 'Monitor your application status in real time and respond to any requests from the scholarship office.' },
];

const shippedTestimonials: HomeTestimonial[] = [
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

const shippedAnnouncements = [
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

// Formats a window date the way the shipped card printed it: "June 1 – July 31, 2025".
const formatDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '');
const formatRange = (from?: string | null, to?: string | null) =>
  from && to
    ? `${formatDay(from)} – ${new Date(to).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : '';

const shippedHero = {
  badge: 'AY 2025–2026 Applications Now Open',
  followWindow: true,
  titleLine1: 'Empowering Students.',
  titleLine2: 'Building Brighter Futures.',
  subtitle: 'The City Scholarship Program connects deserving students with educational opportunities. Transparent, accessible, and student-focused.',
  primaryCtaLabel: 'Check Eligibility',
  primaryCtaHref: '/eligibility',
  secondaryCtaLabel: 'How to Apply',
  secondaryCtaHref: '/how-to-apply',
  imageUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1440&h=700&fit=crop&auto=format',
};

const shippedAbout = {
  eyebrow: 'City Scholarship Program',
  title: 'One Scholarship. Countless Opportunities.',
  body: 'The City Scholarship Program is a government-funded initiative that provides full financial support to qualified residents pursuing higher education. It covers tuition, allowances, and book stipends for approved scholars.',
  bullets: [
    'Covers tuition and miscellaneous fees',
    'Monthly living allowance for active scholars',
    'Annual renewal for continuing scholars',
    'Open to city residents pursuing undergraduate studies',
  ],
  highlights: [
    { value: '₱30,000', label: 'per semester' },
    { value: '500', label: 'available slots' },
    { value: 'Jul 31', label: 'application deadline' },
  ],
};

const shippedCard = {
  title: 'City Scholarship Program',
  followWindow: true,
  subtitle: 'AY 2025–2026 · Now Open',
  statusLabel: 'Open',
  rows: [
    { label: 'Application Period', value: 'June 1 – July 31, 2025' },
    { label: 'Minimum GWA', value: '2.25 or higher' },
    { label: 'Residency Requirement', value: 'City resident, 2+ years' },
    { label: 'Available Slots', value: '500 scholars' },
    { label: 'Benefit', value: '₱30,000 per semester' },
  ],
  ctaLabel: 'Check if You Qualify',
  ctaHref: '/eligibility',
};

const shippedProcess = {
  eyebrow: 'Simple Process',
  title: 'How to Apply in 4 Steps',
  ctaLabel: 'Start Your Application',
  ctaHref: '/login',
};

const shippedTestimonialsHead = { eyebrow: 'Scholar Stories', title: 'Lives Changed Through Scholarship' };
const shippedAnnouncementsHead = { eyebrow: 'Latest Updates', title: 'Announcements' };

const shippedCta = {
  title: 'Begin Your Scholarship Journey Today',
  body: "Thousands of students from our city have taken the first step. Your education matters — and we're here to help make it possible.",
  primaryLabel: 'Apply Now',
  primaryHref: '/login?tab=register',
  secondaryLabel: 'Check Eligibility',
  secondaryHref: '/eligibility',
};

export default function HomePage() {
  const { pages, program } = usePublicContent();
  const home = pages.home || {};
  const liveWindow = program?.applicationWindow;
  // "disabled" means the office is not running windows: keep the static copy.
  const windowLive = !!liveWindow && liveWindow.reason !== 'disabled';

  const hero = { ...shippedHero, ...home.hero };
  const about = { ...shippedAbout, ...home.about };
  const card = { ...shippedCard, ...home.programCard };
  const process = { ...shippedProcess, ...home.process };
  const cta = { ...shippedCta, ...home.cta };
  const stats = home.stats ?? shippedStats;
  const steps = process.steps ?? shippedSteps;
  const testimonialsSection = { ...shippedTestimonialsHead, ...home.testimonials };
  const announcementsSection = { ...shippedAnnouncementsHead, ...home.announcements };
  const testimonials = testimonialsSection.items ?? shippedTestimonials;
  const announcements = announcementsSection.items ?? shippedAnnouncements;
  const showTestimonials = testimonials.length > 0;
  const showAnnouncements = announcements.length > 0;

  // Hero badge follows the live application window when its toggle is on.
  const heroBadge =
    hero.followWindow !== false && windowLive && liveWindow
      ? liveWindow.open
        ? `${liveWindow.academicYear ? `${liveWindow.academicYear} ` : ''}Applications Now Open`
        : liveWindow.reason === 'not-open-yet'
          ? `Applications Open ${formatDay(liveWindow.openDate)}`
          : 'Applications Closed'
      : hero.badge;

  // The card's subtitle, status pill and period row follow the same window.
  const windowState = !windowLive || !liveWindow ? '' : liveWindow.open ? 'Open' : liveWindow.reason === 'not-open-yet' ? 'Soon' : 'Closed';
  const followCard = card.followWindow !== false && windowState !== '';
  const statusLabel = followCard ? (windowState === 'Soon' ? 'Upcoming' : windowState) : card.statusLabel;
  const statusStyle =
    followCard && windowState !== 'Open'
      ? windowState === 'Soon'
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-red-500/20 text-red-400'
      : 'bg-green-500/20 text-green-400';
  const cardSubtitle =
    followCard && liveWindow
      ? [liveWindow.academicYear, liveWindow.open ? 'Now Open' : liveWindow.reason === 'not-open-yet' ? 'Opening Soon' : 'Closed']
          .filter(Boolean)
          .join(' · ')
      : card.subtitle;
  const cardRows =
    followCard && liveWindow?.openDate && liveWindow?.closeDate
      ? (card.rows || []).map(row =>
          row.label === 'Application Period' ? { ...row, value: formatRange(liveWindow.openDate, liveWindow.closeDate) } : row,
        )
      : card.rows || [];

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
            src={hero.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-[1280px] mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#D4A72C]/20 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4A72C]" />
              <span className="text-[#F8E7A8] text-xs font-600" style={{ fontWeight: 600 }}>{heroBadge}</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-800 leading-tight mb-5" style={{ fontWeight: 800 }}>
              {hero.titleLine1}<br />
              <span className="text-[#D4A72C]">{hero.titleLine2}</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-lg">
              {hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={hero.primaryCtaHref}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#D4A72C] text-[#0B1F3A] font-700 rounded-xl hover:bg-[#F8E7A8] transition-colors text-sm"
                style={{ fontWeight: 700 }}
              >
                {hero.primaryCtaLabel}
                <Icon name="arrow-right" size={16} />
              </Link>
              <Link
                to={hero.secondaryCtaHref}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 text-white font-600 rounded-xl hover:bg-white/20 transition-colors text-sm border border-white/20"
                style={{ fontWeight: 600 }}
              >
                {hero.secondaryCtaLabel}
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
                  <Icon name={stat.icon || 'award'} size={18} className="text-[#163A63]" />
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
              <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-3" style={{ fontWeight: 600 }}>{about.eyebrow}</div>
              <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A] mb-4" style={{ fontWeight: 800 }}>{about.title}</h2>
              <p className="text-[#6B7280] leading-relaxed mb-5">
                {about.body}
              </p>
              <div className="space-y-3 mb-6">
                {(about.bullets || []).map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm text-[#1F2937]">
                    <Icon name="check-circle" size={16} className="text-[#22A06B] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {(about.highlights || []).map((highlight, index) => (
                  <div key={`${highlight.value}-${index}`} className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 text-center">
                    <div className={`font-800 text-lg ${index === 2 ? 'text-[#D97706]' : 'text-[#0B1F3A]'}`} style={{ fontWeight: 800 }}>{highlight.value}</div>
                    <div className="text-xs text-[#6B7280]">{highlight.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[#D4A72C] flex items-center justify-center flex-shrink-0">
                    <Icon name="award" size={20} className="text-[#0B1F3A]" />
                  </div>
                  <div>
                    <div className="font-700 text-sm" style={{ fontWeight: 700 }}>{card.title}</div>
                    <div className="text-white/50 text-xs">{cardSubtitle}</div>
                  </div>
                  <span className={`ml-auto px-2.5 py-1 text-xs font-600 rounded-full ${statusStyle}`} style={{ fontWeight: 600 }}>● {statusLabel}</span>
                </div>
                <div className="space-y-3 text-sm">
                  {cardRows.map((row, index) => (
                    <div key={`${row.label}-${index}`} className="flex justify-between py-2 border-b border-white/10 last:border-0">
                      <span className="text-white/50">{row.label}</span>
                      <span className="font-600 text-white" style={{ fontWeight: 600 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to={card.ctaHref}
                  className="flex items-center justify-center gap-2 mt-5 py-2.5 bg-[#D4A72C] text-[#0B1F3A] rounded-xl text-sm font-700 hover:bg-[#F8E7A8] transition-colors"
                  style={{ fontWeight: 700 }}
                >
                  {card.ctaLabel}
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
            <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>{process.eyebrow}</div>
            <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>{process.title}</h2>
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
                  <p className="text-sm text-[#6B7280] leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to={process.ctaHref}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm"
              style={{ fontWeight: 700 }}
            >
              {process.ctaLabel}
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials — the section hides itself when the list is cleared */}
      {showTestimonials && (
        <section className="bg-[#F6F7F9] py-16">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="text-center mb-10">
              <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>{testimonialsSection.eyebrow}</div>
              <h2 className="text-2xl lg:text-3xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>{testimonialsSection.title}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {testimonials.map((t, index) => (
                <div key={t.name || index} className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(Math.min(5, Math.max(0, t.rating ?? 5)))].map((_, i) => (
                      <span key={i} className="text-[#D4A72C] text-sm">★</span>
                    ))}
                  </div>
                  <p className="text-sm text-[#1F2937] leading-relaxed mb-5 italic">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700" style={{ fontWeight: 700 }}>
                      {(t.name || '').split(' ').map(n => n[0]).join('')}
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
      )}

      {/* Announcements — the section hides itself when the list is cleared */}
      {showAnnouncements && (
        <section className="bg-white py-16">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>{announcementsSection.eyebrow}</div>
                <h2 className="text-2xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800 }}>{announcementsSection.title}</h2>
              </div>
            </div>
            <div className="space-y-4">
              {announcements.map((ann, index) => (
                <div key={ann.title || index} className="flex gap-5 p-5 rounded-2xl border border-[#E5E7EB] hover:border-[#163A63]/20 hover:shadow-sm transition-all">
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
      )}

      {/* CTA */}
      <section className="bg-[#0B1F3A] py-16">
        <div className="max-w-[1280px] mx-auto px-6 text-center">
          <div className="w-14 h-14 bg-[#D4A72C] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Icon name="award" size={26} className="text-[#0B1F3A]" />
          </div>
          <h2 className="text-2xl lg:text-3xl font-800 text-white mb-4" style={{ fontWeight: 800 }}>
            {cta.title}
          </h2>
          <p className="text-white/60 text-base max-w-lg mx-auto mb-8">
            {cta.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={cta.primaryHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#D4A72C] text-[#0B1F3A] font-700 rounded-xl hover:bg-[#F8E7A8] transition-colors text-sm"
              style={{ fontWeight: 700 }}
            >
              {cta.primaryLabel}
              <Icon name="arrow-right" size={16} />
            </Link>
            <Link
              to={cta.secondaryHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 text-white font-600 rounded-xl hover:bg-white/20 transition-colors text-sm border border-white/20"
              style={{ fontWeight: 600 }}
            >
              {cta.secondaryLabel}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
