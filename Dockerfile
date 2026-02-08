# --- Stage 1: Base with system dependencies ---
FROM node:20-alpine AS base

# Install system dependencies for node-canvas
# These are shared between both the build and run stages
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    pango-dev \
    giflib-dev \
    jpeg-dev \
    librsvg-dev

WORKDIR /app

# --- Stage 2: Shared Node dependencies ---
FROM base AS deps
COPY package*.json ./
RUN npm install

# --- Stage 3: Frontend Build ---
FROM deps AS frontend-build
COPY . .
ARG BUILD_NUMBER
RUN if [ -z "$BUILD_NUMBER" ]; then \
      VITE_BUILD_NUMBER=$(date +%Y%m%d-%H%M) npm run build; \
    else \
      VITE_BUILD_NUMBER=$BUILD_NUMBER npm run build; \
    fi

# --- Stage 4: Frontend (Nginx) ---
FROM nginx:stable-alpine AS frontend
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# --- Stage 5: Backend (Node) ---
FROM base AS backend
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
