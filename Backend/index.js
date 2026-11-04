import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/utils/db.js';
import router from './src/routes/index.router.js';
import errorHandler from './src/middlewares/errorHandler.mid.js';
import { startMercadoLibreMetricsCron } from './src/cron/mercadolibreMetrics.cron.js';
import { startZonapropReconcileCron } from './src/cron/zonapropReconcile.cron.js';
import { startZonapropLeadsCron } from './src/cron/zonapropLeads.cron.js';
import { startInstagramCron } from './src/cron/instagram.cron.js';
import { startMailMarketingWorker } from './src/cron/mailMarketing.cron.js';
import { ensureContactKeys } from './src/controllers/leadInbox.controller.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7003;
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:7004')
  .split(',')
  .map((url) => url.trim());
// Mismo origen: la página pública de baja de Mail Marketing hace POST a su propio dominio
if (process.env.BACKEND_PUBLIC_URL) ALLOWED_ORIGINS.push(process.env.BACKEND_PUBLIC_URL.replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Webhook de Instagram: body crudo para validar X-Hub-Signature-256 (tiene que ir antes de express.json)
app.use('/api/instagram/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Serve uploaded property images directly via Express (no Nginx needed).
// Las subidas comparten dominio con la API (y su cookie de sesión): nosniff + CSP sandbox para que
// un archivo subido nunca se ejecute como página, y todo lo que no sea imagen se descarga.
const UPLOAD_INLINE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    if (!UPLOAD_INLINE_EXT.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
  },
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'crm-inmobiliaria-backend' });
});

app.use('/api', router);
app.use(errorHandler);

async function start() {
  await connectDB();
  ensureContactKeys();
  startMercadoLibreMetricsCron();
  startZonapropReconcileCron();
  startZonapropLeadsCron();
  startInstagramCron();
  startMailMarketingWorker();
  app.listen(PORT, () => console.log(`CRM Backend corriendo en puerto ${PORT}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
