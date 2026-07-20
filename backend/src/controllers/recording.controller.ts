import type { Request, Response } from "express";
import {
  uploadApplicantRecordingService,
  getRecordingSignedUrlService
} from "../services/recording.service";
import { isBlockedAssessmentDevice, unsupportedAssessmentDeviceBody } from "../utils/device";

const sendServiceResult = (res: Response, result: { status: number; body: any }) => {
  if (result.body === null || result.body === undefined) {
    return res.sendStatus(result.status);
  }
  return res.status(result.status).json(result.body);
};

export const uploadApplicantRecording = async (req: Request, res: Response) => {
  if (isBlockedAssessmentDevice(req.headers)) {
    return res.status(403).json(unsupportedAssessmentDeviceBody());
  }

  const result = await uploadApplicantRecordingService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

export const getRecordingSignedUrl = async (req: Request, res: Response) => {
  const result = await getRecordingSignedUrlService({
    body: req.body,
    params: req.params,
    query: req.query,
    file: req.file
  });
  return sendServiceResult(res, result);
};

