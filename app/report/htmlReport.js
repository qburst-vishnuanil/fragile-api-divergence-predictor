// app/report/htmlReport.js
import fs from "fs/promises";

export async function generateHTMLReport(data, outputPath = "report.html") {
  const apis = data.apis || [];
  const test_cases = data.test_cases || [];

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>API Divergence Report</title>
<style>
body { font-family: Arial, sans-serif; padding:20px; background:#f5f7fa; color:#222; }
h1 { margin-bottom:20px; }
.card { background:#fff; padding:16px; border-radius:12px; margin-bottom:20px; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
.endpoint { padding:10px 0; border-bottom:1px solid #eee; }
code { background:#eee; padding:3px 6px; border-radius:6px; }
.badge { padding:4px 8px; border-radius:8px; font-size:12px; }
.high { background:#ffe6e6; color:#b00; }
.medium { background:#fff5d6; color:#b68b00; }
.low { background:#e6ffe6; color:#008a00; }
</style>
</head>
<body>

<h1>API Divergence Report</h1>

<div class="card">
  <h2>Summary</h2>
  <p>Total APIs: ${apis.length}</p>
  <p>Total Test Cases: ${test_cases.length}</p>
</div>

<div class="card">
  <h2>Endpoints Analysis</h2>
  ${apis.map(api => `
    <div class="endpoint">
      <strong>${api.method} <code>${api.path}</code></strong><br>
      Implemented: ${api.implemented ? "✔️" : "❌"}<br>
      <strong>Divergences:</strong>
      ${(api.predicted_divergences || []).map(d => `
        <div>
          <span class="badge ${d.type === "missing_endpoint" ? "high" : "medium"}">${d.type}</span>
          — ${d.details}
        </div>
      `).join("")}
    </div>
  `).join("")}
</div>

<div class="card">
  <h2>Test Cases</h2>
  ${test_cases.map(tc => `
    <div class="endpoint">
      <strong>${tc.name}</strong><br>
      ${tc.method} <code>${tc.path}</code><br>
      Expected Status: ${tc.expectedStatus}<br>
      Payload: <code>${JSON.stringify(tc.requestBody)}</code>
    </div>
  `).join("")}
</div>

</body>
</html>`;

  await fs.writeFile(outputPath, html);
  return outputPath;
}
