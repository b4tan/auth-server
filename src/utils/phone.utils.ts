export interface IPhoneUtils {
  /**
   * Normalize phone number to E.164 format
   * Accepts flexible formats (with/without +, spaces, dashes) and normalizes to E.164
   * @param phone Phone number in any format (e.g., "+62 812 3456 7890", "6281234567890", "081234567890")
   * @returns E.164 format (e.g., "+6281234567890")
   * @throws Error if phone number is invalid
   */
  normalizeToE164(phone: string): string;
}

class PhoneUtils implements IPhoneUtils {
  normalizeToE164(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/[^0-9]/g, '');
    
    // Must have at least 10 digits (country code + number)
    if (digits.length < 10 || digits.length > 15) {
      throw new Error('Phone number must be 10-15 digits');
    }
    
    // First digit must be 1-9 (country codes don't start with 0)
    if (digits[0] === '0') {
      throw new Error('Phone number cannot start with 0. Include country code.');
    }
    
    // Return E.164 format
    return `+${digits}`;
  }
}

export default new PhoneUtils();

