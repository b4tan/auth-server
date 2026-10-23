import type { UserCredentials, RefreshSession, EmailOtp } from '@prisma/client';
import type { IUserRepository, CreateUserInput } from '@repositories/user.repository.js';
import type { IEmailOtpRepository, UpsertEmailOtpData } from '@repositories/email-otp.repository.js';
import type { IRefreshSessionRepository, CreateRefreshSessionData } from '@repositories/refresh-session.repository.js';
import { createUserRepository } from '@repositories/user.repository.js';
import { createEmailOtpRepository } from '@repositories/email-otp.repository.js';
import { createRefreshSessionRepository } from '@repositories/refresh-session.repository.js';

export type { CreateUserInput, UpsertEmailOtpData, CreateRefreshSessionData };

export type IAuthRepository = IUserRepository & IEmailOtpRepository & IRefreshSessionRepository;

export class AuthRepository implements IAuthRepository {
  constructor(
    private userRepo: IUserRepository = createUserRepository(),
    private emailOtpRepo: IEmailOtpRepository = createEmailOtpRepository(),
    private refreshSessionRepo: IRefreshSessionRepository = createRefreshSessionRepository()
  ) {}

  // User repository methods
  findUserByEmail = (email: string) => this.userRepo.findUserByEmail(email);
  findUserById = (userId: string) => this.userRepo.findUserById(userId);
  findUserByPhone = (phone: string) => this.userRepo.findUserByPhone(phone);
  createUser = (data: CreateUserInput) => this.userRepo.createUser(data);
  verifyUserEmail = (email: string) => this.userRepo.verifyUserEmail(email);
  verifyUserPhone = (phone: string) => this.userRepo.verifyUserPhone(phone);
  disableUser = (userId: string) => this.userRepo.disableUser(userId);
  enableUser = (userId: string) => this.userRepo.enableUser(userId);

  // Email OTP repository methods
  findOtpbyEmail = (email: string) => this.emailOtpRepo.findOtpbyEmail(email);
  upsertEmailOtp = (email: string, data: UpsertEmailOtpData) => this.emailOtpRepo.upsertEmailOtp(email, data);

  // Refresh session repository methods
  createRefreshSession = (data: CreateRefreshSessionData) => this.refreshSessionRepo.createRefreshSession(data);
  findRefreshSessionByHash = (tokenHash: string) => this.refreshSessionRepo.findRefreshSessionByHash(tokenHash);
  updateRefreshSession = (tokenHash: string) => this.refreshSessionRepo.updateRefreshSession(tokenHash);
  rotateRefreshSession = (oldTokenHash: string, newTokenHash: string, newExpiresAt: Date) =>
    this.refreshSessionRepo.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);
  revokeRefreshSession = (tokenHash: string) => this.refreshSessionRepo.revokeRefreshSession(tokenHash);
}

export function createAuthRepository(): IAuthRepository {
  return new AuthRepository();
}

export default new AuthRepository();
