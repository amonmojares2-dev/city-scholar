const Application = require("../models/Application");
const Document = require("../models/Document");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { logAudit } = require("../utils/audit");
const { CITY_ADMIN_ROLES } = require("../utils/validation");

const listApplications = async(req, res, next) => {
    try {
        // A student sees everything they own, drafts included (they have to be
        // able to resume an unfinished application).
        //
        // Every staff portal (City Office, Barangay, Super Admin) only sees
        // records the student actually SUBMITTED. An unsubmitted draft is the
        // student's private work-in-progress: it must never appear in a review
        // queue, in the dashboard counts, or in reports. Submitting is what
        // makes an application visible to the office.
        //
        // Two-stage review: the City Office additionally only sees applications
        // the applicant's Barangay Admin approved (barangayVerificationStatus
        // === "approved"). Renewals are exempt — they belong to the
        // existing-scholar renewal flow, which never passes barangay review.
        // Barangay and Super Admin queues are not filtered here.
        let filter;
        if (req.user.role === "student") {
            filter = { student: req.user.id };
        } else if (CITY_ADMIN_ROLES.includes(req.user.role)) {
            filter = {
                status: { $ne: "draft" },
                $or: [
                    { barangayVerificationStatus: "approved" },
                    { status: "renewal" }
                ]
            };
        } else {
            filter = { status: { $ne: "draft" } };
        }
        const applications = await Application.find(filter).populate("student", "name email").populate("barangay", "name").sort({ createdAt: -1 });

        // Residency backfill: records created before the two-stage flow have
        // no application.barangay — copy it from the student's registered
        // barangay (User.barangay, set at registration) so barangay scoping
        // and the City's Barangay column work for older data too.
        if (req.user.role !== "student") {
            const missing = applications.filter((application) => !application.barangay && application.student?._id);
            if (missing.length) {
                const owners = await User.find({
                    _id: { $in: missing.map((application) => application.student._id) },
                    barangay: { $ne: null }
                }).select("_id barangay");
                const barangayByStudent = new Map(owners.map((owner) => [String(owner._id), owner.barangay]));
                const linked = [];
                for (const application of missing) {
                    const link = barangayByStudent.get(String(application.student._id));
                    if (!link) continue;
                    application.barangay = link;
                    await Application.updateOne({ _id: application._id }, { $set: { barangay: link } });
                    linked.push(application);
                }
                if (linked.length) await Application.populate(linked, { path: "barangay", select: "name" });
            }
        }

        res.json({ success: true, applications });
    } catch (error) { next(error); }
};

const getApplication = async(req, res, next) => {
    try {
        const application = await Application.findById(req.params.id)
            .populate("student", "name email")
            .populate("barangay", "name")
            .populate("reviewedBy", "name");
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });
        if (req.user.role === "student" && application.student._id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
        // Two-stage guard on the detail page too, so a City Office reviewer
        // cannot open a not-yet-barangay-approved record by typing its URL.
        // Renewals are exempt (existing-scholar flow, no barangay stage).
        if (CITY_ADMIN_ROLES.includes(req.user.role) &&
            application.status !== "draft" &&
            application.status !== "renewal" &&
            application.barangayVerificationStatus !== "approved") {
            return res.status(403).json({
                success: false,
                message: "This application is still awaiting Barangay residency verification."
            });
        }
        res.json({ success: true, application });
    } catch (error) { next(error); }
};

const createApplication = async(req, res, next) => {
    try {
        const application = await Application.create({...req.body, student: req.user.id, status: "submitted", submittedAt: new Date() });
        // Mirror the applicant block onto the account only when one was sent —
        // spreading an absent block would wipe the student's saved profile.
        if (req.body.applicant) {
            await User.findByIdAndUpdate(req.user.id, { $set: { profile: {...req.body.applicant, schoolName: application.school } } });
        }
        res.status(201).json({ success: true, application });
    } catch (error) { next(error); }
};

