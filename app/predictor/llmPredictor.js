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
   ADVANCED PROMPT WITH POSTMAN & TEST DATA GENERATION
------------------------------------------------------------ */
function buildPrompt(swaggerSummary, codeSummary) {
  return `
You are an API Contract Enforcement Engine.

Your job is to compare the Swagger API contract with the source code implementation and detect ALL contract divergence issues.

========================
SWAGGER CONTRACT
========================
${swaggerSummary}

========================
SOURCE CODE
========================
${codeSummary}

TASK:
1) Identify missing endpoints, extra endpoints, path/method mismatches, request/response schema differences, missing required fields, incorrect types, missing validations, unexpected status codes.
2) Generate synthetic test cases covering positive cases, missing fields, wrong types, invalid path params and schema mismatch reproduction.
3) Generate realistic seed/test data to use during execution (for example: users array). Put this under the key "test_data".
4) Also produce a Postman Collection (v2.1.0) that maps 1:1 to the test cases.

STRICT OUTPUT FORMAT (return only JSON, no explanation):

{
  "apis": [ { "path":"", "method":"", "expected_request_fields":[], "expected_response_fields":[], "required_fields":[], "predicted_divergences":[ { "type":"", "details":"" } ] } ],
  "test_cases": [ { "name":"", "method":"", "path":"", "requestBody": null, "expectedStatus": 200 } ],
  "postman_collection": { ... },
  "test_data": { ... },
  "summary": { "total_apis": 0, "missing_endpoints": 0, "extra_endpoints": 0, "schema_mismatch": 0, "high_severity": 0 }
}
`;
}

/* ---------------------------------------------------------
   JSON extractor
------------------------------------------------------------ */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in LLM output");
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
   MAIN: Predict divergences + generate test suite + test data
------------------------------------------------------------ */
export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  // codeSummary may be the object returned by loadCodeSummary (with raw and endpoints)
  const rawCode = codeSummary?.raw || (typeof codeSummary === "string" ? codeSummary : "");
  const key = cacheKey(swaggerSummary, rawCode);

  if (!options.force && await fileExists(key)) {
    return JSON.parse(await fs.readFile(key, "utf8"));
  }

  const prompt = buildPrompt(
    swaggerSummary,
    `${rawCode}\n\nDetected Endpoints:\n${JSON.stringify(codeSummary?.endpoints || [], null, 2)}`
  );

  const raw = await generateFromGemini(prompt, {
    temperature: 0.0,
    maxOutputTokens: 3000
  });

  if (!raw) throw new Error("Gemini returned empty response!");

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    console.error("RAW LLM OUTPUT:\n", raw);
    throw err;
  }

  // ensure structures
  parsed.apis = Array.isArray(parsed.apis) ? parsed.apis : [];
  parsed.test_cases = Array.isArray(parsed.test_cases) ? parsed.test_cases : [];
  parsed.postman_collection = parsed.postman_collection || null;
  parsed.test_data = parsed.test_data || parsed.seed_data || null;
  parsed.summary = parsed.summary || {};

  /* ---------------------------------------------------------
     Normalize paths from LLM
  ------------------------------------------------------------ */
  parsed.apis = parsed.apis.map(api => ({
    ...api,
    path: api.path ? normalizePath(api.path) : api.path
  }));

  /* ---------------------------------------------------------
     Set implemented endpoints using codeSummary.endpoints
  ------------------------------------------------------------ */
  const implementedEndpoints = Array.isArray(codeSummary?.endpoints) ? codeSummary.endpoints : [];

  parsed.apis = parsed.apis.map(api => {
    const apiMethod = (api.method || "").toUpperCase();
    const apiPath = normalizePath(api.path || "");
    const found = implementedEndpoints.some(ep =>
      (ep.method || "").toUpperCase() === apiMethod && normalizePath(ep.path || "") === apiPath
    );
    return { ...api, method: apiMethod, path: apiPath, implemented: found };
  });

  /* ---------------------------------------------------------
     Ensure every test case has expectedStatus and normalized path/method
  ------------------------------------------------------------ */
  parsed.test_cases = parsed.test_cases.map(tc => {
    const method = (tc.method || "GET").toUpperCase();
    const pathVal = tc.path ? normalizePath(tc.path) : (tc.path || "/");
    // enforce expectedStatus fallback sensible defaults
    const expectedStatus = Number(tc.expectedStatus) || (method === "POST" ? 201 : 200);
    return { ...tc, method, path: pathVal, expectedStatus };
  });

  /* ---------------------------------------------------------
     Save Postman collection (if LLM returned one)
  ------------------------------------------------------------ */
  if (parsed.postman_collection) {
    const filePath = path.join(GENERATED_DIR, "postman_collection.json");
    await fs.writeFile(filePath, JSON.stringify(parsed.postman_collection, null, 2));
    console.log(`📦 Postman collection saved → ${filePath}`);
  }

  /* ---------------------------------------------------------
     Save test data (if LLM returned test_data or seed_data)
  ------------------------------------------------------------ */
  if (parsed.test_data) {
    const tdPath = path.join(GENERATED_DIR, "testData.json");
    try {
      await fs.writeFile(tdPath, JSON.stringify(parsed.test_data, null, 2));
      console.log(`📦 Test data saved → ${tdPath}`);
    } catch (err) {
      console.error("❌ Failed to save test data:", err);
    }
  } else {
    // if LLM did not return test_data, but there are test cases, try to derive minimal data:
    // (not required but safe) — skip for now.
  }

  /* ---------------------------------------------------------
     Build/augment summary
  ------------------------------------------------------------ */
  parsed.summary = {
    total_apis: parsed.apis.length,
    missing_endpoints: parsed.apis.filter(a => a.predicted_divergences?.some(d => d.type === "missing_endpoint")).length,
    extra_endpoints: parsed.apis.filter(a => a.predicted_divergences?.some(d => d.type === "extra_endpoint")).length,
    schema_mismatch: parsed.apis.filter(a => a.predicted_divergences?.some(d => d.type === "schema_mismatch")).length,
    high_severity: parsed.apis.filter(a => a.predicted_divergences?.some(d => ["missing_endpoint", "schema_mismatch", "method_mismatch"].includes(d.type))).length,
    ...parsed.summary
  };

  // Save to cache
  await fs.writeFile(key, JSON.stringify(parsed, null, 2));

  return parsed;
}

/* ---------------------------------------------------------
   File exists helper
------------------------------------------------------------ */
async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
