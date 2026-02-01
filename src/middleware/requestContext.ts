import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Middleware to attach request context (IP, user agent, request ID)
 * This information is useful for audit logging and debugging
 */
export const requestContext = () => {
	return (req: Request, res: Response, next: NextFunction) => {
		// Generate unique request ID for tracing
		req.requestId = req.headers["x-request-id"] as string || uuidv4();

		// Get real client IP (handles proxies)
		req.clientIp = getClientIp(req);

		// Get user agent
		req.clientUserAgent = req.headers["user-agent"] || "unknown";

		// Set request ID in response header for client-side tracing
		res.setHeader("X-Request-ID", req.requestId);

		next();
	};
};

/**
 * Get client IP address, handling various proxy headers
 */
function getClientIp(req: Request): string {
	// Check common proxy headers
	const forwardedFor = req.headers["x-forwarded-for"];
	if (forwardedFor) {
		// x-forwarded-for can be a comma-separated list, take the first one
		const ips = Array.isArray(forwardedFor)
			? forwardedFor[0]
			: forwardedFor.split(",")[0];
		return ips.trim();
	}

	// Check other common headers
	const realIp = req.headers["x-real-ip"];
	if (realIp) {
		return Array.isArray(realIp) ? realIp[0] : realIp;
	}

	// Check CF-Connecting-IP (Cloudflare)
	const cfIp = req.headers["cf-connecting-ip"];
	if (cfIp) {
		return Array.isArray(cfIp) ? cfIp[0] : cfIp;
	}

	// Fallback to socket remote address
	return req.socket.remoteAddress || req.ip || "unknown";
}

export default requestContext;
