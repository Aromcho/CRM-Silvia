# Integración ZonaProp/Navent — Plan y estado

> Plan de acción para la integración API con ZonaProp (Lectura y Escritura), aprobada 2026-09-01. Se trabaja aparte de `PLAN.md` mientras dura la implementación en sandbox. **Cuando se suban los cambios a producción, volcar el resultado final a `PLAN.md` y borrar este archivo.**

## 0. Qué se verificó antes de escribir el plan (nada se dio por sentado)

- Las credenciales del mail (`User`/`Password`) **son literalmente** `client_id`/`client_secret` de OAuth2. Se probó el login real contra la sandbox y funciona: devuelve `access_token`, `scope: "read write trust"` (confirma que el permiso es Lectura+Escritura real, no solo lo que dice el mail).
- El código de inmobiliaria `30023986` es real y corresponde a **"Silvia A. Fernández"** — ya está cargada en el sandbox con créditos: `DESTACADO: 7`, `HOME: 0`, `SIMPLE: 1` (al momento de verificar, 2026-09-01).
- Hay **dos hostnames** para la misma sandbox: el del mail (`http://api-zp.sandbox.open.navent.com`, sin TLS) y el de la doc Notion (`https://api-zp-sandbox-open.navent.com`, con Cloudflare). Se comprobó que ambos devuelven el mismo token para las mismas credenciales → es el mismo backend. **Usar el de HTTPS** (`api-zp-sandbox-open.navent.com`) en el código porque es el documentado oficialmente y el que va a tener equivalente en producción.
- Se leyeron las **7 pestañas** de la sección API de la doc de Navent (Primeros pasos, Uso de la API con sus 7 subpáginas, Modelos de avisos, Pase a producción, Callbacks, Ubicación en mapa, Zona Demand, Solo lectura, Asociar inmobiliarias) más el Swagger real (`http://api-zp.sandbox.open.navent.com/swagger-ui-init.js`), que es mejor fuente de verdad que el texto de Notion para los contratos de request/response. La sección XML se dejó fuera a propósito: la integración es por API, no por XML feed.

## Credenciales sandbox

- `client_id` = `braices_fernandez`, `client_secret` = `2873190580`
- Código inmobiliaria: `30023986` ("Silvia A. Fernández")
- Login: `POST https://api-zp-sandbox-open.navent.com/v1/application/login?grant_type=client_credentials&client_id=...&client_secret=...` → `{ access_token, token_type, expires_in, scope }`
- Horario sandbox: Lunes a Viernes 07:00–20:55 ART (fuera de esa ventana puede no responder)
- Producción (cuando se pase de sandbox): pedir credenciales nuevas por mail a `integracion@ar.quintoandar.com`. URL AR/UY: `https://api-zp-open.navent.com`

## 1. Autenticación y entornos

- **OAuth2 client_credentials**: token dura ~10 años en sandbox (`expires_in: 315359991`), pero igual hay que tratarlo como si pudiera expirar — refrescar/loguear de nuevo si aparece un 401, no cachear "para siempre" sin control.
- **Uso**: `access_token` como **query param** en cada request (no header `Authorization: Bearer` — a diferencia de MercadoLibre; ver §9.1, probado en vivo que el header falla en varios endpoints inmobiliaria-scoped).
- **Logout**: `POST /v1/application/logout` revoca el token — útil si se rotan credenciales.
- **Regionalización**: Argentina/Uruguay usa el host `-zp-`. No hace falta manejar multi-país.
- **User-Agent**: recomendado (no obligatorio), formato `NombreApp/Version (email-contacto)`. Se manda igual — ayuda si hace falta soporte de Navent.

## 2. Modelo de datos: qué es un "aviso"

Un aviso (`PUT /v1/inmobiliarias/{codigoInmobiliaria}/avisos/{codigoAviso}`) es upsert: si `codigoAviso` no existe lo crea, si existe lo actualiza completo (no parcial — hay que mandar el objeto entero cada vez, igual que Tokko).

