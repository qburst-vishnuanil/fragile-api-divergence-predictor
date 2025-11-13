// app/parser/codeParser.js
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import * as acorn from "acorn";



function normalizePath(p) {
  // Convert express :param => {param}
  return p.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
}

export async function scanSourceCode(srcDir = "app/src") {
  const pattern = path.join(srcDir, "**/*.js");
  const files = await glob(pattern, { nodir: true });
  const routes = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");

    // Quick regex pass for common patterns: app.get('/x', ...), router.post('/x', ...)
    const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const pth = normalizePath(m[2]);
      routes.push({
        method,
        path: pth,
        file,
        snippet: extractSnippet(content, m.index)
      });
    }

    // AST scan fallback for more complex patterns
    try {
      const ast = acorn.parse(content, { ecmaVersion: 2020, sourceType: "module" });
      walkAstForRoutes(ast, file, routes);
    } catch (e) {
      // ignore AST errors — regex already got most
    }
  }

  // Deduplicate
  const uniq = [];
  for (const r of routes) {
    if (!uniq.find(u => u.method === r.method && u.path === r.path)) uniq.push(r);
  }
  return uniq;
}

function extractSnippet(content, idx, len = 200) {
  const start = Math.max(0, idx - 100);
  return content.slice(start, Math.min(content.length, start + len));
}

// simple AST walker for CallExpressions like router.get('/x', ...)
function walkAstForRoutes(ast, file, routes) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee && (callee.type === "MemberExpression")) {
        const objectName = callee.object?.name || (callee.object?.type === "Identifier" ? callee.object.name : null);
        const prop = callee.property?.name;
        if (objectName && prop && ["get","post","put","delete","patch"].includes(prop)) {
          const arg0 = node.arguments && node.arguments[0];
          if (arg0 && (arg0.type === "Literal" || arg0.type === "TemplateLiteral")) {
            let pth = "";
            if (arg0.type === "Literal") pth = arg0.value;
            else if (arg0.type === "TemplateLiteral") pth = arg0.quasis.map(q => q.value.cooked).join("");
            pth = pth.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
            routes.push({
              method: prop.toUpperCase(),
              path: pth,
              file,
              snippet: "" // AST node -> skip snippet for now
            });
          }
        }
      }
    }
    for (const k of Object.keys(node)) {
      const child = node[k];
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(ast);
}
