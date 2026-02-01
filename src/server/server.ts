import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Express, Request, RequestHandler, Response, response } from "express";
import { getReasonPhrase, ReasonPhrases, StatusCodes } from "http-status-codes";
import morgan from "morgan";

import { HTTPError } from "../config/error.ts";
import requestContext from "../middleware/requestContext.ts";

const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);

const CORS_ALLOWED_DOMAINS = envOrigins.length
	? envOrigins
	: ["http://localhost:3000"];

interface Route {
	path: string;
	handlers: RequestHandler[];
}

interface ServerInitData {
	name: string;
	port: number;
	routes: Route[];
}

export default class Server {
	app: Express;
	name: string;
	port: number;
	routes: Route[];

	constructor({ name, port, routes }: ServerInitData) {
		const app = express();
		this.app = app;
		this.name = name;
		this.port = port;
		this.routes = routes;
		this.setupServer();
	}

	async setupServer() {
		this.setupPreRoutesMiddlewares();
		this.setupRoutes();
		this.setupPostRoutesMiddlewares();
		this.startListening();
	}

	setupPreRoutesMiddlewares() {
		// CORS
		this.app.use(
			cors({
				origin(requestOrigin, callback) {
					if (!requestOrigin) {
						return callback(null, true);
					}
					if (process.env.ENV === "prod") {
						const isAllowed = CORS_ALLOWED_DOMAINS.includes(requestOrigin);
						callback(null, isAllowed);
					} else {
						callback(null, true);
					}
				},
				credentials: true,
				methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
				optionsSuccessStatus: 204,
			})
		);

		// JSON parser
		this.app.use(express.json());

		// Cookie parser
		this.app.use(cookieParser());

		// Request context (IP, user agent, request ID)
		this.app.use(requestContext());

		// Request logging
		this.app.use(
			morgan(
				":remote-addr :method :url HTTP/:http-version :status - :response-time ms"
			)
		);

		// Response wrapper middleware
		this.app.use((req, res, next) => {
			const actualSendMethod = res.send;
			res.send = (data) => {
				// Skip wrapper for raw file downloads
				if ((res as any).__skipWrapper) {
					res.send = actualSendMethod;
					return actualSendMethod.call(res, data);
				}

				let payload;
				try {
					payload = JSON.parse(data);
				} catch {
					payload = data;
				}
				const statusCode = res.statusCode;
				res.send = actualSendMethod;
				return res.status(statusCode).json({
					status: statusCode,
					message: getReasonPhrase(statusCode),
					payload,
				});
			};
			next();
		});
	}

	setupRoutes() {
		// Health check route
		this.app.get("/health", (_req, res) => {
			res.status(200).send("All good!");
		});

		// Setup provided routes
		for (const route of this.routes) {
			this.app.use(route.path, ...route.handlers);
		}
	}

	setupPostRoutesMiddlewares() {
		// 404 handler
		this.app.use((req, res, next) => {
			const notFoundError = new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
			});
			next(notFoundError);
		});

		// Error handler
		this.app.use(
			(err: Error, req: Request, res: Response, next: Function) => {
				let status, data;
				res.send = response.send;

				if (err instanceof HTTPError) {
					status = err.httpStatus;
					data = {
						status: err.httpStatus,
						error: err.message ? err.message : getReasonPhrase(err.httpStatus),
						reason: err.reason || null,
					};
				} else {
					status = StatusCodes.INTERNAL_SERVER_ERROR;
					data = {
						status: StatusCodes.INTERNAL_SERVER_ERROR,
						error: ReasonPhrases.INTERNAL_SERVER_ERROR,
					};
					console.error("Unhandled error:", err);
				}
				res.status(status).json(data);
			}
		);
	}

	startListening() {
		const port = this.port;
		try {
			const server = this.app.listen(port, "0.0.0.0", () => {
				console.log(`\n🚀 Server ${this.name} is running on port ${port} 🟢`);
				console.log(`📍 Health check: http://localhost:${port}/health`);
				console.log(`📍 API base: http://localhost:${port}/auth\n`);
			});

			server.on("error", (err: any) => {
				if (err.code === "EADDRINUSE") {
					console.error(`❌ Port ${port} is already in use.`);
				} else {
					console.error(`❌ Server error: ${err.message}`, err);
				}
				process.exit(1);
			});

			process.on("SIGTERM", () => {
				console.log("SIGTERM received. Shutting down gracefully...");
				server.close(() => {
					console.log("Server closed.");
				});
			});

			return server;
		} catch (error: any) {
			console.error(`❌ Failed to start server on port ${port}: ${error.message}`);
			process.exit(1);
		}
	}
}
