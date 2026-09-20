const User = require("../models/User");
const { logAudit } = require("../utils/audit");

// ==========================================
// City Office - Scholar Approval
//
// Students who registered as "Existing Scholar" are listed here with the
// Scholar ID they claimed. The City Office confirms the claim against the
// active scholar registry:
//   pending  -> approved : the student is confirmed as an existing scholar
//                          and their Renewal page unlocks
//            -> rejected : the account could not be confirmed, so it is
//                          moved over to New Applicant access (Application
//                          back in the portal, Renewal and Event
//                          Attendance out of it)
// ==========================================

// eslint-disable-next-line no-unused-vars
const DECISIONS = ["approved", "rejected"];

function serializeAccount(student) {
    const status = student.scholarVerificationStatus || "pending";
    const scholarType = student.scholarType || "new_applicant";

    // The review status that decision is about the claimed Scholar ID.
    const verificationStatus = status;

    // client-side "registrationType" (DB column: scholarType)
    const registrationType = scholarType;

    // client-side "scholarStatus" — only meaningful when registrationType is
    // "existing_scholar"; null-like for new_applicant accounts.
    let scholarStatus = null;
    if (registrationType === "existing_scholar") {
        // Map DB values to the client-facing plan names:
        //   pending -> pending_review
        //   approved -> approved
        //   rejected -> rejected (normal case; see reject branch below)
        scholarStatus = status === "pending" ? "pending_review" : status;
    }

    return {
        id: String(student._id),
        name: student.name,
        email: student.email,
        scholarId: student.scholarId || "",
        school: (student.profile && student.profile.schoolName) || "",
        barangay: (student.barangay && student.barangay.name) || "Not provided",
        registeredDate: student.createdAt,
        // Only two values: the account is still an Existing Scholar claim, or
        // it was rejected and moved to New Applicant access.
        portalAccess: scholarType === "existing_scholar" ?
            "existing_scholar" : "new_applicant",
        registrationType,
        scholarStatus,
        // Only meaningful after a rejection. When true the account is no longer
        // an Existing Scholar — it now has New Applicant access (Application back
        // in the portal, Renewal and Event Attendance locked).
        movedToNewApplicant: scholarType === "new_applicant" && verificationStatus === "rejected",
        status: verificationStatus,
        notes: student.scholarVerificationNotes || "",
        verifiedAt: student.scholarVerifiedAt || null
    };
}

// GET /api/city/scholar-approval
const listScholarRegistrations = async(req, res) => {
    try {
        // Every student who registered as an Existing Scholar appears here,
        // both still-pending and already-approved ones. That way:
        //   - A reviewer can see the full list of Existing Scholar claims
        //     and tell at a glance which ones have already been confirmed.
        //   - An approved student's row stays visible on this page (marked
        //     "Approved") instead of disappearing after the decision.
        //   - The City Scholars page can pull from the same pool of approved
        //     existing-scholar accounts.
        //
        // Rejected claims are NOT listed: the reject branch flips
        // scholarType to "new_applicant", so they fall out of this query
        // naturally and behave like ordinary new applicants from then on.
        const students = await User.find({
                role: "student",
                scholarType: "existing_scholar"
            })
            .populate("barangay", "name")
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            accounts: students.map(serializeAccount)
        });
    } catch (error) {
        console.error("Scholar approval list error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load existing scholar registrations."
        });
    }
};

// PATCH /api/city/scholar-approval/:id
const reviewScholarRegistration = async(req, res) => {
    try {
        const { status, notes } = req.body || {};

        if (!DECISIONS.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Decision must be either approved or rejected."
            });
        }

        const student = await User.findOne({
                _id: req.params.id,
                role: "student",
                scholarType: "existing_scholar"
            })
            .populate("barangay", "name");

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Existing scholar registration not found."
            });
        }

        student.scholarVerificationStatus = status;
        student.scholarVerificationNotes = typeof notes === "string" ?
            notes.trim() :
            "";

        if (status === "approved") {
            // Confirmed as an existing scholar: Renewal unlocks.
            student.scholarVerifiedAt = new Date();
        } else {
            // Not an existing scholar. Move the account over to New
            // Applicant access so the student lands in the applicant portal
            // (Application, no Renewal / Event Attendance) and can apply
            // like any first-time applicant.
            //
            // Clear the verification status and timestamp so the account no
            // longer carries any review state — the student now behaves
            // exactly like a self-registered new applicant. This is a single
            // atomic update (scholarType + scholarVerificationStatus together)
            // so the student's access flips immediately on their next request.
            student.scholarType = "new_applicant";
            student.scholarVerificationStatus = "not_required";
            student.scholarVerificationNotes = "";
            student.scholarVerifiedAt = null;
        }

        await student.save();

        await logAudit({
            req,
            actor: req.user.account,
            actionType: status === "approved" ?
                "Scholar Approved" : "Scholar Rejected",
            description: status === "approved" ?
                `${student.name} was confirmed as an existing scholar` : `${student.name}'s existing scholar registration was rejected; account moved to New Applicant access`,
            targetType: "User",
            targetId: student._id
        });

        return res.json({
            success: true,
            account: serializeAccount(student)
        });
    } catch (error) {
        console.error("Scholar approval review error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save the scholar approval decision."
        });
    }
};

module.exports = {
    listScholarRegistrations,
    reviewScholarRegistration
};