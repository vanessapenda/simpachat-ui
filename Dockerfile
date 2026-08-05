# --- Stage 1: build ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# --configuration explicite obligatoire : angular.json a "defaultConfiguration": "test",
# un `ng build` nu produirait un build pointant vers l'environnement test.
RUN npx ng build --configuration production

# --- Stage 2: runtime ---
FROM nginx:alpine

# Chemin /browser obligatoire (builder Angular 19 "application")
COPY --from=build /app/dist/simpachat-ui/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1/ || exit 1
