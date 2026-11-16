// Caché de fotos optimizadas (/_next/image) que sobrevive a los deploys.
//
// Next guarda las fotos achicadas en <distDir>/cache/images. El deploy compila en .next-new y
// después reemplaza .next, así que cada deploy tiraba todas las fotos ya generadas y había que
// volver a generarlas (lento) a medida que la gente entraba a la web.
//
// Solución: en cada build, <distDir>/cache/images pasa a ser un enlace a una carpeta fija
// (Frontend/.image-cache, ignorada por git) que no se toca en los deploys.
import fs from 'node:fs'
import path from 'node:path'

const PERSISTENT_DIR = '.image-cache'

const lstat = (target) => {
  try {
    return fs.lstatSync(target)
  } catch {
    return null
  }
}

const isSymlink = (target) => Boolean(lstat(target)?.isSymbolicLink())
const isRealDir = (target) => {
  const stat = lstat(target)
  return Boolean(stat && stat.isDirectory() && !stat.isSymbolicLink())
}

const pointsTo = (link, dir) => {
  try {
    return fs.realpathSync(link) === fs.realpathSync(dir)
  } catch {
    return false
  }
}

export function linkPersistentImageCache(distDir = '.next') {
  const root = process.cwd()
  const persistent = path.join(root, PERSISTENT_DIR)
  const cacheDir = path.join(root, distDir, 'cache')
  const target = path.join(cacheDir, 'images')

  try {
    // Primera vez: arranca con las fotos que ya generó el sitio que está andando (.next)
    if (!fs.existsSync(persistent)) {
      const live = path.join(root, '.next', 'cache', 'images')
      if (isRealDir(live)) fs.cpSync(live, persistent, { recursive: true })
      else fs.mkdirSync(persistent, { recursive: true })
    }

    if (isSymlink(target) && pointsTo(target, persistent)) return

    fs.mkdirSync(cacheDir, { recursive: true })
    if (isRealDir(target)) {
      // Fotos generadas en esta carpeta antes del enlace (ej. un build local): se pasan a la fija
      fs.cpSync(target, persistent, { recursive: true, force: false })
    }
    if (lstat(target)) fs.rmSync(target, { recursive: true, force: true })

    fs.symlinkSync(persistent, target, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`[fotos] ${path.join(distDir, 'cache', 'images')} -> ${PERSISTENT_DIR} (se conserva entre deploys)`)
  } catch (error) {
    // Puede pasar si dos procesos del build lo hacen a la vez: si el enlace quedó bien, no es un error
    if (isSymlink(target) && pointsTo(target, persistent)) return
    console.warn(`[fotos] no se pudo enlazar la caché de imágenes: ${error.message}`)
  }
}
