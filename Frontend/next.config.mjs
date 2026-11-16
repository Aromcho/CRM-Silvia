import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { linkPersistentImageCache } from './scripts/persistent-image-cache.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build sin downtime: se compila en otra carpeta (NEXT_DIST_DIR=.next-new) mientras prod sigue sirviendo .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // El proyecto es JavaScript (usa jsconfig.json). tsconfig.json y next-env.d.ts están en el repo solo porque
  // el deploy del VPS hace `git checkout -- tsconfig.json next-env.d.ts` después del build. Apuntamos a un
  // archivo que no existe para que Next no lo tome como proyecto TypeScript ni intente instalar typescript.
  typescript: { tsconfigPath: 'tsconfig.no-usar.json' },
  // Miniaturas livianas (C10) por /_next/image: se generan con sharp y quedan en una caché que se
  // conserva entre deploys (ver scripts/persistent-image-cache.mjs). Sin minimumCacheTTL valían 60 s
  // y Next las volvía a generar a cada rato.
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default function config(phase) {
  // En cada build la caché de fotos de la carpeta nueva (.next-new) apunta a la carpeta fija
  if (phase === PHASE_PRODUCTION_BUILD) linkPersistentImageCache(nextConfig.distDir);
  return nextConfig;
}
