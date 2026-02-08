// ============================================
// Core Tables
// ============================================

// Users
export {
	users,
	userTypesEnum,
	UserTypes,
	verificationStatusEnum,
	VerificationStatuses,
} from "./schema/users.ts";
export type { User, NewUser } from "./schema/users.ts";

// Roles
export { roles } from "./schema/roles.ts";
export type { Role, NewRole } from "./schema/roles.ts";

// Permissions
export { permissions } from "./schema/permissions.ts";
export type { Permission, NewPermission } from "./schema/permissions.ts";

// Role Permissions
export { rolePermissions } from "./schema/rolePermissions.ts";
export type {
	RolePermission,
	NewRolePermission,
} from "./schema/rolePermissions.ts";

// User Roles
export { userRoles } from "./schema/userRoles.ts";
export type { UserRole, NewUserRole } from "./schema/userRoles.ts";

// ============================================
// Auth Tables
// ============================================

// OTP Tokens (legacy - to be removed)
export { otpTokens, otpPurposeEnum, OtpPurposes } from "./schema/otpTokens.ts";
export type { OtpToken, NewOtpToken } from "./schema/otpTokens.ts";

// Refresh Tokens
export { refreshTokens } from "./schema/refreshTokens.ts";
export type { RefreshToken, NewRefreshToken } from "./schema/refreshTokens.ts";

// Login Attempts (rate limiting)
export { loginAttempts } from "./schema/loginAttempts.ts";
export type { LoginAttempt, NewLoginAttempt } from "./schema/loginAttempts.ts";

// Legacy verification codes (can be removed after migration to OTP)
export { userEmailVerificationCodes } from "./schema/userEmailVerificationCodes.ts";
export type {
	UserEmailVerificationCode,
	NewUserEmailVerificationCode,
} from "./schema/userEmailVerificationCodes.ts";

export { userResetPasswordCodes } from "./schema/userResetPasswordCodes.ts";
export type {
	UserResetPasswordCode,
	NewUserResetPasswordCode,
} from "./schema/userResetPasswordCodes.ts";

// ============================================
// User Intent & Preferences (NEW)
// ============================================

// User Preferences (Intent Modeling)
export { userPreferences } from "./schema/userPreferences.ts";
export type { UserPreference, NewUserPreference } from "./schema/userPreferences.ts";

// User Consents (Legal Protection)
export {
	userConsents,
	consentTypeEnum,
	ConsentTypes,
} from "./schema/userConsents.ts";
export type { UserConsent, NewUserConsent } from "./schema/userConsents.ts";

// ============================================
// Profile Tables
// ============================================

// User Profiles (Unified Personal Profile - NEW)
export {
	userProfiles,
	genderEnum,
	Genders,
} from "./schema/userProfiles.ts";
export type { UserProfile, NewUserProfile } from "./schema/userProfiles.ts";

// Jobseeker Profiles (DEPRECATED - kept for backward compatibility)
export {
	jobseekerProfiles,
	// genderEnum, Genders - now exported from userProfiles
} from "./schema/jobseekerProfiles.ts";
export type {
	JobseekerProfile,
	NewJobseekerProfile,
} from "./schema/jobseekerProfiles.ts";

// Employer Profiles (DEPRECATED - use companyProfiles + companyContacts)
export {
	employerProfiles,
	companyTypeEnum,
	CompanyTypes,
	companySizeEnum,
	CompanySizes,
} from "./schema/employerProfiles.ts";
export type {
	EmployerProfile,
	NewEmployerProfile,
} from "./schema/employerProfiles.ts";

// Company Profiles (NEW - split from employerProfiles)
export { companyProfiles } from "./schema/companyProfiles.ts";
export type { CompanyProfile, NewCompanyProfile } from "./schema/companyProfiles.ts";

// Company Contacts (NEW - split from employerProfiles)
export { companyContacts } from "./schema/companyContacts.ts";
export type { CompanyContact, NewCompanyContact } from "./schema/companyContacts.ts";

