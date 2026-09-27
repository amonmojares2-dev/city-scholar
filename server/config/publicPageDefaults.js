function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const DEFAULT_ELIGIBILITY_CONTENT = Object.freeze({
    eyebrow: "Requirements",
    title: "Eligibility & Requirements",
    subtitle: "Review all requirements carefully before submitting your application. Incomplete applications will not be processed.",
    noticeTitle: "Important Notice",
    noticeText: "Meeting the minimum requirements does not guarantee scholarship award. All applications are subject to review and the number of available slots. The City Scholarship Office reserves the right to verify all submitted information.",
    ctaTitle: "Ready to Apply?",
    ctaText: "Create your account to begin your scholarship application. Our system will guide you through every step.",
    ctaLabel: "Start Application",
    categories: [
        {
            id: "general",
            title: "General Eligibility",
            items: [
                "Must be a Filipino citizen",
                "Must be a resident of the city for at least two (2) consecutive years",
                "Must not be a recipient of any other government scholarship grant",
                "Must be of good moral character with no pending criminal case",
                "Must maintain satisfactory academic performance throughout the program"
            ]
        },
        {
            id: "academic",
            title: "Academic Requirements",
            items: [
                "Must have a General Weighted Average (GWA) of 2.00 or better for the most recent term",
                "Must be enrolled or planning to enroll in a recognized educational institution",
                "For continuing scholars: No failing or incomplete grades in the previous term",
                "Must maintain satisfactory academic standing throughout the scholarship period"
            ]
        },
        {
            id: "residency",
            title: "Residency Requirements",
            items: [
                "Valid proof of residency from the barangay where the applicant resides",
                "Household must be registered in the city's civil registry or equivalent",
                "Parents or guardians must also be residents of the city",
                "Residency must be continuous and verifiable for at least 2 years prior to application"
            ]
        },
        {
            id: "documents",
            title: "Required Documents",
            items: [
                "Accomplished Scholarship Application Form (downloadable from the portal)",
                "Certificate of Residency from the Barangay",
                "Latest Income Tax Return (ITR) or Certificate of Indigency",
                "PSA-authenticated Birth Certificate",
                "Certified True Copy of Grades / Transcript of Records",
                "Certificate of Good Moral Character from the school",
                "Two (2) government-issued IDs of the applicant",
                "School Enrollment / Prospective Enrollment Certificate"
            ]
        },
        {
            id: "additional",
            title: "Additional Qualifications",
            items: [
                "Priority given to students from low-income families (below the poverty threshold)",
                "Priority given to applicants from barangays with lower scholarship representation",
                "Students with siblings currently enrolled in higher education may be prioritized",
                "Applicants enrolled in graduate or post-graduate programs may be considered on a case-by-case basis",
                "PWD and indigenous applicants may have relaxed academic requirements"
            ]
        }
    ]
});

const DEFAULT_HOW_TO_APPLY_CONTENT = Object.freeze({
    eyebrow: "Step-by-Step Guide",
    title: "How to Apply",
    subtitle: "Follow these steps to complete your scholarship application. The entire process is done online through this portal.",
    helpTitle: "Need Help?",
    helpText: "Our AI Assistant can answer your questions anytime, or contact the scholarship office directly.",
    helpLinkLabel: "Ask the AI Assistant",
    readyTitle: "Ready to Start?",
    readyText: "Create your account and begin your scholarship application today.",
    steps: [
        { num: "01", title: "Check Eligibility", description: "Review the eligibility criteria for each scholarship program. Make sure you meet the academic, residency, and financial requirements before proceeding.", tips: ["Read all requirements carefully", "Prepare supporting documents in advance", "Contact the office if you have questions"], link: "/eligibility", linkLabel: "Check Eligibility Now" },
        { num: "02", title: "Create an Account", description: "Register through the scholarship portal using your email address. You will receive a verification email before you can proceed.", tips: ["Use a valid and accessible email", "Keep your password secure", "Verify your email immediately after registration"], link: "/login", linkLabel: "Register Now" },
        { num: "03", title: "Complete Your Profile", description: "Fill in all required personal, academic, and contact information accurately. Inaccurate information may result in disqualification.", tips: ["Match all information with your IDs", "Provide your barangay and school details", "Double-check all entries before saving"], link: "", linkLabel: "" },
        { num: "04", title: "Submit Requirements", description: "Upload all required documents through the secure portal. Each document must be clear, complete, and in PDF or image format.", tips: ["Scan documents at 300 DPI or higher", "Files must not exceed 5MB each", "All documents must be recent (within 6 months)"], link: "", linkLabel: "" },
        { num: "05", title: "Application Review", description: "The City Scholarship Office will review your application and documents. You will be notified of any additional requirements.", tips: ["Review takes 2–4 weeks", "Check your email and portal regularly", "Respond promptly to any requests"], link: "", linkLabel: "" },
        { num: "06", title: "Track Your Status", description: "Monitor your application status in real time through your student dashboard. Approved scholars will receive an official notification.", tips: ["Status updates appear in your dashboard", "You will receive email notifications", "Approved scholars must attend orientation"], link: "", linkLabel: "" }
    ]
});

