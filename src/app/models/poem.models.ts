export type Tone = '平' | '仄' | '中' | '?';
export type MarkTone = '平' | '仄' | '中';

/** 字音判定的数据所有权：人工校勘 或 韵谱包候选（经确认后写入） */
export type MarkOwner = 'manual' | 'rhyme-pack';

export interface MarkProvenance {
  owner: MarkOwner;
  confirmedAt: string;
  /** owner === 'rhyme-pack' 时记录采纳时的韵谱依据 */
  packId?: string;
  packName?: string;
  packVersion?: string;
  /** 新韵谱包与旧依据不一致时置位，表示该判定依据已过时（判定本身保留） */
  stale?: boolean;
}

export interface CharacterMark {
  tone: MarkTone | '?';
  rhyme: string;
  pauseAfter: boolean;
  basis: string;
  note: string;
  provenance?: MarkProvenance;
}

export interface PoemVersion {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  text: string;
  marks: Record<string, CharacterMark>;
  antithesisPairs: AntithesisPair[];
}

export interface AntithesisPair {
  id: string;
  leftLine: number;
  rightLine: number;
  note: string;
}

export interface PoemWorkspace {
  title: string;
  author: string;
  templateId: string;
  versions: PoemVersion[];
  activeVersionId: string;
  updatedAt: string;
  /** 2：引入数据所有权；旧版本数据在加载时迁移为人工确认 */
  schemaVersion?: number;
}

export interface MeterTemplate {
  id: string;
  name: string;
  summary: string;
  lineCount: number;
  lineLength: number;
  pattern: Tone[];
  rhymeLines: number[];
}

/** 韵谱包中的单字候选，只作为建议，不直接覆盖校勘稿 */
export interface RhymePackEntry {
  char: string;
  tone: MarkTone;
  rhyme: string;
  basis: string;
}

export interface RhymePack {
  id: string;
  name: string;
  version: string;
  importedAt: string;
  entries: Record<string, RhymePackEntry>;
}

/** 校勘员对某个位置候选的裁决结果，按位置持久化，与包版本绑定 */
export interface AdjudicationDecision {
  status: 'accepted' | 'kept-manual';
  packId: string;
  packVersion: string;
  /** 裁决时候选内容的指纹，用于判断包更新后依据是否仍然成立 */
  fingerprint: string;
  resolvedAt: string;
}

/** 韵谱包独立存储：当前包、历史包（导入失败/重试时保留）、逐位置裁决进度 */
export interface RhymePackState {
  current: RhymePack | null;
  history: RhymePack[];
  decisions: Record<string, AdjudicationDecision>;
}

/**
 * 某个位置相对于韵谱包的裁决状态：
 * - none：无候选
 * - candidate：包提供候选、该位置尚无判定（待确认）
 * - conflict：候选与人工判定冲突（未决）
 * - aligned：人工判定与候选一致（候选无需采纳）
 * - accepted：已确认采纳韵谱候选
 * - kept-manual：已确认保留人工判定
 * - stale：依据旧包确认，新包候选已变化（判定保留，标旧依据）
 */
export type AdjudicationState =
  | 'none'
  | 'candidate'
  | 'conflict'
  | 'aligned'
  | 'accepted'
  | 'kept-manual'
  | 'stale';

export interface AnalysisCell {
  char: string;
  position: number;
  expected: Tone;
  actual: Tone;
  status: 'correct' | 'variant' | 'error' | 'unknown' | 'neutral';
  message: string;
  mark: CharacterMark;
  candidate?: RhymePackEntry;
  adjudication: AdjudicationState;
  /** stale 状态下，当初采纳所依据的旧包候选 */
  priorCandidate?: RhymePackEntry;
}

export interface AnalysisLine {
  index: number;
  cells: AnalysisCell[];
  rhymeChars: string[];
  errors: number;
  variants: number;
}

export interface PoemIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  line?: number;
  position?: number;
}

export interface CharDiff {
  index: number;
  left: string;
  right: string;
  changed: boolean;
}

/** 裁决队列中的一条记录（未决或旧依据待核） */
export interface AdjudicationItem {
  key: string;
  line: number;
  position: number;
  char: string;
  state: AdjudicationState;
  mark: CharacterMark;
  entry: RhymePackEntry;
  priorEntry?: RhymePackEntry;
}
