const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const User = require("../models/User");
const Application = require("../models/Application");
const Document = require("../models/Document");
const Event = require("../models/Event");
const storage = require("../config/storage");
const {
    uploadSingleDocument,
    profilePhotoUpload,
    multerUploadOptions
} = require("../middleware/uploadMiddleware");
const studentDocumentRoutes = require("../routes/studentDocRoutes");
const documentRoutes = require("../routes/documentRoutes");
const userRoutes = require("../routes/userRoutes");
const eventRoutes = require("../routes/eventRoutes");
const { errorHandler } = require("../middleware/errorMiddleware");

jest.mock("../config/storage", () => ({
    ...jest.requireActual("../config/storage"),
    persistUpload: jest.fn(async(file) => ({ filename: file.filename }))
}));

const STUDENT_ID = "507f1f77bcf86cd799439011";
const APPLICATION_ID = "507f1f77bcf86cd799439012";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function resolvedQuery(value) {
    const query = {
        sort: jest.fn(() => query),
        populate: jest.fn(() => query),
        select: jest.fn(() => query),
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return query;
}

function createApp() {
    const app = express();
    app.use("/api/student/application/documents", studentDocumentRoutes);
    app.use("/api/documents", documentRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/events", eventRoutes);
    app.use(errorHandler);
    return app;
}

const app = createApp();

function authenticateAs(user) {
    process.env.JWT_SECRET = "upload-test-secret";
    const authQuery = resolvedQuery(user);
    jest.spyOn(User, "findById").mockReturnValue(authQuery);
    return `Bearer ${jwt.sign({ id: STUDENT_ID }, process.env.JWT_SECRET)}`;
}

function applicationRecord() {
    return {
        _id: APPLICATION_ID,
        student: STUDENT_ID,
        status: "draft",
        populate: jest.fn().mockResolvedValue(undefined),
        toString() {
            return APPLICATION_ID;
        }
    };
}

function configureDocumentSlotMocks() {
    const application = applicationRecord();
    const savedDocument = {
        _id: "507f1f77bcf86cd799439013",
        application: APPLICATION_ID,
        student: STUDENT_ID,
        type: "Report Card",
        context: "application",
        filename: "stored.png",
        originalName: "report-card.png",
        mimeType: "image/png",
        status: "pending"
    };
    jest.spyOn(Application, "findOne").mockReturnValue(resolvedQuery(application));
    jest.spyOn(Application, "findById").mockReturnValue(resolvedQuery(application));
    jest.spyOn(Document, "findOne")
        .mockResolvedValueOnce(null)
        .mockResolvedValue(savedDocument);
    jest.spyOn(Document, "findOneAndUpdate").mockResolvedValue(null);
    jest.spyOn(Document, "find").mockReturnValue({
        sort: jest.fn().mockResolvedValue([savedDocument])
    });
}

afterEach(() => {
    jest.restoreAllMocks();
    storage.persistUpload.mockClear();
});

describe("real Multer upload middleware", () => {
    it("uses a functional _handleFile on every configured Multer storage engine", () => {
        expect(multerUploadOptions).toHaveLength(2);
        for (const options of multerUploadOptions) {
            expect(typeof options.storage._handleFile).toBe("function");
            expect(options.limits).toEqual({ fileSize: 5 * 1024 * 1024, files: 1 });
            expect(typeof options.fileFilter).toBe("function");
        }
        expect(storage).not.toHaveProperty("upload");
        expect(storage).not.toHaveProperty("profilePhotoUpload");
    });

    it("accepts multipart student application documents into memory", async() => {
        const user = { _id: STUDENT_ID, role: "student", status: "active" };
        const authorization = authenticateAs(user);
        configureDocumentSlotMocks();

        const response = await request(app)
            .post("/api/student/application/documents")
            .set("Authorization", authorization)
            .field("docType", "Report Card")
            .attach("file", PNG, { filename: "report-card.png", contentType: "image/png" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(storage.persistUpload).toHaveBeenCalledWith(expect.objectContaining({
            originalname: "report-card.png",
            buffer: PNG
        }));
    });

    it("accepts multipart renewal grade copies through the student document route", async() => {
        const user = { _id: STUDENT_ID, role: "student", status: "active" };
        const authorization = authenticateAs(user);
        configureDocumentSlotMocks();

        const response = await request(app)
            .post("/api/student/application/documents")
            .set("Authorization", authorization)
            .field("context", "renewal")
            .field("docType", "Report Card")
            .attach("file", PNG, { filename: "renewal-grades.png", contentType: "image/png" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(storage.persistUpload).toHaveBeenCalledWith(expect.objectContaining({
            originalname: "renewal-grades.png",
            buffer: PNG
        }));
    });

    it("accepts multipart replacement documents through the document route", async() => {
        const user = { _id: STUDENT_ID, role: "student", status: "active" };
        const authorization = authenticateAs(user);
        const document = {
            _id: "507f1f77bcf86cd799439014",
            student: STUDENT_ID,
            type: "Report Card",
            filename: "old-file.png",
            requestedReissue: true,
            appealStatus: null,
            save: jest.fn().mockResolvedValue(undefined)
        };
        jest.spyOn(Document, "findById").mockResolvedValue(document);

        const response = await request(app)
            .post("/api/documents/507f1f77bcf86cd799439014/replace")
            .set("Authorization", authorization)
            .attach("file", PNG, { filename: "replacement.png", contentType: "image/png" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(storage.persistUpload).toHaveBeenCalledWith(expect.objectContaining({
            originalname: "replacement.png",
            buffer: PNG
        }));
    });

    it("accepts multipart profile photos through the profile-photo route", async() => {
        const user = {
            _id: STUDENT_ID,
            role: "student",
            status: "active",
            name: "Test Student",
            email: "student@example.com",
            save: jest.fn().mockResolvedValue(undefined)
        };
        process.env.JWT_SECRET = "upload-test-secret";
        const authorization = `Bearer ${jwt.sign({ id: STUDENT_ID }, process.env.JWT_SECRET)}`;
        jest.spyOn(User, "findById")
            .mockReturnValueOnce(resolvedQuery(user))
            .mockResolvedValueOnce(user);

        const response = await request(app)
            .post("/api/users/me/photo")
            .set("Authorization", authorization)
            .attach("file", PNG, { filename: "profile.png", contentType: "image/png" });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(storage.persistUpload).toHaveBeenCalledWith(expect.objectContaining({
            originalname: "profile.png",
            buffer: PNG
        }));
    });

    it("accepts multipart attendance proofs through the event route", async() => {
        const user = {
            _id: STUDENT_ID,
            role: "student",
            status: "active",
            scholarType: "existing_scholar",
            scholarVerificationStatus: "approved"
        };
        const authorization = authenticateAs(user);
        const event = {
            _id: "507f1f77bcf86cd799439015",
            required: true,
            startsAt: new Date(Date.now() - 60_000),
            endsAt: new Date(Date.now() + 60 * 60_000),
            proofs: [],
            save: jest.fn().mockImplementation(async() => event)
        };
        jest.spyOn(Event, "findById").mockResolvedValue(event);

        const response = await request(app)
            .post("/api/events/507f1f77bcf86cd799439015/attendance-proof")
            .set("Authorization", authorization)
            .attach("file", PNG, { filename: "attendance.png", contentType: "image/png" });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(storage.persistUpload).toHaveBeenCalledWith(expect.objectContaining({
            originalname: "attendance.png",
            buffer: PNG
        }));
    });

    it("returns the uploaded file bytes from Multer's memory storage", async() => {
        const app = express();
        app.post("/upload", uploadSingleDocument, (req, res) => {
            res.status(200).json({
                filename: req.file.filename,
                size: req.file.size,
                buffer: req.file.buffer.toString("hex")
            });
        });
        app.post("/photo", profilePhotoUpload, (req, res) => {
            res.status(200).json({ buffer: req.file.buffer.toString("hex") });
        });
        app.use((error, _req, res, _next) => {
            res.status(500).json({ message: error.message });
        });

        const response = await request(app)
            .post("/upload")
            .attach("file", PNG, { filename: "proof.png", contentType: "image/png" });

        expect(response.status).toBe(200);
        expect(response.body.filename).toMatch(/^[a-f0-9]{32}\.png$/);
        expect(response.body.size).toBe(PNG.length);
        expect(response.body.buffer).toBe(PNG.toString("hex"));
    });
});
