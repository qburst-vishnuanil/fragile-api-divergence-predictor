// app/report/postmanGenerator.js
import fs from "fs/promises";
import path from "path";

export async function generatePostmanCollection(
  testCases,
  outputPath = "generated/postman_collection.json"
) {
  if (!Array.isArray(testCases)) testCases = [];

  console.log(`📦 Preparing Postman collection with ${testCases.length} test cases...`);

  const collection = {
    info: {
      name: "AI Divergence Test Suite",
      _postman_id: "auto-generated-" + Date.now(),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description:
        "This collection is auto-generated from your API contract vs source-code divergence analysis.",
    },

    item: testCases.map(tc => {
      const expectedStatus = Number(tc.expectedStatus) || 200;

      return {
        name: tc.name || `${tc.method} ${tc.path}`,
        request: {
          method: tc.method ? tc.method.toUpperCase() : "GET",

          header: [
            { key: "Content-Type", value: "application/json" }
          ],

          url: {
            raw: `{{baseUrl}}${tc.path}`,
            host: ["{{baseUrl}}"],
            path: tc.path.replace(/^\//, "").split("/"),
          },

          body: tc.requestBody
            ? {
                mode: "raw",
                raw: JSON.stringify(tc.requestBody, null, 2)
              }
            : undefined
        },

        event: [
          {
            listen: "test",
            script: {
              exec: [
                `pm.test("Status code should be ${expectedStatus}", function () {`,
                `    pm.response.to.have.status(${expectedStatus});`,
                `});`,
                ""
              ]
            }
          }
        ],

        response: []
      };
    }),

    variable: [
      { key: "baseUrl", value: "http://localhost:3000" }
    ]
  };

  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(outputPath, JSON.stringify(collection, null, 2));

  console.log(`✅ Postman collection generated: ${outputPath}`);
  return outputPath;
}
