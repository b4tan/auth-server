// scripts/setup-keys.ts - Master script to generate everything
// DEPRECATED
// import { spawn } from 'child_process';
// import path from 'path';
// import { fileURLToPath } from 'url';


// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const scriptsDir = path.join(__dirname);

// console.log('🔑 Setting up keys and secrets...\n');

// // Run generate-keys.ts
// console.log('Step 1: Generating RSA keypair...');
// const keysScript = spawn('npx', ['tsx', path.join(scriptsDir, 'generate-keys.ts')], {
//   stdio: 'inherit',
//   shell: true,
// });

// keysScript.on('close', (code) => {
//   if (code !== 0) {
//     console.error('Failed to generate keys');
//     process.exit(1);
//   }

//   // Run generate-secrets.ts
//   console.log('\nStep 2: Generating secrets...');
//   const secretsScript = spawn('npx', ['tsx', path.join(scriptsDir, 'generate-secrets.ts')], {
//     stdio: 'inherit',
//     shell: true,
//   });

//   secretsScript.on('close', (code) => {
//     if (code !== 0) {
//       console.error('Failed to generate secrets');
//       process.exit(1);
//     }

//     console.log('\n✅ All keys and secrets generated successfully!');
//     console.log('\n⚠️  Next steps:');
//     console.log('1. Update your .env file with the key paths:');
//     console.log('   JWT_PRIVATE_KEY_PATH=./src/keys/jwt.private.pem');
//     console.log('   JWT_PUBLIC_KEY_PATH=./src/keys/jwt.public.pem');
//     console.log('   REFRESH_PEPPER_PATH=./src/keys/refresh.pepper.txt');
//   });
// });