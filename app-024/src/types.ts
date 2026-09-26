// 数据模型（对应 PRD §7）
export type RiddleFormat =
  | 'none' | 'qiqian' | 'juanlian' | 'xufei' | 'lihua'
  | 'baitou' | 'fendi' | 'shanglou' | 'xialou';

export type RiddleCategory = 'char' | 'object' | 'idiom' | 'place' | 'person' | 'other';
export type AgeGroup = 'child' | 'teen' | 'adult' | 'all';
export type Verdict = 'pass' | 'suspect' | 'fail';

/** 人工复核结论：对自动校验「存疑」的条目，由懂谜的人判为通过或不通过 */
export type Review = {
  verdict: 'pass' | 'fail'; // 人工只能放行（通过）或改判不通过
  reason: string;           // 复核理由（必填）
  reviewer: string;         // 署名（必填）
  at: number;               // 判定时间
  autoVerdict: Verdict;     // 判定当时的自动结论（审计留痕）
};

export type Riddle = {
  id: string;
  no: number;            // 谜号（现场对号、谜条大字）
  surface: string;       // 谜面
  answer: string;        // 谜底
  category: RiddleCategory;
  format: RiddleFormat;
  formatNote?: string;   // 谜格说明（谜条上展示）
  author?: string;
  source?: string;
  difficulty: 1 | 2 | 3;
  ageGroup?: AgeGroup;
  tags: string[];
  note?: string;
  check: { verdict: Verdict; reasons: string[]; checkedAt: number };
  review?: Review;       // 人工复核结论；存在时优先于自动结论，重算不覆盖
};

export type OnsiteRecord = {
  id: string;
  riddleId: string;
  winnerName?: string;
  winnerRef?: string;
  prize: string;
  at: number;
  note?: string;
  code?: string;         // 兑奖号码
};

export type EventInfo = {
  id: string;
  title: string;
  host: string;
  date: string;
  riddleIds: string[];
};

export type PrintSetup = {
  cardWmm: number;
  cardHmm: number;
  perPage: number;
  showAnswerSlip: boolean;  // 同页双联：下联回收联（含谜底）
  showCutLine: boolean;
  hostLine: string;
};

export type AppSettings = {
  event: EventInfo;
  print: PrintSetup;
  prizes: string[];
};

export const CATEGORY_LABEL: Record<RiddleCategory, string> = {
  char: '猜一字', object: '猜一物', idiom: '猜成语', place: '猜地名', person: '猜人名', other: '其他',
};

export const FORMAT_LABEL: Record<RiddleFormat, string> = {
  none: '无格', qiqian: '秋千格', juanlian: '卷帘格', xufei: '徐妃格', lihua: '梨花格',
  baitou: '白头格', fendi: '粉底格', shanglou: '上楼格', xialou: '下楼格',
};

export const AGE_LABEL: Record<AgeGroup, string> = {
  child: '儿童', teen: '少年', adult: '成人', all: '通用',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '通过', suspect: '存疑', fail: '不通过',
};

export const VERDICT_ICON: Record<Verdict, string> = {
  pass: '✓', suspect: '？', fail: '✕',
};

export const CATEGORY_FROM_LABEL: Record<string, RiddleCategory> = {};
for (const [k, v] of Object.entries(CATEGORY_LABEL)) CATEGORY_FROM_LABEL[v] = k as RiddleCategory;
CATEGORY_FROM_LABEL['字'] = 'char'; CATEGORY_FROM_LABEL['一物'] = 'object';
CATEGORY_FROM_LABEL['成语'] = 'idiom'; CATEGORY_FROM_LABEL['地名'] = 'place';
CATEGORY_FROM_LABEL['人名'] = 'person';

export const FORMAT_FROM_LABEL: Record<string, RiddleFormat> = {};
for (const [k, v] of Object.entries(FORMAT_LABEL)) FORMAT_FROM_LABEL[v] = k as RiddleFormat;

export const AGE_FROM_LABEL: Record<string, AgeGroup> = {};
for (const [k, v] of Object.entries(AGE_LABEL)) AGE_FROM_LABEL[v] = k as AgeGroup;
