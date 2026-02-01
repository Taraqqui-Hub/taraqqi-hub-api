/**
 * Worker Entry Point
 * Background job processors
 */

import "../config/loadEnv.ts";
import { Worker, Job } from "bullmq";
import nodemailer from "nodemailer";
import { db } from "../config/database.ts";
import { eq } from "drizzle-orm";
import { kycRecords, KycStatuses } from "../db/index.ts";
import {
	QueueNames,
	EmailJobData,
	InAppNotificationJobData,
	KycProcessJobData,
	CleanupJobData,
} from "../services/queueService.ts";

// ============================================
// Redis Connection
// ============================================

const redisConnection = {
	host: process.env.REDIS_HOST || "localhost",
	port: parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD || undefined,
};

// ============================================
// Email Transporter
// ============================================

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST || "smtp.gmail.com",
	port: parseInt(process.env.SMTP_PORT || "587"),
	secure: process.env.SMTP_SECURE === "true",
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@taraqqihub.com";
const FROM_NAME = process.env.FROM_NAME || "Taraqqi Hub";

// ============================================
// Email Worker
// ============================================

const emailWorker = new Worker<EmailJobData>(
	QueueNames.NOTIFICATION_EMAIL,
	async (job: Job<EmailJobData>) => {
		const { to, subject, template, data } = job.data;

		console.log(`[Email] Sending to ${to}: ${subject}`);

		await transporter.sendMail({
			from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
			to,
			subject,
			html: data.html || `Template: ${template}`,
		});

		console.log(`[Email] Sent to ${to}`);
	},
	{ connection: redisConnection, concurrency: 5 }
);

// ============================================
// In-App Notification Worker
// ============================================

const inAppWorker = new Worker<InAppNotificationJobData>(
	QueueNames.NOTIFICATION_INAPP,
	async (job: Job<InAppNotificationJobData>) => {
		const { userId, type, title, message, link } = job.data;

		console.log(`[InApp] Creating notification for user ${userId}: ${title}`);

		// In production, insert into notifications table
		// For now, log it
		console.log(`[InApp] Notification created: ${type} - ${message}`);
	},
	{ connection: redisConnection, concurrency: 10 }
);

// ============================================
// KYC Process Worker (OCR placeholder)
// ============================================

const kycWorker = new Worker<KycProcessJobData>(
	QueueNames.KYC_PROCESS,
	async (job: Job<KycProcessJobData>) => {
		const { kycId, documentType, documentUrl } = job.data;

		console.log(`[KYC] Processing KYC ${kycId}: ${documentType}`);

		// Placeholder for OCR/verification logic
		// In production: call OCR API, verify document, update status

		// For now, mark as pending for manual review
		await db
			.update(kycRecords)
			.set({
				status: KycStatuses.PENDING,
				updatedAt: new Date(),
			})
			.where(eq(kycRecords.id, BigInt(kycId)));

		console.log(`[KYC] Processed KYC ${kycId}`);
	},
	{ connection: redisConnection, concurrency: 2 }
);

// ============================================
// Cleanup Worker (Retention Policy)
// ============================================

const cleanupWorker = new Worker<CleanupJobData>(
	QueueNames.CLEANUP_RETENTION,
	async (job: Job<CleanupJobData>) => {
		const { type, olderThanDays } = job.data;

		console.log(`[Cleanup] Running ${type} cleanup, older than ${olderThanDays} days`);

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		// Placeholder for cleanup logic
		// In production: delete old KYC docs, archive audit logs, etc.

		console.log(`[Cleanup] Completed ${type} cleanup`);
	},
	{ connection: redisConnection, concurrency: 1 }
);

// ============================================
// Event Handlers
// ============================================

[emailWorker, inAppWorker, kycWorker, cleanupWorker].forEach((worker) => {
	worker.on("completed", (job) => {
		console.log(`[${worker.name}] Job ${job.id} completed`);
	});

	worker.on("failed", (job, err) => {
		console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message);
	});
});

// ============================================
// Graceful Shutdown
// ============================================

async function shutdown() {
	console.log("Shutting down workers...");
	await Promise.all([
		emailWorker.close(),
		inAppWorker.close(),
		kycWorker.close(),
		cleanupWorker.close(),
	]);
	console.log("Workers stopped");
	process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("Workers started:");
console.log(`  - ${QueueNames.NOTIFICATION_EMAIL}`);
console.log(`  - ${QueueNames.NOTIFICATION_INAPP}`);
console.log(`  - ${QueueNames.KYC_PROCESS}`);
console.log(`  - ${QueueNames.CLEANUP_RETENTION}`);
