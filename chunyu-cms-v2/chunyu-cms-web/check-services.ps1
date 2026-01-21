# 检查 MySQL 和 Redis 服务状态

Write-Host "`n=== 服务状态检查 ===" -ForegroundColor Cyan
Write-Host ""

# 检查 MySQL
Write-Host "Checking MySQL (port 3306)..." -ForegroundColor Yellow
$mysql = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($mysql) {
    Write-Host "✅ MySQL 运行正常" -ForegroundColor Green
    try {
        $mysqlVersion = mysql --version 2>$null
        if ($mysqlVersion) {
            Write-Host "   版本: $mysqlVersion" -ForegroundColor Gray
        }
    } catch {
        # 忽略错误
    }
} else {
    Write-Host "❌ MySQL 未运行" -ForegroundColor Red
    Write-Host "   启动命令: net start MySQL80" -ForegroundColor Gray
    Write-Host "   或使用 XAMPP Control Panel 启动 MySQL" -ForegroundColor Gray
}

Write-Host ""

# 检查 Redis
Write-Host "Checking Redis (port 6379)..." -ForegroundColor Yellow
$redis = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($redis) {
    Write-Host "✅ Redis 运行正常" -ForegroundColor Green
    try {
        $redisPing = redis-cli ping 2>$null
        if ($redisPing -eq "PONG") {
            Write-Host "   连接测试: PONG" -ForegroundColor Gray
        }
    } catch {
        # 忽略错误
    }
} else {
    Write-Host "❌ Redis 未运行" -ForegroundColor Red
    Write-Host "   启动命令: net start Redis" -ForegroundColor Gray
    Write-Host "   或使用 Docker: docker run -d --name redis -p 6379:6379 redis" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== 检查完成 ===" -ForegroundColor Cyan
Write-Host ""
