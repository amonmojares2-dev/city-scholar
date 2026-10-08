// ==========================================
// OpenAI vision integration — grade document extraction
// ==========================================
//
// Reads an uploaded grade document (image or PDF) and returns the student's
// academic record as structured JSON.
//
// Provider: OpenAI (gpt-4o). Configure with:
//   OPENAI_API_KEY        (required — extraction is unavailable without it)
//   OPENAI_VISION_MODEL   (optional, defaults to "gpt-4o")
//
// This is the only part of the system that costs money per call, so every
// request here is deliberately defensive: a 60s timeout, a bounded token
// budget, and a hard failure (never a crash) when the model cannot read the
// document. No SDK dependency — Node 18+ ships global fetch, matching the
// plain-HTTPS style already used for Brevo in utils/email.js.

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const REQUEST_TIMEOUT_MS = 60000;
const MAX_OUTPUT_TOKENS = 1500;

// A transcript lists every subject ever taken; cap the list so one runaway
// document cannot produce an unbounded row.
const MAX_SUBJECTS = 30;

// Two grading scales can appear on a Dagupan college grade document, and the
// system must never assume one for every document:
//   "A" — 1.00-5.00 INVERSE scale: 1.00 is the best grade (Excellent), a
//         subject passes at 3.00 or below, 5.00 means Failed. LOWER is BETTER.
//   "B" — 0-100 percentage scale: 80 is the passing mark (equivalent to 3.00
//         on Scale A). HIGHER is BETTER.
// The prompt asks the model to detect the scale and echo it back as
// `gradingScale`; detection below is the safety net when it does not.
const { GRADING, SCALE_PASSING_MARKS, SCALE_KEY, defaultPassingMark: configDefaultPassingMark, isFailingGrade: configIsFailingGrade } = require("./gradingConfig");

// Scale A bounds (1.00-5.00, inverse).
const SCALE_A_MIN = 1;
const SCALE_A_MAX = 5;
// Scale B bounds (percentages).
const GRADE_MIN = 0;
const GRADE_MAX = 100;

// Scale A / Scale B identifiers, still used by detection and pass/fail logic.
const SCALE_A = "A";
const SCALE_B = "B";

class AiVisionError extends Error {
    constructor(message, statusCode = 502) {
        super(message);
        this.name = "AiVisionError";
        this.statusCode = statusCode;
    }
}

// Mirrors utils/email.js: a single place that decides whether the provider is
// configured, throwing a typed error the controller turns into a 503 instead
// of letting the key check fail somewhere deep in the request path.
function getAiConfiguration() {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
        throw new AiVisionError(
            "AI extraction is not configured on this server. Set the OPENAI_API_KEY environment variable to enable it.",
            503
        );
    }

    return {
        apiKey,
        model: String(process.env.OPENAI_VISION_MODEL || "").trim() || DEFAULT_MODEL
    };
}

