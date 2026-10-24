# Akira

Asistente interno de AL’AGUA DOGS para administración. Se abre con el botón del bóxer, abajo a la derecha del portal. Usa la sesión de Clerk y los mismos permisos de la agenda.

## Funciones

- Conversación en español con OpenAI Responses y `gpt-5-mini` (cambiable mediante `AKIRA_MODEL`).
- Busca fichas por cliente, mascota o domicilio y pide aclaración cuando encuentra varias coincidencias. No crea ni fusiona clientes.
- Consulta citas con horario y distingue las visitas históricas importadas, que no confirman disponibilidad.
- Propone horarios y camionetas según carga, zona y coordenadas disponibles. Valida cruces de camioneta, bañador y mascota.
- Presenta una tarjeta con cliente, mascota, domicilio, servicio, horario, camioneta, duración y precio del catálogo. El botón de confirmación guarda mediante la API existente de operaciones, con control de revisión e idempotencia.
- Reordena citas confirmadas con el motor existente cuando la base y todos los domicilios tienen coordenadas. La tarjeta permite revisar los nuevos horarios antes de aplicarlos.

## Límites explícitos

Las distancias son en línea recta, y los traslados son estimaciones. No se conectó un proveedor de mapas, calles o tráfico. Si faltan coordenadas, Akira informa qué datos completar; para sugerir una camioneta puede usar coincidencia de zona y carga. El horario de búsqueda predeterminado (09:00–18:00) es una ventana de sugerencia, no un horario comercial confirmado.

Los precios y duraciones vienen del catálogo y deben revisarse para cada mascota. No se inventan tiempos para el historial importado. Las herramientas del modelo no escriben: las citas y rutas se aplican únicamente con la confirmación visible. Las propuestas caducan si cambia la revisión de la agenda.

La conversación vive en memoria de la pestaña y se puede reiniciar. Las peticiones de OpenAI usan `store: false`. Se envían mensajes, catálogo, camionetas y los datos concretos consultados por herramientas; no se envían teléfonos, notas privadas, pagos o toda la base de clientes. El límite es de ocho consultas por minuto y cien por día por cuenta de administración; se cuenta en `team_audit` sin almacenar el texto de la conversación.

## Configuración y comprobaciones

`OPENAI_API_KEY` es privada y solo se utiliza en el servidor. Se guarda localmente en `.env.local`, excluido de Git y del despliegue de archivos, y en Vercel como secreto de Production. Nunca se usa un prefijo `NEXT_PUBLIC_`.

Ejecutar `npm test`, `npx tsc --noEmit`, ESLint en los archivos nuevos y `npm run build`. Comprobar el chat con una cuenta de administración, la identificación de fichas ambiguas, la tarjeta de cita y el aviso de coordenadas faltantes. Las pruebas automatizadas usan estado de ejemplo y no escriben citas en producción.

Documentación de referencia: [Function calling](https://developers.openai.com/api/docs/guides/function-calling) y [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## Avatar

Imagen generada con la herramienta integrada ImageGen y guardada en `public/brand/akira-boxer.png`. Se sirve con Next Image. El original se conserva en la biblioteca local de imágenes generadas.

Prompt utilizado:

> Create a finished brand mascot avatar for an existing Mexican mobile dog grooming portal AL'AGUA DOGS. Asset: one isolated centered head-and-upper-chest portrait of AKIRA, a warm, friendly BOXER DOG, looking at the viewer. Clearly a boxer, not a French bulldog or Boston terrier: natural floppy folded ears, fawn/tawny fur, broad dark charcoal muzzle, white blaze down the forehead and nose, white chest, expressive kind dark eyes, slightly goofy sweet smile. Stylish clean flat editorial 2D illustration, bold smooth deep navy outlines #1c1b34, restrained subtle shading, coral #ff5e41 collar with a little turquoise #89d9cf bandana detail, warm cream highlights. Rounded balanced composition that reads clearly as a 48px chat avatar; head takes most of the square canvas, both floppy ears fully inside the frame with comfortable padding. Transparent background, no background circle, no text, no lettering, no logo, no watermark, no additional characters, no hands or grooming props. Premium cohesive playful pet spa identity, professional finished digital illustration.
