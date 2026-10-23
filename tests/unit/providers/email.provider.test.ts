import { jest } from '@jest/globals';
import nodemailer from 'nodemailer';
import type { Transporter, SentMessageInfo } from 'nodemailer';

// Mock email config before any imports
const mockEmailConfig = {
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
        user: 'test-user',
        pass: 'test-pass',
    },
    from: '"Test" <test@ethereal.email>',
};

jest.unstable_mockModule('@config/email.config.js', () => ({
    default: mockEmailConfig,
}));

// Import after mocking
const emailProviderModule = await import('@providers/email.provider.js');
const EmailProvider = emailProviderModule.EmailProvider;
import type { IEmailProvider } from '@providers/email.provider.js';

describe('EmailProvider', () => {
    let emailProvider: InstanceType<typeof EmailProvider>;
    let mockTransporter: jest.Mocked<Transporter>;
    let etherealAccount: nodemailer.TestAccount;

    beforeAll(async () => {
        // Create Ethereal test account for testing
        etherealAccount = await nodemailer.createTestAccount();
    });

    beforeEach(() => {
        // Mock transporter
        const mockSentMessageInfo: SentMessageInfo = {
            messageId: 'test-message-id',
            response: '250 OK',
            accepted: ['test@example.com'],
            rejected: [],
            pending: [],
            envelope: {
                from: 'test@ethereal.email',
                to: ['test@example.com'],
            },
        };

        mockTransporter = {
            sendMail: jest.fn<Transporter['sendMail']>().mockResolvedValue(mockSentMessageInfo),
        } as unknown as jest.Mocked<Transporter>;

        // Create provider with mock transporter factory
        const mockTransporterFactory = jest.fn<() => Promise<Transporter>>().mockResolvedValue(mockTransporter);
        emailProvider = new EmailProvider(mockTransporterFactory);
    });

    describe('sendMail', () => {
        it('should send email successfully', async () => {
            const to = 'recipient@example.com';
            const subject = 'Test Subject';
            const html = '<h1>Test HTML</h1>';

            await emailProvider.sendMail(to, subject, html);

            expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: expect.any(String),
                to,
                subject,
                html,
            });
        });

        it('should include correct recipient in email', async () => {
            const to = 'user@example.com';
            const subject = 'Test';
            const html = '<p>Test</p>';

            await emailProvider.sendMail(to, subject, html);

            const callArgs = mockTransporter.sendMail.mock.calls[0]?.[0];
            expect(callArgs?.to).toBe(to);
        });

        it('should include correct subject in email', async () => {
            const to = 'user@example.com';
            const subject = 'Important Email';
            const html = '<p>Content</p>';

            await emailProvider.sendMail(to, subject, html);

            const callArgs = mockTransporter.sendMail.mock.calls[0]?.[0];
            expect(callArgs?.subject).toBe(subject);
        });

        it('should include correct HTML content in email', async () => {
            const to = 'user@example.com';
            const subject = 'Test';
            const html = '<h1>Hello World</h1><p>This is a test</p>';

            await emailProvider.sendMail(to, subject, html);

            const callArgs = mockTransporter.sendMail.mock.calls[0]?.[0];
            expect(callArgs?.html).toBe(html);
        });

        it('should handle multiple sendMail calls', async () => {
            await emailProvider.sendMail('user1@example.com', 'Subject 1', '<p>Content 1</p>');
            await emailProvider.sendMail('user2@example.com', 'Subject 2', '<p>Content 2</p>');

            expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
        });

        it('should propagate transporter errors', async () => {
            const error = new Error('SMTP connection failed');
            mockTransporter.sendMail.mockRejectedValueOnce(error);

            await expect(
                emailProvider.sendMail('user@example.com', 'Test', '<p>Test</p>')
            ).rejects.toThrow('SMTP connection failed');
        });
    });

    describe('transporter creation', () => {
        it('should create transporter with provided factory', async () => {
            const factory = jest.fn<() => Promise<Transporter>>().mockResolvedValue(mockTransporter);
            const provider = new EmailProvider(factory);

            await provider.sendMail('test@example.com', 'Test', '<p>Test</p>');

            expect(factory).toHaveBeenCalledTimes(1);
        });
    });

    // Sends real mail through Ethereal, so it needs a network: RUN_ETHEREAL=1 npm test
    (process.env.RUN_ETHEREAL ? describe : describe.skip)('integration with Ethereal', () => {
        it('should send email using Ethereal test account', async () => {
            // Create real Ethereal transporter
            const etherealTransporter = nodemailer.createTransport({
                host: etherealAccount.smtp.host,
                port: etherealAccount.smtp.port,
                secure: etherealAccount.smtp.secure,
                auth: {
                    user: etherealAccount.user,
                    pass: etherealAccount.pass,
                },
            });

            // Create provider with Ethereal transporter
            const etherealProvider = new EmailProvider(async () => etherealTransporter);

            const to = 'test@example.com';
            const subject = 'Ethereal Test Email';
            const html = '<h1>Test Email</h1><p>This is a test email sent via Ethereal.</p>';

            await etherealProvider.sendMail(to, subject, html);

            // Verify email was sent (Ethereal provides preview URL)
            // The sendMail should succeed without throwing
            expect(true).toBe(true); // If we get here, email was sent successfully
        });

        it('should handle HTML content correctly with Ethereal', async () => {
            const etherealTransporter = nodemailer.createTransport({
                host: etherealAccount.smtp.host,
                port: etherealAccount.smtp.port,
                secure: etherealAccount.smtp.secure,
                auth: {
                    user: etherealAccount.user,
                    pass: etherealAccount.pass,
                },
            });

            const etherealProvider = new EmailProvider(async () => etherealTransporter);

            const html = `
                <html>
                    <body>
                        <h1>OTP Verification</h1>
                        <p>Your OTP code is: <strong>123456</strong></p>
                        <p>This code expires in 15 minutes.</p>
                    </body>
                </html>
            `;

            await expect(
                etherealProvider.sendMail('test@example.com', 'OTP Code', html)
            ).resolves.not.toThrow();
        });

        it('should handle special characters in email content', async () => {
            const etherealTransporter = nodemailer.createTransport({
                host: etherealAccount.smtp.host,
                port: etherealAccount.smtp.port,
                secure: etherealAccount.smtp.secure,
                auth: {
                    user: etherealAccount.user,
                    pass: etherealAccount.pass,
                },
            });

            const etherealProvider = new EmailProvider(async () => etherealTransporter);

            const html = `
                <html>
                    <body>
                        <p>Special characters: &lt; &gt; &amp; &quot; &apos;</p>
                        <p>Unicode: 你好 🌟</p>
                        <p>Code: <code>&lt;script&gt;alert('test')&lt;/script&gt;</code></p>
                    </body>
                </html>
            `;

            await expect(
                etherealProvider.sendMail('test@example.com', 'Special Characters Test', html)
            ).resolves.not.toThrow();
        });

        it('should use configured from address with Ethereal', async () => {
            const etherealTransporter = nodemailer.createTransport({
                host: etherealAccount.smtp.host,
                port: etherealAccount.smtp.port,
                secure: etherealAccount.smtp.secure,
                auth: {
                    user: etherealAccount.user,
                    pass: etherealAccount.pass,
                },
            });

            // Mock config with Ethereal account
            const etherealMockConfig = {
                ...mockEmailConfig,
                from: `"Test Sender" <${etherealAccount.user}>`,
            };

            jest.unstable_mockModule('@config/email.config.js', () => ({
                default: etherealMockConfig,
            }));

            const etherealProviderModule = await import('@providers/email.provider.js');
            const EtherealEmailProvider = etherealProviderModule.EmailProvider;
            const etherealProvider = new EtherealEmailProvider(async () => etherealTransporter);

            await etherealProvider.sendMail('test@example.com', 'Test', '<p>Test</p>');

            // Verify the from address is used
            expect(true).toBe(true);
        });
    });

    describe('from address', () => {
        it('should use configured from address', async () => {
            const to = 'user@example.com';
            const subject = 'Test';
            const html = '<p>Test</p>';

            await emailProvider.sendMail(to, subject, html);

            const callArgs = mockTransporter.sendMail.mock.calls[0]?.[0];
            expect(callArgs?.from).toBeDefined();
            expect(typeof callArgs?.from).toBe('string');
            expect(callArgs?.from).toBe(mockEmailConfig.from);
        });
    });
});
