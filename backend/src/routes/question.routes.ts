import { Router } from "express";
import { createQuestion, deleteQuestion, generateQuestionsWithAI, updateAssessmentQuestionConfig, updateQuestion } from "../controllers/question.controller";

export const questionRoutes = Router();

// Register question route handlers. Endpoint URLs are unchanged.
questionRoutes.put("/api/admin/assessments/:id/question-config", updateAssessmentQuestionConfig);
questionRoutes.post("/api/admin/assessments/:id/questions", createQuestion);
questionRoutes.put("/api/admin/questions/:id", updateQuestion);
questionRoutes.delete("/api/admin/questions/:id", deleteQuestion);
questionRoutes.post("/api/admin/ai/generate-questions", generateQuestionsWithAI);
