// BigInt JSON serialization polyfill - must be first
// This allows JSON.stringify to handle BigInt values from PostgreSQL
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};

import "../config/loadEnv.ts";

import Server from "./server.ts";
import healthRouter from "../routes/health.ts";
import authRouter from "../routes/auth.ts";
import registrationRouter from "../routes/registration.ts";
import meRouter from "../routes/me.ts";
import jobsRouter from "../routes/jobs.ts";
import jobseekerProfileRouter from "../routes/jobseekerProfile.ts";
import kycRouter from "../routes/kyc.ts";
import applicationsRouter from "../routes/applications.ts";
import employerProfileRouter from "../routes/employerProfile.ts";
import employerJobsRouter from "../routes/employerJobs.ts";
import resumeUnlockRouter from "../routes/resumeUnlock.ts";
import walletRouter from "../routes/wallet.ts";
import uploadRouter from "../routes/upload.ts";
import educationRouter from "../routes/education.ts";
import preferencesRouter from "../routes/preferences.ts";
import experienceRouter from "../routes/experience.ts";
import skillsRouter from "../routes/skills.ts";
import interestsRouter from "../routes/interests.ts";
import profileWizardRouter from "../routes/profileWizard.ts";
import savedJobsRouter from "../routes/savedJobs.ts";

// Admin routes
import adminDashboardRouter from "../routes/admin/dashboard.ts";
import adminKycRouter from "../routes/admin/kyc.ts";
import adminEmployersRouter from "../routes/admin/employers.ts";
import adminJobsRouter from "../routes/admin/jobs.ts";
import adminConfigRouter from "../routes/admin/config.ts";
import adminAuditLogsRouter from "../routes/admin/auditLogs.ts";
import adminUsersRouter from "../routes/admin/users.ts";
import adminPlatformUsersRouter from "../routes/admin/platformUsers.ts";

const port = +(process.env.PORT || "3001");

new Server({
	name: "taraqqi-hub-api",
	port,
	routes: [
		{
			path: "/health",
			handlers: [healthRouter],
		},
		{
			path: "/auth",
			handlers: [authRouter],
		},
		{
			path: "/registration",
			handlers: [registrationRouter],
		},
		{
			path: "/auth/me",
			handlers: [meRouter],
		},
		{
			path: "/jobs",
			handlers: [jobsRouter],
		},
		{
			path: "/profile/jobseeker",
			handlers: [jobseekerProfileRouter],
		},
		{
			path: "/profile/jobseeker/education",
			handlers: [educationRouter],
		},
		{
			path: "/profile/jobseeker/experience",
			handlers: [experienceRouter],
		},
		{
			path: "/profile/jobseeker/skills",
			handlers: [skillsRouter],
		},
		{
			path: "/profile/jobseeker/interests",
			handlers: [interestsRouter],
		},
		{
			path: "/profile/wizard",
			handlers: [profileWizardRouter],
		},
		{
			path: "/preferences",
			handlers: [preferencesRouter],
		},
		{
			path: "/kyc",
			handlers: [kycRouter],
		},
		{
			path: "/applications",
			handlers: [applicationsRouter],
		},
		{
			path: "/profile/employer",
			handlers: [employerProfileRouter],
		},
		{
			path: "/employer/jobs",
			handlers: [employerJobsRouter],
		},
		{
			path: "/resume",
			handlers: [resumeUnlockRouter],
		},
		{
			path: "/wallet",
			handlers: [walletRouter],
		},
		{
			path: "/upload",
			handlers: [uploadRouter],
		},
		// Admin routes
		{
			path: "/admin",
			handlers: [adminDashboardRouter],
		},
		{
			path: "/admin/kyc",
			handlers: [adminKycRouter],
		},
		{
			path: "/admin/employers",
			handlers: [adminEmployersRouter],
		},
		{
			path: "/admin/jobs",
			handlers: [adminJobsRouter],
		},
		{
			path: "/admin/config",
			handlers: [adminConfigRouter],
		},
		{
			path: "/admin/audit-logs",
			handlers: [adminAuditLogsRouter],
		},
		{
			path: "/admin/users",
			handlers: [adminUsersRouter],
		},
		{
			path: "/admin/platform-users",
			handlers: [adminPlatformUsersRouter],
		},
		{
			path: "/saved-jobs",
			handlers: [savedJobsRouter],
		},
	],
});
