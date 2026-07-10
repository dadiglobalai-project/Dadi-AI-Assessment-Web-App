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

export const validateInvite = async (req: Request, res: Response) => {
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
};

export const login = async (req: Request, res: Response) => {
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
};

export const register = async (req: Request, res: Response) => {
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
};

export const getCurrentUser = async (req: Request, res: Response) => {
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
};

