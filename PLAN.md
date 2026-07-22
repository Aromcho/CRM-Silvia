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
- `Sidebar/`: nav — Dashboard, Propiedades, Alquileres temporarios, Leads, Archivos, Mostrador, Reportes (`NAV_ITEMS` en `Sidebar.js`)
- `Dashboard/`: feed de actividad (filtrado a `property_created`, `property_updated`, `lead_assigned`) + stats
- `Propiedades/`: grid, filtros por estado/operación (excluye "Alquiler temporal", que vive en su propia sección), modal con botón "Ir a la propiedad" que abre `/propiedades/[id]` en pestaña nueva (ruta real de Next, no swap de estado) → `PropertyDetail.js` (ficha completa editable campo a campo, layout 2 columnas con galería + lightbox y selector de estado en un panel lateral)
- `AlquileresTemporarios/`: mismas propiedades sincronizadas con operación "Alquiler temporal", ficha extendida (clave de alarma, teléfono del dueño, características tipo balneario) + calendario de disponibilidad y reservas
- `Leads/`: lista + modal de gestión, notas internas, asignación a agente (dispara `lead_assigned`), email automático
- `Archivos/`: biblioteca independiente de fotos/videos/documentos para propiedades aún no publicadas (no depende de `Property`), con toolbar + chips de estado + subida de archivos (multer)
- `UI/EditableField.js`: campo "click-to-edit" reutilizable (usado en PropertyDetail, AlquileresTemporarios, Archivos)
- `Mostrador/`: buscador de propiedades para armar una lista imprimible en el momento (visitas presenciales a sucursal) — ver detalle en "Hecho"
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
- [x] **Mostrador de propiedades (2026-07-18)**: sección nueva (`Mostrador/Mostrador.js`) para cuando un visitante llega a una sucursal (Mar Azul / Mar de las Pampas) y pregunta por varias propiedades. Se elige la sucursal (solo texto de encabezado, no filtra resultados), se buscan propiedades (mismo `searchQuery` que Propiedades) y se arma una lista. Cada fila impresa: imagen a la izquierda, íconos de habitaciones/baños/superficie total, a la derecha la dirección y debajo tres renglones en blanco para anotar a mano. Botón "Imprimir" dispara `window.print()` con `@page { size: A4 portrait }`, oculta sidebar y controles (`.no-print`). No persiste nada en la base — es una herramienta efímera, se arma y se imprime cada vez.
- [x] **Detalles con íconos, mapa de ubicación y filtros de Propiedades reordenados (2026-07-22)**:
  - Íconos en toda la tab Detalles de la ficha (antes no tenía ninguno) — nuevo prop `icon` en el componente `Row`. Se agregaron 3 íconos nuevos a `Icons.js` (`DollarSign`, `Compass`, `Car`).
  - `.prop-info-grid` pasó de 2 columnas fijas a `repeat(auto-fit, minmax(190px, 1fr))` — antes un valor corto como "3" dejaba media casilla vacía a la derecha.
  - Nueva tab "Mapa" en la ficha (`PropertyMap.js`/`PropertyMapCore.js`, Leaflet + OpenStreetMap — mismas libs que ya usa `web-silvia-next` para su mapa, así que no se suma una dependencia nueva al ecosistema): click o arrastrar el marcador actualiza `geo_lat`/`geo_long` en el momento. `react-leaflet`/`leaflet` agregados como dependencia nueva del Frontend del CRM (antes no las tenía).
  - Modal de Alquileres temporarios (`AlquileresTemporarios.js`) no tenía el link "Ir a la propiedad" que sí tiene el modal de Propiedades — agregado.
  - Filtros de la sección Propiedades: antes eran 3 barras apiladas con distinto fondo/borde (toolbar, chips de estado, selects) — ahora es un solo bloque de header con dos filas (título+búsqueda arriba, chips+selects abajo).
