# AL’AGUA DOGS · Operaciones

Portal para la agenda de cuatro VAN de estética de perros y gatos a domicilio. Incluye clientes y mascotas, asignación a bañadores, rutas estimadas, pagos y saldos, rentabilidad e incidencias.

## Plataforma

- Next.js 16, React 19 y TypeScript.
- Vercel: proyecto `alaguadogs` del equipo `al-agua-dogs`; dominio `alagua.dog`.
- Neon Postgres para datos compartidos, revisiones y auditoría de accesos.
- Clerk para inicio de sesión y verificación de correo. Las cuentas del equipo y sus roles se autorizan en el servidor.

La aplicación requiere credenciales reales de Clerk y Neon. No acepta las cabeceras de identidad de Sites. No existe acceso de demostración que permita leer los datos privados sin iniciar sesión.

## Apariencia personal

El selector Claro / Oscuro de la barra superior está disponible para cada integrante activo, en computadora y celular. La elección se guarda en su propia cuenta (`team_members.appearance`) y se recupera al entrar desde otro dispositivo. El navegador conserva una copia por identidad para aplicar la apariencia al cargar. La API de preferencias solo permite consultar y cambiar la apariencia de la sesión actual; no modifica roles ni datos compartidos de la operación.

## App instalable

El portal tiene manifiesto, iconos y una app web instalable desde `alagua.dog`. El botón de instalación de la barra superior muestra las instrucciones para iPhone y Android. Administración conserva todas las secciones; el bañador entra directamente a **Mi día de trabajo**, con sus citas y las visitas de sus rutas publicadas para hoy, fichas sin contactos, navegación, pagos, incidencias, fotos, propinas y cierre. En Equipo y servicios hay una vista de ejemplo sin escrituras.

La [guía de la app del equipo](docs/app-del-equipo.md) explica instalación, asignaciones, cobros, conexión y pruebas. No se crean cuentas de bañadores automáticamente ni se asigna una ruta solo por compartir VAN. El service worker almacena únicamente recursos públicos de instalación; no guarda datos de clientes, HTML autenticado, respuestas de API ni fotos privadas para consulta sin conexión.

## Desarrollo

Usa Node.js 24 y `npm ci`. Vincula primero el proyecto existente y descarga sus variables:

```sh
vercel link --yes --scope al-agua-dogs --project alaguadogs
vercel env pull .env.local --yes --scope al-agua-dogs
npm run db:migrate
npm run dev
```

Las variables necesarias se enumeran en `.env.example`. Las credenciales, archivos de respaldo e invitaciones privadas deben permanecer fuera de Git.

## Migración de Sites

El origen usa Cloudflare D1 y acceso con ChatGPT. El nuevo portal requiere que cada persona inicie sesión con el correo verificado que figura en su acceso del equipo. Las cuentas previamente activadas se vinculan una sola vez al nuevo proveedor; las cuentas pendientes requieren su enlace de activación en el nuevo dominio. Los identificadores de miembros se conservan para mantener asignaciones e historial.

Importa únicamente un respaldo **completo**, desde un archivo privado con `operation_state`, `team_members` y `team_audit`:

```sh
npm run db:import -- /ruta/privada/respaldo.json
```

La importación es transaccional y se cancela si el destino ya contiene datos. No sobreescribe registros existentes ni acepta un JSON parcial como respaldo. La migración del esquema no inserta cuentas, contraseñas ni datos de ejemplo automáticamente.

La publicación original permanece disponible durante la transferencia. Una vez que se valide la nueva versión, conviene usar un solo portal para capturar datos: ambas bases son independientes.

## Historial de rutas y cobros

Administración dispone de rutas diarias, carga por VAN, resumen semanal y seguimiento de transferencias. La agenda y el historial importado se consultan juntos; las visitas importadas conservan sus datos originales, sin inventar horarios, servicios, costos ni una confirmación de cobro.

El historial vive en `route_visits`, separado del estado de agenda. La API exige una cuenta activa autorizada y protege los cambios con revisión de fila y auditoría. Administración puede capturar, pegar y revisar rutas; Recepción solo puede consultar transferencias y confirmar o desmarcar su recepción. Cambiar el importe o la forma de pago reinicia la confirmación. Efectivo y tarjeta sin confirmación en el origen quedan «Por verificar».

La [implementación de la guía operativa](docs/guia-operativa-implementacion.md) explica la vista previa de rutas, servicios completos y adicionales, archivo reversible, acceso de Recepción y los 12 casos de comprobación.

El módulo [Fotos y cierre del servicio](docs/fotos-y-recibos.md) guarda fotografías privadas y propinas separadas. Al guardar el cierre con foto y correo registrado, envía automáticamente el resumen desde citas@alagua.dog. Administración controla los contactos, WhatsApp y la revisión de envíos; los bañadores solo capturan fotos y el cierre.

Para una importación supervisada, guarda los CSV diarios como `routes-AAAA-MM-DD.csv` y las confirmaciones extraídas de la consulta como `transfers-week-AAAA-MM-DD.json` dentro de una carpeta `private/`. Verifica primero la correspondencia VAN A–D / VAN 01–04 y ejecuta la migración de esquema en el entorno elegido. Ejecuta el importador sin `--apply` para obtener la revisión previa:

```sh
node --env-file=.env.local --import tsx scripts/import-route-history.mts private/importacion-rutas
node --env-file=.env.local --import tsx scripts/import-route-history.mts private/importacion-rutas --apply
```

El importador concilia cada transferencia con una visita e importe, conserva los respaldos iniciales y evita duplicar filas existentes. Las coincidencias ambiguas de clientes se vinculan manualmente desde «Revisar». No cambia las fichas originales ni sincroniza automáticamente el portal de origen. No publiques exportaciones ni respaldos en Git o Vercel.

## Verificación

```sh
npm test
npx tsc --noEmit
npm run build
node --env-file=.env.local --import tsx tests/storage.integration.mjs
```

La prueba de almacenamiento usa registros temporales con identificadores únicos y elimina solo sus propias filas al finalizar. Verifica invitaciones de un solo uso, roles, revocación, vinculación de identidades y conflictos entre escrituras.

## Publicación

El repositorio está conectado al proyecto existente en Vercel. Los cambios en `main` generan publicaciones de producción; las otras ramas permiten revisar una vista previa.

```sh
vercel --scope al-agua-dogs
vercel --prod --scope al-agua-dogs
```

Antes de publicar deben estar configuradas las claves de Clerk en Production, Preview y Development, y los registros DNS de su instancia de producción.

## Alcance de esta versión

Las rutas se calculan con coordenadas y distancias aproximadas; no incluyen tráfico ni tiempos de calles. El módulo de pagos registra cobros; no procesa tarjetas. El margen es una estimación de ingresos menos costos capturados.
