// app/loader/codeLoader.js
import fs from "fs";
import path from "path";

export async function loadCodeSummary(rootPath) {
  let summary = "";

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const content = fs.readFileSync(fullPath, "utf8");
        summary += `\n\n// FILE: ${fullPath}\n${content}`;
      }
    }
  }

  scan(rootPath);

  return { summary };
}
