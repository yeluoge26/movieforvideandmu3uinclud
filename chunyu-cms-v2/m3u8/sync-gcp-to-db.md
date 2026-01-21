# GCP视频文件同步到数据库

## 功能说明

这个功能用于将已经上传到GCP的视频文件信息同步到数据库，以便检测分割脚本和上传脚本是否正常工作。

## 授权说明

**重要**: GCP使用**服务账号的JSON KEY文件**进行认证，**不是token**。

### 需要的授权信息：

1. **GCS_PROJECT_ID** - GCP项目ID
2. **GCS_BUCKET_NAME** - GCS存储桶名称
3. **GCS_KEY_FILENAME** - 服务账号JSON密钥文件路径（方式一）
   - 或
4. **GCS_CREDENTIALS** - 服务账号JSON凭证字符串（方式二，优先级更高）

### 如何获取服务账号密钥：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 进入 "IAM 和管理" > "服务账号"
3. 选择或创建服务账号
4. 点击 "密钥" 标签 > "添加密钥" > "创建新密钥"
5. 选择 JSON 格式
6. 下载JSON文件

### 配置方式：

**方式一：使用密钥文件路径**
```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=qinshortvide
GCS_KEY_FILENAME=/path/to/service-account-key.json
```

**方式二：使用凭证JSON字符串（推荐用于生产环境）**
```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=qinshortvide
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

## API接口

### 1. 列出GCP文件

**GET** `/api/admin/gcp/list-files`

查询参数：
- `prefix` (可选): 文件前缀，默认 `hls/`
- `maxResults` (可选): 最大返回数量，默认 1000

示例：
```bash
curl "http://localhost:3000/api/admin/gcp/list-files?prefix=hls/&maxResults=100"
```

### 2. 同步视频到数据库

**POST** `/api/admin/gcp/sync-videos`

请求体：
```json
{
  "manifestPath": "E:/code/movie/movieforvideandmu3uinclud/chunyu-cms-v2/m3u8/manifest.jsonl",
  "assetSummaryPath": "E:/code/movie/movieforvideandmu3uinclud/chunyu-cms-v2/m3u8/gcpup/asset_summary_2026-01-21.json",
  "readFromGCP": true,
  "bucketName": "qinshortvide",
  "baseDir": "hls"
}
```

参数说明：
- `manifestPath` (可选): manifest.jsonl文件路径
- `assetSummaryPath` (可选): asset_summary JSON文件路径
- `readFromGCP` (可选): 是否从GCP读取文件列表验证，默认 false
- `bucketName` (可选): GCS存储桶名称，默认从配置读取
- `baseDir` (可选): GCS基础目录，默认 `hls`

**如果不提供路径，脚本会自动从默认位置读取：**
- `../m3u8/manifest.jsonl`
- `../m3u8/gcpup/asset_summary_YYYY-MM-DD.json` (最新文件)

示例：
```bash
curl -X POST http://localhost:3000/api/admin/gcp/sync-videos \
  -H "Content-Type: application/json" \
  -d '{
    "readFromGCP": true
  }'
```

## 使用步骤

### 1. 确保GCP配置正确

检查 `.env` 文件中的GCP配置：
```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=qinshortvide
GCS_KEY_FILENAME=/path/to/gcs-upload-sa.json
# 或
GCS_CREDENTIALS={"type":"service_account",...}
```

### 2. 验证GCP连接

```bash
curl "http://localhost:3000/api/admin/gcp/list-files?prefix=hls/&maxResults=10"
```

如果返回文件列表，说明GCP连接正常。

### 3. 同步视频到数据库

```bash
curl -X POST http://localhost:3000/api/admin/gcp/sync-videos \
  -H "Content-Type: application/json" \
  -d '{
    "readFromGCP": true
  }'
```

### 4. 检查结果

返回结果示例：
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
          "url": "https://storage.googleapis.com/qinshortvide/hls/..."
        }
      ]
    }
  }
}
```

## 检测脚本状态

### 检测分割脚本 (`hls_pack_oss_ready.py`)

1. 检查 `manifest.jsonl` 文件是否存在且有数据
2. 检查 `state.json` 中的状态
3. 检查 `output/` 目录下是否有生成的HLS文件

### 检测上传脚本 (`upload.py`)

1. 调用 `/api/admin/gcp/list-files` 查看GCP中的文件
2. 检查 `upload_log_YYYY-MM-DD.csv` 文件
3. 检查 `asset_summary_YYYY-MM-DD.json` 文件

### 检测同步脚本

1. 调用 `/api/admin/gcp/sync-videos` 同步数据
2. 检查返回结果中的成功/失败数量
3. 查询数据库 `video` 表验证数据

## 常见问题

### 1. GCP认证失败

**错误**: `GCS 凭证配置错误` 或 `无法读取GCS文件`

**解决**:
- 检查 `.env` 文件中的GCP配置
- 确认服务账号JSON文件路径正确
- 确认服务账号有存储桶的读取权限

### 2. 文件路径不存在

**错误**: `文件不存在`

**解决**:
- 提供正确的 `manifestPath` 和 `assetSummaryPath`
- 或确保文件在默认位置

### 3. 数据库插入失败

**错误**: `数据库插入失败`

**解决**:
- 检查数据库连接
- 检查视频表结构
- 查看详细错误信息

## 注意事项

1. **授权方式**: GCP使用JSON KEY文件，不是token
2. **文件路径**: Windows路径使用反斜杠或正斜杠都可以
3. **重复检查**: 脚本会自动跳过已存在的视频（通过URL判断）
4. **GCP验证**: 启用 `readFromGCP` 可以验证文件是否真的在GCP中
5. **批量处理**: 大量文件时可能需要较长时间，请耐心等待
