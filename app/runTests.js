// app/runTests.js
import { startServer } from "./server.js";
import newman from "newman";

async function run() {
  console.log("🔧 Starting API test server...");

  const server = await startServer();

  console.log("🧪 Running Postman tests...");

  try {
    await new Promise((resolve, reject) => {
      newman.run(
        {
          collection: "generated/postman_collection.json",
          reporters: "cli"
        },
        (err, summary) => {
          if (err) return reject(err);
          if (summary.run.failures.length > 0) {
            console.error("❌ Test failures detected:");
            console.error(summary.run.failures);
            return reject(new Error("Test suite failed"));
          }
          resolve();
        }
      );
    });

    console.log("✅ All tests passed!");
    server.close();
    process.exit(0);

  } catch (err) {
    console.error("🔥 Test suite failed:", err.message);
    server.close();
    process.exit(1);
  }
}

run();