function isAiConfigured() {
    return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

// The extraction prompt. Two rules matter more than anything else here:
//   1. Read ONLY what is printed on the document. Never infer, average, or
//      guess a value — a blank is honest, an invented number is not.
//   2. Answer with ONLY valid JSON matching the structure exactly, no prose,
//      no markdown fences. This is what makes the response parseable.
//
// `readable: false` is the escape hatch: when the scan is too blurry, cropped,
// in a language/format we cannot read, or simply is not a grade document, the
// model says so instead of returning a partially-hallucinated transcript. The
// controller turns that into a "needs manual review" record instead of bad data.
function buildExtractionPrompt() {
    return `You read grade documents (report cards and transcripts of records) for a Philippine city scholarship program and return the student's academic record as JSON.

SCOPE OF THE DOCUMENT
Read every subject row you can see. If the document shows several semesters or years, read the most recent complete term and note the others in the term description. Ignore subjects that are not graded (e.g. "PE", "MAPEH", "ESP" with no mark) only if they carry no numeric grade at all.

GRADE SCALES — THIS IS THE MOST COMMON ERROR, READ CAREFULLY
Philippine college grading in this system uses ONE of two scales, and you must detect which one applies to the document you are reading:

SCALE A (1.00–5.00, inverse): 1.00 is the highest/best grade (Excellent), ${SCALE_PASSING_MARKS.A} is the lowest passing grade, and 5.00 means Failed. A LOWER number is a BETTER grade. A subject is passed if its grade is ${SCALE_PASSING_MARKS.A} or below, failed if above ${SCALE_PASSING_MARKS.A}.

SCALE B (0–100, percentage): grades range from 0 to 100, where ${SCALE_PASSING_MARKS.B} is the passing mark (equivalent to ${SCALE_PASSING_MARKS.A} on Scale A). A HIGHER number is a BETTER grade. A subject is passed if its grade is ${SCALE_PASSING_MARKS.B} or above.

Detect which scale the document uses based on the grade values shown, and add a field 'gradingScale': 'A' or 'B' to your JSON response. Apply the correct highest-grade, lowest-grade, and pass/fail logic for whichever scale is detected — do not mix the two.

Detection hints: decimal values such as 1.25, 1.75, or 2.50 mean SCALE A; whole numbers in the 75–100 range mean SCALE B. Never convert marks between scales — report each grade exactly as printed.

Detect which scale the document uses based on the grade values shown, and add a field 'gradingScale': 'A' or 'B' to your JSON response. Apply the correct highest-grade, lowest-grade, and pass/fail logic for whichever scale is detected — do not mix the two.

Detection hints: decimal values such as 1.25, 1.75, or 2.50 mean SCALE A; whole numbers in the 75–100 range mean SCALE B. Never convert marks between scales — report each grade exactly as printed.

OTHER RULES
- Copy the student's name and school exactly as printed. If the name is not on the document, return an empty string rather than a guess.
- "passingMark" is the passing grade printed on the document. If none is printed, use 3.00 on Scale A and 80 on Scale B.
- "highestGrade" is the student's BEST grade: the LOWEST number on Scale A (closest to 1.00), the HIGHEST number on Scale B. "lowestGrade" is their WORST grade: the HIGHEST number on Scale A (closest to 5.00), the LOWEST number on Scale B.
- "subjectsFailed" lists the names of subjects that FAILED on the detected scale: above the passing mark on Scale A, below the passing mark on Scale B.
- "averageGrade" is the mean of the subject grades on the document's own scale (1.00-5.00 on Scale A, 0-100 on Scale B).
- "computedGwa" is always on the 1.00-5.00 scale. On Scale A the subject grades ARE already 1.00-5.00, so their average is the GWA (or use the printed one). On Scale B convert with: gwa = 1 + ((100 - grade) / 10), rounded to 2 decimals and never above 5.00 (so 100 → 1.00 and the 80 passing mark → 3.00). If the document PRINTS a General Weighted Average or "GWA" explicitly, use that printed number — it is authoritative.
- NEVER report a 0-100 number in the "gwa" field, and never mix marks from one scale into a field that belongs to the other scale.
- If the document is unreadable or is not a grade document at all, return readable: false, an empty subjects array, and null for all numbers, and put the reason in "extractionNote".

RESPOND WITH ONLY VALID JSON MATCHING THIS EXACT STRUCTURE, NO EXTRA TEXT, NO MARKDOWN FENCES:
{
  "readable": true,
  "extractionNote": "",
  "gradingScale": "B",
  "studentName": "",
  "school": "",
  "gradeLevel": "",
  "term": "",
  "subjects": [
    { "name": "Mathematics", "grade": 95 }
  ],
  "highestGrade": 95,
  "lowestGrade": 80,
  "computedGwa": 2.00,
  "averageGrade": 88.5,
  "passingMark": 80,
  "subjectsFailed": [],
  "overallStatus": "Passed"
}`;
}

// Build the multimodal content array. gpt-4o reads a PDF natively through a
// `file` part, while images go through an `image_url` part with the base64
// inline. `detail: "high"` matters here: grade documents are dense pages of
// small numbers, which is exactly the case the docs call out as needing
// higher-fidelity vision.
function buildUserContent({ base64, mimeType, filename }) {
    const isPdf = String(mimeType || "").toLowerCase() === "application/pdf";

    const attachment = isPdf ? {
        type: "file",
        file: {
            filename: filename || "grade-document.pdf",
            file_data: `data:application/pdf;base64,${base64}`
        }
    } : {
        type: "image_url",
        image_url: {
            url: `data:${mimeType};base64,${base64}`,
            detail: "high"
        }
    };

    return [
        { type: "text", text: buildExtractionPrompt() },
        attachment
    ];
}

// The prompt asks for bare JSON, but a model can still wrap it in a markdown
// fence or add a stray sentence. Rather than trusting that, recover the object
// by locating the outermost braces. Returns null when there is no JSON at all,
// which the caller reports as a clean "extraction failed".
function parseModelJson(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    // Strip a ```json ... ``` fence if one is present.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw;

    try {
        return JSON.parse(candidate);
    } catch {
        // Fall through to brace scanning.
    }

    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        return null;
    }
}

