import express from "express";
import cors from "cors";

import { adminRoutes } from "./routes/admin.routes";
import { applicantRoutes } from "./routes/applicant.routes";
import { assessmentRoutes } from "./routes/assessment.routes";
import { authRoutes } from "./routes/auth.routes";
import { questionRoutes } from "./routes/question.routes";
import { recordingRoutes } from "./routes/recording.routes";

import { errorMiddleware } from "./middleware/error.middleware";
import { loadEnv } from "./config/env";

loadEnv();

export const app = express();

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ...(process.env.FRONTEND_URLS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
].filter((origin): origin is string => Boolean(origin));

const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

const isAllowedOrigin = (origin: string) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const hostname = new URL(normalizedOrigin).hostname;
    return hostname === "localhost" || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(authRoutes);
app.use(assessmentRoutes);
app.use(questionRoutes);
app.use(applicantRoutes);
app.use(recordingRoutes);
app.use(adminRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Assessment API is running",
  });
});

app.use(errorMiddleware);

export function startServer() {
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, "0.0.0.0", () => {
    console.log(`AI Assessment API running at http://localhost:${port}`);
  });
}
