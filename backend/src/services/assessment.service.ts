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

export const DEFAULT_QUESTION_CONFIG = {
  easy_count: 0,
  medium_count: 0,
  hard_count: 0,
  randomize_order: true
};

export const normalizeDifficulty = (difficulty: any) => {
  const normalized = String(difficulty || "MEDIUM").toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(normalized) ? normalized : "MEDIUM";
};

export const parseQuestionDifficulty = (difficulty: any) => {
  const normalized = String(difficulty || "MEDIUM").toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(normalized) ? normalized : null;
};

export const shuffleRows = <T,>(rows: T[]) => {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const getAssessmentQuestionConfig = async (assessmentId: string) => {
  const { data, error } = await supabase
    .from("assessment_question_config")
    .select("*")
    .eq("assessment_id", assessmentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? {
    id: null,
    assessment_id: assessmentId,
    ...DEFAULT_QUESTION_CONFIG
  };
};

export const getAssignedQuestionsForAttempt = async (applicantAssessmentId: string) => {
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("applicant_assessment_questions")
    .select("*")
    .eq("applicant_assessment_id", applicantAssessmentId)
    .order("display_order", { ascending: true });

  if (assignmentError) {
    throw assignmentError;
  }

  const assignments = assignmentRows ?? [];
  if (assignments.length === 0) {
    return [];
  }

  const questionIds = assignments.map((row: any) => row.question_id);
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("*")
    .in("id", questionIds);

  if (questionsError) {
    throw questionsError;
  }

  const questionsById = mapRowsById(questions ?? []);
  return assignments
    .map((assignment: any) => {
      const question = questionsById.get(assignment.question_id);
      if (!question) {
        return null;
      }

      return {
        ...question,
        points: assignment.points ?? question.points,
        difficulty: assignment.difficulty ?? question.difficulty ?? "MEDIUM",
        display_order: assignment.display_order,
        assignment_id: assignment.id
      };
    })
    .filter(Boolean);
};

export const assignQuestionsForAttempt = async (applicantAssessment: any, roleId?: string | null) => {
  const existingAssignments = await getAssignedQuestionsForAttempt(applicantAssessment.id);
  if (existingAssignments.length > 0) {
    return existingAssignments;
  }

  const [config, questionsResult] = await Promise.all([
    getAssessmentQuestionConfig(applicantAssessment.assessment_id),
    supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", applicantAssessment.assessment_id)
  ]);

  if (questionsResult.error) {
    throw questionsResult.error;
  }

  const availableQuestions = (questionsResult.data ?? [])
    .filter((question: any) => !question.role_id || !roleId || question.role_id === roleId)
    .map((question: any) => ({
      ...question,
      difficulty: normalizeDifficulty(question.difficulty)
    }));

  const byDifficulty = {
    EASY: availableQuestions.filter((question: any) => question.difficulty === "EASY"),
    MEDIUM: availableQuestions.filter((question: any) => question.difficulty === "MEDIUM"),
    HARD: availableQuestions.filter((question: any) => question.difficulty === "HARD")
  };

  const requestedCounts = {
    EASY: Number(config.easy_count ?? 0),
    MEDIUM: Number(config.medium_count ?? 0),
    HARD: Number(config.hard_count ?? 0)
  };

  const hasConfiguredCounts = Object.values(requestedCounts).some(count => count > 0);
  const selectedQuestions = hasConfiguredCounts
    ? (Object.entries(requestedCounts) as Array<[keyof typeof requestedCounts, number]>).flatMap(([difficulty, count]) => {
        const available = byDifficulty[difficulty];
        if (available.length < count) {
          console.warn("Not enough questions for configured difficulty:", {
            assessment_id: applicantAssessment.assessment_id,
            applicant_assessment_id: applicantAssessment.id,
            difficulty,
            requested: count,
            available: available.length
          });
        }
        return shuffleRows(available).slice(0, Math.min(count, available.length));
      })
    : availableQuestions;

  const orderedQuestions = config.randomize_order === false ? selectedQuestions : shuffleRows(selectedQuestions);

  console.log("Randomized assessment question assignment:", {
    assessment_id: applicantAssessment.assessment_id,
    applicant_assessment_id: applicantAssessment.id,
    config,
    availableByDifficulty: {
      EASY: byDifficulty.EASY.length,
      MEDIUM: byDifficulty.MEDIUM.length,
      HARD: byDifficulty.HARD.length
    },
    selectedQuestionIds: orderedQuestions.map((question: any) => question.id)
  });

  if (orderedQuestions.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const assignmentRows = orderedQuestions.map((question: any, index: number) => ({
    id: `aaq-${applicantAssessment.id}-${question.id}`,
    applicant_assessment_id: applicantAssessment.id,
    question_id: question.id,
    display_order: index + 1,
    points: question.points ?? 1,
    difficulty: normalizeDifficulty(question.difficulty),
    created_at: now
  }));

  const { error: insertError } = await supabase
    .from("applicant_assessment_questions")
    .insert(assignmentRows);

  if (insertError) {
    console.error("Supabase assigned questions insert failed:", {
      assessment_id: applicantAssessment.assessment_id,
      applicant_assessment_id: applicantAssessment.id,
      selectedQuestionIds: orderedQuestions.map((question: any) => question.id),
      error: insertError
    });
    throw insertError;
  }

  return getAssignedQuestionsForAttempt(applicantAssessment.id);
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

const getSupabaseProjectInfo = () => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  let projectRef = "unknown";
  let hostname = "unknown";

  try {
    hostname = new URL(supabaseUrl).hostname;
    projectRef = hostname.split(".")[0] || "unknown";
  } catch {
    hostname = "invalid-url";
    projectRef = "invalid-url";
  }

  return {
    hostname,
    projectRef
  };
};

const ROLE_LIST_FILTERS = {
  status: "none",
  is_active: "none",
  deleted_at: "none",
  created_at: "none",
  roleType: "none"
};

const listRolesFromSupabase = async (source: string) => {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase role list failed:", {
      source,
      supabase: getSupabaseProjectInfo(),
      activeFilters: ROLE_LIST_FILTERS,
      error
    });
    throw error;
  }

  const roles = data ?? [];
  console.log("Supabase roles list result:", {
    source,
    dataSource: "Supabase roles",
    supabase: getSupabaseProjectInfo(),
    activeFilters: ROLE_LIST_FILTERS,
    count: roles.length,
    roleIds: roles.map((role: any) => role.id)
  });

  return roles;
};