function clampGrade(value, scale = SCALE_B) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    const min = scale === SCALE_A ? SCALE_A_MIN : GRADE_MIN;
    const max = scale === SCALE_A ? SCALE_A_MAX : GRADE_MAX;
    if (parsed >= min && parsed <= max) return Math.round(parsed * 100) / 100;
    return null;
}

// Which of the two scales a record uses when a reviewer can override it.
// Falls back to the record's own detected scale, and finally to Scale B (the
// legacy percentage behaviour) so older rows without the field still validate.
function resolveScale(value, fallback = SCALE_B) {
    const declared = String(value || "").trim().toUpperCase();
    if (declared === SCALE_A || declared === SCALE_B) return declared;
    const stored = String(fallback || "").trim().toUpperCase();
    return stored === SCALE_A ? SCALE_A : SCALE_B;
}

// Which of the two scales a document uses. The model is asked to declare it
// as 'gradingScale'; when it does not, infer from the raw marks themselves —
// 1.00-5.00 decimals mean Scale A, anything above 5 means Scale B. With no
// marks at all there is nothing to infer from, so fall back to Scale B (the
// legacy percentage behaviour) rather than guessing the inverse scale.
function detectGradingScale(payload, rawGrades) {
    const declared = String(payload?.gradingScale || "").trim().toUpperCase();
    if (declared === SCALE_A || declared === SCALE_B) return declared;
    if (rawGrades.length === 0) return SCALE_B;
    return rawGrades.every((grade) => grade <= SCALE_A_MAX) ? SCALE_A : SCALE_B;
}

// Passing mark for a scale when the document does not print one.
function defaultPassingMark(scale) {
    return scale === configDefaultPassingMark(scale);
}

// A GWA is 1.00-5.00. Values outside that are the classic symptom of the model
// answering with a 0-100 average into the wrong field, so reject them here
// rather than storing a 94.50 "GWA" that would wreck every threshold check.
function clampGwa(value) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed >= 1 && parsed <= 5) return Math.round(parsed * 100) / 100;
    return null;
}

// 0-100 average -> 1.00-5.00 GWA (Scale B only; on Scale A the marks already
// live on 1.00-5.00 and are used directly). Anchored on the system's own
// equivalence: 100 -> 1.00 and the configurable percentage passing mark -> 3.00
// (config defaults to 70), so the divisor is 10, not 25.
function gradeToGwa(grade) {
    if (typeof grade !== "number" || !Number.isFinite(grade)) return null;
    const clamped = Math.min(GRADE_MAX, Math.max(GRADE_MIN, grade));
    return Math.round(Math.min(5, 1 + ((GRADE_MAX - clamped) / 10)) * 100) / 100;
}

// One shared pass/fail decision, defined in gradingConfig.js. Scale A is
// inverse (fails ABOVE the passing mark), Scale B fails BELOW it.
function isFailingGrade(grade, passingMark, scale) {
    return configIsFailingGrade(grade, passingMark, scale);
}

// Recompute every derived figure from a subject list on a known scale. Used
// when a City reviewer corrects the marks by hand, so the summary columns and
// the pass/fail list can never drift from the subject table City actually sees.
// Highest = BEST mark, which is the LOWEST number on inverse Scale A and the
// HIGHEST number on Scale B.
function summarizeSubjects(subjects, scale, passingMark) {
    const grades = (subjects || [])
        .map((subject) => (subject && typeof subject === "object" ? Number(subject.grade) : NaN))
        .filter((grade) => Number.isFinite(grade));

    if (grades.length === 0) {
        return {
            highestGrade: null,
            lowestGrade: null,
            averageGrade: null,
            computedGwa: null,
            subjectsFailed: []
        };
    }

    const mark = Number.isFinite(Number(passingMark)) ? Number(passingMark) : defaultPassingMark(scale);
    const average = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;

    return {
        highestGrade: scale === SCALE_A ? Math.min(...grades) : Math.max(...grades),
        lowestGrade: scale === SCALE_A ? Math.max(...grades) : Math.min(...grades),
        averageGrade: Math.round(average * 100) / 100,
        // On Scale A the marks are already 1.00-5.00, so the average IS the
        // GWA; on Scale B the percentage has to be converted first.
        computedGwa: scale === SCALE_A ? clampGwa(average) : gradeToGwa(average),
        subjectsFailed: (subjects || [])
            .filter((subject) => subject && typeof subject === "object" &&
                isFailingGrade(Number(subject.grade), mark, scale))
            .map((subject) => subject.name)
            .filter(Boolean)
    };
}

