const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const crypto = require("crypto");
const mongoose = require("mongoose");

const FORMAT_VERSION = 1;
const MAX_INCREMENTAL_CHAIN = 100;
const INSERT_BATCH_SIZE = 500;
const gzip = promisify(zlib.gzip);
const BACKUP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let operationInProgress = false;

class BackupError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = "BackupError";
        this.status = status;
    }
}

function getBackupDirectory() {
    return process.env.BACKUP_STORAGE_DIR
        ? path.resolve(process.env.BACKUP_STORAGE_DIR)
        : path.join(__dirname, "..", "backups");
}

function getDatabase() {
    const db = mongoose.connection.db;
    if (!db) throw new BackupError("The database is not connected.", 503);
    return db;
}

function getDatabaseName(db) {
    return db.databaseName || mongoose.connection.name || "";
}

function archivePath(id) {
    if (!BACKUP_ID_PATTERN.test(id)) throw new BackupError("Backup not found.", 404);
    return path.join(getBackupDirectory(), `${id}.backup.gz`);
}

function metadataPath(id) {
    if (!BACKUP_ID_PATTERN.test(id)) throw new BackupError("Backup not found.", 404);
    return path.join(getBackupDirectory(), `${id}.meta.json`);
}

function serialize(value) {
    return mongoose.mongo.BSON.EJSON.stringify(value, { relaxed: false });
}

function documentKey(document) {
    if (!document || document._id === undefined) {
        throw new BackupError("A database record is missing its identifier.");
    }
    return serialize(document._id);
}

function displaySize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function publicMetadata(metadata) {
    return { ...metadata, size: displaySize(metadata.sizeBytes || 0) };
}

async function writeFileAtomically(filePath, contents) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, contents, { flag: "wx", mode: 0o600 });
        await fs.rename(temporaryPath, filePath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        throw error;
    }
}

async function readMetadata(id) {
    try {
        const contents = await fs.readFile(metadataPath(id), "utf8");
        const metadata = JSON.parse(contents);
        if (metadata.id !== id || !BACKUP_ID_PATTERN.test(metadata.id)) {
            throw new BackupError("Backup metadata is invalid.");
        }
        return metadata;
    } catch (error) {
        if (error.code === "ENOENT") throw new BackupError("Backup not found.", 404);
        throw error;
    }
}

async function readArchive(id) {
    try {
        const compressed = await fs.readFile(archivePath(id));
        const archive = mongoose.mongo.BSON.EJSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
        if (archive.formatVersion !== FORMAT_VERSION || archive.id !== id) {
            throw new BackupError("This backup is invalid or uses an unsupported format.");
        }
        return archive;
    } catch (error) {
        if (error.code === "ENOENT") throw new BackupError("The backup file is missing.", 404);
        if (error instanceof BackupError) throw error;
        throw new BackupError("The backup file is damaged or cannot be read.");
    }
}

async function listBackups() {
    const directory = getBackupDirectory();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const files = await fs.readdir(directory);
    const metadataFiles = files.filter((file) => /^[0-9a-f-]+\.meta\.json$/i.test(file));
    const backups = [];

    for (const file of metadataFiles) {
        const id = file.slice(0, -".meta.json".length);
        const metadata = await readMetadata(id);
        backups.push(publicMetadata(metadata));
    }

    backups.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    return backups;
}

async function exportCollections(db) {
    const collectionDescriptors = await db.listCollections({}, { nameOnly: false }).toArray();
    const collections = [];

    for (const descriptor of collectionDescriptors) {
        if (descriptor.name.startsWith("system.")) continue;
        const collection = db.collection(descriptor.name);
        const [documents, indexes] = await Promise.all([
            collection.find({}).toArray(),
            collection.indexes()
        ]);
        collections.push({
            name: descriptor.name,
            options: descriptor.options || {},
            indexes,
            documents
        });
    }

    return collections;
}

