# Google Cloud Storage (GCS) 配置指南

本文档介绍如何配置项目使用 Google Cloud Storage 作为文件存储服务。

## 1. 创建 GCP 项目和 Bucket

### 1.1 创建 GCP 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击顶部的项目选择器，选择"新建项目"
3. 输入项目名称，点击"创建"
4. 记住你的 **项目 ID**（Project ID）

### 1.2 启用 Cloud Storage API

1. 在 Cloud Console 中，进入 "API 和服务" > "库"
2. 搜索 "Cloud Storage"
3. 点击 "Cloud Storage JSON API"
4. 点击 "启用"

### 1.3 创建 Storage Bucket

1. 进入 "Cloud Storage" > "浏览"
2. 点击 "创建存储分区"
3. 配置 Bucket：
   - **名称**: 全局唯一的名称（如 `my-chunyu-cms-bucket`）
   - **位置类型**: 选择适合你的区域（如 `asia-east1`）
   - **存储类别**: Standard（标准）
   - **访问控制**: 根据需求选择（公开读取或细粒度控制）
4. 点击 "创建"

### 1.4 配置 Bucket 公开访问（可选）

如果需要文件公开访问：

1. 进入 Bucket 详情
2. 点击 "权限" 标签
3. 点击 "添加"
4. 新主账号：`allUsers`
5. 选择角色：`Storage Object Viewer`
6. 点击 "保存"

## 2. 创建服务账号

### 2.1 创建服务账号

1. 进入 "IAM 和管理" > "服务账号"
2. 点击 "创建服务账号"
3. 输入服务账号名称（如 `chunyu-cms-storage`）
4. 点击 "创建并继续"
5. 授予角色：`Storage Object Admin`（或更精细的权限）
6. 点击 "完成"

### 2.2 创建密钥

1. 点击刚创建的服务账号
2. 进入 "密钥" 标签
3. 点击 "添加密钥" > "创建新密钥"
4. 选择 "JSON" 格式
5. 点击 "创建"
6. 保存下载的 JSON 文件

## 3. 配置项目

### 3.1 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# 存储类型设置为 gcs
# 需要在管理后台的系统配置中设置 fileConfig 的值为 gcs

# GCP 项目 ID
GCS_PROJECT_ID=your-project-id

# GCS Bucket 名称
GCS_BUCKET_NAME=your-bucket-name

# 方式一：使用密钥文件路径
GCS_KEY_FILENAME=/path/to/service-account-key.json

# 方式二：直接使用凭证 JSON 字符串（推荐用于生产环境）
# 将 JSON 文件内容压缩为一行
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# 自定义域名（可选，用于 CDN）
GCS_CUSTOM_DOMAIN=cdn.yourdomain.com
```

### 3.2 在管理后台配置

1. 登录管理后台
2. 进入 "系统管理" > "参数设置"
3. 找到或添加 `fileConfig` 配置项
4. 将值设置为 `gcs` 或 `gcp`

## 4. 使用 CDN 加速（推荐）

### 4.1 使用 Cloud CDN

1. 进入 "网络服务" > "Cloud CDN"
2. 点击 "添加源"
3. 选择 "Cloud Storage 存储分区"
4. 选择你的 Bucket
5. 配置缓存策略
6. 点击 "创建"

### 4.2 使用自定义域名

1. 在 "Cloud Storage" 中，进入 Bucket 设置
2. 添加 CNAME 记录指向 `c.storage.googleapis.com`
3. 在 `.env` 中配置 `GCS_CUSTOM_DOMAIN`

## 5. API 接口使用

### 5.1 上传文件

上传接口保持不变，系统会根据配置自动选择存储位置：

```bash
POST /api/admin/common/upload
Content-Type: multipart/form-data

file: (binary)
```

### 5.2 返回格式

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "name": "example.jpg",
    "url": "https://storage.googleapis.com/your-bucket/uploads/2024-01-01/abc123.jpg",
    "mimeType": "image/jpeg",
    "width": 1920,
    "height": 1080,
    "size": 123456
  }
}
```

## 6. 直接调用 GCS 服务

如果需要在代码中直接使用 GCS 服务：

```typescript
import { GCSServices } from '~~/server/services/gcp/gcs.services';

// 上传文件
const result = await GCSServices.uploadFile(
  buffer,           // Buffer: 文件内容
  '/path/file.jpg', // string: 文件路径
  'image/jpeg'      // string: MIME 类型
);
console.log(result.url);  // 文件 URL
console.log(result.size); // 文件大小

// 生成签名 URL（用于私有文件）
const signedUrl = await GCSServices.getSignedUrl('/path/file.jpg', 60);
console.log(signedUrl); // 60分钟有效的访问链接

// 删除文件
await GCSServices.deleteFile('/path/file.jpg');

// 检查文件是否存在
const exists = await GCSServices.fileExists('/path/file.jpg');
```

## 7. 安全最佳实践

1. **不要在代码中硬编码凭证**：使用环境变量
2. **使用最小权限原则**：只授予必要的 IAM 权限
3. **定期轮换密钥**：定期更新服务账号密钥
4. **启用审计日志**：监控存储访问行为
5. **考虑使用签名 URL**：对于敏感文件，使用临时签名 URL

## 8. 费用估算

GCS 费用主要包括：
- **存储费用**：按 GB/月计费
- **网络出口费用**：下载流量费用
- **操作费用**：API 调用费用

详细价格请参考：[Cloud Storage 价格](https://cloud.google.com/storage/pricing)

## 9. 故障排除

### 常见错误

1. **401 Unauthorized**
   - 检查服务账号凭证是否正确
   - 确认服务账号有正确的 IAM 权限

2. **403 Forbidden**
   - 检查 Bucket 的访问控制设置
   - 确认服务账号有 `storage.objects.create` 权限

3. **404 Not Found**
   - 检查 Bucket 名称是否正确
   - 确认 Bucket 存在

### 调试建议

```typescript
// 在 GCSServices 中添加调试日志
console.log('GCS Config:', {
  projectId: runtimeConfig.gcs?.projectId,
  bucketName: runtimeConfig.gcs?.bucketName,
  hasCredentials: !!runtimeConfig.gcs?.credentials
});
```
