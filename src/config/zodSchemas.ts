import z from "zod";

export const getBooleanValidationSchema = (valueName: string) =>
	z.boolean({
		coerce: true,
		required_error: `${valueName} is required`,
		invalid_type_error: `${valueName} should be boolean`,
	});

export const getBigintValidationSchema = (valueName: string) =>
	z.preprocess(
		(val, ctx) => {
			try {
				return BigInt(val as string);
			} catch {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `${valueName} should be bigint`,
				});
			}
		},
		z.bigint({
			required_error: `${valueName} is required`,
			invalid_type_error: `${valueName} should be bigint`,
		})
	);

export const getNumberValidationSchema = (valueName: string) =>
	z.number({
		coerce: true,
		required_error: `${valueName} is required`,
		invalid_type_error: `${valueName} should be number`,
	});

export const getStringValidationSchema = (valueName: string) =>
	z
		.string({
			required_error: `${valueName} is required`,
			invalid_type_error: `${valueName} should be string`,
		})
		.min(1);

export const emailValidationSchema = getStringValidationSchema("Email").email({
	message: "Email is invalid",
});

interface GetMinMaxValidationSchemaData {
	valueName: string;
	min?: number;
	max?: number;
}

export const getMinMaxValidationSchema = ({
	min,
	max,
	valueName,
}: GetMinMaxValidationSchemaData) => {
	let schema = getStringValidationSchema(valueName);
	if (min)
		schema = schema.min(min, {
			message: `${valueName} cannot have less than ${min} characters.`,
		});
	if (max)
		schema = schema.max(max, {
			message: `${valueName} cannot have more than ${max} characters.`,
		});
	return schema;
};

export const passwordValidationSchema = getStringValidationSchema(
	"Password"
).regex(/^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*\W)(?!.* ).{8,16}$/, {
	message:
		"Password requires 8-16 characters with at least one number, lowercase, uppercase, and special character",
});

export const getPhoneValidationSchema = (valueName: string) =>
	getStringValidationSchema(valueName).regex(/^\+[1-9]\d{1,14}$/, {
		message: `${valueName} must be in E.164 format (e.g., +919926488445)`,
	});
