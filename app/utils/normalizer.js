export function normalizePath(path) {
    return path
      .replace(/:([A-Za-z0-9_]+)/g, '{$1}')     // /users/:id → /users/{id}
      .replace(/\{([A-Za-z0-9_]+)\}/g, '{$1}')  // keep Swagger format as-is
      .trim();
  }
  