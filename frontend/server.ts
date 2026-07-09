import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { dbHelper } from './server-db';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { supabase } from "./supabase";
import { createRecordingFileName, createRecordingSignedUrl, deleteRecordingsFromStorage, uploadRecordingToStorage } from "./storage-helper";
import emailExistence from "email-existence";

dotenv.config();

// Initialize Gemini SDK if API key is present
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}


const app = express();
const PORT = 3000;

// Body parsing with large limits to handle text answers or base64 if needed
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper for sending API responses
const successResponse = (res: express.Response, data: any, message = "Success") => {
  res.json({ success: true, message, data });
};

const errorResponse = (res: express.Response, message: string, status = 400) => {
  res.status(status).json({ success: false, message });
};

const fetchSupabaseRowsByColumn = async (table: string, column: string, values: string[]) => {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .in(column, uniqueValues);

  if (error) {
    console.error("Supabase batch fetch failed:", {
      table,
      column,
      values: uniqueValues,
      error
    });
    throw error;
  }

  return data ?? [];
};

const mapRowsById = (rows: any[]) => {
  return new Map(rows.map((row) => [row.id, row]));
};

const groupRowsByColumn = (rows: any[], column: string) => {
  return rows.reduce((acc: Map<string, any[]>, row) => {
    const key = row[column];
    if (!key) {
      return acc;
    }

    const existing = acc.get(key) ?? [];
    existing.push(row);
    acc.set(key, existing);
    return acc;
  }, new Map<string, any[]>());
};

// ==========================================
// AUTHENTICATION & INVITATION ENDPOINTS
// ==========================================

// Validate an invitation token / assessment ID
app.get('/api/invite/validate', (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return errorResponse(res, "Invitation token is required");
  }

  const assessment = dbHelper.getAssessmentById(token);
  if (!assessment) {
    return errorResponse(res, "Invalid invitation token. Assessment not found.", 404);
  }

  if (assessment.status !== 'ACTIVE') {
    return errorResponse(res, "This assessment invitation is not currently active.", 400);
  }

  const role = assessment.role_id ? dbHelper.getRoleById(assessment.role_id) : null;

  successResponse(res, {
    id: assessment.id,
    title: assessment.title,
    timeLimitMinutes: assessment.time_limit_minutes,
    instructions: assessment.instructions,
    role_id: assessment.role_id,
    role_name: role ? role.role_name : null
  }, "Invitation is valid");
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, requiredRole } = req.body;
  if (!email || !password) {
    return errorResponse(res, "Email and password are required");
  }

  let user;
  try {
    user = await dbHelper.getUserByEmail(email);
  } catch (error) {
    console.error("Supabase login user lookup failed:", {
      email,
      error
    });
    return errorResponse(res, "Failed to login", 500);
  }
  console.log("Auth login data source:", {
    dataSource: "Supabase users",
    email,
    found: Boolean(user)
  });
  if (!user || user.password !== password) {
    return errorResponse(res, "Invalid email or password");
  }

  // Separate authentication systems:
  // If a specific role is required (e.g. ADMIN), check that it matches
  if (requiredRole && user.role !== requiredRole) {
    const roleLabel = requiredRole === 'ADMIN' ? 'Administrators' : 'Applicants';
    return errorResponse(res, `Unauthorized access. This portal is only accessible by authorized ${roleLabel}.`, 403);
  }

  // Strip password in response
  const { password: _, ...userWithoutPassword } = user;
  successResponse(res, userWithoutPassword, "Login successful");
});

