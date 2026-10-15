const Event = require("../models/Event");
const Notification = require("../models/Notification");
const {
    persistUpload,
    openStoredDownload
} = require("../config/storage");
const { cleanupStoredFile } = require("../utils/storageCleanup");
const {
    isApprovedExistingScholar,
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

const listEvents = async (req, res, next) => {
    try {
        const events = await Event.find().sort({ startsAt: 1 });
        const now = Date.now();
        const result = events.map((event) => {
            // Proof submission window: opens at startsAt, closes at endsAt + 48h
            // (or startsAt + 7 days when the event has no end time).
            const startsAt = new Date(event.startsAt).getTime();
            const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : null;
            const deadline = endsAt
                ? endsAt + 48 * 60 * 60 * 1000
                : startsAt + 7 * 24 * 60 * 60 * 1000;
            // Caller may only submit a proof while an approved existing scholar
            // AND while the proof window is open. Recomputed here so the UI
            // cannot disagree with the backend.
            const approved = isApprovedExistingScholar(req);
            const canSubmit = approved && now >= startsAt && now <= deadline;
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
                proofDeadline: new Date(deadline).toISOString()
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
        if (!isApprovedExistingScholar(req)) {
            return res.status(403).json({ success: false, message: "Attendance proof is available to approved scholars only." });
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
        if (!isApprovedExistingScholar(req)) return res.status(403).json({ success: false, message: "Not allowed" });
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
        // Show every submitted proof by default; the ?status= filter narrows it
        // (pending | verified | rejected | all) so the reviewer can see rejects.
        let filtered = proofs.slice();
        const status = String(req.query.status || "").trim().toLowerCase();
        if (status && status !== "all") filtered = filtered.filter((p) => p.status === status);
        const search = String(req.query.search || "").trim().toLowerCase();
        if (search) filtered = filtered.filter((p) => (p.student && String(p.student.name || "").toLowerCase()).includes(search));

        const selfMarked = event.attendees || [];
        const selfMarkedWithProof = selfMarked.filter((a) => {
            if (!a) return false;
            const exists = proofs.some((p) => p.student && p.student._id && p.student._id.toString() === a.toString());
            return !exists;
        });

        const counts = { pending: 0, verified: 0, rejected: 0, selfMarked: 0 };
        proofs.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
        selfMarkedWithProof.forEach(() => { counts.selfMarked += 1; });

        const proofRows = filtered.map((p) => {
            const student = p.student || {};
            return {
                _id: p._id,
                student: {
                    _id: student._id,
                    name: student.name,
                    email: student.email,
                    school: student.profile?.schoolName || "",
                    barangay: student.barangay?.name || ""
                },
                submittedAt: p.submittedAt,
                status: p.status,
                reason: p.reason,
                hasImage: Boolean(p.proof),
                updatedAt: p.reviewedAt
            };
        });

        res.json({
            success: true,
            event: { name: event.name, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt, required: event.required },
            proofCounts: counts,
            proofs: proofRows,
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
