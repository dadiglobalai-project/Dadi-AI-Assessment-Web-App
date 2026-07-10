import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

export const loadEnv = () => {
  dotenv.config();
  dotenv.config({ path: path.join(repoRoot, ".env") });
  dotenv.config({ path: path.join(repoRoot, "backend", ".env") });
  dotenv.config({ path: path.join(repoRoot, "frontend", ".env") });
};
