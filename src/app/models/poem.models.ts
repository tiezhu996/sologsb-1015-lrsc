export type Tone = '平' | '仄' | '中' | '?';
export type MarkTone = '平' | '仄' | '中';

/**
 * 判定来源（数据所有权标记）。
 * manual  —— 校勘员人工确认（含旧数据迁移而来的既有判定）；
 * package —— 经校勘员确认后、依据某版韵谱包写入。
 */
export type JudgmentSource = 'manual' | 'package';

export interface MarkJudgment {
  source: JudgmentSource;
  confirmedAt: string;
  packageId?: string;
  packageName?: string;
  packageVersion?: string;
  /** 依据来自旧版韵谱包：包更新后已确认内容保留，但标出旧依据 */
  staleBasis?: boolean;
  /** 旧数据升级时迁入的既有判定，视同人工确认 */
  migrated?: boolean;
}

export interface CharacterMark {
  tone: MarkTone | '?';
  rhyme: string;
  pauseAfter: boolean;
  basis: string;
  note: string;
  judgment?: MarkJudgment;
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
  schemaVersion: number;
  /** 韵谱包数据：与校勘稿分属两套所有权，包只提供候选 */
  rhyme: RhymePackageState;
}

/** 韵谱包字音条目（外部数据，导入后只读） */
export interface RhymePackageEntry {
  tone: MarkTone;
  rhyme: string;
  basis: string;
}

export interface RhymePackage {
  id: string;
  name: string;
  version: string;
  importedAt: string;
  entries: Record<string, RhymePackageEntry>;
}

/** 裁决记录：校勘员对某版韵谱包候选的处理进度 */
export interface PackageResolution {
  packageId: string;
  packageVersion: string;
  versionId: string;
  line: number;
  position: number;
  decision: 'accepted' | 'rejected';
  resolvedAt: string;
}

export interface RhymeImportReport {
  status: 'ok' | 'error' | 'duplicate';
  message: string;
  at: string;
}

export interface RhymePackageState {
  active: RhymePackage | null;
  resolutions: PackageResolution[];
  lastImport: RhymeImportReport | null;
}

/** 裁决队列项（由韵谱包 + 校勘稿 + 裁决记录计算得出，不持久化） */
export interface AdjudicationItem {
  id: string;
  versionId: string;
  line: number;
  position: number;
  char: string;
  candidate: RhymePackageEntry;
  current: CharacterMark;
  conflict: boolean;
  conflictFields: string[];
  status: 'pending' | 'accepted' | 'rejected';
  resolvedAt?: string;
}

/** 已确认但依据来自旧版韵谱包的判定 */
export interface StaleConfirmation {
  id: string;
  versionId: string;
  line: number;
  position: number;
  char: string;
  mark: CharacterMark;
  judgment: MarkJudgment;
  candidate: RhymePackageEntry | null;
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

export interface AnalysisCell {
  char: string;
  position: number;
  expected: Tone;
  actual: Tone;
  status: 'correct' | 'variant' | 'error' | 'unknown' | 'neutral';
  message: string;
  mark: CharacterMark;
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
