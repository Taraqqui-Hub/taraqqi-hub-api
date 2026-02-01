import {
	bigint,
	bigserial,
	boolean,
	date,
	decimal,
	index,
	integer,
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

export const jobseekerProfiles = pgTable(
	"jobseeker_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Personal
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		dateOfBirth: date("date_of_birth", { mode: "date" }),
		gender: genderEnum("gender"),

		// Contact
		address: text("address"),
		city: text("city"),
		state: text("state"),
		country: text("country").default("India"),
		pincode: text("pincode"),

		// Professional
		headline: text("headline"),
		summary: text("summary"),
		skills: text("skills").array(),
		experienceYears: integer("experience_years"),
		currentSalary: decimal("current_salary", { precision: 12, scale: 2 }),
		expectedSalary: decimal("expected_salary", { precision: 12, scale: 2 }),

		// Documents (Cloudinary URLs)
		resumeUrl: text("resume_url"),
		profilePhotoUrl: text("profile_photo_url"),

		// Preferences
		jobTypes: text("job_types").array(),
		preferredLocations: text("preferred_locations").array(),
		isOpenToWork: boolean("is_open_to_work").notNull().default(true),

		// Completeness
		profileCompletion: integer("profile_completion").notNull().default(0),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		userIdIdx: index("idx_jobseeker_profiles_user_id").on(table.userId),
		cityIdx: index("idx_jobseeker_profiles_city").on(table.city),
		isOpenToWorkIdx: index("idx_jobseeker_profiles_is_open_to_work").on(
			table.isOpenToWork
		),
		deletedAtIdx: index("idx_jobseeker_profiles_deleted_at").on(table.deletedAt),
	})
);

export type JobseekerProfile = typeof jobseekerProfiles.$inferSelect;
export type NewJobseekerProfile = typeof jobseekerProfiles.$inferInsert;
