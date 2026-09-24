const fs = require("fs");
const os = require("os");
const path = require("path");
const {
    validateDocumentUpload,
    validateProfilePhotoUpload
} = require("../middleware/uploadMiddleware");

function runUploadMiddleware(middleware, file) {
    let nextError = null;
    middleware({ file }, {}, error => { nextError = error; });
    return nextError;
}

const User = require("../models/User");
const Application = require("../models/Application");
const Document = require("../models/Document");
const { validateRegistration } = require("../utils/validation");
const { updateStudentApplication } = require("../controllers/studentApplicationController");
const { uploadStudentDocument, missingRequiredApplicationDocuments } = require("../controllers/studentDocController");

const applicationId = "507f1f77bcf86cd799439011";
const studentId = "507f191e810c19729de860ea";

function resolvedQuery(value) {
    return {
        sort: jest.fn().mockResolvedValue(value),
        populate: jest.fn().mockResolvedValue(value)
    };
}

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

function uploadRequest() {
    return {
        user: { id: studentId, role: "student" },
        body: { context: "application", docType: "Report Card" },
        file: {
            filename: "new-report-card.png",
            originalname: "report-card.png",
            mimetype: "image/png",
            size: 8
        }
    };
}

describe("student application document uploads", () => {
    afterEach(() => jest.restoreAllMocks());

    it("atomically creates or replaces a document slot", async() => {
        const application = { _id: applicationId, student: studentId, status: "draft" };
        const storedDocument = { _id: "document-id", filename: "new-report-card.png" };
        const documents = [storedDocument];

        jest.spyOn(Application, "findOne").mockReturnValue(resolvedQuery(application));
        jest.spyOn(Document, "findOne").mockResolvedValue(storedDocument);
        const update = jest.spyOn(Document, "findOneAndUpdate")
            .mockResolvedValue({ _id: "document-id", filename: "old-report-card.png" });
        jest.spyOn(Application, "findById").mockReturnValue(resolvedQuery(application));
        jest.spyOn(Document, "find").mockReturnValue({
            sort: jest.fn().mockResolvedValue(documents)
        });

        const res = response();
        await uploadStudentDocument(uploadRequest(), res, jest.fn());

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                application: applicationId,
                context: "application",
                type: "Report Card"
            }),
            expect.objectContaining({ $set: expect.objectContaining({ filename: "new-report-card.png" }) }),
            expect.objectContaining({ upsert: true, new: false })
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("retries a duplicate-key race as a replacement instead of returning 409", async() => {
        const application = { _id: applicationId, student: studentId, status: "draft" };
        const storedDocument = { _id: "document-id", filename: "new-report-card.png" };
        const duplicate = Object.assign(new Error("duplicate key"), { code: 11000 });

        jest.spyOn(Application, "findOne").mockReturnValue(resolvedQuery(application));
        jest.spyOn(Document, "findOne").mockResolvedValue(storedDocument);
        const update = jest.spyOn(Document, "findOneAndUpdate")
            .mockRejectedValueOnce(duplicate)
            .mockResolvedValueOnce({ _id: "document-id", filename: "raced-report-card.png" });
        jest.spyOn(Application, "findById").mockReturnValue(resolvedQuery(application));
        jest.spyOn(Document, "find").mockReturnValue({
            sort: jest.fn().mockResolvedValue([storedDocument])
        });

        const res = response();
        const next = jest.fn();
        await uploadStudentDocument(uploadRequest(), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledTimes(2);
        expect(update.mock.calls[1][2]).toEqual(expect.objectContaining({ new: false }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns a clear 409 when the application is already locked", async() => {
        jest.spyOn(Application, "findOne")
            .mockReturnValueOnce(resolvedQuery(null))
            .mockReturnValueOnce(resolvedQuery({ _id: applicationId, status: "submitted" }));

        const res = response();
        const next = jest.fn();
        await uploadStudentDocument(uploadRequest(), res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: "Documents can no longer be changed because your application was already submitted."
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("treats the historical Grade 12 report card as the current report-card slot", async() => {
        jest.spyOn(Document, "find").mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { type: "Certificate of Matriculation" },
                    { type: "Report Card (Grade 12)" },
                    { type: "School ID (Current)" },
                    { type: "Parent Valid ID" }
                ])
            })
        });

        await expect(missingRequiredApplicationDocuments(applicationId)).resolves.toEqual([]);
    });
});

