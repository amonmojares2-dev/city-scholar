const Event = require("../models/Event");
const Application = require("../models/Application");
const User = require("../models/User");
const Notification = require("../models/Notification");
const {
    persistUpload,
    openStoredDownload
} = require("../config/storage");
const { cleanupStoredFile } = require("../utils/storageCleanup");
const {
    isApprovedExistingScholar,
    canSubmitAttendanceProof,
    canReviewAttendanceProof
} = require("../utils/attendanceProof");

// Only the caller's own proof status is ever exposed here (see listEvents);
// other students' proofs and the raw attendees list are never returned.
function ownProofSummary(event, userId) {
    const proof = (event.proofs || []).find(
        (item) => item.student && item.student.toString() === String(userId)
    );
    if (!proof) return null;
    return {
        _id: proof._id,
        status: proof.status,
        reason: proof.reason,
        submittedAt: proof.submittedAt,
        reviewedAt: proof.reviewedAt
    };
}

async function hasEventAttendanceAccess(req) {
    if (canSubmitAttendanceProof(req)) return true;
    if (req.user?.account?.scholarType !== "new_applicant") return false;
    if (req.user.account.applicationApproved === true) return true;
    return Boolean(await Application.exists({
        student: req.user.id,
        status: { $in: ["approved", "renewal"] }
    }));
}

const listEvents = async (req, res, next) => {
    try {
        const events = await Event.find().sort({ startsAt: 1 });
        const now = Date.now();
        const attendanceAccess = await hasEventAttendanceAccess(req);
        const result = events.map((event) => {
            // Proof submission window: opens at startsAt, closes at endsAt + 48h
            // (or startsAt + 7 days when the event has no end time).
            const startsAt = new Date(event.startsAt).getTime();
            const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : null;
            const deadline = endsAt
                ? endsAt + 48 * 60 * 60 * 1000
                : startsAt + 7 * 24 * 60 * 60 * 1000;
            // Preserve `approved` as the existing-scholar approval indicator;
            // upload eligibility uses the shared Events page access rule below.
            const approved = isApprovedExistingScholar(req);
            const canSubmit = attendanceAccess && now >= startsAt && now <= deadline;
            return {
                ...event.toObject(),
                // Legacy "self-marked" flag for non-required events (the old
                // Attended button). Required events use proofs instead.
                attendanceStatus: event.attendees.some((attendee) => attendee.toString() === req.user.id) ? "attended" : null,
                // Only THIS caller's own proof status; never other students'
                // proofs and never the attendees list.
                ownProof: ownProofSummary(event, req.user.id),
                // Single-source-of-truth response contract for the attendance
                // proof block that the client must not recompute itself.
                approved,
                canSubmit,
                proofDeadline: new Date(deadline).toISOString(),
                ...(canReviewAttendanceProof(req.user.role) && {
                    attendanceCount: event.required
                        ? (event.proofs || []).filter((proof) => proof.status === "verified").length
                        : event.attendees.length
                })
            };
        });
        // proofs/attendees are raw ObjectId / proof docs that must not leak.
        result.forEach((event) => {
            delete event.proofs;
            delete event.attendees;
        });
        res.json({ success: true, events: result });
    } catch (error) {
        next(error);
    }
};

const markAttendance = async (req, res, next) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        // Required events use the proof flow, never the old self-marked toggle.
        if (event.required) {
            return res.status(409).json({ success: false, message: "This event requires attendance proof. Please upload your proof instead." });
        }
        await Event.findByIdAndUpdate(req.params.id, { $addToSet: { attendees: req.user.id } }, { returnDocument: "after" });
        res.json({ success: true, marked: true });
    } catch (error) {
        next(error);
    }
};

const createEvent = async (req, res, next) => {
    try {
        const { name, description, startsAt, endsAt, location, required = false } = req.body;
        if (!name || !startsAt || !location) {
            return res.status(400).json({ success: false, message: "Name, start time, and location are required" });
        }
        const startDate = new Date(startsAt);
        const endDate = endsAt ? new Date(endsAt) : null;
        if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
            return res.status(400).json({ success: false, message: "Enter valid event start and end times." });
        }
        if (endDate && endDate <= startDate) {
            return res.status(400).json({ success: false, message: "The event end time must be after its start time." });
        }
        const event = await Event.create({ name, description, startsAt, endsAt, location, required });
        res.status(201).json({ success: true, event });
    } catch (error) {
        next(error);
    }
};

