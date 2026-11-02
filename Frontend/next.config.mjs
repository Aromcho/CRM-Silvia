/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build sin downtime: se compila en otra carpeta (NEXT_DIST_DIR=.next-new) mientras prod sigue sirviendo .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // El proyecto es JavaScript (usa jsconfig.json). tsconfig.json y next-env.d.ts están en el repo solo porque
  // el deploy del VPS hace `git checkout -- tsconfig.json next-env.d.ts` después del build. Apuntamos a un
  // archivo que no existe para que Next no lo tome como proyecto TypeScript ni intente instalar typescript.
  typescript: { tsconfigPath: 'tsconfig.no-usar.json' },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
