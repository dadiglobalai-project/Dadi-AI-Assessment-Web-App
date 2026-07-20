import type { Request, Response } from "express";
import {
  ai,
  Type,
  dbHelper,
  errorResponse,
  successResponse,
  supabase
} from "../services/core.service";

import { assignQuestionsForAttempt, getAssignedQuestionsForAttempt, getAssessmentQuestionConfig } from "../services/assessment.service";
import { isBlockedAssessmentDevice, unsupportedAssessmentDeviceBody } from "../utils/device";

const blockUnsupportedAssessmentDevice = (req: Request, res: Response) => {
  if (!isBlockedAssessmentDevice(req.headers)) {
    return false;
  }

  res.status(403).json(unsupportedAssessmentDeviceBody());
  return true;
};

export const getApplicantAssessment = async (req: Request, res: Response) => {
  if (blockUnsupportedAssessmentDevice(req, res)) {
    return;
  }

  const applicantId = req.query.applicantId as string;
  if (!applicantId) {
    return errorResponse(res, "applicantId query parameter is required");
  }

  // Find the active assessments or specific assigned assessment based on role
  const user = await dbHelper.getUserById(applicantId);
  if (!user) {
    return errorResponse(res, "Candidate profile not found.", 404);
  }

  const roleId = user.applied_role_id;
  let assessment: any = null;

  // 1. Check assessment linked to candidate's applied role
  if (roleId) {
    const { data: assessmentsForRole, error: assessmentsForRoleError } = await supabase
      .from("assessments")
      .select("*")
      .eq("role_id", roleId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1);

    if (assessmentsForRoleError) {
      console.error("Supabase active assessment by role lookup failed:", {
        applicantId,
        roleId,
        error: assessmentsForRoleError
      });
      return errorResponse(res, "Failed to load assessment", 500);
    }

    if (assessmentsForRole && assessmentsForRole.length > 0) {
      assessment = assessmentsForRole[0];
    }
  }

  // 2. Fallbacks:
  if (!assessment && user.assigned_assessment_id) {
    const { data: assignedAssessment, error: assignedAssessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", user.assigned_assessment_id)
      .maybeSingle();

    if (assignedAssessmentError) {
      console.error("Supabase assigned assessment lookup failed:", {
        applicantId,
        assessmentId: user.assigned_assessment_id,
        error: assignedAssessmentError
      });
      return errorResponse(res, "Failed to load assessment", 500);
    }

    assessment = assignedAssessment;
  }

  if (!assessment) {
    const { data: existingAA, error: existingAAError } = await supabase
      .from("applicant_assessments")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAAError) {
      console.error("Supabase applicant assessment lookup failed while resolving applicant assessment:", {
        applicantId,
        error: existingAAError
      });
      return errorResponse(res, "Failed to load assessment status", 500);
    }

    if (existingAA) {
      console.log("Applicant assessment route resolved assessment from Supabase applicant_assessments:", {
        applicantId,
        applicantAssessmentId: existingAA.id,
        status: existingAA.status
      });
      const { data: previousAssessment, error: previousAssessmentError } = await supabase
        .from("assessments")
        .select("*")
        .eq("id", existingAA.assessment_id)
        .maybeSingle();

      if (previousAssessmentError) {
        console.error("Supabase previous applicant assessment lookup failed:", {
          applicantId,
          assessmentId: existingAA.assessment_id,
          error: previousAssessmentError
        });
        return errorResponse(res, "Failed to load assessment", 500);
      }

      assessment = previousAssessment;
    }
  }

  if (!assessment) {
    const { data: activeAssessments, error: activeAssessmentsError } = await supabase
      .from("assessments")
      .select("*")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeAssessmentsError) {
      console.error("Supabase active assessment fallback lookup failed:", {
        applicantId,
        error: activeAssessmentsError
      });
      return errorResponse(res, "Failed to load assessment", 500);
    }

    if (activeAssessments && activeAssessments.length > 0) {
      assessment = activeAssessments[0];
    }
  }

  if (!assessment) {
    return errorResponse(res, "No active or assigned assessments found for your profile/position.", 404);
  }

  // Check Supabase for applicant status. RETAKE_ALLOWED is admin history and should be startable for applicants.
  const { data: record, error: recordError } = await supabase
    .from("applicant_assessments")
    .select("*")
    .eq("applicant_id", applicantId)
    .eq("assessment_id", assessment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recordError) {
    console.error("Supabase applicant assessment status lookup failed:", {
      applicantId,
      assessmentId: assessment.id,
      error: recordError
    });
    return errorResponse(res, "Failed to load assessment status", 500);
  }

  console.log("Applicant assessment status source:", {
    dataSource: "Supabase applicant_assessments",
    applicantId,
    assessmentId: assessment.id,
    applicantAssessmentId: record?.id ?? null,
    returnedStatus: record?.status === "RETAKE_ALLOWED" ? "NOT_STARTED" : (record?.status ?? "NOT_STARTED")
  });

  const applicantVisibleRecord = record?.status === "RETAKE_ALLOWED" ? null : record;
  let questions: any[] = [];
  let questionsCountForApplicant = 0;
  const questionConfig = await getAssessmentQuestionConfig(assessment.id);

  if (applicantVisibleRecord) {
    try {
      questions = await getAssignedQuestionsForAttempt(applicantVisibleRecord.id);
      if (questions.length === 0 && applicantVisibleRecord.status === "IN_PROGRESS") {
        questions = await assignQuestionsForAttempt(applicantVisibleRecord, roleId);
      }
      questionsCountForApplicant = questions.length;
    } catch (error) {
      console.error("Supabase assigned questions lookup failed:", {
        applicantId,
        assessmentId: assessment.id,
        applicantAssessmentId: applicantVisibleRecord.id,
        error
      });
      return errorResponse(res, "Failed to load assigned questions", 500);
    }
  } else {
    const { data: availableQuestions, error: availableQuestionsError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", assessment.id);

    if (availableQuestionsError) {
      console.error("Supabase applicant question preview lookup failed:", {
        applicantId,
        assessmentId: assessment.id,
        error: availableQuestionsError
      });
      return errorResponse(res, "Failed to load assessment questions", 500);
    }

    const roleFilteredQuestions = (availableQuestions ?? []).filter((question: any) => !question.role_id || !roleId || question.role_id === roleId);
    const configuredTotal = Number(questionConfig.easy_count ?? 0) + Number(questionConfig.medium_count ?? 0) + Number(questionConfig.hard_count ?? 0);
    questionsCountForApplicant = configuredTotal > 0 ? Math.min(configuredTotal, roleFilteredQuestions.length) : roleFilteredQuestions.length;
    questions = [];
  }

  let answers: any[] = [];
  if (applicantVisibleRecord) {
    const { data: supabaseAnswers, error: answersError } = await supabase
      .from("answers")
      .select("*")
      .eq("applicant_assessment_id", applicantVisibleRecord.id);

    if (answersError) {
      console.error("Supabase applicant answers lookup failed:", {
        applicantId,
        assessmentId: assessment.id,
        applicantAssessmentId: applicantVisibleRecord.id,
        error: answersError
      });
      return errorResponse(res, "Failed to load assessment answers", 500);
    }

    answers = supabaseAnswers ?? [];
  }

  const data = {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      instructions: assessment.instructions,
      timeLimitMinutes: assessment.time_limit_minutes,
      questionsCount: questionsCountForApplicant
    },
    questions: questions.map(q => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      options: q.options,
      points: q.points,
      orderNumber: q.order_number
    })),
    statusRecord: applicantVisibleRecord ? {
      id: applicantVisibleRecord.id,
      status: applicantVisibleRecord.status,
      startTime: applicantVisibleRecord.start_time,
      submittedAt: applicantVisibleRecord.submitted_at
    } : null,
    answers: answers.reduce((acc: Record<string, string>, answer: any) => {
      acc[answer.question_id] = answer.answer_text || "";
      return acc;
    }, {})
  };

  successResponse(res, data);
};

export const saveApplicantAnswer = async (req: Request, res: Response) => {
  if (blockUnsupportedAssessmentDevice(req, res)) {
    return;
  }

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
};
