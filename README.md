# Control de Prácticas

Aplicación Node.js + Express para registrar practicantes y controlar sus
asistencias de entrada y salida. PostgreSQL guarda practicantes, asistencias,
actividades, evidencias y sesiones administrativas. El frontend se sirve desde
`public/`.

Si una persona marca entrada y no registra salida, queda una asistencia
pendiente, visible en el panel de administración. El sistema bloquea otra
entrada para ese documento hasta completar o corregir el movimiento.
Durante una jornada abierta, el practicante puede guardar actividades por
separado y adjuntar fotos o videos almacenados en Cloudinary. Al enviar las
actividades se marca también la salida y se contabilizan las horas, sin esperar
la aprobación del administrador. El panel incluye una sección para aprobar u
observar cada actividad enviada.
Si la página permanece abierta, muestra un recordatorio a las cinco horas de
una entrada pendiente. Cuando el navegador lo permite, también envía una
notificación del sistema; el permiso se solicita al marcar la entrada.

## Instalación

Requiere Node.js 20.19.0 o superior y npm. En PowerShell:

```powershell
Set-Location "C:\Users\diego\Desktop\control de practicas"
npm install
```

## Variables de entorno

El panel de administración requiere credenciales. El servidor carga el archivo
`.env` al iniciar. Para configurar o cambiar las credenciales, edita ese archivo.
Las variables ya definidas en el entorno de Windows tienen prioridad sobre
`.env`; si cambiaste el archivo, reinicia el servidor y elimina posibles valores
antiguos de la ventana de PowerShell:

```powershell
Remove-Item Env:ADMIN_USER -ErrorAction SilentlyContinue
Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
```

| Variable | Requerida | Uso |
| --- | --- | --- |
| `ADMIN_USER` | Sí para el login admin | Usuario de administración. |
| `ADMIN_PASSWORD` | Sí para el login admin | Contraseña de administración; se verifica mediante bcryptjs. |
| `DATABASE_URL` | Sí | URI de conexión PostgreSQL. |
| `CLOUDINARY_CLOUD_NAME` | Sí para cargar evidencias | Nombre del cloud de Cloudinary. |
| `CLOUDINARY_API_KEY` | Sí para cargar evidencias | API key de Cloudinary. |
| `CLOUDINARY_API_SECRET` | Sí para cargar evidencias | Se usa solo en el servidor para firmar cargas; nunca la publiques en el frontend. |
| `PORT` | No | Puerto HTTP; predeterminado `3000`. |
| `CORS_ORIGINS` | No | Orígenes externos permitidos, separados por comas. Si no se define, solo solicitudes same-origin/sin `Origin`. |
| `COOKIE_SECURE` | No | Usa `true` para añadir `Secure` a la cookie en desarrollo. En `NODE_ENV=production` se añade automáticamente. |

`.env` está excluido de Git. No publiques contraseñas ni URLs de base de datos.
Las sesiones duran 12 horas y la cookie es `HttpOnly`, `SameSite=Lax` y
`Path=/`. El token de sesión se guarda hasheado en PostgreSQL y sobrevive a
cambios de instancia. El login limita a cinco intentos fallidos por IP cada 15
minutos por instancia. La contraseña configurada se verifica mediante bcryptjs.

## Arranque

```powershell
npm run dev
```

Abre <http://localhost:3000>. Para usar otro puerto:

```powershell
$env:PORT = "4000"
npm run dev
```

Para iniciar sin modo watch:

```powershell
npm start
```

Tras actualizar el esquema, aplica los cambios con `npm run init-db`. Las cargas
se hacen desde el navegador directamente a Cloudinary mediante firmas emitidas
por el servidor. Se aceptan hasta 10 evidencias por actividad; fotos de hasta
10 MB y videos de hasta 100 MB cada uno. Los formatos permitidos son JPEG, PNG,
WebP, GIF, MP4, WebM y MOV.

## Interfaz web

El frontend vanilla se sirve desde `public/` en la raíz del servidor. La
estructura modular de `public/js/` contiene el cliente HTTP, estado y tema,
componentes del panel, ventanas modales, confirmaciones y notificaciones. No
requiere frameworks, CDN ni proceso de compilación. Tras actualizar archivos,
recarga el navegador con `Ctrl+F5`.

