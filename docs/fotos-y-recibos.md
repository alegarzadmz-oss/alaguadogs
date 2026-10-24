# Fotos y cierre del servicio

Implementado el 24 de octubre de 2026 en alagua.dog.

## Uso diario

En una cita de agenda, finaliza el servicio y abre **Foto y recibo** en su detalle. En las rutas capturadas o importadas, Administración dispone del mismo botón junto a **Revisar**.

1. Usa **Tomar foto** desde el teléfono o **Elegir de galería**. Revisa la imagen, identifica la mascota y pulsa **Guardar foto**. Se admiten hasta seis fotografías por visita.
2. Revisa el pago del servicio. Este importe procede del registro de cobros; para corregirlo usa **Registrar pago** en la cita o **Revisar** y la confirmación de cobro en la ruta. Un importe desconocido sigue pendiente.
3. Captura la **propina recibida** y su método por separado. Cero significa que no hubo propina; un campo vacío significa que no está registrada. La propina no reduce el saldo del servicio ni se suma a los ingresos del servicio en rentabilidad.
4. Escribe un mensaje para el dueño y verifica su WhatsApp o correo. Los datos de contacto de este cierre no modifican la ficha maestra.
5. Confirma que el servicio terminó y pulsa **Guardar cierre y enviar correo**. El servidor prepara un único aviso para los datos guardados y lo envía desde `citas@alagua.dog` al correo del dueño. Las fotos se incluyen en el correo, además del enlace temporal al resumen.
6. Administración conserva **Preparar foto y recibo para enviar**, WhatsApp y el correo manual. Los bañadores no reciben teléfonos ni direcciones de correo del cliente y no pueden elegir destinatarios, compartir enlaces o revocarlos mediante las API.

Administración registra el correo en la ficha de Clientes y mascotas. Si falta, el cierre se conserva y muestra **Falta el correo del cliente**; no se inventa un destinatario. Tras corregirlo, Administración puede revisar o reintentar desde el cierre.

El servidor usa Resend con una clave limitada al dominio `alagua.dog`. El buzón para recibir respuestas de `citas@alagua.dog` requiere su proveedor de correo por separado; autenticar el dominio de envío no crea una bandeja de entrada. El mensaje automático indica que los cambios de cita se gestionan con Administración por el canal habitual.

## Acceso y conservación

Las fotos están en un almacén **privado** de Vercel Blob. Se comprimen y se convierten a JPEG al guardar, eliminando los metadatos EXIF/GPS. Los nombres de los archivos no contienen nombres ni teléfonos de los clientes.

Administración puede trabajar con los cierres. Los bañadores pueden trabajar únicamente con sus citas asignadas. Recepción conserva su acceso limitado a transferencias y no puede leer ni modificar fotos o propinas.

Los enlaces del dueño duran siete días y usan tokens aleatorios de 256 bits. La tabla de enlaces guarda el hash. La cola privada de envío conserva temporalmente el token para completar los reintentos y lo elimina al enviar o cancelar el aviso. El token viaja en el fragmento del enlace; la página lo presenta a la API mediante POST. El recibo no incluye domicilio, teléfono, correo, costos ni notas internas. Cualquier persona que tenga el enlace puede ver ese recibo mientras esté vigente: debe compartirse con el dueño correspondiente.

**Revocar enlaces compartidos** impide volver a abrir la foto y el recibo desde los enlaces anteriores. Guardar cambios en el cierre o en las fotos también los revoca. Si cambia el pago, las mascotas o los demás datos del recibo, el enlace anterior deja de mostrarlos y requiere preparar otro. Los archivos que el dueño ya haya descargado quedan en su dispositivo.

Guardar otra vez un cierre sin cambios no genera otro correo ni revoca el enlace enviado. Los cambios materiales requieren guardar la actualización y generan un aviso actualizado. Los correos y fotografías que el dueño ya recibió no se retiran de su buzón al revocar un enlace.

## Reintentos y revisión

`service_email_outbox` conserva el aviso, su firma, destinatario, intentos y resultado. La firma evita duplicar el aviso al guardar de nuevo o al reintentar una respuesta incierta. Cada solicitud utiliza también una clave idempotente de Resend. Los errores transitorios se reintentan con espera creciente, hasta ocho intentos, mediante una tarea de Vercel cada cinco minutos, protegida con `CRON_SECRET`. Si pasan 23 horas desde la primera oportunidad de envío, se exige revisión para no repetir un correo fuera de la ventana idempotente del proveedor.

Equipo y servicios incluye **Correos automáticos de servicios**: estado de configuración, fichas sin correo y avisos enviados o pendientes. **Enviado** significa que Resend aceptó el mensaje; su entrega o rechazo posterior puede revisarse en Resend. Los bañadores solo ven un estado general del envío.

Quitar una foto del cierre la retira de los accesos y revoca los enlaces; conserva el archivo privado y su marca de retiro. Esta función no borra registros históricos ni pagos.

## Almacenamiento y respaldo

Postgres conserva `service_closeouts`, `service_photos`, `service_receipt_shares` y `service_email_outbox`. Las imágenes se guardan en el almacén privado `alagua-servicios-fotos` del proyecto existente de Vercel.

El respaldo semanal debe incluir tanto las tablas como los archivos de Blob; el ZIP de código y GitHub no incluyen fotos ni información de clientes. `.env.local`, exportaciones y tokens nunca deben publicarse en el repositorio.

## Comprobación

Las pruebas cubren importes pendientes, propina cero frente a desconocida, saldo independiente, permisos por cuenta asignada, mensajes de WhatsApp y correo, conversión de imágenes sin metadatos, carga idempotente, lectura privada, caducidad, revocación y rechazo de recibos con importes desactualizados.

```sh
npm test
npx tsc --noEmit
npm run build
node --env-file=.env.local --import tsx tests/service-closeout.integration.mjs
node --env-file=.env.local --import tsx tests/service-email.integration.mjs
```

La integración crea un propietario aislado, identidades ficticias sin cuenta real de Clerk y archivos de prueba; elimina solo sus registros y archivos al terminar. La opción interna `KEEP_CLOSEOUT_FIXTURE=1` conserva una muestra temporal para verificación visual y requiere su limpieza posterior.
