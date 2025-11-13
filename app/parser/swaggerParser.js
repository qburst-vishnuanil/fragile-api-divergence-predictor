// app/parser/swaggerParser.js
import fs from "fs/promises";
import yaml from "js-yaml";

export async function loadSwagger(filePath = "app/swagger.yaml") {
  const raw = await fs.readFile(filePath, "utf8");
  const swagger = yaml.load(raw);
  // Normalize into a list of APIs
  const apis = [];
  const paths = swagger.paths || {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const method of Object.keys(pathItem || {})) {
      const lower = method.toLowerCase();
      const op = pathItem[lower];
      const responses = op?.responses || {};
      const successStatus = Object.keys(responses).find(s => s.startsWith("2")) || "200";
      // Extract response fields if schema present
      let responseFields = [];
      try {
        const content = responses[successStatus]?.content;
        const schema = content?.["application/json"]?.schema;
        if (schema?.type === "object" && schema.properties) {
          responseFields = Object.keys(schema.properties);
        } else if (schema?.type === "array" && schema.items?.properties) {
          responseFields = Object.keys(schema.items.properties);
        }
      } catch (e) {
        responseFields = [];
      }
      // Request body fields
      let requestFields = [];
      try {
        const reqSchema = op?.requestBody?.content?.["application/json"]?.schema;
        if (reqSchema?.properties) requestFields = Object.keys(reqSchema.properties);
      } catch (e) {
        requestFields = [];
      }
      // required fields
      const required = op?.requestBody?.content?.["application/json"]?.schema?.required || [];

      apis.push({
        path: pathKey,
        method: lower.toUpperCase(),
        expected_response_fields: responseFields,
        expected_request_fields: requestFields,
        required_fields: required
      });
    }
  }
  return { raw: swagger, apis };
}
