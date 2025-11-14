import express from "express";
import { 
  getUsers,
  createUser,
  getUserById
} from "../controllers/usersController.js";

const router = express.Router();

// GET /users
router.get("/users", getUsers);

// POST /users
router.post("/users", createUser);

// GET /users/:id
router.get("/users/:id", getUserById);

export default router;