Campos principales (confirmados contra el Swagger real):
- `codigoAviso` (ID único propio — usar el `id` de Tokko o el `_id` de Mongo de la Property)
- `titulo`, `descripcion`
- `tipoDePropiedad: { idTipo, idSubTipo }` — resolver los IDs vía `/v1/tipopropiedades` y `/v1/tipopropiedades/{id}/subtipos`, no inventarlos
- `localizacion: { idUbicacion, direccion, codigoPostal, latitud, longitud, muestraMapa }` — `idUbicacion` sale de `/v1/ubicaciones` o de `/v1/ubicaciones/latitud/{lat}/longitud/{long}/countrycode/AR` (se puede resolver a partir del `geo_lat`/`geo_long` que ya está en `Property.model.js`)
- `precios: [{ operacion, moneda, monto }]` — array, no objeto único (una propiedad puede tener venta Y alquiler a la vez)
- `caracteristicas: [{ id, valor }]` — atributos tipados por tipo de propiedad (superficie, ambientes, baños, etc.), sacados de `/v1/tipopropiedades/{id}/caracteristicas`. La doc sugiere fuerte incluir `SUPERFICIE_TOTAL`, `MEDIO_BANO`, `GARAGE` para evitar warnings de calidad.
- `multimedia: { imagenes, planos, recorridos360, videos }` — imágenes con `urlImagenOriginal` (URL pública, no upload de archivo). Clave: las fotos ya están servidas públicamente desde `apicrm.silviafernandezpropiedades.com.ar/uploads/...`, así que solo hay que mandar esas URLs.
- `publicacion: { tipoDePublicacion }` — el plan (`SIMPLE`, `DESTACADO`, `HOME`, o sus variantes `_COMBO_ZONA_DEMAND`). **Chequear `/v1/inmobiliarias/{cod}/disponibilidad` antes de publicar** para no pedir un plan sin crédito (si no, error `ERR-0502`).
- `publicador: { codigoInmobiliaria, nombreDeContacto, emailDeContacto, telefonoDeContacto, emailAsesor }`

**Desarrollos** (edificios/emprendimientos con unidades) usan otro endpoint (`/v1/inmobiliarias/{cod}/desarrollos/{codigoDesarrollo}`): el PUT lleva el desarrollo padre + el **array completo de unidades** cada vez, y si son más de 15 unidades el procesamiento es asíncrono (queda `EN_ESPERA`, hay que volver a consultar). Fase 2, no bloqueante — solo si Silvia tiene emprendimientos.

## 3. Endpoints a usar

| Función | Endpoint | Método |
|---|---|---|
| Login | `/v1/application/login` | POST |
| Listar inmobiliarias habilitadas | `/v1/inmobiliarias` | GET |
| Créditos/planes disponibles | `/v1/inmobiliarias/{cod}/disponibilidad` | GET |
| Crear/actualizar aviso | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}` | PUT |
| Consultar aviso | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}` | GET |
| Despublicar aviso (offline, no borra) | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}` | DELETE |
| Status de un aviso (fechas, errores) | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}/status` | GET |
| Calidad de un aviso | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}/calidad` | GET |
| Performance (visitas, interesados) | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}/performance` | GET |
| Resumen de todos los avisos online | `/v1/inmobiliarias/{cod}/avisos/online/resumen` | GET |
| Asociar aviso ya existente en ZP a nuestro código | `/v1/inmobiliarias/{cod}/avisos/{codigoAviso}/asociar/{idAviso}` | PUT |
| Catálogos (tipos, ubicaciones, monedas, características, planes) | `/v1/tipopropiedades*`, `/v1/ubicaciones*`, `/v1/monedas`, `/v1/operaciones`, `/v1/publicacion/planes`, `/v1/multimedia/proveedores` | GET |
| Configurar callbacks | `/v1/configuracion/callbacks` | GET/PUT/DELETE |
| Mensajes/contactos entrantes | `/v1/inmobiliarias/{cod}/mensajes`, `/v1/inmobiliarias/{cod}/avisos/{cod}/mensajes` | GET |

## 4. Interpretación de respuestas (crítico, no opcional)

Las respuestas de PUT/DELETE de avisos traen `errors[]`, `warnings[]`, `informacion[]`:
- `errors` no vacío → la operación **falló completamente**, no asumir que el aviso quedó online.
- `warnings` no vacío pero `errors` vacío → se publicó pero con observaciones (sin planos, sin foto, coordenadas dudosas, etc.).

Códigos más relevantes para el flujo (de una tabla de ~50 entre `ERR-`, `WARN-` e `I-` relevada de la doc):
- `ERR-0502`: sin créditos para el plan → chequear disponibilidad antes.
- `ERR-0207`: ciudad/ubicación inválida → validar `idUbicacion` antes de mandar.
- `ERR-0206`: falta tipo/moneda/monto en `precios`.
- `WARN-0201`/`WARN-0207`: sin imágenes / sin planos.
- `WARN-0210`: precio en 0.

