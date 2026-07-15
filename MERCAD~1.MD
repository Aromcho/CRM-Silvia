MercadoLibre - API de Inmuebles: Guia de integracion para tu CRM
======================================================

Portal oficial de referencia: https://developers.mercadolibre.com.ar/es_ar/introduccion-guia-de-inmuebles

Esta guia resume todo lo necesario para conectar tu CRM inmobiliario con MercadoLibre: crear la app, autenticarte, publicar propiedades, actualizarlas, y sobre todo, recibir los contactos/leads de compradores interesados para que caigan directo en tu CRM.


1. Que permite hacer la API de Inmuebles
-----------------------------------------

- Publicar propiedades (casas, deptos, terrenos, oficinas, etc.) en tiempo real.
- Actualizar precio, disponibilidad, atributos y fotos sin entrar a la plataforma.
- Consultar propiedades publicadas con filtros (ciudad, barrio, tipo, precio).
- Recibir "leads": contactos de WhatsApp, preguntas, llamadas, agendamiento de visitas y cotizaciones.
- Recibir notificaciones (webhooks) en tiempo real de cualquier cambio.

Casos tipicos: inmobiliarias que sincronizan su stock desde su propio sistema, desarrolladoras con proyectos en preventa, portales que integran varios CRMs.


2. Requisitos previos
-----------------------

1. Cuenta de MercadoLibre (la del pais donde vas a operar, ej. mercadolibre.com.ar, .cl, .mx, etc.)
2. Crear una aplicacion en el portal de developers: https://developers.mercadolibre.com.ar/es_ar/crea-una-aplicacion-en-mercado-libre-es
   - Obtienes `Client ID` y `Client Secret`.
   - Debes definir al menos una `Redirect URI` (puede ser una URL de prueba).
