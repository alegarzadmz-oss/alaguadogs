# Respaldos de AL’AGUA DOGS

La base principal permanece en Neon y las fotos operativas en Vercel Blob privado. El portal crea una copia diaria a las 04:00 de America/Monterrey (10:00 UTC) en un bucket privado de Google Cloud Storage. No es una migración de la base principal.

## Contenido y conservación

Cada archivo `database/*.json.gz` contiene el esquema SQL del mismo commit, su huella SHA-256 y las filas completas de las diez tablas de operación: estado (clientes, mascotas, agenda, pagos, costos e incidencias), equipo, auditoría, rutas históricas, propuestas guardadas, cierres, fotos, enlaces, cola de correo y consumo de Maps. Las tablas de control del propio respaldo se crean con el esquema, pero no forman parte de los datos recuperables. Si aparece una tabla nueva sin incorporarla al formato, el proceso falla para evitar omisiones silenciosas.

Las fotos activas se copian a `photos/` por su ruta inmutable (que ya incluye la huella del contenido). Cada copia de datos conserva el manifiesto de sus fotos con tamaño y MD5. Las fotos se verifican nuevamente al recuperar un respaldo. El portal no copia archivos `.env`, claves de API, contraseñas de Google ni credenciales de otros servicios. Los datos administrativos y los tokens de enlaces/cola de correo sí son parte de la base, por lo que todo el archivo es privado.

Google elimina las copias `database/` y los informes `reports/` después de 30 días, con 7 días de recuperación mediante soft delete. Las fotos deduplicadas no tienen borrado automático: así una copia reciente no pierde imágenes antiguas todavía utilizadas. El proceso limita el archivo de fotos a 1 GiB; alcanzar ese límite impide agregar nuevas fotos y marca el respaldo como fallido para que Administración revise la capacidad. Cada archivo de datos tiene un límite descomprimido de 50 MiB y cada foto de 5 MiB. Hay un respaldo diario y hasta tres intentos manuales por día, compartidos entre administradoras. Estas medidas son límites de la aplicación, no un tope monetario de Google.

## Acceso

El bucket impide acceso público y usa acceso uniforme. Vercel Production se autentica mediante OIDC y Workload Identity Federation, sin una clave privada de cuenta de servicio. La confianza se restringe a equipo, proyecto y ambiente de producción exactos. La cuenta de servicio solo tiene Object Creator y Object Viewer en este bucket; no puede borrar ni sobrescribir archivos. Las cargas incluyen `ifGenerationMatch=0` y una comprobación de integridad MD5.

Las cinco variables `GCP_BACKUP_*` son identificadores de recursos, no secretos. Se configuran únicamente en Production. El cron usa el `CRON_SECRET` existente y la creación manual requiere una cuenta de Administración activa, vigente y del mismo origen. Equipo y servicios muestra el resultado y permite crear una copia manual. Los bañadores y recepción no tienen acceso a esta función.

## Comprobación de recuperación

Un respaldo solo se marca correcto después de descargarlo desde Google Cloud, comprobar SHA-256, validar el formato, las huellas de todas las tablas y el manifiesto de fotos, descargar y comprobar las fotos, y restaurar todas las tablas en un esquema temporal aislado. La recuperación compara filas, cantidades y huellas, y elimina el esquema de prueba en la misma transacción. Si hay un error, la transacción revierte todo el ensayo. Nunca se ejecutan colas de correo ni otros trabajos sobre ese esquema. No se escribe sobre las tablas públicas de operación.

Los informes de verificación no contienen fichas ni contactos de clientes. El panel avisa si falla el último intento o pasan más de 36 horas desde la última copia comprobada. Un proceso interrumpido conserva su bloqueo como máximo siete minutos; el siguiente intento lo marca fallido y permite reanudar.

Para repetir una comprobación desde la Mac, descarga un archivo y las fotos que referencia mediante una cuenta autorizada de Google Cloud, conserva el commit que creó ese archivo y ejecuta:

```sh
node --env-file=.env.local --import tsx scripts/verify-backup.mts /ruta/copia.json.gz SHA256 /ruta/carpeta-descargada
```

La carpeta debe contener `photos/`. El script solamente restaura en un esquema temporal y presenta cantidades; no imprime datos de clientes. Una recuperación real después de un incidente requiere preparar una base nueva, recuperar también las fotos y revisar especialmente las colas de envío y enlaces antes de reactivar trabajos. No hay una opción de sobrescribir producción desde el portal.