Guardar `errors`/`warnings` crudos en `Property.difusion.zonaprop` para poder mostrarlos en la UI (mismo patrón que ya existe para ML con `health_actions`).

## 5. Callbacks (para no depender de polling)

- Se configuran con `PUT /v1/configuracion/callbacks`: `url` (endpoint público propio), `authorizationHeaderKey`/`Value` (para que Navent se autentique al pegarnos), `lenguajeCallbackBody` (usar `ES`).
- Hay que **suscribirse explícitamente a los eventos** — si no, no llega nada. Eventos de interés:
  - `AVISO_ESTADO_PUBLICACION` (online/offline) y `AVISO_CALIDAD` — para reflejar estado real sin polling.
  - `CONTACTO` y `CONTACTO_MENSAJE` — leads entrantes desde ZonaProp. **Reemplaza el webhook stub `handleZonapropLead`** que ya existe (vacío) en el controller actual.
  - `CREDITO` — para saber si cambian los planes contratados sin sondear `/disponibilidad` todo el tiempo.
- Reglas de servidor: el endpoint propio tiene que responder 2xx/3xx en menos de 1.5s (nada de trabajo pesado sync — encolar y responder rápido, mismo criterio que se usó para el fix de subida de fotos). Si falla, reintentan hasta 72hs.
- La sandbox tiene endpoints para **simular eventos** (`/v1/callbacks/generacion/evento` y `.../credito`) — usarlos para probar el webhook sin depender de un contacto real en ZonaProp.

## 6. Asociar inmobiliarias / asociar avisos (flujo de autorización, no solo técnico)

Dos cosas distintas, no confundir:
- **"Asociar inmobiliarias"**: widget JS (botón de login embebido, `login-open.navent.com`) para que el dueño de la cuenta ZonaProp autorice a la integración a administrar su cuenta. Como la inmobiliaria de Silvia ya viene pre-cargada en el sandbox, ahí no hace falta — pero en producción sí, si se suma otra sucursal/cuenta.
- **"Asociar avisos"** (`PUT .../avisos/{codigoAviso}/asociar/{idAviso}`): pensado para vincular avisos que existen en ZonaProp pero **no tienen todavía ningún `codigoAviso` bajo esta cuenta** (ej. cargados a mano desde el panel web de ZonaProp). **Probado en sandbox 2026-09-02 y NO es lo que hace falta para los 176 avisos ya matcheados**: al intentar asociar el aviso de prueba (`idAviso` 59669077) a un `codigoAviso` inventado, la API devolvió `403 {"code":"no_permission","message":"El idAviso 59669077 ya esta asociado a esta integracion."}` — es decir, esos avisos **ya están bajo el control de nuestra propia cuenta de integrador**, solo que con el `codigoAviso` que ya traían (`PRO8565024`, no un ID nuestro inventado). Confirmado con `GET /v1/inmobiliarias/{cod}/avisos/PRO8565024`: devuelve el aviso **completo y editable** (título, precio, fotos, características, `publicador.emailDeContacto: "braicesfernandez@gmail.com"`) — ya manejable hoy mismo con estas credenciales, sin ningún paso previo. Ver §9.1 para el detalle completo y la implicancia para el desacople de Tokko.

## 7. Zona Demand y mapa (opcionales, no bloqueantes)

- **Mapa**: campo `localizacion.muestraMapa` con valores `APROXIMADO` / `EXACTO` / `NO`. Default razonable: `APROXIMADO` salvo que el dueño autorice mostrar dirección exacta.
- **Zona Demand**: si se contrata a futuro, el sistema convierte automáticamente `HOME`/`DESTACADO` en `HOME_COMBO_ZONA_DEMAND`/`DESTACADO_COMBO_ZONA_DEMAND` — no requiere mapeo especial, solo verificar créditos del combo. No se implementa ahora (hoy créditos `HOME` en 0).

## 8. Paso a producción

Cuando se termine y pruebe todo en sandbox: mail a `integracion@ar.quintoandar.com` pidiendo credenciales de producción (mismo patrón `client_id`/`client_secret`, contra `https://api-zp-open.navent.com`). No hay checklist formal del lado de Navent — el único requisito explícito es "tener todo probado y funcionando en sandbox".

