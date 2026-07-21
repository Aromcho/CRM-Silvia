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
  - **Gaps detectados el 2026-07-21, todos resueltos en el código (pendiente probar contra la API real):**
    - [x] Sync en lote: `syncAllProperties()` en `mercadolibre.service.js` + `POST /api/mercadolibre/sync-all` — recorre todas las propiedades secuencial con 1.2s de pausa entre cada una (evita 429 de rate limit) y corta si el token dejó de andar. Botón "Sincronizar MercadoLibre" agregado al Sidebar (ADMIN/SUPERADMIN)
    - [x] Multi-operación: se chequeó contra la base real — **30 de 210 propiedades tienen Venta y Alquiler a la vez**, no era un caso raro. `difusion.mercadolibre.listings` ahora es un array; `syncProperty()` publica/actualiza un item de ML por cada operación vigente (venta y/o alquiler) y pausa la que ya no aplica
    - [x] `reservada` ahora también pausa los listings activos (antes solo `vendida`/`no_disponible`)
    - [x] Cierre de listings si `deleted_at` está seteado — cubierto por `syncProperty()`/`sync-all`. Ojo: hoy nada en el CRM setea `deleted_at` (no existe endpoint de borrado de propiedad), así que es preventivo hasta que exista esa función
    - [x] Límite de fotos: **no** se hardcodeó un número — `getCategoryMaxPictures()` consulta `GET /categories/{id}` y usa el campo real `settings.max_pictures_per_item` de la categoría de cada propiedad (confirmado que ese campo existe vía WebSearch, ya que developers.mercadolibre.com.ar bloquea el fetch directo). Fallback a 10 solo si por algún motivo no viniera ese campo
    - [x] UI en frontend: card de MercadoLibre en la tab Difusión de `PropertyDetail.js` (reemplazó el toggle manual solo para ML — ZonaProp sigue con el toggle manual) — muestra estado por operación (Activo/Pausado/Cerrado), link al aviso, error si lo hay, y botón "Sincronizar ahora" (`syncPropertyMercadoLibre` en `api.js`)
    - [x] Alerta de token caído: si falla el refresh, `getValidAccessToken()` crea una `Activity` tipo `ml_token_error` (agregado al enum de `Activity.model.js`) avisando que hay que reconectar la cuenta
  - **Métricas de Inmuebles (investigado 2026-07-21, vía WebSearch — no confirmado contra doc oficial por el bloqueo 403):** endpoints reales de ML para la vertical VIS:
    - `GET /items/visits?ids=$ITEM_ID&date_from=&date_to=` — visitas de una publicación en un rango de fechas
    - `GET /items/$ITEM_ID/contacts/questions?date_from=&date_to=` — total de preguntas/contactos de una publicación
    - `GET /users/$USER_ID/contacts/phone_views?date_from=&date_to=` — veces que se vio el teléfono, a nivel cuenta
    - `GET /vis/leads/$LEAD_ID` → `{ id, item_id, created_at, contact_type, external_id, status, buyer_id, name, email, phone }` (contact_type: whatsapp/question/call/schedule/quotation; name/email/phone solo si el lead es de acceso público)
    - `GET /vis/users/$USER_ID/leads/buyers?contact_types=whatsapp` — listado de leads filtrado por tipo
  - Plan para la sección Métricas de Reportes: cron (`node-cron`, ya está en el stack) que una vez por día pegue a estos endpoints por cada propiedad publicada y guarde un snapshot en una colección nueva (serie temporal), porque la API de ML da el estado actual/rango pedido pero no un histórico acumulado propio. El dashboard consume esa serie: visitas por propiedad en el tiempo, ranking top propiedades por visitas, leads por `contact_type`, funnel visitas→contactos→leads.
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