export const getRolesService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  try {
    const roles = await listRolesFromSupabase("GET /api/roles");
    successResponse(res, roles);
  } catch (err) {
    errorResponse(res, "Failed to load roles", 500);
  }

  return getResult();
};

export const getAdminRolesService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  try {
    const roles = await listRolesFromSupabase("GET /api/admin/roles");
    successResponse(res, roles);
  } catch (err) {
    errorResponse(res, "Failed to load roles", 500);
  }

  return getResult();
};

export const createRoleService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  const roleName = String(req.body.role_name ?? req.body.name ?? "").trim();
  const description = req.body.description !== undefined ? String(req.body.description) : "";
  const status = req.body.status || "ACTIVE";

  if (!roleName) {
    return errorResponse(res, "Role name is required");
  }

  const now = new Date().toISOString();
  const rolePayload = {
    id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role_name: roleName,
    description,
    status,
    created_at: now
  };

  console.log("Role creation request:", {
    endpoint: "POST /api/admin/roles",
    requestBody: req.body,
    insertPayload: rolePayload,
    supabase: getSupabaseProjectInfo()
  });

  const { data, error } = await supabase
    .from("roles")
    .insert(rolePayload)
    .select()
    .single();

  console.log("Supabase role insert result:", {
    endpoint: "POST /api/admin/roles",
    createdRoleId: data?.id ?? rolePayload.id,
    inserted: Boolean(data),
    supabase: getSupabaseProjectInfo(),
    data,
    error
  });

  if (error) {
    console.error("Supabase role insert failed:", {
      endpoint: "POST /api/admin/roles",
      insertPayload: rolePayload,
      supabase: getSupabaseProjectInfo(),
      error
    });
    return errorResponse(res, `Failed to create role: ${error.message}`, 500);
  }

  if (!data?.id) {
    console.error("Supabase role insert returned no row:", {
      endpoint: "POST /api/admin/roles",
      insertPayload: rolePayload,
      supabase: getSupabaseProjectInfo(),
      data
    });
    return errorResponse(res, "Failed to create role: Supabase did not return the inserted row", 500);
  }

  const { data: verificationRow, error: verificationError } = await supabase
    .from("roles")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();

  console.log("Supabase role create verification:", {
    roleId: data.id,
    existsImmediatelyAfterInsert: Boolean(verificationRow),
    supabase: getSupabaseProjectInfo(),
    error: verificationError
  });

  if (verificationError) {
    console.error("Supabase role create verification failed:", {
      roleId: data.id,
      supabase: getSupabaseProjectInfo(),
      error: verificationError
    });
    return errorResponse(res, `Failed to verify created role: ${verificationError.message}`, 500);
  }

  if (!verificationRow) {
    console.error("Supabase role create verification found no row:", {
      roleId: data.id,
      supabase: getSupabaseProjectInfo()
    });
    return errorResponse(res, "Failed to create role: inserted role was not found in Supabase", 500);
  }

  successResponse(res, data, "Role created successfully");

  return getResult();
};

