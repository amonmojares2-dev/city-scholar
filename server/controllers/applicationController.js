const Application = require("../models/Application");
const User = require("../models/User");

const listApplications = async(req, res, next) => {
    try {
        const filter = req.user.role === "student" ? { student: req.user.id } : {};
        const applications = await Application.find(filter).populate("student", "name email").populate("barangay", "name").sort({ createdAt: -1 });
        res.json({ success: true, applications });
    } catch (error) { next(error); }
};

const getApplication = async(req, res, next) => {
    try {
        const application = await Application.findById(req.params.id).populate("student", "name email").populate("barangay", "name");
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });
        if (req.user.role === "student" && application.student._id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
        res.json({ success: true, application });
    } catch (error) { next(error); }
};

const createApplication = async(req, res, next) => {
    try {
        const application = await Application.create({...req.body, student: req.user.id, status: "submitted", submittedAt: new Date() });
        await User.findByIdAndUpdate(req.user.id, { $set: { profile: { ...(req.body.applicant || {}), schoolName: application.school } } });
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
        await User.findByIdAndUpdate(application.student, { $set: { profile: { ...(req.body.applicant || {}), schoolName: application.school } } });
        res.json({ success: true, application });
    } catch (error) { next(error); }
};

module.exports = { listApplications, getApplication, createApplication, updateApplication };