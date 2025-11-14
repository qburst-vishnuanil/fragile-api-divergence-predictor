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

Compare Swagger with the source code and identify ALL divergence issues.

VERY IMPORTANT:
- You MUST return **all endpoints found in Swagger**, even if they have NO divergence.
- Endpoints not present in Swagger but present in code should appear with type: "extra_endpoint".
- Endpoints present in Swagger but not code should appear with type: "missing_endpoint".
- If an endpoint is correct, return it with: "predicted_divergences": []

Severity Assignment:
HIGH:
  - missing_endpoint
  - extra_endpoint
  - schema_mismatch
  - method_mismatch

MEDIUM:
  - missing_field
  - type_mismatch
  - validation_missing

LOW:
  - minor_difference

Return STRICT JSON:

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
  "test_cases": [],
  "postman_collection": {},
  "test_data": {},
  "summary": { "total_apis": 0 }
}

SWAGGER:
${swaggerSummary}

SOURCE CODE:
${codeSummary}
`;
}

/* ---------------------------------------------------------
   JSON extractor
------------------------------------------------------------ */
function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("NO JSON FOUND IN LLM OUTPUT");
  return JSON.parse(text.substring(s, e + 1));
}

/* ---------------------------------------------------------
   Cache key
------------------------------------------------------------ */
function cacheKey(sw, code) {
  return path.join(
    CACHE_DIR,
    Buffer.from(sw + code).toString("base64").slice(0, 60) + ".json"
  );
}

/* ---------------------------------------------------------
   Severity Mapper
------------------------------------------------------------ */
function calculateSeverity(type = "") {
  const t = type.toLowerCase();

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
   Extract ALL Swagger paths
------------------------------------------------------------ */
function extractSwaggerPaths(swaggerText) {
  const regex = /\/[A-Za-z0-9_\-/{}/]*/g;
  const found = swaggerText.match(regex) || [];
  return [...new Set(found.map(p => normalizePath(p)))];
}

/* ---------------------------------------------------------
   MAIN FUNCTION
------------------------------------------------------------ */
export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  const rawCode = codeSummary?.raw || "";
  const key = cacheKey(swaggerSummary, rawCode);

  if (!options.force && await fileExists(key)) {
    return JSON.parse(await fs.readFile(key, "utf8"));
  }

  const prompt = buildPrompt(
    swaggerSummary,
    `${rawCode}\n\nDetected Endpoints:\n${JSON.stringify(codeSummary?.endpoints || [], null, 2)}`
  );

  const llmOutput = await generateFromGemini(prompt, {
    temperature: 0.0,
    maxOutputTokens: 3200
  });

  if (!llmOutput) throw new Error("EMPTY OUTPUT FROM GEMINI");

  let parsed = extractJson(llmOutput);

  /* ---------------------------------------------------------
     NORMALIZE API ENTRIES
  ------------------------------------------------------------ */
  parsed.apis = (parsed.apis || []).map(api => {
    return {
      ...api,
      method: (api.method || "GET").toUpperCase(),
      path: normalizePath(api.path || ""),
      predicted_divergences: (api.predicted_divergences || []).map(div => ({
        ...div,
        severity: div.severity || calculateSeverity(div.type)
      }))
    };
  });

  /* ---------------------------------------------------------
     MERGE: Ensure ALL Swagger APIs exist
  ------------------------------------------------------------ */
  const swaggerPaths = extractSwaggerPaths(swaggerSummary);

  swaggerPaths.forEach(swPath => {
    const exists = parsed.apis.some(a => a.path === swPath);
    if (!exists) {
      parsed.apis.push({
        path: swPath,
        method: "GET",
        expected_request_fields: [],
        expected_response_fields: [],
        required_fields: [],
        predicted_divergences: [],
        implemented: false
      });
    }
  });

  /* ---------------------------------------------------------
     TAG_IMPLEMENTED using scanned code
  ------------------------------------------------------------ */
  const implemented = codeSummary?.endpoints || [];

  parsed.apis = parsed.apis.map(api => {
    const found = implemented.some(
      ep => ep.method === api.method && normalizePath(ep.path) === api.path
    );
    return { ...api, implemented: found };
  });

  /* ---------------------------------------------------------
     SUMMARY
  ------------------------------------------------------------ */
  const all = parsed.apis.flatMap(a => a.predicted_divergences);

  parsed.summary = {
    total_apis: parsed.apis.length,
    high_severity: all.filter(d => d.severity === "HIGH").length,
    medium_severity: all.filter(d => d.severity === "MEDIUM").length,
    low_severity: all.filter(d => d.severity === "LOW").length
  };

  /* ---------------------------------------------------------
     Normalize Test Cases
  ------------------------------------------------------------ */
  parsed.test_cases = (parsed.test_cases || []).map(tc => ({
    ...tc,
    method: (tc.method || "GET").toUpperCase(),
    path: normalizePath(tc.path || "/"),
    expectedStatus:
      Number(tc.expectedStatus) ||
      (tc.method === "POST" ? 201 : 200)
  }));

  /* ---------------------------------------------------------
     SAVE Postman & Test Data
  ------------------------------------------------------------ */
  if (parsed.postman_collection) {
    await fs.writeFile(
      path.join(GENERATED_DIR, "postman_collection.json"),
      JSON.stringify(parsed.postman_collection, null, 2)
    );
  }

  if (parsed.test_data) {
    await fs.writeFile(
      path.join(GENERATED_DIR, "testData.json"),
      JSON.stringify(parsed.test_data, null, 2)
    );
  }

  /* ---------------------------------------------------------
     Store Cache + Return
  ------------------------------------------------------------ */
  await fs.writeFile(key, JSON.stringify(parsed, null, 2));
  return parsed;
}

/* ---------------------------------------------------------
   File Exists
------------------------------------------------------------ */
async function fileExists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}
