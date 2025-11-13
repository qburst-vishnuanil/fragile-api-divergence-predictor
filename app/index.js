// app/index.js

import { loadSwagger } from "./loader/swaggerLoader.js";
import { loadCodeSummary } from "./loader/codeLoader.js";
import { predictDivergences } from "./predictor/llmPredictor.js";
import { generateHTMLReport } from "./report/htmlReport.js";

async function run() {
  try {
    console.log("📘 Loading swagger...");
    const swagger = loadSwagger("./swagger/swagger.yaml");
    console.log("Swagger summary length:", swagger.summary.length);

    console.log("📂 Scanning source code (./app/src)...");
    const code = await loadCodeSummary("./app/src");
    console.log("Code summary length:", code.summary.length);

    // ----------------------------------------
    // CASE 1: No source code found → initial commit
    // ----------------------------------------
    if (code.summary.length === 0) {
      console.log("⚠️ No source code found. Skipping divergence prediction.");
      
      const emptyReport = {
        apis: [],
        test_cases: [],
        summary: {
          total_apis: 0,
          missing_endpoints: 0,
          high_severity: 0,
        },
      };

      await generateHTMLReport(emptyReport, "report.html");

      console.log("📄 Empty report generated for initial commit.");
      process.exit(0); // CI should PASS for empty code
    }

    // ----------------------------------------
    // CASE 2: Run full LLM divergence prediction
    // ----------------------------------------
    console.log("🔮 Predicting divergences using Gemini...");
    const analysis = await predictDivergences(swagger.summary, code.summary, { force: true });

    console.log("LLM Response Summary:");
    console.log("Total APIs:", analysis.summary.total_apis);
    console.log("Missing Endpoints:", analysis.summary.missing_endpoints);
    console.log("High Severity Issues:", analysis.summary.high_severity);

    console.log("📝 Generating HTML divergence report...");
    await generateHTMLReport(analysis, "report.html");

    console.log("✅ Report generated successfully: report.html");

    // ----------------------------------------
    // CI/CD exit rules
    // ----------------------------------------
    if (analysis.summary.high_severity > 0) {
      console.log("❌ High severity divergence detected. Failing CI.");
      process.exit(2); // CI FAIL
    }

    console.log("🎉 No high severity divergences. CI passed.");
    process.exit(0);

  } catch (err) {
    console.error("❌ Fatal Error:", err);
    process.exit(1); // CI FAIL on unexpected errors
  }
}

run();
