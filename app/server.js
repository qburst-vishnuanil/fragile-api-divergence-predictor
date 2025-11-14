// app/server.js
import express from "express";
import usersRouter from "./src/routes/users.js";

const app = express();
app.use(express.json());

// mount your API routes
app.use("/", usersRouter);

const PORT = process.env.PORT || 3000;

export function startServer() {
  return new Promise(resolve => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Test server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}