La interfaz consume las rutas disponibles. La API no ofrece recuperación de
contraseña, cierre global de sesiones ni ajustes horarios independientes de
asistencias. Los campos de emergencia se guardan en PostgreSQL.

## Rutas y endpoints

`POST /api/admin/login` es público; las demás rutas `/api/admin/*` requieren
la cookie del administrador. Todas las rutas `/api/practicantes/*` también
requieren administrador. Las rutas de marcación `/api/asistencia/*` son
públicas y se identifican con documento.

| Método | Ruta completa | Middleware | Body esperado | Respuesta |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | Ninguno | Ninguno | `200`: estado y tipo de almacenamiento; `503` si PostgreSQL no está disponible. |
| `POST` | `/api/admin/login` | Límite: 5 intentos/IP/15 min | `{ "usuario": "...", "password": "..." }` | `200`: `{ usuario, expiraEn }` y cookie `Set-Cookie`; credenciales incorrectas `401`. |
| `GET` | `/api/admin/me` | `requireAdmin` | Ninguno | `200`: `{ usuario, expiraEn }`; sin sesión `401`. |
| `POST` | `/api/admin/logout` | `requireAdmin` | Ninguno | `204`; expira cookie. |
| `GET` | `/api/admin/practicantes` | `requireAdmin` | Ninguno | `200`: arreglo de practicantes. |
| `POST` | `/api/admin/practicantes` | `requireAdmin` | Campos de practicante indicados abajo | `201`: practicante creado; documento repetido `409`. |
| `GET` | `/api/admin/practicantes/:id` | `requireAdmin` | Ninguno | `200`: practicante; no existe `404`. |
| `PUT` | `/api/admin/practicantes/:id` | `requireAdmin` | Campos de practicante indicados abajo | `200`: practicante; conserva horas e historial. |
| `DELETE` | `/api/admin/practicantes/:id` | `requireAdmin` | Ninguno | `204`; no existe `404`. |
| `GET` | `/api/admin/asistencias` | `requireAdmin` | Ninguno | `200`: movimientos; pendientes primero. |
| `POST` | `/api/admin/practicantes/:id/asistencias` | `requireAdmin` | `{ horaEntrada, horaSalida?, descripcion? }` | `201`: asistencia manual; `horaSalida: null` crea pendiente. |
| `PATCH` | `/api/admin/asistencias/:practicanteId/:asistenciaId` | `requireAdmin` | `{ horaEntrada, horaSalida?, descripcion? }` | `200`: asistencia corregida y horas recalculadas. |
| `DELETE` | `/api/admin/asistencias/:practicanteId/:asistenciaId` | `requireAdmin` | Ninguno | `204`; descuenta las horas de la asistencia. |
| `POST` | `/api/asistencia/entrada` | Ninguno; valida documento | `{ "documento": "..." }` | `201`: movimiento abierto; salida anterior pendiente `409`. |
| `GET` | `/api/asistencia/jornada?documento=...` | Ninguno; valida documento | Documento en query | `200`: jornada abierta y borradores; `null` si no hay entrada pendiente. |
| `POST` | `/api/asistencia/actividades` | Ninguno; valida documento | `{ documento, descripcion }` | `201`: nueva actividad en borrador. |
| `PUT` | `/api/asistencia/actividades/:id` | Ninguno; valida documento | `{ documento, descripcion }` | `200`: actividad actualizada mientras la jornada está abierta. |
| `POST` | `/api/asistencia/actividades/:id/evidencias/firma` | Ninguno; valida documento | `{ documento, resourceType }` | `200`: parámetros firmados para cargar a Cloudinary. |
| `POST` | `/api/asistencia/actividades/:id/evidencias` | Ninguno; valida documento y verifica con Cloudinary | `{ documento, publicId, resourceType, nombre }` | `201`: evidencia validada y vinculada a la actividad. |
| `POST` | `/api/asistencia/salida` | Ninguno; valida documento y actividades | `{ "documento": "..." }` | `200`: envía actividades pendientes y cierra la jornada en una transacción; exige al menos una actividad. |
| `GET` | `/api/admin/actividades` | `requireAdmin` | Ninguno | `200`: actividades enviadas con estado y evidencias. |
| `PATCH` | `/api/admin/actividades/:id/revision` | `requireAdmin` | `{ estado, comentario }` donde estado es `aprobada` u `observada` | `200`: actividad revisada; comentario obligatorio para observar. |
| `POST` | `/api/practicantes` | `requireAdmin` | Campos de practicante indicados abajo | `201`: practicante creado. |
| `GET` | `/api/practicantes` | `requireAdmin` | Ninguno | `200`: arreglo de practicantes. |
| `GET` | `/api/practicantes/:id` | `requireAdmin` | Ninguno | `200`: practicante. |
| `PUT` | `/api/practicantes/:id` | `requireAdmin` | Campos de practicante indicados abajo | `200`: actualizado; conserva horas e historial. |
| `DELETE` | `/api/practicantes/:id` | `requireAdmin` | Ninguno | `204`: eliminado. |
| `POST` | `/api/practicantes/:id/horas` | `requireAdmin` | `{ horas, fecha?, descripcion? }` | `201`: practicante actualizado. |
| `GET` | `/api/practicantes/:id/progreso` | `requireAdmin` | Ninguno | `200`: resumen de progreso. |

