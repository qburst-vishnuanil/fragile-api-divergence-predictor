// app/report/htmlReport.js
import fs from "fs/promises";

export async function generateHTMLReport(data, outputPath = "report.html") {
  const apis = data.apis || [];
  const test_cases = data.test_cases || [];

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>API Contract Divergence Report</title>

<style>
body { font-family: Arial, sans-serif; padding:22px; background:#f5f7fa; color:#222; }
.card { background:#fff; padding:20px; border-radius:12px; margin-bottom:24px; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
.endpoint { padding:12px 0; border-bottom:1px solid #eee; }
.badge { padding:4px 8px; border-radius:8px; font-size:12px; margin-right:6px; }
.high { background:#ffe6e6; color:#b00; }
.medium { background:#fff5d6; color:#b68b00; }
.low { background:#e6ffe6; color:#008a00; }
code { background:#eee; padding:3px 6px; border-radius:6px; }
h1 { margin-bottom:20px; }
</style>

</head>
<body>

<h1>API Contract Divergence Report</h1>

<div class="card">
  <h2>Summary</h2>
  <p><strong>Total APIs:</strong> ${apis.length}</p>
  <p><strong>Total Test Cases:</strong> ${test_cases.length}</p>
  <p><strong>High Severity Issues:</strong> ${data.summary?.high_severity ?? 0}</p>
  <p><strong>Missing Endpoints:</strong> ${data.summary?.missing_endpoints ?? 0}</p>
  <p><strong>Extra Endpoints:</strong> ${data.summary?.extra_endpoints ?? 0}</p>
</div>

<div class="card">
  <h2>Endpoint Analysis</h2>

  ${apis
    .map(api => {
      const divergences = [];

      // Support for older format (string array)
      if (Array.isArray(api.divergences)) {
        api.divergences.forEach(msg => {
          divergences.push({
            type: "divergence",
            details: msg,
            severity: msg.toLowerCase().includes("missing") ? "high" : "medium"
          });
        });
      }

      // Support for structured LLM output
      if (Array.isArray(api.predicted_divergences)) {
        api.predicted_divergences.forEach(div => {
          let severity = "medium";
          if (
            div.type?.includes("missing") ||
            div.type?.includes("schema_mismatch") ||
            div.type?.includes("method_mismatch")
          ) {
            severity = "high";
          }
          divergences.push({
            type: div.type || "divergence",
            details: div.details || "",
            severity
          });
        });
      }

      return `
      <div class="endpoint">
        <strong>${api.method} <code>${api.path}</code></strong><br>
        <strong>Implemented:</strong> ${api.implemented ? "✔️ Yes" : "❌ No"}<br>

        <strong>Divergences:</strong>
        ${
          divergences.length === 0
            ? `<div>✅ No divergences for this API</div>`
            : divergences
                .map(
                  d => `
          <div>
            <span class="badge ${d.severity}">${d.severity.toUpperCase()}</span>
            <strong>${d.type}</strong> — ${d.details}
          </div>
        `
                )
                .join("")
        }
      </div>
      `;
    })
    .join("")}

</div>

<div class="card">
  <h2>Generated Test Cases</h2>

  ${
    test_cases.length === 0
      ? `<p>No test cases generated.</p>`
      : test_cases
          .map(
            tc => `
      <div class="endpoint">
        <strong>${tc.name}</strong><br>
        ${tc.method} <code>${tc.path}</code> (expected ${tc.expectedStatus})<br>
        <strong>Description:</strong> ${tc.description || "N/A"} <br>
        <strong>Payload:</strong> <code>${JSON.stringify(tc.requestBody)}</code>
      </div>
      `
          )
          .join("")
  }

</div>

</body>
</html>`;

  await fs.writeFile(outputPath, html);
  return outputPath;
}
