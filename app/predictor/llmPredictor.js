// app/predictor/llmPredictor.js
import { generateFromGemini } from "./geminiClient.js";
import fs from "fs/promises";
import path from "path";

const CACHE_DIR = path.resolve(".cache");
await fs.mkdir(CACHE_DIR, { recursive: true });

function buildPrompt(swaggerSummary, codeSummary) {
  return `
You are an API Divergence Detection Engine.

Compare:

--- SWAGGER SPEC ---
${swaggerSummary}

--- SOURCE CODE ---
${codeSummary}

TASK:
1. Identify missing endpoints, mismatched fields, incorrect parameters, request/response schema issues.
2. Generate synthetic test cases.
3. Output STRICT JSON ONLY in this schema:

{
  "apis": [
    {
      "path": "",
      "method": "",
      "expected_request_fields": [],
      "expected_response_fields": [],
      "required_fields": [],
      "predicted_divergences": [
        { "type": "", "details": "" }
      ]
    }
  ],
  "test_cases": [
    { "name": "", "method": "", "path": "", "requestBody": null, "expectedStatus": 200 }
  ],
  "summary": {
    "total_apis": 0,
    "missing_endpoints": 0,
    "high_severity": 0
  }
}

Return STRICT JSON only.
`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(text.slice(start, end + 1));
}

function cacheKey(sw, code) {
  return path.join(
    CACHE_DIR,
    Buffer.from(sw + "\n" + code).toString("base64").slice(0, 60) + ".json"
  );
}

export async function predictDivergences(swaggerSummary, codeSummary, options = {}) {
  const key = cacheKey(swaggerSummary, codeSummary);

  if (!options.force && await fileExists(key)) {
    return JSON.parse(await fs.readFile(key, "utf8"));
  }

  const prompt = buildPrompt(swaggerSummary, codeSummary);

  const raw = await generateFromGemini(prompt, {
    temperature: 0.0,
    maxOutputTokens: 1600
  });

  if (!raw) throw new Error("Gemini returned empty response");

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    console.log("Raw LLM output:\n", raw);
    throw e;
  }

  parsed.summary = parsed.summary || {
    total_apis: parsed.apis?.length || 0,
    missing_endpoints: (parsed.apis || []).filter(a =>
      (a.predicted_divergences || []).some(d => d.type === "missing_endpoint")
    ).length,
    high_severity: (parsed.apis || []).filter(a =>
      (a.predicted_divergences || []).some(d => d.type === "missing_endpoint")
    ).length,
  };

  await fs.writeFile(key, JSON.stringify(parsed, null, 2));

  return parsed;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
