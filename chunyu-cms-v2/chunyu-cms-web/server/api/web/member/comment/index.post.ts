import { CommentServices } from '~~/server/services/movie/comment/comment.services';
import { sanitize } from '~~/server/utils/xss';

const commentServices = new CommentServices();

// 评论内容最大长度
const MAX_COMMENT_LENGTH = 500;
// 弹幕内容最大长度
const MAX_DM_LENGTH = 50;

/**
 * 新增视频评论/弹幕
 */
export default defineEventHandler(async event => {
  const body = await readBody(event);

  // 验证评论内容
  if (!body.content || typeof body.content !== 'string') {
    return createApiResponse(null, 400, '评论内容不能为空');
  }

  // XSS 过滤评论内容
  const sanitizedContent = sanitize(body.content);

  if (!sanitizedContent) {
    return createApiResponse(null, 400, '评论内容无效');
  }

  // 根据是否为弹幕设置不同的长度限制
  const maxLength = body.isDm === '1' ? MAX_DM_LENGTH : MAX_COMMENT_LENGTH;
  if (sanitizedContent.length > maxLength) {
    return createApiResponse(null, 400, `内容长度不能超过${maxLength}个字符`);
  }

  // 验证 videoId
  if (body.videoId && (!Number.isInteger(Number(body.videoId)) || Number(body.videoId) <= 0)) {
    return createApiResponse(null, 400, '视频ID无效');
  }

  // 验证 movieBasicsId
  if (body.movieBasicsId && (!Number.isInteger(Number(body.movieBasicsId)) || Number(body.movieBasicsId) <= 0)) {
    return createApiResponse(null, 400, '影片ID无效');
  }

  // 构建安全的评论数据
  const safeComment = {
    content: sanitizedContent,
    videoId: body.videoId ? Number(body.videoId) : undefined,
    movieBasicsId: body.movieBasicsId ? Number(body.movieBasicsId) : undefined,
    isDm: body.isDm === '1' ? '1' : '0',
    start: body.isDm === '1' && body.start ? Number(body.start) : undefined,
    memberUserId: event.context.memberUser.memberUserId,
    createTime: new Date()
  };

  const commentId = await commentServices.add(safeComment);
  return createApiResponse(commentId);
});
