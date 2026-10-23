import { jest } from '@jest/globals';
import logger from '@utils/logging/logger.utils.js';

describe('Logger', () => {
    let stdoutWriteSpy: jest.SpiedFunction<typeof process.stdout.write>;
    let stderrWriteSpy: jest.SpiedFunction<typeof process.stderr.write>;

    beforeEach(() => {
        stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        stderrWriteSpy.mockRestore();
        jest.clearAllMocks();
    });

    describe('basic logging', () => {
        it('should log info messages', () => {
            logger.info('Test message');
            expect(stdoutWriteSpy).toHaveBeenCalled();
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toContain('Test message');
        });

        it('should log debug messages', () => {
            logger.debug('Debug message');
            expect(stdoutWriteSpy).toHaveBeenCalled();
        });

        it('should log warn messages', () => {
            logger.warn('Warning message');
            expect(stdoutWriteSpy).toHaveBeenCalled();
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toContain('Warning message');
        });

        it('should log error messages to stderr', () => {
            logger.error('Error message');
            expect(stderrWriteSpy).toHaveBeenCalled();
            expect(stdoutWriteSpy).not.toHaveBeenCalled();
        });
    });

    describe('formatting', () => {
        it('should include timestamp in logs', () => {
            logger.info('Test message');
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toBeDefined();
            expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp format
        });

        it('should include meta in logs', () => {
            logger.info('Test message', { userId: '123', action: 'login' });
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toBeDefined();
            expect(call).toContain('userId');
            expect(call).toContain('123');
            expect(call).toContain('action');
        });

        it('should format error objects', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error);
            const call = stderrWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toBeDefined();
            expect(call).toContain('Error occurred');
            expect(call).toContain('Test error');
        });

        it('should handle unknown error types', () => {
            logger.error('Error occurred', 'String error');
            expect(stderrWriteSpy).toHaveBeenCalled();
        });

        it('should handle errors without error parameter', () => {
            logger.error('Error message');
            expect(stderrWriteSpy).toHaveBeenCalled();
        });
    });

    describe('log output', () => {
        it('should write newline after each log', () => {
            logger.info('Test');
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toBeDefined();
            expect(call).toMatch(/\n$/);
        });

        it('should include level in output', () => {
            logger.info('Test message');
            const call = stdoutWriteSpy.mock.calls[0]?.[0] as string;
            expect(call).toBeDefined();
            expect(call.toLowerCase()).toContain('info');
        });
    });
});