function cleanText(value, maxLength = 200) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

// Normalize whatever the model returned into the exact shape we persist.
// Every field is defensively coerced: a null, a string, or a missing key must
// never throw here, because this runs on untrusted AI output.
function normalizeExtraction(payload) {
    if (!payload || typeof payload !== "object") {
        throw new AiVisionError("The AI response could not be read as structured data.", 422);
    }

    const notReadable = (note) => ({
        readable: false,
        extractionNote: cleanText(note, 400) || "The AI could not read this document.",
        // Scale is unknown for an unreadable document; trust a declared value
        // if one arrived, otherwise the neutral (legacy) Scale B.
        gradingScale: detectGradingScale(payload, []),
        studentName: "",
        school: "",
        gradeLevel: "",
        term: "",
        subjects: [],
        highestGrade: null,
        lowestGrade: null,
        averageGrade: null,
        computedGwa: null,
        passingMark: DEFAULT_PASSING_MARK,
        subjectsFailed: [],
        overallStatus: "Needs Review"
    });

    // The model declaring the document unreadable is a valid, expected outcome
    // — not an error. It becomes a "needs manual review" record.
    if (payload.readable === false) {
        return notReadable(payload.extractionNote);
    }

    const rawSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];
    // Raw (pre-clamp) marks, used only to detect the grading scale: clamping
    // is scale-aware, so the scale has to be known before it runs.
    const rawGrades = rawSubjects
        .map((subject) => (subject && typeof subject === "object"
            ? (typeof subject.grade === "number" ? subject.grade : parseFloat(subject.grade))
            : NaN))
        .filter(Number.isFinite);
    const gradingScale = detectGradingScale(payload, rawGrades);

    const subjects = rawSubjects
        .map((subject) => {
            if (!subject || typeof subject !== "object") return null;
            const name = cleanText(subject.name, 120);
            const grade = clampGrade(subject.grade, gradingScale);
            // A row without a usable name or mark is noise, not data. Marks
            // outside the detected scale's range are misreads, dropped here.
            if (!name || grade === null) return null;
            return { name, grade };
        })
        .filter(Boolean)
        .slice(0, MAX_SUBJECTS);

    // No readable subject rows means we did not actually extract anything.
    // Reporting that honestly beats persisting a record whose fields are empty.
    if (subjects.length === 0) {
        return {
            ...notReadable(payload.extractionNote || "No subject grades could be read from this document."),
            // Keep whatever identity text was legible; it still helps the reviewer.
            studentName: cleanText(payload.studentName, 120),
            school: cleanText(payload.school, 160),
            gradeLevel: cleanText(payload.gradeLevel, 80),
            term: cleanText(payload.term, 80),
            gradingScale,
            passingMark: clampGrade(payload.passingMark, gradingScale) ?? defaultPassingMark(gradingScale)
        };
    }

    const grades = subjects.map((subject) => subject.grade);
    const passingMark = clampGrade(payload.passingMark, gradingScale) ?? defaultPassingMark(gradingScale);

    // "Highest" means BEST grade, which points in different numeric directions
    // per scale: on inverse Scale A the best mark is the LOWEST number, on
    // Scale B it is the HIGHEST. Recompute from the subject list whenever the
    // model's reported pair is missing or points the wrong way for the
    // detected scale — the per-subject grades are what City will actually see.
    const bestFromGrades = gradingScale === SCALE_A ? Math.min(...grades) : Math.max(...grades);
    const worstFromGrades = gradingScale === SCALE_A ? Math.max(...grades) : Math.min(...grades);
    const reportedHighest = clampGrade(payload.highestGrade, gradingScale);
    const reportedLowest = clampGrade(payload.lowestGrade, gradingScale);
    const reportedDirectionOk = reportedHighest !== null && reportedLowest !== null &&
        (gradingScale === SCALE_A
            ? reportedHighest <= reportedLowest
            : reportedHighest >= reportedLowest);
    const highestGrade = reportedDirectionOk ? reportedHighest : bestFromGrades;
    const lowestGrade = reportedDirectionOk ? reportedLowest : worstFromGrades;

    const averageGrade = clampGrade(payload.averageGrade, gradingScale) ??
        Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100;

    // computedGwa is always 1.00-5.00: on Scale A the average already is the
    // GWA; on Scale B convert the percentage average.
    const computedGwa = clampGwa(payload.computedGwa) ??
        (gradingScale === SCALE_A ? clampGwa(averageGrade) : gradeToGwa(averageGrade));

    // Derive the failed list from the marks when the model did not supply a
    // usable one, so "subjectsFailed" can never contradict the subject table.
    // Pass/fail direction follows the detected scale (inverse on Scale A).
    const derivedFailed = subjects
        .filter((subject) => isFailingGrade(subject.grade, passingMark, gradingScale))
        .map((subject) => subject.name);
    const reportedFailed = Array.isArray(payload.subjectsFailed) ?
        payload.subjectsFailed.map((name) => cleanText(name, 120)).filter(Boolean) :
        [];
    const subjectsFailed = reportedFailed.length > 0 ? reportedFailed : derivedFailed;

    const overallStatus = cleanText(payload.overallStatus, 40) ||
        (subjectsFailed.length > 0 ? "Failed" : "Passed");

    return {
        readable: true,
        extractionNote: cleanText(payload.extractionNote, 400),
        gradingScale,
        studentName: cleanText(payload.studentName, 120),
        school: cleanText(payload.school, 160),
        gradeLevel: cleanText(payload.gradeLevel, 80),
        term: cleanText(payload.term, 80),
        subjects,
        highestGrade,
        lowestGrade,
        averageGrade,
        computedGwa,
        passingMark,
        subjectsFailed,
        overallStatus
    };
}

