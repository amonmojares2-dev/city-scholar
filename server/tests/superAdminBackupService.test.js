const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const backupService = require("../services/superAdminBackupService");

function createDatabase(initialCollections = {}) {
    const collections = new Map(Object.entries(initialCollections).map(([name, documents]) => [
        name,
        {
            options: {},
            indexes: [{ v: 2, key: { _id: 1 }, name: "_id_" }],
            documents: [...documents]
        }
    ]));

    function getCollection(name) {
        const entry = collections.get(name);
        if (!entry) throw new Error(`Collection ${name} does not exist.`);
        return {
            find: () => ({ toArray: async() => entry.documents.map((document) => ({ ...document })) }),
            indexes: async() => entry.indexes.map((index) => ({ ...index })),
            createIndex: async(key, options) => {
                entry.indexes.push({ key, ...options });
            },
            insertMany: async(documents) => {
                entry.documents.push(...documents);
            }
        };
    }

    return {
        databaseName: "city-scholar-test",
        collections,
        listCollections: () => ({
            toArray: async() => [...collections.entries()].map(([name, value]) => ({
                name,
                options: value.options
            }))
        }),
        collection: getCollection,
        dropCollection: async(name) => collections.delete(name),
        createCollection: async(name, options) => {
            const entry = {
                options,
                indexes: [{ v: 2, key: { _id: 1 }, name: "_id_" }],
                documents: []
            };
            collections.set(name, entry);
            return getCollection(name);
        }
    };
}

describe("Super Admin backup service", () => {
    let originalDbDescriptor;
    let directory;
    let db;

    beforeEach(async() => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), "city-scholar-backups-"));
        process.env.BACKUP_STORAGE_DIR = directory;
        originalDbDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
        db = createDatabase({
            users: [
                { _id: new mongoose.Types.ObjectId(), name: "First user", createdAt: new Date("2025-01-01T00:00:00Z") },
                { _id: new mongoose.Types.ObjectId(), name: "Second user", createdAt: new Date("2025-02-01T00:00:00Z") }
            ],
            announcements: [{ _id: new mongoose.Types.ObjectId(), title: "Existing announcement" }]
        });
        Object.defineProperty(mongoose.connection, "db", {
            configurable: true,
            value: db
        });
    });

    afterEach(async() => {
        if (originalDbDescriptor) {
            Object.defineProperty(mongoose.connection, "db", originalDbDescriptor);
        } else {
            delete mongoose.connection.db;
        }
        delete process.env.BACKUP_STORAGE_DIR;
        await fs.rm(directory, { recursive: true, force: true });
    });

    it("requires a full backup before creating an incremental backup", async() => {
        await expect(backupService.createBackup({
            type: "incremental",
            notes: "",
            createdBy: "Admin"
        })).rejects.toMatchObject({ status: 400 });
    });

    it("stores restorable full and incremental snapshots including changed and deleted records", async() => {
        const originalUsers = db.collections.get("users").documents;
        const full = await backupService.createBackup({
            type: "full",
            notes: "Initial snapshot",
            createdBy: "Admin"
        });
        originalUsers[0].name = "Updated user";
        originalUsers.splice(1, 1);
        originalUsers.push({
            _id: new mongoose.Types.ObjectId(),
            name: "Added user",
            createdAt: new Date("2025-03-01T00:00:00Z")
        });
        db.collections.delete("announcements");
        db.collections.set("schools", {
            options: {},
            indexes: [{ v: 2, key: { _id: 1 }, name: "_id_" }],
            documents: [{ _id: new mongoose.Types.ObjectId(), name: "New school" }]
        });

        const incremental = await backupService.createBackup({
            type: "incremental",
            notes: "Changes",
            createdBy: "Admin"
        });
        const restoredCollections = await backupService._test.materializeBackup(incremental.id);
        const restoredByName = new Map(restoredCollections.map((collection) => [collection.name, collection]));
        const restoredUsers = restoredByName.get("users").documents;

        expect(full.type).toBe("full");
        expect(incremental.type).toBe("incremental");
        expect(incremental.baseId).toBe(full.id);
        expect(restoredByName.has("announcements")).toBe(false);
        expect(restoredByName.get("schools").documents[0].name).toBe("New school");
        expect(restoredUsers.map((user) => user.name)).toEqual(["Updated user", "Added user"]);
        expect(restoredUsers[0].createdAt).toBeInstanceOf(Date);
        expect(restoredUsers[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);

        const backups = await backupService.listBackups();
        expect(backups.map((backup) => backup.id)).toEqual([incremental.id, full.id]);
        expect(backups.every((backup) => backup.sizeBytes > 0)).toBe(true);
    });

    it("prevents deleting a full backup while an incremental backup depends on it", async() => {
        const full = await backupService.createBackup({
            type: "full",
            notes: "",
            createdBy: "Admin"
        });
        await backupService.createBackup({
            type: "incremental",
            notes: "",
            createdBy: "Admin"
        });

        await expect(backupService.deleteBackup(full.id)).rejects.toMatchObject({ status: 409 });
    });

    it("restores the database only after confirmation and creates a safety backup", async() => {
        const originalUsers = db.collections.get("users").documents;
        const full = await backupService.createBackup({
            type: "full",
            notes: "",
            createdBy: "Admin"
        });
        originalUsers[0].name = "Changed after snapshot";

        await expect(backupService.restoreBackup(full.id, "wrong", "Admin"))
            .rejects.toMatchObject({ status: 400 });

        const result = await backupService.restoreBackup(full.id, "RESTORE", "Admin");
        expect(result.safetyBackup.type).toBe("full");
        expect(db.collections.get("users").documents[0].name).not.toBe("Changed after snapshot");
        expect((await backupService.listBackups()).length).toBe(2);
    });
});
