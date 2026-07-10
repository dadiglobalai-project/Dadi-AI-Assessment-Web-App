import type { Request, Response } from "express";
import {
  validateInviteService,
  loginService,
  registerService,
  getCurrentUserService
} from "../services/auth.service";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const validateInvite = async (req: Request, res: Response) => {
  const result = await validateInviteService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const login = async (req: Request, res: Response) => {
  const result = await loginService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const register = async (req: Request, res: Response) => {
  const result = await registerService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const getCurrentUser = async (req: Request, res: Response) => {
  const result = await getCurrentUserService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

