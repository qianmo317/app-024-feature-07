// 人工复核：store 复核动作 / 重算保留 / 有效结论与筛选（PRD 校验结论人工复核）
import { describe, it, expect } from 'vitest';
import { store } from '../src/lib/store';
import { effectiveVerdict, isDivergent } from '../src/lib/review';
import { filterRiddles, EMPTY_FILTERS } from '../src/lib/search';
import type { Riddle } from '../src/types';

// 无数据包（ctx.loaded=false）下：秋千格两字 → 存疑；无格一字 → 通过；猜一字两字 → 不通过
type NewRiddle = Parameters<typeof store.saveRiddle>[0];
const SUSPECT: NewRiddle = { surface: '今天', answer: '日本', category: 'object', format: 'qiqian', difficulty: 2, tags: [] };
const PASS: NewRiddle = { surface: '一口咬掉牛尾巴', answer: '告', category: 'char', format: 'none', difficulty: 1, tags: [] };
const FAIL: NewRiddle = { surface: '字数误例', answer: '告白', category: 'char', format: 'none', difficulty: 1, tags: [] };

async function addRiddle(patch: NewRiddle): Promise<Riddle> {
  return store.saveRiddle({ ...patch });
}

describe('人工复核：判定与留痕', () => {
  it('存疑条目可判为通过：记录理由、署名、时间与当时自动结论', async () => {
    const r = await addRiddle(SUSPECT);
    expect(r.check.verdict).toBe('suspect');
    const before = Date.now();
    const next = await store.reviewRiddle(r.id, { verdict: 'pass', reason: '倒读「本日」扣合今天，成立', reviewer: '张老师' });
    expect(next.review).toBeDefined();
    expect(next.review!.verdict).toBe('pass');
    expect(next.review!.reason).toContain('本日');
    expect(next.review!.reviewer).toBe('张老师');
    expect(next.review!.at).toBeGreaterThanOrEqual(before);
    expect(next.review!.autoVerdict).toBe('suspect');
    expect(effectiveVerdict(next)).toBe('pass');
    expect(isDivergent(next)).toBe(true);
  });

  it('存疑条目可改判为不通过', async () => {
    const r = await addRiddle(SUSPECT);
    const next = await store.reviewRiddle(r.id, { verdict: 'fail', reason: '倒读与谜面不扣', reviewer: '李老师' });
    expect(effectiveVerdict(next)).toBe('fail');
    expect(isDivergent(next)).toBe(true);
  });

  it('理由与署名必填', async () => {
    const r = await addRiddle(SUSPECT);
    await expect(store.reviewRiddle(r.id, { verdict: 'pass', reason: '  ', reviewer: '张老师' })).rejects.toThrow('理由');
    await expect(store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: ' ' })).rejects.toThrow('署名');
    expect(store.getState().riddles.find((x) => x.id === r.id)!.review).toBeUndefined();
  });

  it('只有存疑条目可复核：通过/不通过的自动结论不可复核', async () => {
    const p = await addRiddle(PASS);
    const f = await addRiddle(FAIL);
    await expect(store.reviewRiddle(p.id, { verdict: 'fail', reason: 'x', reviewer: '张老师' })).rejects.toThrow('存疑');
    await expect(store.reviewRiddle(f.id, { verdict: 'pass', reason: 'x', reviewer: '张老师' })).rejects.toThrow('存疑');
  });
});

describe('人工复核：重算与保存不覆盖', () => {
  it('全库重算保留人工结论，并统计不一致条数', async () => {
    const r = await addRiddle(SUSPECT);
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '张老师' });
    const res = await store.recheckAll();
    expect(res.keptReview).toBeGreaterThanOrEqual(1);
    expect(res.divergent).toBeGreaterThanOrEqual(1);
    const after = store.getState().riddles.find((x) => x.id === r.id)!;
    expect(after.review?.reviewer).toBe('张老师');
    expect(after.check.verdict).toBe('suspect'); // 自动结论仍按规则重算
    expect(effectiveVerdict(after)).toBe('pass'); // 但有效结论以人工为准
  });

  it('内容未变的保存保留人工结论', async () => {
    const r = await addRiddle(SUSPECT);
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '张老师' });
    const saved = await store.saveRiddle({ ...SUSPECT, id: r.id, note: '只改备注' });
    expect(saved.review?.reviewer).toBe('张老师');
    expect(saved.note).toBe('只改备注');
  });

  it('修改谜面/谜底/谜目/谜格后保存，人工结论失效', async () => {
    const r = await addRiddle(SUSPECT);
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '张老师' });
    const saved = await store.saveRiddle({ ...SUSPECT, id: r.id, answer: '本日' });
    expect(saved.review).toBeUndefined();
  });

  it('撤销人工结论后回到自动结果', async () => {
    const r = await addRiddle(SUSPECT);
    await store.reviewRiddle(r.id, { verdict: 'pass', reason: '成立', reviewer: '张老师' });
    await store.clearReview(r.id);
    const after = store.getState().riddles.find((x) => x.id === r.id)!;
    expect(after.review).toBeUndefined();
    expect(effectiveVerdict(after)).toBe('suspect');
  });
});

describe('人工复核：列表筛选', () => {
  function mkRiddle(patch: Partial<Riddle>): Riddle {
    return {
      id: 'x', no: 1, surface: 's', answer: 'a', category: 'other', format: 'none',
      difficulty: 2, tags: [], check: { verdict: 'suspect', reasons: [], checkedAt: 0 },
      ...patch,
    };
  }
  const reviewed = mkRiddle({
    id: 'rv',
    review: { verdict: 'pass', reason: '成立', reviewer: '张老师', at: 1, autoVerdict: 'suspect' },
  });
  const plain = mkRiddle({ id: 'pl' });
  const list = [reviewed, plain];

  it('有效结论：有人工以人工为准', () => {
    expect(effectiveVerdict(reviewed)).toBe('pass');
    expect(effectiveVerdict(plain)).toBe('suspect');
    expect(isDivergent(reviewed)).toBe(true);
    expect(isDivergent(plain)).toBe(false);
  });

  it('校验筛选按有效结论匹配', () => {
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'pass' }).map((r) => r.id)).toEqual(['rv']);
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'suspect' }).map((r) => r.id)).toEqual(['pl']);
  });

  it('「人工与自动不一致」单独筛出', () => {
    expect(filterRiddles(list, { ...EMPTY_FILTERS, verdict: 'divergent' }).map((r) => r.id)).toEqual(['rv']);
  });

  it('人工结论与自动一致时不算不一致', () => {
    const same = mkRiddle({
      id: 'same',
      check: { verdict: 'pass', reasons: [], checkedAt: 0 },
      review: { verdict: 'pass', reason: '确认', reviewer: '张老师', at: 1, autoVerdict: 'suspect' },
    });
    expect(isDivergent(same)).toBe(false);
    expect(filterRiddles([same, reviewed], { ...EMPTY_FILTERS, verdict: 'divergent' }).map((r) => r.id)).toEqual(['rv']);
  });
});
