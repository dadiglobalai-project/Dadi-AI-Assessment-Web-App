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
import { getAssignedQuestionsForAttempt } from "./assessment.service";
import { deleteRecordingsFromStorage } from "./recording.service";

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

export const listSubmissionsService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const getSubmissionDetailsService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const reviewSubmissionService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const resetSubmissionService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const deleteSubmissionService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};

export const gradeSubmissionWithAIService = async ({ body, params, query: requestQuery, file }: ServiceRequest): Promise<ServiceResult> => {
  const req = { body, params, query: requestQuery, file };
  const { res, getResult } = createServiceResponder();

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

  return getResult();
};
