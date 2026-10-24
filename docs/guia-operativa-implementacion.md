# Guía operativa de Mónica: implementación

Revisión del documento `Al_Agua_Dogs_Guia_operativa.docx`, fechado el 23 de octubre de 2026. Implementación del 24 de octubre de 2026 sobre el portal existente de alagua.dog.

## Capturar y corregir rutas

Administración puede usar **Pegar o capturar ruta** desde Agenda o Camionetas y rutas. El pegado reconoce encabezados de fecha y VAN A–D, cliente, domicilio, mascotas con raza y servicio, observaciones, precio y forma de pago. También admite tablas sencillas separadas por tabulaciones, comas o barras y captura manual.

Antes de guardar se presenta una vista previa editable. Hay que seleccionar las visitas y confirmar la revisión. Los datos incompletos quedan pendientes: no se inventan mascotas, precios, formas de pago, horarios ni fichas de cliente. La vinculación sugerida exige nombre coincidente y evidencia de domicilio/mascota; Administración puede seleccionar otra ficha o conservar la visita sin vincular. El importador no crea ni fusiona clientes automáticamente.

Los posibles duplicados se comparan por fecha, cliente, domicilio y mascotas, incluso si cambió la VAN. Se deben revisar o excluir; una visita en otra fecha no se considera duplicada. Los reintentos del mismo envío conservan el identificador para evitar altas repetidas.

**Revisar visita** permite corregir fecha, VAN, cliente, domicilio, mascotas, servicios, importe y método. Conserva la copia original y no modifica la ficha maestra del cliente. **Retirar de ruta** conserva el registro en **Visitas archivadas**, desde donde puede restaurarse. Retirar un cobro recibido requiere una confirmación adicional.

## Servicios, importes y transferencias

Un domicilio con dos baños y cuatro cortes de uñas cuenta como **dos servicios completos, cuatro adicionales y un domicilio**. Cada mascota admite su clasificación de servicios; los adicionales del domicilio se capturan aparte. Para grupos sin nombres individuales se puede indicar la cantidad de mascotas. La cantidad de cada adicional es el total indicado para ese grupo o domicilio.

Las rutas históricas que no especificaban servicios conservan su conteo anterior y muestran que su clasificación está pendiente. Deben revisarse para obtener un desglose exacto; no se clasificaron por suposición.

Un importe vacío sigue pendiente y se muestra separado de los ceros capturados expresamente. Seleccionar Transferencia incorpora el mismo registro a esa vista. Cambiar el importe o el método reinicia la confirmación del cobro. Marcar y desmarcar registra responsable y fecha; las revisiones impiden sobrescribir cambios simultáneos.

El enlace **https://alagua.dog/transferencias** requiere una cuenta autorizada. El nuevo rol **Recepción · solo Transferencias**, disponible en Equipo, permite consultar las transferencias y marcar/desmarcar la recepción. No permite modificar importes, clientes, rutas ni acceder a las demás secciones. Los permisos también se aplican en las API. Compartir el enlace no concede acceso por sí solo. Esta implementación no crea cuentas de Recepción para personas no indicadas.

La comprobación bancaria y del comprobante de WhatsApp sigue siendo manual. El portal registra la confirmación; no consulta bancos ni lee WhatsApp.

## Resumen y colaboración

Al hacer clic en una tarjeta de camioneta en **Resumen semanal**, se abre su **Ficha semanal**. Incluye indicadores y secciones de citas/visitas, clientes vinculados y por vincular, rutas de los siete días, ingresos por forma de pago y pagos pendientes/por verificar. Permite abrir fichas y visitas, capturar precios, confirmar cobros de rutas, consultar fotos/cierres y exportar las visitas. Los controles superiores cambian la semana sin salir de la ficha; **Volver al resumen semanal** regresa al comparativo de las cuatro camionetas. Los clientes se agrupan únicamente por ficha existente, nunca solo por nombre o domicilio.

**Resumen semanal** muestra citas con horario y visitas de ruta de lunes a domingo. Cada tarjeta de camioneta compara cantidad de visitas, mascotas, importe registrado, ingresos confirmados, importe por cobrar o verificar y precios pendientes. Seleccionar una tarjeta o el filtro Camioneta actualiza los indicadores, la tabla diaria y la lista de precios pendientes. Los ingresos se agrupan por la fecha del servicio; no representan el flujo bancario por fecha de depósito. Las propinas no se suman a estos ingresos de servicios. Puede exportarse el detalle semanal en CSV.

**Capturar precio / Editar precio** abre una captura directa del importe total de la visita, con centavos, desde rutas, cobros, transferencias (Administración), los pendientes semanales y el historial de la ficha del cliente. No registra pagos ni cambia mascotas, domicilios o fichas. Si cambia el importe se reinicia la confirmación del cobro. El servidor exige Administración para cambios de precio, conserva la captura original y registra quién realizó el cambio; una revisión desactualizada no puede sobrescribir otra modificación.

Las vistas usan los mismos registros. Los cambios se reflejan al guardar y se actualizan periódicamente cada 30 segundos. Transferencias permite consultar día, semana o todo el historial, además de **Ver todos los pendientes**, para localizar cobros antiguos. El resumen semanal conserva lunes a domingo, navegación, filtro por VAN y alerta de diferencia de carga de tres servicios completos o más. Distingue fechas transcurridas, días futuros, valor registrado y cobros confirmados. La fecha transcurrida por sí sola no demuestra que un servicio se haya realizado.

El CSV incluye nombres, domicilio, mascotas, razas, servicios, adicionales, observaciones, importes pendientes y evidencia de confirmación. Los valores susceptibles de interpretarse como fórmulas se protegen para abrirlos en hojas de cálculo.

## Comprobación de los 12 casos de la guía

| Caso | Implementación y evidencia |
| --- | --- |
| Pegar varios clientes | Parser, vista previa editable y confirmación antes del envío; pruebas unitarias e importación transaccional. |
| Varias mascotas en un domicilio | Una visita con mascotas y servicios; un domicilio en el resumen. |
| Dos baños y cuatro cortes de uñas | Prueba explícita: 2 completos, 4 adicionales, 1 domicilio. |
| Programar sin precio ni pago | Persistencia de precio nulo y método Pendiente comprobada en base de datos. |
| Mover VAN C a VAN D | Actualiza la misma visita y su fecha/VAN en almacenamiento y proyecciones. |
| Importar lista repetida | Advertencia y bloqueo sin revisión; reintento del mismo lote sin duplicación. |
| Elegir transferencia | La misma visita aparece en transferencias; no crea un segundo cobro. |
| Marcar y desmarcar | Persistencia, actor/fecha y conflicto de escrituras comprobados. |
| Acceso de Recepción | Proyección limitada y rechazo de importación, cambios de precio y acciones de administración. |
| Pendientes de varios días | Filtro de todo el historial y acceso directo a pendientes. |
| Otra semana o VAN | Semana lunes–domingo, navegación, filtro y fechas futuras diferenciadas. |
| Exportar CSV | Servicios/adicionales/observaciones y precios vacíos verificados por prueba. |

Las pruebas de integración usan un propietario temporal y usuarios ficticios sin acceso real a Clerk. Eliminan únicamente sus propios registros al terminar. No alteran fichas, rutas ni cobros del negocio. Ejecución explícita, con las variables del entorno elegido:

```sh
npm test
npx tsc --noEmit
npm run build
node --env-file=.env.local --import tsx tests/route-capture.integration.mjs
```
