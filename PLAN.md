# CRM Inmobiliario — Plan y estado

> Este archivo es el punto de partida en cada conversación sobre el CRM. Se actualiza a medida que se avanza. No repetir aquí lo que ya está en el código — solo decisiones, estado y lo que falta.

## Stack y ubicación

- Ubicación: `c:\Users\barri\Desktop\CRM\`
- Backend: Node.js ESM + Express + MongoDB/Mongoose — puerto **7003**
- Frontend: Next.js 14 (React.createElement, sin JSX) — puerto **7004**
- DB: `mongodb://127.0.0.1:27017/crm_inmobiliaria` (local dev; producción en server)
- Estética: mismo verde que la Agenda Inmobiliaria (sidebar-bg `#0f1f18`)
- Objetivo del proyecto: independizarse de Tokko, tener control total de datos/fotos, poder integrar ML/ZonaProp. La sincronización con Tokko es transitoria — solo para tener las propiedades en local mientras se decide el desacople total.

## Estructura actual

**Backend** (`Backend/src/`):
- `controllers/`: activity, lead, mercadolibre (stub), property, session, user, zonaprop (stub), fileRecord
- `models/`: Activity, Lead, Property (con subdocumento `temporaryRental`), User, FileRecord
- `routes/api/`: session, users, properties, leads, activities, mercadolibre, zonaprop, files
- `utils/syncWithTokko.js`: sincroniza propiedades + descarga fotos a `Backend/uploads/properties/<id>/`, servidas como estáticos en `/uploads`. Dispara `Activity` tipo `property_created` por cada alta nueva.

**Frontend** (`Frontend/src/components/`):
- `Sidebar/`: nav — Dashboard, Propiedades, Alquileres temporarios, Leads, Archivos, Reportes (`NAV_ITEMS` en `Sidebar.js`)
- `Dashboard/`: feed de actividad (filtrado a `property_created`, `property_updated`, `lead_assigned`) + stats
- `Propiedades/`: grid, filtros por estado/operación (excluye "Alquiler temporal", que vive en su propia sección), modal con botón "Ir a la propiedad" que abre `/propiedades/[id]` en pestaña nueva (ruta real de Next, no swap de estado) → `PropertyDetail.js` (ficha completa editable campo a campo, layout 2 columnas con galería + lightbox y selector de estado en un panel lateral)
- `AlquileresTemporarios/`: mismas propiedades sincronizadas con operación "Alquiler temporal", ficha extendida (clave de alarma, teléfono del dueño, características tipo balneario) + calendario de disponibilidad y reservas
- `Leads/`: lista + modal de gestión, notas internas, asignación a agente (dispara `lead_assigned`), email automático
- `Archivos/`: biblioteca independiente de fotos/videos/documentos para propiedades aún no publicadas (no depende de `Property`), con toolbar + chips de estado + subida de archivos (multer)
- `UI/EditableField.js`: campo "click-to-edit" reutilizable (usado en PropertyDetail, AlquileresTemporarios, Archivos)
- `Reportes/`: placeholder "en construcción"

## Hecho

- [x] Auth (sessions, roles ADMIN/SUPERADMIN/USER)
- [x] Sync con Tokko (propiedades + fotos locales)
- [x] Gestión de propiedades (CRUD, estados, filtros)
- [x] Gestión de leads (estados, notas, asignación a agente, email automático)
- [x] Dashboard con actividad (filtrada) y stats básicas
- [x] Ficha completa de propiedad editable campo a campo, como página real en `/propiedades/[id]` (se abre en pestaña nueva desde "Ir a la propiedad"), con galería + lightbox, selector de estado y feedback de guardado/error en cada campo
- [x] Gestión de alquileres temporarios (ficha extendida + calendario de disponibilidad/reservas)
- [x] Sección Archivos (fotos/videos/documentos de propiedades no publicadas)
- [x] Botón "Importar alquileres (Excel)" en el sidebar (ADMIN/SUPERADMIN): corre `importRentalExcelFile` contra un archivo fijo en el servidor (`Backend/data/rentals.xlsx`, configurable con `RENTAL_XLSX_PATH`)
- [x] Gestión de fotos por propiedad: tab "Fotos" dentro de la ficha completa (`PropertyDetail` ahora tiene tabs Detalles/Fotos in-page, no es una pestaña de navegador separada) — subir, eliminar y reordenar vía `PhotoManager.js`

