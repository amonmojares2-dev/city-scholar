const { upload } = require("../config/storage");

module.exports = {
    uploadSingleDocument: upload.single("file")
};