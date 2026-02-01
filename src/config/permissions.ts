/**
 * Permission constants for RBAC
 * Format: RESOURCE_ACTION
 */
export const Permissions = {
	// ============================================
	// Jobs
	// ============================================
	JOBS_CREATE: "jobs:create",
	JOBS_READ: "jobs:read",
	JOBS_READ_OWN: "jobs:read_own",
	JOBS_UPDATE: "jobs:update",
	JOBS_UPDATE_OWN: "jobs:update_own",
	JOBS_DELETE: "jobs:delete",
	JOBS_DELETE_OWN: "jobs:delete_own",
	JOBS_MODERATE: "jobs:moderate",
	JOBS_FEATURE: "jobs:feature",

	// ============================================
	// Applications
	// ============================================
	APPLICATIONS_CREATE: "applications:create",
	APPLICATIONS_READ_OWN: "applications:read_own",
	APPLICATIONS_READ_ALL: "applications:read_all",
	APPLICATIONS_UPDATE_STATUS: "applications:update_status",
	APPLICATIONS_WITHDRAW: "applications:withdraw",

	// ============================================
	// Jobseeker Profile
	// ============================================
	JOBSEEKER_PROFILE_CREATE: "jobseeker_profile:create",
	JOBSEEKER_PROFILE_READ: "jobseeker_profile:read",
	JOBSEEKER_PROFILE_READ_OWN: "jobseeker_profile:read_own",
	JOBSEEKER_PROFILE_UPDATE_OWN: "jobseeker_profile:update_own",

	// ============================================
	// Employer Profile
	// ============================================
	EMPLOYER_PROFILE_CREATE: "employer_profile:create",
	EMPLOYER_PROFILE_READ: "employer_profile:read",
	EMPLOYER_PROFILE_READ_OWN: "employer_profile:read_own",
	EMPLOYER_PROFILE_UPDATE_OWN: "employer_profile:update_own",

	// ============================================
	// Resume / Unlock
	// ============================================
	RESUME_VIEW: "resume:view",
	RESUME_UNLOCK: "resume:unlock",
	RESUME_DOWNLOAD: "resume:download",

	// ============================================
	// KYC
	// ============================================
	KYC_SUBMIT: "kyc:submit",
	KYC_READ_OWN: "kyc:read_own",
	KYC_READ_ALL: "kyc:read_all",
	KYC_REVIEW: "kyc:review",
	KYC_APPROVE: "kyc:approve",
	KYC_REJECT: "kyc:reject",

	// ============================================
	// Users (Admin)
	// ============================================
	USERS_READ: "users:read",
	USERS_READ_ALL: "users:read_all",
	USERS_UPDATE: "users:update",
	USERS_DELETE: "users:delete",
	USERS_MANAGE_ROLES: "users:manage_roles",
	USERS_ACTIVATE: "users:activate",
	USERS_DEACTIVATE: "users:deactivate",

	// ============================================
	// Wallets & Transactions
	// ============================================
	WALLET_READ_OWN: "wallet:read_own",
	WALLET_READ_ALL: "wallet:read_all",
	WALLET_CREDIT: "wallet:credit",
	WALLET_DEBIT: "wallet:debit",
	TRANSACTIONS_READ_OWN: "transactions:read_own",
	TRANSACTIONS_READ_ALL: "transactions:read_all",

	// ============================================
	// Admin Dashboard
	// ============================================
	ADMIN_DASHBOARD: "admin:dashboard",
	ADMIN_REPORTS: "admin:reports",
	ADMIN_SETTINGS: "admin:settings",

	// ============================================
	// Audit Logs
	// ============================================
	AUDIT_LOGS_READ: "audit:read",
	AUDIT_LOGS_EXPORT: "audit:export",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Default role names
 */
export const RoleNames = {
	SUPER_ADMIN: "super_admin",
	ADMIN: "admin",
	EMPLOYER: "employer",
	INDIVIDUAL: "individual",
} as const;

export type RoleName = (typeof RoleNames)[keyof typeof RoleNames];

/**
 * Default role-permission mappings
 * Used for seeding the database
 */
export const DefaultRolePermissions: Record<RoleName, Permission[]> = {
	// Super Admin - All permissions
	[RoleNames.SUPER_ADMIN]: Object.values(Permissions),

	// Admin - Most permissions except super admin specific ones
	[RoleNames.ADMIN]: [
		// Jobs
		Permissions.JOBS_READ,
		Permissions.JOBS_MODERATE,
		Permissions.JOBS_DELETE,
		Permissions.JOBS_FEATURE,
		// Applications
		Permissions.APPLICATIONS_READ_ALL,
		// Profiles
		Permissions.JOBSEEKER_PROFILE_READ,
		Permissions.EMPLOYER_PROFILE_READ,
		// KYC
		Permissions.KYC_READ_ALL,
		Permissions.KYC_REVIEW,
		Permissions.KYC_APPROVE,
		Permissions.KYC_REJECT,
		// Users
		Permissions.USERS_READ,
		Permissions.USERS_READ_ALL,
		Permissions.USERS_UPDATE,
		Permissions.USERS_ACTIVATE,
		Permissions.USERS_DEACTIVATE,
		// Wallets
		Permissions.WALLET_READ_ALL,
		Permissions.WALLET_CREDIT,
		Permissions.TRANSACTIONS_READ_ALL,
		// Admin
		Permissions.ADMIN_DASHBOARD,
		Permissions.ADMIN_REPORTS,
		// Audit
		Permissions.AUDIT_LOGS_READ,
	],

	// Employer
	[RoleNames.EMPLOYER]: [
		// Jobs
		Permissions.JOBS_CREATE,
		Permissions.JOBS_READ,
		Permissions.JOBS_READ_OWN,
		Permissions.JOBS_UPDATE_OWN,
		Permissions.JOBS_DELETE_OWN,
		// Applications
		Permissions.APPLICATIONS_READ_ALL, // Can read applications to their jobs
		Permissions.APPLICATIONS_UPDATE_STATUS,
		// Profiles
		Permissions.EMPLOYER_PROFILE_CREATE,
		Permissions.EMPLOYER_PROFILE_READ_OWN,
		Permissions.EMPLOYER_PROFILE_UPDATE_OWN,
		Permissions.JOBSEEKER_PROFILE_READ, // Can view jobseeker profiles
		// Resume
		Permissions.RESUME_VIEW,
		Permissions.RESUME_UNLOCK,
		Permissions.RESUME_DOWNLOAD,
		// KYC
		Permissions.KYC_SUBMIT,
		Permissions.KYC_READ_OWN,
		// Wallet
		Permissions.WALLET_READ_OWN,
		Permissions.TRANSACTIONS_READ_OWN,
	],

	// Individual
	[RoleNames.INDIVIDUAL]: [
		// Jobs (read only)
		Permissions.JOBS_READ,
		// Applications
		Permissions.APPLICATIONS_CREATE,
		Permissions.APPLICATIONS_READ_OWN,
		Permissions.APPLICATIONS_WITHDRAW,
		// Profile
		Permissions.JOBSEEKER_PROFILE_CREATE,
		Permissions.JOBSEEKER_PROFILE_READ_OWN,
		Permissions.JOBSEEKER_PROFILE_UPDATE_OWN,
		// KYC
		Permissions.KYC_SUBMIT,
		Permissions.KYC_READ_OWN,
		// Wallet
		Permissions.WALLET_READ_OWN,
		Permissions.TRANSACTIONS_READ_OWN,
	],
};
