// ==========================================
// Gemini vision integration — grade document extraction
// ==========================================
//
// Reads an uploaded grade document (image or PDF) and returns the student's
// academic record as structured JSON.
//
// Provider: Google Gemini — https://generativelanguage.googleapis.com
// Configure with:
//   GEMINI_API_KEY        (required — extraction is unavailable without it)
//   GEMINI_VISION_MODEL   (required — model used for generateContent)
//
// This is the only part of the system that costs money per call, so every
// request here is deliberately defensive: a 60s timeout, a bounded token
// budget, and a hard failure (never a crash) when the model cannot read the
// document. No SDK dependency — Node 18+ ships global fetch, matching the
// plain-HTTPS style already used for Brevo in utils/email.js.
//
// The API key travels in the `x-goog-api-key` header only — never in the
// request URL and never written to logs.

const GEMINI_GENERATE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const RETIRED_GEMINI_MODEL = "gemini-2.5-flash-lite";
const CURRENT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 60000;
const MAX_OUTPUT_TOKENS = 1500;

// Gemini answers a genuine rate limit with 429 / RESOURCE_EXHAUSTED. An
// exhausted daily quota shares that status, so the error MESSAGE tells them
// apart — only true rate limits are retried, with growing delays and
// Retry-After honoring.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000; // 1s, 2s, 4s when Retry-After is absent
const MAX_RETRY_DELAY_MS = 30000; // never park a request on a huge Retry-After

// User-facing messages. Quota, rate limit, and misconfiguration are different
// problems with different fixes, so City must be able to tell them apart.
const AI_QUOTA_MESSAGE = "The AI service has no remaining credit. Please contact the system administrator.";
const AI_RATE_LIMIT_MESSAGE = "The AI service is busy. Try again in a minute.";
const AI_CONFIG_MESSAGE = "The AI service is not configured correctly. Please contact the system administrator.";
const AI_BLOCKED_MESSAGE = "The AI could not read this document. Please review it manually.";
const AI_GENERIC_FAILURE_MESSAGE = "The AI analysis failed. Please try again, or contact the system administrator if this keeps happening.";

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
    constructor(message, statusCode = 502, code = "ai_error") {
        super(message);
        this.name = "AiVisionError";
        this.statusCode = statusCode;
        // Machine-readable reason ("insufficient_quota", "rate_limit_exceeded",
        // "file_too_large", …) so the controller and client can react without
        // string-matching the human message.
        this.code = code;
    }
}

function getAiConfiguration() {
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
        throw new AiVisionError(
            "AI extraction is not configured on this server. Set the GEMINI_API_KEY environment variable to enable it.",
            503
        );
    }
    const configuredModel = String(process.env.GEMINI_VISION_MODEL || "").trim();
    if (!configuredModel) {
        throw new AiVisionError(
            "AI extraction is not configured on this server. Set the GEMINI_VISION_MODEL environment variable to enable it.",
            503
        );
    }
    const model = configuredModel === RETIRED_GEMINI_MODEL
        ? CURRENT_GEMINI_MODEL
        : configuredModel;
    return { apiKey, model };
}

function isAiConfigured() {
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    const model = String(process.env.GEMINI_VISION_MODEL || "").trim();
    return Boolean(apiKey && model);
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
// Build the parts for the user message. Gemini takes the document as inline
// base64 with its mime type — images and PDFs both arrive as inlineData. The
// full extraction instruction lives in the system instruction so the model
// treats it as system behavior rather than user text.
function buildUserContent({ base64, mimeType, filename }) {
    const isPdf = String(mimeType || "").toLowerCase() === "application/pdf";

    return [
        { text: "Extract the grades shown in this document and return them as JSON." },
        {
            inlineData: {
                mimeType: isPdf ? "application/pdf" : String(mimeType || ""),
                data: base64
            }
        }
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

// The shape the model must return, declared so Gemini constrains its output to
// JSON. Fields that can legitimately be null (highestGrade, computedGwa, …)
// are deliberately left undeclared so a null never trips schema validation;
// if Gemini rejects the schema anyway the caller retries without it.
const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        readable: { type: "boolean" },
        extractionNote: { type: "string" },
        gradingScale: { type: "string" },
        studentName: { type: "string" },
        school: { type: "string" },
        gradeLevel: { type: "string" },
        term: { type: "string" },
        subjects: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    grade: { type: "number" }
                },
                required: ["name", "grade"]
            }
        },
        subjectsFailed: {
            type: "array",
            items: { type: "string" }
        },
        overallStatus: { type: "string" }
    }
};