function createMetadata({ id, type, createdAt, createdBy, notes, baseId, sizeBytes }) {
    const timestamp = new Date(createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
    const name = type === "full" ? `Full Backup — ${timestamp}` : `Incremental — ${timestamp}`;
    return {
        id,
        name,
        type,
        sizeBytes,
        createdAt,
        createdBy,
        status: "success",
        notes,
        baseId: baseId || null
    };
}

async function persistArchive(archive, metadata) {
    const directory = getBackupDirectory();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const compressed = await gzip(Buffer.from(serialize(archive)), { level: zlib.constants.Z_BEST_COMPRESSION });
    const backupFilePath = archivePath(archive.id);
    const backupMetadataPath = metadataPath(archive.id);
    const storedMetadata = { ...metadata, sizeBytes: compressed.byteLength };

    await writeFileAtomically(backupFilePath, compressed);
    try {
        await writeFileAtomically(backupMetadataPath, JSON.stringify(storedMetadata));
    } catch (error) {
        await fs.rm(backupFilePath, { force: true });
        throw error;
    }

    return storedMetadata;
}

async function getLatestBackup() {
    const backups = await listBackups();
    const latest = backups[0];
    return latest ? readMetadata(latest.id) : null;
}

async function materializeBackup(id) {
    const chain = [];
    const visited = new Set();
    let currentId = id;

    while (currentId) {
        if (visited.has(currentId) || chain.length >= MAX_INCREMENTAL_CHAIN) {
            throw new BackupError("The backup restore chain is invalid or too long.");
        }
        visited.add(currentId);
        const [metadata, archive] = await Promise.all([readMetadata(currentId), readArchive(currentId)]);
        if (metadata.type !== archive.type || metadata.baseId !== (archive.baseId || null)) {
            throw new BackupError("Backup metadata does not match its archive.");
        }
        chain.unshift(archive);
        if (archive.type === "full") break;
        if (archive.type !== "incremental" || !archive.baseId) {
            throw new BackupError("The incremental backup has no full backup to restore from.");
        }
        currentId = archive.baseId;
    }

    if (!chain.length || chain[0].type !== "full") {
        throw new BackupError("A full backup required by this restore is missing.");
    }

    const collections = new Map();
    for (const collection of chain[0].collections) {
        collections.set(collection.name, {
            name: collection.name,
            options: collection.options || {},
            indexes: collection.indexes || [],
            documents: new Map(collection.documents.map((document) => [documentKey(document), document]))
        });
    }

    for (const archive of chain.slice(1)) {
        for (const name of archive.droppedCollections || []) collections.delete(name);
        for (const change of archive.collections || []) {
            let collection = collections.get(change.name);
            if (!collection) {
                collection = { name: change.name, options: {}, indexes: [], documents: new Map() };
                collections.set(change.name, collection);
            }
            collection.options = change.options || {};
            collection.indexes = change.indexes || [];
            for (const idToDelete of change.deletes || []) collection.documents.delete(serialize(idToDelete));
            for (const document of change.upserts || []) collection.documents.set(documentKey(document), document);
        }
    }

    return [...collections.values()].map((collection) => ({
        name: collection.name,
        options: collection.options,
        indexes: collection.indexes,
        documents: [...collection.documents.values()]
    }));
}

async function createBackupRecord({ type, notes, createdBy }) {
    const db = getDatabase();
    const latest = await getLatestBackup();
    let backupType = type;
    let baseId = null;
    let collections;
    let droppedCollections = [];

    if (backupType === "incremental") {
        if (!latest) {
            throw new BackupError("Create a full backup before creating an incremental backup.", 400);
        }
        const previousCollections = await materializeBackup(latest.id);
        const currentCollections = await exportCollections(db);
        const previousByName = new Map(previousCollections.map((collection) => [collection.name, collection]));
        const currentByName = new Map(currentCollections.map((collection) => [collection.name, collection]));

        droppedCollections = [...previousByName.keys()].filter((name) => !currentByName.has(name));
        collections = currentCollections.map((current) => {
            const previous = previousByName.get(current.name);
            const previousDocuments = new Map((previous?.documents || []).map((document) => [documentKey(document), document]));
            const currentDocuments = new Map(current.documents.map((document) => [documentKey(document), document]));
            const upserts = current.documents.filter((document) => {
                const previousDocument = previousDocuments.get(documentKey(document));
                return !previousDocument || serialize(previousDocument) !== serialize(document);
            });
            const deletes = [...previousDocuments.keys()]
                .filter((key) => !currentDocuments.has(key))
                .map((key) => previousDocuments.get(key)._id);

            if (!previous || upserts.length || deletes.length ||
                serialize(previous.options || {}) !== serialize(current.options || {}) ||
                serialize(previous.indexes || []) !== serialize(current.indexes || [])) {
                return {
                    name: current.name,
                    options: current.options,
                    indexes: current.indexes,
                    upserts,
                    deletes
                };
            }
            return null;
        }).filter(Boolean);
        baseId = latest.id;
    } else {
        backupType = "full";
        collections = (await exportCollections(db)).map((collection) => ({
            ...collection,
            documents: collection.documents
        }));
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const archive = {
        formatVersion: FORMAT_VERSION,
        id,
        type: backupType,
        baseId,
        databaseName: getDatabaseName(db),
        createdAt,
        collections,
        droppedCollections
    };
    const metadata = createMetadata({
        id,
        type: backupType,
        createdAt,
        createdBy,
        notes,
        baseId
    });
    const storedMetadata = await persistArchive(archive, metadata);
    return publicMetadata(storedMetadata);
}

async function withOperation(operation) {
    if (operationInProgress) throw new BackupError("Another backup operation is already in progress.", 409);
    operationInProgress = true;
    try {
        return await operation();
    } finally {
        operationInProgress = false;
    }
}

async function createBackup(options) {
    return withOperation(() => createBackupRecord(options));
}

function isDescendantOf(backupsById, candidate, ancestorId) {
    const visited = new Set();
    let baseId = candidate.baseId;
    while (baseId) {
        if (baseId === ancestorId) return true;
        if (visited.has(baseId)) return false;
        visited.add(baseId);
        baseId = backupsById.get(baseId)?.baseId || null;
    }
    return false;
}

async function deleteBackup(id) {
    return withOperation(async() => {
        const metadata = await readMetadata(id);
        const records = await listBackups();
        const backupsById = new Map(records.map((record) => [record.id, record]));
        const dependent = records.find((record) => isDescendantOf(backupsById, record, id));
        if (dependent) {
            throw new BackupError(`This backup is required by "${dependent.name}". Delete dependent incremental backups first.`, 409);
        }
        await fs.rm(archivePath(id), { force: false });
        await fs.rm(metadataPath(id), { force: false });
        return metadata;
    });
}

function indexOptions(index) {
    const { key, v, ns, background, dropDups, ...options } = index;
    return options;
}

async function replaceDatabase(collections, db) {
    const currentCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const descriptor of currentCollections) {
        if (descriptor.name.startsWith("system.")) continue;
        await db.dropCollection(descriptor.name);
    }

    for (const snapshot of collections) {
        if (!snapshot.name || snapshot.name.startsWith("system.") || !Array.isArray(snapshot.documents)) {
            throw new BackupError("The backup contains an invalid collection.");
        }
        const collection = await db.createCollection(snapshot.name, snapshot.options || {});
        for (const index of snapshot.indexes || []) {
            if (index.name === "_id_" || !index.key) continue;
            await collection.createIndex(index.key, indexOptions(index));
        }
        for (let offset = 0; offset < snapshot.documents.length; offset += INSERT_BATCH_SIZE) {
            await collection.insertMany(snapshot.documents.slice(offset, offset + INSERT_BATCH_SIZE), { ordered: true });
        }
    }
}

async function restoreBackup(id, confirmation, createdBy) {
    return withOperation(async() => {
        if (confirmation !== "RESTORE") throw new BackupError("Type RESTORE to confirm this action.", 400);
        const db = getDatabase();
        const archive = await readArchive(id);
        const selectedMetadata = await readMetadata(id);
        if (selectedMetadata.type !== archive.type || selectedMetadata.baseId !== (archive.baseId || null)) {
            throw new BackupError("Backup metadata does not match its archive.");
        }
        if (archive.databaseName !== getDatabaseName(db)) {
            throw new BackupError("This backup belongs to a different database and cannot be restored here.", 409);
        }
        const collections = await materializeBackup(id);
        const safetyBackup = await createBackupRecord({
            type: "full",
            notes: `Automatic safety backup before restoring ${selectedMetadata.name}`,
            createdBy
        });
        try {
            await replaceDatabase(collections, db);
        } catch (error) {
            throw new BackupError(
                `Restore did not complete. The pre-restore safety backup "${safetyBackup.name}" is available, but the database may be partially restored. ${error.message}`
            );
        }
        return { restored: publicMetadata(selectedMetadata), safetyBackup };
    });
}

module.exports = {
    BackupError,
    createBackup,
    deleteBackup,
    listBackups,
    restoreBackup,
    _test: {
        materializeBackup,
        replaceDatabase,
        displaySize,
        getBackupDirectory
    }
};
