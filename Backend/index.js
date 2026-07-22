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
import { startTokkoSyncCron } from './src/cron/tokkoSync.cron.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7003;
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:7004')
  .split(',')
  .map((url) => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Serve uploaded property images directly via Express (no Nginx needed)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'crm-inmobiliaria-backend' });
});

app.use('/api', router);
app.use(errorHandler);

async function start() {
  await connectDB();
  startMercadoLibreMetricsCron();
  startTokkoSyncCron();
  app.listen(PORT, () => console.log(`CRM Backend corriendo en puerto ${PORT}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
