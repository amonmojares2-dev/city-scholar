const { EventEmitter } = require("events");

const mockGridFsBucket = {
    openUploadStream: jest.fn(() => {
        const stream = new EventEmitter();
        stream.end = jest.fn(() => setImmediate(() => stream.emit("finish")));
        return stream;
    }),
    openDownloadStreamByName: jest.fn(),
    find: jest.fn(),
    delete: jest.fn()
};

jest.mock("mongoose", () => ({
    connection: { db: {} },
    mongo: { GridFSBucket: jest.fn(() => mockGridFsBucket) }
}));

const storage = require("../config/storage");

describe("GridFS filename handling", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("persists, reads, and deletes by GridFS filename while deleting by its Mongo id", async() => {
        const filename = "0123456789abcdef0123456789abcdef.pdf";
        const objectId = "mongo-generated-object-id";
        mockGridFsBucket.find.mockReturnValue({
            toArray: jest.fn().mockResolvedValue([{ _id: objectId, filename }])
        });
        mockGridFsBucket.delete.mockResolvedValue(undefined);

        const file = {
            filename,
            originalname: "grades.pdf",
            mimetype: "application/pdf",
            buffer: Buffer.from("%PDF test")
        };
        await expect(storage.persistUpload(file)).resolves.toEqual({
            filename,
            originalName: "grades.pdf"
        });
        expect(mockGridFsBucket.openUploadStream).toHaveBeenCalledWith(filename, expect.any(Object));

        storage.openStoredDownload(filename);
        expect(mockGridFsBucket.openDownloadStreamByName).toHaveBeenCalledWith(filename);

        await storage.removeStoredFileByFilename(filename);
        expect(mockGridFsBucket.find).toHaveBeenCalledWith({ filename });
        expect(mockGridFsBucket.delete).toHaveBeenCalledWith(objectId);
    });

    it("treats an already-missing GridFS file as a successful cleanup", async() => {
        mockGridFsBucket.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
        const info = jest.spyOn(console, "info").mockImplementation(() => {});

        await expect(storage.removeStoredFileByFilename("0123456789abcdef0123456789abcdef.jpg")).resolves.toBeUndefined();

        expect(info).toHaveBeenCalledWith("GridFS file already missing: 0123456789abcdef0123456789abcdef.jpg");
        expect(mockGridFsBucket.delete).not.toHaveBeenCalled();
        info.mockRestore();
    });

    it("catches a GridFS file-not-found race and logs it at info level", async() => {
        const filename = "0123456789abcdef0123456789abcdef.jpg";
        mockGridFsBucket.find.mockReturnValue({
            toArray: jest.fn().mockResolvedValue([{ _id: "mongo-generated-id", filename }])
        });
        mockGridFsBucket.delete.mockRejectedValue(new Error("File not found for id mongo-generated-id"));
        const info = jest.spyOn(console, "info").mockImplementation(() => {});

        await expect(storage.removeStoredFileByFilename(filename)).resolves.toBeUndefined();

        expect(info).toHaveBeenCalledWith(`GridFS file already missing: ${filename}`);
        info.mockRestore();
    });
});
