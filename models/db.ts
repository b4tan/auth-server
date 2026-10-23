// models/db.ts
// Prisma Client export and type re-exports
// Central database access point for the application

import { prisma } from '../src/lib/prisma.js';

// Export Prisma client as default (maintains compatibility)
export default prisma;

// Re-export Prisma client for named imports
export { prisma };

// Re-export Prisma namespace for type utilities
export type { Prisma } from '@prisma/client';

// Type helpers - Prisma generates these automatically
// Users can import types like: import type { User } from '@prisma/client'
// Or use Prisma.UserCreateInput, Prisma.UserUpdateInput, etc.
// For simple model types, import directly from @prisma/client

// Export ROLES constant matching Zod enum
export const ROLES = ['worker', 'admin', 'employer'] as const;
