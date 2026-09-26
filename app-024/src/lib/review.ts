// 人工复核：有效结论与「人工/自动不一致」判定（纯函数，供列表筛选与各页面复用）
import type { Riddle, Verdict } from '../types';

/** 有效校验结论：有人工复核以人工为准，否则用自动结论 */
export function effectiveVerdict(r: Riddle): Verdict {
  return r.review?.verdict ?? r.check.verdict;
}

/** 人工结论与当前自动结论是否不一致（需单独列出复核） */
export function isDivergent(r: Riddle): boolean {
  return !!r.review && r.review.verdict !== r.check.verdict;
}
