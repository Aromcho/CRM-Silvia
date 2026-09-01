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
- **Uso**: header `Authorization: Bearer <token>` en cada request (el Swagger también acepta `access_token` como query param, pero se usa el header — mismo patrón que la integración de MercadoLibre).
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
- **"Asociar avisos"** (`PUT .../avisos/{codigoAviso}/asociar/{idAviso}`): vincula avisos que **ya existen en ZonaProp** (cargados manualmente antes de la integración) a un `codigoAviso` interno, para no duplicarlos. Relevante de entrada: si Silvia ya tiene propiedades publicadas manualmente en ZonaProp, listarlas (`/avisos/online/resumen`) y asociarlas antes de empezar a hacer PUT normales, para no crear duplicados.

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
5. **UI**: reintroducir el card/tab de ZonaProp en Difusión (se sacó el 2026-08-19 por no estar implementado) una vez que el backend funcione de punta a punta.
6. **Variables de entorno nuevas**: `ZP_CLIENT_ID`, `ZP_CLIENT_SECRET`, `ZP_CODIGO_INMOBILIARIA`, `ZP_API_BASE` (sandbox ahora, prod después), `ZP_CALLBACK_AUTH_TOKEN`.

## 9.1 Estado real de implementación (verificado 2026-09-01, dentro de la ventana sandbox)

- `ZpToken.model.js` y `zonaprop.service.js` (login + cache de token + `zpRequest` con reintento en 401) ya están escritos, sin commitear. Login real probado: `scope: "read write trust"` confirmado, token válido.
- `GET /v1/inmobiliarias` **funciona** con el token de `application/login` y confirma `30023986` = "Silvia A. Fernández", no bloqueada.
- `GET /v1/tipopropiedades` **funciona** y devuelve el catálogo real (seedeado abajo).
- **Anomalía sin resolver:** `GET /v1/inmobiliarias/{cod}/disponibilidad` y `GET /v1/inmobiliarias/{cod}/avisos/online/resumen` devuelven `401 invalid_token` con el **mismo** token que sí funciona para `/v1/inmobiliarias` y `/v1/tipopropiedades`, probado en el mismo instante (no es un tema de expiración ni de ventana horaria). Antes de seguir con el paso 2 (mapeo de catálogos) hay que confirmar contra el Swagger real si estos dos endpoints necesitan un token distinto (¿flujo de "asociar inmobiliarias" / token autorizado por el dueño de cuenta, a pesar de que la doc dice que en sandbox ya viene pre-cargada?) o si es un problema de la ruta/parámetros. **No asumir una causa sin confirmarla contra el Swagger** — mismo criterio que evitó el bug de `distanciaMar`.

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

## Por dónde arrancar

El bloqueante de todo lo demás es el service de auth + el mapeo de catálogos. Orden sugerido:
1. ✅ `zonaprop.service.js`: login + cache de token + wrapper de request autenticado. **Hecho 2026-09-01** (`Backend/src/utils/zonaprop.service.js` + `Backend/src/models/ZpToken.model.js`, sin commitear todavía). Login real probado contra sandbox, funciona.
2. 🔶 Relevar catálogos reales (`/v1/tipopropiedades`, `/v1/ubicaciones`, características) y armar la tabla de mapeo contra los campos de Tokko. **A medias**: `/v1/tipopropiedades` ya relevado (ver §9.1, 17 tipos). Falta `/v1/tipopropiedades/{id}/subtipos`, `/v1/tipopropiedades/{id}/caracteristicas` y `/v1/ubicaciones`.
   **Arrancar la próxima sesión por acá:** primero resolver la anomalía del §9.1 (401 en `/disponibilidad` y `/avisos/online/resumen` con un token que sí sirve para otros endpoints) contra el Swagger real — sin eso no sabemos si el resto de los endpoints "inmobiliaria-scoped" van a fallar igual. Recién después seguir relevando subtipos/características/ubicaciones. Requiere estar dentro de la ventana sandbox (Lu-Vi 07:00–20:55 ART).
3. Función de mapeo `Property` → payload de aviso + upsert (`PUT`) contra un aviso de prueba.
4. Manejo de `errors`/`warnings` + guardado en `difusion.zonaprop`.
5. Callbacks (webhook + suscripción a eventos) usando el simulador de sandbox para probar sin depender de eventos reales.
6. UI de Difusión + cron de reconciliación.
7. Mail a `integracion@ar.quintoandar.com` avisando que la integración quedó probada y funcionando de punta a punta en sandbox, solicitando las credenciales de producción (ver §8 — mismo patrón `client_id`/`client_secret`, contra `https://api-zp-open.navent.com`).
