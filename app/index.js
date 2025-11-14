// app/index.js

import { loadSwagger } from "./loader/swaggerLoader.js";
import { loadCodeSummary } from "./loader/codeLoader.js";
import { predictDivergences } from "./predictor/llmPredictor.js";
import { generateHTMLReport } from "./report/htmlReport.js";
import { generatePostmanCollection } from "./report/postmanGenerator.js";

async function run() {
  try {
    console.log("📘 Loading swagger...");
    const swagger = loadSwagger("./swagger/swagger.yaml");
    console.log("Swagger summary length:", swagger.summary.length);

    console.log("📂 Scanning source code (./app/src)...");
    const code = await loadCodeSummary("./app/src");
    console.log("Code summary endpoints:", code.endpoints.length);

    // ---------------------------------------------------------
    // CASE 1: No source code found → pass CI with empty report
    // ---------------------------------------------------------
    if (code.endpoints.length === 0) {
      console.log("⚠️ No source code found. Skipping divergence prediction.");

      const emptyReport = {
        apis: [],
        test_cases: [],
        summary: {
          total_apis: 0,
          missing_endpoints: 0,
          extra_endpoints: 0,
          schema_mismatch: 0,
          high_severity: 0,
          medium_severity: 0,
          low_severity: 0
        }
      };

      await generateHTMLReport(emptyReport, "report.html");
      await generatePostmanCollection([], "generated/postman_collection.json");

      console.log("📄 Empty report + empty collection generated.");
      process.exit(0);
    }

    // ---------------------------------------------------------
    // CASE 2: Run LLM-driven divergence detection
    // ---------------------------------------------------------
    console.log("🔮 Predicting divergences using Gemini...");
    const analysis = await predictDivergences(swagger.summary, code, { force: true });

    console.log("\n📊 LLM Summary:");
    console.log("Total APIs:", analysis.summary.total_apis);
    console.log("High Severity:", analysis.summary.high_severity);
    console.log("Medium Severity:", analysis.summary.medium_severity);
    console.log("Low Severity:", analysis.summary.low_severity);

    // ---------------------------------------------------------
    // Generate HTML + Postman Suite
    // ---------------------------------------------------------
    console.log("\n📝 Generating HTML divergence report...");
    await generateHTMLReport(analysis, "report.html");

    console.log("📦 Generating Postman Test Suite...");
    await generatePostmanCollection(
      analysis.test_cases,
      "generated/postman_collection.json"
    );

    console.log("✅ Report & Test Suite generated successfully!");

    // ---------------------------------------------------------
    // EXIT CODE LOGIC (very important)
    // ---------------------------------------------------------

    if (analysis.summary.high_severity > 0) {
      console.log("🚨 HIGH severity divergence found → failing CI.");
      process.exit(2); // HIGH
    }

    if (analysis.summary.medium_severity > 0) {
      console.log("⚠️ MEDIUM severity divergence found → CI WARNING, but not failing.");
      process.exit(1); // MEDIUM
    }

    console.log("🎉 No severe divergences detected → CI PASS.");
    process.exit(0); // LOW or no issues

  } catch (err) {
    console.error("❌ Fatal Error:", err);
    process.exit(1);
  }
}

run();
