# Migración Python/FastAPI a Node.js/Express

## Alcance y evidencia

Inventario realizado en modo de solo lectura contra `main` de
`diegoaortega98/monitoreo-practicas`, commit
`4aaca13864490f8e8e1c8f2d8aaafc939c21cc74`. El acceso a la terminal en
`C:\Users\diego\Desktop` fue denegado, así que no se inspeccionó
`C:\Users\diego\Desktop\monitoreo-backup` ni se clonó el repositorio. Este
documento describe los archivos versionados encontrados en GitHub; no afirma
que la migración o la copia de seguridad remota ya se hayan ejecutado.

El árbol remoto contiene ocho módulos Python, tres páginas HTML, cuatro
archivos JavaScript de frontend y un CSS. No aparecen pruebas automatizadas ni
archivos SQL. `practicas.db` está excluido por `.gitignore` y no forma parte del
repositorio.

## Inventario por archivo

### `main.py`

- **Propósito:** aplicación FastAPI, inicialización de tablas, endpoints,
  autenticación y montaje de frontend.
- **Funciones y endpoints:** crea el administrador inicial; ejecuta un ciclo
  periódico para cerrar sesiones vencidas. Expone `POST /auth/login`,
  `POST /auth/registro`, `POST /auth/recuperacion/pregunta`,
  `POST /auth/recuperacion/clave`; `GET/PUT /practicante/seguridad`;
  CRUD `/admin/practicantes`; `POST /admin/ajustes`,
  `GET /admin/ajustes/{pid}`, `GET /admin/sesiones/{pid}`,
  `DELETE /admin/sesiones/{sid}`; `POST /practicante/entrada`,
  `POST /practicante/salida`, `GET /practicante/mi-progreso` y
  `GET /practicante/mis-sesiones`. También sirve `/`, los archivos estáticos y
  `/healthz`.
- **Dependencias:** FastAPI, CORSMiddleware, SQLAlchemy, Python standard
  library y módulos locales `models`, `schemas`, `auth`, `services`,
  `database`, `config` y `utils`.
- **Reglas:** la autenticación distingue `admin` y `practicante`; el
  practicante inactivo no puede entrar. El admin puede gestionar practicantes,
  sesiones y ajustes. La entrada no permite dos sesiones abiertas; la salida
  calcula horas y las limita a 12. El progreso informa meta, horas, porcentaje,
  finalización y sesión abierta.
- **Portar:** todos los endpoints de compatibilidad además de los endpoints
  nuevos solicitados, RBAC, respuestas equivalentes, salud y entrega de las
  páginas. En Vercel, sustituir tareas de fondo permanentes por cierre bajo
  demanda, ya que una función serverless no mantiene un ciclo `asyncio` vivo.

### `models.py`

- **Propósito:** modelos ORM y relaciones de persistencia.
- **Clases:** `Admin`, `Practicante`, `RecuperacionCuenta`, `Sesion` y
  `AjusteHoras`.
- **Dependencias:** SQLAlchemy y `database.Base`.
- **Reglas/modelo:** IDs enteros; usuario y documento de practicante únicos;
  hashes de contraseña; practicantes activos/inactivos; recuperación por
  pregunta y hash de respuesta; sesiones de asistencia con entrada, salida,
  horas, descripción y estado abierto; ajustes manuales con motivo y admin
  responsable.
- **Portar:** no confundir las sesiones de asistencia de este modelo con las
  sesiones de autenticación de la nueva especificación. Conservar ambas
  entidades con nombres/tablas distintos. Conservar recuperación por pregunta
  y ajustes firmados con su motivo y administrador.

### `schemas.py`

- **Propósito:** contratos de entrada/salida y validación Pydantic.
- **Clases:** `Token`, `PracticanteCreate`, `RegistroPracticante`,
  `PreguntaRecuperacionIn/Out`, `RestablecerClaveIn`,
  `ConfigurarSeguridadIn`, `SeguridadConfiguradaOut`, `PracticanteUpdate`,
  `PracticanteOut`, `ProgresoOut`, `SesionOut`, `SesionCerrar`,
  `AjusteCreate` y `AjusteOut`; declara también las preguntas de seguridad
  admitidas.
