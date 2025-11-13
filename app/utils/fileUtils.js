// app/utils/fileUtils.js
import fs from "fs/promises";
import path from "path";

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
}

export function ensureSlashRoot(p) {
  return p.startsWith("/") ? p : path.join(process.cwd(), p);
}
