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

## Pendiente / en curso

- [ ] **Integración MercadoLibre (en curso, 2026-07-21)**
  - [x] Scaffolding de backend: `MlToken.model.js` (token OAuth único), `mercadolibre.service.js` (OAuth2 con refresh automático — el refresh_token de ML rota en cada uso y hay que persistir el nuevo — + mapeo dinámico de propiedad→categoría/atributos, sin IDs hardcodeados porque developers.mercadolibre.com.ar bloquea el fetch automatizado con 403)
  - [x] Controller + rutas: `GET oauth/connect`, `GET oauth/callback`, `POST sync/:propertyId`, `GET status`, `POST webhook/lead`
  - [x] `Property.model.js`: `difusion.mercadolibre` ahora tiene `listings: [{ operation_type, item_id, category_id, url, status, last_error, updated_at }]` (array, no un solo item — ver gap de multi-operación resuelto abajo) + agregado del estado (`published`/`url`/`updated_at`/`last_error`)
  - [x] App creada en el panel de ML ("CRM-silvia"): permisos Usuarios/Publicación y sincronización/Comunicaciones pre-post venta/Métricas del negocio en Lectura y escritura; unidades de negocio Mercado Libre + VIS; sin PKCE (client confidencial, no hace falta); topics de notificación: solo **VIS Leads** (todos los subtipos); Redirect URI y callback de notificaciones apuntando a `https://apicrm.silviafernandezpropiedades.com.ar/api/mercadolibre/...`
  - [x] Client ID obtenido (`8601406870499556`) y Client Secret conseguido por el usuario
  - [ ] **Bloqueante actual**: el redirect_uri registrado en ML es fijo a producción, así que la autorización OAuth tiene que completarse corriendo el backend en el VPS, no en local — el usuario está desplegando el código a producción para continuar ahí (variables `ML_CLIENT_ID`/`ML_CLIENT_SECRET` van en el `.env` de producción, el `.env` local no sirve para este paso)
  - [ ] Una vez conectado: probar el sync de UNA sola propiedad (botón "Sincronizar ahora" en la tab Difusión) antes de correr el sync masivo sobre las 210 restantes
  - [x] **Ajustes 2026-07-21 (vía WebSearch, sitio de ML sigue bloqueando fetch directo):** `buying_mode: 'classified'` confirmado correcto; `listing_type_id` cambiado de `'gold_special'` (guess) a `'silver'` (ejemplo real encontrado, pero no confirmado específico para Inmuebles Argentina); agregado `official_store_id: null` (obligatorio si la cuenta no es Tienda Oficial); agregado atributo `MAINTENANCE_FEE` desde `property.expenses` (confirmado obligatorio para Inmuebles); **pendiente**: `IS_SUITABLE_FOR_PETS` también es obligatorio y no hay campo equivalente en `Property.model.js` — si el error real lo pide, hay que agregar el campo o decidir un default, no asumirlo. También se agregó una llamada previa a `POST /items/validate` antes de cada alta nueva en `publishListing()`, para detectar errores de mapeo sin llegar a publicar un aviso real (y potencialmente pagar por algo mal armado)
  - **Gaps detectados el 2026-07-21, todos resueltos en el código (pendiente probar contra la API real):**
    - [x] Sync en lote: `syncAllProperties()` en `mercadolibre.service.js` + `POST /api/mercadolibre/sync-all` — recorre todas las propiedades secuencial con 1.2s de pausa entre cada una (evita 429 de rate limit) y corta si el token dejó de andar. Botón "Sincronizar MercadoLibre" agregado al Sidebar (ADMIN/SUPERADMIN)
    - [x] Multi-operación: se chequeó contra la base real — **30 de 210 propiedades tienen Venta y Alquiler a la vez**, no era un caso raro. `difusion.mercadolibre.listings` ahora es un array; `syncProperty()` publica/actualiza un item de ML por cada operación vigente (venta y/o alquiler) y pausa la que ya no aplica
    - [x] `reservada` ahora también pausa los listings activos (antes solo `vendida`/`no_disponible`)
    - [x] ~~Cierre de listings si `deleted_at` está seteado~~ — **sacado del código el 2026-07-22**, ver bugs reales más abajo: era un supuesto falso, `deleted_at` lo manda Tokko en el 100% de las propiedades y no significa "eliminada"
    - [x] Límite de fotos: **no** se hardcodeó un número — `getCategoryMaxPictures()` consulta `GET /categories/{id}` y usa el campo real `settings.max_pictures_per_item` de la categoría de cada propiedad (confirmado que ese campo existe vía WebSearch, ya que developers.mercadolibre.com.ar bloquea el fetch directo). Fallback a 10 solo si por algún motivo no viniera ese campo
    - [x] UI en frontend: card de MercadoLibre en la tab Difusión de `PropertyDetail.js` (reemplazó el toggle manual solo para ML — ZonaProp sigue con el toggle manual) — muestra estado por operación (Activo/Pausado/Cerrado), link al aviso, error si lo hay, y botón "Sincronizar ahora" (`syncPropertyMercadoLibre` en `api.js`)
    - [x] Alerta de token caído: si falla el refresh, `getValidAccessToken()` crea una `Activity` tipo `ml_token_error` (agregado al enum de `Activity.model.js`) avisando que hay que reconectar la cuenta
  - [x] **Calidad de publicación + destacado.** `Property.difusion.mercadolibre.listings[]` guarda `listing_type_id`, `health_percentage`, `health_actions[]`, `health_checked_at`. `getListingTypes()`/`upgradeListingType()` para leer y cambiar el nivel de destaque (Plata=básico/Oro=Destacado/Oro Premium=Superdestacado — nombres reales via `GET /sites/MLA/listing_types`). Rutas: `GET /listing-types`, `PATCH /listing-type/:propertyId`. Frontend: card de MercadoLibre en Difusión con selector de destaque (confirm porque tiene costo real), barra de calidad por umbral y lista colapsable de recomendaciones.
    - **CONFIRMADO 2026-07-21 con la doc real "Calidad de las Publicaciones - Inmuebles" (el usuario la pegó completa) — se corrigió `refreshListingHealth()` que antes era una suposición:** `GET /items/{id}/health` → `{ item_id, health (0-1, no 0-100), level, goals: [{id, name, apply, progress, progress_max, data?}] }` — **no** `{health, actions}` como había puesto a ciegas. No existe `/performance` (se sacó el fallback inventado que tenía). Las recomendaciones se calculan filtrando `goals` con `apply=true && progress<progress_max`, mapeando el `id` (picture/technical_specification/video/upgrade_listing/publish) a un texto en español con un diccionario (`HEALTH_GOAL_LABELS`), usando `data.min` cuando está (ej. "Agregar más fotos (mínimo 12)"). También existe `/sites/$SITE_ID/health_levels` con los rangos por nivel (basic 0-0.49, standard 0.5-0.65, professional 0.66-1) — no lo estamos usando todavía, se podría mostrar el nivel con nombre en vez de solo el %. Si ML devuelve el error "health is not supported for this item" (ítems de desarrollo o inactivos/con penalización) ahora se maneja como caso normal, no como error
    - Mínimo de fotos por tipo, confirmado exacto: Casas/Deptos/Oficinas/Parcelas → 12, Locales/Agrícola/Sitios/Terrenos/Bodegas/Lotes → 6, Estacionamientos → 4. **Sigue sin chequearse/avisarse en el CRM antes de sincronizar** — pendiente
  - **Métricas de Inmuebles — CONFIRMADO 2026-07-21 con la doc oficial completa (el usuario pegó el contenido de "Estadísticas de interacciones en Inmuebles", ya no es investigación indirecta vía WebSearch):**
    - Visitas: `GET /users/$USER_ID/items_visits?date_from=&date_to=` (total del seller) y su `/time_window?last=&unit=&ending=` (serie por día); por publicación: `GET /visits/items?ids=$ITEM_ID` (`{"MLA123": 98}`, histórico total, soporta multi-id separado por coma) y `GET /items/visits?ids=$ITEM_ID&date_from=&date_to=` → `{ item_id, date_from, date_to, total_visits, visits_detail: [{company, quantity}] }` (un solo total para todo el rango, no serie por día — no hay `/items/{id}/visits/time_window` documentado)
    - Preguntas: `GET /items/$ITEM_ID/contacts/questions?date_from=&date_to=` → `{ date_from, date_to, item_id, total }` (también a nivel cuenta y con `/time_window`, pero sin variante time_window a nivel item documentada)
    - Teléfono: `GET /items/$ITEM_ID/contacts/phone_views?date_from=&date_to=` → `{ date_from, date_to, total, item_id }`. **Sí tiene `/time_window` a nivel item y soporta multi-id: `GET /items/contacts/phone_views/time_window?ids=$ID1,$ID2&last=&unit=&ending=`** → array `[{ item_id, total, date_from, date_to, last, unit, results: [{date, total}] }]`
    - WhatsApp: mismo patrón que teléfono — `GET /items/$ITEM_ID/contacts/whatsapp?date_from=&date_to=` y `GET /items/contacts/whatsapp/time_window?ids=$ID1,$ID2&last=&unit=&ending=` (multi-id, con serie por día)
    - **No hay endpoint de "Cotizaciones" en esta API de estadísticas** — cotizaciones solo se cuentan filtrando la API de Leads por `contact_type=quotation`
    - **"Exposición" (veces que apareció en los listados, dato que el usuario mostró en una captura del panel de vendedor real) NO está en esta API pública** — parece exclusivo del dashboard interno de ML, no se puede traer por API. La sección de Estadísticas del CRM va a mostrar Visualizaciones/Preguntas/Teléfono/WhatsApp/Interesados (lo que sí es real), no va a incluir "Exposición"
    - **Leads — CONFIRMADO 2026-07-21 con la doc real completa "Leads" (el usuario la pegó, corrigió un bug real):** `GET /vis/users/$USER_ID/leads/buyers?date_from=&date_to=&offset=&limit=&contact_types=&item_id=&buyer_ids=&include_guest=` — los parámetros de fecha son **`date_from`/`date_to` (snake_case), NO `dateFrom`/`dateTo`** como tenía puesto `mercadolibreMetrics.service.js` — ya corregido, ese bug hacía que la consulta de leads fallara en silencio (ML probablemente ignoraba el filtro de fecha mal escrito). `contact_types` (plural) filtra por whatsapp/question/call/schedule/quotation. `include_guest=true` agrega `guest[]` (leads de no logueados, no paginado, hay que sumarlo aparte) y `summary[]`. Respuesta: `{ results: [{ id, item_id, name, email, phone, identification_number, identification_type, leads: [{ id, uuid, channel, contact_type, created_at, external_id, item_id, status, sub_status? }] }], paging: { offset, limit, total }, date_from, date_to }`
    - `GET /vis/leads/$LEAD_ID` → `{ id, item_id, created_at, contact_type, external_id, status, buyer_id, name, email, phone }` — es el que ya usa el webhook `handleMercadoLibreLead`
    - **Para leads tipo "question" el texto de la pregunta NO viene en el lead** — hay que pedirlo aparte a `GET /questions/$QUESTION_ID?api_version=4` (usando `external_id` del lead como `QUESTION_ID`) y leer `.text`. El webhook antes guardaba el mensaje siempre vacío; ya corregido con `getQuestionText()` en `mercadolibre.service.js`, se llama solo cuando `contact_type === 'question'`
    - Errores documentados: 400 (rango de fechas inválido, fecha mal formada, `contact_types` inválido), 403 (token no pertenece al vendedor / token inválido), 404 (`lead not found`), 409 (`quota exceeded` — rate limit, relevante para el cron diario si se corre sobre muchas propiedades)
  - [x] **Implementado 2026-07-21, con la doc real confirmada:**
    - `MlMetricSnapshot.model.js` — una fila por item por día (propertyId, operationType, itemId, date, visits, questions, phoneViews, whatsapp, leadsByType), índice único (itemId, date)
    - `mercadolibreMetrics.service.js` — `collectDailyMetrics()`: visitas/preguntas uno por uno (día anterior, esos dos no tienen `/time_window` a nivel item), teléfono/whatsapp en batch de a 20 ids vía `/time_window?last=1&unit=day` (mucho más barato), leads paginados vía `/vis/users/$ML_USER_ID/leads/buyers` bucketeados por item+contact_type. `getPropertyMetricsSeries(propertyId, days)` suma venta+alquiler por día si la propiedad tiene ambos avisos
    - Cron `src/cron/mercadolibreMetrics.cron.js` corriendo `collectDailyMetrics()` todos los días a las 4am, wireado en `index.js` después de `connectDB()`
    - Rutas: `GET /mercadolibre/metrics/property/:propertyId?days=30`, `POST /mercadolibre/metrics/collect` (trigger manual para probar sin esperar al cron)
    - **Frontend**: tab nuevo "Estadísticas" en `PropertyDetail.js` (`MlStats.js`) — tiles clickeables (Visualizaciones/Preguntas/Teléfono/WhatsApp/Interesados) que cambian qué serie muestra el gráfico, selector de rango (7/30/90 días), estado vacío si la propiedad no está publicada o si todavía no corrió la recolección diaria. Gráfico de línea propio (`UI/LineChart.js`, sin librería) siguiendo la skill de `dataviz`: línea 2px, marcador de cierre con anillo de superficie, grilla recesiva, crosshair+tooltip on hover, un solo hue (verde de marca de la Agenda/CRM, sin legend porque es una sola serie)
    - **Sin probar contra datos reales todavía** — depende de tener la cuenta ML conectada en producción y que corra al menos una recolección (manual con `/metrics/collect` o esperar al cron de las 4am)
    - Cron con `node-cron` (ya es dependencia del backend pero no está wireado en ningún lado todavía) corriendo `collectDailyMetrics()` una vez por día
    - Rutas: `GET /mercadolibre/metrics/summary?days=30` (agregado: visitas/preguntas/leads totales, ranking top propiedades, leads por `contact_type`, funnel visitas→contactos→leads) y `GET /mercadolibre/metrics/property/:id?days=30` (serie temporal para gráfico de una propiedad)
    - Frontend: reemplaza el placeholder de `Reportes.js` por los gráficos reales — **usar la skill `dataviz` antes de escribir cualquier gráfico**, no improvisar colores/paleta a mano
  - [x] **Bugs reales de sync encontrados y corregidos (2026-07-22)**, a partir de que el usuario reportó que sincronizar 6759127/6758354 con ML rompía cosas:
    - `mercadolibre.service.js`: `syncProperty()` cerraba (`closed`, no reversible en ML) cualquier listing si `propertyDoc.deleted_at` estaba seteado, asumiendo que significaba "propiedad eliminada de Tokko". Confirmado con la API real de Tokko que ese campo aparece en el 100% de las 210 propiedades (incluidas las disponibles) — no sirve como señal de baja. Se sacó el chequeo; las bajas reales ya las cubre el `deleteMany` de `syncWithTokko.js` + el 404 de `syncToMercadoLibre` si la propiedad no existe más.
    - `syncWithTokko.js`: el mapeo de status de Tokko solo distinguía 3→reservada y 4→vendida (todo lo demás caía en "disponible"). **Mapeo real confirmado por el usuario con 4 propiedades de prueba** (8361894, 8503327, 8063528, 7797024) y contra el conteo total de las 294 propiedades del feed: `1=en_tasacion (80), 2=disponible (181), 3=reservada (9), 4=no_disponible (24)`. Ya no existe "vendida" como estado de Tokko (era una etiqueta puesta a mano en algún momento). **Ojo — primer intento salió mal:** se asumió sin verificar que `2=no_disponible`, se corrió el sync y marcó 181 propiedades como no disponibles por error; detectado por el usuario y revertido el mismo día antes de aplicar el mapeo correcto.
    - MercadoLibre: la cuenta acumula avisos viejos cerrados con el mismo título que el vigente (visto en 6759127 y 6754975 — Tokko linkeaba a un aviso `active` más nuevo, el CRM tenía vinculado uno `closed` más viejo). Se re-vincularon ambas propiedades al aviso activo correcto y se corrigió `matchDiscoveredItems()`: si para una propiedad hay al menos un match `active`, deja de ofrecer los `closed` de esa misma propiedad como candidatos para vincular.
    - **Pendiente, no resuelto:** las propiedades `en_tasacion` (status 1, 80 en Tokko) tienen un filtro previo en `syncWithTokko.js` (línea ~122, `filter((p) => Number(p.status) !== 1)`) que las excluye antes de guardarlas, y el `deleteMany` final las borra si ya existían — nunca llegan a verse en el CRM. Bug preexistente, no introducido hoy. Falta luz verde del usuario para sacar el filtro.
- [ ] **Próximo paso decidido (2026-07-21): crear la API para que `web-silvia-next` consuma propiedades del CRM.** Es el punto 3 de "Ecosistema" más abajo (Sync de Tokko único) — se adelanta como prioridad inmediata después de cerrar Métricas de ML. Falta definir: qué endpoints expone el CRM (públicos, sin auth de sesión — necesitan su propia key/token de servicio), qué campos de `Property` se devuelven tal cual vs. filtrados, y qué pasa con la data que `web-silvia-next` ya sincronizó por su cuenta desde Tokko (no migrar/pisar de entrada, correr en paralelo hasta confirmar)
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

**Última actualización:** 2026-07-21