No hay rutas `/api/auth/*`; el login está en `/api/admin/login`. Las solicitudes
con cuerpo deben usar `Content-Type: application/json`. Errores JSON:
`400` entrada inválida, `401` no autenticado, `404` ruta/recurso inexistente,
`409` conflicto y `500` error inesperado. Un origen no incluido en
`CORS_ORIGINS` no recibe encabezados CORS; el navegador bloquea el acceso
cross-origin a la respuesta.

### Campos de practicante

```json
{
  "nombreCompleto": "Ana Pérez",
  "documento": "123456789",
  "carrera": "Administración de empresas",
  "semestresCursados": 6,
  "contactoEmergencia": "María Pérez",
  "telefono": "3101234567",
  "metaHoras": 400
}
```

Nombre, documento, carrera y teléfono deben ser texto no vacío;
`semestresCursados` debe ser entero mayor o igual a cero y `metaHoras` un
número mayor que cero. El documento es único. El contacto de emergencia es
opcional para conservar compatibilidad con registros antiguos.

## Diagnóstico y pruebas PowerShell

### 1. Comprobar servidor y rutas

```powershell
$health = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/health"
$health | ConvertTo-Json -Depth 5
```

Ejemplo de respuesta:

```json
{
  "ok": true,
  "version": "1.0.0",
  "hora": "2026-10-02T19:00:00.000Z",
  "endpoints": ["GET /api/health (público)"]
}
```

La lista real contiene todos los endpoints de la tabla.

### 2. Iniciar sesión y comprobar la cookie

```powershell
$base = "http://localhost:3000"
$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{
  usuario = $env:ADMIN_USER
  password = $env:ADMIN_PASSWORD
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "$base/api/admin/login" `
  -ContentType "application/json" -Body $loginBody -WebSession $web
$login | ConvertTo-Json
$web.Cookies.GetCookies([uri]$base) | Select-Object Name, HttpOnly, Path
```

El comando `Select-Object` muestra la cookie en la sesión de PowerShell; el
JavaScript del navegador no puede leerla porque es `HttpOnly`.

### 3. Crear, listar y obtener practicante

```powershell
$practicanteBody = @{
  nombreCompleto = "Ana Pérez"
  documento = "123456789"
  carrera = "Administración de empresas"
  semestresCursados = 6
  telefono = "3101234567"
  metaHoras = 400
} | ConvertTo-Json

$practicante = Invoke-RestMethod -Method Post -Uri "$base/api/admin/practicantes" `
  -ContentType "application/json" -Body $practicanteBody -WebSession $web
$practicante | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Get -Uri "$base/api/admin/practicantes" -WebSession $web |
  ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Get -Uri "$base/api/admin/practicantes/$($practicante.id)" `
  -WebSession $web | ConvertTo-Json -Depth 5
