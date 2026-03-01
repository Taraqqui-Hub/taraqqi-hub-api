
/**
 * Fix Employer User Roles
 * Assigns the correct role to employer users who don't have any roles assigned.
 * This fixes the permission issue where employers can't access KYC or profile endpoints.
 */

import "./src/config/loadEnv.ts";
import { db } from "./src/config/database.ts";
import { users, userRoles, roles } from "./src/db/index.ts";
import { eq, and } from "drizzle-orm";
import { assignRoleToUser } from "./src/services/permissionService.ts";
import { RoleNames } from "./src/config/permissions.ts";

async function fixUserRoles() {
    console.log("🔧 Fixing user role assignments...\n");

    // Get all employer users
    const employers = await db
        .select({ id: users.id, email: users.email, userType: users.userType })
        .from(users)
        .where(eq(users.userType, "employer"));

    // Get all individual users
    const individuals = await db
        .select({ id: users.id, email: users.email, userType: users.userType })
        .from(users)
        .where(eq(users.userType, "individual"));

    const allUsers = [...employers, ...individuals];
    
    console.log(`Found ${employers.length} employer(s) and ${individuals.length} individual(s)\n`);

    let fixed = 0;
    let alreadyOk = 0;

    for (const user of allUsers) {
        // Check if user already has a role assigned
        const existingRoles = await db
            .select({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(eq(userRoles.userId, user.id));

        if (existingRoles.length > 0) {
            console.log(`✅ ${user.email} (${user.userType}) - already has ${existingRoles.length} role(s), skipping`);
            alreadyOk++;
            continue;
        }

        // Assign the correct role based on userType
        const roleName = user.userType === "employer" ? RoleNames.EMPLOYER : RoleNames.INDIVIDUAL;
        
        try {
            await assignRoleToUser(user.id, roleName);
            console.log(`🔧 Fixed: ${user.email} (${user.userType}) → assigned role: ${roleName}`);
            fixed++;
        } catch (err) {
            console.error(`❌ Failed to assign role for ${user.email}:`, err);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   - Fixed: ${fixed} users`);
    console.log(`   - Already OK: ${alreadyOk} users`);
    console.log(`   - Total processed: ${allUsers.length} users`);

    if (fixed > 0) {
        console.log(`\n✅ Done! The affected users should now have the correct permissions.`);
        console.log(`   If the API server is running, restart it to clear the permission cache.`);
    } else {
        console.log(`\n✅ All users already had roles assigned. No changes needed.`);
    }

    process.exit(0);
}

fixUserRoles().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
