const mongoose = require("mongoose");

const barangaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    city: {
        type: String,
        required: true,
        default: "Dagupan City"
    },

    province: {
        type: String,
        required: true,
        default: "Pangasinan"
    },

    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Barangay", barangaySchema);