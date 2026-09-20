const mongoose = require("mongoose");

// Accredited schools / universities managed from the Super Admin
// "Schools & Barangays" page.
const schoolSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true, unique: true },
    address: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "Public" },
    contactPerson: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    }
}, { timestamps: true });

module.exports = mongoose.model("School", schoolSchema);