const updateApplication = async(req, res, next) => {
    try {
        const application = await Application.findById(req.params.id);
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });
        if (req.user.role === "student" && application.student.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
        Object.assign(application, req.body);
        await application.save();
        // Only mirror the applicant block when the caller actually sent one.
        // A City Office review PATCH carries no `applicant`, so spreading an
        // empty object here would erase the student's saved profile.
        if (req.body.applicant) {
            await User.findByIdAndUpdate(application.student, { $set: { profile: {...req.body.applicant, schoolName: application.school } } });
        }
        res.json({ success: true, application });
    } catch (error) { next(error); }
};

// ==========================================================
// CITY OFFICE — application review decision
//
// PATCH /api/applications/:id/review
//   { decision: "approved" | "rejected" | "additional_requirements",
//     remarks:  string,
//     documentIds?: string[] }
//
// Writes the decision on the application, and:
//   - "additional_requirements" also flags the picked documents as rejected
//     (= "Needs Replacement" in both portals) so the student can see exactly
//     which files to re-upload,
//   - creates a Notification for the student (the student portal already lists
//     /api/notifications) so the decision actually reaches them,
//   - writes an AuditLog entry so the decision shows in the Super Admin trail.
// ==========================================================
const REVIEW_DECISIONS = ["approved", "rejected", "additional_requirements"];

const DECISION_NOTICE = {
    approved: {
        title: "Application approved",
        message: "Congratulations! Your City Scholarship application has been approved."
    },
    rejected: {
        title: "Application rejected",
        message: "Your City Scholarship application was not approved."
    },
    additional_requirements: {
        title: "Additional documents needed",
        message: "The City Scholarship Office needs additional or replacement documents before your application can be processed."
    }
};

const reviewApplication = async(req, res, next) => {
        try {
            const { decision, remarks, documentIds } = req.body || {};
            const note = typeof remarks === "string" ? remarks.trim() : "";

            if (!REVIEW_DECISIONS.includes(decision)) {
                return res.status(400).json({
                    success: false,
                    message: "Decision must be approved, rejected, or additional_requirements."
                });
            }
            if (decision === "rejected" && !note) {
                return res.status(400).json({ success: false, message: "Please add a reason for the rejection." });
            }
            if (decision === "additional_requirements" && !note) {
                return res.status(400).json({ success: false, message: "Please describe the documents that are missing or need replacement." });
            }

            const application = await Application.findById(req.params.id);
            if (!application) return res.status(404).json({ success: false, message: "Application not found" });

            // Two-stage guard: the Barangay Office must confirm the applicant's
            // residency before the City Office may approve. Renewals skip this —
            // the existing-scholar renewal flow never passes barangay review.
            if (decision === "approved" &&
                application.status !== "renewal" &&
                application.barangayVerificationStatus !== "approved") {
                return res.status(400).json({
                    success: false,
                    message: "The Barangay Office has not confirmed this applicant's residency yet."
                });
            }

            application.status = decision;
            application.remarks = note;
            application.reviewedAt = new Date();
            application.reviewedBy = req.user.id;
            await application.save();

            // Final approval grants the student the same access as an Existing
            // Scholar. studentAccess.ts only opens the Renewal page (accessLevel
            // "scholar") when BOTH scholarType === "existing_scholar" AND
            // scholarVerificationStatus === "approved", so both DB columns are set
            // here — no separate flag. registrationType on the client is just an
            // alias of scholarType. Existing scholars (renewal flow) are untouched.
            if (decision === "approved") {
                const studentAccount = await User.findById(application.student);
                if (studentAccount &&
                    studentAccount.role === "student" &&
                    studentAccount.scholarType !== "existing_scholar") {
                    studentAccount.scholarType = "existing_scholar";
                    studentAccount.scholarVerificationStatus = "approved";
                    studentAccount.scholarVerifiedAt = new Date();
                    await studentAccount.save();
                }
            }
            // A rejection leaves the account as-is: a new applicant stays a
            // new_applicant with Application-page access only (existing behavior).

            // Documents picked in the "Request Docs" modal need a replacement.
            // Scoped to this application so a stray id can never touch another
            // student's upload.
            let flaggedDocuments = 0;
            if (decision === "additional_requirements" && Array.isArray(documentIds) && documentIds.length) {
                const result = await Document.updateMany({ _id: { $in: documentIds }, application: application._id }, { $set: { status: "rejected", remarks: note } });
                flaggedDocuments = result.modifiedCount || 0;
            }

            await application.populate([
                { path: "student", select: "name email" },
                { path: "barangay", select: "name" },
                { path: "reviewedBy", select: "name" }
            ]);

            // Best effort: a notification or audit failure must never undo a
            // decision the reviewer already made.
            const notice = DECISION_NOTICE[decision];
            try {
                await Notification.create({
                    recipient: application.student._id || application.student,
                    title: notice.title,
                    message: note ? `${notice.message} ${note}` : notice.message,
                    type: "application",
                    link: "/student/application"
                });
            } catch (notificationError) {
                console.error("Application review notification error:", notificationError.message);
            }

            await logAudit({
                        req,
                        actor: req.user.account,
                        actionType: decision === "approved" ? "Account Approval" : decision === "rejected" ? "Account Rejection" : "Data Change",
                        description: decision === "additional_requirements" ?
                            `Requested additional documents for ${application.student.name}'s application` : `Marked ${application.student.name}'s application as ${decision}${note ? ` (${note})` : ""}`,
            targetType: "Application",
            targetId: application._id
        });

        res.json({ success: true, application, flaggedDocuments });
    } catch (error) { next(error); }
};