const checkEmailExists = (email: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    emailExistence.check(email, (error: Error | null, response: boolean) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
};

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, inviteToken, appliedRoleId } = req.body;

  if (!name || !email || !password) {
    return errorResponse(res, "Full Name, Email, and Password are required");
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(normalizedEmail)) {
    return errorResponse(res, "Please enter a valid email address.", 400);
  }

  try {
    const emailExists = await checkEmailExists(normalizedEmail);

    if (!emailExists) {
      return errorResponse(res, "Please enter a real and active email address.", 400);
    }
  } catch (error) {
    console.error("Email existence validation failed:", {
      email: normalizedEmail,
      error
    });

    return errorResponse(res, "Unable to verify email address. Please try again.", 500);
  }

  let existingUser;

  try {
    existingUser = await dbHelper.getUserByEmail(normalizedEmail);
  } catch (error) {
    console.error("Supabase registration duplicate email check failed:", {
      email: normalizedEmail,
      error
    });

    return errorResponse(res, "Failed to register user", 500);
  }

  if (existingUser) {
    return errorResponse(res, "A user with this email already exists");
  }

  const userRole = inviteToken
    ? "APPLICANT"
    : role === "ADMIN"
      ? "ADMIN"
      : "APPLICANT";

  let newUserAppliedRoleId = appliedRoleId;

  if (inviteToken) {
    const assessment = dbHelper.getAssessmentById(inviteToken);

    if (assessment && assessment.role_id) {
      newUserAppliedRoleId = assessment.role_id;
    }
  }

  const newUser = {
    id: `user-${Date.now()}`,
    name,
    email: normalizedEmail,
    password,
    role: userRole,
    applied_role_id: newUserAppliedRoleId || null,
    assigned_assessment_id: inviteToken || undefined,
    created_at: new Date().toISOString()
  };

  let savedUser;

  try {
    savedUser = await dbHelper.saveUser(newUser);
  } catch (error) {
    console.error("Supabase user registration insert failed:", {
      email: normalizedEmail,
      userId: newUser.id,
      error
    });

    return errorResponse(res, "Failed to register user", 500);
  }

  const responseUser = {
    ...savedUser,
    assigned_assessment_id: newUser.assigned_assessment_id
  };

  const { password: _, ...userWithoutPassword } = responseUser;

  return successResponse(
    res,
    userWithoutPassword,
    "User registered successfully"
  );
});

app.get('/api/auth/me', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return errorResponse(res, "Unauthorized: userId is required in query params for session", 401);
  }
  let user;
  try {
    user = await dbHelper.getUserById(userId);
  } catch (error) {
    console.error("Supabase auth session user lookup failed:", {
      userId,
      error
    });
    return errorResponse(res, "Failed to restore session", 500);
  }
  console.log("Auth session data source:", {
    dataSource: "Supabase users",
    userId,
    found: Boolean(user)
  });
  if (!user) {
    return errorResponse(res, "User not found", 404);
  }
  const { password: _, ...userWithoutPassword } = user;
  successResponse(res, userWithoutPassword);
});


// ==========================================
// ADMIN & PUBLIC ROLES ENDPOINTS
// ==========================================

app.get('/api/roles', (req, res) => {
  const roles = dbHelper.getRoles();
  successResponse(res, roles);
});

app.get('/api/admin/roles', (req, res) => {
  const roles = dbHelper.getRoles();
  successResponse(res, roles);
});

app.post('/api/admin/roles', (req, res) => {
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
});

app.put('/api/admin/roles/:id', (req, res) => {
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
});

app.delete('/api/admin/roles/:id', (req, res) => {
  const role = dbHelper.getRoleById(req.params.id);
  if (!role) {
    return errorResponse(res, "Role not found", 404);
  }
  dbHelper.deleteRole(req.params.id);
  successResponse(res, null, "Role deleted successfully");
});


// ==========================================
// ADMIN PORTAL - ASSESSMENTS
// ==========================================

const DEFAULT_QUESTION_CONFIG = {
  easy_count: 0,
  medium_count: 0,
  hard_count: 0,
  randomize_order: true
};

const normalizeDifficulty = (difficulty: any) => {
  const normalized = String(difficulty || "MEDIUM").toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(normalized) ? normalized : "MEDIUM";
};

const parseQuestionDifficulty = (difficulty: any) => {
  const normalized = String(difficulty || "MEDIUM").toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(normalized) ? normalized : null;
};