const DEFAULT_GUIDELINES_CONTENT = Object.freeze({
    eyebrow: "Official Document",
    title: "Scholarship Guidelines",
    subtitle: "City Scholarship Program Implementing Guidelines | AY 2025–2026",
    sections: [
        { id: "general", title: "General Provisions", content: [
            { heading: "1.1 Purpose", text: "This guideline governs the implementation, administration, and management of the City Scholarship Program as mandated by City Ordinance No. 2019-045." },
            { heading: "1.2 Coverage", text: "These guidelines cover all scholarship grants administered by the City Scholarship Office (CSO), including the Academic Excellence Scholarship, Deserving Student Program, Technical-Vocational Scholarship, Graduate Studies Scholarship, and Special Programs." },
            { heading: "1.3 Implementing Body", text: "The City Scholarship Office, under the Office of the Mayor, shall be responsible for the implementation, monitoring, and evaluation of all scholarship programs covered by these guidelines." }
        ]},
        { id: "obligations", title: "Scholar's Obligations", content: [
            { heading: "2.1 Academic Performance", text: "All scholars must maintain the required minimum GWA per scholarship program per academic term. Failure to maintain the required GWA shall result in suspension of the scholarship grant pending evaluation." },
            { heading: "2.2 Residency", text: "Scholars must remain residents of the city throughout the duration of the scholarship. Transfer of residency must be immediately reported to the CSO." },
            { heading: "2.3 Event Attendance", text: "Scholars are required to attend city-organized scholarship events, orientations, recognition ceremonies, and at least two (2) community service activities per year. Proof of attendance must be submitted through the portal." },
            { heading: "2.4 Renewal", text: "Scholarship grants are not automatic. Scholars must complete the renewal process within the prescribed period. Renewal requirements include updated academic records, proof of enrollment, and updated personal information." }
        ]},
        { id: "benefits", title: "Benefits and Allowances", content: [
            { heading: "3.1 Tuition Assistance", text: "Scholarship grants cover tuition and miscellaneous fees up to the amount specified per program. Fees exceeding the scholarship grant shall be shouldered by the scholar." },
            { heading: "3.2 Monthly Allowance", text: "All active scholars receive a monthly living allowance as specified in their grant certificate. Allowance is disbursed monthly through the city's designated disbursement channels." },
            { heading: "3.3 Book Allowance", text: "A book and supplies allowance is provided at the beginning of each academic term. Receipts or proof of purchase may be required." },
            { heading: "3.4 Non-transferability", text: "Scholarship benefits are personal and non-transferable. Any attempt to transfer or share scholarship benefits shall result in immediate cancellation." }
        ]},
        { id: "grounds", title: "Grounds for Cancellation", content: [
            { heading: "4.1 Academic Failure", text: "Failure to maintain the required GWA for two consecutive terms, or any failing grade in a major subject, without valid reason, constitutes grounds for scholarship cancellation." },
            { heading: "4.2 Misconduct", text: "Any act of dishonesty, misconduct, or violation of school policies, including academic dishonesty, shall result in immediate scholarship suspension and investigation." },
            { heading: "4.3 Duplicate Grants", text: "Receiving scholarship benefits from two or more government-funded scholarship programs simultaneously is strictly prohibited and shall result in immediate cancellation and recovery of improperly received grants." },
            { heading: "4.4 Misrepresentation", text: "Submission of fraudulent documents, false information, or misrepresentation in any part of the application or renewal process shall result in permanent disqualification from all city scholarship programs." }
        ]},
        { id: "appeals", title: "Appeals and Complaints", content: [
            { heading: "5.1 Right to Appeal", text: "Any applicant or scholar who disagrees with a decision by the CSO has the right to file a formal appeal within fifteen (15) calendar days from the date of notification." },
            { heading: "5.2 Appeal Process", text: "Appeals must be filed in writing through the scholarship portal or in person at the CSO. The appeal must state the grounds for appeal and attach supporting documents." },
            { heading: "5.3 Resolution", text: "The CSO shall resolve all appeals within thirty (30) calendar days. The decision of the CSO Review Committee shall be final and executory unless elevated to the City Mayor's Office." }
        ]}
    ]
});

const DEFAULT_PUBLIC_PAGE_CONTENT = Object.freeze({
    eligibility: DEFAULT_ELIGIBILITY_CONTENT,
    howToApply: DEFAULT_HOW_TO_APPLY_CONTENT,
    guidelines: DEFAULT_GUIDELINES_CONTENT
});

function getDefaultPublicPageContent() {
    return clone(DEFAULT_PUBLIC_PAGE_CONTENT);
}

module.exports = {
    DEFAULT_ELIGIBILITY_CONTENT,
    DEFAULT_HOW_TO_APPLY_CONTENT,
    DEFAULT_GUIDELINES_CONTENT,
    DEFAULT_PUBLIC_PAGE_CONTENT,
    getDefaultPublicPageContent
};
