import { z } from "zod";

// Validation primitives for request validation
export const Email = z.string().email();
export const PhoneE164 = z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone must be E.164 (+15551234567)");
export const Password = z.string()
  .min(12, "Password must be at least 12 characters")
  .refine((s: string) => /[A-Z]/.test(s), "Password must include at least one uppercase letter")
  .refine((s: string) => /\d/.test(s), "Password must include at least one number")
  .refine((s: string) => /[^A-Za-z0-9]/.test(s), "Password must include at least one special character")
  .refine((s: string) => !/\s/.test(s), "Password must not contain spaces");

// Request validation schemas
export const SignupRequest = z.object({ 
  email: Email, 
  password: Password, 
  phone: PhoneE164 
});

export const LoginRequest = z.object({ 
  email: Email, 
  password: Password 
});

export const VerifyEmailRequest = z.object({
  email: Email,
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must be numeric"),
});

export const ResendOtpRequest = z.object({
  email: Email,
});

// Type exports for TypeScript inference
export type SignupRequestType = z.infer<typeof SignupRequest>;
export type LoginRequestType = z.infer<typeof LoginRequest>;
export type VerifyEmailRequestType = z.infer<typeof VerifyEmailRequest>;
export type ResendOtpRequestType = z.infer<typeof ResendOtpRequest>;