```

### 4. Marcar entrada, probar bloqueo y salida

```powershell
$marcacionBody = @{ documento = "123456789" } | ConvertTo-Json
$entrada = Invoke-RestMethod -Method Post -Uri "$base/api/asistencia/entrada" `
  -ContentType "application/json" -Body $marcacionBody
$entrada | ConvertTo-Json -Depth 5

# Una segunda entrada antes de registrar salida debe responder HTTP 409.
try {
  Invoke-RestMethod -Method Post -Uri "$base/api/asistencia/entrada" `
    -ContentType "application/json" -Body $marcacionBody
} catch {
  $_.Exception.Message
}

# Cada actividad se guarda mientras la jornada permanece abierta.
$actividadBody = @{
  documento = "123456789"
  descripcion = "Apoyo en inventario y actualización de reportes"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/api/asistencia/actividades" `
  -ContentType "application/json" -Body $actividadBody

# Enviar las actividades y cerrar la asistencia en una sola operación.
$salidaBody = @{
  documento = "123456789"
} | ConvertTo-Json
$salida = Invoke-RestMethod -Method Post -Uri "$base/api/asistencia/salida" `
  -ContentType "application/json" -Body $salidaBody
$salida | ConvertTo-Json -Depth 5
```

### 5. Revisar movimientos y corregir una asistencia pendiente

```powershell
Invoke-RestMethod -Method Get -Uri "$base/api/admin/asistencias" -WebSession $web |
  ConvertTo-Json -Depth 5

$correccion = @{
  horaEntrada = "2026-10-02T08:00:00.000Z"
  horaSalida = "2026-10-02T17:00:00.000Z"
  descripcion = "Salida corregida por administración"
} | ConvertTo-Json
Invoke-RestMethod -Method Patch `
  -Uri "$base/api/admin/asistencias/$($practicante.id)/ID_ASISTENCIA" `
  -ContentType "application/json" -Body $correccion -WebSession $web
```

Para una asistencia manual:

```powershell
$manual = @{
  horaEntrada = "2026-10-02T08:00:00.000Z"
  horaSalida = "2026-10-02T17:00:00.000Z"
  descripcion = "Registro manual del administrador"
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "$base/api/admin/practicantes/$($practicante.id)/asistencias" `
  -ContentType "application/json" -Body $manual -WebSession $web
```

### 6. Progreso, actualización y eliminación

```powershell
Invoke-RestMethod -Method Get -Uri "$base/api/practicantes/$($practicante.id)/progreso" `
  -WebSession $web | ConvertTo-Json

$actualizacion = @{
  nombreCompleto = "Ana Pérez"
  documento = "123456789"
  carrera = "Administración de empresas"
  semestresCursados = 7
  telefono = "3101234567"
  metaHoras = 420
} | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "$base/api/admin/practicantes/$($practicante.id)" `
  -ContentType "application/json" -Body $actualizacion -WebSession $web

# Ejecuta esta eliminación solo cuando quieras borrar al practicante.
# Invoke-RestMethod -Method Delete -Uri "$base/api/admin/practicantes/$($practicante.id)" -WebSession $web
Invoke-RestMethod -Method Post -Uri "$base/api/admin/logout" -WebSession $web
```

### Otros endpoints CRUD y de horas

Estas llamadas cubren los alias `/api/practicantes/*` y las operaciones
administrativas de eliminación/corrección de asistencias:

```powershell
# Alias CRUD protegido por la misma cookie de administrador.
Invoke-RestMethod -Method Get -Uri "$base/api/practicantes" -WebSession $web |
  ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Get -Uri "$base/api/practicantes/$($practicante.id)" `
  -WebSession $web | ConvertTo-Json -Depth 5

$horasBody = @{
  horas = 2.5
  fecha = (Get-Date).ToString("o")
  descripcion = "Apoyo en actividades"
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "$base/api/practicantes/$($practicante.id)/horas" `
  -ContentType "application/json" -Body $horasBody -WebSession $web

# Elimina una asistencia identificada con el ID devuelto en el historial.
# Invoke-RestMethod -Method Delete `
#   -Uri "$base/api/admin/asistencias/$($practicante.id)/ID_ASISTENCIA" `
#   -WebSession $web

# Eliminación del practicante (irreversible).
# Invoke-RestMethod -Method Delete `
#   -Uri "$base/api/practicantes/$($practicante.id)" -WebSession $web
```

### Invocar un endpoint protegido sin autenticación

Se espera un `401`; usa `try/catch` porque `Invoke-RestMethod` lanza una
excepción para respuestas HTTP de error:

```powershell
try {
  Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/admin/practicantes"
} catch {
  $_.Exception.Response.StatusCode
}
```

## Persistencia, Cloudinary y despliegue

- PostgreSQL almacena practicantes, asistencias, actividades, evidencias y
  sesiones administrativas. El cierre de jornada, el envío de actividades y el
  abono de horas se realizan juntos en una transacción.
- Aplica el esquema actualizado con `npm run init-db`. Si hay datos en
  `data/practicantes.json`, `npm run migrate-json` los importa sin borrar el
  archivo de origen.
- Crea una cuenta de Cloudinary y configura `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` en el entorno del servidor.
  Las cargas se firman en backend y se envían desde el navegador a Cloudinary;
  la API secret nunca se envía al cliente.
- Se permiten hasta 10 evidencias por actividad; fotos de hasta 10 MB y videos
  de hasta 100 MB cada uno. Los formatos aceptados son JPEG, PNG, WebP, GIF,
  MP4, WebM y MOV.
- La cookie de producción incluye `Secure`. Si frontend y API se alojan en
  dominios distintos, define `CORS_ORIGINS` con el origen exacto.

## Despliegue en Vercel

El repositorio ya contiene `api/[...path].js` para exponer la app Express a
través de las funciones de Vercel y `vercel.json` para enrutar `/api/*`. Los
archivos de `public/` se sirven como estáticos. Antes de desplegar:

1. En Vercel importa el repositorio, establece la carpeta raíz del proyecto y
   añade estas variables en **Settings → Environment Variables** para
   Production (y Preview si vas a probar previews):
   - `DATABASE_URL`: URI de conexión PostgreSQL.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y
     `CLOUDINARY_API_SECRET`: credenciales de Cloudinary.
   - `ADMIN_USER`: nombre de usuario administrativo.
   - `ADMIN_PASSWORD`: clave de administración fuerte.
2. Despliega desde el panel o, con Vercel CLI ya autenticado y enlazado:

   ```powershell
   npx vercel login
   npx vercel link
   npx vercel deploy --prod
   ```

3. Verifica `https://TU-DOMINIO/api/health`. La respuesta debe indicar
   `"almacenamiento": "postgresql"` y `"ok": true`; HTTP 503 indica que falta
   `DATABASE_URL` o que no se puede conectar a PostgreSQL.

No guardes credenciales de base de datos ni de Cloudinary en archivos
versionados. Codifica en URL los caracteres especiales que formen parte de la
contraseña del usuario de base de datos.

## Preservar Python y sustituir `main` con Node.js

Antes de sincronizar este código con GitHub, crea y publica la rama de respaldo
desde el `main` remoto actual. No sobrescribas esa rama de respaldo:

```powershell
$repo = "https://github.com/diegoaortega98/monitoreo-practicas.git"
$backup = Join-Path $env:TEMP "monitoreo-practicas-python-backup"
git clone $repo $backup
git -C $backup switch -c python-version
git -C $backup push -u origin python-version
```

Luego actualiza el checkout de trabajo basado en `main`, copiando los archivos
Node sin `.git`, `.env`, `node_modules` ni `data/practicantes.json`, y publica
un commit normal en `main`. Así queda intacta la rama Python y no se necesita
forzar el push:

```powershell
git -C $backup switch main
# Copia a ese checkout los archivos del proyecto Node, excluyendo los datos privados.
# Revisa git status y git diff antes de confirmar.
git -C $backup add -A
git -C $backup commit -m "Replace FastAPI app with Express and PostgreSQL"
git -C $backup push origin main
```

No se publica `data/practicantes.json` ni `.env`; ambos están ignorados por
Git. Confirma que `python-version` existe en GitHub antes de actualizar `main`.
