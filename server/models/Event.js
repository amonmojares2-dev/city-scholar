const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    location: { type: String, required: true },
    required: { type: Boolean, default: false },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema);