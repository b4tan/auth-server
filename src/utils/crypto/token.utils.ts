// src/utils/token.utils.ts
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import authConfig from '@config/auth.config.js';
import type { IAuthRepository } from '@repositories/auth.repository.js';

export interface ITokenUtils {
  generateAccessToken(payload: TokenPayload): string;
  verifyAccessToken(token: string): TokenPayload;
  generateRefreshToken(): string;
  verifyRefreshToken(token: string): Promise<TokenPayload>;
  userToTokenPayload(user: { id: string; role: string; scope: string[] }): TokenPayload;
  hashRefreshToken(token: string): string;
}

export interface TokenPayload {
  id: string;
  role: string;
  scope: string[];
}

interface AuthConfig {
  privateKey: string;
  publicKey: string;
  algorithm: jwt.Algorithm;
  refreshPepper: string;
}

class TokenUtils implements ITokenUtils {
  constructor(
    private authRepo: IAuthRepository,
    private config: AuthConfig = authConfig
  ) {}

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(
      this.extractPayloadFields(payload),
      this.config.privateKey,
      {
        algorithm: this.config.algorithm,
        expiresIn: '15m',
      },
    );
  }

  verifyAccessToken(token: string): TokenPayload {
    const decoded = jwt.verify(token, this.config.publicKey, {
      algorithms: [this.config.algorithm],
    }) as JwtPayload & { id?: string; role?: string; scope?: string[] };

    return this.validateAndExtractPayload(decoded);
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    const refreshTokenHash = this.hashRefreshToken(token);
    const session = await this.authRepo.findRefreshSessionByHash(refreshTokenHash);
    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    return this.userToTokenPayload(session.user);
  }

  userToTokenPayload(user: { id: string; role: string; scope: string[] }): TokenPayload {
    return {
      id: user.id,
      role: user.role as 'worker' | 'admin' | 'employer',
      scope: user.scope,
    };
  }

  hashRefreshToken(token: string): string {
    return crypto
      .createHmac("sha256", this.config.refreshPepper)
      .update(token)
      .digest("hex");
  }

  // DRY: Extract payload fields to avoid repetition
  private extractPayloadFields(payload: TokenPayload): TokenPayload {
    return {
      id: payload.id,
      role: payload.role,
      scope: payload.scope,
    };
  }

  // DRY: Centralize payload validation and extraction
  private validateAndExtractPayload(decoded: JwtPayload & { id?: string; role?: string; scope?: string[] }): TokenPayload {
    if (!decoded || typeof decoded.id !== 'string') {
      throw new Error('Invalid access token payload: missing id');
    }

    if (!decoded.role || typeof decoded.role !== 'string') {
      throw new Error('Invalid access token payload: missing role');
    }

    if (!Array.isArray(decoded.scope)) {
      throw new Error('Invalid access token payload: missing or invalid scope');
    }

    return {
      id: decoded.id,
      role: decoded.role,
      scope: decoded.scope,
    };
  }
}

// Export factory function for dependency injection
export function createTokenUtils(authRepo: IAuthRepository, config?: AuthConfig): ITokenUtils {
  return new TokenUtils(authRepo, config);
}

// Export singleton for convenience (uses default AuthRepository)
// import AuthRepository from '@repositories/auth.repository.js';
// export default createTokenUtils(AuthRepository);