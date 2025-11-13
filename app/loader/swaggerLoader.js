import fs from "fs";
import yaml from "js-yaml";

export function loadSwagger(path) {
  const file = yaml.load(fs.readFileSync(path, "utf8"));
  const summary = JSON.stringify(file.paths, null, 2);

  return { file, summary };
}
