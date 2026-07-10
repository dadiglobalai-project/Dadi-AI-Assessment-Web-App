import { Router } from "express";
import { deleteSubmission, getSubmissionDetails, gradeSubmissionWithAI, listSubmissions, resetSubmission, reviewSubmission } from "../controllers/admin.controller";

export const adminRoutes = Router();

// Register admin route handlers. Endpoint URLs are unchanged.
adminRoutes.get("/api/admin/submissions", listSubmissions);
adminRoutes.get("/api/admin/submissions/:id", getSubmissionDetails);
adminRoutes.post("/api/admin/submissions/:id/review", reviewSubmission);
adminRoutes.post("/api/admin/submissions/:id/reset", resetSubmission);
adminRoutes.delete("/api/admin/submissions/:id", deleteSubmission);
adminRoutes.post("/api/admin/submissions/:id/ai-grade", gradeSubmissionWithAI);