- [x] **Fotos con dominio completo, selector de estado roto y checklist de servicios/ambientes (2026-07-22)**:
  - `local_image`/`local_original`/`local_thumb` guardaban una ruta relativa (`/uploads/properties/...`) sin dominio cuando `BACKEND_PUBLIC_URL` no estaba seteado — pasaba siempre en local. Nuevo helper `utils/publicUrl.js` (`getBackendPublicUrl()`) usado en `syncWithTokko.js` y `propertyPhoto.controller.js`: si `BACKEND_PUBLIC_URL` no está seteado, cae a `http://localhost:$PORT` en vez de quedar vacío — la URL guardada siempre es absoluta. Se corrieron los ~213 documentos existentes en local para backfillear el dominio (el próximo sync real ya lo hace solo).
  - El selector de estado de la ficha completa (`PropertyDetail.js`) era un `<div>` estático sin ningún `onClick` — no hacía nada. Ahora es un `<select>` real que llama a `PATCH /:id/status` (`updatePropertyStatus`, ya existía en el backend con su validación, no se usaba desde acá). Se corrigió el mismo bug en el modal de la grilla de `Propiedades.js`: tenía un `StatusSelect`/`handleStatusChange` ya escritos pero nunca conectados al JSX — se conectaron.
  - Nueva sección "Servicios, ambientes y adicionales" en la ficha: antes era de solo lectura (`TagChips`, mostraba únicamente lo que ya tenía sincronizado). Ahora es un checklist completo con buscador (`ServicesAmenitiesEditor` en `PropertyDetail.js`) con las listas reales de Servicios (20) y Ambientes (24), más Adicionales calculado dinámicamente por propiedad + campo para agregar uno nuevo a mano. **Importante:** el estado marcado/desmarcado NO se guarda en `tags`/`custom_tags` (esos los pisa el sync de Tokko cada 2 min) — se guarda en un campo nuevo, `Property.manual_tags` (`[String]`, CRM-only), que arranca precargado con lo que ya vino de Tokko la primera vez que se abre pero después queda como única fuente de verdad para esta sección.
- [x] **Sección Difusión + avatares reales + email en cada lead (2026-07-22)**:
  - Nueva sección "Difusión" en el sidebar (`Difusion/Difusion.js`), con una card por portal. Card de MercadoLibre: 6 tiles (publicaciones simples/premium, alertas a revisar, errores, propiedades publicadas/sin publicar) desde `GET /api/mercadolibre/summary` (agregación sobre `Property.difusion.mercadolibre.listings`, universo = propiedades `disponible`/`reservada`) + el botón "Sincronizar MercadoLibre" (antes suelto en el sidebar). Card de ZonaProp: versión simple con `GET /api/zonaprop/summary`. Se sacó del sidebar el botón "Vincular publicaciones existentes" (`MlDiscoverModal.js` queda sin usar en el repo, no se borró).
  - `sendLeadEmail` ahora también se dispara desde el webhook de leads de MercadoLibre (`handleMercadoLibreLead`), no solo desde el alta manual — así que todo lead que entra al CRM manda mail. **Pendiente del usuario**: `SMTP_PASS` en `.env` sigue siendo placeholder, hace falta un App Password real de Gmail para `crmsilviafernandez@gmail.com` (ya seteado como `SMTP_USER`, y `LEADS_EMAIL=braicesfernandez@gmail.com`) o el mail no sale.
  - Avatares reales: `Frontend/public/avatar/<email>.png` (ya estaban subidos) ahora se usan de verdad vía un componente compartido `UI/Avatar.js` (con fallback a las iniciales de color de siempre si no hay archivo o falla la carga), en el Sidebar y en "Usuarios". Se renombró `Martino_pablo@hotmail.com.png` a minúsculas (rompía en el VPS por case-sensitivity de Linux). **Pendiente del usuario**: `paulgarciapamapas@gamil.com.png` probablemente tiene un typo (`gamil` en vez de `gmail`) — confirmar el email real y renombrar si corresponde, si no ese usuario se queda con iniciales.

## Pendiente / en curso

