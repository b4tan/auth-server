import { prisma } from '@lib/prisma.js';
import type { UserCredentials, Role } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  password: string;
  phone: string;
  role: Role;
  scope: string[];
}

export interface IUserRepository {
  findUserByEmail(email: string): Promise<UserCredentials | null>;
  findUserById(userId: string): Promise<UserCredentials | null>;
  findUserByPhone(phone: string): Promise<UserCredentials | null>;
  createUser(data: CreateUserInput): Promise<UserCredentials>;
  verifyUserEmail(email: string): Promise<UserCredentials>;
  verifyUserPhone(phone: string): Promise<UserCredentials>;
  disableUser(userId: string): Promise<void>;
  enableUser(userId: string): Promise<void>;
}

export class UserRepository implements IUserRepository {
  async findUserByEmail(email: string): Promise<UserCredentials | null> {
    return prisma.userCredentials.findUnique({ where: { email } });
  }

  async findUserById(userId: string): Promise<UserCredentials | null> {
    return prisma.userCredentials.findUnique({ where: { id: userId } });
  }

  async findUserByPhone(phoneNumber: string): Promise<UserCredentials | null> {
    return prisma.userCredentials.findUnique({ where: { phone: phoneNumber } });
  }

  async createUser(data: CreateUserInput): Promise<UserCredentials> {
    return prisma.userCredentials.create({
      data: {
        email: data.email,
        passwordHash: data.password,
        phone: data.phone,
        role: data.role,
        scope: data.scope,
      },
    });
  }

  async verifyUserEmail(email: string): Promise<UserCredentials> {
    return prisma.userCredentials.update({
      where: { email },
      data: { emailVerified: true },
    });
  }

  async verifyUserPhone(phone: string): Promise<UserCredentials> {
    return prisma.userCredentials.update({
      where: { phone },
      data: { phoneVerified: true },
    });
  }

  async disableUser(userId: string): Promise<void> {
    await prisma.userCredentials.update({
      where: { id: userId },
      data: { disabled: true },
    });
  }

  async enableUser(userId: string): Promise<void> {
    await prisma.userCredentials.update({
      where: { id: userId },
      data: { disabled: false },
    });
  }
}

export function createUserRepository(): IUserRepository {
  return new UserRepository();
}

export default new UserRepository();

