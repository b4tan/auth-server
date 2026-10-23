// Single Responsibility: Load and render email templates
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface IEmailTemplateUtils {
  renderOtpVerificationEmail(otpCode: string, expiryMinutes: number): string;
}

class EmailTemplateUtils implements IEmailTemplateUtils {
  private readonly templatesDir: string;

  constructor(templatesDir?: string) {
    if (templatesDir) {
      this.templatesDir = templatesDir;
    } else {
      const filename = fileURLToPath(import.meta.url);
      const dirname = path.dirname(filename);
      this.templatesDir = path.join(dirname, '../../service/auth/otp');
    }
  }

  private loadTemplate(templateName: string): string {
    const templatePath = path.join(this.templatesDir, templateName);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Email template not found: ${templatePath}`);
    }

    return fs.readFileSync(templatePath, 'utf-8');
  }

  renderOtpVerificationEmail(otpCode: string, expiryMinutes: number): string {
    const template = this.loadTemplate('email-otp.html');
    return template
      .replace('${otp}', otpCode)
      .replace('5 minutes', `${expiryMinutes} minutes`);
  }
}

export default new EmailTemplateUtils();

