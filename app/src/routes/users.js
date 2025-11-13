import express from "express";
import { getUsers } from "../controllers/usersController.js";

const router = express.Router();

router.get("/users", getUsers); // only GET implemented

export default router;
