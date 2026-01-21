# GCP视频同步到数据库 - 使用指南

## 📋 功能概述

本功能用于：
1. ✅ 读取分割脚本生成的 `manifest.jsonl` 和 `state.json`
2. ✅ 读取上传脚本生成的 `asset_summary_YYYY-MM-DD.json` 和 `upload_log_YYYY-MM-DD.csv`
3. ✅ 从GCP读取已上传的文件列表（可选验证）
4. ✅ 将视频信息写入数据库 `video` 表

## 🔑 授权说明

### ⚠️ 重要：GCP使用JSON KEY文件，不是Token！

GCP认证需要**服务账号的JSON密钥文件**，配置方式：

#### 方式一：使用密钥文件路径（推荐开发环境）

在 `.env` 文件中配置：
```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=qinshortvide
GCS_KEY_FILENAME=E:/path/to/gcs-upload-sa.json
```

#### 方式二：使用凭证JSON字符串（推荐生产环境）

在 `.env` 文件中配置：
```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=qinshortvide
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

### 如何获取服务账号密钥：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 进入 **IAM 和管理** > **服务账号**
3. 选择或创建服务账号
4. 点击 **密钥** 标签 > **添加密钥** > **创建新密钥**
5. 选择 **JSON** 格式
6. 下载并保存JSON文件

**注意**：确保服务账号有存储桶的**读取权限**（Storage Object Viewer）

## 🚀 使用方法

### 方法一：使用API接口（推荐）

#### 1. 测试GCP连接

```bash
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/admin/gcp/list-files?prefix=hls/&maxResults=10" -Method GET

# 或使用curl
curl "http://localhost:3000/api/admin/gcp/list-files?prefix=hls/&maxResults=10"
```

如果返回文件列表，说明GCP配置正确。

#### 2. 同步视频到数据库

```bash
# PowerShell
$body = @{
    manifestPath = "E:/code/movie/.../m3u8/manifest.jsonl"
    assetSummaryPath = "E:/code/movie/.../m3u8/gcpup/asset_summary_2026-01-21.json"
    readFromGCP = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/admin/gcp/sync-videos" -Method POST -Body $body -ContentType "application/json"

# 或使用curl
curl -X POST http://localhost:3000/api/admin/gcp/sync-videos \
  -H "Content-Type: application/json" \
  -d '{
    "readFromGCP": true
  }'
```

**如果不提供路径，脚本会自动从默认位置读取：**
- `../m3u8/manifest.jsonl`
- `../m3u8/gcpup/asset_summary_YYYY-MM-DD.json` (最新文件)

#### 3. 使用测试脚本

运行提供的PowerShell测试脚本：
```powershell
cd chunyu-cms-v2\m3u8
.\test-sync.ps1
```

### 方法二：直接调用API（简单）

最简单的方式，不提供任何路径，让脚本自动查找：

```bash
curl -X POST http://localhost:3000/api/admin/gcp/sync-videos \
  -H "Content-Type: application/json" \
  -d '{"readFromGCP": true}'
