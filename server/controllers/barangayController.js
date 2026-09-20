const mongoose = require("mongoose");
const Barangay = require("../models/Barangay");

const listBarangays = async(_req, res, next) => {
    console.log("Mongo readyState:", mongoose.connection.readyState);
    try {
        const barangays = await Barangay.find({ status: "active" }).select("_id name city province").sort({ name: 1 }).lean();
        console.log("Barangays found:", barangays.length);
        res.json({ success: true, barangays });
    } catch (error) {
        console.error("Barangay list error:", error);
        next(error);
    }
};

module.exports = { listBarangays };