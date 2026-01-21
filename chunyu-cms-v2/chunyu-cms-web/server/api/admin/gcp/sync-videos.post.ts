import { GCSServices } from '~~/server/services/gcp/gcs.services';
import { VideoServices } from '~~/server/services/movie/video/video.services';
import { db } from '~~/server/utils/db';
import { videoTable } from '~~/server/db/schema/movie/video';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const videoServices = new VideoServices();

interface ManifestItem {
  status: string;
  created_at: string;
  asset_id: string;
  original_filename: string;
  original_stem: string;
  output_dir?: string;
  playlist?: string;
  cover?: string;
  duration_sec?: number;
  width?: number;
  height?: number;
}

interface AssetSummary {
  asset_id: string;
  uploaded_at: string;
  files: {
    playlist?: {
      filename: string;
      gcs_path: string;
      gcs_url: string;
      size_mb: number;
    };
    segments?: Array<{
      filename: string;
      gcs_path: string;
      gcs_url: string;
      size_mb: number;
    }>;
    cover?: {
      filename: string;
      gcs_path: string;
      gcs_url: string;
      size_mb: number;
    };
    metadata?: {
      filename: string;
      gcs_path: string;
      gcs_url: string;
      size_mb: number;
    };
  };
  total_size_mb?: number;
  file_count?: number;
}