- [ ] **Integración MercadoLibre (en curso desde 2026-07-21)** — doc oficial: https://developers.mercadolibre.com.ar/es_ar/introduccion-guia-de-inmuebles

  **Bloqueante actual:** falta terminar el OAuth. El redirect_uri registrado en ML apunta a producción, así que la autorización solo se puede completar corriendo el backend en el VPS (no en local). App creada en el panel ML ("CRM-silvia"), Client ID/Secret ya conseguidos. Una vez conectado: probar sync de **una sola propiedad** antes del sync masivo sobre las 210 restantes.

  **Hecho:**
  - OAuth2 con refresh automático (`mercadolibre.service.js`, el refresh_token rota en cada uso) + mapeo dinámico propiedad→categoría/atributos (sin IDs hardcodeados)
  - `Property.difusion.mercadolibre.listings[]` es un **array** (no un item único): 30/210 propiedades tienen Venta y Alquiler a la vez, cada operación es un aviso ML aparte. `reservada`/`vendida`/`no_disponible` pausan los listings activos
  - Sync en lote (`syncAllProperties`, pausa 1.2s entre cada una) y sync individual desde la tab Difusión de `PropertyDetail.js`; llamada previa a `POST /items/validate` antes de publicar para no pagar por un aviso mal armado
  - Límite de fotos por categoría vía `GET /categories/{id}` → `settings.max_pictures_per_item` (no hardcodeado)
  - Alerta (`Activity` tipo `ml_token_error`) si falla el refresh del token
  - Calidad de publicación + destaque: `GET /items/{id}/health` → `{health 0-1, level, goals[]}`, tab en Difusión con barra de calidad, recomendaciones y selector Plata/Oro/Oro Premium (`GET/PATCH listing-type`)
  - Métricas (`MlMetricSnapshot`, cron diario 4am): visitas/preguntas/teléfono/WhatsApp/leads, endpoints confirmados con doc oficial. Tab "Estadísticas" en `PropertyDetail.js` con gráfico propio (`UI/LineChart.js`, sigue skill `dataviz`)
  - Webhook de leads (`vis_leads`) — el texto de las preguntas se trae aparte con `GET /questions/{id}`

  **Bugs reales encontrados y corregidos (2026-07-22)**, a raíz de que sincronizar 6759127/6758354 rompía cosas:
  - `deleted_at` de Tokko **no** significa "eliminada" (aparece en el 100% de las 210 propiedades) — se sacó el chequeo que cerraba listings de ML por error
  - Mapeo de status de Tokko corregido: `1=en_tasación (80), 2=disponible (181), 3=reservada (9), 4=no_disponible (24)` — ya no existe "vendida". *Ojo:* un primer intento asumió mal `2=no_disponible` y marcó 181 propiedades como no disponibles; revertido el mismo día
  - Avisos ML duplicados (uno `closed` viejo + uno `active` nuevo con el mismo título) — re-vinculados a mano y corregido `matchDiscoveredItems()` para priorizar siempre `active`
  - Params de leads son `date_from`/`date_to` (snake_case), no `dateFrom`/`dateTo` — bug silencioso que hacía fallar el filtro de fecha en las métricas

  **Pendiente:**
  - Completar el OAuth en producción (bloqueante) y probar 1 propiedad antes del sync masivo
  - Chequear mínimo de fotos antes de sincronizar (12 casas/deptos/oficinas/parcelas · 6 locales/agrícola/sitios/terrenos/bodegas/lotes · 4 estacionamientos) — todavía no se avisa en el CRM
  - `IS_SUITABLE_FOR_PETS` es obligatorio para ML y no hay campo equivalente en `Property.model.js` — agregar si el error real lo pide
  - Propiedades `en_tasación` (status 1, 80 en Tokko) quedan excluidas por un filtro preexistente en `syncWithTokko.js` (línea ~122) — falta luz verde del usuario para sacarlo
- [x] **API para que `web-silvia-next` consuma propiedades del CRM (implementado 2026-07-22).** Punto 3 de "Ecosistema" (Sync de Tokko único). Diseño: la web mantiene su propio Mongo y sus controllers/rutas actuales intactos — solo cambia el origen de datos de su `syncWithTokko.js`, que ahora le pega al CRM en vez de a Tokko directo (mismo cron cada 1 minuto que ya tenía, sin agregar carga nueva contra Tokko).
  - CRM: `utils/syncWithTokko.js` ahora tiene mutex (`isSyncing`) contra corridas superpuestas, y corre automático cada 2 min (`cron/tokkoSync.cron.js`, antes era solo manual vía botón).
  - CRM: nueva API pública de solo lectura en `/api/public/properties` (+`/ids`), protegida con header `X-Api-Key` (`middlewares/apiKey.mid.js`, valida contra `WEB_SYNC_API_KEY`) — primer patrón de API key del CRM, no existía ninguno antes. Proyección explícita allow-list (`controllers/publicProperty.controller.js`) que excluye `internal_data`/`notes`/`lastEditedBy`/`difusion`/`temporaryRental` completo. `status` se traduce a lo que la web espera (`no_disponible→vendida`, `en_tasacion` nunca se expone). Soporta `?updatedSince=` para traer solo el delta.
  - Web: `utils/syncWithTokko.js` ahora tiene dos caminos por env var `PROPERTY_SOURCE` (`tokko` default = comportamiento actual sin cambios, `crm` = pide al CRM). Mapea fotos del CRM (`local_image/local_original/local_thumb`, ya públicas en el VPS) a los campos que la web espera (`image/original/thumb`) — no vuelve a descargar nada. Nuevo cron diario de reconciliación de borrados (`reconcileDeletedProperties`, compara contra `/properties/ids` del CRM) porque el delta por `updatedSince` no detecta bajas.
  - **Verificado en local:** `/api/public/properties` responde 401 sin API key, 200 con key; sobre 213 propiedades reales no aparece ningún campo sensible (`internal_data`/`notes`/`temporaryRental`/etc.) y los únicos `status` que salen son `disponible`/`reservada`/`vendida`.
  - **Pendiente para el cutover real:** deployar en el VPS, generar un `WEB_SYNC_API_KEY`/`CRM_API_KEY` de producción (los actuales son solo para pruebas en local, mismo valor hardcodeado en ambos `.env`), comparar una muestra de propiedades entre el Mongo actual de la web y el resultado vía CRM, probar el sitio completo en local con `PROPERTY_SOURCE=crm`, y recién ahí flipear la env var en producción (queda como rollback de un solo cambio de env var). No se tocó nada de `Frontend/` en ninguno de los dos proyectos.
