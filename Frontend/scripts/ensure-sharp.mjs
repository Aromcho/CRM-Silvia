// sharp (generar las fotos de /_next/image rápido) está en package.json, pero el deploy del VPS
// solo corre `next build`: no instala dependencias nuevas. Si en el build sharp no está instalado,
// se instala una vez con npm (respetando package-lock). Si ya está, no hace nada.
// Si npm falla, el build sigue igual y Next usa su método lento de reserva.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const hasSharp = () => {
  try {
    createRequire(path.join(process.cwd(), 'package.json')).resolve('sharp')
    return true
  } catch {
    return false
  }
}

export function ensureSharp() {
  if (hasSharp()) return

  console.log('[fotos] sharp no está instalado: npm install (una sola vez)...')
  try {
    // --include=dev: que npm no saque las devDependencies si NODE_ENV es "production"
    execSync('npm install --no-audit --no-fund --include=dev', { cwd: process.cwd(), stdio: 'inherit' })
  } catch (error) {
    console.warn(`[fotos] npm install falló: ${error.message}`)
  }
  console.log(hasSharp() ? '[fotos] sharp instalado' : '[fotos] sharp sigue sin estar: Next usará el método lento')
}
