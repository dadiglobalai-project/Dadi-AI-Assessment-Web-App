import type { Response } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import emailExistence from "email-existence";
import { dbHelper } from "./db-helper";
import { supabase } from "../config/supabase";
import { createRecordingFileName, createRecordingSignedUrl, deleteRecordingsFromStorage, uploadRecordingToStorage } from "./recording.service";

export { dbHelper, supabase, Type, createRecordingFileName, createRecordingSignedUrl, deleteRecordingsFromStorage, uploadRecordingToStorage };

let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}
export const ai = aiClient;

export const successResponse = (res: Response, data: any, message = "Success") => {
  res.json({ success: true, message, data });
};

export const errorResponse = (res: Response, message: string, status = 400) => {
  res.status(status).json({ success: false, message });
};

export const checkEmailExists = (email: string): Promise<boolean> => {
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


export const fetchSupabaseRowsByColumn = async (table: string, column: string, values: string[]) => {
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

export const mapRowsById = (rows: any[]) => {
  return new Map(rows.map((row) => [row.id, row]));
};

export const groupRowsByColumn = (rows: any[], column: string) => {
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