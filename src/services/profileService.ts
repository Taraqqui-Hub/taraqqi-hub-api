import { db } from "../config/database.ts";
import { count, eq } from "drizzle-orm";
import {
	userProfiles,
	jobseekerProfiles,
	socioEconomicProfiles,
	familyProfiles,
	communityProfiles,
	educationRecords,
	experienceRecords,
	skills,
	interests,
} from "../db/index.ts";

function getLevelName(level: number): string {
	switch (level) {
		case 1:
			return "Newcomer";
		case 2:
			return "Explorer";
		case 3:
			return "Rising Star";
		case 4:
			return "Champion";
		case 5:
			return "Legend";
		default:
			return "Newcomer";
	}
}

export const calculateProfileStatus = async (userId: bigint) => {
	// Fetch all profile data in parallel
	const [
		userProfile,
		jobseekerProfile,
		socioEconomic,
		family,
		community,
		educationCount,
		experienceCount,
		skillsCount,
		interestsCount,
	] = await Promise.all([
		db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.userId, userId))
			.limit(1),
		db
			.select()
			.from(jobseekerProfiles)
			.where(eq(jobseekerProfiles.userId, userId))
			.limit(1),
		db
			.select()
			.from(socioEconomicProfiles)
			.where(eq(socioEconomicProfiles.userId, userId))
			.limit(1),
		db
			.select()
			.from(familyProfiles)
			.where(eq(familyProfiles.userId, userId))
			.limit(1),
		db
			.select()
			.from(communityProfiles)
			.where(eq(communityProfiles.userId, userId))
			.limit(1),
		db
			.select({ count: count() })
			.from(educationRecords)
			.where(eq(educationRecords.userId, userId)),
		db
			.select({ count: count() })
			.from(experienceRecords)
			.where(eq(experienceRecords.userId, userId)),
		db
			.select({ count: count() })
			.from(skills)
			.where(eq(skills.userId, userId)),
		db
			.select({ count: count() })
			.from(interests)
			.where(eq(interests.userId, userId)),
	]);

	const up = userProfile[0];
	const jp = jobseekerProfile[0];
	const sep = socioEconomic[0];
	const fp = family[0];
	const cp = community[0];

	// Calculate section completion
	const sections = {
		personal: {
			completed:
				!!(up?.fullName || (jp?.firstName && jp?.lastName)) &&
				!!(up?.dateOfBirth || jp?.dateOfBirth) &&
				!!(up?.gender || jp?.gender),
			xp: 20,
			fields: {
				fullName: !!(up?.fullName || (jp?.firstName && jp?.lastName)),
				dateOfBirth: !!(up?.dateOfBirth || jp?.dateOfBirth),
				gender: !!(up?.gender || jp?.gender),
				profilePhoto: !!(up?.profilePhotoUrl || jp?.profilePhotoUrl),
				languages: !!(up?.languagesKnown && up.languagesKnown.length > 0),
			},
		},
		address: {
			completed: !!(up?.currentCity || jp?.city) && !!(up?.state || jp?.state),
			xp: 15,
			fields: {
				city: !!(up?.currentCity || jp?.city),
				state: !!(up?.state || jp?.state),
				pincode: !!(up?.pincode || jp?.pincode),
			},
		},
		education: {
			completed:
				(educationCount[0]?.count || 0) >= 1 ||
				up?.hasNoFormalEducation === true,
			xp: 25,
			count: educationCount[0]?.count || 0,
			hasNoFormalEducation: up?.hasNoFormalEducation || false,
		},
		skills: {
			completed: (skillsCount[0]?.count || 0) >= 3,
			xp: 20,
			count: skillsCount[0]?.count || 0,
		},
		experience: {
			completed:
				(experienceCount[0]?.count || 0) >= 1 || jp?.experienceYears === 0,
			xp: 25,
			count: experienceCount[0]?.count || 0,
		},
		// Optional/Bonus sections
		family: {
			completed: !!(fp?.fatherName || fp?.motherName),
			xp: 10,
			optional: true,
			fields: fp || null,
		},
		socioEconomic: {
			completed: !!(sep?.familyIncomeRange || sep?.housingType),
			xp: 10,
			optional: true,
			fields: sep || null,
		},
		community: {
			completed: !!cp,
			xp: 10,
			optional: true,
			consentRequired: true,
			fields: cp || null,
		},
		interests: {
			completed: (interestsCount[0]?.count || 0) >= 1,
			xp: 10,
			optional: true,
			count: interestsCount[0]?.count || 0,
		},
	};

	// Calculate totals
	const requiredSections = [
		"personal",
		"address",
		"education",
		"skills",
		"experience",
	];
	// const optionalSections = ['family', 'socioEconomic', 'community', 'interests'];

	let earnedXP = 0;
	let maxXP = 0;
	let completedRequired = 0;

	for (const [key, section] of Object.entries(sections)) {
		maxXP += section.xp;
		if (section.completed) {
			earnedXP += section.xp;
			if (requiredSections.includes(key)) {
				completedRequired++;
			}
		}
	}

	const completionPercentage = Math.round((earnedXP / maxXP) * 100);
	const level =
		earnedXP >= 100
			? 5
			: earnedXP >= 75
			? 4
			: earnedXP >= 50
			? 3
			: earnedXP >= 25
			? 2
			: 1;

	return {
		sections,
		summary: {
			earnedXP,
			maxXP,
			completionPercentage,
			level,
			levelName: getLevelName(level),
			completedRequired,
			totalRequired: requiredSections.length,
			isProfileComplete: completedRequired === requiredSections.length,
		},
		profiles: {
			userProfile: up || null,
			jobseekerProfile: jp || null,
			socioEconomicProfile: sep || null,
			familyProfile: fp || null,
			communityProfile: cp || null,
		},
	};
};

export const updateProfileCompletion = async (userId: bigint) => {
	const status = await calculateProfileStatus(userId);
	const completion = status.summary.completionPercentage;
	const level = status.summary.level;

	// Update jobseeker profile with completion status
	// First check if profile exists, if not create it (safe fallback)
	const [existing] = await db
		.select()
		.from(jobseekerProfiles)
		.where(eq(jobseekerProfiles.userId, userId))
		.limit(1);

	if (existing) {
		await db
			.update(jobseekerProfiles)
			.set({
				profileCompletion: completion,
				updatedAt: new Date(),
			})
			.where(eq(jobseekerProfiles.userId, userId));
	} else {
		// This should generally not happen as personal info step creates it,
		// but if it does, we create a basic profile
		const [up] = await db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.userId, userId))
			.limit(1);

		const names = (up?.fullName || "").trim().split(" ");
		const firstName = names[0] || "";
		const lastName = names.slice(1).join(" ") || "";

		await db.insert(jobseekerProfiles).values({
			userId,
			firstName,
			lastName,
			profileCompletion: completion,
			// Other fields null
		});
	}

	return status;
};
