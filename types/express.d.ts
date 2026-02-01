import "express";

declare global {
	namespace Express {
		interface Request {
			// Auth
			userId?: bigint;
			userPermissions?: string[];

			// Request context
			requestId?: string;
			clientIp?: string;
			clientUserAgent?: string;

			// Raw body (for webhooks)
			rawBody?: Buffer;
		}
	}
}