// ============================================
// Education & Experience (NEW)
// ============================================

// Education Records
export {
	educationRecords,
	educationLevelEnum,
	EducationLevels,
} from "./schema/educationRecords.ts";
export type { EducationRecord, NewEducationRecord } from "./schema/educationRecords.ts";

// Experience Records
export { experienceRecords } from "./schema/experienceRecords.ts";
export type { ExperienceRecord, NewExperienceRecord } from "./schema/experienceRecords.ts";

// ============================================
// Skills & Interests (NEW)
// ============================================

// Skills
export {
	skills,
	proficiencyLevelEnum,
	ProficiencyLevels,
} from "./schema/skills.ts";
export type { Skill, NewSkill } from "./schema/skills.ts";

// Interests
export {
	interests,
	interestTypeEnum,
	InterestTypes,
} from "./schema/interests.ts";
export type { Interest, NewInterest } from "./schema/interests.ts";

// ============================================
// Optional Profile Extensions (NEW)
// ============================================

// Socio-Economic Profiles
export { socioEconomicProfiles } from "./schema/socioEconomicProfiles.ts";
export type {
	SocioEconomicProfile,
	NewSocioEconomicProfile,
} from "./schema/socioEconomicProfiles.ts";

// Community Profiles (Consent-Gated)
export { communityProfiles } from "./schema/communityProfiles.ts";
export type {
	CommunityProfile,
	NewCommunityProfile,
} from "./schema/communityProfiles.ts";

// Family Profiles (DB Ready, Frontend Hidden)
export { familyProfiles } from "./schema/familyProfiles.ts";
export type { FamilyProfile, NewFamilyProfile } from "./schema/familyProfiles.ts";

// ============================================
// Business Tables
// ============================================

// Jobs
export {
	jobs,
	jobStatusEnum,
	JobStatuses,
	jobTypeEnum,
	JobTypes,
	experienceLevelEnum,
	ExperienceLevels,
	locationTypeEnum,
	LocationTypes,
} from "./schema/jobs.ts";
export type { Job, NewJob } from "./schema/jobs.ts";

// Applications
export {
	applications,
	applicationStatusEnum,
	ApplicationStatuses,
} from "./schema/applications.ts";
export type { Application, NewApplication } from "./schema/applications.ts";

// ============================================
// Financial Tables
// ============================================

// KYC Records
export {
	kycRecords,
	kycStatusEnum,
	KycStatuses,
	kycDocumentTypeEnum,
	KycDocumentTypes,
} from "./schema/kycRecords.ts";
export type { KycRecord, NewKycRecord } from "./schema/kycRecords.ts";

// Wallets
export {
	wallets,
	walletStatusEnum,
	WalletStatuses,
} from "./schema/wallets.ts";
export type { Wallet, NewWallet } from "./schema/wallets.ts";

// Transactions
export {
	transactions,
	transactionTypeEnum,
	TransactionTypes,
	transactionStatusEnum,
	TransactionStatuses,
	transactionCategoryEnum,
	TransactionCategories,
} from "./schema/transactions.ts";
export type { Transaction, NewTransaction } from "./schema/transactions.ts";

// Employer Registration Payments (OLX-style one-time onboarding fee)
export {
	employerRegistrationPayments,
	employerPaymentStatusEnum,
} from "./schema/employerRegistrationPayments.ts";
export type {
	EmployerRegistrationPayment,
	NewEmployerRegistrationPayment,
} from "./schema/employerRegistrationPayments.ts";

// ============================================
// System Tables
// ============================================

// Audit Logs
export {
	auditLogs,
	auditActionEnum,
	AuditActions,
} from "./schema/auditLogs.ts";
export type { AuditLog, NewAuditLog } from "./schema/auditLogs.ts";

export { jobViews } from "./schema/jobViews.ts";
export type { JobView, NewJobView } from "./schema/jobViews.ts";

export { savedJobs } from "./schema/savedJobs.ts";
export type { SavedJob, NewSavedJob } from "./schema/savedJobs.ts";
