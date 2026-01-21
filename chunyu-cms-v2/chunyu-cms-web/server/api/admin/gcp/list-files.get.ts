import { GCSServices } from '~~/server/services/gcp/gcs.services';

/**
 * 列出GCP存储桶中的文件
 * 
 * 授权说明：
 * GCP使用服务账号的JSON KEY文件进行认证，不是token
 * 需要在环境变量中配置：
 * - GCS_PROJECT_ID: GCP项目ID
 * - GCS_BUCKET_NAME: GCS存储桶名称
 * - GCS_KEY_FILENAME: 服务账号JSON密钥文件路径（或使用GCS_CREDENTIALS）
 * - GCS_CREDENTIALS: 服务账号JSON凭证字符串（优先级高于KEY_FILENAME）
 */
export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const prefix = (query.prefix as string) || 'hls/'; // 默认前缀
    const maxResults = query.maxResults ? Number(query.maxResults) : 1000;

    const bucket = GCSServices.getBucket();
    const config = GCSServices.getConfig();

    console.log(`列出GCS文件 (bucket: ${config.bucketName}, prefix: ${prefix})...`);

    // 列出文件
    const [files] = await bucket.getFiles({
      prefix,
      maxResults
    });

    // 按目录分组
    const assets: Record<string, {
      asset_id: string;
      files: Array<{
        name: string;
        size: number;
        updated: string;
        contentType?: string;
      }>;
      playlist?: string;
      cover?: string;
      totalSize: number;
    }> = {};

    files.forEach(file => {
      // 解析路径: hls/{asset_id}/{filename}
      const match = file.name.match(/^hls\/([^/]+)\/(.+)$/);
      if (match && match[1] && match[2]) {
        const assetId = match[1];
        const filename = match[2];

        if (!assets[assetId]) {
          assets[assetId] = {
            asset_id: assetId,
            files: [],
            totalSize: 0
          };
        }

        const fileInfo = {
          name: filename,
          size: Number(file.metadata.size || 0),
          updated: file.metadata.updated || '',
          contentType: file.metadata.contentType
        };

        assets[assetId].files.push(fileInfo);
        assets[assetId].totalSize += fileInfo.size;

        // 识别playlist和cover
        if (filename.endsWith('.m3u8')) {
          assets[assetId].playlist = `https://storage.googleapis.com/${config.bucketName}/${file.name}`;
        } else if (filename.match(/\.(jpg|jpeg|png)$/i)) {
          assets[assetId].cover = `https://storage.googleapis.com/${config.bucketName}/${file.name}`;
        }
      }
    });

    const assetList = Object.values(assets);

    return createApiResponse({
      bucket: config.bucketName,
      prefix,
      total_files: files.length,
      total_assets: assetList.length,
      assets: assetList.map(asset => ({
        asset_id: asset.asset_id,
        file_count: asset.files.length,
        total_size_mb: Math.round((asset.totalSize / 1024 / 1024) * 100) / 100,
        playlist: asset.playlist,
        cover: asset.cover,
        files: asset.files.slice(0, 10) // 只返回前10个文件
      }))
    });
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `读取GCP文件失败: ${error.message}`
    });
  }
});
