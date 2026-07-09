import path from "path";
import { supabase } from "./supabase";

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
