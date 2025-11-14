// app/loader/codeLoader.js
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { normalizePath } from "../utils/normalizer.js";

export async function loadCodeSummary(dir) {
  const files = await glob(`${dir}/**/*.js`);

  let endpoints = [];
  let rawText = ""; // full code sent to LLM

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    rawText += `\n// FILE: ${file}\n${text}\n`;

    const routeRegex =
      /router\.(get|post|put|patch|delete)\s*\(\s*["'`](.*?)["'`]\s*,\s*([A-Za-z0-9_]+)/g;

    let match;

    while ((match = routeRegex.exec(text)) !== null) {
      const method = match[1].toUpperCase();
      const route = normalizePath(match[2]);
      const handler = match[3];

      // extract handler function body
      const fnRegex = new RegExp(
        `export\\s+const\\s+${handler}\\s*=\\s*\\((.*?)=>\\s*{([\\s\\S]*?)};`,
        "m"
      );

      const fnMatch = text.match(fnRegex);

      const handlerBody = fnMatch ? fnMatch[2].trim() : "";

      endpoints.push({
        method,
        path: route,
        handler,
        handler_body: handlerBody
      });
    }
  }

  return {
    raw: rawText,
    endpoints
  };
}
