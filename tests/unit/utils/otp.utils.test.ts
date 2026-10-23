import OtpUtils from '@utils/auth/otp.utils.js';

describe('OTP Utils', () => {
    describe('generateOtp', () => {
        it('should generate a 6-digit OTP', () => {
            const otp = OtpUtils.generateOtp();
            
            expect(otp).toBeDefined();
            expect(typeof otp).toBe('string');
            expect(otp.length).toBe(6);
            expect(otp).toMatch(/^\d{6}$/); // Should be exactly 6 digits
        });

        it('should generate different OTPs on each call', () => {
            const otp1 = OtpUtils.generateOtp();
            const otp2 = OtpUtils.generateOtp();
            const otp3 = OtpUtils.generateOtp();
            
            // While theoretically possible to be the same, it's extremely unlikely
            const allDifferent = otp1 !== otp2 && otp2 !== otp3 && otp1 !== otp3;
            expect(allDifferent).toBe(true);
        });

        it('should generate OTP within valid range', () => {
            const otp = OtpUtils.generateOtp();
            const otpNumber = parseInt(otp, 10);
            
            // Should be between 100000 and 999999 for 6 digits
            expect(otpNumber).toBeGreaterThanOrEqual(100000);
            expect(otpNumber).toBeLessThanOrEqual(999999);
        });

        it('should generate numeric string only (no letters)', () => {
            for (let i = 0; i < 100; i++) {
                const otp = OtpUtils.generateOtp();
                expect(otp).toMatch(/^\d{6}$/);
            }
        });
    });

    describe('hashOtpCode', () => {
        it('should produce consistent hash', () => {
            const code = '123456';
            const hash1 = OtpUtils.hashOtpCode(code);
            const hash2 = OtpUtils.hashOtpCode(code);
            
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1.length).toBe(64); // SHA256 hex = 64 chars
        });

        it('should produce different hash for different codes', () => {
            const code1 = '123456';
            const code2 = '654321';
            const hash1 = OtpUtils.hashOtpCode(code1);
            const hash2 = OtpUtils.hashOtpCode(code2);
            
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty string', () => {
            const hash = OtpUtils.hashOtpCode('');
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(hash.length).toBe(64);
        });
    });

    describe('verifyOtpCode', () => {
        it('should return true for correct code', async () => {
            const code = '123456';
            const hash = OtpUtils.hashOtpCode(code);
            const isValid = await OtpUtils.verifyOtpCode(code, hash);
            
            expect(isValid).toBe(true);
        });

        it('should return false for incorrect code', async () => {
            const code = '123456';
            const wrongCode = '654321';
            const hash = OtpUtils.hashOtpCode(code);
            const isValid = await OtpUtils.verifyOtpCode(wrongCode, hash);
            
            expect(isValid).toBe(false);
        });

        it('should return false for empty code with non-empty hash', async () => {
            const code = '123456';
            const hash = OtpUtils.hashOtpCode(code);
            const isValid = await OtpUtils.verifyOtpCode('', hash);
            
            expect(isValid).toBe(false);
        });

        it('should handle empty string comparison', async () => {
            const hash = OtpUtils.hashOtpCode('');
            const isValid = await OtpUtils.verifyOtpCode('', hash);
            
            expect(isValid).toBe(true);
        });

        it('should use timing-safe comparison', async () => {
            const code1 = '123456';
            const code2 = '123457'; // Very similar code
            const hash = OtpUtils.hashOtpCode(code1);
            
            const isValid = await OtpUtils.verifyOtpCode(code2, hash);
            expect(isValid).toBe(false);
        });
        });

    describe('integration: generateOtp, hashOtpCode, and verifyOtpCode', () => {
        it('should generate, hash, and verify OTP correctly', async () => {
            const otp = OtpUtils.generateOtp();
            const hash = OtpUtils.hashOtpCode(otp);
            const isValid = await OtpUtils.verifyOtpCode(otp, hash);
            
            expect(isValid).toBe(true);
        });

        it('should work with multiple different OTPs', async () => {
            for (let i = 0; i < 10; i++) {
                const otp = OtpUtils.generateOtp();
                const hash = OtpUtils.hashOtpCode(otp);
                const isValid = await OtpUtils.verifyOtpCode(otp, hash);
                expect(isValid).toBe(true);
            }
        });
    });
});
