/**
 * Monitoring Configuration
 * KPIs, alerts, and health checks
 */

// ============================================
// KPI Metrics
// ============================================

export const KPIMetrics = {
	// KYC Metrics
	kycPassRate: {
		name: "KYC Pass Rate",
		query: "approved / (approved + rejected) * 100",
		threshold: 80, // Alert if below 80%
		unit: "%",
	},
	kycTimeToVerify: {
		name: "Time to Verify",
		query: "avg(reviewed_at - created_at)",
		threshold: 24, // Alert if above 24 hours
		unit: "hours",
	},

	// Job Metrics
	jobsPostedPerDay: {
		name: "Jobs Posted Per Day",
		query: "count(jobs where created_at > now() - 24h)",
		threshold: 10, // Baseline
		unit: "jobs",
	},
	applicationsPerJob: {
		name: "Applications Per Job",
		query: "avg(applications_count)",
		threshold: 5, // Baseline
		unit: "applications",
	},

	// User Metrics
	dailyActiveUsers: {
		name: "Daily Active Users",
		query: "count(distinct user_id where last_login > now() - 24h)",
		threshold: 100,
		unit: "users",
	},
	employerConversionRate: {
		name: "Employer Conversion Rate",
		query: "employers_with_jobs / total_employers * 100",
		threshold: 30,
		unit: "%",
	},

	// Payment Metrics
	dailyRevenue: {
		name: "Daily Revenue",
		query: "sum(amount where type=credit and created_at > now() - 24h)",
		threshold: 10000,
		unit: "INR",
	},
};

// ============================================
// Alert Configuration
// ============================================

export const AlertConfig = {
	// Critical alerts
	critical: {
		queueBacklog: {
			threshold: 1000,
			message: "Queue backlog exceeded 1000 jobs",
		},
		errorRate: {
			threshold: 5, // 5%
			message: "Error rate exceeded 5%",
		},
		paymentFailures: {
			threshold: 10,
			message: "More than 10 payment failures in last hour",
		},
	},

	// Warning alerts
	warning: {
		kycPendingQueue: {
			threshold: 100,
			message: "More than 100 KYC reviews pending",
		},
		responseTime: {
			threshold: 2000, // 2 seconds
			message: "API response time exceeded 2s",
		},
	},
};

// ============================================
// Health Check Endpoints
// ============================================

export const healthChecks = {
	database: {
		check: "SELECT 1",
		timeout: 5000,
	},
	redis: {
		check: "PING",
		timeout: 2000,
	},
	cloudinary: {
		check: "GET /v1_1/{cloud_name}/resources/image",
		timeout: 5000,
	},
};

// ============================================
// Dashboard Metrics Query
// ============================================

export interface MetricsSnapshot {
	timestamp: Date;
	users: {
		total: number;
		activeToday: number;
		newToday: number;
	};
	jobs: {
		total: number;
		activeJobs: number;
		postedToday: number;
	};
	applications: {
		total: number;
		pendingToday: number;
		hiredToday: number;
	};
	kyc: {
		pending: number;
		approvedToday: number;
		rejectedToday: number;
		passRate: number;
	};
	revenue: {
		today: number;
		thisMonth: number;
	};
	queue: {
		pending: number;
		failed: number;
	};
}

export async function getMetricsSnapshot(): Promise<MetricsSnapshot> {
	// In production, query actual metrics from DB and Redis
	return {
		timestamp: new Date(),
		users: { total: 0, activeToday: 0, newToday: 0 },
		jobs: { total: 0, activeJobs: 0, postedToday: 0 },
		applications: { total: 0, pendingToday: 0, hiredToday: 0 },
		kyc: { pending: 0, approvedToday: 0, rejectedToday: 0, passRate: 0 },
		revenue: { today: 0, thisMonth: 0 },
		queue: { pending: 0, failed: 0 },
	};
}

export default {
	KPIMetrics,
	AlertConfig,
	healthChecks,
	getMetricsSnapshot,
};
