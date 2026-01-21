import { ShortServices } from '~~/server/services/short/short.services';
import { sanitize, sanitizeUrl } from '~~/server/utils/xss';

const shortServices = new ShortServices();

// 描述最大长度
const MAX_DESCRIPTION_LENGTH = 200;

export default defineEventHandler(async event => {
  const body = await readBody(event);

  // 验证视频URL
  if (!body.videoUrl || typeof body.videoUrl !== 'string') {
    return createApiResponse(null, 400, '视频地址不能为空');
  }

  // 验证封面URL
  if (!body.coverUrl || typeof body.coverUrl !== 'string') {
    return createApiResponse(null, 400, '封面地址不能为空');
  }

  // 清理和验证URL
  const safeVideoUrl = sanitizeUrl(body.videoUrl);
  const safeCoverUrl = sanitizeUrl(body.coverUrl);

  if (!safeVideoUrl) {
    return createApiResponse(null, 400, '视频地址格式无效');
  }

  if (!safeCoverUrl) {
    return createApiResponse(null, 400, '封面地址格式无效');
  }

  // XSS 过滤描述内容
  const safeDescription = body.description ? sanitize(body.description) : '';

  if (safeDescription.length > MAX_DESCRIPTION_LENGTH) {
    return createApiResponse(null, 400, `描述长度不能超过${MAX_DESCRIPTION_LENGTH}个字符`);
  }

  // 构建安全的短视频数据
  const safeShort = {
    videoUrl: safeVideoUrl,
    coverUrl: safeCoverUrl,
    description: safeDescription,
    memberUserId: event.context.memberUser.memberUserId,
    status: '0', // 待审核状态
    createTime: new Date()
  };

  await shortServices.add(safeShort);
  return createApiResponse(null);
});