const updateEvent = async (req, res, next) => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after", runValidators: true });
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        res.json({ success: true, event });
    } catch (error) {
        next(error);
    }
};

// Proof window: open at startsAt, close at endsAt + 48h (7-day fallback for
// events without an endsAt).
function getProofDeadline(event) {
    const endsAt = event.endsAt ? new Date(event.endsAt) : null;
    const deadline = endsAt ? new Date(endsAt.getTime() + 48 * 60 * 60 * 1000) : null;
    const fallback = new Date(event.startsAt ? new Date(event.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000 : Date.now());
    return deadline || fallback;
}

// ---- attendance proof upload (student) -----------------------------------
const uploadProof = async (req, res, next) => {
    let uploadCommitted = false;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Please select an image file to upload." });
        }
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        if (!event.required) {
            return res.status(400).json({ success: false, message: "Attendance proof is not required for this event." });
        }
        if (!await hasEventAttendanceAccess(req)) {
            return res.status(403).json({ success: false, message: "Event attendance access is required to upload proof." });
        }
        const now = new Date();
        const startsAt = new Date(event.startsAt);
        if (now < startsAt) {
            return res.status(422).json({ success: false, message: "The event has not started yet; proof submissions are not open." });
        }
        const deadline = getProofDeadline(event);
        if (now > deadline) {
            return res.status(410).json({ success: false, message: "The proof submission period for this event has ended." });
        }

        // One proof per student per event. Find the caller's existing proof so a
        // re-upload before the deadline replaces it: the old file is deleted and
        // the status resets to pending.
        const existing = (event.proofs || []).find(
            (item) => item.student && item.student.toString() === req.user.id
        );
        if (existing?.status === "verified") {
            return res.status(409).json({ success: false, message: "Your attendance has already been approved." });
        }
        const previousProofFilename = existing?.proof;
        if (existing) {
            existing.proof = req.file.filename;
            existing.originalName = req.file.originalname;
            existing.mimeType = req.file.mimetype;
            existing.status = "pending";
            existing.reason = "";
            existing.submittedAt = now;
            existing.reviewedBy = null;
            existing.reviewedAt = null;
        } else {
            event.proofs.push({
                student: req.user.id,
                status: "pending",
                reason: "",
                proof: req.file.filename,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                submittedAt: now,
                reviewedAt: null,
                reviewedBy: null
            });
        }
        // Persist the bytes to GridFS before the event record references them.
        const stored = await persistUpload(req.file);
        if (!stored) {
            return res.status(503).json({ success: false, message: "Storage is temporarily unavailable. Please try again." });
        }
        const saved = await event.save();
        uploadCommitted = true;
        if (previousProofFilename && previousProofFilename !== req.file.filename) {
            await cleanupStoredFile(previousProofFilename);
        }
        res.status(existing ? 200 : 201).json({ success: true, proof: ownProofSummary(saved, req.user.id) });
    } catch (error) {
        if (!uploadCommitted) await cleanupStoredFile(req.file && req.file.filename);
        next(error);
    }
};
// ---- remove an existing (pending) proof --------------------------------
const removeProof = async (req, res, next) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        if (!await hasEventAttendanceAccess(req)) return res.status(403).json({ success: false, message: "Not allowed" });
        const proof = event.proofs.id(req.params.proofId);
        if (!proof) return res.status(404).json({ success: false, message: "Proof not found" });
        if (proof.student.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Not allowed" });
        if (proof.status !== "pending") {
            return res.status(409).json({ success: false, message: "A proof can only be removed while it is pending review." });
        }
        const oldFilename = proof.proof;
        proof.proof = null;
        proof.originalName = "";
        proof.mimeType = "";
        proof.status = "pending";
        proof.reviewedBy = null;
        proof.reviewedAt = null;
        await event.save();
        if (oldFilename) await cleanupStoredFile(oldFilename);
        res.json({ success: true, message: "Proof removed." });
    } catch (error) {
        next(error);
    }
};

