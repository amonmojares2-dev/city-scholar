// Canonical document slots accepted for a new Application. Renewal document
// types remain separate because that portal flow uses its own context.
const APPLICATION_DOCUMENT_TYPES = Object.freeze([
    "Certificate of Matriculation",
    "Report Card",
    "School ID (Current)",
    "Parent Valid ID"
]);

function matchesRequiredDocument(documentType, requiredType) {
    return documentType === requiredType ||
        (requiredType === "Report Card" && documentType === "Report Card (Grade 12)");
}

module.exports = {
    APPLICATION_DOCUMENT_TYPES,
    matchesRequiredDocument
};