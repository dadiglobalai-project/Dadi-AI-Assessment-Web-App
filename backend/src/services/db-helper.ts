import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { supabase } from '../config/supabase';

dotenv.config();

const DB_FILE = path.join(process.cwd(), 'database.json');

function getSupabaseClient() {
  return supabase;
}

// Interface for database structure
export interface DBStructure {
  users: any[];
  roles: any[];
  assessments: any[];
  questions: any[];
  applicant_assessments: any[];
  answers: any[];
  recordings: any[];
  reviews: any[];
}

const DEFAULT_DB: DBStructure = {
  users: [
    {
      id: "admin-1",
      name: "Admin",
      email: "admin@assessment.com",
      password: "admin123",
      role: "ADMIN",
      created_at: new Date().toISOString()
    },
    {
      id: "applicant-1",
      name: "Alex Rivera",
      email: "alex@assessment.com",
      password: "alex123",
      role: "APPLICANT",
      created_at: new Date().toISOString()
    },
    {
      id: "applicant-2",
      name: "Sam Chen",
      email: "sam@assessment.com",
      password: "sam123",
      role: "APPLICANT",
      created_at: new Date().toISOString()
    }
  ],
  roles: [
    {
      id: "role-esl",
      role_name: "ESL Teacher",
      description: "English as a Second Language Educator responsible for delivering interactive virtual English classes.",
      status: "ACTIVE",
      created_at: new Date().toISOString()
    },
    {
      id: "role-coord",
      role_name: "Business Coordinator",
      description: "Coordinates commercial relations, client queries, schedules, and operations.",
      status: "ACTIVE",
      created_at: new Date().toISOString()
    },
    {
      id: "role-trainer",
      role_name: "English Course Trainer",
      description: "Professional coaching, corporate training, speaking focus, curriculum execution.",
      status: "ACTIVE",
      created_at: new Date().toISOString()
    },
    {
      id: "role-dev",
      role_name: "Curriculum Developer",
      description: "Develops learning programs, materials, online tests, and syllabus structure.",
      status: "ACTIVE",
      created_at: new Date().toISOString()
    }
  ],
  assessments: [
    {
      id: "assess-1",
      title: "AI & Large Language Model Core Competencies",
      instructions: "This timed assessment evaluates your foundational understanding of Large Language Models, prompt engineering, and agentic workflows. You are required to enable screen recording to begin. Do not navigate away from this browser window. Auto-save is active.",
      time_limit_minutes: 15,
      status: "ACTIVE",
      created_by: "admin-1",
      created_at: new Date().toISOString()
    }
  ],
  questions: [
    {
      id: "q-1",
      assessment_id: "assess-1",
      question_text: "Explain the difference between temperature and top_p sampling in LLM generation, and when you would adjust each.",
      question_type: "TEXT",
      points: 15,
      order_number: 1,
      created_at: new Date().toISOString()
    },
    {
      id: "q-2",
      assessment_id: "assess-1",
      question_text: "Which of the following describes the 'Hallucination' phenomenon in LLMs?",
      question_type: "MULTIPLE_CHOICE",
      options: [
        "The model producing grammatically incorrect language",
        "The model generating factually incorrect but highly confident-sounding assertions",
        "The model running out of context window tokens",
        "The model refusing to answer based on safety guardrails"
      ],
      points: 10,
      order_number: 2,
      created_at: new Date().toISOString()
    },
    {
      id: "q-3",
      assessment_id: "assess-1",
      question_text: "Implement a simple Python retry decorator function with exponential backoff for handling Gemini API rate limit errors (429 status code). Make sure it catches requests.exceptions.RequestException or a generic Exception.",
      question_type: "CODE",
      points: 25,
      order_number: 3,
      created_at: new Date().toISOString()
    }
  ],
  applicant_assessments: [],
  answers: [],
  recordings: [],
  reviews: []
};

// Thread-safe-ish reading & writing
function readDB(): DBStructure {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(data);
    
    // Safety check & backfilling
    if (!db.users) db.users = [];
    if (!db.roles || db.roles.length === 0) {
      db.roles = DEFAULT_DB.roles;
    }
    if (!db.assessments) db.assessments = [];
    if (!db.questions) db.questions = [];
    if (!db.applicant_assessments) db.applicant_assessments = [];
    if (!db.answers) db.answers = [];
    if (!db.recordings) db.recordings = [];
    if (!db.reviews) db.reviews = [];

    return db;
  } catch (err) {
    console.error("Error reading database file, returning default structure:", err);
    return DEFAULT_DB;
  }
}

