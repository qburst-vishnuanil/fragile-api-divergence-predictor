// app/runTests.js
import path from "path";
import fs from "fs/promises";
import { startServer } from "./server.js";
import newman from "newman";

async function run() {
  console.log("🔧 Starting temporary API server...");

  let server;
  try {
    server = await startServer();
  } catch (err) {
    console.error("❌ Failed to start API server:", err.message);
    process.exit(1);
  }

  const collectionPath = path.resolve("generated/postman_collection.json");

  // --------------------------------------
  // Ensure collection exists
  // --------------------------------------
  try {
    await fs.access(collectionPath);
  } catch {
    console.error("❌ Postman collection not found:", collectionPath);
    console.error("Run `node app/index.js` first to generate it.");
    server.close();
    process.exit(1);
  }

  console.log("🧪 Running Postman tests on:", collectionPath);

  try {
    await new Promise((resolve, reject) => {
      newman.run(
        {
          collection: collectionPath,
          reporters: "cli",
          timeoutRequest: 10000,
          insecure: true
        },
        (err, summary) => {
          if (err) {
            server.close(() => {
              console.error("❌ Newman encountered an error:", err.message);
              reject(err);
            });
            return;
          }

          // --------------------------------------
          // Handle test failures
          // --------------------------------------
          if (summary.run.failures.length > 0) {
            console.error("❌ Test failures detected:");
            summary.run.failures.forEach(f => {
              console.error(`➡ ${f.source.name}: ${f.error.message}`);
            });

            server.close(() => {
              console.log("🛑 Test server stopped after failures.");
              reject(new Error("Test suite failed"));
            });
            return;
          }

          // --------------------------------------
          // No failures → success
          // --------------------------------------
          server.close(() => {
            console.log("🛑 Test server stopped.");
            resolve();
          });
        }
      );
    });

    console.log("✅ All Postman test cases passed!");
    process.exit(0);

  } catch (err) {
    console.error("🔥 Test suite failed:", err.message);
    process.exit(1);
  }
}

run();
