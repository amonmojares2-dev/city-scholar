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

// Grades are percentages on the Philippine 1.00-5.00 GWA system: a raw mark of
// 100 is the ceiling and 0 is the floor. Anything outside is a misread.
const GRADE_MIN = 0;
const GRADE_MAX = 100;

// The passing mark defaults to 75 (the usual "passed" bar in the PH system)
// but schools differ, so the model is asked to read the real one off the
// document when it is printed there.
const DEFAULT_PASSING_MARK = 75;

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
The Philippine system uses a 1.00 (highest) to 5.00 (lowest) General Weighted Average. Marks are also shown as a percentage or as a raw score.
- "grade"  = the mark on a 0-100 percentage scale. If the document shows a raw score like 95, or a percentage like 95%, use 95.
- "gwa"    = the same performance expressed on the 1.00-5.00 scale. A 100 mark is a GWA of 1.00; a 75 mark is a GWA of 2.00. The conversion is: gwa = 1 + ((100 - grade) / 100) * 4, rounded to 2 decimals.
- If the document PRINTS a General Weighted Average or "GWA" explicitly, use that printed number for "gwa" instead of converting. It is authoritative.
NEVER report a 0-100 number in the "gwa" field, and never report a 1.00-5.00 number in the "grade" field.

OTHER RULES
- Copy the student's name and school exactly as printed. If the name is not on the document, return an empty string rather than a guess.
- "passingMark" is the passing grade used by that school (commonly 75). Read it from the document if printed, otherwise use 75.
- "subjectsFailed" lists the names of subjects graded below the passing mark.
- "computedGwa" is the GWA you calculate from the listed grades. If the document prints its own GWA, use the printed one here too.
- If the document is unreadable or is not a grade document at all, return readable: false, an empty subjects array, and null for all numbers, and put the reason in "extractionNote".

RESPOND WITH ONLY VALID JSON MATCHING THIS EXACT STRUCTURE, NO EXTRA TEXT, NO MARKDOWN FENCES:
{
  "readable": true,
  "extractionNote": "",
  "studentName": "",
  "school": "",
  "gradeLevel": "",
  "term": "",
  "subjects": [
    { "name": "Mathematics", "grade": 95 }
  ],
  "highestGrade": 95,
  "lowestGrade": 80,
  "computedGwa": 1.46,
  "averageGrade": 88.5,
  "passingMark": 75,
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

function clampGrade(value) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed >= GRADE_MIN && parsed <= GRADE_MAX) return Math.round(parsed * 100) / 100;
    return null;
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

// 0-100 average -> 1.00-5.00 GWA. Used only to fill a gap the model left.
function gradeToGwa(grade) {
    if (typeof grade !== "number" || !Number.isFinite(grade)) return null;
    const clamped = Math.min(GRADE_MAX, Math.max(GRADE_MIN, grade));
    return Math.round((1 + ((GRADE_MAX - clamped) / GRADE_MAX) * 4) * 100) / 100;
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
    const subjects = rawSubjects
        .map((subject) => {
            if (!subject || typeof subject !== "object") return null;
            const name = cleanText(subject.name, 120);
            const grade = clampGrade(subject.grade);
            // A row without a usable name or mark is noise, not data.
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
            passingMark: clampGrade(payload.passingMark) ?? DEFAULT_PASSING_MARK
        };
    }

    const grades = subjects.map((subject) => subject.grade);
    const passingMark = clampGrade(payload.passingMark) ?? DEFAULT_PASSING_MARK;

    // Prefer the model's own high/low when present, but recompute from the
    // subject list when they are missing — the per-subject grades are the data
    // we can actually trust, since they are the ones City will see.
    const highestGrade = clampGrade(payload.highestGrade) ?? Math.max(...grades);
    const lowestGrade = clampGrade(payload.lowestGrade) ?? Math.min(...grades);
    const averageGrade = clampGrade(payload.averageGrade) ??
        Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100;

    const computedGwa = clampGwa(payload.computedGwa) ?? gradeToGwa(averageGrade);

    // Derive the failed list from the marks when the model did not supply a
    // usable one, so "subjectsFailed" can never contradict the subject table.
    const derivedFailed = subjects
        .filter((subject) => subject.grade < passingMark)
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
    GRADE_MIN,
    GRADE_MAX,
    DEFAULT_PASSING_MARK,
    MAX_SUBJECTS
};