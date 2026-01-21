import { eq } from 'drizzle-orm';
import { MemberWallet, memberWalletTable, NewMemberWallet } from '~~/server/db/schema/member/wallet';
import { MovieBasicsServices } from '~~/server/services/movie/movieBasics/movieBasics.services';
import { memberMovieTable } from '~~/server/db/schema/member/movie';
import { MemberWalletLogServices } from '~~/server/services/member/memberWalletLog.services';

export class MemberWalletServices {
  private movieBasicsServices: MovieBasicsServices;
  private memberWalletLogServices: MemberWalletLogServices;
  constructor() {
    this.movieBasicsServices = new MovieBasicsServices();
    this.memberWalletLogServices = new MemberWalletLogServices();
  }

  // 添加
  async add(data: NewMemberWallet) {
    await db.insert(memberWalletTable).values(data);
  }

  // 充值
  async recharge(memberUserId: number, gold: number, text?: string) {
    // 防御性验证：确保金额为正整数
    if (!Number.isInteger(gold) || gold <= 0) {
      throw createError({ statusCode: 400, message: '充值金额必须为正整数' });
    }

    // 防御性验证：设置单次充值上限
    const MAX_RECHARGE_AMOUNT = 100000;
    if (gold > MAX_RECHARGE_AMOUNT) {
      throw createError({ statusCode: 400, message: `单次充值金额不能超过${MAX_RECHARGE_AMOUNT}` });
    }

    const memberWallet = await this.getByMemberUserId(memberUserId);
    if (!memberWallet) {
      await this.add({
        memberUserId,
        gold
      });
      await this.memberWalletLogServices.add({
        memberUserId,
        gold,
        type: '1',
        remark: `${text || '充值'} +${gold}`,
        createTime: new Date()
      });
    } else {
      const newBalance = memberWallet.gold + gold;
      // 防止整数溢出
      if (newBalance > Number.MAX_SAFE_INTEGER) {
        throw createError({ statusCode: 400, message: '余额超出系统限制' });
      }

      await db
        .update(memberWalletTable)
        .set({ gold: newBalance, updateTime: new Date() })
        .where(eq(memberWalletTable.memberUserId, memberUserId));
      await this.memberWalletLogServices.add({
        memberUserId,
        gold: newBalance,
        type: '1',
        remark: `${text || '充值'} +${gold}`,
        createTime: new Date()
      });
    }
  }

  // 扣除
  async deduct(
    { memberUserId, gold, remark }: { memberUserId: number; gold: number; remark?: string | undefined },
    callback?: (memberWallet: any) => void
  ) {
    // 防御性验证：确保金额为正整数
    if (!Number.isInteger(gold) || gold <= 0) {
      throw createError({ statusCode: 400, message: '扣款金额必须为正整数' });
    }

    // 防御性验证：设置单次扣款上限
    const MAX_DEDUCT_AMOUNT = 10000;
    if (gold > MAX_DEDUCT_AMOUNT) {
      throw createError({ statusCode: 400, message: `单次扣款金额不能超过${MAX_DEDUCT_AMOUNT}` });
    }

    const memberWallet = await this.getByMemberUserId(memberUserId);
    if (!memberWallet) {
      throw createError({ statusCode: 400, message: '钱包余额不足' });
    } else if (memberWallet.gold < gold) {
      throw createError({ statusCode: 400, message: '钱包余额不足' });
    } else if (callback) {
      callback(memberWallet);
    } else {
      const newBalance = memberWallet.gold - gold;
      // 二次验证：确保余额不会变成负数
      if (newBalance < 0) {
        throw createError({ statusCode: 400, message: '扣款后余额不能为负数' });
      }

      await db
        .update(memberWalletTable)
        .set({ gold: newBalance, updateTime: new Date() })
        .where(eq(memberWalletTable.memberUserId, memberUserId));
      await this.memberWalletLogServices.add({
        memberUserId,
        gold: newBalance,
        type: '2',
        remark: remark || '扣款',
        createTime: new Date()
      });
    }
  }

  // 通过memberUserId获取
  async getByMemberUserId(memberUserId: number): Promise<MemberWallet | undefined> {
    return await db.query.memberWalletTable.findFirst({
      where: eq(memberWalletTable.memberUserId, memberUserId)
    });
  }

  // 购买影片
  async buyMovie(memberUserId: number, movieBasicsId: number) {
    const movieBasics = await this.movieBasicsServices.findById(movieBasicsId);
    if (!movieBasics) {
      throw createError({ statusCode: 400, message: '影片不存在' });
    }
    if (movieBasics.isPay === 0) {
      throw createError({ statusCode: 400, message: '影片无需购买' });
    }
    await this.deduct({ memberUserId, gold: movieBasics.paymentAmount }, async memberWallet => {
      await db.transaction(async tx => {
        // 更新钱包
        await tx
          .update(memberWalletTable)
          .set({ gold: memberWallet.gold - movieBasics.paymentAmount, updateTime: new Date() })
          .where(eq(memberWalletTable.memberUserId, memberUserId));
        //  写入会员影片表
        await tx.insert(memberMovieTable).values({ memberUserId, movieBasicsId, createTime: new Date() });
        // 写入记录表
        await this.memberWalletLogServices.add({
          memberUserId,
          gold: memberWallet.gold - movieBasics.paymentAmount,
          type: '2',
          remark: `购买影片:${movieBasics.title} -${movieBasics.paymentAmount}`,
          createTime: new Date()
        });
      });
    });
  }
}
