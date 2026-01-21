# GCP视频同步测试脚本

Write-Host "`n=== GCP视频同步测试 ===" -ForegroundColor Cyan
Write-Host ""

# 配置
$baseUrl = "http://localhost:3000"
$manifestPath = "E:\code\movie\movieforvideandmu3uinclud\chunyu-cms-v2\m3u8\manifest.jsonl"
$assetSummaryPath = "E:\code\movie\movieforvideandmu3uinclud\chunyu-cms-v2\m3u8\gcpup\asset_summary_2026-01-21.json"

Write-Host "1. 测试GCP连接..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/gcp/list-files?prefix=hls/&maxResults=10" -Method GET
    Write-Host "   ✅ GCP连接成功" -ForegroundColor Green
    Write-Host "   找到 $($listResponse.data.total_assets) 个资产目录" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ GCP连接失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   请检查GCP配置和授权" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n2. 同步视频到数据库..." -ForegroundColor Yellow

$body = @{
    manifestPath = $manifestPath
    assetSummaryPath = $assetSummaryPath
    readFromGCP = $true
    baseDir = "hls"
} | ConvertTo-Json

try {
    $syncResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/gcp/sync-videos" -Method POST -Body $body -ContentType "application/json"
    
    Write-Host "   ✅ 同步完成" -ForegroundColor Green
    Write-Host "   总计: $($syncResponse.data.results.total)" -ForegroundColor Gray
    Write-Host "   成功: $($syncResponse.data.results.success)" -ForegroundColor Green
    Write-Host "   跳过: $($syncResponse.data.results.skipped)" -ForegroundColor Yellow
    Write-Host "   失败: $($syncResponse.data.results.failed)" -ForegroundColor Red
    
    if ($syncResponse.data.results.errors.Count -gt 0) {
        Write-Host "`n   错误信息:" -ForegroundColor Red
        $syncResponse.data.results.errors | ForEach-Object {
            Write-Host "     - $_" -ForegroundColor Red
        }
    }
    
    if ($syncResponse.data.results.videos.Count -gt 0) {
        Write-Host "`n   已添加的视频 (前5个):" -ForegroundColor Cyan
        $syncResponse.data.results.videos | Select-Object -First 5 | ForEach-Object {
            Write-Host "     - $($_.title)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ❌ 同步失败: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   详情: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n=== 测试完成 ===" -ForegroundColor Cyan
