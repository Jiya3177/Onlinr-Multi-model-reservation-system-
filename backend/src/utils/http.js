function isJsonRequest(req) {
  return req.originalUrl.startsWith('/api/')
    || req.path.includes('/seatmap/')
    || (req.get('accept') || '').includes('application/json')
    || (req.get('content-type') || '').includes('application/json');
}

function sendApiError(res, status, message, extra = {}) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...extra
  });
}

function sendApiSuccess(res, payload = {}, status = 200) {
  return res.status(status).json({
    ok: true,
    ...payload
  });
}

module.exports = {
  isJsonRequest,
  sendApiError,
  sendApiSuccess
};
