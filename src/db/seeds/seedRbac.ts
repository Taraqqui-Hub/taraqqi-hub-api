/**
 * RBAC Seed Script
 * Seeds roles and permissions to the database
 *
 * Run with: pnpm run db:seed:rbac
 */

import "../../config/loadEnv.ts";
import { db } from "../../config/database.ts";
import { roles, permissions, rolePermissions } from "../index.ts";
import {
	Permissions,
	RoleNames,
	DefaultRolePermissions,
	Permission,
	RoleName,
} from "../../config/permissions.ts";
import { eq } from "drizzle-orm";

async function seedRbac() {
	console.log("🌱 Starting RBAC seed...\n");

	try {
		// 1. Seed Permissions
		console.log("📝 Seeding permissions...");
		const permissionValues = Object.values(Permissions) as string[];

		for (const permName of permissionValues) {
			const [resource, action] = permName.split(":");
			await db
				.insert(permissions)
				.values({
					name: permName,
					resource,
					action,
					description: `Permission to ${action.replace(/_/g, " ")} ${resource.replace(/_/g, " ")}`,
				})
				.onConflictDoNothing();
		}
		console.log(`   ✅ ${permissionValues.length} permissions seeded\n`);

		// 2. Seed Roles
		console.log("👥 Seeding roles...");
		const roleValues = Object.values(RoleNames) as string[];

		for (const roleName of roleValues) {
			await db
				.insert(roles)
				.values({
					name: roleName,
					description: `${roleName.replace(/_/g, " ").toUpperCase()} role`,
					isSystem: true, // Mark as system role (can't be deleted)
				})
				.onConflictDoNothing();
		}
		console.log(`   ✅ ${roleValues.length} roles seeded\n`);

		// 3. Seed Role-Permission mappings
		console.log("🔗 Seeding role-permission mappings...");

		const roleEntries = Object.entries(DefaultRolePermissions) as [
			RoleName,
			Permission[]
		][];

		for (const [roleName, perms] of roleEntries) {
			// Get role ID
			const [role] = await db
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.name, roleName))
				.limit(1);

			if (!role) {
				console.log(`   ⚠️ Role ${roleName} not found, skipping...`);
				continue;
			}

			// Get permission IDs and create mappings
			for (const permName of perms) {
				const [perm] = await db
					.select({ id: permissions.id })
					.from(permissions)
					.where(eq(permissions.name, permName))
					.limit(1);

				if (!perm) {
					console.log(`   ⚠️ Permission ${permName} not found, skipping...`);
					continue;
				}

				await db
					.insert(rolePermissions)
					.values({
						roleId: role.id,
						permissionId: perm.id,
					})
					.onConflictDoNothing();
			}

			console.log(`   ✅ ${roleName}: ${perms.length} permissions mapped`);
		}

		console.log("\n🎉 RBAC seed completed successfully!\n");

		// Print summary
		console.log("📊 Summary:");
		const permCount = await db.select().from(permissions);
		const roleCount = await db.select().from(roles);
		const mappingCount = await db.select().from(rolePermissions);

		console.log(`   - Permissions: ${permCount.length}`);
		console.log(`   - Roles: ${roleCount.length}`);
		console.log(`   - Role-Permission mappings: ${mappingCount.length}`);
		console.log("");

		process.exit(0);
	} catch (error) {
		console.error("❌ RBAC seed failed:", error);
		process.exit(1);
	}
}

seedRbac();
