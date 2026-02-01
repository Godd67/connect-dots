# Get current timestamp for build number (YYYYMMDD-HHmm)
$buildDate = Get-Date -Format "yyyyMMdd-HHmm"

Write-Host "🚀 Starting build for version 1.0.0-$buildDate..." -ForegroundColor Cyan

# Run Docker Compose build with the dynamic build number
docker compose build --no-cache --build-arg BUILD_NUMBER=$buildDate

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit $LASTEXITCODE
}

# Restart the services
docker compose up -d

Write-Host "✅ Deployment successful! Check the footer for v1.0.0-$buildDate" -ForegroundColor Green
