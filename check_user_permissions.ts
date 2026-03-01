
import "./src/config/loadEnv.ts";
import { db } from "./src/config/database.ts";
import { users } from "./src/db/index.ts";
import { eq } from "drizzle-orm";
import { getUserPermissions } from "./src/services/permissionService.ts";

async function checkUser(email: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (!user) {
        console.log("User not found");
        return;
    }

    console.log("User found:", user);
    
    const permissions = await getUserPermissions(user.id);
    console.log("Permissions:", permissions);
    
    const hasKycReadOwn = permissions.includes("kyc:read_own");
    console.log("Has kyc:read_own:", hasKycReadOwn);

    process.exit(0);
}

checkUser("mohdrehanrq0@gmail.com");
