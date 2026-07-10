import type { Request, Response } from "express";
import {
  updateAssessmentQuestionConfigService,
  createQuestionService,
  updateQuestionService,
  deleteQuestionService,
  generateQuestionsWithAIService
} from "../services/question.service";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const updateAssessmentQuestionConfig = async (req: Request, res: Response) => {
  const result = await updateAssessmentQuestionConfigService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const createQuestion = async (req: Request, res: Response) => {
  const result = await createQuestionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const updateQuestion = async (req: Request, res: Response) => {
  const result = await updateQuestionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const deleteQuestion = async (req: Request, res: Response) => {
  const result = await deleteQuestionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const generateQuestionsWithAI = async (req: Request, res: Response) => {
  const result = await generateQuestionsWithAIService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

