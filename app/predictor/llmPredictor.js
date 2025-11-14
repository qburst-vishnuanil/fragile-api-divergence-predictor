// app/predictor/llmPredictor.js
import { generateFromGemini } from "./geminiClient.js";
import { normalizePath } from "../utils/normalizer.js";
import fs from "fs/promises";
import path from "path";

const CACHE_DIR = path.resolve(".cache");
const GENERATED_DIR = path.resolve("generated");

await fs.mkdir(CACHE_DIR, { recursive: true });
await fs.mkdir(GENERATED_DIR, { recursive: true });

/* ---------------------------------------------------------
   PROMPT FOR GEMINI
------------------------------------------------------------ */
function buildPrompt(swaggerSummary, codeSummary) {
  return `
You are an API Contract Enforcement Engine.

Compare the Swagger API contract with the source code and identify all divergence issues.

For each divergence, return:
{
  "type": "",
  "details": "",
  "severity": "HIGH" | "MEDIUM" | "LOW"
}

Severity rules:
- HIGH: missing_endpoint, extra_endpoint, method_mismatch, schema_mismatch
- MEDIUM: missing_field, type_mismatch, validation_missing
- LOW: minor differences

Return STRICT JSON with the structure:

{
  "apis": [
      {
        "path": "",
        "method": "",
        "expected_request_fields": [],
        "expected_response_fields": [],
        "required_fields": [],
        "predicted_divergences": [
            { "type": "", "details": "", "severity": "" }
        ]
      }
  ],
  "test_cases": [
      { "name": "", "method": "", "path": "", "requestBody": {}, "expectedStatus": 200 }
  ],
  "postman_collection": { ... },
  "test_data": { ... },
  "summary": { "total_apis": 0 }
}

SWAGGER:
${swaggerSummary}

CODE:
${codeSummary}
`;
}

/* ---------------------------------------------------------
   JSON extractor
------------------------------------------------------------ */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in LLM output");
  return JSON.parse(text.substring(start, end + 1));
}

/* ---------------------------------------------------------
   Cache key
------------------------------------------------------------ */
function cacheKey(sw, code) {
  return path.join(
    CACHE_DIR,
    Buffer.from(sw + "\n" + code).toString("base64").slice(0, 60) + ".json"
  );
}

/* ---------------------------------------------------------
   SEVERITY FIX FUNCTION
------------------------------------------------------------ */
function calculateSeverity(type) {
  const t = (type || "").toLowerCase();

  if (
    t.includes("missing_endpoint") ||
    t.includes("extra_endpoint") ||
    t.includes("schema_mismatch") ||
    t.includes("method_mismatch")
  ) return "HIGH";

  if (
    t.includes("missing_field") ||
    t.includes("type_mismatch") ||
    t.includes("validation")
  ) return "MEDIUM";

  return "LOW";
}

/* ---------------------------------------------------------
   MAIN: Predict divergences + test cases + test data
------------------------------------------------------------ */
export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  const rawCode = codeSummary?.raw || "";
  const key = cacheKey(swaggerSummary, rawCode);

  if (!options.force && await fileExists(key)) {
    return JSON.parse(await fs.readFile(key, "utf8"));
  }

  const prompt = buildPrompt(
    swaggerSummary,
    `${rawCode}\n\nDetected Endpoints:\n${JSON.stringify(
      codeSummary?.endpoints || [],
      null,
      2
    )}`
  );

  const raw = await generateFromGemini(prompt, {
    temperature: 0.0,
    maxOutputTokens: 3000,
  });

  if (!raw) throw new Error("Gemini returned empty output");

  let parsed = extractJson(raw);

  /* ---------------------------------------------------------
     NORMALIZE apis
  ------------------------------------------------------------ */
  parsed.apis = (parsed.apis || []).map(api => {
    const method = (api.method || "GET").toUpperCase();
    const pathVal = api.path ? normalizePath(api.path) : api.path;

    const divs = Array.isArray(api.predicted_divergences)
      ? api.predicted_divergences.map(d => ({
          ...d,
          severity: d.severity || calculateSeverity(d.type)
        }))
      : [];

    return { ...api, method, path: pathVal, predicted_divergences: divs };
  });

  /* ---------------------------------------------------------
     SUMMARY calculation
  ------------------------------------------------------------ */
  const allDivergences = parsed.apis.flatMap(a => a.predicted_divergences || []);

  parsed.summary = {
    total_apis: parsed.apis.length,
    high_severity: allDivergences.filter(d => d.severity === "HIGH").length,
    medium_severity: allDivergences.filter(d => d.severity === "MEDIUM").length,
    low_severity: allDivergences.filter(d => d.severity === "LOW").length,
  };

  /* ---------------------------------------------------------
     Normalize test cases
  ------------------------------------------------------------ */
  parsed.test_cases = (parsed.test_cases || []).map(tc => {
    const method = (tc.method || "GET").toUpperCase();
    const pathVal = tc.path ? normalizePath(tc.path) : "/";

    const expected = Number(tc.expectedStatus) ||
      (method === "POST" ? 201 : 200);

    return { ...tc, method, path: pathVal, expectedStatus: expected };
  });

  /* ---------------------------------------------------------
     Save Postman Collection
  ------------------------------------------------------------ */
  if (parsed.postman_collection) {
    const filePath = path.join(GENERATED_DIR, "postman_collection.json");
    await fs.writeFile(filePath, JSON.stringify(parsed.postman_collection, null, 2));
  }

  /* ---------------------------------------------------------
     Save test data
  ------------------------------------------------------------ */
  if (parsed.test_data) {
    const tdPath = path.join(GENERATED_DIR, "testData.json");
    await fs.writeFile(tdPath, JSON.stringify(parsed.test_data, null, 2));
  }

  // Cache the result
  await fs.writeFile(key, JSON.stringify(parsed, null, 2));

  return parsed;
}

/* ---------------------------------------------------------
   File exists helper
------------------------------------------------------------ */
async function fileExists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}