// ==========================================================
// BARANGAY — residency verification (stage 1 of the chain)
//
// GET   /api/barangays/applications
//   Submitted applications whose applicant is registered under the
//   logged-in Barangay Admin's own barangay (User.barangay — residency
//   source of truth, chosen by the student at registration).
//
// PATCH /api/barangays/applications/:id/verification
//   body: { status: "approved" | "rejected", notes?: string }
//     approved -> barangayVerificationStatus = "approved"
//                 (the application becomes visible to the City Office)
//     rejected -> barangayVerificationStatus = "rejected"
//                 (it never appears in the City Office queue)
// ==========================================================
const BARANGAY_VERIFICATION_DECISIONS = ["approved", "rejected"];

const listBarangayApplications = async(req, res, next) => {
    try {
        const ownBarangay = req.user.barangay?._id || req.user.barangay || null;
        if (!ownBarangay) return res.json({ success: true, applications: [] });

        const residents = await User.find
        ({ role: "student", barangay: ownBarangay }).select("_id");
        const residentIds = residents.map((row) => row._id);

        // Backfill application.barangay for records that predate the
        // two-stage flow so every other view can scope on it too.
        await Application.updateMany(
            { barangay: null, student: { $in: residentIds } },
            { $set: { barangay: ownBarangay } }
        );

        const applications = await Application.find({
            status: { $ne: "draft" },
            $or: [{ barangay: ownBarangay }, { student: { $in: residentIds } }]
        })
            .populate("student", "name email")
            .populate("barangay", "name")
            .sort({ createdAt: -1 });

        res.json({ success: true, applications });
    } catch (error) { next(error); }
};

