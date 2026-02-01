/**
 * Security Middleware
 * Rate limiting, sanitization, and security headers
 */

import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";

// ============================================
// Rate Limiting
// ============================================

// General API rate limit
export const generalRateLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 100, // 100 requests per minute
	message: {
		error: "Too many requests",
		code: "RATE_LIMIT_EXCEEDED",
		retryAfter: 60,
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.clientIp || req.ip || "unknown",
});

// Auth endpoints rate limit (stricter)
export const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // 10 requests per 15 minutes
	message: {
		error: "Too many authentication attempts",
		code: "AUTH_RATE_LIMIT",
		retryAfter: 900,
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.clientIp || req.ip || "unknown",
});

// Upload rate limit
export const uploadRateLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 10, // 10 uploads per minute
	message: {
		error: "Too many upload requests",
		code: "UPLOAD_RATE_LIMIT",
		retryAfter: 60,
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// ============================================
// Security Headers (Helmet)
// ============================================

export const securityHeaders = helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
			connectSrc: ["'self'", "https://api.cloudinary.com"],
		},
	},
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: { policy: "cross-origin" },
});

// ============================================
// Input Sanitization
// ============================================

export function sanitizeInput(
	req: Request,
	res: Response,
	next: NextFunction
) {
	// Recursively sanitize object
	const sanitize = (obj: any): any => {
		if (typeof obj === "string") {
			// Remove potential XSS
			return obj
				.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
				.replace(/javascript:/gi, "")
				.replace(/on\w+\s*=/gi, "")
				.trim();
		}
		if (Array.isArray(obj)) {
			return obj.map(sanitize);
		}
		if (obj && typeof obj === "object") {
			const sanitized: Record<string, any> = {};
			for (const [key, value] of Object.entries(obj)) {
				sanitized[key] = sanitize(value);
			}
			return sanitized;
		}
		return obj;
	};

	if (req.body) {
		req.body = sanitize(req.body);
	}
	if (req.query) {
		req.query = sanitize(req.query);
	}
	if (req.params) {
		req.params = sanitize(req.params);
	}

	next();
}

// ============================================
// Cookie Security
// ============================================

export const cookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "strict" as const,
	maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
	path: "/",
};

// ============================================
// CORS Configuration
// ============================================

export const corsOptions = {
	origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
		const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3002")
			.split(",")
			.map((o) => o.trim());

		if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "Idempotency-Key"],
};

// ============================================
// HTTP Parameter Pollution Protection
// ============================================

export const hppProtection = hpp();

export default {
	generalRateLimiter,
	authRateLimiter,
	uploadRateLimiter,
	securityHeaders,
	sanitizeInput,
	cookieOptions,
	corsOptions,
	hppProtection,
};