- **Dependencias:** Pydantic y `datetime`.
- **Validaciones:** nombre >= 3, documento >= 5, carrera >= 2,
  semestres entre 1 y 20, contacto >= 3, meta > 0, usuario >= 3,
  contraseña >= 6, teléfono >= 7; respuesta de seguridad entre 3 y 200;
  cambios de admin opcionales.
- **Portar:** las mismas restricciones, preguntas y formas de respuesta. La
  contraseña nunca se devuelve en modelos públicos.

### `database.py`

- **Propósito:** crea engine y sesiones SQLAlchemy.
- **Funciones/configuración:** `DATABASE_PATH` se puede configurar; por
  defecto usa `practicas.db` junto al módulo. SQLite usa
  `check_same_thread=False`; provee `SessionLocal`, `Base` y `get_db`.
- **Dependencias:** SQLAlchemy y `os`/`pathlib`.
- **Reglas:** instancia SQLite local y garantiza la carpeta del archivo.
- **Portar:** usar PostgreSQL/Neon mediante `DATABASE_URL`, con migraciones
  transaccionales. El archivo SQLite no está versionado; hace falta exportarlo
  desde su ubicación real si se deben preservar cuentas y actividad existentes.

### `services.py`

- **Propósito:** cierre automático de sesiones de asistencia olvidadas.
- **Funciones:** normaliza datetimes; `cerrar_sesiones_vencidas` cierra todas
  las entradas con más de `MAX_HORAS_SESION`; `cerrar_sesion_abierta_de`
  verifica y cierra la sesión de un practicante antes de que vuelva a entrar.
- **Dependencias:** SQLAlchemy, modelos y funciones de fecha.
- **Reglas:** limita a 12 horas, fija salida en entrada + límite, incrementa
  horas completadas y anota la razón de cierre.
- **Portar:** conservar el mismo límite y la semántica de contabilización,
  haciéndolo idempotente y transaccional; invocarlo en operaciones/progreso en
  entorno serverless y ofrecer tarea de limpieza independiente.

### `auth.py`

- **Propósito:** hashing de contraseña, JWT y autorización por rol.
- **Funciones:** hash/verificación bcrypt vía Passlib, emisión HS256,
  decodificación/verificación por rol, obtención de admin y practicante actual.
- **Dependencias:** `python-jose`, Passlib bcrypt, SQLAlchemy y configuración.
- **Reglas:** JWT expira a las ocho horas en la versión Python; exige rol y
  sujeto válidos; cuenta inactiva no puede autenticarse.
- **Portar:** bcrypt y protección admin/practicante. La nueva especificación
  pide sesiones revocables almacenadas en PostgreSQL y expiración de 12 horas;
  ese cambio debe quedar documentado como modernización, no como comportamiento
  idéntico al JWT original.

### `config.py`

- **Propósito:** configuración de secretos, identidad del administrador,
  zona horaria y cierre de sesiones.
- **Variables:** exige `SECRET_KEY`, `ADMIN_USUARIO`, `ADMIN_PASSWORD`;
  `ADMIN_NOMBRE` opcional, `MAX_HORAS_SESION=12` e
  `INTERVALO_REVISION_SEG=1800`.
- **Dependencias:** entorno y `zoneinfo`.
- **Reglas:** zona `America/Bogota`; secretos obligatorios; máximo de 12 horas;
  revisión cada 30 minutos.
- **Portar:** equivalentes seguras en variables de entorno de Vercel/Neon,
  configurar credenciales con seed explícito y evitar secretos en Git.

### `utils.py`

- **Propósito:** proporciona hora actual con zona de Colombia y conversión a
  datetime sin zona para SQLite.
- **Funciones:** `ahora_co` y `ahora_co_naive`.
- **Dependencias:** `datetime` y `ZoneInfo`.
- **Portar:** cálculos de sesión consistentes en `America/Bogota` y persistencia
  PostgreSQL en `TIMESTAMPTZ`, sin mezclar datetimes locales y UTC.

### `requirements.txt`

- **Propósito:** dependencias Python fijadas por versión.
- **Dependencias:** FastAPI, Uvicorn, SQLAlchemy, Pydantic, python-jose,
  Passlib/bcrypt, python-multipart y tzdata.
- **Portar:** sustitución por dependencias Node para Express, pg, bcrypt,
  JWT, cookies, límites de tasa, correo y dotenv. Python no es requisito del
  despliegue nuevo.

### `render.yaml`

