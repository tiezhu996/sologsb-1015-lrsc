import { computed, Injectable, inject, signal } from '@angular/core';
import type {
  AdjudicationItem,
  AdjudicationState,
  AnalysisCell,
  AnalysisLine,
  AntithesisPair,
  CharacterMark,
  CharDiff,
  MarkTone,
  MeterTemplate,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  RhymePack,
  RhymePackEntry,
  RhymePackState,
  Tone,
} from '../models/poem.models';
import { candidateFingerprint, HISTORY_LIMIT, RhymePackService } from './rhyme-pack.service';

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
const CURRENT_SCHEMA_VERSION = 2;
const PUNCTUATION = new Set(['，', '。', '！', '？', '；', '：', '、', ' ', '\t']);
const TONE_DICTIONARY: Record<string, Tone> = {
  春: '平', 眠: '平', 不: '仄', 觉: '仄', 晓: '仄', 处: '仄', 闻: '平', 啼: '平', 鸟: '仄',
  夜: '仄', 来: '平', 风: '平', 雨: '仄', 声: '平', 花: '平', 落: '仄', 知: '平', 多: '平', 少: '仄',
};

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function key(line: number, position: number): string {
  return `${line}:${position}`;
}

function defaultMark(): CharacterMark {
  return { tone: '?', rhyme: '', pauseAfter: false, basis: '', note: '' };
}

/** 字音是否包含人工判定内容（停顿、批注不属于音义判定） */
function hasJudgement(mark: CharacterMark): boolean {
  return mark.tone !== '?' || mark.rhyme !== '' || mark.basis !== '';
}

/** 人工判定是否与候选一致；未填写的韵组视为“不作主张”，不构成冲突 */
function markMatchesEntry(mark: CharacterMark, entry: RhymePackEntry): boolean {
  if (mark.tone !== entry.tone) return false;
  if (mark.rhyme !== '' && mark.rhyme !== entry.rhyme) return false;
  return true;
}

function manualProvenance(): CharacterMark['provenance'] {
  return { owner: 'manual', confirmedAt: new Date().toISOString() };
}

