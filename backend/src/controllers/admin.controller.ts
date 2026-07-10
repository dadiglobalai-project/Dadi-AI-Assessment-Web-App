import type { Request, Response } from "express";
import {
  listSubmissionsService,
  getSubmissionDetailsService,
  reviewSubmissionService,
  resetSubmissionService,
  deleteSubmissionService,
  gradeSubmissionWithAIService
} from "../services/admin.service";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const listSubmissions = async (req: Request, res: Response) => {
  const result = await listSubmissionsService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const getSubmissionDetails = async (req: Request, res: Response) => {
  const result = await getSubmissionDetailsService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const reviewSubmission = async (req: Request, res: Response) => {
  const result = await reviewSubmissionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const resetSubmission = async (req: Request, res: Response) => {
  const result = await resetSubmissionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const deleteSubmission = async (req: Request, res: Response) => {
  const result = await deleteSubmissionService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const gradeSubmissionWithAI = async (req: Request, res: Response) => {
  const result = await gradeSubmissionWithAIService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

