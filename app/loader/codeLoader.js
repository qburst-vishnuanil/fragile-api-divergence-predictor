// app/loader/codeLoader.js
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { normalizePath } from "../utils/normalizer.js";

export async function loadCodeSummary(baseDir) {
  // Always scan both controllers & routes
  const patterns = [
    `${baseDir}/controllers/**/*.js`,
    `${baseDir}/routes/**/*.js`,
    `${baseDir}/*.js`
  ];

  let files = [];

  for (const p of patterns) {
    const matched = await glob(p);
    files.push(...matched);
  }

  let endpoints = [];
  let rawText = "";

  console.log("🔍 Scanning files:", files);

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    rawText += `\n// FILE: ${file}\n${text}\n`;

    // Detect express route definitions
    const routeRegex =
      /router\.(get|post|put|patch|delete)\s*\(\s*["'`](.*?)["'`]/g;

    let match;
    while ((match = routeRegex.exec(text)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: normalizePath(match[2])
      });
    }
  }

  console.log("🔍 Parsed endpoints:", endpoints);

  return {
    raw: rawText,
    summary: JSON.stringify(endpoints, null, 2),
    endpoints
  };
}
