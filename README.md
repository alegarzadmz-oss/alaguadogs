# AL’AGUA DOGS · Operaciones

Portal para la agenda de cuatro camionetas de estética de perros y gatos a domicilio. Incluye clientes y mascotas, asignación a bañadores, rutas estimadas, pagos y saldos, rentabilidad e incidencias.

## Plataforma

- Next.js 16, React 19 y TypeScript.
- Vercel: proyecto `alaguadogs` del equipo `al-agua-dogs`; dominio `alagua.dog`.
- Neon Postgres para datos compartidos, revisiones y auditoría de accesos.
- Clerk para inicio de sesión y verificación de correo. Las cuentas del equipo y sus roles se autorizan en el servidor.

La aplicación requiere credenciales reales de Clerk y Neon. No acepta las cabeceras de identidad de Sites. No existe acceso de demostración que permita leer los datos privados sin iniciar sesión.

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
