import type { Transporter, SendMailOptions } from "nodemailer";
import nodemailer from "nodemailer";
import emailConfig from "@config/email.config.js";
import logger from "@utils/logging/logger.utils.js";

export interface IEmailProvider {
  sendMail(to: string, subject: string, html: string): Promise<void>;
}
// Builds the transporter for the email provider (config wrapper)
export async function createEmailTransporter(): Promise<Transporter> {
    return nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: emailConfig.auth,
    });
}

export class EmailProvider implements IEmailProvider {
    private readonly transporterPromise: Promise<Transporter>;

    // Constructor takes in a factory function to accommodate different transporters
    constructor(transporterFactory: () => Promise<Transporter> = createEmailTransporter) {
        this.transporterPromise = transporterFactory();
    }

    private getFromAddress(): string {
        return emailConfig.from;
    }

    async sendMail(to: string, subject: string, html: string): Promise<void> {
        const transporter = await this.transporterPromise;

        const mailOptions: SendMailOptions = {
            from: this.getFromAddress(),
            to,
            subject,
            html,
        };

        try {
            await transporter.sendMail(mailOptions);
            logger.debug("Email sent", { to, subject });
        } catch (error) {
            logger.error("Email send failed", error, { to, subject });
            throw error;
        }
    }
}

export default new EmailProvider();
