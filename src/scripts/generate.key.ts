// scripts/generate-keys.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure keys directory exists
const keysDir = path.join(__dirname, '../keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

// Generate RSA keypair for JWT signing
console.log('Generating RSA keypair for JWT...');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 4096, // 4096-bit for better security
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Write keys to files
const privateKeyPath = path.join(keysDir, 'jwt.private.pem');
const publicKeyPath = path.join(keysDir, 'jwt.public.pem');

fs.writeFileSync(privateKeyPath, privateKey);
fs.writeFileSync(publicKeyPath, publicKey);

// Set restrictive permissions (owner read/write only)
// fs.chmodSync(privateKeyPath, 0o600); // Read/write for owner only
// fs.chmodSync(publicKeyPath, 0o644);  // Read for all, write for owner

console.log('✓ JWT keys generated:');
console.log(`  Private: ${privateKeyPath}`);
console.log(`  Public:  ${publicKeyPath}`);
console.log('Done!');
