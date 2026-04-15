const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envCandidates = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env')
].filter(Boolean);

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlaceholderSecret(value) {
  return !value || ['replace_with_strong_secret', 'replace_with_strong_admin_password'].includes(String(value).trim());
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: parseNumber(process.env.PORT, 3000),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false) ? 1 : ((process.env.NODE_ENV || 'development') === 'production' ? 1 : 0),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ors_db',
  sessionSecret: process.env.SESSION_SECRET,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'ors.sid',
  sessionTtlHours: parseNumber(process.env.SESSION_TTL_HOURS, 8),
  appBaseUrl: process.env.APP_BASE_URL || '',
  appTimezone: process.env.APP_TIMEZONE || process.env.TZ || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Main Admin',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseNumber(process.env.SMTP_PORT, 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  mailFrom: process.env.MAIL_FROM || '',
  fast2smsApiKey: process.env.FAST2SMS_API_KEY || '',
  fast2smsRoute: process.env.FAST2SMS_ROUTE || 'q',
  fast2smsLanguage: process.env.FAST2SMS_LANGUAGE || 'english'
};

function validateEnvironment() {
  const issues = [];
  const warnings = [];

  if (!env.mongoUri) {
    issues.push('MONGODB_URI is required.');
  }

  if (env.isProduction) {
    if (isPlaceholderSecret(env.sessionSecret) || String(env.sessionSecret).length < 32) {
      issues.push('SESSION_SECRET must be set to a strong production secret with at least 32 characters.');
    }

    if (!env.appBaseUrl) {
      warnings.push('APP_BASE_URL is not set. Absolute links in tickets, emails, or SMS will fall back to the incoming request host.');
    }
  } else if (isPlaceholderSecret(env.sessionSecret)) {
    warnings.push('Using a generated development SESSION_SECRET because a strong secret is not configured.');
  }

  return { issues, warnings };
}

module.exports = {
  env,
  validateEnvironment,
  parseBoolean
};
