// 谜条编辑：表单 + 实时谜格校验面板 + 人工复核 + 重复提示
import { useMemo, useState } from 'react';
import { useAppState, navigate } from '../ui/router';
import { VerdictBadge } from '../ui/bits';
import { validateRiddle, FORMAT_RULE_BRIEF, FORMAT_AUTO_CAPABILITY } from '../lib/validate';
import { reviewConflicts, reviewStale } from '../lib/review';
import { findSimilar } from '../lib/duplicates';
import { formatDateTime } from '../lib/format';
import { CATEGORY_LABEL, FORMAT_LABEL, AGE_LABEL, VERDICT_LABEL, type AgeGroup, type ReviewVerdict, type RiddleCategory, type RiddleFormat } from '../types';
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

  // 人工复核表单
  const [rvVerdict, setRvVerdict] = useState<ReviewVerdict>(() => existing?.check.review?.verdict ?? 'pass');
  const [rvReason, setRvReason] = useState(() => existing?.check.review?.reason ?? '');
  const [rvReviewer, setRvReviewer] = useState(() => existing?.check.review?.reviewer ?? '');
  const [rvMsg, setRvMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (patch: Partial<RiddleLite>) => { setDraft((d) => ({ ...d, ...patch })); setSaved(''); setRvMsg(null); };

  const check = useMemo(
    () => validateRiddle({ surface: draft.surface, answer: draft.answer, category: draft.category, format: draft.format }, state.ctx),
    [draft.surface, draft.answer, draft.category, draft.format, state.ctx],
  );

  const dups = useMemo(
    () => (draft.surface.trim() ? findSimilar(
      { id: existing?.id ?? '', surface: draft.surface, category: draft.category },
      state.riddles,
    ) : []),
    [draft.surface, draft.category, existing?.id, state.riddles],
  );

  const save = async () => {
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
    setSaved(`已保存（谜号 ${savedR.no}）`);
    if (!existing) navigate(`#/riddle/${savedR.id}`);
  };

  const del = async () => {
    if (!existing) return;
    if (!confirm(`确定删除谜号 ${existing.no}「${existing.surface}」？`)) return;
    await store.removeRiddles([existing.id]);
    navigate('#/');
  };

  // ---- 人工复核 ----
  const review = existing?.check.review ?? null;
  const stale = existing ? reviewStale(existing) : false;
  const conflict = existing ? reviewConflicts(existing) : false;
  const dirty = !!existing && (
    draft.surface.trim() !== existing.surface || draft.answer.trim() !== existing.answer ||
    draft.category !== existing.category || draft.format !== existing.format
  );

  const submitReview = async () => {
    if (!existing) return;
    try {
      const r = await store.reviewRiddle(existing.id, { verdict: rvVerdict, reason: rvReason, reviewer: rvReviewer });
      setRvMsg({ ok: true, text: `已记录人工判定「${VERDICT_LABEL[r.check.review!.verdict]}」，重新校验时保留。` });
    } catch (e) {
      setRvMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const revokeReview = async () => {
    if (!existing) return;
    await store.clearReview(existing.id);
    setRvMsg({ ok: true, text: '已撤销人工判定，结论回到自动校验结果。' });
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
          <h3>谜格校验（自动） <VerdictBadge verdict={check.verdict} size="lg" /></h3>
          <ul className={`check-list check-${check.verdict}`}>
            {check.reasons.map((r, i) => <li key={i}>{r}</li>)}
            {check.reasons.length === 0 && <li>暂无校验信息</li>}
          </ul>
          <p className="muted small">自动判定能力：{FORMAT_AUTO_CAPABILITY[draft.format]}</p>

          <h3>
            人工复核{' '}
            {review && !stale && <VerdictBadge verdict={review.verdict} size="lg" />}
            {review && stale && <span className="badge badge-warn">原判定已失效</span>}
          </h3>
          {!existing ? (
            <p className="muted small">保存后可在此对校验结论做人工复核（判为通过 / 改判不通过，需填写理由与署名）。</p>
          ) : (
            <>
              {review && (
                <div className={`review-block${stale ? ' review-stale' : ''}`}>
                  <p>
                    <VerdictBadge verdict={review.verdict} />{' '}
                    <b>{review.reviewer}</b> 判于 {formatDateTime(review.at)}
                  </p>
                  <p>理由：{review.reason}</p>
                  {conflict && (
                    <p className="warn-text small">与自动结论「{VERDICT_LABEL[existing.check.verdict]}」不一致，当前以人工判定为准。</p>
                  )}
                  {stale && (
                    <p className="muted small">判定后谜面 / 谜底 / 谜目 / 谜格已变更，人工结论已回退为自动结果；可撤销该记录或重新判定。</p>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => void revokeReview()}>
                    {stale ? '清除失效记录' : '撤销人工判定（回到自动结果）'}
                  </button>
                </div>
              )}
              {dirty && review && !stale && (
                <p className="warn-text small">有未保存的内容修改：保存后当前人工判定将失效，需要重新判定。</p>
              )}
              <div className="review-form">
                <div className="btn-row">
                  <label className="check-inline">
                    <input type="radio" checked={rvVerdict === 'pass'} onChange={() => setRvVerdict('pass')} />
                    判为通过
                  </label>
                  <label className="check-inline">
                    <input type="radio" checked={rvVerdict === 'fail'} onChange={() => setRvVerdict('fail')} />
                    改判不通过
                  </label>
                </div>
                <label className="field">
                  <span>判定理由 <b className="bad-text">*</b></span>
                  <input className="input" value={rvReason} onChange={(e) => { setRvReason(e.target.value); setRvMsg(null); }}
                    placeholder="例：「本日」倒读扣「今天」成立，经确认无问题" />
                </label>
                <label className="field">
                  <span>署名 <b className="bad-text">*</b></span>
                  <input className="input" value={rvReviewer} onChange={(e) => { setRvReviewer(e.target.value); setRvMsg(null); }}
                    placeholder="判定人姓名（老师傅）" />
                </label>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={() => void submitReview()}>
                    {review && !stale ? '重新判定（覆盖原结论）' : '提交人工判定'}
                  </button>
                  {rvMsg && <span className={rvMsg.ok ? 'ok-text small' : 'bad-text small'}>{rvMsg.text}</span>}
                </div>
                <p className="muted small">人工判定在「保存谜条 / 重新校验全部谜格」后保留；与自动结论不一致的条目可在谜库页按「人工改判」筛出。</p>
              </div>
            </>
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
