# Akira

Asistente interno de AL’AGUA DOGS para administración. Se abre con el botón del bóxer, abajo a la derecha del portal. Usa la sesión de Clerk y los mismos permisos de la agenda.

## Funciones

- Conversación en español con OpenAI Responses y `gpt-5-mini` (cambiable mediante `AKIRA_MODEL`).
- Busca fichas por cliente, mascota o domicilio y pide aclaración cuando encuentra varias coincidencias. No crea ni fusiona clientes.
- Consulta citas con horario y distingue las visitas históricas importadas, que no confirman disponibilidad.
- Propone horarios y camionetas según carga, zona y coordenadas disponibles. Valida cruces de camioneta, bañador y mascota.
- Presenta una tarjeta con cliente, mascota, domicilio, servicio, horario, camioneta, duración y precio del catálogo. El botón de confirmación guarda mediante la API existente de operaciones, con control de revisión e idempotencia.
- La habilidad de planificación está en `lib/akira-routing.ts`: `route_readiness` revisa base, ubicaciones, visitas sin horario y servicios iniciados/terminados para una camioneta o las cuatro. El botón **Revisar preparación de rutas** permite pedir ese diagnóstico desde el chat.
- Reordena citas confirmadas cuando la base y todos los domicilios tienen coordenadas. El motor compara el circuito completo incluyendo el regreso a base: búsqueda exacta hasta 12 paradas y una heurística de varios inicios con mejora 2-opt para 13–60. La heurística conserva un recorrido no peor que el orden inicial, pero no garantiza el óptimo global. La tarjeta muestra ahorro y regreso estimados para revisar los nuevos horarios antes de aplicarlos. La API vuelve a calcular y validar la ruta al confirmar.

## Límites explícitos

El motor local de tarjetas usa distancias en línea recta y traslados estimados. La consulta vial independiente de Google Maps usa calles y devuelve orden, kilómetros y minutos estimados, sin tráfico en vivo. Ninguno promete el óptimo global ni garantiza ventanas de llegada sin tiempos de servicio confirmados. Para sugerir camioneta se usa coincidencia de zona y carga. El horario de búsqueda predeterminado (09:00–18:00) es una ventana de sugerencia, no un horario comercial confirmado.

El historial archivado se excluye del diagnóstico. Una visita cuyo domicilio difiere de la ficha no hereda sus coordenadas. Las visitas sin horario bloquean la aplicación de una reorganización de citas de esa camioneta y fecha, porque aún no se puede comprobar su disponibilidad. El regreso a la base debe terminar dentro del mismo día. La preparación no captura ubicaciones, cambia pagos ni convierte visitas de ruta en citas.

Google Maps está activado en `alagua-dogs-rutas` (ALAGUA DOGS Rutas), con clave de servidor restringida a Routes y Geocoding. `road_route_preview` permite a Akira consultar el orden por calles de hasta 25 visitas de una camioneta, con salida y regreso a base, sin aplicar horarios ni crear registros. El domicilio completo de la base lo proporcionó la usuaria y se guarda sin inventar coordenadas. La revisión geográfica es de solo lectura y puede devolver una ubicación interpolada que Administración debe verificar.

En **Equipo y servicios > Google Maps** se ve el consumo compartido y se puede consultar un recorrido por fecha/camioneta o revisar el domicilio de base. `maps_usage` reserva cada intento de HTTP antes de llamar al proveedor mediante UPSERT condicional en Postgres: 1,000 solicitudes de Routes y 1,000 de Geocoding por mes, compartidas entre usuarios, funciones y cuatro camionetas. Reinicio el día 1 en `America/Monterrey`; errores y tiempos agotados no se descuentan; no hay reintentos automáticos. La agenda sigue disponible al bloquearse una función. Todas las consultas requieren Administración activa y vigente. Ninguna clave se devuelve al cliente.

La facturación de Google está en MXN. Presupuesto mensual de alertas de $170 MXN, al 50%, 80% y 100%, exclusivo del proyecto de rutas y sin descontar créditos promocionales; notificaciones a los administradores/usuarios de facturación. Las alertas no detienen cargos. Las cuotas nativas aparecieron como no editables en la cuenta de prueba; el límite mensual se hace cumplir en el portal. `GOOGLE_MAPS_API_KEY` se almacena en `.env.local` ignorado y en Vercel Production como secreto. No publicar respaldos privados ni credenciales.

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
