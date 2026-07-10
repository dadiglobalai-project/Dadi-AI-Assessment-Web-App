import dotenv from "dotenv";
import path from "path";
import fs from "fs";

export const loadEnv = () => {
  // Load local backend .env during development
  const backendEnv = path.join(process.cwd(), ".env");

  if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv });
  } else {
    // On Render, environment variables come from the dashboard
    dotenv.config();
  }
};