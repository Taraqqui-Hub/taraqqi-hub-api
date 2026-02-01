import {
	bigint,
	bigserial,
	date,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Gender enum
export enum Genders {
	MALE = "male",
	FEMALE = "female",
	OTHER = "other",
}

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

/**
 * USER_PROFILE
 * ------------
 * Unified personal profile for ALL users (individuals and employers).
 * Contains personal info, location, and language preferences.
 */
export const userProfiles = pgTable(
	"user_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Personal Info
		fullName: text("full_name").notNull(),
		dateOfBirth: date("date_of_birth", { mode: "date" }),
		gender: genderEnum("gender"),
		nationality: text("nationality").default("Indian"),

		// Location
		currentCity: text("current_city"),
		district: text("district"),
		state: text("state"),
		pincode: text("pincode"),

		// Language
		motherTongue: text("mother_tongue"),
		languagesKnown: text("languages_known").array(),

		// Photo
		profilePhotoUrl: text("profile_photo_url"),

		// Timestamps
		profileLastUpdatedAt: timestamp("profile_last_updated_at", { mode: "date" }),
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		userIdIdx: index("idx_user_profiles_user_id").on(table.userId),
		cityIdx: index("idx_user_profiles_city").on(table.currentCity),
		stateIdx: index("idx_user_profiles_state").on(table.state),
		deletedAtIdx: index("idx_user_profiles_deleted_at").on(table.deletedAt),
	})
);

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