export const updateRoleService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  const { data: role, error: lookupError } = await supabase
    .from("roles")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase role lookup before update failed:", {
      endpoint: "PUT /api/admin/roles/:id",
      roleId: req.params.id,
      supabase: getSupabaseProjectInfo(),
      error: lookupError
    });
    return errorResponse(res, "Failed to update role", 500);
  }

  if (!role) {
    return errorResponse(res, "Role not found", 404);
  }

  const { role_name, description, status } = req.body;
  const updates: any = {};
  if (role_name !== undefined) updates.role_name = role_name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from("roles")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  console.log("Supabase role update result:", {
    endpoint: "PUT /api/admin/roles/:id",
    roleId: req.params.id,
    requestBody: req.body,
    supabase: getSupabaseProjectInfo(),
    updated: Boolean(data),
    error
  });

  if (error) {
    return errorResponse(res, "Failed to update role", 500);
  }

  successResponse(res, data, "Role updated successfully");

  return getResult();
};

export const deleteRoleService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

  const { data: role, error: lookupError } = await supabase
    .from("roles")
    .select("id")
    .eq("id", req.params.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase role lookup before delete failed:", {
      endpoint: "DELETE /api/admin/roles/:id",
      roleId: req.params.id,
      supabase: getSupabaseProjectInfo(),
      error: lookupError
    });
    return errorResponse(res, "Failed to delete role", 500);
  }

  if (!role) {
    return errorResponse(res, "Role not found", 404);
  }

  const { error } = await supabase
    .from("roles")
    .delete()
    .eq("id", req.params.id);

  console.log("Supabase role delete result:", {
    endpoint: "DELETE /api/admin/roles/:id",
    roleId: req.params.id,
    supabase: getSupabaseProjectInfo(),
    deleted: !error,
    error
  });

  if (error) {
    return errorResponse(res, "Failed to delete role", 500);
  }

  successResponse(res, null, "Role deleted successfully");

  return getResult();
};

export const listAssessmentsService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const getAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const createAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const updateAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const deleteAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const startApplicantAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const submitApplicantAssessmentService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};