const shuffleRows = <T,>(rows: T[]) => {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const getAssessmentQuestionConfig = async (assessmentId: string) => {
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

app.get('/api/admin/assessments', async (req, res) => {
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
});

app.get('/api/admin/assessments/:id', async (req, res) => {
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
});

app.post('/api/admin/assessments', async (req, res) => {
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
});

app.put('/api/admin/assessments/:id', async (req, res) => {
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
});

app.delete('/api/admin/assessments/:id', async (req, res) => {
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
});


// ==========================================
// ADMIN PORTAL - QUESTIONS
// ==========================================

app.put('/api/admin/assessments/:id/question-config', async (req, res) => {
  const assessmentId = req.params.id;
  const now = new Date().toISOString();
  const configValues = {
    easy_count: Number(req.body.easy_count ?? 0),
    medium_count: Number(req.body.medium_count ?? 0),
    hard_count: Number(req.body.hard_count ?? 0),
    randomize_order: req.body.randomize_order !== undefined ? Boolean(req.body.randomize_order) : true,
    updated_at: now
  };

  const { data: existingConfig, error: lookupError } = await supabase
    .from("assessment_question_config")
    .select("id")
    .eq("assessment_id", assessmentId)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase assessment question config lookup failed:", {
      assessmentId,
      error: lookupError
    });
    return errorResponse(res, "Failed to save question configuration", 500);
  }

  const query = existingConfig
    ? supabase
        .from("assessment_question_config")
        .update(configValues)
        .eq("id", existingConfig.id)
    : supabase
        .from("assessment_question_config")
        .insert({
          id: `aqc-${assessmentId}`,
          assessment_id: assessmentId,
          ...configValues,
          created_at: now
        });

  const { data, error } = await query
    .select()
    .single();

  if (error) {
    console.error("Supabase assessment question config save failed:", {
      assessmentId,
      config: configValues,
      error
    });
    return errorResponse(res, "Failed to save question configuration", 500);
  }

  successResponse(res, data, "Question configuration saved successfully");
});

app.post('/api/admin/assessments/:id/questions', async (req, res) => {
  const { question_text, question_type, options, points, order_number, role_id, difficulty } = req.body;
  const assessmentId = req.params.id;

  if (!question_text || !question_type || points === undefined) {
    return errorResponse(res, "Question text, type, and points are required");
  }

  const parsedDifficulty = parseQuestionDifficulty(difficulty);
  if (!parsedDifficulty) {
    return errorResponse(res, "Difficulty must be EASY, MEDIUM, or HARD");
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();

  if (assessmentError) {
    console.error("Supabase assessment lookup for question create failed:", { assessmentId, error: assessmentError });
    return errorResponse(res, "Failed to add question", 500);
  }

  const activeRoleId = role_id || (assessment ? assessment.role_id : undefined);

  const newQuestion = {
    id: `q-${Date.now()}`,
    assessment_id: assessmentId,
    role_id: activeRoleId,
    question_text,
    question_type,
    options: question_type === 'MULTIPLE_CHOICE' ? (options || []) : undefined,
    points: Number(points),
    order_number: order_number !== undefined ? Number(order_number) : 1,
    difficulty: parsedDifficulty,
    created_at: new Date().toISOString()
  };

  if (order_number === undefined) {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessmentId);
    newQuestion.order_number = (count ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("questions")
    .insert(newQuestion)
    .select()
    .single();

  if (error) {
    console.error("Supabase question create failed:", { assessmentId, questionId: newQuestion.id, error });
    return errorResponse(res, "Failed to add question", 500);
  }

  successResponse(res, data, "Question added successfully");
});

app.put('/api/admin/questions/:id', async (req, res) => {
  const { question_text, question_type, options, points, order_number, role_id, difficulty } = req.body;
  const updates: any = {};
  const parsedDifficulty = difficulty !== undefined ? parseQuestionDifficulty(difficulty) : undefined;
  if (difficulty !== undefined && !parsedDifficulty) {
    return errorResponse(res, "Difficulty must be EASY, MEDIUM, or HARD");
  }

  if (question_text !== undefined) updates.question_text = question_text;
  if (question_type !== undefined) updates.question_type = question_type;
  if (options !== undefined) updates.options = question_type === 'MULTIPLE_CHOICE' ? (options || []) : options;
  if (points !== undefined) updates.points = Number(points);
  if (order_number !== undefined) updates.order_number = Number(order_number);
  if (role_id !== undefined) updates.role_id = role_id;
  if (parsedDifficulty !== undefined) updates.difficulty = parsedDifficulty;

  const { data, error } = await supabase
    .from("questions")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    console.error("Supabase question update failed:", { questionId: req.params.id, error });
    return errorResponse(res, "Failed to update question", 500);
  }

  successResponse(res, data, "Question updated successfully");
});

app.delete('/api/admin/questions/:id', async (req, res) => {
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    console.error("Supabase question delete failed:", { questionId: req.params.id, error });
    return errorResponse(res, "Failed to delete question", 500);
  }

  successResponse(res, null, "Question deleted successfully");
});


