import { db } from '~~/server/utils/db';
import { movieBasicsTable } from '~~/server/db/schema/movie/movieBasics';
import { movieBasicToCountryTable } from '~~/server/db/schema/movie/movieBasicToCountry';
import { movieBasicToGenreTable } from '~~/server/db/schema/movie/movieBasicToGenre';
import { movieVideoTable } from '~~/server/db/schema/movie/movieVideo';
import { moviePhotoTable } from '~~/server/db/schema/movie/moviePhoto';
import { castTable } from '~~/server/db/schema/movie/cast';
import { moviePvTable } from '~~/server/db/schema/movie/moviePv';
import { movieWeeklyVisitsTable } from '~~/server/db/schema/movie/movieWeeklyVisits';
import { movieMonthVisitsTable } from '~~/server/db/schema/movie/movieMonthVisits';
import { movieYearVisitsTable } from '~~/server/db/schema/movie/movieYearVisits';
import { movieRateTable } from '~~/server/db/schema/movie/rate';
import { commentTable } from '~~/server/db/schema/movie/comment';
import { actorTable } from '~~/server/db/schema/movie/actor';
import { videoTable } from '~~/server/db/schema/movie/video';
import { videoResourceTable } from '~~/server/db/schema/movie/videoResource';
import { memberUserTable } from '~~/server/db/schema/member/user';
import { memberRateTable } from '~~/server/db/schema/member/rate';
import { memberWalletTable } from '~~/server/db/schema/member/wallet';
import { memberWalletLogTable } from '~~/server/db/schema/member/walletLog';
import { memberCouponTable } from '~~/server/db/schema/member/coupon';
import { memberMovieTable } from '~~/server/db/schema/member/movie';
import { memberOrderTable } from '~~/server/db/schema/member/order';
import { memberLikeTable } from '~~/server/db/schema/member/like';
import { memberCollectionTable } from '~~/server/db/schema/member/collection';
import { memberFavoriteTable } from '~~/server/db/schema/member/favorite';
import { memberInviteCodeTable } from '~~/server/db/schema/member/inviteCode';
import { memberInviteRecordTable } from '~~/server/db/schema/member/inviteRecord';
import { shortTable } from '~~/server/db/schema/shorts/short';
import { bannerTable } from '~~/server/db/schema/basic/banner';
import { countryTable } from '~~/server/db/schema/basic/country';
import { languageTable } from '~~/server/db/schema/basic/language';
import { levelTable } from '~~/server/db/schema/basic/level';
import { professionTable } from '~~/server/db/schema/basic/profession';
import { pubDateTable } from '~~/server/db/schema/movie/pubDate';
import { movieLevelTable } from '~~/server/db/schema/movie/movieLevel';

/**
 * 清理数据库，删除所有数据但保留基础类别（columns和genre）
 */
export default defineEventHandler(async event => {
  try {
    // 开始事务
    await db.execute('SET FOREIGN_KEY_CHECKS = 0;');

    // 删除所有业务数据表的数据（保留columns和genre）
    
    // 删除关联表数据
    await db.delete(movieBasicToGenreTable);
    await db.delete(movieBasicToCountryTable);
    await db.delete(castTable);
    await db.delete(movieVideoTable);
    await db.delete(moviePhotoTable);
    await db.delete(moviePvTable);
    await db.delete(movieWeeklyVisitsTable);
    await db.delete(movieMonthVisitsTable);
    await db.delete(movieYearVisitsTable);
    await db.delete(movieRateTable);
    await db.delete(commentTable);
    
    // 删除主表数据
    await db.delete(movieBasicsTable);
    await db.delete(actorTable);
    await db.delete(videoTable);
    await db.delete(videoResourceTable);
    
    // 删除用户相关数据
    await db.delete(memberLikeTable);
    await db.delete(memberCollectionTable);
    await db.delete(memberFavoriteTable);
    await db.delete(memberRateTable);
    await db.delete(memberMovieTable);
    await db.delete(memberOrderTable);
    await db.delete(memberWalletLogTable);
    await db.delete(memberCouponTable);
    await db.delete(memberInviteRecordTable);
    await db.delete(memberInviteCodeTable);
    await db.delete(memberWalletTable);
    await db.delete(memberUserTable);
    
    // 删除短视频数据
    await db.delete(shortTable);
    
    // 删除其他基础数据（但保留columns和genre）
    await db.delete(bannerTable);
    await db.delete(countryTable);
    await db.delete(languageTable);
    await db.delete(levelTable);
    await db.delete(professionTable);
    await db.delete(pubDateTable);
    await db.delete(movieLevelTable);

    // 恢复外键检查
    await db.execute('SET FOREIGN_KEY_CHECKS = 1;');

    return createApiResponse({
      message: '数据库清理完成，已保留基础类别（columns和genre）'
    });
  } catch (error) {
    await db.execute('SET FOREIGN_KEY_CHECKS = 1;');
    throw createError({
      statusCode: 500,
      message: `数据库清理失败: ${error.message}`
    });
  }
});
