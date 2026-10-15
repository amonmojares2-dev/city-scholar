const mongoose = require("mongoose");

// One attendance proof per student per event. This is the record of who
// attended what: an image upload (proof: hashed filename) approved/rejected by
// the City Office with a reason, plus the legacy "self-marked" attendees that
// old events carry (no image). Multiple schools reuse the same proof flow, so
// the proof is tied to the student, not to a single document upload.
const attendanceProofSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Status of the proof itself (the image path); "attended" is a separate,
    // proof-independent concept tracked on the student's scholar account.
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    reason: { type: String, default: "" },
    // Hashed GridFS filename, resolved only through the authenticated proof
    // image endpoint. The raw filename is never exposed to the client.
    proof: { type: String, default: null },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    // Timestamp the proof was submitted.
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { _id: true });

const eventSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    location: { type: String, required: true },
    // Reused for "requires attendance proof" (the City create/edit form label)
    // so "required" stays the single source of truth on the event.
    required: { type: Boolean, default: false },
    // Legacy self-marked attendance carried over from old events that did not
    // require proof. These rows are shown to City as "Self-marked (no proof)".
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Attendance proof records for students (image + approve/reject + reason).
    proofs: [attendanceProofSchema]
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema);