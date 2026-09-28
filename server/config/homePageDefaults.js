// Shipped copy for the public landing page ("/"). The City Office edits this
// content from Program Settings; what is stored here is only the day-one
// default that renders before the first save and after "Restore shipped
// defaults". Every string below matches the page the site shipped with.
//
// `hero.followWindow` and `programCard.followWindow` are the only two places
// that are not free text: when they are on, the hero badge, the status pill,
// the card subtitle and the "Application Period" row are rendered from the
// live application window in the program settings instead of the strings here.
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const DEFAULT_HOME_CONTENT = Object.freeze({
    hero: {
        badge: "AY 2025–2026 Applications Now Open",
        followWindow: true,
        titleLine1: "Empowering Students.",
        titleLine2: "Building Brighter Futures.",
        subtitle: "The City Scholarship Program connects deserving students with educational opportunities. Transparent, accessible, and student-focused.",
        primaryCtaLabel: "Check Eligibility",
        primaryCtaHref: "/eligibility",
        secondaryCtaLabel: "How to Apply",
        secondaryCtaHref: "/how-to-apply",
        imageUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1440&h=700&fit=crop&auto=format"
    },
    stats: [
        { key: "graduates", value: "12,847", label: "Graduates Supported", icon: "award" },
        { key: "scholars", value: "3,204", label: "Active Scholars", icon: "users" },
        { key: "slots", value: "500", label: "Slots Available", icon: "book" },
        { key: "success", value: "99.2%", label: "Application Success Rate", icon: "check-circle" }
    ],
    about: {
        eyebrow: "City Scholarship Program",
        title: "One Scholarship. Countless Opportunities.",
        body: "The City Scholarship Program is a government-funded initiative that provides full financial support to qualified residents pursuing higher education. It covers tuition, allowances, and book stipends for approved scholars.",
        bullets: [
            "Covers tuition and miscellaneous fees",
            "Monthly living allowance for active scholars",
            "Annual renewal for continuing scholars",
            "Open to city residents pursuing undergraduate studies"
        ],
        highlights: [
            { value: "₱30,000", label: "per semester" },
            { value: "500", label: "available slots" },
            { value: "Jul 31", label: "application deadline" }
        ]
    },
    programCard: {
        title: "City Scholarship Program",
        followWindow: true,
        subtitle: "AY 2025–2026 · Now Open",
        statusLabel: "Open",
        rows: [
            { label: "Application Period", value: "June 1 – July 31, 2025" },
            { label: "Minimum GWA", value: "2.25 or higher" },
            { label: "Residency Requirement", value: "City resident, 2+ years" },
            { label: "Available Slots", value: "500 scholars" },
            { label: "Benefit", value: "₱30,000 per semester" }
        ],
        ctaLabel: "Check if You Qualify",
        ctaHref: "/eligibility"
    },
    process: {
        eyebrow: "Simple Process",
        title: "How to Apply in 4 Steps",
        steps: [
            { num: "01", title: "Check Eligibility", description: "Review the scholarship requirements and confirm you meet all criteria before starting your application." },
            { num: "02", title: "Create an Account", description: "Register with your basic information to access the scholarship portal and track your application." },
            { num: "03", title: "Submit Requirements", description: "Upload all required documents through the secure portal. Our system tracks every submission." },
            { num: "04", title: "Track Application", description: "Monitor your application status in real time and respond to any requests from the scholarship office." }
        ],
        ctaLabel: "Start Your Application",
        ctaHref: "/login"
    },
    testimonials: {
        eyebrow: "Scholar Stories",
        title: "Lives Changed Through Scholarship",
        items: [
            {
                name: "Jasmine Reyes",
                batch: "Scholar, 2022",
                school: "PHINMA University of Pangasinan",
                rating: 5,
                text: "The City Scholarship changed my life. The entire process was transparent and the office was always responsive to my questions. I'm now in my third year of BS Computer Science."
            },
            {
                name: "Carlo Mendoza",
                batch: "Scholar, 2021",
                school: "University of Luzon",
                rating: 5,
                text: "Coming from a family with limited income, I never thought college was within reach. This scholarship didn't just cover tuition — it gave me confidence and a future."
            },
            {
                name: "Liana Torres",
                batch: "Scholar, 2023",
                school: "Systems Technology Institute College",
                rating: 5,
                text: "I completed my course and landed a job immediately after. The portal made renewals easy and I always knew what documents I needed."
            }
        ]
    },
    announcements: {
        eyebrow: "Latest Updates",
        title: "Announcements",
        items: [
            {
                tag: "Application Open",
                date: "May 28, 2025",
                title: "Scholarship Applications Now Open for AY 2025–2026",
                excerpt: "The City Scholarship Office is pleased to announce that applications are now open until July 31, 2025."
            },
            {
                tag: "Reminder",
                date: "May 20, 2025",
                title: "Document Submission Deadline Extended to June 15",
                excerpt: "Due to high demand, the document submission deadline for continuing scholars has been extended."
            },
            {
                tag: "Event",
                date: "May 15, 2025",
                title: "Scholarship Orientation Seminar – June 5, 2025",
                excerpt: "All new applicants are encouraged to attend the online orientation seminar on scholarship guidelines and requirements."
            }
        ]
    },
    cta: {
        title: "Begin Your Scholarship Journey Today",
        body: "Thousands of students from our city have taken the first step. Your education matters — and we're here to help make it possible.",
        primaryLabel: "Apply Now",
        primaryHref: "/login?tab=register",
        secondaryLabel: "Check Eligibility",
        secondaryHref: "/eligibility"
    }
});

function getDefaultHomeContent() {
    return clone(DEFAULT_HOME_CONTENT);
}

module.exports = {
    DEFAULT_HOME_CONTENT,
    getDefaultHomeContent
};
