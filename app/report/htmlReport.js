// app/report/htmlReport.js
import fs from "fs/promises";

export async function generateHTMLReport(data, outputPath = "report.html") {
  const apis = data.apis || [];
  const test_cases = data.test_cases || [];

  function badge(sev) {
    sev = (sev || "LOW").toUpperCase();
    if (sev === "HIGH") return `<span class="badge high">HIGH</span>`;
    if (sev === "MEDIUM") return `<span class="badge medium">MEDIUM</span>`;
    return `<span class="badge low">LOW</span>`;
  }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>API Divergence Report</title>

<style>
body { font-family: Arial, sans-serif; padding:20px; background:#f5f7fa; color:#222; }
.card { background:#fff; padding:20px; border-radius:12px; margin-bottom:24px; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
.endpoint { padding:12px 0; border-bottom:1px solid #eee; }
.badge { padding:4px 8px; border-radius:8px; font-size:12px; margin-right:6px; }
.high { background:#ffe6e6; color:#b00; }
.medium { background:#fff5d6; color:#b68b00; }
.low { background:#e6ffe6; color:#008a00; }
code { background:#eee; padding:3px 6px; border-radius:6px; }
</style>
</head>
<body>

<h1>API Divergence Report</h1>

<div class="card">
  <h2>Summary</h2>
  <p>Total APIs: ${apis.length}</p>
  <p>High Severity: ${data.summary?.high_severity || 0}</p>
  <p>Medium Severity: ${data.summary?.medium_severity || 0}</p>
  <p>Low Severity: ${data.summary?.low_severity || 0}</p>
</div>

<div class="card">
  <h2>Endpoints Analysis</h2>

  ${apis.map(api => {
      const list = api.predicted_divergences || [];

      return `
      <div class="endpoint">
        <strong>${api.method} <code>${api.path}</code></strong><br>
        Implemented: ${api.implemented ? "✔️" : "❌"}<br>

        ${
          list.length === 0
            ? `<div>✅ No divergences</div>`
            : list
                .map(
                  d => `
                  <div>
                    ${badge(d.severity)}
                    ${d.details}
                  </div>`
                )
                .join("")
        }
      </div>
      `;
    }).join("")}
</div>

<div class="card">
  <h2>Test Cases</h2>
  ${
    test_cases.length === 0
      ? `<p>No test cases generated.</p>`
      : test_cases
          .map(tc => `
            <div class="endpoint">
              <strong>${tc.name}</strong><br>
              ${tc.method} <code>${tc.path}</code><br>
              Expected Status: ${tc.expectedStatus}<br>
              Payload: <code>${JSON.stringify(tc.requestBody)}</code>
            </div>`
          )
          .join("")
  }
</div>

</body>
</html>`;

  await fs.writeFile(outputPath, html);
  return outputPath;
}
