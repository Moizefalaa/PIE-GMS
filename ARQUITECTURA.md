# Arquitectura — Pinturillo TEA

Juego de dibujar y adivinar para chicos con TEA en programa de integración.
Modelo **híbrido** (educador proyecta + alumnos en móviles), **guiado por educador**,
desplegado en **AWS solo como hospedaje** (sin PII ni datos de alumnos en la nube).

---

## 1. Principios
- **Privacidad de menores**: sin cuentas, sin login, sin PII. AWS = solo ejecuta el backend; las salas viven en memoria y se borran al cerrar/reiniciar.
- **Accesibilidad TEA**: modo calma, sin presión (temporizador opcional), refuerzo visual suave, adivinación por tarjetas (sin texto libre).
- **Reutilización**: se conserva el protocolo de eventos, el banco de palabras y la UX ya diseñados en el prototipo.

## 2. Stack
- **Vaadin Flow (Java 17+, Corretto)**: la UI se escribe en Java y Vaadin la renderiza como web (Web Components). Facilita, en el futuro, empaquetado tipo PWA o compartir la capa de servicios/modelo con una app Android nativa (Kotlin/Java) que consuma los mismos endpoints.
- **Tiempo real**: WebSocket gestionado en el backend (handler propio sobre WS, o Vaadin Push). Broadcast por sala para dibujo en vivo y adivinanzas.
- **Banco de palabras**: `wordbank.json` editable por el educador, servido desde el backend (igual formato que el prototipo).
- **Build**: Maven o Gradle → JAR ejecutable (servidor embebido).

## 3. Despliegue en AWS (solo hospedaje)
- **App Runner** (contenedor) o **ECS Fargate**: hospeda el JAR sin gestionar servidores. Para empezar basta **una instancia/contenedor** (sesiones efímeras en memoria).
- Si se escala a varias instancias: **sesiones pegajosas (sticky)** o un broker de mensajería; no es necesario para una primera versión.
- **Sin base de datos, sin S3 con datos de alumnos**. Solo el JAR y estáticos.
- **HTTPS obligatorio**: Route 53 + ACM; CloudFront opcional para cachear estáticos.
- Coste bajo (contenedor small); al no haber almacenamiento, no hay costes de BD.

## 4. Seguridad / privacidad (crítico para menores)
- Sin cuentas ni PII. Código de sala aleatorio de 4 cifras.
- Todo en memoria; se borra al cerrar la sala o reiniciar la app.
- Sin cámara / micrófono / geolocalización.
- Adivinación por tarjetas; sin chat de texto libre.
- Contenido 100% curado por el educador (banco JSON local).
- Cabeceras de seguridad básicas + HTTPS.

## 5. Modelo de dominio y protocolo (reutilizable del prototipo)
- `Room` (código, host, jugadores, ronda actual, temporizador).
- `Player` (clientId estable por dispositivo, alias efímero, rol).
- `Round` (categoría, modo [palabra|situación], palabra, opciones, correctId, drawerId, temporizador).
- Eventos (DTOs sobre WebSocket):
  `room_created`, `join`, `players`, `round`, `guess`, `guess_result`,
  `guess_event`, `draw`, `draw_clear`, `tick`, `reveal`, `cleared`.
- El **drawer** recibe la palabra; los demás solo las 4 tarjetas. El dibujo se transmite en ambos sentidos.

## 6. Accesibilidad TEA (mantener del prototipo)
- **Modo calma**: sin animación, letras/objetivos grandes; respeta `prefers-reduced-motion`. Persistencia en localStorage.
- **Reconexión automática** con identidad estable (clientId en localStorage) y gracia de 8 s para no perder el turno.
- **Temporizador opcional**: al agotarse, revela la respuesta sin penalización.
- **Refuerzo visual suave** (⭐) y lenguaje neutro en errores.

## 7. Estructura propuesta del proyecto
```
pinturillo-tea/
  pom.xml (o build.gradle)
  src/main/java/com/ejemplo/pinturillo/
    Application.java
    ui/        -> HostView, PlayerView, JoinView (Vaadin)
    service/   -> RoomService, GameService
    model/     -> Room, Player, Round, WordBank
    ws/        -> WebSocketHandler / Vaadin Push
    config/    -> SecurityHeaders, CalmMode
  src/main/resources/
    wordbank.json
    application.properties
  Dockerfile
  ARQUITECTURA.md
```

## 8. Roadmap (fases)
- **Fase 0** — Arquitectura (este documento) + decisión AWS.
- **Fase 1** — Esqueleto Vaadin + servir `wordbank.json` + crear sala (host).
- **Fase 2** — Unión de alumnos + ronda + adivinación por tarjetas (reutilizar protocolo).
- **Fase 3** — Dibujo en vivo bidireccional (WebSocket/Push).
- **Fase 4** — Modo calma, reconexión, temporizador, refuerzo visual.
- **Fase 5** — Empaquetado/despliegue AWS (App Runner/ECS) con HTTPS, solo hospedaje.
- **Fase 6 (futuro)** — PWA/offline o app Android nativa reusando modelo/servicio.

## 9. Riesgos y notas
- Vaadin es más pesado en memoria/arranque que Node, pero aceptable para una sala de aula.
- "App móvil" no es automática: Vaadin da web; para app nativa se comparte el backend con una app Android.
- AWS implica **dependencia de internet**: si el aula pierde conexión, no funciona. Alternativa de respaldo: JAR local en la PC del educador (launcher ya existente) y AWS solo para centros remotos.
- El prototipo Node/JS actual queda como referencia funcional y respaldo local.
