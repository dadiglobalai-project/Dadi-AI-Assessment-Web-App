import { Router } from "express";
import { getRecordingSignedUrl, logRecordingEvent, uploadApplicantRecording } from "../controllers/recording.controller";
import { upload } from "../middleware/upload.middleware";

export const recordingRoutes = Router();

// Register recording route handlers. Endpoint URLs are unchanged.
recordingRoutes.post("/api/applicant/recording/upload", upload.single("video"), uploadApplicantRecording);
recordingRoutes.post("/api/applicant/recording/event", logRecordingEvent);
recordingRoutes.get("/api/admin/recordings/:recordingId/url", getRecordingSignedUrl);
