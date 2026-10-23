/**
 * Authorization middleware (scope/role guard).
 *
 * Game plan:
 * 1. After `requireAuth` attaches `req.user`, this middleware will ensure the caller
 *    has the scopes/roles required for the route.
 * 2. Accept a list of scopes (e.g., `jobs:write`) and optionally allow role-based
 *    shortcuts (admin bypass).
 * 3. On failure, respond with 403 so the router can differentiate between
 *    authentication (401) vs authorization problems.
 */

import type { Request, Response, NextFunction } from 'express';
import Send from '@utils/logging/response.utils.js';
import logger from '@utils/logging/logger.utils.js';

class ScopeMiddleware {
  /**
   * Require specific scopes for the route.
   * Admin role bypasses scope checks.
   * 
   * @param scopes - Array of required scopes (e.g., ['jobs:write', 'users:read'])
   * @returns Express middleware function
   */
  static requireScope(scopes: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = req.user;
      
      // User should be set by auth middleware, but check anyway
      if (!user) {
        return Send.unauthorized(res, { message: 'Unauthorized' });
      }

      // Admin role bypasses all scope checks
      if (user.role === 'admin') {
        return next();
      }

      // Check if user has all required scopes
      const hasAllScopes = scopes.every(scope => user.scope.includes(scope));
      
      if (!hasAllScopes) {
        logger.warn("Insufficient permissions", {
          requestId: req.requestId,
          userId: user.id,
          required: scopes,
          granted: user.scope,
          path: req.path,
        });
        return Send.forbidden(res, { 
          message: 'Forbidden: Insufficient permissions',
          required: scopes,
          granted: user.scope
        });
      }

      next();
    };
  }
}

export default ScopeMiddleware;