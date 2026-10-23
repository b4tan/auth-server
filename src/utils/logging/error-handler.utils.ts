import type { Response } from "express";
import { ZodError } from "zod";
import Send from "@utils/logging/response.utils.js";
import { AuthError } from "@errors/auth.error.js";
import logger from "@utils/logging/logger.utils.js";


class ErrorHandler {
    private static formatZodErrors(zodError: ZodError): Record<string, string[]> {
        const errors: Record<string, string[]> = {};
        zodError.issues.forEach((issue) => {
            const path = issue.path.join(".");
            if (!errors[path]) {
                errors[path] = [];
            }
            errors[path].push(issue.message);
        });
        return errors;
    }

    static handleControllerError(res: Response, error: unknown, defaultMessage = "An error occurred"): void {
        if (error instanceof AuthError) {
            res.status(error.status).json({
                ok: false,
                message: error.message,
                code: error.code,
                ...(error.details !== undefined && { data: error.details }),
            });
            return;
        }

        if (error instanceof ZodError) {
            const formattedErrors = this.formatZodErrors(error);
            res.status(400).json({
                ok: false,
                message: "Validation error",
                errors: formattedErrors,
            });
            return;
        }

        logger.error("Controller error", error);
        Send.error(res, null, defaultMessage);
    }
}

export default ErrorHandler;

// Named export for convenience
export const handleControllerError = ErrorHandler.handleControllerError;

