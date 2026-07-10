import type { Request, Response } from "express";
import {
  ai,
  Type,
  assignQuestionsForAttempt,
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
  normalizeDifficulty,
  parseQuestionDifficulty,
  successResponse,
  supabase,
  uploadRecordingToStorage
} from "../services/core.service";

export const getRoles = async (req: Request, res: Response) => {
  const roles = dbHelper.getRoles();
  successResponse(res, roles);
};

export const getAdminRoles = async (req: Request, res: Response) => {
  const roles = dbHelper.getRoles();
  successResponse(res, roles);
};

export const createRole = async (req: Request, res: Response) => {
  const { role_name, description, status } = req.body;
  if (!role_name) {
    return errorResponse(res, "Role name is required");
  }

  const newRole = {
    id: `role-${Date.now()}`,
    role_name,
    description: description || "",
    status: status || "ACTIVE",
    created_at: new Date().toISOString()
  };

  dbHelper.saveRole(newRole);
  successResponse(res, newRole, "Role created successfully");
};

export const updateRole = async (req: Request, res: Response) => {
  const role = dbHelper.getRoleById(req.params.id);
  if (!role) {
    return errorResponse(res, "Role not found", 404);
  }

  const { role_name, description, status } = req.body;
  const updated = {
    ...role,
    role_name: role_name !== undefined ? role_name : role.role_name,
    description: description !== undefined ? description : role.description,
    status: status !== undefined ? status : role.status
  };

  dbHelper.saveRole(updated);
  successResponse(res, updated, "Role updated successfully");
};

export const deleteRole = async (req: Request, res: Response) => {
  const role = dbHelper.getRoleById(req.params.id);
  if (!role) {
    return errorResponse(res, "Role not found", 404);
  }
  dbHelper.deleteRole(req.params.id);
  successResponse(res, null, "Role deleted successfully");
};

export const listAssessments = async (req: Request, res: Response) => {
  try {
    const [assessmentsResult, questionsResult, rolesResult, configsResult] = await Promise.all([
      supabase.from("assessments").select("*").order("created_at", { ascending: false }),
      supabase.from("questions").select("*").order("order_number", { ascending: true }),
      supabase.from("roles").select("*"),
      supabase.from("assessment_question_config").select("*")
    ]);

    for (const item of [
      { name: "assessments", result: assessmentsResult },
      { name: "questions", result: questionsResult },
      { name: "roles", result: rolesResult },
      { name: "assessment_question_config", result: configsResult }
    ]) {
      if (item.result.error) {
        console.error("Supabase admin assessments fetch failed:", {
          table: item.name,
          error: item.result.error
        });
        return errorResponse(res, "Failed to load assessments", 500);
      }
    }

    const questionsByAssessment = groupRowsByColumn(questionsResult.data ?? [], "assessment_id");
    const rolesById = mapRowsById(rolesResult.data ?? []);
    const configsByAssessment = new Map((configsResult.data ?? []).map((config: any) => [config.assessment_id, config]));

    const list = (assessmentsResult.data ?? []).map((assessment: any) => {
      const questions = questionsByAssessment.get(assessment.id) ?? [];
      const roleObj = assessment.role_id ? rolesById.get(assessment.role_id) : null;
      return {
        ...assessment,
        questionConfig: configsByAssessment.get(assessment.id) ?? { assessment_id: assessment.id, ...DEFAULT_QUESTION_CONFIG },
        questionsCount: questions.length,
        role_name: roleObj ? roleObj.role_name : null,
        questions
      };
    });

    successResponse(res, list);
  } catch (err) {
    console.error("Unexpected Supabase admin assessments fetch failure:", { error: err });
    errorResponse(res, "Failed to load assessments", 500);
  }
};

