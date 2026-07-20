import type { Request, Response } from "express";
import {
  getRolesService,
  getAdminRolesService,
  createRoleService,
  updateRoleService,
  deleteRoleService,
  listAssessmentsService,
  getAssessmentService,
  createAssessmentService,
  updateAssessmentService,
  deleteAssessmentService,
  startApplicantAssessmentService,
  submitApplicantAssessmentService
} from "../services/assessment.service";
import { isBlockedAssessmentDevice, unsupportedAssessmentDeviceBody } from "../utils/device";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const getRoles = async (req: Request, res: Response) => {
  const result = await getRolesService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const getAdminRoles = async (req: Request, res: Response) => {
  const result = await getAdminRolesService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const createRole = async (req: Request, res: Response) => {
  const result = await createRoleService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const updateRole = async (req: Request, res: Response) => {
  const result = await updateRoleService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const deleteRole = async (req: Request, res: Response) => {
  const result = await deleteRoleService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const listAssessments = async (req: Request, res: Response) => {
  const result = await listAssessmentsService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const getAssessment = async (req: Request, res: Response) => {
  const result = await getAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const createAssessment = async (req: Request, res: Response) => {
  const result = await createAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const updateAssessment = async (req: Request, res: Response) => {
  const result = await updateAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const deleteAssessment = async (req: Request, res: Response) => {
  const result = await deleteAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const startApplicantAssessment = async (req: Request, res: Response) => {
  if (isBlockedAssessmentDevice(req.headers)) {
    return res.status(403).json(unsupportedAssessmentDeviceBody());
  }

  const result = await startApplicantAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const submitApplicantAssessment = async (req: Request, res: Response) => {
  if (isBlockedAssessmentDevice(req.headers)) {
    return res.status(403).json(unsupportedAssessmentDeviceBody());
  }

  const result = await submitApplicantAssessmentService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

