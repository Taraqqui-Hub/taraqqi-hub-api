enum ErrorMessages {
	EMAIL_PASSWORD_INCORRECT = "Invalid credentials. Please check your email and password.",
	ACCOUNT_DOES_NOT_EXIST = "No account found with this email address.",
	INVALID_RESET_PASSWORD_CODE = "The password reset link is invalid or has expired.",
	EMAIL_ALREADY_VERIFIED = "Your email address has already been verified.",
	ACCOUNT_ALREADY_EXISTS = "An account with this email address already exists.",
	INVALID_EMAIL_VERIFICATION_CODE = "The verification code is invalid or has expired.",
	INVALID_REFRESH_TOKEN = "Invalid or expired refresh token.",
}

export default ErrorMessages;
