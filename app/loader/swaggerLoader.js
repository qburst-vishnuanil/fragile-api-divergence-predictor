import fs from "fs";
import yaml from "js-yaml";

export function loadSwagger(filePath = "./swagger/swagger.yaml") {
  const file = fs.readFileSync(filePath, "utf8");
  const json = yaml.load(file);

  return {
    raw: json,
    summary: JSON.stringify(json, null, 2)
  };
}