# Despliegue en AWS (App Runner)

El juego es una app Spring Boot (Vaadin + WebSocket) que escucha en el puerto **8080**.
**Privacidad (TEA):** no se almacena ningún dato de alumno en la nube. El estado de la
partida vive solo en memoria del servidor y el registro de participación se exporta como
CSV **en el navegador del educador**. AWS solo hospeda el código y la conexión en vivo.

## Prerrequisitos
- Cuenta AWS y permisos para crear un servicio en **App Runner** (y ECR si usas contenedor).
- El repositorio debe estar en **GitHub** (para el modo código fuente) o tus credenciales
  de AWS CLI configuradas (`aws configure`).
- Java 17 para construir localmente (opcional, App Runner construye solo).

## Opción A — App Runner en modo "código fuente" (sin Docker, recomendado)
App Runner detecta el proyecto Maven, ejecuta el empaquetado y arranca el jar.

1. Sube el repo a GitHub (necesitamos un remoto; hoy el repo es solo local).
2. En la consola de AWS → **App Runner → Create service → Source code repository**.
3. Conecta tu cuenta de GitHub y elige el repo/rama.
4. Configuración de build (App Runner la autodetecta, pero verifica):
   - **Build command:** `mvn -DskipTests package`
   - **Start command:** `java -jar target/*.jar`
   - **Port:** `8080`
5. Create service. Al terminar, AWS da una URL `https://<id>.awsapprunner.com`.
6. Ábrela como `https://<id>.awsapprunner.com/host.html` (pantalla del educador) y comparte
   `https://<id>.awsapprunner.com/player.html` con los alumnos en sus móviles.

Equivalente por CLI:
```bash
aws apprunner create-service \
  --service-name pinturillo-tea \
  --source-configuration '{
      "AuthenticationConfiguration": {"ConnectionArn":"<ARN-conexion-github>"},
      "AutoDeploymentsEnabled": true,
      "CodeRepository": {
        "RepositoryUrl": "https://github.com/<usuario>/pinturillo-tea",
        "SourceCodeVersion": {"Type":"BRANCH","Value":"main"},
        "CodeConfiguration": {
          "ConfigurationSource": "API",
          "CodeConfigurationValues": {
            "Runtime": "CORRETTO17",
            "BuildCommand": "mvn -DskipTests package",
            "StartCommand": "java -jar target/*.jar",
            "Port": "8080"
          }
        }
      }
    }'
```

## Opción B — Modo contenedor (Docker + ECR)
Útil si quieres control total o usar ECS/Fargate.

```bash
# 1) Construir y subir la imagen a ECR
aws ecr create-repository --repository-name pinturillo-tea
aws ecr get-login-password | docker login --username AWS --password-stdin <cuenta>.dkr.ecr.<region>.amazonaws.com
docker build -t pinturillo-tea .
docker tag pinturillo-tea:latest <cuenta>.dkr.ecr.<region>.amazonaws.com/pinturillo-tea:latest
docker push <cuenta>.dkr.ecr.<region>.amazonaws.com/pinturillo-tea:latest

# 2) Crear el servicio en App Runner apuntando a esa imagen (modo contenedor)
```
El `Dockerfile` ya es multi-etapa (construye con Maven+Node y corre con JRE 17).

## Verificación rápida tras el despliegue
- `https://<url>/host.html` debe cargar (200).
- `https://<url>/api/wordbank` debe devolver JSON con 12 categorías.
- Crear una sala, unir un móvil, dibujar y adivinar a través del WebSocket `/ws`.

## Notas
- Sin base de datos ni archivos: al reiniciar el servicio se pierden las salas activas
  (esperado para una sesión de clase).
- El certificado HTTPS la da App Runner automáticamente.