const reviewBarangayApplication = async(req, res, next) => {
    try {
        const status = req.body?.status;
        const note = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";

        if (!BARANGAY_VERIFICATION_DECISIONS.includes(status)) {
            return res.status(400).json({ success: false, message: "Decision must be approved or rejected." });
        }
        if (status === "rejected" && !note) {
            return res.status(400).json({ success: false, message: "Please add a reason for the rejection." });
        }

        const ownBarangay = req.user.barangay?._id || req.user.barangay || null;
        if (!ownBarangay) {
            return res.status(403).json({ success: false, message: "Your account is not assigned to a barangay yet." });
        }

        const application = await Application.findById(req.params.id)
            .populate({
                path: "student",
                select: "name email barangay",
                populate: { path: "barangay", select: "name" }
            });
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });

        // Residency scope: the application must belong to this admin's own
        // barangay — either on the record or via the student's registration.
        const belongs = (value) => value && String(value) === String(ownBarangay);
        const studentBarangay = application.student?.barangay?._id || application.student?.barangay || null;
        const applicationBarangay = application.barangay?._id || application.barangay || null;
        if (!belongs(studentBarangay) && !belongs(applicationBarangay)) {
            return res.status(403).json({ success: false, message: "This application does not belong to your barangay." });
        }

        // Once the City Office has made a final decision the record is closed.
        if (application.status === "approved" || application.status === "rejected") {
            return res.status(409).json({
                success: false,
                message: "The City Scholarship Office has already decided this application."
            });
        }

        application.barangayVerificationStatus = status;
        application.barangayVerificationNotes = note;
        application.barangayReviewedAt = new Date();
        application.barangayReviewedBy = req.user.id;
        if (!application.barangay) application.barangay = ownBarangay;
        await application.save();

        await application.populate([
            { path: "student", select: "name email" },
            { path: "barangay", select: "name" }
        ]);

        // Best effort: a notification or audit failure must never undo a
        // decision the reviewer already made.
        try {
            await Notification.create({
                recipient: application.student._id || application.student,
                title: status === "approved" ?
                    "Barangay verification approved" :
                    "Barangay verification rejected",
                message: status === "approved" ?
                    "Your Barangay Office confirmed your residency. Your application is now with the City Scholarship Office for final review." :
                    `Your Barangay Office did not confirm your residency.${note ? ` ${note}` : ""}`,
                type: "application",
                link: "/student/application"
            });
        } catch (notificationError) {
            console.error("Barangay verification notification error:", notificationError.message);
        }

        await logAudit({
            req,
            actor: req.user.account,
            actionType: "Data Change",
            description: `Barangay ${status} ${application.student.name}'s application residency verification${note ? ` (${note})` : ""}`,
            targetType: "Application",
            targetId: application._id
        });

        res.json({ success: true, application });
    } catch (error) { next(error); }
};



// Canonical aliases used by routes/barangayRoutes.js. Keep the original
// handler names exported for callers that still use the earlier contract.
const listBarangayApplicationsCanonical = listBarangayApplications;

const getBarangayApplication = async(req, res, next) => {
    try {
        const ownBarangay = req.user.barangay?._id || req.user.barangay || null;
        if (!ownBarangay) {
            return res.status(403).json({ success: false, message: "Your account is not assigned to a barangay yet." });
        }

        const application = await Application.findById(req.params.id)
            .populate("student", "name email barangay")
            .populate("barangay", "name");
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });

        const belongs = (value) => value && String(value) === String(ownBarangay);
        const studentBarangay = application.student?.barangay?._id || application.student?.barangay || null;
        const applicationBarangay = application.barangay?._id || application.barangay || null;
        if (!belongs(studentBarangay) && !belongs(applicationBarangay)) {
            return res.status(403).json({ success: false, message: "This application does not belong to your barangay." });
        }

        const documents = await Document.find({ application: application._id })
            .sort({ createdAt: 1 });
        const publicDocuments = documents.map((document) => {
            const plain = typeof document.toObject === "function" ? document.toObject() : { ...document };
            delete plain.path;
            return plain;
        });
        res.json({ success: true, application, documents: publicDocuments });
    } catch (error) { next(error); }
};

const decideBarangayApplication = async(req, res, next) => {
    try {
        const decision = req.body?.decision;
        if (!["approve", "reject"].includes(decision)) {
            return res.status(400).json({ success: false, message: "Decision must be approve or reject." });
        }
        req.body = {
            ...req.body,
            status: decision === "approve" ? "approved" : "rejected",
            notes: typeof req.body?.notes === "string" ? req.body.notes : (req.body?.reason || "")
        };
        return reviewBarangayApplication(req, res, next);
    } catch (error) { next(error); }
};

module.exports = {
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    reviewApplication,
    listBarangayApplications,
    reviewBarangayApplication,
    listBarangayApplicationsCanonical,
    getBarangayApplication,
    decideBarangayApplication
};