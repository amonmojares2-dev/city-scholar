// The document slots a student fills in on the Application page. Each key is
// stored as Document.type (see KNOWN_DOC_TYPES on the server), so the City
// Office review page can match an uploaded row to the slot it belongs to.
//
// A program configured by the Super Admin may declare its own
// `requiredDocuments` list — when it does, the City Office review page shows
// that list instead of this default one.
export interface DocumentTypeSlot {
  key: string;
  label: string;
  required: boolean;
}

// NOTE: the Certificates of Residency / Indigency (for both the student and the
// parent/guardian) were removed from the application flow. Barangay residency
// is verified by the Barangay Admin directly (application.barangayVerification-
// Status), so those uploads are no longer required or listed anywhere.
export const APPLICATION_DOCUMENT_TYPES: DocumentTypeSlot[] = [
  { key: 'Certificate of Matriculation', label: 'Certificate of Matriculation', required: true },
  { key: 'Report Card (Grade 12)', label: 'Grade 12 Report Card', required: true },
  { key: 'School ID (Current)', label: 'Current School ID', required: true },
  { key: 'Parent Valid ID', label: "Parent's Valid ID", required: true },
];
