import PasswordUtils from '@utils/crypto/password.utils.js';

describe('PasswordUtils', () => {
    describe('hashPassword', () => {
        it('should generate a valid Argon2 hash', async () => {
            const password = 'TestPassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
            // Argon2 hashes start with $argon2id$
            expect(hash).toMatch(/^\$argon2id\$/);
        });

        it('should generate different hashes for the same password', async () => {
            const password = 'TestPassword123!';
            const hash1 = await PasswordUtils.hashPassword(password);
            const hash2 = await PasswordUtils.hashPassword(password);
            
            // Each hash should be unique due to random salt
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty string', async () => {
            const hash = await PasswordUtils.hashPassword('');
            
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(hash).toMatch(/^\$argon2id\$/);
        });

        it('should handle special characters in password', async () => {
            const password = 'P@ssw0rd!#$%^&*()';
            const hash = await PasswordUtils.hashPassword(password);
            
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^\$argon2id\$/);
        });

        it('should handle long passwords', async () => {
            const password = 'A'.repeat(200);
            const hash = await PasswordUtils.hashPassword(password);
            
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^\$argon2id\$/);
        });
    });

    describe('comparePassword', () => {
        it('should return true for correct password', async () => {
            const password = 'TestPassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword(password, hash);
            
            expect(isValid).toBe(true);
        });

        it('should return false for incorrect password', async () => {
            const password = 'TestPassword123!';
            const wrongPassword = 'WrongPassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword(wrongPassword, hash);
            
            expect(isValid).toBe(false);
        });

        it('should return false for empty password with non-empty hash', async () => {
            const password = 'TestPassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword('', hash);
            
            expect(isValid).toBe(false);
        });

        it('should handle empty string comparison', async () => {
            const hash = await PasswordUtils.hashPassword('');
            const isValid = await PasswordUtils.comparePassword('', hash);
            
            expect(isValid).toBe(true);
        });

        it('should return false for password with different case', async () => {
            const password = 'TestPassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword(password.toLowerCase(), hash);
            
            expect(isValid).toBe(false);
        });

        it('should return false for invalid hash format', async () => {
            const password = 'TestPassword123!';
            const invalidHash = 'invalid-hash-format';
            
            // Argon2.verify should handle invalid hashes gracefully
            const isValid = await PasswordUtils.comparePassword(password, invalidHash);
            
            expect(isValid).toBe(false);
        });

        it('should work with special characters', async () => {
            const password = 'P@ssw0rd!#$%^&*()';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword(password, hash);
            
            expect(isValid).toBe(true);
        });
    });

    describe('integration: hashPassword and comparePassword', () => {
        it('should hash and verify password correctly', async () => {
            const password = 'MySecurePassword123!';
            const hash = await PasswordUtils.hashPassword(password);
            const isValid = await PasswordUtils.comparePassword(password, hash);
            
            expect(isValid).toBe(true);
        });

        it('should work with multiple different passwords', async () => {
            const passwords = [
                'Password1!',
                'AnotherPassword2@',
                'YetAnother3#',
            ];

            for (const password of passwords) {
                const hash = await PasswordUtils.hashPassword(password);
                const isValid = await PasswordUtils.comparePassword(password, hash);
                expect(isValid).toBe(true);
            }
        });
    });
});
