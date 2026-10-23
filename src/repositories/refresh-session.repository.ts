import { prisma } from '@lib/prisma.js';
import type { UserCredentials, RefreshSession } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AuthErrors, AuthError } from '@errors/auth.error.js';
import logger from '@utils/logging/logger.utils.js';

export interface CreateRefreshSessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IRefreshSessionRepository {
  createRefreshSession(data: CreateRefreshSessionData): Promise<RefreshSession>;
  findRefreshSessionByHash(tokenHash: string): Promise<RefreshSession & { user: UserCredentials } | null>;
  updateRefreshSession(tokenHash: string): Promise<void>;
  rotateRefreshSession(oldTokenHash: string, newTokenHash: string, newExpiresAt: Date): Promise<void>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
}

export class RefreshSessionRepository implements IRefreshSessionRepository {
  async createRefreshSession(data: CreateRefreshSessionData): Promise<RefreshSession> {
    return prisma.refreshSession.create({ data });
  }

  async findRefreshSessionByHash(tokenHash: string): Promise<RefreshSession & { user: UserCredentials } | null> {
    return prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });
  }

  async updateRefreshSession(tokenHash: string): Promise<void> {
    await prisma.refreshSession.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) },
    });
  }

  async rotateRefreshSession(oldTokenHash: string, newTokenHash: string, newExpiresAt: Date): Promise<void> {
    const now = new Date();

    try {
      const result = await prisma.refreshSession.updateMany({
        where: {
          tokenHash: oldTokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });

      if (result.count === 0) {
        throw AuthErrors.invalidRefreshToken();
      }

      if (result.count !== 1) {
        throw AuthErrors.refreshTokenAlreadyUsed();
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AuthErrors.refreshTokenCollision();
      }

      if (error instanceof AuthError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error("Database error in rotateRefreshSession", error, {
          prismaCode: error.code,
          oldTokenHash: oldTokenHash.substring(0, 8) + '...',
        });
      } else {
        logger.error("Unexpected error in rotateRefreshSession", error);
      }

      throw error;
    }
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    await prisma.refreshSession.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }
}

export function createRefreshSessionRepository(): IRefreshSessionRepository {
  return new RefreshSessionRepository();
}

export default new RefreshSessionRepository();

