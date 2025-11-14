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
   PROMPT FOR GEMINI — UPDATED WITH DIVERGENCE TEST GENERATION
------------------------------------------------------------ */
function buildPrompt(swaggerSummary, codeSummary) {
  return `
You are an API Contract Enforcement Engine.

Your tasks:

1. Compare the Swagger API contract with the SOURCE CODE implementation.
2. Identify ALL divergence issues across:
   - missing endpoints
   - extra endpoints
   - method mismatch
   - schema mismatch
   - missing fields
   - type mismatch
   - missing validations
   - optional-field differences
   - documentation inconsistencies
3. For EVERY divergence, generate the negative-test case that REPRODUCES the issue.
4. Also generate VALID (positive) test cases for every API defined in Swagger.
5. Return ALL APIs (both present in Swagger and source code).
6. Assign severity based on:

=== DIVERGENCE SEVERITY RULES ===

HIGH severity:
- missing_endpoint
- extra_endpoint
- method_mismatch
- schema_mismatch

MEDIUM severity:
- missing_field
- type_mismatch
- validation_missing

LOW severity:
- optional_field_difference
- minor_doc_mismatch

=== 🔥 ADDITIONAL RULES (IMPORTANT) ===
You MUST deeply analyze the SOURCE CODE logic, including:

- Check destructured body fields vs what is used.
- Detect variables used but NEVER defined (e.g., \`role\` not destructured).
- Detect returned object fields that Swagger does NOT define.
- Detect missing validation even if a conditional is present but wrong.
- Detect incorrect response structure (extra or missing fields).
- Detect if required Swagger fields are NOT validated in source.

The LLM must treat these as **real divergence cases**.

=== TEST CASE GENERATION RULES ===

You MUST generate test cases for BOTH positive and negative flows.

For EACH divergence:

- missing_endpoint → 404 expected
- extra_endpoint → 404 expected
- method_mismatch → 404/405 expected
- schema_mismatch → invalid body → 400
- missing_field → missing required → 400
- type_mismatch → wrong data type → 400
- validation_missing → invalid request → 400

Additionally:
- For missing destructured fields (e.g., \`role\` not extracted), generate a negative test:
  → send request with correct fields and detect failure due to undefined variable.

=== STRICT JSON OUTPUT FORMAT ===

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
      { 
        "name": "", 
        "method": "", 
        "path": "", 
        "requestBody": {}, 
        "expectedStatus": 200 
      }
  ],
  "postman_collection": {},
  "test_data": {},
  "summary": { "total_apis": 0 }
}

=== SWAGGER CONTRACT ===
${swaggerSummary}

=== SOURCE CODE ===
${codeSummary}
`;
}

/* ---------------------------------------------------------
   JSON extractor
------------------------------------------------------------ */
function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON output from LLM");
  return JSON.parse(text.substring(s, e + 1));
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
   SEVERITY CALCULATOR
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
   MAIN LLM PROCESSOR
------------------------------------------------------------ */
export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  const rawCode = codeSummary?.raw || "";
  const key = cacheKey(swaggerSummary, rawCode);

  // Use cache unless forced
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
    maxOutputTokens: 3000
  });

  if (!raw) throw new Error("Empty LLM response");

  let parsed = extractJson(raw);

  /* ---------------------------------------------------------
     Normalize APIs + Assign Severity
  ------------------------------------------------------------ */
  parsed.apis = (parsed.apis || []).map(api => {
    const method = (api.method || "GET").toUpperCase();
    const pathVal = normalizePath(api.path || "");

    const divergences = (api.predicted_divergences || []).map(div => ({
      ...div,
      severity: div.severity || calculateSeverity(div.type)
    }));

    return { ...api, method, path: pathVal, predicted_divergences: divergences };
  });

  /* ---------------------------------------------------------
     IMPLEMENTED ENDPOINT DETECTION
  ------------------------------------------------------------ */
  const implementedEndpoints = codeSummary?.endpoints || [];

  parsed.apis = parsed.apis.map(api => {
    const match = implementedEndpoints.some(ep =>
      ep.method === api.method && normalizePath(ep.path) === api.path
    );

    return { ...api, implemented: match };
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
     Normalize Test Cases (LLM-generated)
  ------------------------------------------------------------ */
  parsed.test_cases = (parsed.test_cases || []).map(tc => {
    const method = (tc.method || "GET").toUpperCase();
    const pathVal = normalizePath(tc.path || "/");

    const expected = Number(tc.expectedStatus) || (method === "POST" ? 201 : 200);

    return { ...tc, method, path: pathVal, expectedStatus: expected };
  });

  /* ---------------------------------------------------------
     Save generated Postman collection
  ------------------------------------------------------------ */
  if (parsed.postman_collection) {
    await fs.writeFile(
      path.join(GENERATED_DIR, "postman_collection.json"),
      JSON.stringify(parsed.postman_collection, null, 2)
    );
  }

  /* ---------------------------------------------------------
     Save test data
  ------------------------------------------------------------ */
  if (parsed.test_data) {
    await fs.writeFile(
      path.join(GENERATED_DIR, "testData.json"),
      JSON.stringify(parsed.test_data, null, 2)
    );
  }

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