3. Con esas credenciales generas los `Access Tokens` para llamar a la API.
4. IMPORTANTE: antes de hacer pruebas reales, crea un **usuario de prueba** (test user) para no generar publicaciones ni cargos en tu cuenta real. Guia: "Pasos rapidos para publicar un inmueble de prueba".
5. Para publicar inmuebles como inmobiliaria necesitas: registrar tu cuenta como empresa inmobiliaria y contratar un "paquete de publicaciones" (promotion pack) desde MyML (https://www.mercadolibre.cl/seller-packs/publications, cambia el dominio segun tu pais).

Primera prueba de conexion:
```
curl -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/users/me
```
Si responde 200 OK con tus datos de usuario, la conexion funciona.


3. Autenticacion OAuth 2.0 (paso a paso)
-------------------------------------------

Doc oficial: https://developers.mercadolibre.com.ar/es_ar/obtencion-del-access-token

**Flujo (Authorization Code Grant):**

1. Redirige al usuario (o abre en el navegador logueado) a:
```
https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=$APP_ID&redirect_uri=$REDIRECT_URL
```
(Cambia el dominio `auth.mercadolibre.com.ar` segun el pais: .com.ar, .com.mx, .com.br, etc.)

2. MercadoLibre redirige a tu `redirect_uri` con un parametro `code`:
```
https://TU_REDIRECT_URI?code=CODIGO_DE_AUTORIZACION
```

3. Con ese `code`, pides el Access Token:
```
curl -X POST \
  -H "accept: application/json" \
  -H "content-type: application/x-www-form-urlencoded" \
  'https://api.mercadolibre.com/oauth/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id=$client_id' \
  -d 'client_secret=$client_secret' \
  -d 'code=$code' \
  -d 'redirect_uri=$redirect_uri'
```

Respuesta:
```json
{
  "access_token": "APP_USR-0303456-053009-cc03aaf33-123456",
  "token_type": "Bearer",
  "expires_in": 21600,
  "scope": "offline_access",
  "user_id": 123456,
  "refresh_token": "TG-0303456abc-123456"
}
```

**Datos clave:**
- El `access_token` dura 6 horas (21600 seg).
- El `refresh_token` dura ~6 meses y sirve para renovar el access token sin que el usuario vuelva a loguearse. Guardalo en tu CRM asociado a cada cuenta conectada.
- Doc de recomendaciones de tokens: https://developers.mercadolibre.com.ar/es_ar/recomendaciones-de-autorizacion-y-token


4. Publicar una propiedad (endpoint principal)
-----------------------------------------------

Doc: https://developers.mercadolibre.com.ar/es_ar/publica-inmueble y guia rapida https://developers.mercadolibre.com.ar/es_ar/pasos-rapidos-para-publicar-un-inmueble-de-prueba

Endpoint: `POST https://api.mercadolibre.com/items`

Ejemplo real (adaptado de la doc oficial, caso Chile):

```bash
curl --location 'https://api.mercadolibre.com/items' \
--header 'Authorization: Bearer $ACCESS_TOKEN' \
--header 'Content-Type: application/json' \
--data '{
  "title": "Venta Casa 4 ambientes La Estrella",
  "listing_type_id": "silver",
  "category_id": "MLC157520",
  "currency_id": "CLP",
  "price": 100000000,
  "available_quantity": 1,
  "condition": "used",
  "attributes": [
    { "id": "TOTAL_AREA", "value_struct": { "number": 4300, "unit": "m²" } },
    { "id": "COVERED_AREA", "value_struct": { "number": 390, "unit": "m²" } },
    { "id": "BEDROOMS", "value_name": "4" },
    { "id": "FULL_BATHROOMS", "value_name": "5" },
    { "id": "PARKING_LOTS", "value_name": "2" }
  ],
  "location": {
    "address_line": "H-20, La Estrella, O'\''Higgins, Chile",
    "neighborhood": { "id": "", "name": "" },
    "city": { "id": "TUxDQ0xBWmE0Y2Zm", "name": "La Estrella" },
    "state": { "id": "TUxDUE9IUzFjODg", "name": "Libertador B. O'\''Higgins" },
    "country": { "id": "CL", "name": "Chile" },
    "latitude": -34.2065985,
    "longitude": -71.6742634
  },
  "pictures": [
    { "source": "https://tu-servidor.com/foto1.jpg" }
  ]
}'
```

**Campos clave:**
| Campo | Obligatorio | Notas |
|---|---|---|
| `category_id` | Si | Categoria final segun tipo/operacion (casa venta, depto alquiler, etc.) |
| `listing_type_id` | Si | Paquete contratado: `silver`, `gold`, `gold_premium` |
| `currency_id` | Si | ID de moneda del pais |
| `price` | Si | Precio de venta/alquiler |
| `available_quantity` | Si | Siempre `1` para inmuebles |
| `condition` | Si | `new`, `used` o `not_specified` |
| `location` | Si | Minimo ciudad o barrio |
| `pictures` | Desde 20/ene/2026 es **obligatorio** al menos 1 imagen si el `listing_type_id` es `silver` |

Titulo recomendado: `Tipo de Operacion (Venta/Alquiler) + Tipo de Propiedad + Ambientes + Barrio`. Sin adjetivos ni abreviaciones.

La descripcion se carga aparte (no en el POST inicial):
```bash
curl -X POST 'https://api.mercadolibre.com/items/$ITEM_ID/description' \
  -H 'Authorization: Bearer $ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "plain_text": "Descripcion en texto plano, sin telefono ni datos de contacto." }'
```
Nota: no incluir telefono/direccion/sitio web en la descripcion, se modera la publicacion.

Datos de contacto del vendedor (opcional, incluye WhatsApp con `area_code2`/`phone2`):
```json
"seller_contact": {
  "contact": "Nombre Contacto",
  "area_code": "11",
  "phone": "4444-5555",
  "area_code2": "21",
  "phone2": "1111-3333",
  "email": "contacto@tudominio.com"
}
```


5. Atributos obligatorios por categoria
------------------------------------------

Doc: https://developers.mercadolibre.com.ar/es_ar/atributos-inmuebles

Antes de publicar, consulta los atributos requeridos de tu categoria:
```
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' \
  https://api.mercadolibre.com/categories/$CATEGORY_ID/attributes
```
Cualquier atributo con `"tags": {"required": true}` debe enviarse si o si.

Atributos que casi siempre son obligatorios en inmuebles:
- `MAINTENANCE_FEE` - gasto comun / expensas (valor monetario mensual)
- `IS_SUITABLE_FOR_PETS` - admite mascotas (Si/No)
- `PARKING_LOTS` - cantidad de estacionamientos (numero)
- `WAREHOUSES` - bodegas/storage (numero)
- `FULL_BATHROOMS` - banos completos (numero)
- `FURNISHED` - amoblado (Si/No)
- `TOTAL_AREA` / `COVERED_AREA` - superficie total/util
- `BEDROOMS` - dormitorios

Minimo de fotos por tipo de propiedad (afecta calidad de publicacion):
- Casas/Deptos/Oficinas/Parcelas: 12 fotos
- Locales/Agricolas/Sitios/Terrenos/Bodegas/Loteos: 6 fotos
- Estacionamientos: 4 fotos

Categorias: https://developers.mercadolibre.com.ar/es_ar/categorias-inmuebles
Ubicacion (paises/ciudades/barrios): https://developers.mercadolibre.com.ar/es_ar/localizar-inmuebles


6. Actualizar publicaciones existentes
-----------------------------------------

Doc: https://developers.mercadolibre.com.ar/es_ar/actualiza-tus-publicaciones

Se actualiza con `PUT https://api.mercadolibre.com/items/$ITEM_ID` enviando solo los campos que cambian (precio, disponibilidad, atributos, fotos, estado). Util para sincronizar cambios hechos en tu CRM hacia MercadoLibre.

Ciclo de vida de publicaciones (activa, pausada, cerrada, etc.): https://developers.mercadolibre.com.ar/es_ar/ciclo-de-vida-de-las-publicaciones-de-inmuebles


7. Leads: como llegan los contactos interesados a tu CRM (lo mas importante para vos)
----------------------------------------------------------------------------------------

Doc: https://developers.mercadolibre.com.ar/es_ar/leads-inmuebles

Un "lead" es cualquier interaccion de un comprador interesado: boton de WhatsApp, pregunta, llamada, agendar visita o pedir cotizacion.

**Consultar todos los leads de tu cuenta:**
```
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' \
  'https://api.mercadolibre.com/vis/users/$USER_ID/leads/buyers?offset=0&limit=10&date_from=2026-07-01&date_to=2026-07-09&contact_types=whatsapp,question,call,schedule,quotation'
```

Respuesta (resumida):
```json
{
  "results": [
    {
      "id": 1914813422,
      "item_id": "MLA2919342112",
      "name": "Juan Perez",
      "email": "juan@correo.com",
      "phone": "+56 9 1111 1111",
      "leads": [
        { "id": "214e7c51-...", "channel": "question", "contact_type": "question", "created_at": "2026-06-12T20:56:45Z", "status": "active" }
      ]
    }
  ],
  "paging": { "offset": 0, "limit": 10, "total": 1 }
}
```
Estos campos (`name`, `email`, `phone`) son exactamente lo que necesitas para crear un contacto/lead en tu CRM automaticamente.

**Consultar un lead puntual:**
```
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/vis/leads/$LEAD_ID
```

**Filtrar por tipo de contacto:** `contact_types=whatsapp|question|call|schedule|quotation`

**Nota sobre preguntas:** el texto de la pregunta no viene en el lead; hay que consultarlo aparte:
```
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/questions/$QUESTION_ID?api_version=4
```

Solicitud de visitas: https://developers.mercadolibre.com.ar/es_ar/solicitud-de-visita
Estadisticas de interacciones (metricas de las publicaciones): https://developers.mercadolibre.com.ar/es_ar/estadisticas-de-interacciones-en-inmuebles


8. Notificaciones en tiempo real (webhooks) - para sincronizar sin hacer polling
------------------------------------------------------------------------------------

Doc: https://developers.mercadolibre.com.ar/es_ar/productos-recibe-notificaciones

En vez de consultar la API todo el tiempo, configura una URL de callback en tu app (gestor de aplicaciones) y suscribite a los topicos relevantes. MercadoLibre te va a mandar un `POST` cada vez que pase algo.

**Topico clave para tu CRM: `vis_leads`** (reemplaza al viejo topico de preguntas para inmuebles/vehiculos). Subtopicos: `whatsapp`, `call`, `question`, `contact_request`, `reservation`, `quotations`, `visit_request`.

Ejemplo de notificacion recibida:
```json
{
  "resource": "/vis/leads/14b52fd8-85dc-11eb-8436-2753cb1f9665",
  "user_id": 123456789,
  "topic": "vis_leads",
  "actions": ["whatsapp"],
  "sent": "2026-05-09T13:44:33.006Z"
}
```
Con el `resource`, haces un GET normal para traer el detalle completo y cargarlo en tu CRM al instante.

Otros topicos utiles:
- `items`: cualquier cambio en una publicacion (precio, estado, etc.)
- `orders_v2`: si en algun momento manejas ventas/reservas con pago
- `questions`: preguntas y respuestas (ojo: puede duplicar con `vis_leads-question`, activa solo uno)

**Reglas importantes:**
- Tu endpoint debe responder HTTP 200 en menos de 500ms, o MercadoLibre reintenta y puede desactivar el topico.
- Si tu servidor estuvo caido, podes recuperar notificaciones perdidas (hasta 2 dias) con:
```
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/missed_feeds?app_id=$APP_ID&topic=vis_leads
```
- Importante: el topico `quotations` de Items se elimina el 31/jul/2026; usa el subtopico `quotation` de `vis_leads` en su lugar.


9. Flujo recomendado para tu CRM
-----------------------------------

1. Cada usuario/inmobiliaria conecta su cuenta de MercadoLibre desde tu CRM (OAuth, guardas `access_token` + `refresh_token`).
2. Tu CRM publica/actualiza propiedades via `POST/PUT /items` cuando el usuario crea o edita una ficha.
3. Configuras el webhook de tu app apuntando a un endpoint tuyo (ej. `https://tucrm.com/webhooks/mercadolibre`), suscrito a `vis_leads` e `items`.
4. Cuando llega una notificacion de `vis_leads`, tu backend hace el GET del recurso y crea/actualiza automaticamente un contacto/lead en el CRM, asociado a la propiedad (`item_id`).
5. Job periodico (cron) que renueva el `refresh_token` antes de que expire y opcionalmente hace un barrido con `/leads/buyers` como respaldo del webhook.


10. Recursos y enlaces utiles
---------------------------------

- Introduccion guia de inmuebles: https://developers.mercadolibre.com.ar/es_ar/introduccion-guia-de-inmuebles
- Configuracion / requisitos previos: https://developers.mercadolibre.com.ar/es_ar/configuracion-o-requisitos-previos
- Obtencion del Access Token: https://developers.mercadolibre.com.ar/es_ar/obtencion-del-access-token
- Pasos rapidos (inmueble de prueba): https://developers.mercadolibre.com.ar/es_ar/pasos-rapidos-para-publicar-un-inmueble-de-prueba
- Categorias: https://developers.mercadolibre.com.ar/es_ar/categorias-inmuebles
- Atributos: https://developers.mercadolibre.com.ar/es_ar/atributos-inmuebles
- Localizar inmuebles: https://developers.mercadolibre.com.ar/es_ar/localizar-inmuebles
- Publica inmuebles: https://developers.mercadolibre.com.ar/es_ar/publica-inmueble
- Actualiza tus publicaciones: https://developers.mercadolibre.com.ar/es_ar/actualiza-tus-publicaciones
- Ciclo de vida de publicaciones: https://developers.mercadolibre.com.ar/es_ar/ciclo-de-vida-de-las-publicaciones-de-inmuebles
- Leads: https://developers.mercadolibre.com.ar/es_ar/leads-inmuebles
- Solicitud de visita: https://developers.mercadolibre.com.ar/es_ar/solicitud-de-visita
- Notificaciones (webhooks): https://developers.mercadolibre.com.ar/es_ar/productos-recibe-notificaciones
- Glosario de inmuebles: https://developers.mercadolibre.com.ar/es_ar/glosario-inmuebles
- Gestionar paquetes de inmuebles: https://developers.mercadolibre.com.ar/es_ar/gestionar-paquetes-de-inmuebles

Nota sobre paises: el dominio cambia segun el pais (`.com.ar` Argentina, `.cl` Chile, `.com.mx` Mexico, `.com.br` Brasil, etc.), pero la estructura de la API y los endpoints (`api.mercadolibre.com/...`) son los mismos para todos.
