import Send from "@utils/logging/response.utils.js";
import type { Request, Response } from "express";
import { AuthService } from "@service/auth/auth.service.js";
import { handleControllerError } from "@utils/logging/error-handler.utils.js";

export class UserController {
    constructor(private authService: AuthService) {}

    /**
     * Get the user information based on the authenticated user.
     * The userId is passed from the AuthMiddleware.
     */
    getUser = async (req: Request, res: Response) => {        
        try {
            const userId = req.user?.id; // Extract userId from the authenticated request
            
            if (!userId) {
            return Send.unauthorized(res, { message: "User not found" });
            }

            // Fetch the user data via service
            const user = await this.authService.getUserById(userId);

            // Return the user data in the response
            return Send.success(res, { user });
        } catch (error) {
            handleControllerError(res, error, "Internal server error");
        }
    };
}