## 9. Cómo encaja en el CRM actual (`Desktop/CRM`)

Mismo patrón que MercadoLibre, ya probado y funcionando (`mercadolibre.service.js` + `.controller.js` + `.router.js` + cron de métricas):

1. **Reemplazar** `Backend/src/controllers/zonaprop.controller.js` (hoy vacío, todo `501`) y crear `Backend/src/utils/zonaprop.service.js` con: login/token cacheado en Mongo (nuevo modelo `ZpToken`, análogo a `MlToken`), resolución de catálogos (tipos/ubicaciones/características) con cache local, mapeo `Property` → payload de aviso, upsert, manejo de errors/warnings.
2. **Extender** `Property.model.js`: agregar bloque `difusion.zonaprop` (published, url, estado, errors/warnings crudos, calidad) — mismo shape que ya existe para `difusion.mercadolibre`.
3. **Webhook de callbacks**: endpoint público nuevo (o reactivar `handleZonapropLead` con lógica real) para `CONTACTO`/`CONTACTO_MENSAJE`/`AVISO_ESTADO_PUBLICACION`/`AVISO_CALIDAD`/`CREDITO`, respondiendo rápido y procesando async.
4. **Cron opcional**: reconciliación periódica (`avisos/online/resumen` + `/calidad`) por si se pierde algún callback — igual que `mercadolibreMetrics.cron.js`.
5. **UI**: reintroducir el card/tab de ZonaProp en Difusión (se sacó el 2026-08-19 por no estar implementado) una vez que el backend funcione de punta a punta. **Pedido del usuario (2026-09-02)**: mostrar de forma detallada e intuitiva cuántos créditos/destacados hay — usar `/v1/inmobiliarias/{cod}/disponibilidad`, que ya devuelve por plan (`SIMPLE`/`DESTACADO`/`HOME`) tanto `cantidadDisponible` (créditos libres para usar) como `vencimientos` (créditos que vencen, con fecha y cantidad) — ej. hoy en sandbox: `DESTACADO: 7 disponibles`, `HOME: 0`, `SIMPLE: 1`. Complementar con el conteo real de avisos actualmente publicados por plan (agregación sobre `/avisos/online/resumen` o sobre `Property.difusion.zonaprop`, mismo patrón que el card de MercadoLibre en `Difusion.js` que ya arma tiles vía agregación de Mongo) para mostrar "usados vs. disponibles vs. por vencer" de un vistazo, no solo un número suelto.
6. **Variables de entorno nuevas**: `ZP_CLIENT_ID`, `ZP_CLIENT_SECRET`, `ZP_CODIGO_INMOBILIARIA`, `ZP_API_BASE` (sandbox ahora, prod después), `ZP_CALLBACK_AUTH_TOKEN`.

## 9.1 Estado real de implementación (verificado 2026-09-01, dentro de la ventana sandbox)

