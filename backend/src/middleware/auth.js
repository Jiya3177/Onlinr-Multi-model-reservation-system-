function requireUser(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Please login to continue.' };
    return res.redirect('/auth/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    req.session.flash = { type: 'error', message: 'Please login as admin.' };
    return res.redirect('/auth/admin/login');
  }
  next();
}

function exposeSession(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentAdmin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;
  res.locals.currentPath = req.path;
  delete req.session.flash;

  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };

  next();
}

module.exports = { requireUser, requireAdmin, exposeSession };
