# Stage 1: Build
FROM node:20-alpine as build-stage

# Install dependencies for node-canvas (needed if npm install tries to build it)
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    pango-dev \
    giflib-dev \
    jpeg-dev \
    librsvg-dev

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG BUILD_NUMBER
RUN if [ -z "$BUILD_NUMBER" ]; then \
      VITE_BUILD_NUMBER=$(date +%Y%m%d-%H%M) npm run build; \
    else \
      VITE_BUILD_NUMBER=$BUILD_NUMBER npm run build; \
    fi

# Stage 2: Production
FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