// ---- city view of proofs + self-marked attendees ------------------------
const getEventAttendance = async (req, res, next) => {
    try {
        const event = await Event.findById(req.params.id).populate("proofs.student", "name email profile.schoolName barangay");
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        if (!canReviewAttendanceProof(req.user.role)) return res.status(403).json({ success: false, message: "Not allowed" });

        const proofs = event.proofs || [];
        const deadline = getProofDeadline(event);
        const isPastDeadline = event.required && Date.now() > deadline.getTime();
        let students = [];
        if (event.required) {
            const approvedApplications = await Application.find({
                status: { $in: ["approved", "renewal"] }
            }).select("student").lean();
            const approvedApplicantIds = approvedApplications.map((application) => application.student);
            students = await User.find({
                role: "student",
                status: { $nin: ["suspended", "deactivated"] },
                archived: { $ne: true },
                $or: [
                    { scholarType: "existing_scholar", scholarVerificationStatus: { $in: ["pending", "approved"] } },
                    { _id: { $in: approvedApplicantIds } }
                ]
            }).select("name email profile.schoolName barangay").populate("barangay", "name").lean();
        }
        const proofByStudent = new Map(proofs.map((proof) => [
            String(proof.student?._id || proof.student),
            proof
        ]));
        const allRows = students.map((student) => {
            const proof = proofByStudent.get(String(student._id));
            const attendanceStatus = proof
                ? proof.status === "verified" ? "attended" : proof.status === "rejected" ? "absent" : "pending"
                : isPastDeadline ? "absent" : "not_submitted";
            return {
                _id: proof ? proof._id : student._id,
                proofId: proof?._id || null,
                student: {
                    _id: student._id,
                    name: student.name,
                    email: student.email,
                    school: student.profile?.schoolName || "",
                    barangay: student.barangay?.name || ""
                },
                submittedAt: proof?.submittedAt || null,
                status: proof?.status || attendanceStatus,
                attendanceStatus,
                reason: proof?.reason || "",
                hasProof: Boolean(proof),
                hasImage: Boolean(proof?.proof),
                updatedAt: proof?.reviewedAt || null
            };
        });
        // Preserve rows for legacy proofs whose owner is no longer an eligible
        // student account, so City staff can still see and review them.
        const knownStudents = new Set(allRows.map((row) => String(row.student._id)));
        for (const proof of proofs) {
            const studentId = String(proof.student?._id || proof.student);
            if (knownStudents.has(studentId)) continue;
            const student = proof.student || {};
            allRows.push({
                _id: proof._id,
                proofId: proof._id,
                student: {
                    _id: student._id || studentId,
                    name: student.name || "",
                    email: student.email || "",
                    school: student.profile?.schoolName || "",
                    barangay: student.barangay?.name || ""
                },
                submittedAt: proof.submittedAt,
                status: proof.status,
                attendanceStatus: proof.status === "verified" ? "attended" : proof.status === "rejected" ? "absent" : "pending",
                reason: proof.reason,
                hasProof: true,
                hasImage: Boolean(proof.proof),
                updatedAt: proof.reviewedAt
            });
        }
        const status = String(req.query.status || "").trim().toLowerCase();
        const search = String(req.query.search || "").trim().toLowerCase();
        const filtered = allRows
            .filter((row) => !status || status === "all" || row.status === status || row.attendanceStatus === status)
            .filter((row) => !search || String(row.student?.name || "").toLowerCase().includes(search));

        const selfMarked = event.attendees || [];
        const selfMarkedWithProof = selfMarked.filter((a) => {
            if (!a) return false;
            const exists = proofs.some((p) => p.student && p.student._id && p.student._id.toString() === a.toString());
            return !exists;
        });

        const counts = { pending: 0, verified: 0, rejected: 0, absent: 0, notSubmitted: 0, selfMarked: 0 };
        allRows.forEach((row) => {
            if (row.status === "pending") counts.pending += 1;
            if (row.status === "verified") counts.verified += 1;
            if (row.status === "rejected") counts.rejected += 1;
            if (row.attendanceStatus === "absent") counts.absent += 1;
            if (row.attendanceStatus === "not_submitted") counts.notSubmitted += 1;
        });
        selfMarkedWithProof.forEach(() => { counts.selfMarked += 1; });

        res.json({
            success: true,
            event: { name: event.name, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt, required: event.required, proofDeadline: deadline },
            proofCounts: counts,
            proofs: filtered,
            selfMarkedAttendees: selfMarkedWithProof
        });
    } catch (error) {
        next(error);
    }
};
// ---- verify / reject a proof (city office) -----------------------------
const verifyProof = async (req, res, next) => {
    try {
        const proofId = req.params.proofId;
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        const proof = event.proofs.id(proofId);
        if (!proof) return res.status(404).json({ success: false, message: "Proof not found" });
        if (!canReviewAttendanceProof(req.user.role)) return res.status(403).json({ success: false, message: "Not allowed" });
        proof.status = "verified";
        proof.reviewedBy = req.user.id;
        proof.reviewedAt = new Date();
        await event.save();

        try {
            await Notification.create({
                recipient: proof.student,
                title: "Proof verified",
                message: "Your attendance proof for " + event.name + " has been verified by the City Office.",
                type: "attendance",
                link: "/city/events/" + event._id
            });
        } catch (e) { /* notifications never block the decision */ }
        res.json({ success: true, proof: { _id: proof._id, status: proof.status, reviewedBy: proof.reviewedBy, reviewedAt: proof.reviewedAt } });
    } catch (error) {
        next(error);
    }
};

