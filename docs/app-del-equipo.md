# App de AL’AGUA DOGS

La app se instala desde https://alagua.dog y utiliza la misma cuenta, base de datos y permisos que el portal. No es una aplicación publicada en App Store o Google Play.

## Instalación

- iPhone o iPad: abrir alagua.dog en Safari, tocar Compartir → Agregar a pantalla de inicio, activar Abrir como app web si aparece y confirmar Agregar.
- Android: abrir alagua.dog en Chrome y usar Instalar app / Agregar a pantalla principal. Si el navegador entrega una invitación de instalación, el botón del portal abre ese diálogo.
- En ambos casos se puede consultar la ayuda mediante el icono de descarga de la barra superior. Al abrir la app desde su icono, iniciar sesión con el correo autorizado. Cada dispositivo puede requerir su propio inicio de sesión.

## Administración

Conserva agenda, clientes, VAN, rutas, pagos, costos, incidencias, equipo, Akira y respaldos. Para entregar trabajo: crear/activar la cuenta del bañador en Equipo y servicios; asignar sus citas por identidad; revisar y publicar la propuesta de ruta para esa cuenta. Es posible revisar una vista de ejemplo en Equipo y servicios → App del equipo; usa datos ficticios y tiene deshabilitados los controles operativos.

## Mi día de trabajo

Cada bañador entra a una vista específica del día de Monterrey. Ve sus citas asignadas y las visitas de rutas activas publicadas para su identidad. Una VAN compartida, una propuesta sin publicar, una ruta reemplazada o el identificador de una visita no conceden acceso. Si cambian los domicilios o las asignaciones, la ruta queda pendiente de revisión y no expone las paradas antiguas.

Desde sus servicios puede consultar la ficha y las indicaciones, abrir Google Maps, iniciar/finalizar el servicio, registrar pagos e incidencias y guardar fotos, propina y cierre. El teléfono y correo del cliente se eliminan en el servidor; también se enmascaran contactos reconocibles en las indicaciones de texto. No dispone de administración, costos, rentabilidad ni de los servicios de otros bañadores. No puede editar tarifas, domicilios, contactos, usuarios o rutas.

Las citas de agenda conservan los cobros parciales existentes. Para una visita capturada/importada de una ruta, el bañador registra el cobro completo del precio establecido por Administración; si falta precio o hay un pago parcial, Administración debe conciliarlo. Las transferencias reportadas por el bañador permanecen sin confirmar hasta que Administración o Recepción las verifique. Los cambios de revisión impiden registrar un importe actualizado sin revisar la visita; los reintentos no duplican cobros ni incidencias. Las propinas se guardan por separado en el cierre y no reducen el saldo del servicio.

Los cierres de visitas de ruta requieren una asignación publicada vigente, servicio finalizado y al menos una foto. Los contactos para los avisos automáticos se resuelven en el servidor; el bañador no los ve ni elige destinatarios. Si cambia un cobro después de emitir un recibo de ruta, se revocan los enlaces previos y los envíos pendientes: hay que revisar y guardar nuevamente el cierre con el importe actualizado. Las incidencias de ruta aparecen también en Administración, incluso si el cliente aún está pendiente de vincular.

## Conexión y privacidad

La app requiere internet para consultar información vigente y guardar cambios. Sin conexión muestra una pantalla pública para volver a intentar; no presenta una copia antigua de clientes ni permite aparentar que se guardó un pago o una foto.

El service worker solo almacena `offline.html` e iconos de la app. No intercepta API, fotografías privadas, solicitudes de autenticación, POST ni peticiones a otros dominios. Las navegaciones usan la red y no se almacenan. La instalación no concede permisos adicionales a la cuenta. Las preferencias Claro/Oscuro continúan siendo personales.

## Comprobaciones

`npm test` verifica las proyecciones de privacidad, los comandos permitidos, los iconos/manifiesto y que el service worker no almacene datos privados. `node --env-file=.env.local --import tsx tests/workday.integration.mjs` prueba únicamente un espacio desechable con identidades ficticias: publicación y revocación de asignaciones, aislamiento entre dos bañadores en la misma VAN, cobros e incidencias idempotentes, revisión del importe, transferencias sin confirmar, inicio/finalización y cierre con propina sin revelar contactos. No envía correos, no llama a Maps ni sube fotos reales.
