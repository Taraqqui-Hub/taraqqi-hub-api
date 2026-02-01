import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z, ZodSchema } from "zod";
import { HTTPError } from "../config/error.ts";

interface ValidationOptions<T> {
	validationSchema: ZodSchema<T>;
	getValue: (req: Request) => unknown;
}

type AsyncHandlerWithValidation<T> = (
	validatedData: T,
	req: Request,
	res: Response,
	next: NextFunction
) => Promise<any>;

type AsyncHandlerWithoutValidation = (
	req: Request,
	res: Response,
	next: NextFunction
) => Promise<any>;

// Overload signatures
function expressAsyncHandler<T>(
	handler: AsyncHandlerWithValidation<T>,
	options: ValidationOptions<T>
): (req: Request, res: Response, next: NextFunction) => void;

function expressAsyncHandler(
	handler: AsyncHandlerWithoutValidation
): (req: Request, res: Response, next: NextFunction) => void;

// Implementation
function expressAsyncHandler<T>(
	handler: AsyncHandlerWithValidation<T> | AsyncHandlerWithoutValidation,
	options?: ValidationOptions<T>
): (req: Request, res: Response, next: NextFunction) => void {
	return (req: Request, res: Response, next: NextFunction) => {
		const executeHandler = async () => {
			if (options) {
				const rawValue = options.getValue(req);
				const parseResult = options.validationSchema.safeParse(rawValue);

				if (!parseResult.success) {
					throw new HTTPError({
						httpStatus: StatusCodes.BAD_REQUEST,
						message: "Validation failed",
						reason: parseResult.error.flatten().fieldErrors,
					});
				}

				return (handler as AsyncHandlerWithValidation<T>)(
					parseResult.data,
					req,
					res,
					next
				);
			}

			return (handler as AsyncHandlerWithoutValidation)(req, res, next);
		};

		executeHandler().catch(next);
	};
}

export default expressAsyncHandler;
