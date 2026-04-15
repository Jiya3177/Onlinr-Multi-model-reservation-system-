const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const methodOverride = require('method-override');
const { connectDatabase, checkDatabaseHealth } = require('./src/config/db');
const { env, validateEnvironment } = require('./src/config/env');
const { exposeSession } = require('./src/middleware/auth');
const { exposeCsrfToken, requireCsrf } = require('./src/middleware/csrf');
const { ensureBaseSchema } = require('./src/utils/ensureBaseSchema');
const { ensureDemoInventoryCoverage } = require('./src/utils/bootstrapDemoInventory');
const { isJsonRequest, sendApiError } = require('./src/utils/http');

const app = express();
const PORT = env.port;
const validation = validateEnvironment();
const sessionSecret = env.sessionSecret && env.sessionSecret !== 'replace_with_strong_secret'
  ? env.sessionSecret
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-dev-session-secret`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(express.json({ limit: '50kb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '../frontend/public')));

app.use(
  session({
    name: env.sessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: env.isProduction,
    unset: 'destroy',
    store: MongoStore.create({
      mongoUrl: env.mongoUri,
      collectionName: 'sessions',
      ttl: env.sessionTtlHours * 60 * 60
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      maxAge: 1000 * 60 * 60 * env.sessionTtlHours
    }
  })
);

app.use(exposeSession);
app.use(exposeCsrfToken);
app.use(requireCsrf);

app.use('/', require('./src/routes/indexRoutes'));
app.use('/auth', require('./src/routes/authRoutes'));
app.use('/api', require('./src/routes/paymentApiRoutes'));
app.use('/search', require('./src/routes/searchRoutes'));
app.use('/booking', require('./src/routes/bookingRoutes'));
app.use('/admin', require('./src/routes/adminRoutes'));

app.get('/health', async (req, res) => {
  try {
    const health = await checkDatabaseHealth();
    res.json(health);
  } catch (err) {
    const errorMessage = env.isProduction ? 'Database health check failed.' : err.message;
    res.status(503).json({ ok: false, database: 'disconnected', error: errorMessage });
  }
});

app.use((req, res) => {
  res.status(404).render('pages/404');
});

app.use((err, req, res, next) => {
  if (err.status === 403) {
    console.warn(`CSRF validation failed for ${req.method} ${req.originalUrl}`);

    if (isJsonRequest(req)) {
      return sendApiError(res, 403, 'Security validation failed. Please refresh and try again.');
    }

    req.session.flash = { type: 'error', message: 'Security validation failed. Please refresh and try again.' };
    const backTarget = req.get('Referrer') || '/';
    return res.status(403).redirect(backTarget);
  }

  console.error('Unhandled error:', err);

  if (isJsonRequest(req)) {
    return sendApiError(res, err.status || 500, env.isProduction ? 'Something went wrong. Please try again.' : (err.message || 'Something went wrong.'));
  }

  res.status(err.status || 500).send('Something went wrong. Please try again.');
});

async function startServer() {
  try {
    validation.warnings.forEach((warning) => console.warn(`Config warning: ${warning}`));
    if (validation.issues.length) {
      throw new Error(validation.issues.join(' '));
    }

    await connectDatabase();
    await ensureBaseSchema();
    await ensureDemoInventoryCoverage();
    app.listen(PORT, () => {
      console.log(`ORS running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

startServer();
