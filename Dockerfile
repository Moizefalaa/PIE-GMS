# ---- Etapa de construccion ----
FROM maven:3.9-eclipse-temurin-17 AS build
# Node es requerido por el build-frontend de Vaadin (empaqueta la UI)
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs npm \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY . .
RUN mvn -B -DskipTests package

# ---- Etapa de ejecucion ----
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
