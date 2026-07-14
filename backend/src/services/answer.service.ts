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
import {createServiceResponder} from "./applicant.service";

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

export const saveApplicantAnswerService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  const { applicantAssessmentId, questionId, answerText } = req.body;
  if (!applicantAssessmentId || !questionId) {
    return errorResponse(res, "applicantAssessmentId and questionId are required");
  }

  try {
    const record = await dbHelper.getApplicantAssessmentById(applicantAssessmentId);
    if (!record) {
      return errorResponse(res, "Assessment record not found", 404);
    }

    if (record.status !== 'IN_PROGRESS') {
      return errorResponse(res, "Cannot save answers as assessment is not in progress", 400);
    }

    const answer = {
      applicantAssessmentId,
      questionId,
      answerText: answerText || ""
    };

    await dbHelper.saveAnswer(answer);
    successResponse(res, null, "Answer auto-saved");
  } catch (err) {
    console.error("Answer autosave failed:", err);
    errorResponse(res, "Failed to auto-save answer", 500);
  }

  return getResult();
};