import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local
const envPath = path.resolve(baseDir, "../../.env.local");
if (fs.existsSync(envPath)) {
	dotenv.config({ path: envPath });
	console.log(`[env] Loaded env from: ${envPath}`);
} else {
	console.warn(`[env] No .env.local found at ${envPath}`);
}

// Fallback for development
if (!process.env.FRONTEND_URL) {
    console.warn("[env] FRONTEND_URL not set, defaulting to http://localhost:3000");
    process.env.FRONTEND_URL = "http://localhost:3000";
}
