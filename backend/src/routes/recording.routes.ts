import { Router } from "express";
import { getRecordingSignedUrl, uploadApplicantRecording } from "../controllers/recording.controller";
import { upload } from "../middleware/upload.middleware";

export const recordingRoutes = Router();

// Register recording route handlers. Endpoint URLs are unchanged.
recordingRoutes.post("/api/applicant/recording/upload", upload.single("video"), uploadApplicantRecording);
recordingRoutes.get("/api/admin/recordings/:recordingId/url", getRecordingSignedUrl);
