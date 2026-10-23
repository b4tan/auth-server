import type { CookieOptions } from "express";

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const CSRF_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export function getRefreshTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/",
  };
}

export function getCsrfTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: false, // CSRF token needs to be accessible to JavaScript
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CSRF_TOKEN_MAX_AGE,
    path: "/",
  };
}