- **Propósito:** Blueprint del servicio web en Render.
- **Configuración:** runtime Python, `pip install`, Uvicorn, health check
  `/healthz`, SQLite en `/tmp/practicas.db`, secreto generado y variables del
  administrador.
- **Regla/limitación:** SQLite en `/tmp` es efímero y puede perder datos al
  reiniciar o desplegar.
- **Portar:** no usar como despliegue Node; reemplazar configuración por
  Vercel y Neon. Conservar como parte de la rama histórica Python.

### `.gitignore`

- **Propósito:** excluye entornos Python, bytecode, secretos, SQLite,
  `.vercel`, editor y logs.
- **Portar:** preservar reglas de secretos y bases locales; añadir
  `node_modules/`, `data/*.json` (salvo `.gitkeep`) y otros artefactos Node.

### `README.md`

- **Propósito:** instrucciones de entorno Python y despliegue Render.
- **Dependencias/documentación:** Uvicorn, variables de autenticación,
  advertencia de almacenamiento `/tmp`.
- **Portar:** reemplazar pasos de instalación/despliegue para Node.js, Neon y
  Vercel; conservar aviso de que el despliegue SQLite anterior era temporal.

### `frontend/index.html`

- **Propósito:** inicio de sesión, alta de practicantes y recuperación de clave.
- **Dependencias:** Tailwind CDN, `css/styles.css`, `js/api.js` y `js/login.js`.
- **Funciones/reglas:** login por usuario/contraseña; modal de alta pide
  credenciales y pregunta de seguridad; flujo de recuperación muestra pregunta
  asociada al usuario antes de cambiar la clave.
- **Portar:** pantalla de acceso, registro y recuperación. Mantener compatible
  la pregunta de seguridad y añadir correo solo para cuentas con email.

### `frontend/admin.html`

- **Propósito:** panel de administración.
- **Dependencias:** Tailwind CDN, CSS común, cliente API y `admin.js`.
- **Funciones/reglas:** directorio, indicadores, búsqueda, tabla responsive,
  formularios/modal de crear/editar, detalles de sesiones y ajustes de horas.
- **Portar:** todos los indicadores y acciones, no solo CRUD básico. Proteger
  rutas y endpoints exclusivamente para admins.

### `frontend/practicante.html`

- **Propósito:** panel de autoservicio del practicante.
- **Dependencias:** Tailwind CDN, CSS común, cliente API y `practicante.js`.
- **Funciones/reglas:** reloj/fecha Colombia, entrada/salida, progreso,
  sesiones y configuración de pregunta de seguridad.
- **Portar:** panel y acciones completas, mostrando sesión vigente y
  actualizando progreso.

### `frontend/js/api.js`

- **Propósito:** cliente HTTP compartido y utilidades de sesión/notificación.
- **Funciones:** persistencia de bearer JWT y rol en `localStorage`, guard de
  rol, logout, petición JSON, tratamiento de 401/204/errores, login
  URL-encoded, métodos para registro, recuperación, admin, sesiones,
  ajustes y autoservicio; toast y formato de horas/fechas.
- **Dependencias:** APIs Web (fetch, URLSearchParams, localStorage, DOM).
- **Portar:** conservar los contratos compatibles, errores, guard y formatos;
  adaptar rutas a `/api/...`. El cliente actual no renueva token
  automáticamente.

### `frontend/js/login.js`

- **Propósito:** controlador de la pantalla de acceso.
- **Funciones:** login, abrir/cerrar modales, alta, consultar pregunta de
  recuperación, restablecimiento y mensajes de error/éxito.
- **Reglas:** usuario mínimo 3, respuesta de seguridad, manejo de cargas y
  foco/modales.
- **Portar:** acceso/registro y los dos flujos de recuperación; añadir
  recuperación por correo sin retirar Q&A para cuentas antiguas.

### `frontend/js/admin.js`

- **Propósito:** controlador del panel admin.
- **Funciones:** carga y búsqueda de practicantes, consulta de sesiones por
  practicante, KPIs (total, activos, sesiones abiertas y horas), CRUD, modales,
  detalle, ajustes manuales y eliminación de sesiones; avisos y fechas.
- **Reglas:** acciones admin; eliminación de sesión cerrada descuenta sus
  horas; barras de progreso limitadas al rango visual 0–100.
