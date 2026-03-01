/**
 * Shared cookie options for auth (login, signup, refresh, logout) and OTP routes.
 * Use AUTH_CROSS_DOMAIN=true when frontend and API are on different domains
 * (e.g. equario.x and api.hyperlink.xyz) so cookies use SameSite=None; Secure.
 */

import { TOKEN_CONFIG } from "../utils/jwt.ts";

const isCrossDomain = () => process.env.AUTH_CROSS_DOMAIN === "true";
const cookieDomain = () => process.env.COOKIE_DOMAIN || undefined;

export type RefreshCookieOptions = {
	httpOnly: boolean;
	secure: boolean;
	sameSite: "none" | "lax";
	maxAge: number;
	path: string;
	domain?: string;
};

/**
 * Options for setting the refreshToken cookie.
 * - Same domain: SameSite=Lax, optional domain for subdomains.
 * - Cross domain (AUTH_CROSS_DOMAIN=true): SameSite=None; Secure (HTTPS required).
 */
export function refreshCookieOptions(): RefreshCookieOptions {
	const crossDomain = isCrossDomain();
	const domain = cookieDomain();
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production" || crossDomain,
		sameSite: crossDomain ? "none" : "lax",
		maxAge: TOKEN_CONFIG.REFRESH_TOKEN_COOKIE_EXPIRY,
		path: "/",
		...(domain && !crossDomain ? { domain } : {}),
	};
}

export type ClearCookieOptions = {
	path: string;
	sameSite: "none" | "lax";
	httpOnly: boolean;
	secure: boolean;
	domain?: string;
};

/**
 * Options for clearing the refreshToken (and auth) cookie. Must match options used when setting.
 */
export function clearCookieOptions(): ClearCookieOptions {
	const crossDomain = isCrossDomain();
	const domain = cookieDomain();
	return {
		path: "/",
		sameSite: crossDomain ? "none" : "lax",
		httpOnly: true,
		secure: process.env.NODE_ENV === "production" || crossDomain,
		...(domain && !crossDomain ? { domain } : {}),
	};
}
