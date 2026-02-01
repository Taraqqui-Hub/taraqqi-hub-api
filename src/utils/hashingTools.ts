import bcrypt from "@node-rs/bcrypt";

const saltRounds = +(process.env.HASHING_SALT_ROUNDS || "10");

export const hashPassword = async (password: string): Promise<string> => {
	const passwordHash = await bcrypt.hash(password, saltRounds);
	return passwordHash;
};

export const verifyPassword = async (
	password: string,
	hashedPassword: string
): Promise<boolean> => {
	const isCorrect = await bcrypt.compare(password, hashedPassword);
	return isCorrect;
};
