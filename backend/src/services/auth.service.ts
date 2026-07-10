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

export const validateInviteService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const loginService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const registerService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const getCurrentUserService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

