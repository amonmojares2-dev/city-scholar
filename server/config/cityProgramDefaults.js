const DEFAULT_APPLICATION_DOCUMENTS = Object.freeze([
    { key: "Certificate of Matriculation", label: "Certificate of Matriculation", note: "Stamped and dry sealed", required: true, enabled: true },
    { key: "Report Card", label: "Latest Report Card", note: "", required: true, enabled: true },
    { key: "School ID (Current)", label: "Current School ID", note: "", required: true, enabled: true },
    { key: "Parent Valid ID", label: "Parent's Valid ID", note: "", required: true, enabled: true }
]);

const DEFAULT_RENEWAL_DOCUMENTS = Object.freeze([
    { key: "Certificate of Residency (Student)", label: "Certificate of Residency (Student)", note: "Must be officially stamped and dry sealed", required: true, enabled: true },
    { key: "Certificate of Indigency (Student)", label: "Certificate of Indigency (Student)", note: "Must be officially stamped and dry sealed", required: true, enabled: true },
    { key: "Certificate of Residency (Parent/Guardian)", label: "Certificate of Residency (Parent/Guardian)", note: "Must be officially stamped and dry sealed", required: true, enabled: true },
    { key: "Certificate of Indigency (Parent/Guardian)", label: "Certificate of Indigency (Parent/Guardian)", note: "Must be officially stamped and dry sealed", required: true, enabled: true },
    { key: "Certificate of Matriculation", label: "Certificate of Matriculation", note: "Must be officially stamped and dry sealed", required: true, enabled: true }
]);

const DEFAULT_ELIGIBILITY = Object.freeze({
    residencyYears: 2,
    incomeThreshold: "below-5000",
    maximumAge: 30,
    noOtherScholarship: true,
    accreditedSchool: true
});

const DEFAULT_DISBURSEMENT = Object.freeze({
    stipendAmount: 3000,
    frequency: "monthly",
    paymentMethod: "bank-transfer",
    maxScholarsPerSemester: 500,
    autoNotify: true
});

const DEFAULT_APPLICATION_PERIOD = Object.freeze({
    enabled: true,
    openDate: null,
    closeDate: null,
    academicYear: "2025–2026"
});

const DEFAULT_RENEWAL_PERIOD = Object.freeze({
    enabled: true,
    openDate: null,
    closeDate: null,
    academicYear: "2025–2026"
});

const DEFAULT_PROGRAM_SETTINGS = Object.freeze({
    applicationDocuments: DEFAULT_APPLICATION_DOCUMENTS,
    renewalDocuments: DEFAULT_RENEWAL_DOCUMENTS,
    eligibility: DEFAULT_ELIGIBILITY,
    applicationPeriod: DEFAULT_APPLICATION_PERIOD,
    renewalPeriod: DEFAULT_RENEWAL_PERIOD,
    disbursement: DEFAULT_DISBURSEMENT
});

module.exports = {
    DEFAULT_APPLICATION_DOCUMENTS,
    DEFAULT_RENEWAL_DOCUMENTS,
    DEFAULT_ELIGIBILITY,
    DEFAULT_APPLICATION_PERIOD,
    DEFAULT_RENEWAL_PERIOD,
    DEFAULT_DISBURSEMENT,
    DEFAULT_PROGRAM_SETTINGS
};