// ==========================================
// ADMIN PORTAL - SUBMISSIONS & REVIEW
// ==========================================

app.get('/api/admin/submissions', async (req, res) => {
  try {
    const { data: applicantAssessments, error: applicantAssessmentsError } = await supabase
      .from("applicant_assessments")
      .select("*")
      .order("created_at", { ascending: false });

    if (applicantAssessmentsError) {
      console.error("Supabase admin submissions applicant_assessments fetch failed:", {
        error: applicantAssessmentsError
      });
      return errorResponse(res, "Failed to load submissions", 500);
    }

    const aaRows = applicantAssessments ?? [];
    const aaIds = aaRows.map((aa) => aa.id);
    const applicantIds = aaRows.map((aa) => aa.applicant_id);
    const assessmentIds = aaRows.map((aa) => aa.assessment_id);

    const users = await fetchSupabaseRowsByColumn("users", "id", applicantIds);
    const assessments = await fetchSupabaseRowsByColumn("assessments", "id", assessmentIds);
    const answers = await fetchSupabaseRowsByColumn("answers", "applicant_assessment_id", aaIds);
    const recordings = await fetchSupabaseRowsByColumn("recordings", "applicant_assessment_id", aaIds);
    const reviews = await fetchSupabaseRowsByColumn("reviews", "applicant_assessment_id", aaIds);
    const roles = await fetchSupabaseRowsByColumn(
      "roles",
      "id",
      users.map((user) => user.applied_role_id).filter(Boolean)
    );

    const usersById = mapRowsById(users);
    const assessmentsById = mapRowsById(assessments);
    const rolesById = mapRowsById(roles);
    const answersByAAId = groupRowsByColumn(answers, "applicant_assessment_id");
    const recordingsByAAId = groupRowsByColumn(recordings, "applicant_assessment_id");
    const reviewsByAAId = groupRowsByColumn(reviews, "applicant_assessment_id");

    console.log("Admin submissions Supabase source:", {
      dataSource: "Supabase",
      submissionsCount: aaRows.length,
      answersCount: answers.length,
      recordingsCount: recordings.length
    });

    const summaryList = aaRows.map((aa) => {
      const applicant = usersById.get(aa.applicant_id);
      const assessment = assessmentsById.get(aa.assessment_id);
      const appliedRoleId = applicant ? applicant.applied_role_id : null;
      const role = appliedRoleId ? rolesById.get(appliedRoleId) : null;

      return {
        applicantAssessmentId: aa.id,
        applicant: applicant ? { 
          id: applicant.id, 
          name: applicant.name, 
          email: applicant.email,
          applied_role_id: appliedRoleId,
          role_name: role ? role.role_name : "Unassigned"
        } : null,
        assessment: assessment ? { id: assessment.id, title: assessment.title, timeLimitMinutes: assessment.time_limit_minutes, role_id: assessment.role_id } : null,
        status: aa.status,
        startTime: aa.start_time,
        submittedAt: aa.submitted_at,
        recording: recordingsByAAId.get(aa.id)?.[0] ?? null,
        review: reviewsByAAId.get(aa.id)?.[0] ?? null,
        answersCount: answersByAAId.get(aa.id)?.length ?? 0
      };
    });

    successResponse(res, summaryList);
  } catch (err) {
    console.error("Unexpected Supabase admin submissions fetch failure:", {
      error: err
    });
    errorResponse(res, "Failed to load submissions", 500);
  }
});