function writeDB(db: DBStructure) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error writing database file:", err);
  }
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
  getAssessments: () => readDB().assessments,
  getAssessmentById: (id: string) => readDB().assessments.find(a => a.id === id),
  saveAssessment: (assessment: any) => {
    const db = readDB();
    const existingIndex = db.assessments.findIndex(a => a.id === assessment.id);
    if (existingIndex >= 0) {
      db.assessments[existingIndex] = { ...db.assessments[existingIndex], ...assessment };
    } else {
      db.assessments.push(assessment);
    }
    writeDB(db);
  },
  deleteAssessment: (id: string) => {
    const db = readDB();
    const affectedAAs = db.applicant_assessments.filter(aa => aa.assessment_id === id);
    const affectedAAIds = affectedAAs.map(aa => aa.id);

    db.assessments = db.assessments.filter(a => a.id !== id);
    db.questions = db.questions.filter(q => q.assessment_id !== id);
    db.applicant_assessments = db.applicant_assessments.filter(aa => aa.assessment_id !== id);
    db.answers = db.answers.filter(ans => !affectedAAIds.includes(ans.applicant_assessment_id));
    db.recordings = db.recordings.filter(rec => !affectedAAIds.includes(rec.applicant_assessment_id));
    db.reviews = db.reviews.filter(rev => !affectedAAIds.includes(rev.applicant_assessment_id));
    writeDB(db);
  },

  // Questions
  getQuestions: () => readDB().questions,
  getQuestionsByAssessmentId: (assessmentId: string) => {
    return readDB().questions
      .filter(q => q.assessment_id === assessmentId)
      .sort((a, b) => a.order_number - b.order_number);
  },
  getQuestionById: (id: string) => readDB().questions.find(q => q.id === id),
  saveQuestion: (question: any) => {
    const db = readDB();
    const existingIndex = db.questions.findIndex(q => q.id === question.id);
    if (existingIndex >= 0) {
      db.questions[existingIndex] = { ...db.questions[existingIndex], ...question };
    } else {
      db.questions.push(question);
    }
    writeDB(db);
  },
  deleteQuestion: (id: string) => {
    const db = readDB();
    db.questions = db.questions.filter(q => q.id !== id);
    writeDB(db);
  },

  // Applicant Assessments
  getApplicantAssessments: () => readDB().applicant_assessments,
  getApplicantAssessmentById: async (id: string) => {
    const { data, error } = await getSupabaseClient()
      .from("applicant_assessments")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }

      throw error;
    }

    return data;
  },
  getApplicantAssessmentByApplicantAndAssessment: (applicantId: string, assessmentId: string) => {
    return readDB().applicant_assessments.find(aa => aa.applicant_id === applicantId && aa.assessment_id === assessmentId);
  },
  saveApplicantAssessment: (aa: any) => {
    const db = readDB();
    const existingIndex = db.applicant_assessments.findIndex(item => item.id === aa.id);
    if (existingIndex >= 0) {
      db.applicant_assessments[existingIndex] = { ...db.applicant_assessments[existingIndex], ...aa };
    } else {
      db.applicant_assessments.push(aa);
    }
    writeDB(db);
  },
  deleteApplicantAssessment: (id: string) => {
    const db = readDB();
    db.applicant_assessments = db.applicant_assessments.filter(aa => aa.id !== id);
    db.answers = db.answers.filter(ans => ans.applicant_assessment_id !== id);
    db.recordings = db.recordings.filter(rec => rec.applicant_assessment_id !== id);
    db.reviews = db.reviews.filter(rev => rev.applicant_assessment_id !== id);
    writeDB(db);
  },

  // Answers
  getAnswers: () => readDB().answers,
  getAnswersByApplicantAssessmentId: (aaId: string) => {
    return readDB().answers.filter(a => a.applicant_assessment_id === aaId);
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
  getRecordings: () => readDB().recordings,
  getRecordingByApplicantAssessmentId: (aaId: string) => {
    return readDB().recordings.find(r => r.applicant_assessment_id === aaId);
  },
  saveRecording: async (recording: any) => {
    const { data, error } = await getSupabaseClient()
      .from("recordings")
      .upsert(recording, { onConflict: "id" })
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
  getReviews: () => readDB().reviews,
  getReviewByApplicantAssessmentId: (aaId: string) => {
    return readDB().reviews.find(r => r.applicant_assessment_id === aaId);
  },
  saveReview: (review: any) => {
    const db = readDB();
    const existingIndex = db.reviews.findIndex(r => r.id === review.id);
    if (existingIndex >= 0) {
      db.reviews[existingIndex] = { ...db.reviews[existingIndex], ...review };
    } else {
      db.reviews.push(review);
    }
    writeDB(db);
  },

  // Roles
  getRoles: () => readDB().roles,
  getRoleById: (id: string) => readDB().roles.find(r => r.id === id),
  saveRole: (role: any) => {
    const db = readDB();
    const existingIndex = db.roles.findIndex(r => r.id === role.id);
    if (existingIndex >= 0) {
      db.roles[existingIndex] = { ...db.roles[existingIndex], ...role };
    } else {
      db.roles.push(role);
    }
    writeDB(db);
  },
  deleteRole: (id: string) => {
    const db = readDB();
    // Deactivating or deleting. We can delete it.
    db.roles = db.roles.filter(r => r.id !== id);
    writeDB(db);
  }
};
