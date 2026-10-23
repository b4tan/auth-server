import crypto from 'crypto';
// General purpose RSA utilities
// JWT is signed with RSA-PSS SHA-256
const RSAUtils = {
  
  // Generate RSA Key Pair (Synchronously, because we rotate keys not that often)
  generateKeyPair(modulusLength: number = 4096) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength,
      publicKeyEncoding: { type: 'spki', format: 'pem'},
      privateKeyEncoding: { type: 'pkcs8',format: 'pem'},
    });
    return { publicKey, privateKey };
  },

  // Encrypt Data with Public Key
  encrypt(plainText: string, publicKey: string) { 
    // expects buffer, not string
    const buffer = Buffer.from(plainText);
    const encrypted = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, buffer);
    return encrypted.toString('base64'); // return back as base64 string
  },

  // Decrypt Data with Private Key
  decrypt(encryptedText: string, privateKey: string) { 
    const base64Buffer = Buffer.from(encryptedText, 'base64');
    const decrypted = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, base64Buffer);
    return decrypted.toString('utf-8');
  },

  // Sign message with private key (RSA-PSS SHA-256)
  sign(message: string, privateKey: string): string {
    const s = crypto.createSign("sha256");
    s.update(message);
    s.end();
    return s.sign(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      "base64"
    );
  },

  // Verify signature (RSA-PSS SHA-256)
  verify(message: string, signatureB64: string, publicKey: string): boolean {
    const v = crypto.createVerify("sha256");
    v.update(message);
    v.end();
    return v.verify(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      signatureB64,
      "base64"
    );
  },
};

export default RSAUtils;