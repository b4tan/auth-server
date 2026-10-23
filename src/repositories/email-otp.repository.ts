import { prisma } from '@lib/prisma.js';
import type { EmailOtp, OtpStatus } from '@prisma/client';

export interface UpsertEmailOtpData {
  codeHash?: string;
  expiresAt?: Date;
  status?: OtpStatus;
  attempts?: number;
  lockedUntil?: Date | null;
}

export interface IEmailOtpRepository {
  findOtpbyEmail(email: string): Promise<EmailOtp | null>;
  upsertEmailOtp(email: string, data: UpsertEmailOtpData): Promise<EmailOtp>;
}

export class EmailOtpRepository implements IEmailOtpRepository {
  async findOtpbyEmail(email: string): Promise<EmailOtp | null> {
    return prisma.emailOtp.findUnique({ where: { email } });
  }

  async upsertEmailOtp(email: string, data: UpsertEmailOtpData): Promise<EmailOtp> {
    return prisma.emailOtp.upsert({
      where: { email },
      update: data,
      create: {
        email,
        codeHash: data.codeHash!,
        expiresAt: data.expiresAt ?? new Date(),
        status: data.status ?? 'pending',
        attempts: data.attempts ?? 0,
        lockedUntil: data.lockedUntil ?? null,
      },
    });
  }
}

export function createEmailOtpRepository(): IEmailOtpRepository {
  return new EmailOtpRepository();
}

export default new EmailOtpRepository();

