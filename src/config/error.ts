import { StatusCodes } from "http-status-codes";

interface HTTPErrorData {
	httpStatus: StatusCodes;
	message?: string;
	reason?: any;
}

export class HTTPError extends Error {
	httpStatus: StatusCodes;
	reason?: object | string;

	constructor({ httpStatus, message, reason }: HTTPErrorData) {
		super(message);
		this.httpStatus = httpStatus;
		this.reason = reason;
	}
}
