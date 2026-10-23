import crypto from 'crypto';

export interface IOtpUtils {
  generateOtp(): string;
  hashOtpCode(code: string): string;
  verifyOtpCode(code: string, hash: string): Promise<boolean>;
}

class OtpUtils implements IOtpUtils {

  generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  hashOtpCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
  }

  async verifyOtpCode(code: string, hash: string): Promise<boolean> {
    const codeHash = this.hashOtpCode(code);
    
    return crypto.timingSafeEqual(
      Buffer.from(codeHash),
      Buffer.from(hash)
    );
  }
}
export default new OtpUtils();

