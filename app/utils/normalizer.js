// app/utils/normalizer.js

export function normalizePath(path) {
    if (!path) return "";
  
    return path
      .trim()
  
      // convert to lowercase (Swagger and Express must match)
      .toLowerCase()
  
      // ensure a single leading slash
      .replace(/^\/?/, "/")
  
      // remove trailing slashes
      .replace(/\/+$/, "")
  
      // collapse duplicate slashes (e.g., /users//id)
      .replace(/\/+/g, "/")
  
      // convert express params :id → {id}
      .replace(/:([a-z0-9_]+)/g, "{$1}")
  
      // normalize {id} again (just to clean variations)
      .replace(/\{([a-z0-9_]+)\}/g, "{$1}");
  }
  