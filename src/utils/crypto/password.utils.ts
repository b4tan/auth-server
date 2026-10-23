import argon2 from "argon2";

export interface IPasswordUtils {
    hashPassword(password: string): Promise<string>;
    comparePassword(password: string, hashedPassword: string): Promise<boolean>;
}

class PasswordUtils implements IPasswordUtils {
    // Argon is the most advanced password hashing algorithm available.
    // It automatically adds SALT

    private static readonly ARGON2_OPTIONS: argon2.Options = {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3, // iterations
        parallelism: 4, // threads
    };

    async hashPassword(password: string): Promise<string> {
        return argon2.hash(password, PasswordUtils.ARGON2_OPTIONS);
    }

    async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
        try {
            return await argon2.verify(hashedPassword, password);
        } catch (error) {
            // If verification fails (invalid hash format, etc.), return false
            return false;
        }
    }
}

export default new PasswordUtils();