app.get('/api/admin/submissions/:id', async (req, res) => {
  const applicantAssessmentId = req.params.id;

  try {
    const { data: aa, error: aaError } = await supabase
      .from("applicant_assessments")
      .select("*")
      .eq("id", applicantAssessmentId)
      .maybeSingle();

    if (aaError) {
      console.error("Supabase admin submission detail applicant_assessment fetch failed:", {
        applicantAssessmentId,
        error: aaError
      });
      return errorResponse(res, "Failed to load submission", 500);
    }

    if (!aa) {
      return errorResponse(res, "Submission not found", 404);
    }

    const [
      applicantResult,
      assessmentResult,
      answersResult,
      recordingResult,
      reviewResult
    ] = await Promise.all([
      supabase.from("users").select("*").eq("id", aa.applicant_id).maybeSingle(),
      supabase.from("assessments").select("*").eq("id", aa.assessment_id).maybeSingle(),
      supabase.from("answers").select("*").eq("applicant_assessment_id", aa.id),
      supabase.from("recordings").select("*").eq("applicant_assessment_id", aa.id).maybeSingle(),
      supabase.from("reviews").select("*").eq("applicant_assessment_id", aa.id).maybeSingle()
    ]);

    const results = [
      { name: "users", result: applicantResult },
      { name: "assessments", result: assessmentResult },
      { name: "answers", result: answersResult },
      { name: "recordings", result: recordingResult },
      { name: "reviews", result: reviewResult }
    ];

    for (const item of results) {
      if (item.result.error) {
        console.error("Supabase admin submission detail fetch failed:", {
          applicantAssessmentId,
          table: item.name,
          error: item.result.error
        });
        return errorResponse(res, "Failed to load submission", 500);
      }
    }

    const applicant = applicantResult.data;
    const assessment = assessmentResult.data;
    const answers = answersResult.data ?? [];
    const recording = recordingResult.data ?? null;
    const review = reviewResult.data ?? null;
    let questions = await getAssignedQuestionsForAttempt(aa.id);
    if (questions.length === 0) {
      const { data: fallbackQuestions, error: fallbackQuestionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("assessment_id", aa.assessment_id)
        .order("order_number", { ascending: true });

      if (fallbackQuestionsError) {
        console.error("Supabase admin submission fallback questions fetch failed:", {
          applicantAssessmentId,
          error: fallbackQuestionsError
        });
        return errorResponse(res, "Failed to load submission", 500);
      }

      questions = fallbackQuestions ?? [];
    }

    console.log("Admin submission detail Supabase source:", {
      dataSource: "Supabase",
      applicantAssessmentId,
      submissionsCount: 1,
      answersCount: answers.length,
      recordingsCount: recording ? 1 : 0
    });

    // Map answers together with questions
    const questionsAndAnswers = questions.map(q => {
      const ans = answers.find(a => a.question_id === q.id);
      return {
        ...q,
        answer: ans ? ans.answer_text : null,
        answeredAt: ans ? ans.updated_at : null
      };
    });

    const fullDetails = {
      applicantAssessmentId: aa.id,
      applicant: applicant ? { id: applicant.id, name: applicant.name, email: applicant.email } : null,
      assessment: assessment ? { id: assessment.id, title: assessment.title, instructions: assessment.instructions, timeLimitMinutes: assessment.time_limit_minutes } : null,
      status: aa.status,
      startTime: aa.start_time,
      submittedAt: aa.submitted_at,
      questions: questionsAndAnswers,
      recording,
      review
    };

    successResponse(res, fullDetails);
  } catch (err) {
    console.error("Unexpected Supabase admin submission detail fetch failure:", {
      applicantAssessmentId,
      error: err
    });
    errorResponse(res, "Failed to load submission", 500);
  }
});

app.post('/api/admin/submissions/:id/review', async (req, res) => {
  const aa = await dbHelper.getApplicantAssessmentById(req.params.id);
  if (!aa) {
    return errorResponse(res, "Submission not found", 404);
  }

  const { score, remarks, reviewed_by } = req.body;
  if (score === undefined || !remarks) {
    return errorResponse(res, "Score and remarks are required");
  }

  const existingReview = dbHelper.getReviewByApplicantAssessmentId(aa.id);
  const newReview = {
    id: existingReview ? existingReview.id : `rev-${Date.now()}`,
    applicant_assessment_id: aa.id,
    score: Number(score),
    remarks,
    status: "REVIEWED",
    reviewed_by: reviewed_by || "admin-1",
    reviewed_at: new Date().toISOString()
  };

  dbHelper.saveReview(newReview);
  successResponse(res, newReview, "Submission reviewed successfully");
});

// Admin reset submission to allow retaking
app.post('/api/admin/submissions/:id/reset', async (req, res) => {
  const applicantAssessmentId = req.params.id;
  const aa = await dbHelper.getApplicantAssessmentById(applicantAssessmentId);
  if (!aa) {
    return errorResponse(res, "Submission not found", 404);
  }

  try {
    const now = new Date().toISOString();
    const { error: resetError } = await supabase
      .from("applicant_assessments")
      .update({
        status: "RETAKE_ALLOWED",
        updated_at: now
      })
      .eq("id", applicantAssessmentId);

    if (resetError) {
      console.error("Supabase applicant assessment reset status update failed:", {
        applicantAssessmentId,
        error: resetError
      });
      return errorResponse(res, "Failed to reset applicant assessment", 500);
    }

    successResponse(res, null, "Applicant status reset successfully. They can now retake the assessment.");
  } catch (err) {
    console.error("Unexpected applicant assessment reset failure:", {
      applicantAssessmentId,
      error: err
    });
    errorResponse(res, "Failed to reset applicant assessment", 500);
  }
});

app.delete('/api/admin/submissions/:id', async (req, res) => {
  const applicantAssessmentId = req.params.id;
  const deleteApplicantAccount = req.body?.deleteApplicantAccount === true;

  try {
    const { data: applicantAssessment, error: aaFetchError } = await supabase
      .from("applicant_assessments")
      .select("*")
      .eq("id", applicantAssessmentId)
      .maybeSingle();

    if (aaFetchError) {
      console.error("Supabase applicant assessment fetch before delete failed:", {
        applicantAssessmentId,
        error: aaFetchError
      });
      return errorResponse(res, "Failed to delete applicant submission", 500);
    }

    if (!applicantAssessment) {
      return errorResponse(res, "Submission not found", 404);
    }

    const { data: recordings, error: recordingsFetchError } = await supabase
      .from("recordings")
      .select("*")
      .eq("applicant_assessment_id", applicantAssessmentId);

    if (recordingsFetchError) {
      console.error("Supabase recordings fetch before delete failed:", {
        applicantAssessmentId,
        error: recordingsFetchError
      });
      return errorResponse(res, "Failed to delete applicant submission", 500);
    }

    const deleteFromTable = async (table: string) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("applicant_assessment_id", applicantAssessmentId);

      if (error) {
        console.error(`Supabase ${table} delete failed:`, {
          applicantAssessmentId,
          error
        });
        throw error;
      }
    };

    await deleteFromTable("answers");
    await deleteFromTable("recordings");
    await deleteRecordingsFromStorage((recordings ?? []).map((recording: any) => recording.file_url));
    await deleteFromTable("reviews");
    await deleteFromTable("applicant_assessment_questions");

    const { error: aaDeleteError } = await supabase
      .from("applicant_assessments")
      .delete()
      .eq("id", applicantAssessmentId);

    if (aaDeleteError) {
      console.error("Supabase applicant assessment delete failed:", {
        applicantAssessmentId,
        error: aaDeleteError
      });
      return errorResponse(res, "Failed to delete applicant submission", 500);
    }

    if (deleteApplicantAccount && applicantAssessment.applicant_id) {
      const { error: userDeleteError } = await supabase
        .from("users")
        .delete()
        .eq("id", applicantAssessment.applicant_id);

      if (userDeleteError) {
        console.error("Supabase applicant user delete failed:", {
          applicantAssessmentId,
          applicantId: applicantAssessment.applicant_id,
          error: userDeleteError
        });
        return errorResponse(res, "Submission deleted, but applicant account deletion failed", 500);
      }
    }

    console.log("Admin deleted applicant submission from Supabase:", {
      applicantAssessmentId,
      applicantId: applicantAssessment.applicant_id,
      recordingsDeleted: recordings?.length ?? 0,
      deleteApplicantAccount
    });

    successResponse(res, null, "Applicant submission deleted successfully");
  } catch (err) {
    console.error("Unexpected applicant submission delete failure:", {
      applicantAssessmentId,
      error: err
    });
    errorResponse(res, "Failed to delete applicant submission", 500);
  }
});

