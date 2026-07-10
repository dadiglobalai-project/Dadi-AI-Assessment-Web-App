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

export const updateAssessmentQuestionConfig = async (req: Request, res: Response) => {
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
};

export const createQuestion = async (req: Request, res: Response) => {
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
};

export const updateQuestion = async (req: Request, res: Response) => {
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
};

export const deleteQuestion = async (req: Request, res: Response) => {
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    console.error("Supabase question delete failed:", { questionId: req.params.id, error });
    return errorResponse(res, "Failed to delete question", 500);
  }

  successResponse(res, null, "Question deleted successfully");
};

export const generateQuestionsWithAI = async (req: Request, res: Response) => {
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
};
