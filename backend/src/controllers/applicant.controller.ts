import type { Request, Response } from "express";
import {
  getApplicantAssessmentService,
  saveApplicantAnswerService
} from "../services/applicant.service";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const getApplicantAssessment = async (req: Request, res: Response) => {
  const result = await getApplicantAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const saveApplicantAnswer = async (req: Request, res: Response) => {
  const result = await saveApplicantAnswerService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

