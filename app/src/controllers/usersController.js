// app/src/controllers/usersController.js
import fs from "fs";
import path from "path";

const TEST_DATA_PATH = path.resolve("generated/testData.json");

let users = [];
let orders = [];


// Attempt to load generated test data at startup
try {
  if (fs.existsSync(TEST_DATA_PATH)) {
    const raw = fs.readFileSync(TEST_DATA_PATH, "utf8");
    const json = JSON.parse(raw);
    users = Array.isArray(json.users) ? json.users.slice() : [];
    orders = Array.isArray(json.orders) ? [...json.orders] : [];
    console.log(`📦 Loaded ${users.length} users and ${orders.length} orders from ${TEST_DATA_PATH}`);
  } else {
    users = [];
    console.log("⚠️ No generated/testData.json found — starting with empty users array.");
  }
} catch (err) {
  console.error("❌ Error loading testData.json:", err);
  users = [];
}

// GET /users
export const getUsers = (req, res) => {
  return res.status(201).json(users);
};

// POST /users
export const createUser = (req, res) => {
  const { name , role } = req.body;

  if (!name || !role) {
    return res.status(400).json({
      error: "name and role are required "
    });
  }

  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    name,
    role
  };

  users.push(newUser);

  return res.status(201).json(newUser);
};

// GET /users/:id 
export const getUserById = (req, res) => {
  const { id } = req.params;
  const user = users.find(u => u.id === Number(id));

  if (!user) {
    return res.status(404).json({ error: "User not found " });
  }

  return res.status(200).json(user);
};

//GET /order
export const getOrder = (req,res) => {
    return res.status(200).json(orders);
}