const getAssignedQuestionsForAttempt = async (applicantAssessmentId: string) => {
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

const assignQuestionsForAttempt = async (applicantAssessment: any, roleId?: string | null) => {
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


// ==========================================
// APPLICANT PORTAL ENDPOINTS
// ==========================================

// Get active assessment for an applicant
app.get('/api/applicant/assessment', async (req, res) => {
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
});

// Start assessment (requires screen recording starting)
app.post('/api/applicant/assessment/start', async (req, res) => {
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
});

// Auto-save question answers
app.post('/api/applicant/answers/save', async (req, res) => {
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
});

// Submit assessment
app.post('/api/applicant/assessment/submit', async (req, res) => {
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
});

// Upload video screen recording
app.post('/api/applicant/recording/upload', upload.single('video'), async (req, res) => {
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
});

app.get('/api/admin/recordings/:recordingId/url', async (req, res) => {
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
});


// ==========================================
// GEMINI AI INTEGRATION ENDPOINTS
// ==========================================

// 1. AI Generate Questions helper
app.post('/api/admin/ai/generate-questions', async (req, res) => {
  const { topic, numQuestions, assessmentId } = req.body;
  if (!topic || !assessmentId) {
    return errorResponse(res, "Topic and assessmentId are required");
  }

  if (!ai) {
    return errorResponse(res, "Gemini API is not configured. Please add GEMINI_API_KEY in secrets.");
  }

  try {
    const num = numQuestions ? Number(numQuestions) : 3;
    const prompt = `Generate exactly ${num} professional evaluation questions about the topic: "${topic}". 
Generate a diverse mix of question types, including essay text (type "TEXT"), multiple choice (type "MULTIPLE_CHOICE"), or coding tasks (type "CODE"). 
Make them highly relevant for professional technical assessment. For MULTIPLE_CHOICE questions, provide exactly 4 clear options. 
Allocate points to each question based on difficulty (e.g. TEXT = 10-15 pts, MULTIPLE_CHOICE = 10 pts, CODE = 20-30 pts).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert technical interviewer and AI examiner. Output structured JSON matching the defined schema schema.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question_text: {
                type: Type.STRING,
                description: "The wording or prompt of the assessment question"
              },
              question_type: {
                type: Type.STRING,
                description: "Must be 'TEXT', 'MULTIPLE_CHOICE', or 'CODE'"
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Required ONLY if question_type is 'MULTIPLE_CHOICE'. Provide exactly 4 options."
              },
              points: {
                type: Type.INTEGER,
                description: "Numerical point value of the question, e.g., 10, 15, 20, 25, 30"
              }
            },
            required: ["question_text", "question_type", "points"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const generatedQuestions = JSON.parse(text.trim());

    const { count: existingQuestionCount } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessmentId);

    // Save them to Supabase
    const questionsAdded = [];
    let startOrderNum = (existingQuestionCount ?? 0) + 1;

    for (const q of generatedQuestions) {
      const newQ = {
        id: `q-ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        assessment_id: assessmentId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options || undefined,
        points: Number(q.points) || 10,
        difficulty: normalizeDifficulty(q.difficulty),
        order_number: startOrderNum++,
        created_at: new Date().toISOString()
      };

      const { data: savedQuestion, error: saveQuestionError } = await supabase
        .from("questions")
        .insert(newQ)
        .select()
        .single();

      if (saveQuestionError) {
        throw saveQuestionError;
      }

      questionsAdded.push(savedQuestion);
    }

    successResponse(res, questionsAdded, `Successfully AI-generated and saved ${questionsAdded.length} questions!`);
  } catch (error: any) {
    console.error("Error generating questions with Gemini:", error);
    errorResponse(res, `Failed to AI-generate questions: ${error?.message || error}`);
  }
});

