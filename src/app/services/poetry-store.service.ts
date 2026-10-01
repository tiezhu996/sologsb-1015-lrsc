import { computed, Injectable, signal } from '@angular/core';
import type {
  AdjudicationItem,
  AntithesisPair,
  AnalysisCell,
  AnalysisLine,
  CharacterMark,
  CharDiff,
  MarkTone,
  MeterTemplate,
  PackageResolution,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  RhymeImportReport,
  RhymePackage,
  RhymePackageState,
  StaleConfirmation,
  Tone,
} from '../models/poem.models';
import { parseRhymePackage } from './rhyme-package';

export const METER_TEMPLATES: MeterTemplate[] = [
  {
    id: 'wuyan-zeqi',
    name: '五言绝句 · 仄起首句不入韵',
    summary: '四句，每句五字；二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
  {
    id: 'wuyan-pingqi',
    name: '五言绝句 · 平起首句入韵',
    summary: '四句，每句五字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['中', '平', '中', '仄', '平', '仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '仄', '中', '平'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-zeqi',
    name: '七言绝句 · 仄起首句入韵',
    summary: '四句，每句七字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['仄', '仄', '中', '平', '中', '仄', '平', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-pingqi',
    name: '七言绝句 · 平起首句不入韵',
    summary: '四句，每句七字；二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['中', '平', '中', '仄', '仄', '中', '平', '仄', '仄', '中', '平', '平', '仄', '仄', '中', '平', '中', '仄', '中', '平', '仄', '仄', '中', '平', '中', '仄', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
];

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';
const SCHEMA_VERSION = 2;
const PUNCTUATION = new Set(['，', '。', '！', '？', '；', '：', '、', ' ', '\t']);
const TONE_DICTIONARY: Record<string, Tone> = {
  春: '平', 眠: '平', 不: '仄', 觉: '仄', 晓: '仄', 处: '仄', 闻: '平', 啼: '平', 鸟: '仄',
  夜: '仄', 来: '平', 风: '平', 雨: '仄', 声: '平', 花: '平', 落: '仄', 知: '平', 多: '平', 少: '仄',
  国: '仄', 破: '仄', 山: '平', 河: '平', 在: '仄', 城: '平', 深: '平', 木: '仄', 草: '仄', 独: '仄',
  明: '平', 月: '仄', 高: '平', 天: '平', 故: '仄', 乡: '平', 万: '仄', 里: '仄', 江: '平', 船: '平',
};

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function key(line: number, position: number): string {
  return `${line}:${position}`;
}

function defaultMark(): CharacterMark {
  return { tone: '?', rhyme: '', pauseAfter: false, basis: '', note: '' };
}

function emptyRhymeState(): RhymePackageState {
  return { active: null, resolutions: [], lastImport: null };
}

/** 人工确认戳：人工编辑或旧数据迁移而来的判定都归人工所有 */
function manualJudgment(confirmedAt: string, migrated = false): CharacterMark['judgment'] {
  return { source: 'manual', confirmedAt, staleBasis: false, migrated };
}

function upsertResolution(workspace: PoemWorkspace, resolution: PackageResolution): void {
  const list = workspace.rhyme.resolutions;
  const index = list.findIndex(
    (item) =>
      item.packageId === resolution.packageId &&
      item.packageVersion === resolution.packageVersion &&
      item.versionId === resolution.versionId &&
      item.line === resolution.line &&
      item.position === resolution.position,
  );
  if (index >= 0) list[index] = resolution;
  else list.push(resolution);
}

function initialWorkspace(): PoemWorkspace {
  const now = new Date().toISOString();
  const spring = '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
  const marks: Record<string, CharacterMark> = {};
  const cells = [
    ['晓', 0, '平', false], ['鸟', 1, '平', false], ['声', 2, '平', false], ['少', 3, '平', false],
  ] as const;
  cells.forEach(([char, line, tone, pause]) => {
    marks[key(line, 4)] = { tone, rhyme: 'A', pauseAfter: pause, basis: '《平水韵》上声十七筱', note: `${char} 为韵脚`, judgment: manualJudgment(now) };
  });
  marks[key(0, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '句中平声', judgment: manualJudgment(now) };
  marks[key(1, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '', judgment: manualJudgment(now) };
  marks[key(2, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '', judgment: manualJudgment(now) };

  const variants = spring.replace('处处闻啼鸟', '处处闻啼鸟');
  const topVersion: PoemVersion = {
    id: 'version-main',
    name: '通行本 · 孟浩然集',
    source: '《孟浩然诗集笺注》',
    createdAt: now,
    text: variants,
    marks,
    antithesisPairs: [],
  };
  const variant: PoemVersion = {
    id: 'version-song',
    name: '宋刻本异文',
    source: '宋蜀刻本',
    createdAt: now,
    text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
    marks: clone(marks),
    antithesisPairs: [],
  };
  return {
    title: '春晓',
    author: '孟浩然',
    templateId: 'wuyan-zeqi',
    versions: [topVersion, variant],
    activeVersionId: topVersion.id,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    rhyme: emptyRhymeState(),
  };
}

/**
 * 旧数据升级：v1 数据没有判定来源信息，
 * 其中所有既有判定一律视为人工确认（migrated），韵谱包状态置空。
 */
function migrateWorkspace(data: PoemWorkspace): PoemWorkspace {
  const now = new Date().toISOString();
  if (!data.schemaVersion) {
    data.versions.forEach((version) => {
      Object.values(version.marks ?? {}).forEach((mark) => {
        if (!mark.judgment) {
          mark.judgment = manualJudgment(version.createdAt ?? now, true);
        }
      });
    });
  }
  data.schemaVersion = SCHEMA_VERSION;
  data.rhyme = data.rhyme ?? emptyRhymeState();
  return data;
}

function loadWorkspace(): PoemWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const parsed = JSON.parse(raw) as PoemWorkspace;
    if (!parsed.versions?.length) return initialWorkspace();
    return migrateWorkspace(parsed);
  } catch {
    return initialWorkspace();
  }
}

@Injectable({ providedIn: 'root' })
export class PoetryStoreService {
  readonly workspace = signal<PoemWorkspace>(loadWorkspace());
  readonly selectedLine = signal(0);
  readonly selectedPosition = signal(4);
  readonly baselineVersionId = signal<string>('');
  readonly currentDiffIndex = signal(0);
  readonly toast = signal('');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);

  private undoStack: PoemWorkspace[] = [];
  private redoStack: PoemWorkspace[] = [];

  readonly activeVersion = computed(() => {
    const state = this.workspace();
    return state.versions.find((version) => version.id === state.activeVersionId) ?? state.versions[0];
  });

  readonly template = computed(() => {
    return METER_TEMPLATES.find((item) => item.id === this.workspace().templateId) ?? METER_TEMPLATES[0];
  });

  readonly lines = computed(() => this.activeVersion().text.split('\n'));

  readonly analysis = computed<AnalysisLine[]>(() => {
    const version = this.activeVersion();
    const template = this.template();
    return this.lines().map((line, lineIndex) => {
      const chars = Array.from(line).filter((char) => !PUNCTUATION.has(char));
      const cells: AnalysisCell[] = chars.map((char, position) => {
        const mark = version.marks[key(lineIndex, position)] ?? defaultMark();
        const expected = template.pattern[lineIndex * template.lineLength + position] ?? '中';
        const actual = mark.tone === '?' ? (TONE_DICTIONARY[char] ?? '?') : mark.tone;
        let status: AnalysisCell['status'] = 'neutral';
        let message = '标点或不计律位置';
        if (PUNCTUATION.has(char)) {
          status = 'neutral';
        } else if (actual === '?') {
          status = 'unknown';
          message = '尚未标注平仄';
        } else if (expected === '中') {
          status = 'correct';
          message = '可平可仄';
        } else if (actual === expected) {
          status = 'correct';
          message = '合律';
        } else if (this.isAcceptableVariant(template, lineIndex, position)) {
          status = 'variant';
          message = '一三五位置的可接受变体';
        } else {
          status = 'error';
          message = `此处应为${expected}声`;
        }
        return { char, position, expected, actual, status, message, mark };
      });
      const rhymeChars = template.rhymeLines.includes(lineIndex) ? cells.slice(-1).map((cell) => cell.char) : [];
      return {
        index: lineIndex,
        cells,
        rhymeChars,
        errors: cells.filter((cell) => cell.status === 'error').length,
        variants: cells.filter((cell) => cell.status === 'variant').length,
      };
    });
  });

  readonly issues = computed<PoemIssue[]>(() => {
    const analysis = this.analysis();
    const version = this.activeVersion();
    const template = this.template();
    const issues: PoemIssue[] = [];
    analysis.forEach((line) => {
      line.cells.filter((cell) => cell.status === 'error').forEach((cell) => {
        issues.push({
          id: uid('issue'),
          level: 'error',
          title: '出律位置',
          detail: `第 ${line.index + 1} 句“${cell.char}”：${cell.message}`,
          line: line.index,
          position: cell.position,
        });
      });
      if (line.cells.some((cell) => cell.status === 'unknown')) {
        issues.push({ id: uid('issue'), level: 'warning', title: '存在未标注字', detail: `第 ${line.index + 1} 句仍有平仄未确认。`, line: line.index });
      }
    });
    const rhymeCells = template.rhymeLines.map((line) => analysis[line]?.cells.at(-1)).filter(Boolean);
    const rhymeGroups = new Map<string, string[]>();
    rhymeCells.forEach((cell) => {
      if (!cell?.mark.rhyme) {
        issues.push({ id: uid('issue'), level: 'warning', title: '韵脚缺少韵部', detail: `第 ${(cell?.position ?? 0) + 1} 句末字尚未指定韵部。` });
        return;
      }
      rhymeGroups.set(cell.mark.rhyme, [...(rhymeGroups.get(cell.mark.rhyme) ?? []), cell.char]);
    });
    rhymeGroups.forEach((chars, rhyme) => {
      const duplicate = chars.find((char, index) => chars.indexOf(char) !== index);
      if (duplicate) issues.push({ id: uid('issue'), level: 'warning', title: '重复用韵', detail: `韵部 ${rhyme} 重复使用末字“${duplicate}”。` });
    });
    const pending = this.pendingAdjudications();
    if (pending.length) {
      issues.push({
        id: 'adjudication-pending',
        level: 'warning',
        title: '韵谱候选待裁决',
        detail: `韵谱包有 ${pending.length} 项候选待确认（冲突 ${pending.filter((item) => item.conflict).length} 项），确认前不会写入校勘稿。`,
      });
    }
    const stale = this.staleConfirmations();
    if (stale.length) {
      issues.push({
        id: 'stale-basis',
        level: 'warning',
        title: '存在旧依据判定',
        detail: `${stale.length} 处已确认判定依据的是旧版韵谱包，内容已保留，请在「韵谱裁决」中复核。`,
      });
    }
    if (version.antithesisPairs.length === 0) {
      issues.push({ id: 'antithesis-empty', level: 'info', title: '尚未标记对仗', detail: '可在检视器中把两句建立对仗关系。' });
    }
    if (!issues.some((issue) => issue.level === 'error')) {
      issues.unshift({ id: 'meter-ok', level: 'info', title: '格律检查通过', detail: '当前未发现硬性出律，请继续核对可接受变体。' });
    }
    return issues;
  });

  readonly diff = computed<CharDiff[]>(() => {
    const left = this.workspace().versions.find((version) => version.id === this.baselineVersionId());
    const right = this.activeVersion();
    if (!left || left.id === right.id) return [];
    const leftChars = Array.from(left.text.replace(/\n/g, ''));
    const rightChars = Array.from(right.text.replace(/\n/g, ''));
    const size = Math.max(leftChars.length, rightChars.length);
    return Array.from({ length: size }, (_, index) => ({
      index,
      left: leftChars[index] ?? '',
      right: rightChars[index] ?? '',
      changed: leftChars[index] !== rightChars[index],
    }));
  });

  readonly differences = computed(() => this.diff().filter((item) => item.changed).map((item) => item.index));
  readonly baselineVersion = computed(() => this.workspace().versions.find((version) => version.id === this.baselineVersionId()));

  readonly rhymePackage = computed(() => this.workspace().rhyme.active);
  readonly rhymePackageSize = computed(() => Object.keys(this.workspace().rhyme.active?.entries ?? {}).length);
  readonly lastImport = computed(() => this.workspace().rhyme.lastImport);

  /**
   * 裁决队列：韵谱包候选 × 当前校勘稿 × 裁决记录的交汇。
   * 包只提供候选——确认前绝不写入 marks；已依据包确认过的位置不进队列。
   */
  readonly adjudicationQueue = computed<AdjudicationItem[]>(() => {
    const pack = this.workspace().rhyme.active;
    if (!pack) return [];
    const version = this.activeVersion();
    const decided = new Map<string, PackageResolution>();
    this.workspace().rhyme.resolutions
      .filter((item) => item.packageId === pack.id && item.packageVersion === pack.version && item.versionId === version.id)
      .forEach((item) => decided.set(key(item.line, item.position), item));
    const items: AdjudicationItem[] = [];
    this.analysis().forEach((line) => {
      line.cells.forEach((cell) => {
        const candidate = pack.entries[cell.char];
        if (!candidate) return;
        if (cell.mark.judgment?.source === 'package') return;
        const resolution = decided.get(key(line.index, cell.position));
        const conflictFields: string[] = [];
        if (cell.mark.tone !== '?' && cell.mark.tone !== candidate.tone) conflictFields.push('tone');
        if (cell.mark.rhyme && candidate.rhyme && cell.mark.rhyme !== candidate.rhyme) conflictFields.push('rhyme');
        items.push({
          id: `${version.id}:${line.index}:${cell.position}`,
          versionId: version.id,
          line: line.index,
          position: cell.position,
          char: cell.char,
          candidate,
          current: cell.mark,
          conflict: conflictFields.length > 0,
          conflictFields,
          status: resolution?.decision ?? 'pending',
          resolvedAt: resolution?.resolvedAt,
        });
      });
    });
    return items;
  });

  readonly pendingAdjudications = computed(() =>
    this.adjudicationQueue()
      .filter((item) => item.status === 'pending')
      .sort((a, b) => Number(b.conflict) - Number(a.conflict) || a.line - b.line || a.position - b.position),
  );

  readonly decidedAdjudications = computed(() => this.adjudicationQueue().filter((item) => item.status !== 'pending'));

  /** 已确认但依据来自旧版（或已被替换的）韵谱包的判定：内容保留，标出旧依据 */
  readonly staleConfirmations = computed<StaleConfirmation[]>(() => {
    const pack = this.workspace().rhyme.active;
    if (!pack) return [];
    const version = this.activeVersion();
    const items: StaleConfirmation[] = [];
    this.analysis().forEach((line) => {
      line.cells.forEach((cell) => {
        const judgment = cell.mark.judgment;
        if (judgment?.source !== 'package') return;
        if (judgment.packageId === pack.id && judgment.packageVersion === pack.version) return;
        items.push({
          id: `${version.id}:${line.index}:${cell.position}`,
          versionId: version.id,
          line: line.index,
          position: cell.position,
          char: cell.char,
          mark: cell.mark,
          judgment,
          candidate: pack.entries[cell.char] ?? null,
        });
      });
    });
    return items;
  });

  readonly proposalKeys = computed(() => new Set(this.pendingAdjudications().map((item) => key(item.line, item.position))));
  readonly staleKeys = computed(() => new Set(this.staleConfirmations().map((item) => key(item.line, item.position))));

  selectVersion(id: string): void {
    this.workspace.update((workspace) => ({ ...workspace, activeVersionId: id }));
  }

  selectCell(line: number, position: number): void {
    this.selectedLine.set(line);
    this.selectedPosition.set(position);
  }

  setTemplate(id: string): void {
    this.commit((workspace) => {
      workspace.templateId = id;
    });
  }

  updateText(text: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.text = text;
    });
  }

  updateTitle(title: string): void {
    this.commit((workspace) => {
      workspace.title = title;
    });
  }

  updateVersionSource(source: string): void {
    this.commit((workspace) => {
      this.versionIn(workspace).source = source;
    });
  }

  setMark(patch: Partial<CharacterMark>): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      const id = key(this.selectedLine(), this.selectedPosition());
      const existing = { ...defaultMark(), ...version.marks[id] };
      const next = { ...existing, ...patch };
      // 平仄 / 韵部 / 依据一经人工改动，该判定所有权即归人工（批注、停顿不影响来源）
      const reJudged = (['tone', 'rhyme', 'basis'] as const).some(
        (field) => field in patch && patch[field] !== existing[field],
      );
      if (reJudged) {
        next.judgment = manualJudgment(new Date().toISOString());
        // 人工再判定后，该位置对当前包的既有裁决随之失效，重新进入裁决队列
        const pack = workspace.rhyme.active;
        if (pack) {
          workspace.rhyme.resolutions = workspace.rhyme.resolutions.filter(
            (resolution) =>
              !(
                resolution.packageId === pack.id &&
                resolution.packageVersion === pack.version &&
                resolution.versionId === version.id &&
                resolution.line === this.selectedLine() &&
                resolution.position === this.selectedPosition()
              ),
          );
        }
      }
      version.marks[id] = next;
    });
  }

  cycleTone(): void {
    const cell = this.selectedCell();
    const next: Record<Tone, MarkTone | '?'> = { '?': '平', '平': '仄', '仄': '中', '中': '?' };
    this.setMark({ tone: next[cell?.actual ?? '?'] });
  }

  togglePause(): void {
    const cell = this.selectedCell();
    this.setMark({ pauseAfter: !(cell?.mark.pauseAfter ?? false) });
  }

  cycleRhyme(): void {
    const cell = this.selectedCell();
    const current = cell?.mark.rhyme ?? '';
    const next = current === '' ? 'A' : current === 'A' ? 'B' : current === 'B' ? 'C' : '';
    this.setMark({ rhyme: next });
  }

  addAntithesis(): void {
    const line = this.selectedLine();
    const other = line === 0 ? 1 : line - 1;
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      if (version.antithesisPairs.some((pair) => pair.leftLine === line && pair.rightLine === other)) return;
      version.antithesisPairs.push({ id: uid('pair'), leftLine: Math.min(line, other), rightLine: Math.max(line, other), note: '结构相对，词性相应。' });
    });
  }

  removeAntithesis(id: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.antithesisPairs = version.antithesisPairs.filter((pair) => pair.id !== id);
    });
  }

  updateAntithesis(id: string, note: string): void {
    this.commit((workspace) => {
      const pair = this.versionIn(workspace).antithesisPairs.find((item) => item.id === id);
      if (pair) pair.note = note;
    });
  }

  /**
   * 导入韵谱包。整体原子提交：
   * - 校验失败 → 不触碰任何状态，上一包与裁决进度完整保留，重试安全；
   * - 同包同版本 → 幂等空操作，不重复产生任何记录；
   * - 包更新 → 依附旧包的未确认位置退回重核（旧裁决记录随包失效），
   *   已确认内容全部保留，仅把旧依据标记出来。
   */
  importRhymePackage(raw: string): void {
    let pack: RhymePackage;
    try {
      pack = parseRhymePackage(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法解析韵谱包';
      this.recordImport({ status: 'error', message: `导入失败：${message}。已保留上一韵谱包与裁决进度。`, at: new Date().toISOString() });
      this.toast.set('韵谱包导入失败，已保留上一包与进度');
      return;
    }
    const current = this.workspace().rhyme.active;
    if (current && current.id === pack.id && current.version === pack.version) {
      this.recordImport({ status: 'duplicate', message: `「${pack.name}」${pack.version} 已在使用，重复导入未产生变更。`, at: new Date().toISOString() });
      this.toast.set('该韵谱包版本已在使用，未重复导入');
      return;
    }
    pack.importedAt = new Date().toISOString();
    this.commit((workspace) => {
      workspace.versions.forEach((version) => {
        Object.values(version.marks).forEach((mark) => {
          const judgment = mark.judgment;
          if (judgment?.source === 'package') {
            judgment.staleBasis = judgment.packageId !== pack.id || judgment.packageVersion !== pack.version;
          }
        });
      });
      workspace.rhyme.resolutions = workspace.rhyme.resolutions.filter(
        (item) => item.packageId === pack.id && item.packageVersion === pack.version,
      );
      workspace.rhyme.active = pack;
      workspace.rhyme.lastImport = {
        status: 'ok',
        message: `已导入「${pack.name}」${pack.version}，共 ${Object.keys(pack.entries).length} 条字音。`,
        at: pack.importedAt,
      };
    });
    this.toast.set(`韵谱包已更新：待裁决 ${this.pendingAdjudications().length} 项，旧依据 ${this.staleConfirmations().length} 处`);
  }

  /** 校勘员确认候选：此时才把包数据写进当前校勘稿 */
  acceptCandidate(item: AdjudicationItem): void {
    const pack = this.workspace().rhyme.active;
    if (!pack) return;
    const now = new Date().toISOString();
    this.commit((workspace) => {
      this.applyCandidate(workspace, item, pack, now);
    });
  }

  /** 保留现稿：记录裁决，候选不写入 */
  rejectCandidate(item: AdjudicationItem): void {
    const pack = this.workspace().rhyme.active;
    if (!pack) return;
    const now = new Date().toISOString();
    this.commit((workspace) => {
      upsertResolution(workspace, {
        packageId: pack.id,
        packageVersion: pack.version,
        versionId: item.versionId,
        line: item.line,
        position: item.position,
        decision: 'rejected',
        resolvedAt: now,
      });
    });
  }

  /** 批量采纳无冲突候选；冲突项必须逐项裁决 */
  acceptAllNonConflicting(): void {
    const pack = this.workspace().rhyme.active;
    const targets = this.pendingAdjudications().filter((item) => !item.conflict);
    if (!pack || !targets.length) return;
    const now = new Date().toISOString();
    this.commit((workspace) => {
      targets.forEach((item) => this.applyCandidate(workspace, item, pack, now));
    });
    this.toast.set(`已采纳 ${targets.length} 条无冲突候选`);
  }

  /** 把已拒绝的候选退回重核 */
  reopenAdjudication(item: AdjudicationItem): void {
    const pack = this.workspace().rhyme.active;
    if (!pack || item.status !== 'rejected') return;
    this.commit((workspace) => {
      workspace.rhyme.resolutions = workspace.rhyme.resolutions.filter(
        (resolution) =>
          !(
            resolution.packageId === pack.id &&
            resolution.packageVersion === pack.version &&
            resolution.versionId === item.versionId &&
            resolution.line === item.line &&
            resolution.position === item.position
          ),
      );
    });
  }

  /** 复核旧依据：adopt 采用新包候选；keep 保留现判定并转为人工所有 */
  resolveStale(item: StaleConfirmation, action: 'adopt' | 'keep'): void {
    const pack = this.workspace().rhyme.active;
    if (!pack) return;
    const now = new Date().toISOString();
    this.commit((workspace) => {
      const version = workspace.versions.find((entry) => entry.id === item.versionId);
      if (!version) return;
      const id = key(item.line, item.position);
      const mark = { ...defaultMark(), ...version.marks[id] };
      if (action === 'adopt' && item.candidate) {
        version.marks[id] = {
          ...mark,
          tone: item.candidate.tone,
          rhyme: item.candidate.rhyme || mark.rhyme,
          basis: item.candidate.basis || mark.basis,
          judgment: { source: 'package', packageId: pack.id, packageName: pack.name, packageVersion: pack.version, confirmedAt: now, staleBasis: false },
        };
        upsertResolution(workspace, {
          packageId: pack.id, packageVersion: pack.version, versionId: item.versionId,
          line: item.line, position: item.position, decision: 'accepted', resolvedAt: now,
        });
      } else {
        version.marks[id] = { ...mark, judgment: manualJudgment(now) };
        if (item.candidate) {
          upsertResolution(workspace, {
            packageId: pack.id, packageVersion: pack.version, versionId: item.versionId,
            line: item.line, position: item.position, decision: 'rejected', resolvedAt: now,
          });
        }
      }
    });
  }

  snapshot(): void {
    const active = clone(this.activeVersion());
    active.id = uid('version');
    active.name = `校勘稿 ${this.workspace().versions.length}`;
    active.createdAt = new Date().toISOString();
    this.commit((workspace) => {
      workspace.versions.unshift(active);
      workspace.activeVersionId = active.id;
    });
    this.toast.set('已建立独立校勘稿');
  }

  duplicateActiveAsBaseline(): void {
    this.baselineVersionId.set(this.activeVersion().id);
  }

  nextDifference(): void {
    const values = this.differences();
    if (!values.length) return;
    const current = values.findIndex((index) => index >= this.currentDiffIndex());
    this.currentDiffIndex.set(values[(current + 1) % values.length]);
  }

  previousDifference(): void {
    const values = this.differences();
    if (!values.length) return;
    const reverse = [...values].reverse();
    const current = reverse.findIndex((index) => index <= this.currentDiffIndex());
    this.currentDiffIndex.set(reverse[(current + 1) % reverse.length]);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.workspace()));
    this.workspace.set(previous);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.workspace()));
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  exportProofreadCopy(): string {
    const active = this.activeVersion();
    const lines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const notes = this.issues().map((issue) => `[${issue.level.toUpperCase()}] ${issue.title}：${issue.detail}`);
    const pack = this.workspace().rhyme.active;
    const provenance = pack
      ? [`韵谱包：${pack.name} ${pack.version}（候选待裁决 ${this.pendingAdjudications().length} 项 · 旧依据 ${this.staleConfirmations().length} 处）`]
      : [];
    return [`# ${this.workspace().title} · 格律校对稿`, '', `底本：${active.name}`, `出处：${active.source}`, ...provenance, '', '## 字音标注', ...lines, '', '## 检查记录', ...notes].join('\n');
  }

  downloadProofreadCopy(): void {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([this.exportProofreadCopy()], { type: 'text/markdown;charset=utf-8' }));
    anchor.download = `${this.workspace().title}-格律校对稿.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  selectedCell(): AnalysisCell | undefined {
    return this.analysis()[this.selectedLine()]?.cells[this.selectedPosition()];
  }

  private commit(mutator: (workspace: PoemWorkspace) => void): void {
    this.undoStack.push(clone(this.workspace()));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const next = clone(this.workspace());
    mutator(next);
    next.updatedAt = new Date().toISOString();
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(0);
    this.persist();
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    const version = workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
    return version;
  }

  /** 把包候选写入指定位置，并记录裁决（确认是写稿的唯一入口） */
  private applyCandidate(
    workspace: PoemWorkspace,
    item: Pick<AdjudicationItem, 'versionId' | 'line' | 'position' | 'candidate'>,
    pack: RhymePackage,
    now: string,
  ): void {
    const version = workspace.versions.find((entry) => entry.id === item.versionId);
    if (!version) return;
    const id = key(item.line, item.position);
    const mark = { ...defaultMark(), ...version.marks[id] };
    version.marks[id] = {
      ...mark,
      tone: item.candidate.tone,
      rhyme: item.candidate.rhyme || mark.rhyme,
      basis: item.candidate.basis || mark.basis,
      judgment: { source: 'package', packageId: pack.id, packageName: pack.name, packageVersion: pack.version, confirmedAt: now, staleBasis: false },
    };
    upsertResolution(workspace, {
      packageId: pack.id,
      packageVersion: pack.version,
      versionId: item.versionId,
      line: item.line,
      position: item.position,
      decision: 'accepted',
      resolvedAt: now,
    });
  }

  /** 导入报告静默落盘：不进撤销栈，失败也不会冲掉上一包与进度 */
  private recordImport(report: RhymeImportReport): void {
    this.workspace.update((workspace) => ({ ...workspace, rhyme: { ...workspace.rhyme, lastImport: report } }));
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }

  private isAcceptableVariant(template: MeterTemplate, line: number, position: number): boolean {
    if (template.lineLength === 5) return position === 0 || position === 2;
    return position === 0 || position === 2 || position === 4;
  }
}
