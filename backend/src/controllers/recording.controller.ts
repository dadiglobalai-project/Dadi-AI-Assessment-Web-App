import type { Request, Response } from "express";
import {
  ai,
  Type,
  checkEmailExists,
  createRecordingFileName,
  createRecordingSignedUrl,
  dbHelper,
  deleteRecordingsFromStorage,
  DEFAULT_QUESTION_CONFIG,
  errorResponse,
  fetchSupabaseRowsByColumn,
  getAssignedQuestionsForAttempt,
  getAssessmentQuestionConfig,
  groupRowsByColumn,
  mapRowsById,
  parseQuestionDifficulty,
  successResponse,
  supabase,
  uploadRecordingToStorage
} from "../services/core.service";

export const uploadApplicantRecording = async (req: Request, res: Response) => {
  const { applicantAssessmentId, duration } = req.body;
  if (!applicantAssessmentId || !req.file) {
    return errorResponse(res, "applicantAssessmentId and video file are required");
  }

  const record = await dbHelper.getApplicantAssessmentById(applicantAssessmentId);
  if (!record) {
    return errorResponse(res, "Assessment record not found for this recording", 404);
  }

  const fileName = createRecordingFileName(req.file.originalname);
  let storagePath: string;

  try {
    storagePath = await uploadRecordingToStorage({
      applicantAssessmentId,
      fileName,
      buffer: req.file.buffer,
      contentType: req.file.mimetype
    });
  } catch (err) {
    console.error("Recording upload to Supabase Storage failed:", {
      applicantAssessmentId,
      originalName: req.file.originalname,
      error: err
    });
    return errorResponse(res, "Failed to upload recording", 500);
  }

  const recording = {
    id: `rec-${Date.now()}`,
    applicant_assessment_id: applicantAssessmentId,
    file_name: fileName,
    file_url: storagePath,
    file_size: req.file.size,
    duration: duration ? Number(duration) : 0,
    uploaded_at: new Date().toISOString()
  };

  try {
    await dbHelper.saveRecording(recording);
    successResponse(res, recording, "Recording uploaded and saved successfully!");
  } catch (err) {
    console.error("Recording upload metadata save failed:", {
      applicantAssessmentId,
      fileName,
      error: err
    });
    errorResponse(res, "Failed to save recording metadata", 500);
  }
};

export const getRecordingSignedUrl = async (req: Request, res: Response) => {
  const { recordingId } = req.params;

  try {
    const { data: recording, error } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", recordingId)
      .maybeSingle();

    if (error) {
      console.error("Supabase recording fetch for signed URL failed:", {
        recordingId,
        error
      });
      return errorResponse(res, "Failed to load recording", 500);
    }

    if (!recording) {
      return errorResponse(res, "Recording not found", 404);
    }

    if (!recording.file_url) {
      console.error("Recording is missing Supabase Storage path:", {
        recordingId,
        recording
      });
      return errorResponse(res, "Recording file path is missing", 500);
    }

    const signedUrl = await createRecordingSignedUrl(recording.file_url);
    successResponse(res, { signedUrl });
  } catch (err) {
    console.error("Recording signed URL endpoint failed:", {
      recordingId,
      error: err
    });
    errorResponse(res, "Failed to generate recording URL", 500);
  }
};