- `ZpToken.model.js` y `zonaprop.service.js` (login + cache de token + `zpRequest` con reintento en 401) ya están escritos, sin commitear. Login real probado: `scope: "read write trust"` confirmado, token válido.
- `GET /v1/inmobiliarias` **funciona** con el token de `application/login` y confirma `30023986` = "Silvia A. Fernández", no bloqueada.
- `GET /v1/tipopropiedades` **funciona** y devuelve el catálogo real (seedeado abajo).
- **Anomalía resuelta (2026-09-02):** el `securityScheme` del Swagger (`ApiKeyAuth`) está declarado igual en **todos** los endpoints como `apiKey` en **query param** `access_token`, no como header `Authorization: Bearer`. Probado en vivo: el header Bearer da `401 invalid_token` en `/disponibilidad` y `/avisos/online/resumen` con el mismo token que "funcionaba" (de forma permisiva, no correcta) en `/v1/inmobiliarias` y `/v1/tipopropiedades`. Cambiado `zpRequest()` en `zonaprop.service.js` para mandar `access_token` como query param en vez de header — confirmado con los 3 endpoints (`/disponibilidad`, `/avisos/online/resumen`, catálogos) funcionando de punta a punta contra sandbox real, corriendo el código del service (no solo curl).
- **Hallazgo importante:** `/avisos/online/resumen` devuelve **192 avisos ya online** para el código `30023986`, con `codigoAviso` tipo `PRO8565024` y `claveInterna` tipo `SHO8501202`/`SHL7884645`/`SLO6838514` — el número en `claveInterna` coincide con IDs de Tokko (ej. `SHO8501202` ↔ propiedad Tokko `8501202`, mismo ID que aparece en las URLs de `static.tokkobroker.com/pictures/8501202_...`). Esto confirma que **Silvia ya publica en ZonaProp hoy**, casi seguro vía la sindicación nativa de Tokko a portales (no vía esta integración nueva) — y que el ambiente sandbox viene con un espejo realista del catálogo de producción, no datos ficticios.
- **Decisión (2026-09-02):** consistente con el objetivo de fondo del CRM (independizarse por completo de Tokko — ver `PLAN.md` línea 12), esta integración por API **reemplaza** la sindicación Tokko→ZonaProp, no convive con ella.
- **Reconciliación corrida (2026-09-02, de solo lectura, sandbox):** de los 192 avisos online, **176 (91.7%) matchean** por ID numérico con un `Property.id` que ya tenemos en Mongo (`Property.id` = ID de Tokko, ver `Property.model.js:130`). Quedan **16 sin match**: propiedades que ya no están en la sync activa de Tokko (bajas, alquileres temporarios vencidos, etc.) — varias comparten el mismo `claveInterna`/Tokko ID en dos `codigoAviso` distintos (ej. `SHO7296499` en `PRO8534682` y `PRO8534683`), lo que sugiere que ya hay algo de duplicación existente del lado de ZonaProp, previa a esta integración. Se resuelven caso por caso más adelante, no bloquean el resto.
- **¡Importante — respuesta a "van a poder subirse con el mismo ID"! (2026-09-02):** probado en sandbox que **NO hace falta "asociar" ni recrear nada** para los 176 matcheados. Son ya accesibles hoy mismo con nuestras propias credenciales usando el `codigoAviso` que ya tienen asignado (ej. `PRO8565024`, no un ID inventado por nosotros): `GET /v1/inmobiliarias/{cod}/avisos/PRO8565024` devuelve el aviso **completo y editable** (título, precio, características, fotos, `publicador.emailDeContacto: "braicesfernandez@gmail.com"` — la misma cuenta). Esto significa:
  - El listado en ZonaProp (URL pública, historial, leads acumulados, antigüedad para SEO) **es el mismo objeto, no uno nuevo** — no se "resube", se sigue actualizando con `PUT` al mismo `codigoAviso` de siempre.
  - El "mismo ID" que importa de cara al público (la URL del aviso en zonaprop.com.ar) **no cambia en ningún momento** de este proceso — nunca se crea un aviso nuevo para las 176 propiedades que ya están online.
  - Para que el desacople sea seguro, el `zonaprop.service.js` necesita guardar el mapeo `Property.id` (Tokko) ↔ `codigoAviso` existente (`PRO########`) para esos 176 — se obtiene una sola vez leyendo `claveReferencia`/`claveInterna` de `/avisos/online/resumen` (formato `S` + tipo + Tokko id, ej. `SHO8501202` → Tokko id `8501202`) y guardando la relación en Mongo (nuevo campo `Property.difusion.zonaprop.codigoAviso`, no inventar un código nuevo para estos).
  - Recién para propiedades que Silvia tenga y **nunca** fueron publicadas en ZonaProp (no aparecen en `/avisos/online/resumen`), ahí sí se crea un aviso nuevo con un `codigoAviso` propio (usar `Property.id`, más simple y consistente que un GUID).
  - El apagado de la sindicación de Tokko, entonces, no requiere ninguna "migración" especial del lado de ZonaProp: el día que se apague, el aviso simplemente sigue vivo con los últimos datos que nuestro sistema haya mandado — porque ya es nuestra cuenta la que lo controla, no depende de que Tokko lo siga "recreando".
- **Bonus — payload real relevado:** `GET /v1/inmobiliarias/{cod}/avisos/PRO8565024` trajo el objeto completo de un aviso real, con estructura exacta de `tipoDePropiedad` (`idTipo`/`idSubTipo`), `caracteristicas` (array `{id, nombre, valor, idValor}` — ej. `CFT1` = `PRINCIPALES|AMBIENTE`, `CFT100` = `MEDIDAS|SUPERFICIE_TOTAL`), `precios`, `localizacion`, `multimedia.imagenes` (con `urlImagenOriginal` apuntando a `static.tokkobroker.com`, confirmando que hoy Tokko sigue siendo la fuente de esas fotos — a futuro deberían apuntar a `apicrm.silviafernandezpropiedades.com.ar`) y `publicador`. Esto sirve de referencia directa y confiable para la función de mapeo `Property` → payload del paso 3.