- **Portar:** KPIs, filtros, CRUD, historial, ajustes, sesiones y manejo de
  estados vacíos/errores. Validar/escapar contenido de usuario.

### `frontend/js/practicante.js`

- **Propósito:** controlador del autoservicio.
- **Funciones:** reloj en vivo de Colombia, refresco de progreso/sesiones cada
  minuto, entrada/salida, modal de seguridad y render de estado.
- **Reglas:** evita registrar entrada duplicada; refleja la sesión abierta y
  el mensaje de meta completada.
- **Portar:** toda la interacción y actualización periódica, con errores
  visibles y rutas autenticadas.

### `frontend/css/styles.css`

- **Propósito:** estilos comunes adicionales a Tailwind.
- **Funciones visuales:** campos, foco, animaciones, reloj, pulso de sesión,
  modales, toast, scrollbars, tablas y accesibilidad de movimiento reducido.
- **Dependencias:** fuente Inter de Google Fonts y clases Tailwind cargadas por
  CDN en las páginas.
- **Portar:** variables, responsive y animaciones. Decidir si mantener CDN o
  reemplazar sus utilidades por CSS local; la segunda opción evita depender de
  servicios externos en runtime.

## Modelo y reglas consolidadas de Python

- El modelo Python tiene entidades separadas para admin y practicante. Ambos
  inician sesión con `usuario`; no existe campo email en el modelo Python.
- Los IDs Python son enteros, no UUID. `practicantes.usuario` y
  `numero_documento` son únicos.
- Meta y horas completadas son `Float`; el backend permite ajustes negativos
  porque `AjusteHoras.horas` se describe como corrección/resta.
- Un practicante puede tener sesiones de asistencia con entrada, salida,
  duración, descripción y estado abierto. El máximo de una sesión es 12 horas.
- El admin ajusta horas dejando motivo y actor; consultar/eliminar sesiones
  forma parte del panel.
- Recuperación original por pregunta y respuesta normalizada (`strip`,
  `casefold`), hasheada con bcrypt. La clave tiene un mínimo de 6 caracteres.
- Token JWT original HS256 expira a las 8 horas; el plan Node especifica 12 h y
  persistencia/revocación de sesión.
- Zona horaria funcional: `America/Bogota`.
- El frontend original tiene alta pública; no se debe eliminar al incorporar
  `/api/admin` y `/api/practicante`.

## Decisiones confirmadas para la migración

1. Se conserva `usuario` como identificador de login para compatibilidad.
2. El email será nullable únicamente para cuentas antiguas importadas; las
   altas nuevas lo exigirán. Así no se inventan direcciones para cuentas sin
   correo. La recuperación por email no estará disponible hasta que la cuenta
   tenga uno.
3. Se conservan preguntas/respuestas de seguridad además del nuevo flujo de
   recuperación por email.
4. Las sesiones de asistencia Python y las sesiones autenticadas revocables
   son conceptos diferentes. Se mantendrán en tablas diferentes.
5. Se conserva el historial separado de ajustes de horas, incluso cuando los
   nuevos endpoints también expongan un historial unificado.
6. La función de cierre periódico de Python debe ejecutarse de forma compatible
   con Vercel: cierre bajo demanda en solicitudes y limpieza idempotente, no un
   `setInterval` que dependa de un proceso permanente.

## Diferencias y bloqueos antes de completar el reemplazo

- En GitHub solo aparece la rama `main`; `python-version` no existe aún. Debe
  crearse y verificarse antes de cualquier reemplazo de `main`.
- La carpeta `C:\Users\diego\Desktop` fue denegada por el sandbox. No se
  comprobó el backup local ni se clonó ningún repositorio.
- Las herramientas disponibles para GitHub en esta sesión son de lectura; no
  permiten crear ramas, commits, cambiar archivos remotos ni configurar Vercel.
- `practicas.db` no está versionada. Render configuró su base en `/tmp`, que
  puede haber sido eliminada; la historia de código no basta para recuperar
  usuarios, hashes, preguntas, sesiones o ajustes.
- La solicitud original de migración no definió permisos/funciones de
  `supervisor`, ni cómo exportar la base viva de Render. Esas capacidades no
  pueden asumirse al migrar datos o autorizar endpoints.
- No se ejecutaron pruebas ni se verificó una conexión PostgreSQL en esta fase
  de inspección remota.
