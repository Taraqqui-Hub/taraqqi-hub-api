#!/usr/bin/env node

/**
 * Helper script to create a superadmin user
 * Usage: node create-superadmin.js
 */

import bcrypt from "bcrypt";
import { db } from "./src/config/database.ts";
import { users, UserTypes } from "./src/db/index.ts";
import readline from "readline";

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function question(query: string): Promise<string> {
	return new Promise((resolve) => rl.question(query, resolve));
}

async function createSuperAdmin() {
	console.log("=== Create Super Admin ===\n");

	const email = await question("Enter email: ");
	if (!email || !email.includes("@")) {
		console.error("Invalid email address");
		process.exit(1);
	}

	const name = await question("Enter name (optional): ");
	
	const password = await question("Enter password (min 8 chars): ");
	if (!password || password.length < 8) {
		console.error("Password must be at least 8 characters");
		process.exit(1);
	}

	const confirmPassword = await question("Confirm password: ");
	if (password !== confirmPassword) {
		console.error("Passwords do not match");
		process.exit(1);
	}

	rl.close();

	console.log("\nCreating super admin...");

	try {
		// Check if email exists
		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existing.length > 0) {
			console.error(`Error: User with email ${email} already exists`);
			process.exit(1);
		}

		// Hash password
		const passwordHash = await bcrypt.hash(password, 12);

		// Create super admin
		const [newSuperAdmin] = await db
			.insert(users)
			.values({
				email,
				name: name || null,
				passwordHash,
				userType: UserTypes.SUPER_ADMIN,
				emailVerified: true,
				verificationStatus: "verified",
				isActive: true,
			})
			.returning({
				id: users.id,
				email: users.email,
				name: users.name,
				userType: users.userType,
			});

		console.log("\n✅ Super admin created successfully!");
		console.log("Email:", newSuperAdmin.email);
		console.log("Name:", newSuperAdmin.name || "(none)");
		console.log("User Type:", newSuperAdmin.userType);
		console.log("\nYou can now log in to the admin panel with these credentials.");
		
		process.exit(0);
	} catch (error) {
		console.error("Error creating super admin:", error);
		process.exit(1);
	}
}

// Import eq after db imports
import { eq } from "drizzle-orm";

createSuperAdmin();
