// 谜条编辑：表单 + 实时谜格校验面板 + 人工复核 + 重复提示
import { useMemo, useState } from 'react';
import { useAppState, navigate } from '../ui/router';
import { VerdictBadge } from '../ui/bits';
import { validateRiddle, FORMAT_RULE_BRIEF, FORMAT_AUTO_CAPABILITY } from '../lib/validate';
import { findSimilar } from '../lib/duplicates';
import { formatDateTime } from '../lib/format';
import { CATEGORY_LABEL, FORMAT_LABEL, AGE_LABEL, VERDICT_LABEL, type AgeGroup, type RiddleCategory, type RiddleFormat } from '../types';
import { store } from '../lib/store';

interface RiddleLite {
  surface: string; answer: string;
  category: RiddleCategory; format: RiddleFormat; formatNote: string;
  author: string; source: string;
  difficulty: 1 | 2 | 3; ageGroup: AgeGroup | '';
  tags: string; note: string;
}

const BLANK: RiddleLite = {
  surface: '', answer: '', category: 'char', format: 'none', formatNote: '',
  author: '', source: '', difficulty: 2, ageGroup: 'all', tags: '', note: '',
};

export function RiddleEdit({ id }: { id: string }) {
  const state = useAppState();
  const existing = id === 'new' ? undefined : state.riddles.find((r) => r.id === id);
  const [draft, setDraft] = useState<RiddleLite>(() => {
    if (!existing) return BLANK;
    return {
      surface: existing.surface, answer: existing.answer,
      category: existing.category, format: existing.format, formatNote: existing.formatNote ?? '',
      author: existing.author ?? '', source: existing.source ?? '',
      difficulty: existing.difficulty, ageGroup: existing.ageGroup ?? 'all',
      tags: existing.tags.join('、'), note: existing.note ?? '',
    };
  });
  const [saved, setSaved] = useState('');
  const [rv, setRv] = useState<{ verdict: 'pass' | 'fail'; reason: string; reviewer: string }>({ verdict: 'pass', reason: '', reviewer: '' });
  const [rvErr, setRvErr] = useState('');

  const set = (patch: Partial<RiddleLite>) => { setDraft((d) => ({ ...d, ...patch })); setSaved(''); };

  const check = useMemo(
    () => validateRiddle({ surface: draft.surface, answer: draft.answer, category: draft.category, format: draft.format }, state.ctx),
    [draft.surface, draft.answer, draft.category, draft.format, state.ctx],
  );

  // 草稿与已存内容在「影响校验的字段」上是否有出入：有则保存后人工结论会失效
  const contentDirty = !!existing && (
    draft.surface.trim() !== existing.surface || draft.answer.trim() !== existing.answer
    || draft.category !== existing.category || draft.format !== existing.format
  );

  const dups = useMemo(
    () => (draft.surface.trim() ? findSimilar(
      { id: existing?.id ?? '', surface: draft.surface, category: draft.category },
      state.riddles,
    ) : []),
    [draft.surface, draft.category, existing?.id, state.riddles],
  );

  const save = async () => {
    const reviewDropped = !!existing?.review && contentDirty;
    const savedR = await store.saveRiddle({
      ...(existing ? { id: existing.id } : {}),
      surface: draft.surface.trim(), answer: draft.answer.trim(),
      category: draft.category, format: draft.format,
      formatNote: draft.formatNote.trim() || undefined,
      author: draft.author.trim() || undefined,
      source: draft.source.trim() || undefined,
      difficulty: draft.difficulty,
      ageGroup: draft.ageGroup || undefined,
      tags: draft.tags.split(/[、,，/|]+/).map((s) => s.trim()).filter(Boolean),
      note: draft.note.trim() || undefined,
    });
    setSaved(`已保存（谜号 ${savedR.no}）${reviewDropped ? '；内容已修改，原人工结论失效，需重新复核' : ''}`);
    if (!existing) navigate(`#/riddle/${savedR.id}`);
  };

  const submitReview = async () => {
    if (!existing) return;
    try {
      await store.reviewRiddle(existing.id, rv);
      setRv((v) => ({ verdict: 'pass', reason: '', reviewer: v.reviewer })); // 署名保留，方便连续复核
      setRvErr('');
    } catch (e) {
      setRvErr(e instanceof Error ? e.message : String(e));
    }
  };

  const revokeReview = async () => {
    if (!existing?.review) return;
    if (!confirm(`确定撤销 ${existing.review.reviewer} 的人工结论，回到自动校验结果？`)) return;
    await store.clearReview(existing.id);
  };

  const del = async () => {
    if (!existing) return;
    if (!confirm(`确定删除谜号 ${existing.no}「${existing.surface}」？`)) return;
    await store.removeRiddles([existing.id]);
    navigate('#/');
  };

  if (id !== 'new' && !existing) {
    return (
      <div className="panel empty">
        <p>找不到该谜条（可能已删除）。</p>
        <a className="btn btn-primary" href="#/">返回谜库</a>
      </div>
    );
  }

  const no = existing?.no ?? store.nextNo();

  return (
    <div className="edit-page">
      <div className="page-head">
        <h1>{existing ? `编辑谜条 · 谜号 ${existing.no}` : `新建谜条 · 谜号 ${no}`}</h1>
        <a className="btn btn-ghost" href="#/">← 返回谜库</a>
      </div>

      <div className="edit-grid">
        <div className="panel">
          <label className="field">
            <span>谜面 <b className="bad-text">*</b></span>
            <textarea className="input" rows={3} value={draft.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="例：一口咬掉牛尾巴" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>谜底 <b className="bad-text">*</b></span>
              <input className="input" value={draft.answer} onChange={(e) => set({ answer: e.target.value })} placeholder="例：告" />
            </label>
            <label className="field">
              <span>谜目</span>
              <select className="input" value={draft.category} onChange={(e) => set({ category: e.target.value as RiddleCategory })}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>谜格</span>
              <select className="input" value={draft.format} onChange={(e) => set({ format: e.target.value as RiddleFormat })}>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small">当前谜格：{FORMAT_RULE_BRIEF[draft.format]}</p>
          <label className="field">
            <span>谜格补充说明（印在谜条上）</span>
            <input className="input" value={draft.formatNote} onChange={(e) => set({ formatNote: e.target.value })} placeholder="留空则自动印谜格名" />
          </label>
          <div className="field-row">
            <label className="field"><span>作者</span><input className="input" value={draft.author} onChange={(e) => set({ author: e.target.value })} /></label>
            <label className="field"><span>出处</span><input className="input" value={draft.source} onChange={(e) => set({ source: e.target.value })} /></label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>难度</span>
              <select className="input" value={draft.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>★ 易</option><option value={2}>★★ 中</option><option value={3}>★★★ 难</option>
              </select>
            </label>
            <label className="field">
              <span>适用年龄</span>
              <select className="input" value={draft.ageGroup} onChange={(e) => set({ ageGroup: e.target.value as AgeGroup | '' })}>
                <option value="">未设置</option>
                {Object.entries(AGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span>标签（、分隔）</span><input className="input" value={draft.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="儿童专区、党史主题" /></label>
          </div>
          <label className="field"><span>备注（不打印）</span><textarea className="input" rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} /></label>

          <div className="btn-row">
            <button className="btn btn-primary" disabled={!draft.surface.trim() || !draft.answer.trim()} onClick={save}>
              {existing ? '保存' : '添加到谜库'}
            </button>
            {existing && <button className="btn btn-danger" onClick={del}>删除</button>}
            {saved && <span className="ok-text">{saved}</span>}
          </div>
        </div>

        <div className="panel">
          <h3>
            谜格校验 <VerdictBadge verdict={check.verdict} size="lg" />
            {existing?.review && (
              <span className="review-head">
                人工结论 <VerdictBadge verdict={existing.review.verdict} size="lg" />
              </span>
            )}
          </h3>
          <ul className={`check-list check-${check.verdict}`}>
            {check.reasons.map((r, i) => <li key={i}>{r}</li>)}
            {check.reasons.length === 0 && <li>暂无校验信息</li>}
          </ul>
          <p className="muted small">自动判定能力：{FORMAT_AUTO_CAPABILITY[draft.format]}</p>

          <h3>人工复核</h3>
          {!existing && <p className="muted small">保存后，若自动结论为「存疑」，可在此判为通过或不通过。</p>}
          {existing?.review && (
            <div className="review-box">
              <p className="review-line">
                人工判为 <VerdictBadge verdict={existing.review.verdict} />
                <span className="review-meta">{existing.review.reviewer} · {formatDateTime(existing.review.at)}</span>
              </p>
              <p className="review-reason">理由：{existing.review.reason}</p>
              <p className="muted small">
                复核时自动结论「{VERDICT_LABEL[existing.review.autoVerdict]}」；当前自动结论「{VERDICT_LABEL[existing.check.verdict]}」
                {existing.review.verdict !== existing.check.verdict
                  ? '，与人工结论不一致（已在谜库列表单独标出）'
                  : '，与人工结论一致'}
                。重算与保存不会覆盖人工结论。
              </p>
              {contentDirty && <p className="warn-text small">谜面/谜底/谜目/谜格已修改，保存后该人工结论将失效，需重新复核。</p>}
              <button className="btn btn-danger btn-sm" onClick={revokeReview}>撤销人工结论，回到自动结果</button>
            </div>
          )}
          {existing && !existing.review && (
            contentDirty ? (
              <p className="muted small">有未保存的修改，请先保存；保存后若自动结论为「存疑」即可人工复核。</p>
            ) : check.verdict !== 'suspect' ? (
              <p className="muted small">当前自动结论为「{VERDICT_LABEL[check.verdict]}」，只有「存疑」条目需要人工复核。</p>
            ) : (
              <div className="review-form">
                <div className="btn-row" role="radiogroup" aria-label="人工结论">
                  <label className="check-inline">
                    <input type="radio" name="review-verdict" checked={rv.verdict === 'pass'} onChange={() => setRv({ ...rv, verdict: 'pass' })} />
                    判为通过（放行）
                  </label>
                  <label className="check-inline">
                    <input type="radio" name="review-verdict" checked={rv.verdict === 'fail'} onChange={() => setRv({ ...rv, verdict: 'fail' })} />
                    改判不通过
                  </label>
                </div>
                <label className="field">
                  <span>复核理由 <b className="bad-text">*</b></span>
                  <textarea className="input" rows={2} value={rv.reason} onChange={(e) => setRv({ ...rv, reason: e.target.value })} placeholder="例：倒读「本日」与谜面「今天」扣合成立" />
                </label>
                <label className="field">
                  <span>署名 <b className="bad-text">*</b></span>
                  <input className="input" value={rv.reviewer} onChange={(e) => setRv({ ...rv, reviewer: e.target.value })} placeholder="复核人姓名" />
                </label>
                {rvErr && <p className="bad-text small">{rvErr}</p>}
                <button className="btn btn-primary" disabled={!rv.reason.trim() || !rv.reviewer.trim()} onClick={submitReview}>提交人工复核</button>
                <p className="muted small">人工结论优先于自动结论展示；重新校验全部谜格时保留，并记录判定人与时间。</p>
              </div>
            )
          )}

          <h3>重复检测</h3>
          {dups.length === 0 ? (
            <p className="ok-text">未发现相同或高度相似的谜面。</p>
          ) : (
            <ul className="dup-list">
              {dups.map((d) => {
                const other = state.riddles.find((r) => r.id === d.id);
                return (
                  <li key={d.id}>
                    <a href={`#/riddle/${d.id}`}>#{d.no} {other?.surface}</a>
                    <span className="badge">相似 {Math.round(d.similarity * 100)}%</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted small">相似度阈值 85%（同谜目才比对；归一化去标点繁简后计算）。</p>
        </div>
      </div>
    </div>
  );
}