function buildGeminiRequest(payload, model, useSchema) {
    const isPdf = String(payload.mimeType || "").toLowerCase() === "application/pdf";

    return {
        systemInstruction: {
            parts: [{ text: buildExtractionPrompt() }]
        },
        contents: [
            {
                role: "user",
                parts: [
                    { text: "Extract the grades shown in this document and return them as JSON." },
                    {
                        inlineData: {
                            mimeType: isPdf ? "application/pdf" : String(payload.mimeType || ""),
                            data: payload.base64
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            ...(useSchema ? { responseSchema: RESPONSE_SCHEMA } : {})
        }
    };
}

async function callGemini(config, useSchema, fetchImpl) {
    const url = `${GEMINI_GENERATE_BASE}/models/${encodeURIComponent(config.model)}:generateContent`;
    const response = await fetchImpl(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // The API key goes in a header — never in the URL, never in logs.
            "x-goog-api-key": config.apiKey
        },
        body: JSON.stringify(buildGeminiRequest(config, config.model, useSchema)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    return response;
}

// Call Gemini and return a normalized record. Any provider or transport
// problem surfaces as an AiVisionError carrying a message meant for a City
// Office user, never a raw provider stack trace.
//
// Gemini returns HTTP 429 with status RESOURCE_EXHAUSTED for both rate limits
// and an exhausted daily quota. The message text tells them apart: a daily
// quota error is never retried, genuine rate limits are retried up to
// MAX_RATE_LIMIT_RETRIES times with growing delays, honoring the provider's
// Retry-After header when present.
async function analyzeGradeDocument({ base64, mimeType, filename }, options = {}) {
    const { apiKey, model } = getAiConfiguration();
    const fetchImpl = options.fetchImpl || fetch;
    const sleep = options.sleep || defaultSleep;
    const retryDelays = options.retryDelays
        || [RATE_LIMIT_BASE_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * 2, RATE_LIMIT_BASE_DELAY_MS * 4];

    let attempt = 0;
    let useSchema = true;
    let response;

    while (true) {
        try {
            response = await callGemini({ apiKey, model, base64, mimeType, filename }, useSchema, fetchImpl);
        } catch (error) {
            const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
            throw new AiVisionError(timedOut
                ? "The AI provider took too long to respond. Please try again."
                : "Could not reach the AI provider. Please try again.", 502, "provider_unreachable");
        }

        if (response.ok) break;

        // Read the provider's error envelope: status, error.code, error.status.
        // Logged for operators (never the API key, never the document bytes);
        // the classified code drives the user-facing message and the retry
        // decision.
        let detail = "";
        let errorCode = "";
        let errorStatus = "";
        let retryAfterMs = null;
        try {
            const body = await response.json();
            detail = String(body?.error?.message || "").slice(0, 500);
            errorCode = String(body?.error?.code || "").trim();
            errorStatus = String(body?.error?.status || "").trim();
        } catch { /* non-JSON error body */ }
        if (response.headers && typeof response.headers.get === "function") {
            retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        }

        // A rejected responseSchema is our own request problem, not a rate
        // limit: retry exactly once with prompt-only JSON instead of a schema.
        if (response.status === 400 && useSchema && /schema/i.test(detail)) {
            useSchema = false;
            continue;
        }

        const isResourceExhausted = response.status === 429 || errorStatus === "RESOURCE_EXHAUSTED";
        const isDailyQuota = isResourceExhausted && (/daily/i.test(detail) || /quota\s*(exhausted|exceeded)/i.test(detail));
        const isInsufficientQuota = isDailyQuota;
        const isRateLimit = isResourceExhausted && !isInsufficientQuota;

        console.error("Gemini grade extraction failed:", JSON.stringify({
            status: response.status,
            code: isInsufficientQuota ? "insufficient_quota" : isRateLimit ? "rate_limit_exceeded" : errorCode || undefined,
            model,
            attempt,
            retryAfterMs: retryAfterMs ?? undefined,
            // Provider message only — never the API key, never the document.
            detail: detail || undefined
        }));

        if (isInsufficientQuota) {
            // No credit: retrying is pointless and would only burn attempts.
            throw new AiVisionError(AI_QUOTA_MESSAGE, 503, "insufficient_quota");
        }

        if (isRateLimit && attempt < retryDelays.length && attempt < MAX_RATE_LIMIT_RETRIES) {
            const delayMs = retryAfterMs != null
                ? Math.min(retryAfterMs, MAX_RETRY_DELAY_MS)
                : retryDelays[attempt];
            attempt += 1;
            await sleep(delayMs);
            continue;
        }

        if (isRateLimit) {
            throw new AiVisionError(AI_RATE_LIMIT_MESSAGE, 429, "rate_limit_exceeded");
        }

        if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
            // Bad key, bad permission, unknown model, or a malformed request:
            // the configuration needs fixing, not another attempt.
            throw new AiVisionError(AI_CONFIG_MESSAGE, 503, "provider_config");
        }

        // Everything else (5xx, …) gets one generic message.
        throw new AiVisionError(AI_GENERIC_FAILURE_MESSAGE, 502, "provider_error");
    }

    const payload = await response.json();
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    if (candidates.length === 0) {
        // Safety-blocked or empty: nothing to parse.
        throw new AiVisionError(AI_BLOCKED_MESSAGE, 502, "no_candidates");
    }
    const parts = candidates[0]?.content?.parts || [];
    const text = parts.reduce((acc, part) => acc + String(part.text || ""), "");
    if (!text) {
        throw new AiVisionError(AI_BLOCKED_MESSAGE, 502, "no_candidates");
    }

    const parsed = parseModelJson(text);
    if (!parsed) {
        throw new AiVisionError(AI_GENERIC_FAILURE_MESSAGE, 502, "unparseable_response");
    }

    return normalizeExtraction(parsed);
}

function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry-After is either seconds ("120") or an HTTP date. Returns milliseconds,
// or null when the header is absent/unparseable.
function parseRetryAfterMs(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw) * 1000;
    const asDate = Date.parse(raw);
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
    return null;
}

// Whether an existing GradeRecord can answer a new Analyze click without a
// paid provider call. Cache key is (document id, file hash): the same stored
// file yields the same hash, so a replacement upload naturally invalidates.
// "failed" rows are never served from cache — City must be able to retry them.
function isCachedExtractionUsable(record, fileHash) {
    if (!record || !fileHash) return false;
    if (record.extractionStatus !== "extracted" && record.extractionStatus !== "needs_manual_review") {
        return false;
    }
    return typeof record.fileHash === "string"
        && record.fileHash.length > 0
        && record.fileHash === fileHash;
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
    parseRetryAfterMs,
    isCachedExtractionUsable,
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
    MAX_SUBJECTS,
    AI_QUOTA_MESSAGE,
    AI_RATE_LIMIT_MESSAGE,
    AI_CONFIG_MESSAGE,
    AI_BLOCKED_MESSAGE,
    AI_GENERIC_FAILURE_MESSAGE,
    MAX_RATE_LIMIT_RETRIES
};
