import path from "path";
import {
  ai,
  Type,
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

export const createRecordingFileName = (originalName: string, segmentNumber = 1) => {
  const ext = path.extname(originalName) || ".webm";
  return `segment-${segmentNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}${ext}`;
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
    applicantAssessmentId,
    fileSize: buffer.length,
    contentType,
    normalizedContentType: (contentType || "video/webm").split(";")[0] || "video/webm"
  });

  const normalizedContentType = (contentType || "video/webm").split(";")[0] || "video/webm";

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: normalizedContentType,
      upsert: false
    });

  if (error) {
    console.error("Supabase Storage recording upload failed:", {
      bucket: RECORDINGS_BUCKET,
      storagePath,
      applicantAssessmentId,
      fileSize: buffer.length,
      contentType,
      normalizedContentType,
      errorName: (error as any)?.name,
      errorMessage: (error as any)?.message,
      errorStatus: (error as any)?.status,
      errorStatusCode: (error as any)?.statusCode,
      error
    });
    throw error;
  }

    console.log("Supabase Storage recording upload succeeded:", {
      bucket: RECORDINGS_BUCKET,
      storagePath: data.path,
      applicantAssessmentId,
      fileSize: buffer.length,
      normalizedContentType
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

const saveRecordingEvent = async ({
  applicantAssessmentId,
  eventType,
  segmentNumber,
  metadata = {}
}: {
  applicantAssessmentId: string;
  eventType: string;
  segmentNumber?: number;
  metadata?: Record<string, unknown>;
}) => {
  const { error } = await supabase
    .from("recording_events")
    .insert({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      applicant_assessment_id: applicantAssessmentId,
      event_type: eventType,
      segment_number: segmentNumber ?? null,
      occurred_at: new Date().toISOString(),
      metadata
    });

  if (error) {
    console.error("Recording event insert failed:", {
      applicantAssessmentId,
      eventType,
      segmentNumber,
      error
    });
  }
};

const getNextRecordingSegmentNumber = async (applicantAssessmentId: string, requestedSegmentNumber: number) => {
  const { data, error } = await supabase
    .from("recordings")
    .select("segment_number")
    .eq("applicant_assessment_id", applicantAssessmentId)
    .order("segment_number", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Recording segment number lookup failed:", {
      applicantAssessmentId,
      error
    });
    throw error;
  }

  const highestSegmentNumber = Number(data?.[0]?.segment_number ?? 0);
  if (!Number.isFinite(highestSegmentNumber) || highestSegmentNumber <= 0) {
    return requestedSegmentNumber;
  }

  return Math.max(requestedSegmentNumber, highestSegmentNumber + 1);
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

  const { applicantAssessmentId, duration, segmentNumber, segmentStartedAt, segmentEndedAt, clientSegmentId } = req.body;
  if (!applicantAssessmentId || !req.file) {
    return errorResponse(res, "applicantAssessmentId and video file are required");
  }

  if (!req.file.size || req.file.size <= 0) {
    return errorResponse(res, "Recording video file is empty");
  }

  const record = await dbHelper.getApplicantAssessmentById(applicantAssessmentId);
  if (!record) {
    return errorResponse(res, "Assessment record not found for this recording", 404);
  }

  if (clientSegmentId) {
    const { data: existingSegment, error: existingSegmentError } = await supabase
      .from("recordings")
      .select("*")
      .eq("applicant_assessment_id", applicantAssessmentId)
      .eq("client_segment_id", String(clientSegmentId))
      .maybeSingle();

    if (existingSegmentError) {
      console.error("Recording idempotency lookup failed:", {
        applicantAssessmentId,
        clientSegmentId,
        error: existingSegmentError
      });
      return errorResponse(res, "Failed to check existing recording segment", 500);
    }

    if (existingSegment) {
      return successResponse(res, existingSegment, "Recording segment already uploaded.");
    }
  }

  const parsedSegmentNumber = Number(segmentNumber || 1);
  const requestedSegmentNumber = Number.isFinite(parsedSegmentNumber) && parsedSegmentNumber > 0
    ? Math.floor(parsedSegmentNumber)
    : 1;
  let normalizedSegmentNumber: number;
  try {
    normalizedSegmentNumber = await getNextRecordingSegmentNumber(applicantAssessmentId, requestedSegmentNumber);
  } catch (err) {
    return errorResponse(res, "Failed to allocate recording segment", 500);
  }
  const uploadedAt = new Date().toISOString();
  const startedAt = segmentStartedAt ? new Date(segmentStartedAt).toISOString() : uploadedAt;
  const endedAt = segmentEndedAt ? new Date(segmentEndedAt).toISOString() : uploadedAt;
  const fileName = createRecordingFileName(req.file.originalname, normalizedSegmentNumber);
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
      segmentNumber: normalizedSegmentNumber,
      clientSegmentId: clientSegmentId ? String(clientSegmentId) : null,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      normalizedMimetype: (req.file.mimetype || "video/webm").split(";")[0] || "video/webm",
      errorName: (err as any)?.name,
      errorMessage: (err as any)?.message,
      errorStatus: (err as any)?.status,
      errorStatusCode: (err as any)?.statusCode,
      stack: (err as any)?.stack,
      error: err
    });
    return res.status(500).json({
      success: false,
      code: "RECORDING_STORAGE_UPLOAD_FAILED",
      message: "Failed to upload recording",
      details: {
        applicantAssessmentId,
        segmentNumber: normalizedSegmentNumber,
        fileSize: req.file.size,
        mimetype: req.file.mimetype,
        normalizedMimetype: (req.file.mimetype || "video/webm").split(";")[0] || "video/webm",
        storageError: {
          name: (err as any)?.name,
          message: (err as any)?.message,
          status: (err as any)?.status,
          statusCode: (err as any)?.statusCode
        }
      }
    });
  }

  const recording = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    applicant_assessment_id: applicantAssessmentId,
    segment_number: normalizedSegmentNumber,
    client_segment_id: clientSegmentId ? String(clientSegmentId) : null,
    file_name: fileName,
    file_url: storagePath,
    file_size: req.file.size,
    duration: duration ? Number(duration) : 0,
    duration_seconds: duration ? Number(duration) : 0,
    started_at: startedAt,
    ended_at: endedAt,
    upload_status: "UPLOADED",
    uploaded_at: uploadedAt
  };

  try {
    const savedRecording = await dbHelper.saveRecording(recording);
    console.log("Recording metadata insert succeeded:", {
      applicantAssessmentId,
      recordingId: savedRecording.id,
      segmentNumber: normalizedSegmentNumber,
      fileName,
      storagePath,
      fileSize: req.file.size
    });
    console.log("RECORDING_SEGMENT_UPLOADED", {
      applicantAssessmentId,
      recordingId: savedRecording.id,
      segmentNumber: normalizedSegmentNumber,
      timestamp: uploadedAt
    });
    await saveRecordingEvent({
      applicantAssessmentId,
      eventType: "RECORDING_SEGMENT_UPLOADED",
      segmentNumber: normalizedSegmentNumber,
      metadata: {
        recordingId: savedRecording.id,
        fileSize: req.file.size
      }
    });
    successResponse(res, savedRecording, "Recording uploaded and saved successfully!");
  } catch (err) {
    if ((err as any)?.code === "23505") {
      if (clientSegmentId) {
        const { data: existingSegment } = await supabase
          .from("recordings")
          .select("*")
          .eq("applicant_assessment_id", applicantAssessmentId)
          .eq("client_segment_id", String(clientSegmentId))
          .maybeSingle();

        if (existingSegment) {
          successResponse(res, existingSegment, "Recording segment already uploaded.");
          return getResult();
        }
      }

      try {
        const retrySegmentNumber = await getNextRecordingSegmentNumber(applicantAssessmentId, normalizedSegmentNumber + 1);
        const retryRecording = {
          ...recording,
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          segment_number: retrySegmentNumber
        };
        const savedRecording = await dbHelper.saveRecording(retryRecording);
        console.log("Recording metadata insert succeeded after segment retry:", {
          applicantAssessmentId,
          recordingId: savedRecording.id,
          originalSegmentNumber: normalizedSegmentNumber,
          segmentNumber: retrySegmentNumber,
          storagePath
        });
        successResponse(res, savedRecording, "Recording uploaded and saved successfully!");
        return getResult();
      } catch (retryErr) {
        console.error("Recording metadata retry failed:", {
          applicantAssessmentId,
          originalSegmentNumber: normalizedSegmentNumber,
          storagePath,
          errorCode: (retryErr as any)?.code,
          errorMessage: (retryErr as any)?.message,
          errorDetails: (retryErr as any)?.details,
          error: retryErr
        });
      }
    }

    console.error("Recording upload metadata save failed:", {
      applicantAssessmentId,
      segmentNumber: normalizedSegmentNumber,
      clientSegmentId: clientSegmentId ? String(clientSegmentId) : null,
      fileName,
      storagePath,
      errorCode: (err as any)?.code,
      errorMessage: (err as any)?.message,
      errorDetails: (err as any)?.details,
      error: err
    });
    errorResponse(res, "Failed to save recording metadata", 500);
  }

  return getResult();
};

export const logRecordingEventService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();
  const { applicantAssessmentId, eventType, segmentNumber, metadata } = req.body;

  if (!applicantAssessmentId || !eventType) {
    return errorResponse(res, "applicantAssessmentId and eventType are required");
  }

  await saveRecordingEvent({
    applicantAssessmentId,
    eventType: String(eventType),
    segmentNumber: segmentNumber ? Number(segmentNumber) : undefined,
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  });

  successResponse(res, null, "Recording event logged");
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