```

## 📊 API接口说明

### 1. 列出GCP文件

**GET** `/api/admin/gcp/list-files`

**查询参数：**
- `prefix` (可选): 文件前缀，默认 `hls/`
- `maxResults` (可选): 最大返回数量，默认 1000

**返回示例：**
```json
{
  "code": 200,
  "msg": "成功",
  "data": {
    "bucket": "qinshortvide",
    "prefix": "hls/",
    "total_files": 1340,
    "total_assets": 67,
    "assets": [
      {
        "asset_id": "08a1175a72c9904a0fa5dc548dd84455728e1ffb",
        "file_count": 20,
        "total_size_mb": 15.67,
        "playlist": "https://storage.googleapis.com/.../playlist.m3u8",
        "cover": "https://storage.googleapis.com/.../cover.jpg"
      }
    ]
  }
}
```

### 2. 同步视频到数据库

**POST** `/api/admin/gcp/sync-videos`

**请求体：**
```json
{
  "manifestPath": "文件路径（可选）",
  "assetSummaryPath": "文件路径（可选）",
  "readFromGCP": true,
  "bucketName": "存储桶名称（可选）",
  "baseDir": "hls"
}
```

**返回示例：**
```json
{
  "code": 200,
  "msg": "成功",
  "data": {
    "message": "同步完成: 总计 67, 成功 67, 跳过 0, 失败 0",
    "results": {
      "total": 67,
      "success": 67,
      "skipped": 0,
      "failed": 0,
      "errors": [],
      "videos": [
        {
          "asset_id": "08a1175a72c9904a0fa5dc548dd84455728e1ffb",
          "title": "18-妹妹来啦-横竖撇点折",
          "url": "https://storage.googleapis.com/..."
        }
      ]
    }
  }
}
```

## 🔍 检测脚本状态

### 检测分割脚本 (`hls_pack_oss_ready.py`)

1. **检查输出文件**
   ```bash
   # 检查manifest.jsonl
   Get-Content ..\m3u8\manifest.jsonl | Measure-Object -Line
   
   # 检查state.json
   Get-Content ..\m3u8\state.json | ConvertFrom-Json
   
   # 检查output目录
   Get-ChildItem ..\m3u8\output -Directory | Measure-Object
   ```

2. **查看处理状态**
   - `state.json` 中的 `status` 字段
   - `done`: 处理完成
   - `failed`: 处理失败
   - `processing`: 处理中

### 检测上传脚本 (`upload.py`)

1. **检查上传日志**
   ```bash
   # 查看CSV日志
   Import-Csv ..\m3u8\gcpup\upload_log_2026-01-21.csv | Group-Object status
   ```

2. **检查汇总文件**
   ```bash
   # 查看JSON汇总
   Get-Content ..\m3u8\gcpup\asset_summary_2026-01-21.json | ConvertFrom-Json | Select-Object -First 1
   ```

3. **验证GCP文件**
   ```bash
   # 调用API列出GCP文件
   Invoke-RestMethod -Uri "http://localhost:3000/api/admin/gcp/list-files"
   ```

### 检测同步脚本

1. **运行同步**
   ```bash
   curl -X POST http://localhost:3000/api/admin/gcp/sync-videos -d '{"readFromGCP": true}'
   ```

2. **检查数据库**
   ```sql
   SELECT COUNT(*) FROM video;
   SELECT * FROM video ORDER BY create_time DESC LIMIT 10;
   ```

## ⚠️ 常见问题

### 1. GCP认证失败

**错误**: `GCS 凭证配置错误` 或 `无法读取GCS文件`

**解决**:
- ✅ 检查 `.env` 文件中的 `GCS_KEY_FILENAME` 或 `GCS_CREDENTIALS`
- ✅ 确认JSON文件路径正确且文件存在
- ✅ 确认服务账号有存储桶的**读取权限**（Storage Object Viewer）
- ✅ 检查项目ID和存储桶名称是否正确

### 2. 文件路径不存在

**错误**: `文件不存在` 或 `无法读取文件`

**解决**:
- ✅ 提供正确的绝对路径
- ✅ 或让脚本自动从默认位置读取（不提供路径参数）
- ✅ Windows路径可以使用正斜杠 `/` 或反斜杠 `\`

### 3. 数据库插入失败

**错误**: `数据库插入失败` 或 SQL错误

**解决**:
- ✅ 检查数据库连接配置
- ✅ 确认 `video` 表存在
- ✅ 查看详细错误信息
- ✅ 检查必填字段（title, url, poster）

### 4. 重复数据

**说明**: 脚本会自动跳过已存在的视频（通过URL判断）

如果URL相同但想更新，需要先删除旧记录：
```sql
DELETE FROM video WHERE url = '旧的URL';
```

## 📝 数据映射

| 源数据字段 | 数据库字段 | 说明 |
|-----------|-----------|------|
| `original_stem` | `title` | 视频标题 |
| `playlist_url` | `url` | m3u8播放列表URL |
| `cover_url` | `poster` | 封面图片URL |
| `original_filename` | `name` | 原始文件名 |
| `playlist_path` | `path` | GCS路径 |
| `duration_sec` | `duration` | 时长（秒） |
| `width` | `width` | 宽度 |
| `height` | `height` | 高度 |
| `total_size_mb * 1024 * 1024` | `size` | 文件大小（字节） |

## 🎯 完整工作流程

1. **运行分割脚本**
   ```bash
   python hls_pack_oss_ready.py
   ```
   → 生成 `manifest.jsonl` 和 `state.json`

2. **运行上传脚本**
   ```bash
   python gcpup/upload.py
   ```
   → 生成 `upload_log_YYYY-MM-DD.csv` 和 `asset_summary_YYYY-MM-DD.json`

3. **同步到数据库**
   ```bash
   curl -X POST http://localhost:3000/api/admin/gcp/sync-videos -d '{"readFromGCP": true}'
   ```
   → 写入 `video` 表

4. **验证结果**
   ```sql
   SELECT COUNT(*) as total, 
          COUNT(CASE WHEN url LIKE '%m3u8%' THEN 1 END) as hls_videos
   FROM video;
   ```

## 📞 需要帮助？

如果遇到问题，请检查：
1. ✅ GCP配置是否正确（KEY文件路径或CREDENTIALS）
2. ✅ 服务账号权限是否足够
3. ✅ 数据库连接是否正常
4. ✅ 文件路径是否正确

**记住**：GCP使用**JSON KEY文件**认证，**不是token**！
