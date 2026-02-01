/**
 * E2E Test Setup
 * End-to-end test helpers and fixtures
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ============================================
// Test Configuration
// ============================================

export const testConfig = {
	apiUrl: process.env.TEST_API_URL || "http://localhost:3001",
	timeout: 30000,
};

// ============================================
// Test User Fixtures
// ============================================

export const fixtures = {
	jobseeker: {
		phone: "+919999999901",
		email: "jobseeker@test.com",
		password: "Test@123",
		name: "Test Jobseeker",
	},
	employer: {
		phone: "+919999999902",
		email: "employer@test.com",
		password: "Test@123",
		companyName: "Test Company",
	},
	admin: {
		phone: "+919999999903",
		email: "admin@test.com",
		password: "Admin@123",
	},
};

// ============================================
// API Helper
// ============================================

let authToken: string | null = null;

export async function apiRequest(
	method: string,
	path: string,
	body?: any,
	token?: string
) {
	const response = await fetch(`${testConfig.apiUrl}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(token || authToken ? { Authorization: `Bearer ${token || authToken}` } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	const data = await response.json().catch(() => ({}));

	return {
		status: response.status,
		ok: response.ok,
		data,
	};
}

export function setAuthToken(token: string) {
	authToken = token;
}

export function clearAuthToken() {
	authToken = null;
}

// ============================================
// Test Suites
// ============================================

export const TestSuites = {
	AUTH: "Authentication Flow",
	KYC: "KYC Verification Flow",
	JOBS: "Job Posting Flow",
	APPLICATIONS: "Application Flow",
	WALLET: "Wallet & Payments Flow",
	ADMIN: "Admin Operations Flow",
};
