// 人工复核：在自动校验结论之上的人工判定层（PRD §4.2 补充）
// 规则：
//  - 自动结论（check.verdict/reasons/checkedAt）每次保存与「重新校验全部」都重算刷新；
//  - 人工结论（check.review）重算时保留，生效结论以人工为准；
//  - 人工判定后若 谜面/谜底/谜目/谜格 任一变更（basis 指纹对不上），判定失效，回退自动结论，
//    但记录保留（谁判过、为什么判不丢），可撤销或重新判定；
//  - 人工结论与自动结论不一致的条目可单独筛出（search.ts 的 verdict='conflict'）。
import type { Riddle, Verdict } from '../types';

/** 判定依据指纹：谜面/谜底/谜目/谜格任一变化即不同（djb2，36 进制短串） */
export function reviewBasisOf(r: Pick<Riddle, 'surface' | 'answer' | 'category' | 'format'>): string {
  const s = `${r.surface}␟${r.answer}␟${r.category}␟${r.format}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 人工判定是否在判定后遭遇内容变更而失效 */
export function reviewStale(r: Riddle): boolean {
  const rev = r.check.review;
  return !!rev && rev.basis !== reviewBasisOf(r);
}

/** 是否存在仍有效的人工判定 */
export function hasActiveReview(r: Riddle): boolean {
  return !!r.check.review && !reviewStale(r);
}

/** 当前生效结论：人工判定有效时以人工为准，否则用自动结论 */
export function effectiveVerdict(r: Riddle): Verdict {
  return hasActiveReview(r) ? r.check.review!.verdict : r.check.verdict;
}

/** 人工结论与自动结论不一致（仅统计仍有效的判定）→ 单独列出复核 */
export function reviewConflicts(r: Riddle): boolean {
  return hasActiveReview(r) && r.check.review!.verdict !== r.check.verdict;
}
