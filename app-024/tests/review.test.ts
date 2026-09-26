// 人工复核单元测试：判定指纹 / 生效结论 / 失效回退 / 撤销 / 重算保留 / 不一致筛选
import { describe, it, expect, beforeEach } from 'vitest';
import { reviewBasisOf, reviewStale, hasActiveReview, effectiveVerdict, reviewConflicts } from '../src/lib/review';
import { filterRiddles, EMPTY_FILTERS } from '../src/lib/search';
import { store } from '../src/lib/store';
import type { ManualReview, Riddle } from '../src/types';

function mkRiddle(over: Partial<Riddle> = {}): Riddle {
  return {
    id: 'r1', no: 1, surface: '今天', answer: '日本', category: 'other', format: 'qiqian',
    difficulty: 2, tags: [],
    check: { verdict: 'suspect', reasons: ['秋千格倒读需人工确认'], checkedAt: 1 },
    ...over,
  };
}

function mkReview(r: Riddle, over: Partial<ManualReview> = {}): ManualReview {
  return { verdict: 'pass', reason: '「本日」扣「今天」成立', reviewer: '王师傅', at: 100, basis: reviewBasisOf(r), ...over };
}

describe('人工复核：判定指纹与生效结论（纯函数）', () => {
  it('内容相同 → 指纹相同；谜面/谜底/谜目/谜格任一变化 → 指纹不同', () => {
    const base = mkRiddle();
    expect(reviewBasisOf(base)).toBe(reviewBasisOf(mkRiddle()));
    expect(reviewBasisOf(mkRiddle({ surface: '明天' }))).not.toBe(reviewBasisOf(base));
    expect(reviewBasisOf(mkRiddle({ answer: '本日' }))).not.toBe(reviewBasisOf(base));
    expect(reviewBasisOf(mkRiddle({ category: 'place' }))).not.toBe(reviewBasisOf(base));
    expect(reviewBasisOf(mkRiddle({ format: 'juanlian' }))).not.toBe(reviewBasisOf(base));
  });

  it('无人工复核 → 生效结论即自动结论', () => {
    expect(effectiveVerdict(mkRiddle())).toBe('suspect');
    expect(hasActiveReview(mkRiddle())).toBe(false);
  });

  it('人工判通过 → 覆盖自动存疑；自动结论本身保留', () => {
    const r = mkRiddle();
    const withRev = mkRiddle({ check: { ...r.check, review: mkReview(r) } });
    expect(effectiveVerdict(withRev)).toBe('pass');
    expect(withRev.check.verdict).toBe('suspect');
    expect(hasActiveReview(withRev)).toBe(true);
  });

  it('人工改判不通过 → 覆盖自动通过', () => {
    const r = mkRiddle({ check: { verdict: 'pass', reasons: [], checkedAt: 1 } });
    const withRev = mkRiddle({ check: { ...r.check, review: mkReview(r, { verdict: 'fail' }) } });
    expect(effectiveVerdict(withRev)).toBe('fail');
  });

  it('判定后内容被改 → 判定失效，生效结论回退自动，记录仍保留', () => {
    const r = mkRiddle();
    const changed = mkRiddle({ surface: '昨日', check: { ...r.check, review: mkReview(r) } });
    expect(reviewStale(changed)).toBe(true);
    expect(hasActiveReview(changed)).toBe(false);
    expect(effectiveVerdict(changed)).toBe('suspect');
    expect(changed.check.review?.reviewer).toBe('王师傅');
  });

  it('不一致判定：人工≠自动且未失效 → true；一致或已失效 → false', () => {
    const r = mkRiddle();
    const conflicted = mkRiddle({ check: { ...r.check, review: mkReview(r) } });
    expect(reviewConflicts(conflicted)).toBe(true);
    const agreed = mkRiddle({ check: { verdict: 'pass', reasons: [], checkedAt: 1, review: mkReview(r) } });
    expect(reviewConflicts(agreed)).toBe(false);
    const stale = mkRiddle({ answer: '本日', check: { ...r.check, review: mkReview(r) } });
    expect(reviewConflicts(stale)).toBe(false);
  });
});

