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

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
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
