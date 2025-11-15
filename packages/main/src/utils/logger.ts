import log from 'electron-log';

// Initialize electron-log
log.initialize();

// Configure console transport format and level
log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';

// Set log level from environment variable (defaults to 'info')
const logLevel = process.env.LOG_LEVEL || 'info';
log.transports.console.level = logLevel as any;

// Disable file logging when DISABLE_FILE_LOG is set (for testing)
if (process.env.DISABLE_FILE_LOG === 'true') {
  log.transports.file.level = false; // Completely disable file logging
} else {
  // Configure file transport for production
  log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
  log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
  log.transports.file.level = logLevel as any;
}

export const logger = log;