describe('人工复核：筛选（生效结论与人工改判）', () => {
  const auto = mkRiddle({ id: 'a', no: 1 });
  const reviewed = mkRiddle({ id: 'b', no: 2 });
  reviewed.check = { ...reviewed.check, review: mkReview(reviewed) }; // 人工 pass 覆盖自动 suspect
  const list = [auto, reviewed];

  it('校验筛选按生效结论：人工判通过的条目归入「通过」而非「存疑」', () => {
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'pass' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'suspect' }).map((r) => r.id)).toEqual(['a']);
  });

  it('「人工改判」单独列出与自动结论不一致的条目', () => {
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'conflict' }).map((r) => r.id)).toEqual(['b']);
  });
});

describe('人工复核：store 集成（保存/重算/撤销）', () => {
  beforeEach(async () => {
    await store.clearRiddles();
  });

  const seed = () => store.saveRiddle({
    surface: '今天', answer: '日本', category: 'other', format: 'qiqian', difficulty: 2, tags: [],
  });

  it('判定必须填写理由与署名', async () => {
    const r = await seed();
    await expect(store.reviewRiddle(r.id, { verdict: 'pass', reason: '  ', reviewer: '王师傅' })).rejects.toThrow('理由');
    await expect(store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: ' ' })).rejects.toThrow('署名');
    await expect(store.reviewRiddle('no-such-id', { verdict: 'pass', reason: 'x', reviewer: 'y' })).rejects.toThrow('不存在');
  });

  it('判定写入署名/理由/时间/依据，生效结论以人工为准', async () => {
    const r = await seed();
    expect(r.check.verdict).toBe('suspect'); // 自动结论：秋千格语义存疑
    const after = await store.reviewRiddle(r.id, { verdict: 'pass', reason: '老师傅确认成立', reviewer: '王师傅' });
    expect(after.check.review?.reviewer).toBe('王师傅');
    expect(after.check.review?.reason).toBe('老师傅确认成立');
    expect(after.check.review?.at).toBeGreaterThan(0);
    expect(after.check.review?.basis).toBe(reviewBasisOf(after));
    expect(after.check.verdict).toBe('suspect'); // 自动结论不被覆盖
    expect(effectiveVerdict(after)).toBe('pass');
  });

  it('再次保存与「重新校验全部」都保留人工复核，并统计不一致条数', async () => {
    const r = await seed();
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '王师傅' });
    // 再次保存（内容未变）→ 自动重算，人工保留且仍有效
    const saved = await store.saveRiddle({
      id: r.id, surface: '今天', answer: '日本', category: 'other', format: 'qiqian', difficulty: 2, tags: [],
    });
    expect(saved.check.review?.reviewer).toBe('王师傅');
    expect(effectiveVerdict(saved)).toBe('pass');
    // 重新校验全部 → 人工保留，统计 1 条保留、1 条不一致
    const stats = await store.recheckAll();
    expect(stats).toEqual({ total: 1, kept: 1, conflicts: 1 });
    const after = store.getState().riddles.find((x) => x.id === r.id)!;
    expect(after.check.review?.reviewer).toBe('王师傅');
    expect(effectiveVerdict(after)).toBe('pass');
  });

  it('判定后修改内容并保存 → 人工判定失效，回退自动结论，记录保留', async () => {
    const r = await seed();
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '王师傅' });
    const saved = await store.saveRiddle({
      id: r.id, surface: '明天', answer: '日本', category: 'other', format: 'qiqian', difficulty: 2, tags: [],
    });
    expect(saved.check.review?.reviewer).toBe('王师傅'); // 记录不丢
    expect(reviewStale(saved)).toBe(true);
    expect(effectiveVerdict(saved)).toBe('suspect'); // 回退自动
  });

  it('撤销人工判定 → 回到自动结论', async () => {
    const r = await seed();
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '王师傅' });
    await store.clearReview(r.id);
    const after = store.getState().riddles.find((x) => x.id === r.id)!;
    expect(after.check.review).toBeNull();
    expect(effectiveVerdict(after)).toBe('suspect');
  });
});
