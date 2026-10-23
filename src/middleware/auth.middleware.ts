// Authentication middleware
// sets the user object in the request object
import type { Request, Response, NextFunction } from 'express';
import type { ITokenUtils } from '@utils/crypto/token.utils.js';
import * as jwt from 'jsonwebtoken';
import Send from '@utils/logging/response.utils.js';
import logger from '@utils/logging/logger.utils.js';

// Read Authorization: Bearer <access_jwt> header.
// Verify the JWT signature + claims (iss, aud, exp).
// Extract identity/claims (sub, role, scope) and set req.user = {...}.
// Fail fast with 401 if token is missing/invalid/expired.

// Factory function to create middleware with dependencies
export function createAuthMiddleware(tokenUtils: ITokenUtils) {
  return {
    verifyAccessToken: (req: Request, res: Response, next: NextFunction) => {
      // Parse from header
      // Bearer <access_jwt>
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];
      
      // Sanity check
      if (!token || !authHeader) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      try {
        const payload = tokenUtils.verifyAccessToken(token);
        req.user = payload;
        next();
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(401).json({ message: 'Unauthorized' });
      }
    },

    verifyRefreshToken: async (req: Request, res: Response, next: NextFunction) => {
      // 1. Extract the refresh token from the HttpOnly cookie
      const refreshToken = req.cookies.refreshToken;

      // If there's no refresh token, return an error
      if (!refreshToken) {
        return Send.unauthorized(res, { message: "No refresh token provided" });
      }

      try {
        // 2. Verify the refresh token using the secret from the auth config
        const session = await tokenUtils.verifyRefreshToken(refreshToken);
        
        // If the token is valid, attach user information to the request object
        req.user = { id: session.id, role: session.role, scope: session.scope };
        // Proceed to the next middleware or route handler
        next();
      } catch (error) {
        // Handle token verification errors (invalid or expired token)
        logger.error("Refresh token authentication failed", error, { requestId: req.requestId });

        // Return a 401 Unauthorized with a more specific message
        return Send.unauthorized(res, { message: "Invalid or expired refresh token" });
      }
    }
  };
}

// For backward compatibility, export default singleton
// This will be replaced by container exports
import { createTokenUtils } from '@utils/crypto/token.utils.js';
import AuthRepository from '@repositories/auth.repository.js';
const defaultTokenUtils = createTokenUtils(AuthRepository);
const defaultAuthMiddleware = createAuthMiddleware(defaultTokenUtils);
export default defaultAuthMiddleware;