export const getAssessment = async (req: Request, res: Response) => {
  const assessmentId = req.params.id;
  try {
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", assessmentId)
      .maybeSingle();

    if (assessmentError) {
      console.error("Supabase assessment detail fetch failed:", { assessmentId, error: assessmentError });
      return errorResponse(res, "Failed to load assessment", 500);
    }

    if (!assessment) {
      return errorResponse(res, "Assessment not found", 404);
    }

    const [questionsResult, roleResult, config] = await Promise.all([
      supabase.from("questions").select("*").eq("assessment_id", assessment.id).order("order_number", { ascending: true }),
      assessment.role_id ? supabase.from("roles").select("*").eq("id", assessment.role_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      getAssessmentQuestionConfig(assessment.id)
    ]);

    if (questionsResult.error || roleResult.error) {
      console.error("Supabase assessment detail related fetch failed:", {
        assessmentId,
        questionsError: questionsResult.error,
        roleError: roleResult.error
      });
      return errorResponse(res, "Failed to load assessment", 500);
    }

    successResponse(res, {
      ...assessment,
      questions: questionsResult.data ?? [],
      questionConfig: config,
      role_name: roleResult.data ? roleResult.data.role_name : null
    });
  } catch (err) {
    console.error("Unexpected Supabase assessment detail fetch failure:", { assessmentId, error: err });
    errorResponse(res, "Failed to load assessment", 500);
  }
};

export const createAssessment = async (req: Request, res: Response) => {
  const { title, instructions, time_limit_minutes, status, created_by, role_id } = req.body;
  if (!title || !time_limit_minutes) {
    return errorResponse(res, "Title and time limit are required");
  }

  const newAssessment = {
    id: `assess-${Date.now()}`,
    title,
    instructions: instructions || "No specific instructions provided.",
    time_limit_minutes: Number(time_limit_minutes),
    status: status || "DRAFT",
    created_by: created_by || "admin-1",
    role_id: role_id || undefined,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("assessments")
    .insert(newAssessment)
    .select()
    .single();

  if (error) {
    console.error("Supabase assessment create failed:", { assessmentId: newAssessment.id, error });
    return errorResponse(res, "Failed to create assessment", 500);
  }

  successResponse(res, data, "Assessment created successfully");
};

export const updateAssessment = async (req: Request, res: Response) => {
  const { title, instructions, time_limit_minutes, status, role_id } = req.body;
  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (instructions !== undefined) updates.instructions = instructions;
  if (time_limit_minutes !== undefined) {
    const parsedTimeLimit = Number(time_limit_minutes);
    if (!Number.isFinite(parsedTimeLimit) || parsedTimeLimit < 1) {
      return errorResponse(res, "Time limit must be a positive number");
    }
    updates.time_limit_minutes = parsedTimeLimit;
  }
  if (status !== undefined) updates.status = status;
  if (role_id !== undefined) updates.role_id = role_id;

  const { data, error } = await supabase
    .from("assessments")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    console.error("Supabase assessment update failed:", { assessmentId: req.params.id, error });
    return errorResponse(res, "Failed to update assessment", 500);
  }

  successResponse(res, data, "Assessment updated successfully");
};

export const deleteAssessment = async (req: Request, res: Response) => {
  const assessmentId = req.params.id;
  const { error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessmentId);

  if (error) {
    console.error("Supabase assessment delete failed:", { assessmentId, error });
    return errorResponse(res, "Failed to delete assessment", 500);
  }

  successResponse(res, null, "Assessment and associated questions deleted successfully");
};

export const startApplicantAssessment = async (req: Request, res: Response) => {
  const { applicantId, assessmentId } = req.body;
  if (!applicantId || !assessmentId) {
    return errorResponse(res, "applicantId and assessmentId are required");
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();

  if (assessmentError) {
    console.error("Supabase start assessment lookup failed:", {
      applicantId,
      assessmentId,
      error: assessmentError
    });
    return errorResponse(res, "Failed to start assessment", 500);
  }

  if (!assessment) {
    return errorResponse(res, "Assessment not found", 404);
  }

  const applicant = await dbHelper.getUserById(applicantId);
  const roleId = applicant?.applied_role_id ?? null;

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + assessment.time_limit_minutes * 60 * 1000);
  const now = startTime.toISOString();

  try {
    const { data: existingRecord, error: lookupError } = await supabase
      .from("applicant_assessments")
      .select("*")
      .eq("applicant_id", applicantId)
      .eq("assessment_id", assessmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("Supabase applicant assessment lookup failed:", {
        applicantId,
        assessmentId,
        error: lookupError
      });
      return errorResponse(res, "Failed to start assessment", 500);
    }

    if (existingRecord?.status === 'IN_PROGRESS') {
      await assignQuestionsForAttempt(existingRecord, roleId);
      return successResponse(res, existingRecord, "Assessment started successfully. Timer is now running.");
    }

    if (existingRecord && existingRecord.status !== 'NOT_STARTED' && existingRecord.status !== 'RETAKE_ALLOWED') {
      return errorResponse(res, `You have already completed this assessment (Status: ${existingRecord.status}) and cannot retake it without admin reset.`, 403);
    }

    const record = {
      id: `aa-${Date.now()}`,
      applicant_id: applicantId,
      assessment_id: assessmentId,
      status: "IN_PROGRESS",
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      submitted_at: null,
      created_at: now,
      updated_at: now
    };

    const query = existingRecord && existingRecord.status === 'NOT_STARTED'
      ? supabase
          .from("applicant_assessments")
          .update({
            status: "IN_PROGRESS",
            start_time: record.start_time,
            end_time: record.end_time,
            submitted_at: null,
            updated_at: now
          })
          .eq("id", existingRecord.id)
      : supabase
          .from("applicant_assessments")
          .insert(record);

    const { data: savedRecord, error: saveError } = await query
      .select()
      .single();

    if (saveError) {
      console.error("Supabase applicant assessment start save failed:", {
        applicantId,
        assessmentId,
        recordId: existingRecord?.id ?? record.id,
        error: saveError
      });
      return errorResponse(res, "Failed to start assessment", 500);
    }

    await assignQuestionsForAttempt(savedRecord, roleId);
    successResponse(res, savedRecord, "Assessment started successfully. Timer is now running.");
  } catch (err) {
    console.error("Unexpected applicant assessment start failure:", {
      applicantId,
      assessmentId,
      error: err
    });
    errorResponse(res, "Failed to start assessment", 500);
  }
};

export const submitApplicantAssessment = async (req: Request, res: Response) => {
  const { applicantAssessmentId } = req.body;
  if (!applicantAssessmentId) {
    return errorResponse(res, "applicantAssessmentId is required");
  }
  try {
    // Server-side validation: ensure all assigned questions have non-empty answers
    const { data: assignments, error: assignmentsError } = await supabase
      .from('applicant_assessment_questions')
      .select('question_id')
      .eq('applicant_assessment_id', applicantAssessmentId);

    if (assignmentsError) {
      console.error('Supabase fetch assigned questions failed:', { applicantAssessmentId, error: assignmentsError });
      return errorResponse(res, 'Failed to validate answers before submission', 500);
    }

    const assignedQuestionIds: string[] = (assignments ?? []).map((r: any) => r.question_id);

    if (assignedQuestionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No assigned questions found for this assessment attempt. Please restart the assessment or contact admin.'
      });
    }

    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('question_id, answer_text')
      .eq('applicant_assessment_id', applicantAssessmentId);

    if (answersError) {
      console.error('Supabase fetch answers failed during submission validation:', { applicantAssessmentId, error: answersError });
      return errorResponse(res, 'Failed to validate answers before submission', 500);
    }

    const answeredMap = new Map<string, string | null>();
    (answers ?? []).forEach((a: any) => answeredMap.set(a.question_id, a.answer_text));

    const missingQuestionIds = assignedQuestionIds.filter(qId => {
      const ans = answeredMap.get(qId);
      if (ans === undefined || ans === null) return true;
      if (String(ans).trim().length === 0) return true;
      return false;
    });

    if (missingQuestionIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Please answer all questions before submitting.',
        missingQuestionIds
      });
    }

    // All validations passed — mark as submitted
    const now = new Date().toISOString();
    const { data: updatedRecord, error } = await supabase
      .from('applicant_assessments')
      .update({
        status: 'SUBMITTED',
        submitted_at: now,
        updated_at: now
      })
      .eq('id', applicantAssessmentId)
      .select()
      .single();

    if (error) {
      console.error('Supabase applicant assessment submit update failed:', { applicantAssessmentId, error });
      return errorResponse(res, 'Failed to submit assessment', 500);
    }

    successResponse(res, updatedRecord, 'Assessment submitted successfully!');
  } catch (err) {
    console.error('Unexpected error in submission validation:', { applicantAssessmentId, error: err });
    return errorResponse(res, 'Failed to submit assessment', 500);
  }
};
