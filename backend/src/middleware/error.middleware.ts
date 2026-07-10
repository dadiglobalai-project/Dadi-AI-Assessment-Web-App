import type { NextFunction, Request, Response } from "express";

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled backend error:", error);
  res.status(500).json({ success: false, message: "Internal server error" });
};
