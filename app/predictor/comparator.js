// app/predictor/comparator.js

// Normalize path params: /users/:id -> /users/{id}
function normalizePath(p) {
    if (!p) return p;
    return p.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
  }
  
  export function compareResults(predicted, actualRoutes) {
    const actualMap = actualRoutes.map(r => ({
      method: r.method.toUpperCase(),
      path: normalizePath(r.path),
      file: r.file,
      snippet: r.snippet
    }));
  
    const results = predicted.apis.map(api => {
      const wantPath = normalizePath(api.path);
      const wantMethod = (api.method || "GET").toUpperCase();
      const found = actualMap.find(a => a.method === wantMethod && a.path === wantPath);
  
      const implemented = !!found;
      const divergences = [];
  
      if (!implemented) {
        divergences.push({ type: "missing_endpoint", message: "Endpoint not implemented" });
      } else {
        // Attempt to detect missing fields heuristically by reading snippet if present
        if (api.expected_response_fields && api.expected_response_fields.length > 0) {
          // If snippet available, do a naive check: look for field names in snippet text
          const snippet = (found.snippet || "").toLowerCase();
          const missingFields = api.expected_response_fields.filter(f => {
            if (!f) return false;
            return !snippet.includes(f.toLowerCase());
          });
          if (missingFields.length > 0) {
            divergences.push({
              type: "missing_field",
              message: `Fields possibly missing in implementation: ${missingFields.join(", ")}`,
              fields: missingFields
            });
          }
        }
      }
  
      // severity assignment
      let severity = "low";
      if (divergences.find(d => d.type === "missing_endpoint")) severity = "high";
      else if (divergences.find(d => d.type === "missing_field")) severity = "medium";
  
      return {
        path: api.path,
        method: wantMethod,
        expected_request_fields: api.expected_request_fields || [],
        expected_response_fields: api.expected_response_fields || [],
        required_fields: api.required_fields || [],
        test_cases: api.test_cases || [],
        implemented,
        file: found?.file || null,
        divergences,
        severity
      };
    });
  
    // Detect extra endpoints in code (not in swagger)
    const predictedSet = new Set(predicted.apis.map(a => `${a.method.toUpperCase()} ${normalizePath(a.path)}`));
    for (const a of actualMap) {
      const key = `${a.method} ${normalizePath(a.path)}`;
      if (!predictedSet.has(key)) {
        results.push({
          path: a.path,
          method: a.method,
          implemented: true,
          file: a.file,
          divergences: [{ type: "extra_endpoint", message: "Implemented but not present in Swagger/OpenAPI" }],
          severity: "low",
          expected_request_fields: [],
          expected_response_fields: [],
          required_fields: [],
          test_cases: []
        });
      }
    }
  
    return results;
  }
  