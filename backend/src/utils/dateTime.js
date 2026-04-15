function getAppTimeZone() {
  return process.env.APP_TIMEZONE || process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getLocalDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getAppTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

module.exports = {
  getAppTimeZone,
  getLocalDateString
};
