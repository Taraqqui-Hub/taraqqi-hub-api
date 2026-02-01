/**
 * E2E Test: Authentication Flow
 */

import { describe, it, expect, beforeAll } from "vitest";
import { apiRequest, fixtures, setAuthToken, clearAuthToken } from "./setup";

describe("Authentication Flow", () => {
	beforeAll(() => {
		clearAuthToken();
	});

	describe("Jobseeker Registration", () => {
		it("should request OTP", async () => {
			const response = await apiRequest("POST", "/auth/otp/send", {
				phone: fixtures.jobseeker.phone,
			});
			expect(response.status).toBe(200);
		});

		it("should verify OTP and register", async () => {
			// Note: In test environment, use static OTP or mock
			const response = await apiRequest("POST", "/auth/verify-otp", {
				phone: fixtures.jobseeker.phone,
				otp: "123456", // Test OTP
				userType: "jobseeker",
			});
			expect(response.ok).toBe(true);
			expect(response.data.token).toBeDefined();
			setAuthToken(response.data.token);
		});

		it("should access protected route with token", async () => {
			const response = await apiRequest("GET", "/auth/me");
			expect(response.status).toBe(200);
			expect(response.data.user.phone).toBe(fixtures.jobseeker.phone);
		});
	});

	describe("Employer Registration", () => {
		beforeAll(() => {
			clearAuthToken();
		});

		it("should register employer", async () => {
			const response = await apiRequest("POST", "/auth/verify-otp", {
				phone: fixtures.employer.phone,
				otp: "123456",
				userType: "employer",
			});
			expect(response.ok).toBe(true);
			setAuthToken(response.data.token);
		});

		it("should access employer dashboard", async () => {
			const response = await apiRequest("GET", "/auth/me");
			expect(response.data.user.userType).toBe("employer");
		});
	});

	describe("Access Control", () => {
		it("should reject unauthenticated requests", async () => {
			clearAuthToken();
			const response = await apiRequest("GET", "/auth/me");
			expect(response.status).toBe(401);
		});
	});
});
