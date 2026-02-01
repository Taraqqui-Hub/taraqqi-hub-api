import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
	res.status(200).json({
		status: "ok",
		message: "Taraqqi Hub API is running",
		timestamp: new Date().toISOString(),
	});
});

export default healthRouter;
