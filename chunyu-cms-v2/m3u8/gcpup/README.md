# GCP M3U8 文件上传工具

这个工具用于将 `output` 目录下各个子目录中的 m3u8 HLS 流媒体文件及其相关文件上传到 Google Cloud Storage (GCS)。

## 功能特性

- ✅ 自动遍历 `output` 目录下的所有子目录（资产目录）
- ✅ 上传每个资产目录下的所有文件（.m3u8, .ts, .jpg, .json, .txt 等）
- ✅ 支持断点续传（跳过已存在的文件）
- ✅ 详细的 CSV 日志记录，包含每个文件的上传状态
- ✅ JSON 格式的资产汇总文件，方便后续 API 调用
- ✅ 自动生成 GCS 公共 URL

## 文件结构

```
output/
├── {asset_id_1}/          # 资产目录（hash命名）
│   ├── playlist_*.m3u8   # HLS播放列表文件
│   ├── seg_*.ts          # 视频片段文件
│   ├── cover.jpg         # 封面图片
│   ├── meta.json         # 元数据文件
│   └── source_*.txt      # 源文件信息
├── {asset_id_2}/
│   └── ...
└── ...
```

## 配置说明

在 `upload.py` 文件顶部修改以下配置：

```python
BUCKET_NAME = "qinshortvide"                    # GCS存储桶名称
LOCAL_OUTPUT_DIR = r"F:\youtubeup\gcpup\output" # 本地输出目录
GCS_BASE_DIR = "hls"                            # GCS中的基础目录
SERVICE_ACCOUNT_KEY = r"F:\youtubeup\gcpup\gcs-upload-sa.json"  # 服务账号密钥文件
```

## 使用方法

1. **安装依赖**：
   ```bash
   pip install google-cloud-storage
   ```

2. **配置 GCP 服务账号**：
   - 确保 `gcs-upload-sa.json` 文件存在且有效
   - 确保服务账号有 GCS 存储桶的写入权限

3. **运行上传脚本**：
   ```bash
   python upload.py
   ```

## 输出文件

### 1. CSV 日志文件 (`upload_log_YYYY-MM-DD.csv`)

包含每个文件的上传详细信息：

| 字段 | 说明 |
|------|------|
| asset_id | 资产ID（子目录名） |
| file_type | 文件类型（playlist/segment/cover/metadata/text/key/other） |
| filename | 文件名 |
| status | 状态（SUCCESS/SKIPPED/FAILED） |
| local_path | 本地文件路径 |
| gcs_path | GCS中的路径 |
| gcs_url | GCS公共URL |
| size_mb | 文件大小（MB） |
| uploaded_at | 上传时间 |
| error_message | 错误信息（如有） |

### 2. JSON 汇总文件 (`asset_summary_YYYY-MM-DD.json`)

包含所有资产的汇总信息，方便后续 API 调用：

```json
{
  "asset_id": {
    "asset_id": "08a1175a72c9904a0fa5dc548dd84455728e1ffb",
    "uploaded_at": "2026-01-21 17:31:53",
    "files": {
      "playlist": {
        "filename": "playlist_20260121_173152.m3u8",
        "gcs_path": "hls/08a1175a72c9904a0fa5dc548dd84455728e1ffb/playlist_20260121_173152.m3u8",
        "gcs_url": "https://storage.googleapis.com/qinshortvide/hls/...",
        "size_mb": 0.01
      },
      "segments": [
        {
          "filename": "seg_00000.ts",
          "gcs_path": "hls/.../seg_00000.ts",
          "gcs_url": "https://storage.googleapis.com/...",
          "size_mb": 1.23
        }
      ],
      "cover": {
        "filename": "cover.jpg",
        "gcs_path": "hls/.../cover.jpg",
        "gcs_url": "https://storage.googleapis.com/...",
        "size_mb": 0.15
      },
      "metadata": {
        "filename": "meta.json",
        "gcs_path": "hls/.../meta.json",
        "gcs_url": "https://storage.googleapis.com/...",
        "size_mb": 0.001
      },
      "other": []
    },
    "total_size_mb": 15.67,
    "file_count": 17
  }
}
```

## API 调用示例

使用汇总文件进行 API 调用：

```python
import json

# 读取汇总文件
with open('asset_summary_2026-01-21.json', 'r', encoding='utf-8') as f:
    assets = json.load(f)

# 获取特定资产的播放列表URL
asset_id = "08a1175a72c9904a0fa5dc548dd84455728e1ffb"
playlist_url = assets[asset_id]["files"]["playlist"]["gcs_url"]

# 获取所有片段URL
segment_urls = [seg["gcs_url"] for seg in assets[asset_id]["files"]["segments"]]

# 获取封面URL
cover_url = assets[asset_id]["files"]["cover"]["gcs_url"]
```

## GCS 文件结构

上传后的 GCS 结构：

```
gs://qinshortvide/
└── hls/
    ├── {asset_id_1}/
    │   ├── playlist_*.m3u8
    │   ├── seg_00000.ts
    │   ├── seg_00001.ts
    │   ├── cover.jpg
    │   ├── meta.json
    │   └── ...
    ├── {asset_id_2}/
    │   └── ...
    └── ...
```

## 注意事项

1. **断点续传**：脚本会自动跳过已存在的文件，可以安全地多次运行
2. **错误处理**：上传失败的文件会记录错误信息，不会中断整个流程
3. **进度保存**：每处理10个资产会自动保存汇总文件，防止数据丢失
4. **公共访问**：生成的 URL 需要确保存储桶或文件设置为公共可读（如果需要）

## 故障排查

- **权限错误**：检查服务账号是否有存储桶的写入权限
- **网络超时**：大文件上传可能超时，脚本已设置 600 秒超时
- **文件不存在**：确保 `output` 目录下有子目录和文件