/**
 * 同步GCP视频文件到数据库
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
    const body = await readBody(event);
    const {
      manifestPath, // manifest.jsonl文件路径
      assetSummaryPath, // asset_summary JSON文件路径
      readFromGCP = false, // 是否从GCP读取文件列表验证
      bucketName, // GCS存储桶名称（可选，从配置读取）
      baseDir = 'hls' // GCS基础目录
    } = body;

    const results = {
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
      videos: [] as any[]
    };

    // 读取manifest.jsonl
    let manifestItems: ManifestItem[] = [];
    if (manifestPath && fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      manifestItems = manifestContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .filter(item => item.status === 'done');
      console.log(`读取manifest.jsonl: ${manifestItems.length} 条记录`);
    }

    // 读取asset_summary JSON
    let assetSummaries: Record<string, AssetSummary> = {};
    if (assetSummaryPath && fs.existsSync(assetSummaryPath)) {
      const summaryContent = fs.readFileSync(assetSummaryPath, 'utf-8');
      assetSummaries = JSON.parse(summaryContent);
      console.log(`读取asset_summary: ${Object.keys(assetSummaries).length} 个资产`);
    }

    // 如果没有提供路径，尝试从默认位置读取
    if (manifestItems.length === 0 && Object.keys(assetSummaries).length === 0) {
      // 尝试从m3u8目录读取（相对于项目根目录）
      const projectRoot = process.cwd();
      const m3u8Dir = path.join(projectRoot, '..', 'm3u8');
      const defaultManifest = path.join(m3u8Dir, 'manifest.jsonl');

      if (fs.existsSync(defaultManifest)) {
        try {
          const manifestContent = fs.readFileSync(defaultManifest, 'utf-8');
          manifestItems = manifestContent
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(item => item && item.status === 'done') as ManifestItem[];
          console.log(`从默认位置读取manifest.jsonl: ${manifestItems.length} 条记录`);
        } catch (error: any) {
          console.warn(`读取manifest.jsonl失败: ${error.message}`);
        }
      }

      // 查找最新的asset_summary文件
      const gcpupDir = path.join(m3u8Dir, 'gcpup');
      if (fs.existsSync(gcpupDir)) {
        try {
          const files = fs.readdirSync(gcpupDir)
            .filter(f => f.startsWith('asset_summary_') && f.endsWith('.json'))
            .sort()
            .reverse();
          
          if (files.length > 0) {
            const latestSummary = path.join(gcpupDir, files[0]);
            const summaryContent = fs.readFileSync(latestSummary, 'utf-8');
            assetSummaries = JSON.parse(summaryContent);
            console.log(`从默认位置读取asset_summary: ${Object.keys(assetSummaries).length} 个资产`);
          }
        } catch (error: any) {
          console.warn(`读取asset_summary失败: ${error.message}`);
        }
      }
    }

    // 合并数据：优先使用asset_summary，因为它包含GCS URL
    const mergedData: Map<string, any> = new Map();

    // 从manifest.jsonl添加数据
    manifestItems.forEach(item => {
      if (!mergedData.has(item.asset_id)) {
        mergedData.set(item.asset_id, {
          asset_id: item.asset_id,
          original_filename: item.original_filename,
          original_stem: item.original_stem,
          duration_sec: item.duration_sec,
          width: item.width,
          height: item.height,
          playlist: item.playlist,
          cover: item.cover,
          output_dir: item.output_dir
        });
      }
    });

    // 从asset_summary更新数据（包含GCS URL）
    Object.values(assetSummaries).forEach(summary => {
      const existing = mergedData.get(summary.asset_id) || {};
      mergedData.set(summary.asset_id, {
        ...existing,
        asset_id: summary.asset_id,
        uploaded_at: summary.uploaded_at,
        playlist_url: summary.files.playlist?.gcs_url,
        playlist_path: summary.files.playlist?.gcs_path,
        cover_url: summary.files.cover?.gcs_url,
        cover_path: summary.files.cover?.gcs_path,
        segments: summary.files.segments || [],
        total_size_mb: summary.total_size_mb || 0,
        file_count: summary.file_count || 0
      });
    });

    // 如果启用从GCP读取验证
    if (readFromGCP) {
      try {
        const bucket = GCSServices.getBucket();
        const config = GCSServices.getConfig();
        const actualBucketName = bucketName || config.bucketName;
        
        console.log(`从GCP读取文件列表验证 (bucket: ${actualBucketName}, dir: ${baseDir})...`);
        
        // 列出GCS中的文件
        const [files] = await bucket.getFiles({ prefix: `${baseDir}/` });
        const gcpAssets = new Set<string>();
        
        files.forEach(file => {
          const match = file.name.match(new RegExp(`${baseDir}/([^/]+)/`));
          if (match && match[1]) {
            gcpAssets.add(match[1]);
          }
        });
        
        console.log(`GCP中找到 ${gcpAssets.size} 个资产目录`);
        
        // 只处理在GCP中存在的资产
        const filteredData = new Map();
        mergedData.forEach((value, key) => {
          if (gcpAssets.has(key)) {
            filteredData.set(key, value);
          }
        });
        mergedData.clear();
        filteredData.forEach((value, key) => mergedData.set(key, value));
        
        console.log(`过滤后剩余 ${mergedData.size} 个资产`);
      } catch (gcpError: any) {
        console.warn(`GCP读取失败，跳过验证: ${gcpError.message}`);
        results.errors.push(`GCP验证失败: ${gcpError.message}`);
      }
    }

    // 写入数据库
    results.total = mergedData.size;
    
    for (const [assetId, data] of mergedData.entries()) {
      try {
        // 检查是否已存在（通过URL）
        let existingVideo = null;
        if (data.playlist_url) {
          existingVideo = await db.query.videoTable.findFirst({
            where: eq(videoTable.url, data.playlist_url)
          });
        }

        if (existingVideo) {
          results.skipped++;
          console.log(`跳过已存在: ${data.original_filename} (${assetId})`);
          continue;
        }

        // 计算总大小（字节）
        const totalSizeBytes = Math.round((data.total_size_mb || 0) * 1024 * 1024);

        // 插入视频记录
        const videoData = {
          title: data.original_stem || data.original_filename || `Video ${assetId}`,
          url: data.playlist_url || '', // m3u8播放列表URL
          poster: data.cover_url || '', // 封面URL
          name: data.original_filename || '',
          path: data.playlist_path || '', // GCS路径
          duration: data.duration_sec || 0, // 秒
          width: data.width || 0,
          height: data.height || 0,
          size: totalSizeBytes
        };

        await videoServices.add(videoData);
        results.success++;
        results.videos.push({
          asset_id: assetId,
          title: videoData.title,
          url: videoData.url
        });
        
        console.log(`✅ 已添加: ${videoData.title} (${assetId})`);
      } catch (error: any) {
        results.failed++;
        const errorMsg = `资产 ${assetId}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`❌ 失败: ${errorMsg}`);
      }
    }

    return createApiResponse({
      message: `同步完成: 总计 ${results.total}, 成功 ${results.success}, 跳过 ${results.skipped}, 失败 ${results.failed}`,
      results
    });
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `同步失败: ${error.message}`
    });
  }
});
