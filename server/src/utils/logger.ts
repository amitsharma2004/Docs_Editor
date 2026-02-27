import fs from 'fs';
import path from 'path';

const LOG_DIR = '/mnt/efs/spaces/f331ac0b-1063-4944-adae-e86c81b0f113/79e6fbc1-e801-4723-b17a-59a979e7d3ee/logs';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(LOG_DIR, 'server.log');

/**
 * Write a JSON-formatted log entry.
 */
export const writeLog = (level: 'info' | 'error' | 'warn', message: string, meta?: Record<string, unknown>): void => {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && { meta }),
  });
  fs.appendFileSync(logFile, entry + '\n');
  console.log(entry);
};