**Catálogo real `/v1/tipopropiedades` (17 tipos, 3 categorías):**
| id | categoría | nombre |
|---|---|---|
| 1 | Residencial | Casa |
| 2 | Residencial | Departamento |
| 2001 | Residencial | PH |
| 11 | Residencial | Quinta Vacacional |
| 14 | Residencial | Rancho |
| 2000 | Residencial | Bóveda, nicho o parcela |
| 26 | Industrial | Terrenos |
| 4 | Comercial | Oficina comercial |
| 5 | Comercial | Local comercial |
| 7 | Comercial | Edificio |
| 8 | Comercial | Bodega-Galpon |
| 10 | Comercial | Consultorio |
| 32 | Comercial | Cochera |
| 38 | Comercial | Hotel |
| 45 | Comercial | Depósito |
| 99 | Comercial | Fondo de comercio |
| 2005 | Comercial | Cama Náutica |

Nota: falta el subtipo (`/v1/tipopropiedades/{id}/subtipos`) y las características (`/v1/tipopropiedades/{id}/caracteristicas`) por tipo — quedó pendiente por el cierre de la ventana horaria, se releva la próxima sesión dentro de horario hábil (Lu-Vi 07:00–20:55 ART).

## 10. Riesgos / decisiones pendientes antes de tocar código

- **Mapeo de catálogos**: `tipoDePropiedad`, `caracteristicas` y `ubicacion` de ZonaProp no calzan 1:1 con los campos que vienen de Tokko en `Property.model.js` — armar una tabla de mapeo explícita con las respuestas reales de `/v1/tipopropiedades` y `/v1/ubicaciones` (catálogos largos, todavía no relevados en detalle — pendiente al arrancar código).
- **Duplicados**: si Silvia ya tiene avisos cargados manualmente en ZonaProp, el primer paso técnico real (antes de cualquier PUT) es correr `/avisos/online/resumen` y decidir asociar vs. crear nuevo.
- **Créditos limitados**: hoy sandbox tiene 0 créditos `HOME` — probar solo con `SIMPLE`/`DESTACADO` o pedir que carguen más si hace falta testear ese plan.

## 11. Implementación completa en sandbox (2026-09-02)

Todo el flujo de punta a punta quedó escrito y **probado contra el sandbox real** (no solo leído de la doc) en esta sesión. Estado por paso:

1. ✅ `zonaprop.service.js`: login + cache de token + wrapper de request autenticado. Auth por query param `access_token` (ver §9.1).
2. ✅ Catálogos: `/v1/tipopropiedades` relevado completo (17 tipos). Solo 5 tipos existen hoy en Mongo (`Casa` 105, `Terreno` 53, `Departamento` 25, `Hotel` 22, `Local` 13) — se relevaron sus subtipos/características reales y se armó `TYPE_MAP` en `zonaprop.service.js`: `Casa→{idTipo:1,idSubTipo:46}`, `Departamento→{idTipo:2,idSubTipo:38}`, `Terreno→{idTipo:26}`, `Hotel→{idTipo:38}`, `Local→{idTipo:5}` (Terreno/Hotel/Local no tienen subtipos en el catálogo de ZP). Si aparece un tipo nuevo no mapeado, `resolvePropertyType()` tira error explícito en vez de adivinar.
3. ✅ Reconciliación real corrida y **persistida** en Mongo: de 192 avisos ya online, **154 propiedades** quedaron con `difusion.zonaprop.codigoAviso` guardado (más 22 avisos duplicados que apuntan a una propiedad ya vinculada por otro aviso — señal de que ya había algo de duplicación en ZonaProp antes de esta integración, ver nota abajo). 16 sin match (bajas de Tokko).
4. ✅ Mapeo `Property` → payload de aviso (`mapPropertyToZpAviso`) + `syncProperty()` (upsert real vía `PUT`), con parseo de `errors`/`warnings` y guardado en `Property.difusion.zonaprop`. **Probado en vivo contra sandbox** con una propiedad de cada uno de los 5 tipos existentes + la propiedad ya reconciliada — las 6 quedaron `published: true`, 0 errores.
5. ✅ Webhook de callbacks (`POST /api/zonaprop/webhook/callback`, público) + `configureCallbacks()`/`getCallbacksConfig()` para `PUT /v1/configuracion/callbacks` y suscripción a `CONTACTO`, `CONTACTO_MENSAJE`, `AVISO_ESTADO_PUBLICACION`, `AVISO_CALIDAD`, `CREDITO`. **Limitación real, no resuelta hoy**: no se puede probar la entrega end-to-end desde acá porque Navent necesita pegarle a una URL pública (el VPS), y no se corrió `configureCallbacks()` contra el sandbox porque `BACKEND_PUBLIC_URL` está vacío en local. El parseo del body usa nombres de campo con fallbacks (`codigoAviso || referencia || code`, etc.) porque la doc scrapeada de Notion mostraba variantes de idioma con nombres de campo inconsistentes entre sí para el mismo evento — **hay que confirmar contra el primer evento real capturado** una vez that esté desplegado (el código ya loguea el body crudo si no reconoce el `tipoEvento`).
6. ✅ Cron de reconciliación diaria (`zonapropReconcile.cron.js`, 5am) registrado en `index.js`.
7. ✅ UI: card de ZonaProp en la sección Difusión general (stats por plan, panel de créditos disponibles/vencimientos con el detalle pedido, botones "Sincronizar ZonaProp" y "Reconciliar existentes") **y** card de ZonaProp dentro de la pestaña Difusión de cada propiedad (`PropertyDetail.js`, mismo patrón que la card de MercadoLibre). Verificado con `next build` (compila limpio) — no se pudo probar visualmente en el navegador logueado sin tocar la contraseña real del usuario, así que falta el chequeo visual en vivo.
8. ⬜ **No hecho, a propósito**: mail a `integracion@ar.quintoandar.com` pidiendo credenciales de producción. Es una comunicación real hacia un tercero en nombre del negocio — se manda cuando el usuario lo confirme, no antes.
9. ⬜ **Fast-follow, no bloqueante**: mapear el checklist de Servicios/Ambientes (`Property.manual_tags`) a las características tipo Checkbox de ZonaProp (`GENERALES|PILETA`, `AMBIENTES|BALCON`, etc. — catálogo completo relevado en la sesión, ~60 características por tipo). Hoy el aviso se publica sin "características secundarias" (genera `WARN-0205`, no bloqueante).

**Bugs reales encontrados y corregidos en el camino** (todos verificados con una llamada real al sandbox, no supuestos):
- `resolveUbicacion()` tomaba el primer elemento del array que devuelve `/v1/ubicaciones/latitud/.../longitud/...` (nivel país) en vez del nivel ciudad (`V1-C-`) → `ERR-0207 ciudad no definida`. Corregido para buscar el prefijo `V1-C-`.
- `total_surface` de Tokko viene en `"0.00"` para varias propiedades (dato real, no vacío) — la superficie real vive en el campo genérico `surface`. Si se manda el 0 literal, ZonaProp dispara `WARN-0215` y de todos modos usa la superficie cubierta como default, perdiendo el dato real. Corregido: si `total_surface` es 0/vacío, usar `surface`.
- La característica `UNIDAD_DE_MEDIDA` (`CON1`) espera el `idValor` en minúscula (`m2`), no `M2` — corregido (antes generaba un warning cosmético).

## Cómo retomar

Lo único que falta para que esto esté 100% operativo en sandbox es un chequeo visual en el navegador (login real) y, cuando el usuario lo pida explícitamente: correr "Configurar callbacks" (botón agregado en la card de ZonaProp en Difusión, dispara `configureCallbacks()`) una vez deployado a una URL pública, y mandar el mail pidiendo credenciales de producción (§8, texto ya redactado, sin enviar — se lo pasé al usuario 2026-09-02).

**Deploy 2026-09-02:** todo el trabajo de esta sesión quedó pusheado a `origin/main` (commits `db598e0` + merge `2e4f241` con un fix de MercadoLibre que alguien había commiteado directo en el VPS — sin conflicto). El usuario agregó las variables `ZP_*` al `.env` de producción (con `ZP_API_BASE` todavía apuntando a sandbox a propósito). Falta que el usuario haga `git pull` + reinicio del backend en el VPS, y después apretar "Configurar callbacks" desde la UI.
