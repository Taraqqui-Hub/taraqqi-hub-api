import { StatusCodes } from "http-status-codes";
import { HTTPError } from "../config/error.ts";

abstract class Service<Data, Response> {
	data: Data;

	constructor(data: Data) {
		this.data = data;
	}

	async validate(): Promise<string | undefined> {
		return undefined;
	}

	abstract handle(): Promise<Response>;

	async execute(): Promise<Response> {
		const validationErr = await this.validate();
		if (validationErr)
			throw new HTTPError({
				httpStatus: StatusCodes.UNPROCESSABLE_ENTITY,
				message: validationErr,
			});
		return await this.handle();
	}

	async executeWithoutValidation(): Promise<Response> {
		return await this.handle();
	}
}

export { Service };
