import { Router } from "express";
import { getApplicantAssessment, saveApplicantAnswer } from "../controllers/applicant.controller";

export const applicantRoutes = Router();

// Register applicant route handlers. Endpoint URLs are unchanged.
applicantRoutes.get("/api/applicant/assessment", getApplicantAssessment);
applicantRoutes.post("/api/applicant/answers/save", saveApplicantAnswer);