const validRegistration = {
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@example.com",
    password: "Password1",
    role: "student",
    scholarType: "new_applicant",
    barangay: "Bonuan Boquig"
};

describe("university account contract", () => {
    it("stores university as a first-class User field", () => {
        const path = User.schema.path("university");
        expect(path).toBeDefined();
        expect(path.instance).toBe("String");
    });

    it("accepts the explicit university key used by Create Account", () => {
        const error = validateRegistration(
            { ...validRegistration, university: "University of Luzon" },
            new Set(["Bonuan Boquig"])
        );
        expect(error).toBeNull();
    });

    it("rejects a missing university", () => {
        const error = validateRegistration(
            validRegistration,
            new Set(["Bonuan Boquig"])
        );
        expect(error).toBe("Please select a valid University.");
    });

    it("rejects an edited university that is not in the allowlist", () => {
        const error = validateRegistration(
            { ...validRegistration, university: "Edited University" },
            new Set(["Bonuan Boquig"])
        );
        expect(error).toBe("Please select a valid University.");
    });

    it("does not accept the obsolete school key as a new registration contract", () => {
        const error = validateRegistration(
            { ...validRegistration, school: "University of Luzon" },
            new Set(["Bonuan Boquig"])
        );
        expect(error).toBe("Please select a valid University.");
    });

    it("overwrites forged application university values with User.university", async () => {
        const ownerQuery = {
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ university: "Exact Saved University Name" })
            })
        };
        const application = {
            status: "draft",
            applicant: {},
            school: "Old University",
            university: "Old University",
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue(undefined)
        };

        jest.spyOn(User, "findById").mockReturnValue(ownerQuery);
        jest.spyOn(User, "findByIdAndUpdate").mockResolvedValue({});
        jest.spyOn(Application, "findOne").mockReturnValue({
            sort: jest.fn().mockResolvedValue(application)
        });

        const req = {
            user: { id: "student-id" },
            body: {
                university: "Forged University",
                school: "Forged University",
                applicant: { course: "BS Computer Science" }
            }
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await updateStudentApplication(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(application.university).toBe("Exact Saved University Name");
        expect(application.school).toBe("Exact Saved University Name");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            application: expect.objectContaining({ university: "Exact Saved University Name" })
        }));

        jest.restoreAllMocks();
    });
});

describe("upload security rules", () => {
    let directory;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "city-scholar-upload-"));
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it("accepts a real PNG document by MIME, extension, and magic bytes", () => {
        const filename = path.join(directory, "valid.png");
        fs.writeFileSync(filename, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

        const error = runUploadMiddleware(validateDocumentUpload, {
            path: filename,
            filename: path.basename(filename),
            originalname: "valid.png",
            mimetype: "image/png",
            size: 8
        });

        expect(error).toBeUndefined();
    });

    it("rejects an executable renamed as JPEG", () => {
        const filename = path.join(directory, "renamed.jpg");
        fs.writeFileSync(filename, Buffer.from("MZ executable"));

        const error = runUploadMiddleware(validateDocumentUpload, {
            path: filename,
            filename: path.basename(filename),
            originalname: "renamed.jpg",
            mimetype: "image/jpeg",
            size: 13
        });

        expect(error?.statusCode).toBe(400);
        expect(error?.message).toContain("not a valid");
        expect(fs.existsSync(filename)).toBe(false);
    });

    it("rejects PDF for a profile photo and files larger than 5 MB", () => {
        const pdf = path.join(directory, "document.pdf");
        fs.writeFileSync(pdf, "%PDF-1.7");
        const pdfError = runUploadMiddleware(validateProfilePhotoUpload, {
            path: pdf,
            filename: path.basename(pdf),
            originalname: "document.pdf",
            mimetype: "application/pdf",
            size: 8
        });
        expect(pdfError?.statusCode).toBe(400);

        const oversized = path.join(directory, "large.png");
        fs.writeFileSync(oversized, "png");
        const sizeError = runUploadMiddleware(validateDocumentUpload, {
            path: oversized,
            filename: path.basename(oversized),
            originalname: "large.png",
            mimetype: "image/png",
            size: 5 * 1024 * 1024 + 1
        });
        expect(sizeError?.statusCode).toBe(400);
        expect(sizeError?.message).toContain("5 MB");
    });
});