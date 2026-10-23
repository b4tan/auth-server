interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

const emailConfig: EmailConfig = {
  host: process.env.SMTP_HOST!,
  port: parseInt(process.env.SMTP_PORT!),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
  from: process.env.SMTP_FROM || `"Bisa.com" <${process.env.SMTP_USER || "no-reply@bisa.com"}>`,
};

// Validate all required config values are set
const requiredEnvVars = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Email configuration missing required environment variables: ${missingVars.join(', ')}`
  );
}

// Validate port is a valid number
if (isNaN(emailConfig.port) || emailConfig.port <= 0) {
  throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
}

export default emailConfig;

