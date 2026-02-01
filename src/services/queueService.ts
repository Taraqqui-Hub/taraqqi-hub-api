/**
 * Queue Service
 * BullMQ queue setup for background jobs
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";

// ============================================
// Redis Connection
// ============================================

const redisConnection = {
	host: process.env.REDIS_HOST || "localhost",
	port: parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD || undefined,
};

// ============================================
// Queue Names
// ============================================

export const QueueNames = {
	NOTIFICATION_EMAIL: "notification-email",
	NOTIFICATION_INAPP: "notification-inapp",
	KYC_PROCESS: "kyc-process",
	CLEANUP_RETENTION: "cleanup-retention",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

// ============================================
// Queue Instances
// ============================================

const queues: Map<QueueName, Queue> = new Map();

export function getQueue(name: QueueName): Queue {
	if (!queues.has(name)) {
		const queue = new Queue(name, {
			connection: redisConnection,
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1000,
				},
				removeOnComplete: 100,
				removeOnFail: 500,
			},
		});
		queues.set(name, queue);
	}
	return queues.get(name)!;
}

// ============================================
// Job Types
// ============================================

export interface EmailJobData {
	to: string;
	subject: string;
	template: string;
	data: Record<string, any>;
}

export interface InAppNotificationJobData {
	userId: bigint | string;
	type: string;
	title: string;
	message: string;
	link?: string;
	metadata?: Record<string, any>;
}

export interface KycProcessJobData {
	kycId: bigint | string;
	userId: bigint | string;
	documentType: string;
	documentUrl: string;
}

export interface CleanupJobData {
	type: "kyc" | "audit_logs" | "sessions";
	olderThanDays: number;
}

// ============================================
// Add Job Helpers
// ============================================

export async function addEmailJob(data: EmailJobData, delay?: number) {
	const queue = getQueue(QueueNames.NOTIFICATION_EMAIL);
	return queue.add("send-email", data, {
		delay,
		priority: 1,
	});
}

export async function addInAppNotification(
	data: InAppNotificationJobData,
	delay?: number
) {
	const queue = getQueue(QueueNames.NOTIFICATION_INAPP);
	return queue.add("create-notification", data, {
		delay,
		priority: 2,
	});
}

export async function addKycProcessJob(data: KycProcessJobData) {
	const queue = getQueue(QueueNames.KYC_PROCESS);
	return queue.add("process-kyc", data, {
		priority: 1,
	});
}

export async function addCleanupJob(data: CleanupJobData) {
	const queue = getQueue(QueueNames.CLEANUP_RETENTION);
	return queue.add("cleanup", data, {
		priority: 10,
	});
}

// ============================================
// Graceful Shutdown
// ============================================

export async function closeAllQueues() {
	for (const [name, queue] of queues) {
		await queue.close();
		console.log(`Closed queue: ${name}`);
	}
}

export default {
	getQueue,
	addEmailJob,
	addInAppNotification,
	addKycProcessJob,
	addCleanupJob,
	closeAllQueues,
	QueueNames,
};
