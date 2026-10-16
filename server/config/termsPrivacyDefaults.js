const DEFAULT_TERMS_PRIVACY = Object.freeze({
    terms: Object.freeze({
        key: "terms",
        title: "Terms and Conditions",
        content: `TERMS AND CONDITIONS
1. Registration & Account Security
1.1 Certification of Truthfulness: By registering an account, the applicant certifies that all personal details, academic records, uploaded documents (valid IDs, report cards/grades, certificates, and event attendance photos), and application information provided are certified as TRUE and CORRECT. Submission of falsified records or fraudulent information will result in immediate disqualification and account revocation.
1.2 Account Validation: Registrants must validate their account by entering the VERIFICATION CODE (OTP) sent to their supplied official email address prior to accessing the scholarship portal. Unverified accounts will remain inactive.
1.3 Prohibition of Multiple Accounts: Registrants shall not create multiple FALSE ACCOUNTS or submit duplicate applications under different profiles. The City Scholarship Office may screen for duplicate student records.
1.4 Credential Protection: Registrants are responsible for maintaining the strict confidentiality of their account credentials (username and password) and shall NOT SHARE them with anyone. The City Government is not liable for unauthorized access resulting from credential sharing.`
    }),
    privacy: Object.freeze({
        key: "privacy",
        title: "Data Privacy Policy",
        content: `DATA PRIVACY POLICY
2. Data Privacy & Authority Inquiry Consent
2.1 Consent to Processing and Profiling: In compliance with Republic Act No. 10173 (the Data Privacy Act of 2012) and its Implementing Rules and Regulations, the user hereby agrees that all Personal Data, application records, academic transcripts, uploaded requirement documents, and transaction records (collectively, the "Information") provided to or collected by the City Government of Dagupan from time to time may be stored, processed, profiled, or shared for the administration, evaluation, academic tracking, and automated screening of scholarship applications.
2.2 Legal, Audit, and Examination Disclosure: The user agrees that such Information may be disclosed, profiled, or shared with requesting parties or for the purpose of any court order, legal process, official examination, inquiry, audit, or investigation by any authorized government Authority. The aforesaid terms shall apply notwithstanding any applicable non-disclosure agreement.
2.3 Data Sharing and Infrastructure Limitations: The user acknowledges that Information may be processed, profiled, or stored within secure cloud database systems (MERN stack / MongoDB) or shared across jurisdictions or administrative portals that support municipal e-government operations.
2.4 Role-Based Access Governance: Access to student records is strictly governed by Role-Based Access Controls (RBAC). Barangay officials are granted limited, barangay-scoped access restricted strictly to scholars and applicants residing within their respective jurisdictions.`
    })
});

module.exports = { DEFAULT_TERMS_PRIVACY };
