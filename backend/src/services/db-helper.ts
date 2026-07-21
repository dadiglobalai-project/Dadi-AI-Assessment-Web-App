import dotenv from 'dotenv';
import { supabase } from '../config/supabase';

dotenv.config();

function getSupabaseClient() {
  return supabase;
}

export const dbHelper = {
  // Users
  getUsers: async () => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("*");

    if (error) {
      throw error;
    }

    console.log("Auth/users data source: Supabase users");
    return data ?? [];
  },
  getUserById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    console.log("Auth user lookup source:", {
      dataSource: "Supabase users",
      lookup: "id",
      userId: id,
      found: Boolean(data)
    });
    return data;
  },
  getUserByEmail: async (email: string) => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    console.log("Auth user lookup source:", {
      dataSource: "Supabase users",
      lookup: "email",
      email,
      found: Boolean(data)
    });
    return data;
  },
  saveUser: async (user: any) => {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .insert({
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        applied_role_id: user.applied_role_id ?? null,
        created_at: user.created_at
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase user save failed:", {
        userId: user?.id,
        email: user?.email,
        error
      });
      throw error;
    }

    console.log("Auth user save source:", {
      dataSource: "Supabase users",
      userId: data.id,
      email: data.email
    });
    return data;
  },

  // Assessments
  getAssessments: async () => {
    const { data, error } = await getSupabaseClient()
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getAssessmentById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("assessments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  saveAssessment: async (assessment: any) => {
    const { data, error } = await getSupabaseClient()
      .from("assessments")
      .upsert(assessment, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  deleteAssessment: async (id: string) => {
    const supabase = getSupabaseClient();
    const { data: affectedAAs, error: aaLookupError } = await supabase
      .from("applicant_assessments")
      .select("id")
      .eq("assessment_id", id);

    if (aaLookupError) {
      throw aaLookupError;
    }

    const affectedAAIds = (affectedAAs ?? []).map((aa: any) => aa.id);

    if (affectedAAIds.length > 0) {
      for (const table of ["answers", "recordings", "reviews", "applicant_assessment_questions"]) {
        const { error } = await supabase
          .from(table)
          .delete()
          .in("applicant_assessment_id", affectedAAIds);

        if (error) {
          throw error;
        }
      }
    }

    for (const operation of [
      supabase.from("questions").delete().eq("assessment_id", id),
      supabase.from("assessment_question_config").delete().eq("assessment_id", id),
      supabase.from("applicant_assessments").delete().eq("assessment_id", id),
      supabase.from("assessments").delete().eq("id", id)
    ]) {
      const { error } = await operation;
      if (error) {
        throw error;
      }
    }
  },

  // Questions
  getQuestions: async () => {
    const { data, error } = await getSupabaseClient()
      .from("questions")
      .select("*")
      .order("order_number", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getQuestionsByAssessmentId: async (assessmentId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("questions")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("order_number", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getQuestionById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("questions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  saveQuestion: async (question: any) => {
    const { data, error } = await getSupabaseClient()
      .from("questions")
      .upsert(question, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  deleteQuestion: async (id: string) => {
    const { error } = await getSupabaseClient()
      .from("questions")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }
  },

  // Applicant Assessments
  getApplicantAssessments: async () => {
    const { data, error } = await getSupabaseClient()
      .from("applicant_assessments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getApplicantAssessmentById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("applicant_assessments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  getApplicantAssessmentByApplicantAndAssessment: async (applicantId: string, assessmentId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("applicant_assessments")
      .select("*")
      .eq("applicant_id", applicantId)
      .eq("assessment_id", assessmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  saveApplicantAssessment: async (aa: any) => {
    const { data, error } = await getSupabaseClient()
      .from("applicant_assessments")
      .upsert(aa, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  deleteApplicantAssessment: async (id: string) => {
    const supabase = getSupabaseClient();

    for (const table of ["answers", "recordings", "reviews", "applicant_assessment_questions"]) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("applicant_assessment_id", id);

      if (error) {
        throw error;
      }
    }

    const { error } = await supabase
      .from("applicant_assessments")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }
  },

  // Answers
  getAnswers: async () => {
    const { data, error } = await getSupabaseClient()
      .from("answers")
      .select("*");

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getAnswersByApplicantAssessmentId: async (aaId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("answers")
      .select("*")
      .eq("applicant_assessment_id", aaId);

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  saveAnswer: async (answer: any) => {
    const applicantAssessmentId = answer.applicantAssessmentId ?? answer.applicant_assessment_id;
    const questionId = answer.questionId ?? answer.question_id;
    const answerText = answer.answerText ?? answer.answer_text ?? "";

    if (!applicantAssessmentId || !questionId) {
      throw new Error("Cannot save answer: applicantAssessmentId and questionId are required.");
    }

    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      const { data: existingAnswer, error: lookupError } = await supabase
        .from("answers")
        .select("id")
        .eq("applicant_assessment_id", applicantAssessmentId)
        .eq("question_id", questionId)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      const query = existingAnswer
        ? supabase
            .from("answers")
            .update({
              answer_text: answerText,
              updated_at: now,
            })
            .eq("applicant_assessment_id", applicantAssessmentId)
            .eq("question_id", questionId)
        : supabase
            .from("answers")
            .insert({
              id: `ans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              applicant_assessment_id: applicantAssessmentId,
              question_id: questionId,
              answer_text: answerText,
              created_at: now,
              updated_at: now,
            });

      const { data, error } = await query
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (err) {
      console.error("Supabase answer save failed:", {
        applicantAssessmentId,
        questionId,
        error: err
      });
      throw err;
    }
  },

  // Recordings
  getRecordings: async () => {
    const { data, error } = await getSupabaseClient()
      .from("recordings")
      .select("*");

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getRecordingByApplicantAssessmentId: async (aaId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("recordings")
      .select("*")
      .eq("applicant_assessment_id", aaId)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  getRecordingsByApplicantAssessmentId: async (aaId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("recordings")
      .select("*")
      .eq("applicant_assessment_id", aaId)
      .order("segment_number", { ascending: true })
      .order("uploaded_at", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  saveRecording: async (recording: any) => {
    const { data, error } = await getSupabaseClient()
      .from("recordings")
      .insert(recording)
      .select()
      .single();

    if (error) {
      console.error("Supabase recording save failed:", {
        recordingId: recording?.id,
        applicantAssessmentId: recording?.applicant_assessment_id,
        error
      });
      throw error;
    }

    return data;
  },

  // Reviews
  getReviews: async () => {
    const { data, error } = await getSupabaseClient()
      .from("reviews")
      .select("*");

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getReviewByApplicantAssessmentId: async (aaId: string) => {
    const { data, error } = await getSupabaseClient()
      .from("reviews")
      .select("*")
      .eq("applicant_assessment_id", aaId)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  saveReview: async (review: any) => {
    const { data, error } = await getSupabaseClient()
      .from("reviews")
      .upsert(review, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  // Roles
  getRoles: async () => {
    const { data, error } = await getSupabaseClient()
      .from("roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  getRoleById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("roles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  saveRole: async (role: any) => {
    const { data, error } = await getSupabaseClient()
      .from("roles")
      .insert(role)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  deleteRole: async (id: string) => {
    const { error } = await getSupabaseClient()
      .from("roles")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
};
