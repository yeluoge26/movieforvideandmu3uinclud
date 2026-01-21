# MySQL and Redis Installation Helper Script

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  MySQL and Redis Installation Helper" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check current status
Write-Host "Checking current status..." -ForegroundColor Yellow

$mysqlRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue
$redisRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue

Write-Host "`nMySQL Status:" -ForegroundColor Cyan
if ($mysqlRunning) {
    Write-Host "  [OK] MySQL is running on port 3306" -ForegroundColor Green
} else {
    Write-Host "  [X] MySQL is NOT running" -ForegroundColor Red
}

Write-Host "`nRedis Status:" -ForegroundColor Cyan
if ($redisRunning) {
    Write-Host "  [OK] Redis is running on port 6379" -ForegroundColor Green
} else {
    Write-Host "  [X] Redis is NOT running" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Installation Options:" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "MySQL Installation:" -ForegroundColor Yellow
Write-Host "  1. Official MySQL Installer:" -ForegroundColor White
Write-Host "     Download: https://dev.mysql.com/downloads/installer/" -ForegroundColor Gray
Write-Host "     After installation, start with: net start MySQL80" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. XAMPP (includes MySQL):" -ForegroundColor White
Write-Host "     Download: https://www.apachefriends.org/" -ForegroundColor Gray
Write-Host "     Use XAMPP Control Panel to start MySQL" -ForegroundColor Gray

Write-Host "`nRedis Installation:" -ForegroundColor Yellow
Write-Host "  1. Memurai (Recommended for Windows):" -ForegroundColor White
Write-Host "     Download: https://www.memurai.com/get-memurai" -ForegroundColor Gray
Write-Host "     After installation, start with: net start Memurai" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Docker (if Docker Desktop is installed):" -ForegroundColor White
Write-Host "     docker pull redis" -ForegroundColor Gray
Write-Host "     docker run -d --name redis -p 6379:6379 redis" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. GitHub Windows Version:" -ForegroundColor White
Write-Host "     Download: https://github.com/microsoftarchive/redis/releases" -ForegroundColor Gray

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Quick Start Commands:" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not $mysqlRunning) {
    Write-Host "To start MySQL:" -ForegroundColor Yellow
    Write-Host "  net start MySQL80" -ForegroundColor White
    Write-Host ""
}

if (-not $redisRunning) {
    Write-Host "To start Redis:" -ForegroundColor Yellow
    Write-Host "  net start Redis" -ForegroundColor White
    Write-Host "  or" -ForegroundColor Gray
    Write-Host "  net start Memurai" -ForegroundColor White
    Write-Host ""
}

Write-Host "After installation, run this script again to verify." -ForegroundColor Green
Write-Host ""
