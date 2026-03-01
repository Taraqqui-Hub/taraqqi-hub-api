/**
 * Cloudinary Service
 * Generates signed upload URLs for direct client-side uploads
 */

import crypto from "crypto";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

// ============================================
// Upload Type Configurations
// ============================================

export const UploadTypes = {
	RESUME: "resume",
	KYC_DOCUMENT: "kyc_document",
	PROFILE_PHOTO: "profile_photo",
	COMPANY_LOGO: "company_logo",
} as const;

export type UploadType = (typeof UploadTypes)[keyof typeof UploadTypes];

interface UploadConfig {
	folder: string;
	resourceType: "image" | "raw" | "auto";
	allowedFormats: string[];
	maxFileSizeBytes: number;
	isPrivate: boolean;
	tags: string[];
}

const uploadConfigs: Record<UploadType, UploadConfig> = {
	[UploadTypes.RESUME]: {
		folder: "equalio/resumes",
		resourceType: "raw",
		allowedFormats: ["pdf", "doc", "docx"],
		maxFileSizeBytes: 5 * 1024 * 1024,
		isPrivate: true,
		tags: ["resume", "sensitive"],
	},
	[UploadTypes.KYC_DOCUMENT]: {
		folder: "equalio/kyc",
		resourceType: "auto",
		allowedFormats: ["pdf", "jpg", "jpeg", "png"],
		maxFileSizeBytes: 10 * 1024 * 1024,
		isPrivate: true,
		tags: ["kyc", "sensitive", "pii"],
	},
	[UploadTypes.PROFILE_PHOTO]: {
		folder: "equalio/profile-photos",
		resourceType: "image",
		allowedFormats: ["jpg", "jpeg", "png", "webp"],
		maxFileSizeBytes: 2 * 1024 * 1024,
		isPrivate: false,
		tags: ["profile-photo"],
	},
	[UploadTypes.COMPANY_LOGO]: {
		folder: "equalio/company-logos",
		resourceType: "image",
		allowedFormats: ["jpg", "jpeg", "png", "svg", "webp"],
		maxFileSizeBytes: 1 * 1024 * 1024,
		isPrivate: false,
		tags: ["company-logo"],
	},
};

// ============================================
// Types
// ============================================

export interface SignedUploadParams {
	signature: string;
	timestamp: number;
	cloudName: string;
	apiKey: string;
	folder: string;
	resourceType: string;
	allowedFormats: string[];
	maxFileSizeBytes: number;
	tags: string;
	publicId: string;
}

// ============================================
// Sign Upload Params
// ============================================

export function signUploadParams(
	uploadType: UploadType,
	userId: bigint
): SignedUploadParams {
	const config = uploadConfigs[uploadType];
	if (!config) {
		throw new Error(`Invalid upload type: ${uploadType}`);
	}

	const timestamp = Math.round(Date.now() / 1000);
	const publicId = `${userId}_${timestamp}_${crypto.randomBytes(4).toString("hex")}`;
	const tags = [...config.tags, `user_${userId}`].join(",");

	// Build params to sign
	const paramsToSign: Record<string, string | number> = {
		folder: config.folder,
		timestamp,
		public_id: publicId,
		tags,
	};

	if (config.allowedFormats.length > 0) {
		paramsToSign.allowed_formats = config.allowedFormats.join(",");
	}

	// Sort params alphabetically and create string
	const sortedParams = Object.keys(paramsToSign)
		.sort()
		.map((key) => `${key}=${paramsToSign[key]}`)
		.join("&");

	// Generate signature
	const signature = crypto
		.createHash("sha1")
		.update(sortedParams + CLOUDINARY_API_SECRET)
		.digest("hex");

	return {
		signature,
		timestamp,
		cloudName: CLOUDINARY_CLOUD_NAME,
		apiKey: CLOUDINARY_API_KEY,
		folder: config.folder,
		resourceType: config.resourceType,
		allowedFormats: config.allowedFormats,
		maxFileSizeBytes: config.maxFileSizeBytes,
		tags,
		publicId,
	};
}

// ============================================
// Validate Cloudinary URL
// ============================================

export interface ValidateUrlResult {
	valid: boolean;
	error?: string;
	publicId?: string;
	format?: string;
}

export function validateCloudinaryUrl(
	url: string,
	uploadType: UploadType
): ValidateUrlResult {
	const config = uploadConfigs[uploadType];
	if (!config) {
		return { valid: false, error: "Invalid upload type" };
	}

	// Check if URL is from our Cloudinary
	const validPrefixes = [
		`https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`,
		`http://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`,
	];

	const isValidOrigin = validPrefixes.some((prefix) => url.startsWith(prefix));
	if (!isValidOrigin) {
		return { valid: false, error: "URL not from authorized Cloudinary account" };
	}

	// Check folder is in URL
	if (!url.includes(`/${config.folder}/`)) {
		return { valid: false, error: "File not in expected folder" };
	}

	// Extract format from URL
	const urlParts = url.split("/");
	const filename = urlParts[urlParts.length - 1];
	const format = filename.split(".").pop()?.toLowerCase();

	if (format && !config.allowedFormats.includes(format)) {
		return {
			valid: false,
			error: `Invalid format: ${format}. Allowed: ${config.allowedFormats.join(", ")}`,
		};
	}

	return {
		valid: true,
		publicId: filename.split(".")[0],
		format,
	};
}

// ============================================
// Get Upload Config
// ============================================

export function getUploadConfig(uploadType: UploadType) {
	const config = uploadConfigs[uploadType];
	if (!config) {
		throw new Error(`Invalid upload type: ${uploadType}`);
	}

	return {
		allowedFormats: config.allowedFormats,
		maxFileSizeBytes: config.maxFileSizeBytes,
		maxFileSizeMB: config.maxFileSizeBytes / (1024 * 1024),
	};
}

// ============================================
// Validate Upload Signature (webhook)
// ============================================

export function validateUploadSignature(
	publicId: string,
	version: string,
	signature: string
): boolean {
	const expectedSignature = crypto
		.createHash("sha1")
		.update(`public_id=${publicId}&version=${version}${CLOUDINARY_API_SECRET}`)
		.digest("hex");

	return signature === expectedSignature;
}

// ============================================
// Legacy functions (for backwards compatibility)
// ============================================

export function generateResumeUploadParams(userId: bigint): SignedUploadParams {
	return signUploadParams(UploadTypes.RESUME, userId);
}

export function generateProfilePhotoUploadParams(userId: bigint): SignedUploadParams {
	return signUploadParams(UploadTypes.PROFILE_PHOTO, userId);
}

export function generateKycDocumentUploadParams(userId: bigint): SignedUploadParams {
	return signUploadParams(UploadTypes.KYC_DOCUMENT, userId);
}

export default {
	signUploadParams,
	validateCloudinaryUrl,
	getUploadConfig,
	validateUploadSignature,
	generateResumeUploadParams,
	generateProfilePhotoUploadParams,
	generateKycDocumentUploadParams,
	UploadTypes,
};
