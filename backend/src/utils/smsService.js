const OTP_BRAND_NAME = 'ORS';

function normalizePhoneNumber(phone) {
  const digitsOnly = String(phone || '').replace(/\D/g, '');
  if (digitsOnly.length === 10) return digitsOnly;
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) return digitsOnly.slice(2);
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) return digitsOnly.slice(1);
  return digitsOnly;
}

function getSmsConfig() {
  return {
    apiKey: process.env.FAST2SMS_API_KEY,
    route: process.env.FAST2SMS_ROUTE || 'q',
    language: process.env.FAST2SMS_LANGUAGE || 'english'
  };
}

function isSmsConfigured() {
  const { apiKey } = getSmsConfig();
  return Boolean(apiKey);
}

async function sendOtpSms(phone, otpCode) {
  return sendSms(phone, `${OTP_BRAND_NAME} OTP for your booking payment is ${otpCode}. It expires in 5 minutes.`);
}

async function sendSms(phone, message) {
  if (!isSmsConfigured()) {
    throw new Error('SMS provider is not configured.');
  }

  const { apiKey, route, language } = getSmsConfig();
  const toPhone = normalizePhoneNumber(phone);

  if (!/^\d{10}$/.test(toPhone)) {
    throw new Error('Invalid Indian mobile number for Fast2SMS.');
  }

  const body = new URLSearchParams({
    route,
    language,
    numbers: toPhone,
    message
  });

  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fast2SMS send failed: ${errorText}`);
  }

  const result = await response.json();
  if (!result.return) {
    throw new Error(Array.isArray(result.message) ? result.message.join(', ') : (result.message || 'Fast2SMS rejected the request.'));
  }

  return result;
}

module.exports = {
  sendSms,
  sendOtpSms,
  isSmsConfigured,
  normalizePhoneNumber
};
