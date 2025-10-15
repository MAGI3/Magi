import log from 'electron-log';

log.initialize();

log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';
log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';

export const logger = log;
