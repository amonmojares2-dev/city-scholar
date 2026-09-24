const Barangay = require("../models/Barangay");

const listBarangays = async(_req, res, next) => {
    try {
        const barangays = await Barangay.find({ status: "active" }).select("_id name city province").sort({ name: 1 }).lean();
        res.json({ success: true, barangays });
    } catch (error) {
        console.error("Barangay list error:", error);
        next(error);
    }
};

module.exports = { listBarangays };