## Pendiente / en curso

- [ ] Integración MercadoLibre (stub en `mercadolibre.controller.js`, sin implementar)
- [ ] Integración ZonaProp (stub en `zonaprop.controller.js`, sin implementar)
- [ ] Reportes: gráficos y métricas reales (hoy es placeholder)
- [ ] Revisar si conviene permitir click-to-select de rango en el calendario de disponibilidad (hoy es solo visual + formulario aparte)
- [ ] **Gestor de usuarios (solo visible para el superusuario "dueño", 2026-07-15)**: nueva sección en el sidebar (nav item) para administrar usuarios del CRM (crear, roles, desactivar). Ojo: la visibilidad no es por rol SUPERADMIN en general — tiene que aparecer únicamente en la cuenta específica del dueño, aunque haya otros SUPERADMIN. Falta decidir el mecanismo de gating (flag `isOwner` en `User.model.js` vs. hardcodear el email/id) antes de implementar.

### Pendiente — Web (no CRM)
- Consultas de alquiler temporario en la web (`web-silvia-next`): turnar automáticamente un agente por consulta + mostrar calendario de disponibilidad en la página pública. No corresponde al CRM.

## Notas importantes

- **Edición de campos sincronizados desde Tokko**: `syncWithTokko.js` pisa con `$set` todos los campos que trae la API de Tokko (`address`, `description`, `operations`, etc.) en cada sync. Ediciones manuales a esos campos desde la ficha completa se pierden en el próximo sync. Los campos propios del CRM (`notes`, `temporaryRental`) nunca los toca el sync y persisten siempre.
- **Alquileres temporarios** depende de que la propiedad ya esté sincronizada desde Tokko con operación "Alquiler temporal" (alias ya soportado en `OPERATION_ALIASES` de `property.controller.js`). No es una colección aparte.
- **Archivos** es independiente de `Property` — no hay "promoción" automática a propiedad publicada.
- **Routing de Propiedades**: `/propiedades/[id]` es la única ruta real de Next.js en todo el frontend (el resto de la app sigue siendo un SPA de una sola página con tabs por `useState`). Es una página standalone (sin sidebar) con su propio chequeo de sesión — así funciona al abrirse en una pestaña nueva.
- **`RESERVAS ALQUILERES 2027.xlsx`**: se archivó en `_archive/` (2026-07-14). Su data ya está migrada a `Property.temporaryRental` vía `Backend/src/scripts/importRentalExcel.js` (ahora un wrapper fino sobre `Backend/src/utils/rentalExcelImporter.js`, que también usa el endpoint `POST /api/properties/import-rentals`); se conserva por las dudas en vez de borrarlo porque este repo no tiene commits de git.
- **Import de alquileres desde el sidebar**: el botón lee un archivo fijo en el servidor (`RENTAL_XLSX_PATH`, default `Backend/data/rentals.xlsx` — ya tiene una copia local para pruebas). En el VPS hay que subir el Excel actualizado a esa ruta (scp/rsync) antes de apretar el botón; no hay upload desde el navegador.
- **Fotos manuales vs. sync de Tokko**: `syncWithTokko.js` ahora preserva las fotos subidas manualmente (sin `original_url`) al reconstruir `photos` en cada sync — antes las pisaba por completo cada 6h. Si se toca esa lógica de nuevo, no perder este merge.

## Cómo retomar

```
cd Backend && npm install && npm run dev   # puerto 7003 (multer agregado como dependencia nueva)
cd Frontend && npm run dev                 # puerto 7004
```

**Última actualización:** 2026-07-14
