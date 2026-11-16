// sharp (generar las fotos de /_next/image rápido) está en package.json, pero el deploy del VPS
// solo corre `next build`: no instala dependencias nuevas. Si en el build sharp no está instalado,
// se instala una vez con npm (respetando package-lock). Si ya está, no hace nada.
// Si npm falla, el build sigue igual y Next usa su método lento de reserva.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const run = (command) => {
  try {
    return execSync(command, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
  } catch (error) {
    return `ERROR: ${(error.stderr?.toString() || error.message).trim().split('\n').slice(-3).join(' | ')}`
  }
}

// Se prueba en un proceso aparte: Node guarda en caché los paquetes que no encontró
const sharpStatus = () => run(`node -e "require('sharp'); console.log('ok')"`)

export function ensureSharp() {
  if (sharpStatus() === 'ok') return

  console.log('[fotos] sharp no está instalado: npm install (una sola vez)...')
  try {
    // --include=dev: que npm no saque las devDependencies si NODE_ENV es "production"
    execSync('npm install --no-audit --no-fund --include=dev', { cwd: process.cwd(), stdio: 'inherit' })
  } catch (error) {
    console.warn(`[fotos] npm install falló: ${error.message}`)
  }

  const status = sharpStatus()
  if (status === 'ok') {
    console.log('[fotos] sharp instalado')
    return
  }
  // Diagnóstico para saber por qué no quedó
  const sharpDir = path.join(process.cwd(), 'node_modules', 'sharp')
  console.warn('[fotos] sharp sigue sin funcionar: Next usará el método lento')
  console.warn(`[fotos]   cwd=${process.cwd()} node=${process.version} npm=${run('npm -v')}`)
  console.warn(`[fotos]   node_modules/sharp existe: ${fs.existsSync(sharpDir)}; error: ${status}`)
  console.warn(`[fotos]   npm ls sharp: ${run('npm ls sharp --depth=0').replace(/\n/g, ' | ')}`)
}
