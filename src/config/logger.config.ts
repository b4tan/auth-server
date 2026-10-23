type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'pretty' | 'json';

interface LoggerConfig {
  level: LogLevel;
  format: LogFormat;
}

const getLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const getLogFormat = (): LogFormat => {
  const envFormat = process.env.LOG_FORMAT?.toLowerCase();
  if (envFormat === 'json' || envFormat === 'pretty') {
    return envFormat;
  }
  return process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
};

const loggerConfig: LoggerConfig = {
  level: getLogLevel(),
  format: getLogFormat(),
};

export default loggerConfig;
export type { LogLevel, LogFormat };

