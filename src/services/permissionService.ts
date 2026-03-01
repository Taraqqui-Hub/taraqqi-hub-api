import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/database.ts";
import {
	users,
	userRoles,
	roles,
	rolePermissions,
	permissions,
} from "../db/index.ts";
import { Permission } from "../config/permissions.ts";

/**
 * Permission cache to avoid repeated DB queries
 * Key: userId (string), Value: { permissions: string[], timestamp: number }
 */
const permissionCache = new Map<
	string,
	{ permissions: string[]; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cache for a specific user
 */
export function clearUserPermissionCache(userId: bigint): void {
	permissionCache.delete(userId.toString());
}

/**
 * Clear entire permission cache
 */
export function clearAllPermissionCache(): void {
	permissionCache.clear();
}

/**
 * Get all permissions for a user
 * Includes caching for performance
 */
export async function getUserPermissions(userId: bigint): Promise<string[]> {
	const cacheKey = userId.toString();
	const cached = permissionCache.get(cacheKey);

	// Return cached if valid
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.permissions;
	}

	// Query permissions from database
	// user -> user_roles -> roles -> role_permissions -> permissions
	const result = await db
		.selectDistinct({ permissionName: permissions.name })
		.from(permissions)
		.innerJoin(
			rolePermissions,
			eq(rolePermissions.permissionId, permissions.id)
		)
		.innerJoin(roles, eq(roles.id, rolePermissions.roleId))
		.innerJoin(userRoles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));

	const userPermissions = result.map((r) => r.permissionName);

	// Cache the result
	permissionCache.set(cacheKey, {
		permissions: userPermissions,
		timestamp: Date.now(),
	});

	return userPermissions;
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
	userId: bigint,
	permission: Permission | string
): Promise<boolean> {
	const userPermissions = await getUserPermissions(userId);
	return userPermissions.includes(permission);
}

/**
 * Check if user has ANY of the specified permissions
 */
export async function hasAnyPermission(
	userId: bigint,
	permissionsToCheck: (Permission | string)[]
): Promise<boolean> {
	const userPermissions = await getUserPermissions(userId);
	return permissionsToCheck.some((p) => userPermissions.includes(p));
}

/**
 * Check if user has ALL of the specified permissions
 */
export async function hasAllPermissions(
	userId: bigint,
	permissionsToCheck: (Permission | string)[]
): Promise<boolean> {
	const userPermissions = await getUserPermissions(userId);
	return permissionsToCheck.every((p) => userPermissions.includes(p));
}

/**
 * Get user's roles
 */
export async function getUserRoles(
	userId: bigint
): Promise<{ id: bigint; name: string }[]> {
	const result = await db
		.select({
			id: roles.id,
			name: roles.name,
		})
		.from(roles)
		.innerJoin(userRoles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));

	return result;
}

/**
 * Assign role to user
 */
export async function assignRoleToUser(
	userId: bigint,
	roleName: string,
	assignedBy?: bigint,
	tx?: any
): Promise<void> {
	// IMPORTANT: Always use the main `db` connection to look up the role, NOT the
	// transaction object. Roles are committed permanent data (seeded once). When
	// using the postgres-js driver, querying through a transaction object for
	// already-committed rows can return empty results inside a fresh transaction,
	// causing "Role not found" errors that silently roll back user creation.
	const [role] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.name, roleName))
		.limit(1);

	if (!role) {
		console.error(`[assignRoleToUser] Role '${roleName}' not found in DB. Run: pnpm run db:seed:rbac`);
		throw new Error(`Role '${roleName}' not found. Please ensure RBAC has been seeded: pnpm run db:seed:rbac`);
	}

	// Use transaction for the insert if one is provided (keeps atomicity with user creation)
	const dbOrTx = tx || db;
	await dbOrTx
		.insert(userRoles)
		.values({
			userId,
			roleId: role.id,
			assignedBy: assignedBy || null,
		})
		.onConflictDoNothing();

	// Clear permission cache for this user
	clearUserPermissionCache(userId);
}

/**
 * Remove role from user
 */
export async function removeRoleFromUser(
	userId: bigint,
	roleName: string
): Promise<void> {
	const [role] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.name, roleName))
		.limit(1);

	if (!role) {
		throw new Error(`Role '${roleName}' not found`);
	}

	await db
		.delete(userRoles)
		.where(
			and(
				eq(userRoles.userId, userId),
				eq(userRoles.roleId, role.id)
			)
		);

	// Clear cache
	clearUserPermissionCache(userId);
}

export default {
	getUserPermissions,
	hasPermission,
	hasAnyPermission,
	hasAllPermissions,
	getUserRoles,
	assignRoleToUser,
	removeRoleFromUser,
	clearUserPermissionCache,
	clearAllPermissionCache,
};
