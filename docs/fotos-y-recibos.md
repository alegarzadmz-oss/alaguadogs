# Fotos y cierre del servicio

Implementado el 24 de octubre de 2026 en alagua.dog.

## Uso diario

En una cita de agenda, finaliza el servicio y abre **Foto y recibo** en su detalle. En las rutas capturadas o importadas, Administración dispone del mismo botón junto a **Revisar**.

1. Usa **Tomar foto** desde el teléfono o **Elegir de galería**. Revisa la imagen, identifica la mascota y pulsa **Guardar foto**. Se admiten hasta seis fotografías por visita.
2. Revisa el pago del servicio. Este importe procede del registro de cobros; para corregirlo usa **Registrar pago** en la cita o **Revisar** y la confirmación de cobro en la ruta. Un importe desconocido sigue pendiente.
3. Captura la **propina recibida** y su método por separado. Cero significa que no hubo propina; un campo vacío significa que no está registrada. La propina no reduce el saldo del servicio ni se suma a los ingresos del servicio en rentabilidad.
4. Escribe un mensaje para el dueño y verifica su WhatsApp o correo. Los datos de contacto de este cierre no modifican la ficha maestra.
5. Confirma que el servicio terminó y pulsa **Guardar cierre**.
6. Usa **Preparar foto y recibo para enviar**. Puedes abrir WhatsApp, preparar un correo o copiar el mensaje. El dueño recibe un enlace con fotos, importe, pago, saldo cuando es conocido y propina. Puede guardar las fotos e imprimir el resumen sin iniciar sesión.

El envío se completa desde WhatsApp o el programa de correo: no se manda automáticamente ni se registra como entregado. El enlace permite incluir las fotografías en ambos canales sin depender de que el navegador admita adjuntos en enlaces `mailto:`. También se puede descargar una foto para adjuntarla directamente.

## Acceso y conservación

Las fotos están en un almacén **privado** de Vercel Blob. Se comprimen y se convierten a JPEG al guardar, eliminando los metadatos EXIF/GPS. Los nombres de los archivos no contienen nombres ni teléfonos de los clientes.

Administración puede trabajar con los cierres. Los bañadores pueden trabajar únicamente con sus citas asignadas. Recepción conserva su acceso limitado a transferencias y no puede leer ni modificar fotos o propinas.

Los enlaces del dueño duran siete días, usan tokens aleatorios de 256 bits y solo se guarda su hash. El token viaja en el fragmento del enlace; la página lo presenta a la API mediante POST. El recibo no incluye domicilio, teléfono, correo, costos ni notas internas. Cualquier persona que tenga el enlace puede ver ese recibo mientras esté vigente: debe compartirse con el dueño correspondiente.

**Revocar enlaces compartidos** impide volver a abrir la foto y el recibo desde los enlaces anteriores. Guardar cambios en el cierre o en las fotos también los revoca. Si cambia el pago, las mascotas o los demás datos del recibo, el enlace anterior deja de mostrarlos y requiere preparar otro. Los archivos que el dueño ya haya descargado quedan en su dispositivo.

Quitar una foto del cierre la retira de los accesos y revoca los enlaces; conserva el archivo privado y su marca de retiro. Esta función no borra registros históricos ni pagos.

## Almacenamiento y respaldo

Postgres conserva `service_closeouts`, `service_photos` y `service_receipt_shares`. Las imágenes se guardan en el almacén privado `alagua-servicios-fotos` del proyecto existente de Vercel.

El respaldo semanal debe incluir tanto las tablas como los archivos de Blob; el ZIP de código y GitHub no incluyen fotos ni información de clientes. `.env.local`, exportaciones y tokens nunca deben publicarse en el repositorio.

## Comprobación

Las pruebas cubren importes pendientes, propina cero frente a desconocida, saldo independiente, permisos por cuenta asignada, mensajes de WhatsApp y correo, conversión de imágenes sin metadatos, carga idempotente, lectura privada, caducidad, revocación y rechazo de recibos con importes desactualizados.

```sh
npm test
npx tsc --noEmit
npm run build
node --env-file=.env.local --import tsx tests/service-closeout.integration.mjs
```

La integración crea un propietario aislado, identidades ficticias sin cuenta real de Clerk y archivos de prueba; elimina solo sus registros y archivos al terminar. La opción interna `KEEP_CLOSEOUT_FIXTURE=1` conserva una muestra temporal para verificación visual y requiere su limpieza posterior.
