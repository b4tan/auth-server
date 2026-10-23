// Auto rotates JWT and refresh pepper every 6 months
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';  
import { spawn } from 'child_process';


const __filename = fileURLToPath(import.meta.url); // get the current file path
const __dirname = path.dirname(__filename); // get the current directory path
const keysDir = path.join(__dirname, '../keys');
const privateKeyPath = path.join(keysDir, 'jwt.private.pem');
const publicKeyPath = path.join(keysDir, 'jwt.public.pem');
const refreshPepperPath = path.join(keysDir, 'refresh.pepper.txt');

function shouldRotate(): boolean {
    const SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000; // in milliseconds

    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath) || !fs.existsSync(refreshPepperPath)) {
        return true;
    }
    const keyAge = Date.now() - fs.statSync(privateKeyPath).birthtime.getTime();
    return keyAge > SIX_MONTHS;

}

if (shouldRotate()) {
    console.log('Rotating keys...');
    // Generate new key pair using generate.key.ts script
    const generateKeyScript = spawn('npx', ['tsx', path.join(__dirname, 'generate.key.ts')], {
        stdio: 'inherit',
        shell: true,
    });
    generateKeyScript.on('close', (code) => {
        if (code !== 0) {
            console.error('Failed to generate keys');
            process.exit(1);
        }
    });
    // Generate new refresh pepper using generate.secret.ts script
    console.log('🔄 Generating new refresh pepper...');
    const generateSecret = spawn('npx', ['tsx', path.join(__dirname, 'generate.secret.ts')], {
      stdio: 'inherit',
      shell: true,
    });

    generateSecret.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Key and secret rotation completed!');
      } else {
        console.error('❌ Secret generation failed');
        process.exit(1);
      }
    });
}