function initialWorkspace(): PoemWorkspace {
  const now = new Date().toISOString();
  const spring = '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
  const marks: Record<string, CharacterMark> = {};
  const cells = [
    ['晓', 0, '平', false], ['鸟', 1, '平', false], ['声', 2, '平', false], ['少', 3, '平', false],
  ] as const;
  cells.forEach(([char, line, tone, pause]) => {
    marks[key(line, 4)] = { tone, rhyme: 'A', pauseAfter: pause, basis: '《平水韵》上声十七筱', note: `${char} 为韵脚`, provenance: { owner: 'manual', confirmedAt: now } };
  });
  marks[key(0, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '', provenance: { owner: 'manual', confirmedAt: now } };
  marks[key(1, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '', provenance: { owner: 'manual', confirmedAt: now } };
  marks[key(2, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '', provenance: { owner: 'manual', confirmedAt: now } };

  const topVersion: PoemVersion = {
    id: 'version-main',
    name: '通行本 · 孟浩然集',
    source: '《孟浩然诗集笺注》',
    createdAt: now,
    text: spring,
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function loadWorkspace(): PoemWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const parsed = JSON.parse(raw) as PoemWorkspace;
    if (!parsed.versions?.length) return initialWorkspace();
    // 旧数据升级：升级前的所有既有判定一律视为“人工确认”，与韵谱包所有权分离
    if (!parsed.schemaVersion || parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
      const now = new Date().toISOString();
      parsed.versions.forEach((version) => {
        Object.values(version.marks).forEach((mark) => {
          if (hasJudgement(mark) && !mark.provenance) {
            mark.provenance = { owner: 'manual', confirmedAt: now };
          }
        });
      });
      parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return initialWorkspace();
  }
}

interface Snapshot {
  ws: PoemWorkspace;
  pack: RhymePackState;
}

@Injectable({ providedIn: 'root' })
export class PoetryStoreService {
  private readonly packService = inject(RhymePackService);

  readonly workspace = signal<PoemWorkspace>(loadWorkspace());
  readonly selectedLine = signal(0);
  readonly selectedPosition = signal(4);
  readonly baselineVersionId = signal<string>('');
  readonly currentDiffIndex = signal(0);
  readonly toast = signal('');
  readonly packError = signal('');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  readonly activeVersion = computed(() => {
    const state = this.workspace();
    return state.versions.find((version) => version.id === state.activeVersionId) ?? state.versions[0];
  });

  readonly template = computed(() => {
    return METER_TEMPLATES.find((item) => item.id === this.workspace().templateId) ?? METER_TEMPLATES[0];
  });

  readonly lines = computed(() => this.activeVersion().text.split('\n'));
  readonly currentPack = computed(() => this.packService.currentPack());
  readonly packHistory = computed(() => this.packService.history());

  readonly analysis = computed<AnalysisLine[]>(() => {
    const version = this.activeVersion();
    const template = this.template();
    const packState = this.packService.packState();
    const pack = packState.current;
    return this.lines().map((line, lineIndex) => {
      const chars = Array.from(line).filter((char) => !PUNCTUATION.has(char));
      const cells: AnalysisCell[] = chars.map((char, position) => {
        const cellKey = key(lineIndex, position);
        const mark = version.marks[cellKey] ?? defaultMark();
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
        const entry = pack?.entries[char];
        const decision = pack ? packState.decisions[`${version.id}::${cellKey}`] : undefined;
        let adjudication: AdjudicationState = 'none';
        let priorCandidate: RhymePackEntry | undefined;
        if (entry) {
          const evaluated = this.evaluateAdjudication(mark, entry, decision, packState, char);
          adjudication = evaluated.state;
          priorCandidate = evaluated.prior;
        }
        return { char, position, expected, actual, status, message, mark, candidate: entry, adjudication, priorCandidate };
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

  /** 裁决队列：韵谱提供候选但尚未经校勘员确认的位置（待采纳 / 冲突待决） */
  readonly adjudicationQueue = computed<AdjudicationItem[]>(() => {
    const items: AdjudicationItem[] = [];
    this.analysis().forEach((line) => {
      line.cells.forEach((cell) => {
        if ((cell.adjudication === 'candidate' || cell.adjudication === 'conflict') && cell.candidate) {
          items.push({
            key: key(line.index, cell.position),
            line: line.index,
            position: cell.position,
            char: cell.char,
            state: cell.adjudication,
            mark: cell.mark,
            entry: cell.candidate,
          });
        }
      });
    });
    return items;
  });

  /** 旧依据待核：曾依据旧包确认、新包候选已变化的位置；判定保留，不自动退回队列 */
  readonly staleItems = computed<AdjudicationItem[]>(() => {
    const items: AdjudicationItem[] = [];
    this.analysis().forEach((line) => {
      line.cells.forEach((cell) => {
        if (cell.adjudication === 'stale' && cell.candidate) {
          items.push({
            key: key(line.index, cell.position),
            line: line.index,
            position: cell.position,
            char: cell.char,
            state: 'stale',
            mark: cell.mark,
            entry: cell.candidate,
            priorEntry: cell.priorCandidate,
          });
        }
      });
    });
    return items;
  });

  readonly pendingCount = computed(() => this.adjudicationQueue().length);
  readonly conflictCount = computed(() => this.adjudicationQueue().filter((item) => item.state === 'conflict').length);
  readonly staleCount = computed(() => this.staleItems().length);

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
    if (this.currentPack()) {
      const pending = this.pendingCount();
      if (pending > 0) {
        issues.push({
          id: 'adjudication-pending',
          level: 'warning',
          title: '韵谱候选待裁决',
          detail: `裁决队列中还有 ${pending} 个位置（${this.conflictCount()} 处与人工判定冲突）未确认；韵谱只提供候选，确认后才写入校勘稿。`,
        });
      }
      if (this.staleCount() > 0) {
        issues.push({
          id: 'adjudication-stale',
          level: 'info',
          title: '存在旧依据确认',
          detail: `${this.staleCount()} 个位置依据旧版韵谱确认且新包候选已变化，判定已保留，可在“韵谱裁决”中复核。`,
        });
      }
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

  selectVersion(id: string): void {
    this.workspace.update((workspace) => ({ ...workspace, activeVersionId: id }));
  }

  selectCell(line: number, position: number): void {
    this.selectedLine.set(line);
    this.selectedPosition.set(position);
  }

  setTemplate(id: string): void {
    this.tx(({ ws }) => {
      ws.templateId = id;
    });
  }

  updateText(text: string): void {
    this.tx(({ ws }) => {
      this.versionIn(ws).text = text;
    });
  }

  updateTitle(title: string): void {
    this.tx(({ ws }) => {
      ws.title = title;
    });
  }

  updateVersionSource(source: string): void {
    this.tx(({ ws }) => {
      this.versionIn(ws).source = source;
    });
  }

  setMark(patch: Partial<CharacterMark>): void {
    this.tx(({ ws, pack }) => {
      const version = this.versionIn(ws);
      const id = key(this.selectedLine(), this.selectedPosition());
      const merged: CharacterMark = { ...defaultMark(), ...version.marks[id], ...patch };
      // 人工直接编辑音义字段，所有权收归人工，并撤回该位置依赖韵谱包的未决/已确认裁决
      if ('tone' in patch || 'rhyme' in patch || 'basis' in patch) {
        merged.provenance = manualProvenance();
        delete pack.decisions[`${version.id}::${id}`];
      }
      version.marks[id] = merged;
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
    this.tx(({ ws }) => {
      const version = this.versionIn(ws);
      if (version.antithesisPairs.some((pair) => pair.leftLine === line && pair.rightLine === other)) return;
      version.antithesisPairs.push({ id: uid('pair'), leftLine: Math.min(line, other), rightLine: Math.max(line, other), note: '结构相对，词性相应。' });
    });
  }

  removeAntithesis(id: string): void {
    this.tx(({ ws }) => {
      const version = this.versionIn(ws);
      version.antithesisPairs = version.antithesisPairs.filter((pair) => pair.id !== id);
    });
  }

  updateAntithesis(id: string, note: string): void {
    this.tx(({ ws }) => {
      const pair = this.versionIn(ws).antithesisPairs.find((item) => item.id === id);
      if (pair) pair.note = note;
    });
  }

  snapshot(): void {
    const active = clone(this.activeVersion());
    active.id = uid('version');
    active.name = `校勘稿 ${this.workspace().versions.length}`;
    active.createdAt = new Date().toISOString();
    this.tx(({ ws }) => {
      ws.versions.unshift(active);
      ws.activeVersionId = active.id;
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

  // ===== 韵谱包导入 =====

  async importPackFile(file: File): Promise<void> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.packError.set('韵谱包文件读取失败，已保留当前韵谱包与裁决进度，可重试。');
      return;
    }
    this.importPackText(text);
  }

  importPackText(text: string): void {
    const result = this.packService.parse(text);
    if (!result.ok) {
      // 校验失败：不触碰任何状态，上一包与裁决进度原样保留
      this.packError.set(`导入失败：${result.error}`);
      return;
    }
    if (result.duplicate) {
      // 同一包同版本重复导入：幂等忽略，不产生重复候选与队列项
      this.packError.set('');
      this.toast.set(`韵谱包“${result.pack.name} ${result.pack.version}”已在使用，未重复导入。`);
      return;
    }
    this.commitPack(result.pack, result.entryCount);
  }

  importSamplePack(sample: Omit<RhymePack, 'importedAt'>): void {
    const pack: RhymePack = { ...sample, importedAt: new Date().toISOString() };
    const current = this.currentPack();
    if (current && current.id === pack.id && current.version === pack.version) {
      this.toast.set(`示例韵谱包 ${pack.version} 已在使用，未重复导入。`);
      return;
    }
    this.commitPack(pack, Object.keys(pack.entries).length);
  }

  private commitPack(pack: RhymePack, entryCount: number): void {
    // 先在当前状态上完成替换校验，再与校勘稿一起进入同一事务（失败可整体撤销）
    this.tx(({ pack: packDraft }) => {
      packDraft.history = packDraft.current
        ? [packDraft.current, ...packDraft.history].slice(0, HISTORY_LIMIT)
        : packDraft.history;
      packDraft.current = clone(pack);
    });
    this.packError.set('');
    this.toast.set(`已导入韵谱包“${pack.name} ${pack.version}”，共 ${entryCount} 条候选；旧包已留存。`);
  }

  // ===== 裁决 =====

  /** 确认采纳候选：候选此时才写入当前校勘稿，并记录韵谱依据 */
  acceptCandidate(line: number, position: number): void {
    const cell = this.analysis()[line]?.cells[position];
    const entry = cell?.candidate;
    if (!entry) return;
    const pack = this.currentPack();
    if (!pack) return;
    const now = new Date().toISOString();
    this.tx(({ ws, pack: packDraft }) => {
      const version = ws.versions.find((item) => item.id === ws.activeVersionId) ?? ws.versions[0];
      const id = key(line, position);
      const existing = version.marks[id];
      version.marks[id] = {
        tone: entry.tone,
        rhyme: entry.rhyme,
        pauseAfter: existing?.pauseAfter ?? false,
        basis: entry.basis,
        note: existing?.note ?? '',
        provenance: {
          owner: 'rhyme-pack',
          confirmedAt: now,
          packId: pack.id,
          packName: pack.name,
          packVersion: pack.version,
        },
      };
      packDraft.decisions[`${version.id}::${id}`] = {
        status: 'accepted',
        packId: pack.id,
        packVersion: pack.version,
        fingerprint: candidateFingerprint(entry),
        resolvedAt: now,
      };
    });
    this.toast.set(`已采纳韵谱候选“${entry.char}”，写入校勘稿。`);
  }

  /** 确认保留人工判定：校勘稿不变，仅记录该冲突已按人工裁决 */
  keepManual(line: number, position: number): void {
    const cell = this.analysis()[line]?.cells[position];
    const entry = cell?.candidate;
    const pack = this.currentPack();
    if (!entry || !pack) return;
    this.tx(({ ws, pack: packDraft }) => {
      const version = ws.versions.find((item) => item.id === ws.activeVersionId) ?? ws.versions[0];
      const id = key(line, position);
      const mark = version.marks[id];
      if (mark) {
        mark.provenance = { owner: 'manual', confirmedAt: new Date().toISOString() };
      }
      packDraft.decisions[`${version.id}::${id}`] = {
        status: 'kept-manual',
        packId: pack.id,
        packVersion: pack.version,
        fingerprint: candidateFingerprint(entry),
        resolvedAt: new Date().toISOString(),
      };
    });
    this.toast.set(`“${entry.char}”已按人工判定保留，韵谱候选不写入。`);
  }

  /** 一键采纳全部无冲突候选（尚无人工作出判定的位置）；冲突项保留在队列中 */
  acceptAllNonConflicting(): void {
    const pack = this.currentPack();
    if (!pack) return;
    const pending = this.adjudicationQueue().filter((item) => item.state === 'candidate');
    if (pending.length === 0) {
      this.toast.set('没有待采纳的无冲突候选。');
      return;
    }
    const now = new Date().toISOString();
    this.tx(({ ws, pack: packDraft }) => {
      const version = ws.versions.find((item) => item.id === ws.activeVersionId) ?? ws.versions[0];
      pending.forEach((item) => {
        const id = key(item.line, item.position);
        const existing = version.marks[id];
        version.marks[id] = {
          tone: item.entry.tone,
          rhyme: item.entry.rhyme,
          pauseAfter: existing?.pauseAfter ?? false,
          basis: item.entry.basis,
          note: existing?.note ?? '',
          provenance: { owner: 'rhyme-pack', confirmedAt: now, packId: pack.id, packName: pack.name, packVersion: pack.version },
        };
        packDraft.decisions[`${version.id}::${id}`] = {
          status: 'accepted',
          packId: pack.id,
          packVersion: pack.version,
          fingerprint: candidateFingerprint(item.entry),
          resolvedAt: now,
        };
      });
    });
    this.toast.set(`已批量采纳 ${pending.length} 个无冲突候选，冲突项仍留在裁决队列。`);
  }

  /** 把已确认位置（含旧依据待核）重新送回裁决队列；当前判定转归人工所有 */
  reopenAdjudication(line: number, position: number): void {
    this.tx(({ ws, pack }) => {
      const version = this.versionIn(ws);
      const id = key(line, position);
      if (version.marks[id]) version.marks[id].provenance = manualProvenance();
      delete pack.decisions[`${version.id}::${id}`];
    });
    this.toast.set('已送回裁决队列，当前判定按人工结论保留。');
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push({ ws: clone(this.workspace()), pack: clone(this.packService.packState()) });
    this.packService.restore(previous.pack);
    this.workspace.set(previous.ws);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push({ ws: clone(this.workspace()), pack: clone(this.packService.packState()) });
    this.packService.restore(next.pack);
    this.workspace.set(next.ws);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  exportProofreadCopy(): string {
    const active = this.activeVersion();
    const pack = this.currentPack();
    const ownerLabel = (cell: AnalysisCell): string => {
      const owner = cell.mark.provenance?.owner;
      if (owner === 'rhyme-pack') return cell.mark.provenance?.stale ? '谱·旧依据' : '韵谱确认';
      if (owner === 'manual') return '人工确认';
      return '';
    };
    const lines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => {
        const base = `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`;
        const owner = ownerLabel(cell);
        return owner ? `${base}[${owner}]` : base;
      }).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const notes = this.issues().map((issue) => `[${issue.level.toUpperCase()}] ${issue.title}：${issue.detail}`);
    const sections = [
      `# ${this.workspace().title} · 格律校对稿`,
      '',
      `底本：${active.name}`,
      `出处：${active.source}`,
    ];
    if (pack) {
      sections.push(`韵谱包：${pack.name}（${pack.version}，${pack.importedAt.slice(0, 10)} 导入）`);
      const stale = this.staleItems();
      if (stale.length) {
        sections.push(`旧依据待核：${stale.map((item) => `“${item.char}”依${item.priorEntry ? `${item.priorEntry.rhyme}` : '旧包'}`).join('、')}，判定保留待复核。`);
      }
    } else {
      sections.push('韵谱包：未导入，全部判定来自人工校勘。');
    }
    sections.push('', '## 字音标注', ...lines, '', '## 检查记录', ...notes);
    return sections.join('\n');
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

  private evaluateAdjudication(
    mark: CharacterMark,
    entry: RhymePackEntry,
    decision: { status: 'accepted' | 'kept-manual'; packId: string; packVersion: string; fingerprint: string } | undefined,
    packState: RhymePackState,
    char: string,
  ): { state: AdjudicationState; prior?: RhymePackEntry } {
    if (!hasJudgement(mark)) return { state: 'candidate' };
    if (!decision) {
      return { state: markMatchesEntry(mark, entry) ? 'aligned' : 'conflict' };
    }
    const sameVersion = decision.packVersion === packState.current?.version && decision.packId === packState.current?.id;
    if (decision.status === 'kept-manual') {
      return { state: 'kept-manual' };
    }
    if (sameVersion && decision.fingerprint === candidateFingerprint(entry)) {
      return { state: 'accepted' };
    }
    if (sameVersion) {
      // 同版本下确认后又被改动：重新视为冲突
      return { state: 'conflict' };
    }
    // 依据旧包确认：新候选一致则仍然成立，不一致则保留判定并标出旧依据
    if (decision.fingerprint === candidateFingerprint(entry)) return { state: 'accepted' };
    const prior = packState.history.find((pack) => pack.id === decision.packId && pack.version === decision.packVersion)?.entries[char]
      ?? { char, tone: (mark.tone === '?' ? '中' : mark.tone) as MarkTone, rhyme: mark.rhyme, basis: mark.basis };
    return { state: 'stale', prior };
  }

  private tx(apply: (draft: { ws: PoemWorkspace; pack: RhymePackState }) => void): void {
    this.undoStack.push({ ws: clone(this.workspace()), pack: clone(this.packService.packState()) });
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const ws = clone(this.workspace());
    const pack = clone(this.packService.packState());
    apply({ ws, pack });
    ws.updatedAt = new Date().toISOString();
    this.packService.restore(pack);
    this.workspace.set(ws);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(0);
    this.persist();
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    return workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }

  private isAcceptableVariant(template: MeterTemplate, line: number, position: number): boolean {
    if (template.lineLength === 5) return position === 0 || position === 2;
    return position === 0 || position === 2 || position === 4;
  }
}
