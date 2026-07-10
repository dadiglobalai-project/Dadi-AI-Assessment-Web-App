import type { Response } from "express";

export const successResponse = (res: Response, data: unknown, message = "Success") => {
  res.json({ success: true, message, data });
};

export const errorResponse = (res: Response, message: string, status = 400) => {
  res.status(status).json({ success: false, message });
};
