import { GoogleGenAI, Type } from "@google/genai";
import emailExistence from "email-existence";
import { dbHelper } from "./db-helper";
import { supabase } from "../config/supabase";

export { dbHelper, supabase, Type };

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

export const successResponse = (res: any, data: any, message = "Success") => {
  return res.json({ success: true, message, data });
};

export const errorResponse = (res: any, message: string, status = 400) => {
  return res.status(status).json({ success: false, message });
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

