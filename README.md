# Connect Dots Game

A vibrant, interactive dot-connection puzzle game built with Vanilla JS and Vite.

## ✨ Features
- **Procedural Generation**: Every puzzle is unique and guaranteed to have a solution.
- **Interactive Gameplay**: Drag to connect dots; supports mouse and touch events.
- **Beautiful Visuals**: Procedural stone obstacles, dynamic HSL colors, and high-contrast numbered dots.
- **Game Logic**: Enforces non-crossing paths and correctly tracks puzzle completion.
- **Reveal Mode**: Toggleable solution view for testing or hints.

## 🚀 Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```

## 🐳 Docker Deployment (Ubuntu Server)
We provide a multi-stage Dockerfile and a docker-compose configuration for easy deployment.

### Option 1: Using Docker Compose (Recommended)
1. Run with one command:
   ```bash
   docker compose up -d
   ```

### Option 2: Using Docker CLI
1. Build the image:
   ```bash
   docker build -t connect-dots .
   ```
2. Run the container:
   ```bash
   docker run -d -p 80:80 --name dot-game connect-dots
   ```
The game will be available at `http://your-server-ip`.

## 🛠️ Built With
- HTML5 Canvas
- Vanilla JavaScript
- Vite (Build Tool)
- Nginx (Production Server)
