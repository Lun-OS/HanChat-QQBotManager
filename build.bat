@echo off
REM HanChat-QQBotManager Windows Build Script

setlocal enabledelayedexpansion

set APP_NAME=HanChat-QQBotManager
set BUILD_DIR=build
set VERSION=dev
set BUILD_TIME=%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set BUILD_TIME=!BUILD_TIME: =0!
set LDFLAGS=-s -w

REM Check build target
if "%1"=="" (
    set BUILD_TARGET=all
) else (
    set BUILD_TARGET=%1
)

REM Clean build directory
if "%BUILD_TARGET%"=="clean" (
    echo [INFO] Cleaning build directory...
    if exist %BUILD_DIR% rmdir /s /q %BUILD_DIR%
    echo [INFO] Clean completed.
    exit /b 0
)

REM Create build directory
if not exist %BUILD_DIR% mkdir %BUILD_DIR%

REM Build frontend web
if exist web (
    echo [INFO] Building frontend web...
    cd web
    
    REM Check if node_modules exists
    if not exist node_modules (
        echo [INFO] Installing frontend dependencies...
        call npm install
        if errorlevel 1 (
            echo [ERROR] Frontend dependencies installation failed.
            cd ..
            exit /b 1
        )
    )
    
    REM Build frontend
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Frontend build failed.
        cd ..
        exit /b 1
    )
    cd ..
    
    REM Copy built web files to build directory
    if exist web\dist (
        if exist %BUILD_DIR%\web rmdir /s /q %BUILD_DIR%\web
        xcopy /E /I /Y web\dist %BUILD_DIR%\web >nul
        echo [INFO] Frontend build copied to %BUILD_DIR%\web
    ) else (
        echo [WARN] Frontend dist folder not found
    )
) else (
    echo [WARN] Web folder not found, skipping frontend build
)

echo [INFO] Frontend build completed.
echo.

REM Copy extra resources (config, plugins)
echo [INFO] Copying resource directories...
for %%d in (config plugins) do (
    if exist %%d (
        xcopy /E /I /Y %%d %BUILD_DIR%\%%d >nul
        echo [INFO] Copied folder: %%d
    ) else (
        echo [WARN] Folder not found: %%d
    )
)
echo [INFO] Resource copy completed.
echo.

REM Build Windows version
if "%BUILD_TARGET%"=="all" (
    echo [INFO] Building Windows version...
    set GOOS=windows
    set GOARCH=amd64
    go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%\%APP_NAME%-windows-amd64.exe ./cmd/app
    if errorlevel 1 (
        echo [ERROR] Windows build failed.
        exit /b 1
    )
    echo [INFO] Windows build finished: %BUILD_DIR%\%APP_NAME%-windows-amd64.exe
)

if "%BUILD_TARGET%"=="windows" (
    echo [INFO] Building Windows version...
    set GOOS=windows
    set GOARCH=amd64
    go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%\%APP_NAME%-windows-amd64.exe ./cmd/app
    if errorlevel 1 (
        echo [ERROR] Windows build failed.
        exit /b 1
    )
    echo [INFO] Windows build finished: %BUILD_DIR%\%APP_NAME%-windows-amd64.exe
)

REM Build Linux version
if "%BUILD_TARGET%"=="all" (
    echo.
    echo [INFO] Building Linux version...
    set GOOS=linux
    set GOARCH=amd64
    go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%\%APP_NAME%-linux-amd64 ./cmd/app
    if errorlevel 1 (
        echo [ERROR] Linux build failed.
        exit /b 1
    )
    echo [INFO] Linux build finished: %BUILD_DIR%\%APP_NAME%-linux-amd64
)

if "%BUILD_TARGET%"=="linux" (
    echo [INFO] Building Linux version...
    set GOOS=linux
    set GOARCH=amd64
    go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%\%APP_NAME%-linux-amd64 ./cmd/app
    if errorlevel 1 (
        echo [ERROR] Linux build failed.
        exit /b 1
    )
    echo [INFO] Linux build finished: %BUILD_DIR%\%APP_NAME%-linux-amd64
)

if "%BUILD_TARGET%"=="all" (
    echo.
    echo ========================================
    echo [INFO] All builds completed successfully!
    echo [INFO] Windows: %BUILD_DIR%\%APP_NAME%-windows-amd64.exe
    echo [INFO] Linux:   %BUILD_DIR%\%APP_NAME%-linux-amd64
    echo [INFO] Web:     %BUILD_DIR%\web
    echo ========================================
)

endlocal
