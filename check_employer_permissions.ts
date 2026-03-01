
import "./src/config/loadEnv.ts";
import { db } from "./src/config/database.ts";
import { users, userRoles, roles, rolePermissions, permissions } from "./src/db/index.ts";
import { eq, and } from "drizzle-orm";
import { getUserPermissions } from "./src/services/permissionService.ts";

async function checkEmployers() {
    console.log("🔍 Checking employer users and their permissions...\n");

    // Find all employer users
    const employers = await db
        .select({ id: users.id, email: users.email, userType: users.userType, verificationStatus: users.verificationStatus })
        .from(users)
        .where(eq(users.userType, "employer"));

    if (employers.length === 0) {
        console.log("❌ No employer users found in DB");
        process.exit(0);
    }

    console.log(`Found ${employers.length} employer user(s):\n`);

    for (const employer of employers) {
        console.log(`👤 User: ${employer.email} (ID: ${employer.id}) - Status: ${employer.verificationStatus}`);
        
        // Check their assigned roles
        const assignedRoles = await db
            .select({ roleName: roles.name, roleId: roles.id })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(eq(userRoles.userId, employer.id));
        
        console.log(`   Roles: ${assignedRoles.length > 0 ? assignedRoles.map(r => r.roleName).join(", ") : "❌ NO ROLES ASSIGNED!"}`);
        
        if (assignedRoles.length === 0) {
            console.log(`   ⚠️  This user has no roles. This is the cause of the permission issue!`);
        }

        // Get full permissions
        const perms = await getUserPermissions(employer.id);
        console.log(`   Permissions (${perms.length}): ${perms.length > 0 ? perms.join(", ") : "❌ NONE"}`);
        
        const hasKycReadOwn = perms.includes("kyc:read_own");
        const hasEmployerProfileReadOwn = perms.includes("employer_profile:read_own");
        console.log(`   ✅ kyc:read_own: ${hasKycReadOwn}`);
        console.log(`   ✅ employer_profile:read_own: ${hasEmployerProfileReadOwn}`);
        console.log();
    }

    // Check role-permission mappings for the employer role
    console.log("📋 Checking employer role-permission mappings in DB...\n");
    const [employerRole] = await db
        .select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(eq(roles.name, "employer"))
        .limit(1);
    
    if (!employerRole) {
        console.log("❌ Employer role not found in DB! Run: pnpm run db:seed:rbac");
        process.exit(1);
    }

    const employerRolePerms = await db
        .select({ permName: permissions.name })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, employerRole.id));

    console.log(`Employer role has ${employerRolePerms.length} permissions:`);
    employerRolePerms.forEach(p => console.log(`  - ${p.permName}`));

    const hasKycReadOwnMapping = employerRolePerms.some(p => p.permName === "kyc:read_own");
    const hasEmployerProfileReadOwnMapping = employerRolePerms.some(p => p.permName === "employer_profile:read_own");
    
    console.log(`\n  kyc:read_own mapping exists: ${hasKycReadOwnMapping ? "✅" : "❌ MISSING - run pnpm run db:seed:rbac"}`);
    console.log(`  employer_profile:read_own mapping exists: ${hasEmployerProfileReadOwnMapping ? "✅" : "❌ MISSING - run pnpm run db:seed:rbac"}`);

    process.exit(0);
}

checkEmployers().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