// Call OpenAI and return a normalized record. Any provider or transport
// problem surfaces as an AiVisionError carrying a message meant for a City
// Office user, never a raw provider stack trace.
async function analyzeGradeDocument({ base64, mimeType, filename }) {
    const { apiKey, model } = getAiConfiguration();

    let response;
    try {
        response = await fetch(OPENAI_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                // Forces a JSON object back, so the parse below almost always
                // succeeds even when the model feels like adding commentary.
                response_format: { type: "json_object" },
                max_tokens: MAX_OUTPUT_TOKENS,
                temperature: 0,
                messages: [
                    {
                        role: "system",
                        content: "You extract academic records from grade documents. You always answer with a single valid JSON object and never with prose or markdown."
                    },
                    {
                        role: "user",
                        content: buildUserContent({ base64, mimeType, filename })
                    }
                ]
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new AiVisionError(timedOut
            ? "The AI provider took too long to respond. Please try again."
            : "Could not reach the AI provider. Please try again.");
    }

    if (!response.ok) {
        let detail = "";
        try {
            detail = (await response.json())?.error?.message || "";
        } catch { /* non-JSON error body */ }

        if (response.status === 401 || response.status === 403) {
            throw new AiVisionError("The AI provider rejected the configured API key.", 503);
        }
        if (response.status === 429) {
            throw new AiVisionError("The AI provider rate limit was reached. Please try again shortly.", 503);
        }
        console.error("OpenAI grade extraction failed:", response.status, detail);
        throw new AiVisionError("The AI provider could not process this document.");
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;

    const parsed = parseModelJson(text);
    if (!parsed) {
        throw new AiVisionError("The AI response could not be parsed as JSON.");
    }

    return normalizeExtraction(parsed);
}

module.exports = {
    AiVisionError,
    getAiConfiguration,
    isAiConfigured,
    buildExtractionPrompt,
    buildUserContent,
    analyzeGradeDocument,
    normalizeExtraction,
    parseModelJson,
    detectGradingScale,
    resolveScale,
    isFailingGrade,
    summarizeSubjects,
    clampGrade,
    GRADE_MIN,
    GRADE_MAX,
    SCALE_A,
    SCALE_B,
    GRADING,
    defaultPassingMark,
    MAX_SUBJECTS
};