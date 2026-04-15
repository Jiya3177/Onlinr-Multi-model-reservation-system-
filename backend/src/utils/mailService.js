const nodemailer = require('nodemailer');

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  return {
    host,
    port,
    user,
    pass,
    from,
    secure
  };
}

function isMailConfigured() {
  const config = getMailConfig();
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

async function sendPasswordResetCodeEmail({ to, fullName, verificationCode, expiresMinutes }) {
  if (!isMailConfigured()) {
    return { success: false };
  }

  const config = getMailConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  const recipientName = fullName || 'Traveler';
  await transporter.sendMail({
    from: config.from,
    to,
    subject: `Your ORS verification code: ${verificationCode}`,
    text: [
      `Hello ${recipientName},`,
      '',
      'We received a request to reset your ORS account password.',
      `Your 6-digit verification code is: ${verificationCode}`,
      `This code will expire in ${expiresMinutes} minutes.`,
      '',
      'If you did not request this reset, you can safely ignore this email.'
    ].join('\n'),
    html: `
      <p>Hello ${recipientName},</p>
      <p>We received a request to reset your ORS account password.</p>
      <div style="padding: 15px; margin: 20px 0; border: 2px dashed #0056b3; background: #f0f8ff; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #0056b3;">
        ${verificationCode}
      </div>
      <p>This code will expire in ${expiresMinutes} minutes.</p>
      <p>If you did not request this reset, you can safely ignore this email.</p>
    `
  });

  return { success: true };
}

module.exports = {
  isMailConfigured,
  sendPasswordResetCodeEmail
};
