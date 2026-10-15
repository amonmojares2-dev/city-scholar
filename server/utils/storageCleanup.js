const { removeStoredFileByFilename } = require("../config/storage");

async function cleanupStoredFile(filename) {
    try {
        await removeStoredFileByFilename(filename);
    } catch (error) {
        console.error(`GridFS cleanup failed for ${filename}:`, error);
    }
}

module.exports = { cleanupStoredFile };
