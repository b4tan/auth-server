// scripts/generate-secrets.ts
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

// Generate refresh pepper (HMAC secret for refresh token hashing)
console.log('Generating secrets...');

// Generate a strong random secret for refresh token hashing
const refreshPepper = crypto.randomBytes(64).toString('hex'); // 512 bits

// Write secret to file
const refreshPepperPath = path.join(keysDir, 'refresh.pepper.txt');
fs.writeFileSync(refreshPepperPath, refreshPepper);

// Set restrictive permissions (owner read/write only)
// fs.chmodSync(refreshPepperPath, 0o600);

console.log('✓ Secrets generated:');
console.log(`  Refresh Pepper: ${refreshPepperPath}`);
console.log('Done!');