// 2. AI Automated Grading and Review recommendation helper
app.post('/api/admin/submissions/:id/ai-grade', async (req, res) => {
  const aaId = req.params.id;
  const aa = await dbHelper.getApplicantAssessmentById(aaId);
  if (!aa) {
    return errorResponse(res, "Submission not found", 404);
  }

  if (!ai) {
    return errorResponse(res, "Gemini API is not configured. Please add GEMINI_API_KEY in secrets.");
  }

  try {
    const applicant = await dbHelper.getUserById(aa.applicant_id);
    const { data: assessment } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", aa.assessment_id)
      .maybeSingle();
    let questions = await getAssignedQuestionsForAttempt(aa.id);
    if (questions.length === 0) {
      const { data: fallbackQuestions } = await supabase
        .from("questions")
        .select("*")
        .eq("assessment_id", aa.assessment_id)
        .order("order_number", { ascending: true });
      questions = fallbackQuestions ?? [];
    }
    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("applicant_assessment_id", aa.id);

    // Format prompt with questions and student answers
    const assessmentData = {
      title: assessment?.title,
      time_limit: assessment?.time_limit_minutes,
      submission_status: aa.status,
      qa_pairs: questions.map(q => {
        const ans = (answers ?? []).find(a => a.question_id === q.id);
        return {
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options || null,
          max_points: q.points,
          applicant_answer: ans ? ans.answer_text : "[No Answer Submitted]"
        };
      })
    };

    const prompt = `Grade the following applicant's assessment submission.
Assessment: ${assessmentData.title}
Status: ${assessmentData.submission_status}

Analyze each answer carefully and assign scored points (from 0 up to max_points) based on accuracy, depth, and logic.
Provide brief feedback remarks for each answer. 
Then, calculate a suggested overall score (the sum of the question points) and a comprehensive feedback summary recommendation for the candidate.

Submission details for grading:
${JSON.stringify(assessmentData.qa_pairs, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an intelligent technical assessor. Grade the answers accurately and fairly. Output response strictly in JSON format.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggested_score: {
              type: Type.INTEGER,
              description: "The total calculated score recommended for the candidate (sum of graded question points)"
            },
            total_possible_points: {
              type: Type.INTEGER,
              description: "The sum of all maximum question points"
            },
            overall_remarks: {
              type: Type.STRING,
              description: "An elegant, constructive overview of the applicant's submission, highlighting strengths and weaknesses."
            },
            graded_questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question_text: { type: Type.STRING },
                  score_assigned: { type: Type.INTEGER },
                  max_points: { type: Type.INTEGER },
                  feedback_comment: { type: Type.STRING, description: "Specific comments on why this score was assigned" }
                },
                required: ["question_text", "score_assigned", "feedback_comment"]
              }
            }
          },
          required: ["suggested_score", "overall_remarks", "graded_questions"]
        }
      }
      
    });

    const text = response.text || "{}";
    const gradingRecommendation = JSON.parse(text.trim());

    successResponse(res, gradingRecommendation, "AI grading recommendation generated successfully!");
  } catch (error: any) {
    console.error("Error generating AI grading with Gemini:", error);
    errorResponse(res, `Failed to generate AI grading feedback: ${error?.message || error}`);
  }
});


// ==========================================
// STATIC FILES & DEV ENVIRONMENT ROUTING
// ==========================================

async function startServer() {
  // Vite dev middleware or production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Assessment Server is booting! Available on: http://localhost:${PORT}`);
  });
}

startServer();
