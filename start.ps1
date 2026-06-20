# HanChat-QQBotManager Startup Script
# This script reads .env file and starts the program from build directory

# Set error handling
$ErrorActionPreference = "Stop"

# Get script directory
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HanChat-QQBotManager Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Script Path: $ScriptPath" -ForegroundColor Gray
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

# Check if .env file exists in script directory
$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "Error: .env file not found at $EnvFile" -ForegroundColor Red
    Write-Host "Please ensure .env file exists with correct configuration" -ForegroundColor Yellow
    exit 1
}

Write-Host "Reading .env file: $EnvFile" -ForegroundColor Green
Write-Host ""

# Read and parse .env file
Get-Content $EnvFile | ForEach-Object {
    # Skip empty lines and comments
    if ($_ -match '^\s*$' -or $_ -match '^\s*#') {
        return
    }
    
    # Parse KEY=VALUE format
    if ($_ -match '^\s*([^=]+?)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # Remove quotes from value if present
        if ($value -match '^"(.*)"$') {
            $value = $matches[1]
        } elseif ($value -match "^'(.*)'$") {
            $value = $matches[1]
        }
        
        # Set environment variable
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        Write-Host "  Set env var: $key = $value" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Environment variables loaded" -ForegroundColor Green
Write-Host ""

# Check if build directory exists
$BuildDir = Join-Path $ProjectRoot "build"
if (-not (Test-Path $BuildDir)) {
    Write-Host "Error: Build directory not found: $BuildDir" -ForegroundColor Red
    Write-Host "Please run build.bat first to build the project" -ForegroundColor Yellow
    exit 1
}

# Check if executable exists in build directory
$ExePath = Join-Path $BuildDir "HanChat-QQBotManager-windows-amd64.exe"
if (-not (Test-Path $ExePath)) {
    Write-Host "Error: Executable not found: $ExePath" -ForegroundColor Red
    Write-Host "Please build program first: .\build.bat" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found executable: $ExePath" -ForegroundColor Green
Write-Host ""

# Copy .env file to build directory (so the program can find it)
$BuildEnvFile = Join-Path $BuildDir ".env"
Write-Host "Copying .env to build directory..." -ForegroundColor Gray
Copy-Item $EnvFile $BuildEnvFile -Force
Write-Host "  Copied: $BuildEnvFile" -ForegroundColor Gray
Write-Host ""

# Check if web directory exists in build directory (for serving frontend)
$WebDir = Join-Path $BuildDir "web"
if (Test-Path $WebDir) {
    Write-Host "Found web directory: $WebDir" -ForegroundColor Green
    Write-Host "Frontend will be served from build/web" -ForegroundColor Gray
} else {
    Write-Host "Warning: Web directory not found in build folder" -ForegroundColor Yellow
    Write-Host "Frontend may not be available" -ForegroundColor Yellow
}
Write-Host ""

# Change to build directory before starting (so the program can find web folder)
Write-Host "Changing to build directory: $BuildDir" -ForegroundColor Gray
Set-Location $BuildDir
Write-Host ""

Write-Host "Starting program: $ExePath" -ForegroundColor Green
Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the program" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start program
# Note: The Go program will look for 'web' folder in current working directory
try {
    $process = Start-Process -FilePath $ExePath -PassThru -Wait -NoNewWindow
    $exitCode = $process.ExitCode
    
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "Program exited normally" -ForegroundColor Green
    } else {
        Write-Host "Program exited abnormally (exit code: $exitCode)" -ForegroundColor Red
    }
}
catch {
    Write-Host ""
    Write-Host "Program exited with error" -ForegroundColor Red
    Write-Host "Error message: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Program has exited" -ForegroundColor Yellow