const rejectProof = async (req, res, next) => {
    try {
        const proofId = req.params.proofId;
        const note = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (!note) return res.status(400).json({ success: false, message: "Please add a short reason for the rejection." });
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        const proof = event.proofs.id(proofId);
        if (!proof) return res.status(404).json({ success: false, message: "Proof not found" });
        if (!canReviewAttendanceProof(req.user.role)) return res.status(403).json({ success: false, message: "Not allowed" });
        proof.status = "rejected";
        proof.reason = note;
        proof.reviewedBy = req.user.id;
        proof.reviewedAt = new Date();
        await event.save();

        try {
            await Notification.create({
                recipient: proof.student,
                title: "Proof rejected",
                message: "Your attendance proof for " + event.name + " was rejected: " + note,
                type: "attendance",
                link: "/city/events/" + event._id
            });
        } catch (e) { /* notifications never block the decision */ }
        res.json({ success: true, proof: { _id: proof._id, status: proof.status, reason: proof.reason } });
    } catch (error) {
        next(error);
    }
};

// ---- proof image file (authenticated, scoped) ---------------------------
const serveProofFile = async (req, res, next) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        const proof = event.proofs.id(req.params.proofId);
        if (!proof) return res.status(404).json({ success: false, message: "Proof not found" });
        if (!proof.proof) return res.status(404).json({ success: false, message: "No image stored for this proof." });

        const isOwner = proof.student.toString() === req.user.id;
        if (!isOwner && !canReviewAttendanceProof(req.user.role)) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        // The proof subdocument keeps the hashed filename under `.proof`.
        const download = await openStoredDownload(proof.proof);
        if (!download) {
            return res.status(404).json({ success: false, message: "Image missing, please re-upload." });
        }
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", proof.mimeType || "image/jpeg");
        res.setHeader("Content-Disposition", `inline; filename="${String(proof.originalName || "proof").replace(/"/g, "")}"`);
        download.on("error", () => {
            if (!res.headersSent) return res.status(404).json({ success: false, message: "Image missing, please re-upload." });
            res.destroy();
        });
        return download.pipe(res);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listEvents,
    markAttendance,
    createEvent,
    updateEvent,
    getEventAttendance,
    uploadProof,
    removeProof,
    verifyProof,
    rejectProof,
    serveProofFile
};
