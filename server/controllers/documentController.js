const Document = require("../models/Document");
const Application = require("../models/Application");

const listDocuments = async(req, res, next) => {
    try {
        const filter = req.user.role === "student" ? { student: req.user.id } : {};
        // City/admin reviewers scope document lists per application and per
        // portal flow: ?application=<id>&context=renewal shows only that
        // renewal submission's documents; ?context=application the originals.
        if (req.query.application) filter.application = req.query.application;
        const rawContext = String(req.query.context || "").trim().toLowerCase();
        if (rawContext === "renewal" || rawContext === "application") filter.context = rawContext;
        const documents = await Document.find(filter).populate("application", "program status").populate("student", "name email").sort({ createdAt: -1 });
        res.json({ success: true, documents });
    } catch (error) { next(error); }
};

const uploadDocument = async(req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "A PDF, JPEG, or PNG file is required" });
        const application = await Application.findById(req.body.application);
        if (!application) return res.status(404).json({ success: false, message: "Application not found" });
        if (req.user.role === "student" && application.student.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
        const document = await Document.create({ application: application._id, student: application.student, type: req.body.type || "other", originalName: req.file.originalname, filename: req.file.filename, path: req.file.path, mimeType: req.file.mimetype });
        res.status(201).json({ success: true, document });
    } catch (error) { next(error); }
};

const updateDocument = async(req, res, next) => {
    try {
        const document = await Document.findByIdAndUpdate(req.params.id, { status: req.body.status, remarks: req.body.remarks }, { new: true, runValidators: true });
        if (!document) return res.status(404).json({ success: false, message: "Document not found" });
        res.json({ success: true, document });
    } catch (error) { next(error); }
};

module.exports = { listDocuments, uploadDocument, updateDocument };