- [ ] Integración ZonaProp (stub en `zonaprop.controller.js`, sin implementar)
- [ ] Reportes: gráficos y métricas reales (hoy es placeholder) — ver plan de Métricas de Inmuebles arriba, depende de la integración ML
- [ ] Revisar si conviene permitir click-to-select de rango en el calendario de disponibilidad (hoy es solo visual + formulario aparte)
- [ ] **Gestor de usuarios (solo visible para el superusuario "dueño", 2026-07-15)**: nueva sección en el sidebar (nav item) para administrar usuarios del CRM (crear, roles, desactivar). Ojo: la visibilidad no es por rol SUPERADMIN en general — tiene que aparecer únicamente en la cuenta específica del dueño, aunque haya otros SUPERADMIN. Falta decidir el mecanismo de gating (flag `isOwner` en `User.model.js` vs. hardcodear el email/id) antes de implementar.

### Pendiente — Web (no CRM)
- Consultas de alquiler temporario en la web (`web-silvia-next`): turnar automáticamente un agente por consulta + mostrar calendario de disponibilidad en la página pública. No corresponde al CRM.

## Ecosistema (visión a futuro — no arrancar sin luz verde)

Hoy `Agenda-inmobiliaria` (puerto 7000), `CRM` (7003/7004) y `web-silvia-next` son tres silos: cada uno con su propia base Mongo, y `web-silvia-next` y el CRM sincronizando Tokko cada uno por su cuenta (fotos duplicadas, riesgo de que precio/estado diverja entre sitios). La web además no persiste los leads que entran por el formulario de contacto — solo manda un mail por Mailjet.

**Importante — las 3 bases ya tienen datos reales consolidados en producción** (Clientes de Agenda, Leads/Propiedades del CRM, contenido/SEO de la web). Esto no es "tirar todo y empezar de cero": cualquier integración tiene que ser aditiva y por API, un flujo a la vez, corriendo en paralelo con lo existente hasta confirmar que funciona — sin migrar ni tocar colecciones existentes de entrada.

Idea de fondo: el CRM como fuente de verdad de propiedades + leads; Agenda y web-silvia-next consumen su API en vez de duplicar datos. Orden propuesto (de menor a mayor riesgo):

1. **Contacto web → Lead del CRM**: `web-silvia-next/Backend/src/controllers/contact.controller.js` además del mail, hace `POST` a `CRM /api/leads` para entrar al pipeline de estados/asignación/mail automático que el CRM ya tiene.
2. **Calendario de alquiler temporario compartido**: exponer disponibilidad del CRM (`Property.temporaryRental`) vía API para que la web la muestre en `/alquiler-temporario`, y que cada consulta genere Lead/reserva con agente asignado (mismo punto que "Pendiente — Web" arriba).
3. **Sync de Tokko único**: evaluar que solo el CRM sincronice y descargue fotos, y que `web-silvia-next` lea propiedades del CRM por API en vez de tener su propio `syncWithTokko.js`/`uploads`. Requiere decidir antes qué pasa con la data que la web ya sincronizó por su cuenta.
4. **Cliente de Agenda ↔ Lead del CRM**: son la misma entidad modelada dos veces (`Agenda/Backend/src/models/Client.model.js` vs `CRM/Backend/src/models/Lead.model.js`). Evaluar que al asignar un Lead en el CRM se cree/vincule el `Client` en Agenda, sin duplicar carga manual del agente. Requiere decidir el mapeo con lo que ya existe en ambas colecciones antes de automatizar.
5. **Auth compartido** entre las 3 (más largo plazo, menor prioridad — hoy cada una tiene su propio `User.model.js`/login).

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

**Última actualización:** 2026-07-22
