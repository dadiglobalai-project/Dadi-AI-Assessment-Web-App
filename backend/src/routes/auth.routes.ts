import { Router } from "express";
import { getCurrentUser, login, register, validateInvite } from "../controllers/auth.controller";

export const authRoutes = Router();

// Register auth route handlers. Endpoint URLs are unchanged.
authRoutes.get("/api/invite/validate", validateInvite);
authRoutes.post("/api/auth/login", login);
authRoutes.post("/api/auth/register", register);
authRoutes.get("/api/auth/me", getCurrentUser);
