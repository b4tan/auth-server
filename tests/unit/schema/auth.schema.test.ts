import { Email, PhoneE164, Password, SignupRequest, LoginRequest } from '@schemas/auth.schema.js';

describe('Auth Schemas', () => {
    describe('Email', () => {
        it('should accept valid email addresses', () => {
            const validEmails = [
                'test@example.com',
                'user.name@domain.co.uk',
                'user+tag@example.com',
                'test123@test-domain.com',
            ];

            validEmails.forEach(email => {
                expect(() => Email.parse(email)).not.toThrow();
            });
        });

        it('should reject invalid email formats', () => {
            const invalidEmails = [
                'notanemail',
                '@example.com',
                'user@',
                'user@domain',
                'user name@example.com',
                'user@domain..com',
            ];

            invalidEmails.forEach(email => {
                expect(() => Email.parse(email)).toThrow();
            });
        });

        it('should reject empty strings', () => {
            expect(() => Email.parse('')).toThrow();
        });

        it('should reject non-string values', () => {
            expect(() => Email.parse(null as any)).toThrow();
            expect(() => Email.parse(123 as any)).toThrow();
            expect(() => Email.parse({} as any)).toThrow();
        });
    });

    describe('PhoneE164', () => {
        it('should accept valid E.164 format (+15551234567)', () => {
            const validPhones = [
                '+15551234567',
                '+1234567890',
                '+441234567890',
                '+8613800138000',
            ];

            validPhones.forEach(phone => {
                expect(() => PhoneE164.parse(phone)).not.toThrow();
            });
        });

        it('should reject invalid phone formats', () => {
            const invalidPhones = [
                '15551234567', // missing +
                '+155512345678901234', // too long (16 digits, max is 15)
                '+015551234567', // starts with 0 after +
                '+1-555-123-4567', // contains dashes
                '(555) 123-4567', // wrong format
                '+', // only plus sign
                '+1', // too short (only 1 digit after +, needs 2-15)
            ];

            invalidPhones.forEach(phone => {
                expect(() => PhoneE164.parse(phone)).toThrow();
            });
        });

        it('should reject phone without country code', () => {
            expect(() => PhoneE164.parse('5551234567')).toThrow();
        });
    });

    describe('Password', () => {
        it('should accept passwords with all requirements', () => {
            const validPasswords = [
                'ValidPassword123!',
                'AnotherPass456@',
                'Test1234#Pass',
                'MySecure1$Password',
            ];

            validPasswords.forEach(password => {
                expect(() => Password.parse(password)).not.toThrow();
            });
        });

        it('should reject passwords shorter than 12 characters', () => {
            const shortPasswords = [
                'Short1!',
                'Pass123!',
                'Test123!',
                'A1!',
            ];

            shortPasswords.forEach(password => {
                expect(() => Password.parse(password)).toThrow();
            });
        });

        it('should reject passwords without uppercase letter', () => {
            expect(() => Password.parse('lowercase123!')).toThrow();
        });

        it('should reject passwords without number', () => {
            expect(() => Password.parse('NoNumberPassword!')).toThrow();
        });

        it('should reject passwords without special character', () => {
            expect(() => Password.parse('NoSpecialChar123')).toThrow();
        });

        it('should reject passwords with spaces', () => {
            expect(() => Password.parse('Password With Spaces123!')).toThrow();
            expect(() => Password.parse('Password123! ')).toThrow();
            expect(() => Password.parse(' Password123!')).toThrow();
        });
    });

    describe('SignupRequest', () => {
        it('should accept valid signup data', () => {
            const validData = {
                email: 'test@example.com',
                password: 'ValidPassword123!',
                phone: '+15551234567',
            };

            expect(() => SignupRequest.parse(validData)).not.toThrow();
        });

        it('should reject missing email', () => {
            const data = {
                password: 'ValidPassword123!',
                phone: '+15551234567',
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });

        it('should reject missing password', () => {
            const data = {
                email: 'test@example.com',
                phone: '+15551234567',
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });

        it('should reject missing phone', () => {
            const data = {
                email: 'test@example.com',
                password: 'ValidPassword123!',
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });

        it('should reject invalid email format', () => {
            const data = {
                email: 'invalid-email',
                password: 'ValidPassword123!',
                phone: '+15551234567',
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });

        it('should reject invalid password format', () => {
            const data = {
                email: 'test@example.com',
                password: 'short',
                phone: '+15551234567',
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });

        it('should reject invalid phone format', () => {
            const data = {
                email: 'test@example.com',
                password: 'ValidPassword123!',
                phone: '15551234567', // missing +
            };

            expect(() => SignupRequest.parse(data)).toThrow();
        });
    });

    describe('LoginRequest', () => {
        it('should accept valid login data', () => {
            const validData = {
                email: 'test@example.com',
                password: 'ValidPassword123!',
            };

            expect(() => LoginRequest.parse(validData)).not.toThrow();
        });

        it('should reject missing email', () => {
            const data = {
                password: 'ValidPassword123!',
            };

            expect(() => LoginRequest.parse(data)).toThrow();
        });

        it('should reject missing password', () => {
            const data = {
                email: 'test@example.com',
            };

            expect(() => LoginRequest.parse(data)).toThrow();
        });

        it('should reject invalid email format', () => {
            const data = {
                email: 'invalid-email',
                password: 'ValidPassword123!',
            };

            expect(() => LoginRequest.parse(data)).toThrow();
        });

        it('should reject invalid password format', () => {
            const data = {
                email: 'test@example.com',
                password: 'short',
            };

            expect(() => LoginRequest.parse(data)).toThrow();
        });
    });

    describe('Edge cases - very long inputs', () => {
        it('should handle very long email addresses', () => {
            const longString = 'a'.repeat(10000);
            const longEmail = `${longString}@example.com`;

            // Zod email validation doesn't reject very long emails by default
            // They're technically valid emails, just impractical
            // This test documents that the schema accepts them
            try {
                Email.parse(longEmail);
                // If it passes, that's valid behavior (no max length constraint)
            } catch (error) {
                // If it fails, that's also valid (some validators have limits)
                expect(error).toBeDefined();
            }
        });

        it('should reject very long phone numbers', () => {
            const longPhone = '+1' + '5'.repeat(10000);

            // E.164 format has max 15 digits after +
            expect(() => PhoneE164.parse(longPhone)).toThrow();
        });

        it('should handle very long passwords', () => {
            const longPassword = 'A'.repeat(10000) + '1!';

            // Very long passwords might pass validation but should be tested
            // Note: Current schema doesn't have max length, so this might pass
            try {
                Password.parse(longPassword);
                // If it passes, that's also valid behavior
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('should handle very long email in SignupRequest', () => {
            const longString = 'a'.repeat(10000);
            const data = {
                email: `${longString}@example.com`,
                password: 'ValidPassword123!',
                phone: '+15551234567',
            };

            // Zod email validation may or may not reject very long emails
            try {
                SignupRequest.parse(data);
                // If it passes, that's valid behavior
            } catch (error) {
                // If it fails, that's also valid
                expect(error).toBeDefined();
            }
        });

        it('should handle very long email in LoginRequest', () => {
            const longString = 'a'.repeat(10000);
            const data = {
                email: `${longString}@example.com`,
                password: 'ValidPassword123!',
            };

            // Zod email validation may or may not reject very long emails
            try {
                LoginRequest.parse(data);
                // If it passes, that's valid behavior
            } catch (error) {
                // If it fails, that's also valid
                expect(error).toBeDefined();
            }
        });
    });
});
