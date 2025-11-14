// app/loader/codeLoader.js
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { normalizePath } from "../utils/normalizer.js";

export async function loadCodeSummary(dir) {
  const files = await glob(`${dir}/**/*.js`);

  let endpoints = [];
  let rawText = "";   // Full source code for Gemini

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    rawText += `\n// FILE: ${file}\n${text}\n`;

    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*["'`](.*?)["'`]/g;
    let match;

    while ((match = routeRegex.exec(text)) !== null) {
      const method = match[1].toUpperCase();
      const route = match[2];

      endpoints.push({
        method,
        path: normalizePath(route)
      });
    }
  }

  return {
    raw: rawText,                     // Full source code
    summary: JSON.stringify(endpoints, null, 2), // Endpoints JSON
    endpoints
  };
}
