import { Router } from "express";
import { createAssessment, createRole, deleteAssessment, deleteRole, getAdminRoles, getAssessment, getRoles, listAssessments, startApplicantAssessment, submitApplicantAssessment, updateAssessment, updateRole } from "../controllers/assessment.controller";

export const assessmentRoutes = Router();

// Register assessment route handlers. Endpoint URLs are unchanged.
assessmentRoutes.get("/api/roles", getRoles);
assessmentRoutes.get("/api/admin/roles", getAdminRoles);
assessmentRoutes.post("/api/admin/roles", createRole);
assessmentRoutes.put("/api/admin/roles/:id", updateRole);
assessmentRoutes.delete("/api/admin/roles/:id", deleteRole);
assessmentRoutes.get("/api/admin/assessments", listAssessments);
assessmentRoutes.get("/api/admin/assessments/:id", getAssessment);
assessmentRoutes.post("/api/admin/assessments", createAssessment);
assessmentRoutes.put("/api/admin/assessments/:id", updateAssessment);
assessmentRoutes.delete("/api/admin/assessments/:id", deleteAssessment);
assessmentRoutes.post("/api/applicant/assessment/start", startApplicantAssessment);
assessmentRoutes.post("/api/applicant/assessment/submit", submitApplicantAssessment);
