// src/config/auth.config.ts
import fs from 'fs';
import path from 'path';

const jwtPrivateKeyPath = process.env.JWT_PRIVATE_KEY_PATH;
const jwtPublicKeyPath = process.env.JWT_PUBLIC_KEY_PATH;
const refreshPepperPath = process.env.REFRESH_PEPPER_PATH;

if (!jwtPrivateKeyPath || !jwtPublicKeyPath) {
  throw new Error('JWT key paths missing. Set JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH.');
}

if (!refreshPepperPath) {
  throw new Error('Refresh secret path missing. Set REFRESH_PEPPER_PATH.');
}

const privateKey = fs.readFileSync(path.resolve(jwtPrivateKeyPath), 'utf-8');
const publicKey = fs.readFileSync(path.resolve(jwtPublicKeyPath), 'utf-8');
const refreshPepper = fs.readFileSync(path.resolve(refreshPepperPath), 'utf-8');

export default {
  algorithm: 'RS256' as const,
  privateKey,
  publicKey,
  refreshPepper,
};