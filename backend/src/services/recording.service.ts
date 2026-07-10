import path from "path";
import {
  ai,
  Type,
  checkEmailExists,
  dbHelper,
  errorResponse,
  fetchSupabaseRowsByColumn,
  groupRowsByColumn,
  mapRowsById,
  successResponse,
  supabase
} from "./core.service";

const RECORDINGS_BUCKET = "recordings";

const sanitizeStorageSegment = (value: string) => {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
};

export const createRecordingFileName = (originalName: string) => {
  const ext = path.extname(originalName) || ".webm";
  return `recording-${Date.now()}-${Math.random().toString(36).slice(2, 11)}${ext}`;
};

export const buildRecordingStoragePath = (applicantAssessmentId: string, fileName: string) => {
  return `${sanitizeStorageSegment(applicantAssessmentId)}/${sanitizeStorageSegment(fileName)}`;
};

export const uploadRecordingToStorage = async ({
  applicantAssessmentId,
  fileName,
  buffer,
  contentType
}: {
  applicantAssessmentId: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}) => {
  const storagePath = buildRecordingStoragePath(applicantAssessmentId, fileName);
  console.log("Supabase Storage recording upload starting:", {
    bucket: RECORDINGS_BUCKET,
    storagePath,
    applicantAssessmentId
  });

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: contentType || "video/webm",
      upsert: true
    });

  if (error) {
    console.error("Supabase Storage recording upload failed:", {
      bucket: RECORDINGS_BUCKET,
      storagePath,
      applicantAssessmentId,
      error
    });
    throw error;
  }

  console.log("Supabase Storage recording upload succeeded:", {
    bucket: RECORDINGS_BUCKET,
    storagePath: data.path,
    applicantAssessmentId
  });

  return data.path;
};

export const createRecordingSignedUrl = async (storagePath: string) => {
  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    console.error("Supabase Storage signed URL generation failed:", {
      bucket: RECORDINGS_BUCKET,
      storagePath,
      error
    });
    throw error;
  }

  console.log("Supabase Storage signed URL generated:", {
    bucket: RECORDINGS_BUCKET,
    storagePath
  });

  return data.signedUrl;
};

export const deleteRecordingsFromStorage = async (storagePaths: string[]) => {
  const paths = storagePaths.filter(Boolean);
  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .remove(paths);

  if (error) {
    console.error("Supabase Storage recording delete failed:", {
      bucket: RECORDINGS_BUCKET,
      storagePaths: paths,
      error
    });
    throw error;
  }

  console.log("Supabase Storage recording delete succeeded:", {
    bucket: RECORDINGS_BUCKET,
    storagePaths: paths
  });
};

type ServiceRequest = {
  body: any;
  params: Record<string, any>;
  query: Record<string, any>;
  file?: any;
};

type ServiceResult = {
  status: number;
  body: any;
};

const createServiceResponder = () => {
  let result: ServiceResult | null = null;
  const res = {
    status(code: number) {
      return {
        json(body: any) {
          result = { status: code, body };
          return result;
        }
      };
    },
    json(body: any) {
      result = { status: 200, body };
      return result;
    }
  };

  return {
    res,
    getResult() {
      return result ?? { status: 204, body: null };
    }
  };
};

export const uploadApplicantRecordingService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const getRecordingSignedUrlService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};
