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
   🔥 BUILD ADVANCED PROMPT (includes Postman collection)
------------------------------------------------------------ */
function buildPrompt(swaggerSummary, codeSummary) {
  return `
You are an API Contract Enforcement Engine.

Your job is to compare the Swagger API contract with the source code implementation and detect ALL contract divergence issues.

========================
📘 SWAGGER CONTRACT
========================
${swaggerSummary}

========================
💻 SOURCE CODE IMPLEMENTATION
========================
${codeSummary}

========================
🎯 REQUIRED ANALYSIS
========================
You MUST identify ALL divergence types:
- Missing endpoints
- Extra endpoints
- Path mismatch
- Method mismatch
- Request body mismatches
- Response schema mismatches
- Missing required fields
- Incorrect types
- Missing validations
- Unexpected status codes

========================
🧪 TEST CASE GENERATION
========================
Generate detailed synthetic test cases covering:
- Positive cases
- Missing fields
- Wrong types
- Invalid path parameters
- Schema mismatches
- Missing/extra field validation
- Divergence reproduction

========================
📦 POSTMAN COLLECTION
========================
Generate a **Postman Collection v2.1.0 format** that contains ALL generated test cases.

Postman format:
{
  "info": { "name": "", "schema": "" },
  "item": [ { "name": "", "request": { ... }, "response": [] } ]
}

The test items you generate MUST reference each divergence scenario.

========================
📤 OUTPUT JSON FORMAT
========================
Return ONLY STRICT JSON in this format:

{
  "apis": [...],
  "test_cases": [...],
  "postman_collection": { ... },
  "summary": {
    "total_apis": 0,
    "missing_endpoints": 0,
    "extra_endpoints": 0,
    "schema_mismatch": 0,
    "high_severity": 0
  }
}

DO NOT return explanations.
DO NOT return text.
STRICT JSON ONLY.
`;
}

/* ---------------------------------------------------------
   JSON extraction helper
------------------------------------------------------------ */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("No JSON object found in LLM output");

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
   MAIN: Predict divergences + generate test suite
------------------------------------------------------------ */
export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  const key = cacheKey(swaggerSummary, codeSummary.raw);

  if (!options.force && await fileExists(key)) {
    return JSON.parse(await fs.readFile(key, "utf8"));
  }

  const prompt = buildPrompt(
    swaggerSummary,
    `${codeSummary.raw}\n\nDetected Endpoints:\n${codeSummary.summary}`
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

  /* ---------------------------------------------------------
     Normalise paths
  ------------------------------------------------------------ */
  if (Array.isArray(parsed.apis)) {
    parsed.apis = parsed.apis.map(api => ({
      ...api,
      path: normalizePath(api.path)
    }));
  }

  /* ---------------------------------------------------------
     Determine implemented endpoints
  ------------------------------------------------------------ */
  let implementedEndpoints = [];
  try {
    implementedEndpoints = codeSummary.endpoints;
  } catch (err) {
    console.error("Could not parse endpoints from codeSummary.");
  }

  parsed.apis = parsed.apis.map(api => {
    const found = implementedEndpoints.some(ep =>
      ep.method === api.method &&
      ep.path === api.path
    );

    return { ...api, implemented: found };
  });

  /* ---------------------------------------------------------
     Save Postman Collection
  ------------------------------------------------------------ */
  if (parsed.postman_collection) {
    const filePath = path.join(GENERATED_DIR, "postman_collection.json");
    await fs.writeFile(filePath, JSON.stringify(parsed.postman_collection, null, 2));
    console.log(`📦 Postman collection saved → ${filePath}`);
  }

  /* ---------------------------------------------------------
     Build summary
  ------------------------------------------------------------ */
  parsed.summary = {
    total_apis: parsed.apis.length,
    missing_endpoints: parsed.apis.filter(a =>
      a.predicted_divergences?.some(d => d.type === "missing_endpoint")
    ).length,
    extra_endpoints: parsed.apis.filter(a =>
      a.predicted_divergences?.some(d => d.type === "extra_endpoint")
    ).length,
    schema_mismatch: parsed.apis.filter(a =>
      a.predicted_divergences?.some(d => d.type === "schema_mismatch")
    ).length,
    high_severity: parsed.apis.filter(a =>
      a.predicted_divergences?.some(d =>
        ["missing_endpoint", "schema_mismatch", "method_mismatch"].includes(d.type)
      )
    ).length
  };

  /* ---------------------------------------------------------
     Save to cache for next run
  ------------------------------------------------------------ */
  await fs.writeFile(key, JSON.stringify(parsed, null, 2));

  return parsed;
}

/* ---------------------------------------------------------
   File existence helper
------------------------------------------------------------ */
async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
