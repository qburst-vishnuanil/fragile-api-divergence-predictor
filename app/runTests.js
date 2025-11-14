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

  // --------------------------------------
  // Execute Newman programmatically
  // --------------------------------------
  try {
    await new Promise((resolve, reject) => {
      newman.run({
    collection: collectionPath,
    reporters: ['cli', 'htmlextra'],
    reporter: {
        htmlextra: {
            export: 'generated/test-report.html',
            logs: true,
            browserTitle: "API Divergence Test Report",
            title: "AI-Generated Test Execution Results",
            testPaging: true,
            showEnvironmentData: true,
            skipSensitiveData: true
        }
    }
});

    });

    console.log("✅ All Postman test cases passed!");
    server.close();
    process.exit(0);

  } catch (err) {
    console.error("🔥 Test suite failed:", err.message);
    server.close();
    process.exit(1);
  }
}

run();
