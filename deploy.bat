@echo off
setlocal enabledelayedexpansion

REM Deployment script for watchlist-app
REM Usage: deploy.bat [version]
REM   deploy.bat          # Deploy latest version (local build)
REM   deploy.bat v1.2.3   # Deploy specific version
REM   deploy.bat latest   # Deploy latest from registry

set VERSION=%1
if "%VERSION%"=="" set VERSION=latest

echo Deploying watchlist-app version: %VERSION%

if "%VERSION%"=="latest" (
    echo Building and deploying latest version locally...
    docker-compose down
    docker-compose up -d --build
) else (
    echo Deploying version: %VERSION%
    
    REM Check if it's a local tag
    docker images | findstr "watchlist-app:%VERSION%" >nul
    if !errorlevel! equ 0 (
        echo Using local image: watchlist-app:%VERSION%
        set WATCHLIST_IMAGE=watchlist-app:%VERSION%
        docker-compose down
        docker-compose up -d
    ) else (
        echo Attempting to pull from registry...
        REM Note: This is a simplified version for Windows
        REM You may need to adjust the registry path based on your setup
        set WATCHLIST_IMAGE=watchlist-app:%VERSION%
        docker-compose down
        docker-compose up -d
    )
)

echo Deployment complete!
echo Container status:
docker-compose ps 