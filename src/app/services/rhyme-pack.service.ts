import { Injectable, computed, signal } from '@angular/core';
import type { AdjudicationDecision, MarkTone, RhymePack, RhymePackEntry, RhymePackState } from '../models/poem.models';

const PACK_STORAGE_KEY = 'sologsb-1015-rhyme-pack-v1';
export const HISTORY_LIMIT = 5;
const VALID_TONES: MarkTone[] = ['平', '仄', '中'];

const clone = <T>(value: T): T => structuredClone(value);

export type ImportResult =
  | { ok: true; duplicate: boolean; pack: RhymePack; entryCount: number }
  | { ok: false; error: string };

export function candidateFingerprint(entry: Pick<RhymePackEntry, 'tone' | 'rhyme' | 'basis'>): string {
  return `${entry.tone}|${entry.rhyme}|${entry.basis}`;
}

/**
 * 随产品提供的示例韵谱包。v1 与初始校勘稿存在冲突与待标位置，
 * v2 调整了部分候选，用于演示“包更新后已确认内容保留旧依据”。
 */
export const SAMPLE_PACK_V1: Omit<RhymePack, 'importedAt'> = {
  id: 'ping-shui-rhyme',
  name: '平水韵常用字音（示例）',
  version: 'v1',
  entries: Object.fromEntries(
    [
      ['春', '平', '上平十一真', '《平水韵》上平十一真'],
      ['眠', '平', '下平一先', '《平水韵》下平一先'],
      ['不', '仄', '入声五物', '《平水韵》入声五物'],
      ['觉', '仄', '入声三觉', '《平水韵》入声三觉'],
      ['晓', '仄', '上声十七筱', '《平水韵》上声十七筱'],
      ['处', '仄', '去声六御', '《平水韵》去声六御'],
      ['闻', '平', '上平十二文', '《平水韵》上平十二文'],
      ['啼', '平', '上平八齐', '《平水韵》上平八齐'],
      ['鸟', '仄', '上声十七筱', '《平水韵》上声十七筱'],
      ['夜', '仄', '去声二十二禡', '《平水韵》去声二十二禡'],
      ['来', '平', '上平十灰', '《平水韵》上平十灰'],
      ['风', '平', '上平一东', '《平水韵》上平一东'],
      ['雨', '仄', '上声七麌', '《平水韵》上声七麌'],
      ['声', '平', '下平八庚', '《平水韵》下平八庚'],
      ['花', '平', '下平六麻', '《平水韵》下平六麻'],
      ['落', '仄', '入声十药', '《平水韵》入声十药'],
      ['知', '平', '上平四支', '《平水韵》上平四支'],
      ['多', '平', '下平五歌', '《平水韵》下平五歌'],
      ['少', '仄', '上声十七筱', '《平水韵》上声十七筱'],
    ].map(([char, tone, rhyme, basis]) => [char, { char, tone: tone as MarkTone, rhyme, basis }]),
  ),
};

export const SAMPLE_PACK_V2: Omit<RhymePack, 'importedAt'> = {
  id: 'ping-shui-rhyme',
  name: '平水韵常用字音（示例）',
  version: 'v2',
  entries: Object.fromEntries(
    [
      ['春', '平', '上平十一真', '《平水韵》上平十一真'],
      ['眠', '平', '下平一先', '《平水韵》下平一先'],
      ['不', '仄', '入声五物', '《平水韵》入声五物'],
      ['觉', '平', '下平三觉（又音）', '据《广韵》又音，校勘补录平读'],
      ['晓', '仄', '上声十七筱', '《平水韵》上声十七筱'],
      ['处', '仄', '去声六御', '《平水韵》去声六御'],
      ['闻', '平', '上平十二文', '《平水韵》上平十二文'],
      ['啼', '平', '上平八齐', '《平水韵》上平八齐'],
      ['鸟', '仄', '上声十七筱', '《平水韵》上声十七筱'],
      ['夜', '仄', '去声二十二禡', '《平水韵》去声二十二禡'],
      ['来', '平', '上平十灰', '《平水韵》上平十灰'],
      ['风', '平', '上平一东', '《平水韵》上平一东'],
      ['雨', '仄', '上声七麌', '《平水韵》上声七麌'],
      ['声', '平', '下平八庚', '《平水韵》下平八庚（v2 修订韵部说明）'],
      ['花', '平', '下平六麻', '《平水韵》下平六麻'],
      ['落', '仄', '入声十药', '《平水韵》入声十药'],
      ['知', '平', '上平四支', '《平水韵》上平四支'],
      ['多', '平', '下平五歌', '《平水韵》下平五歌'],
      ['少', '仄', '上声十七筱', '《平水韵》上声十七筱'],
    ].map(([char, tone, rhyme, basis]) => [char, { char, tone: tone as MarkTone, rhyme, basis }]),
  ),
};

function emptyPackState(): RhymePackState {
  return { current: null, history: [], decisions: {} };
}

function loadPackState(): RhymePackState {
  try {
    const raw = localStorage.getItem(PACK_STORAGE_KEY);
    if (!raw) return emptyPackState();
    const parsed = JSON.parse(raw) as RhymePackState;
    if (!parsed || typeof parsed !== 'object') return emptyPackState();
    return {
      current: parsed.current ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      decisions: parsed.decisions ?? {},
    };
  } catch {
    return emptyPackState();
  }
}

/**
 * 韵谱包数据所有权服务。
 * 与校勘稿（PoetryStoreService）分开持久化：包仅提供候选与历史依据，
 * 导入失败或重试不会触碰校勘稿，也不会重复写入。
 */
@Injectable({ providedIn: 'root' })
export class RhymePackService {
  readonly packState = signal<RhymePackState>(loadPackState());
  readonly currentPack = computed(() => this.packState().current);
  readonly history = computed(() => this.packState().history);

  decisionFor(versionScopedKey: string): AdjudicationDecision | undefined {
    return this.packState().decisions[versionScopedKey];
  }

  /** 解析并完整校验韵谱包文本；任何错误都在写入前返回，保证旧包与进度不受影响 */
  parse(text: string): ImportResult {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: '文件不是合法 JSON，请检查韵谱包格式。' };
    }
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, error: '韵谱包必须是包含 name、version、entries 的对象。' };
    }
    const body = raw as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    const version = typeof body['version'] === 'string' ? body['version'].trim() : '';
    if (!name) return { ok: false, error: '韵谱包缺少 name（包名）。' };
    if (!version) return { ok: false, error: '韵谱包缺少 version（版本号）。' };

    const rawEntries = body['entries'];
    const pairs: [string, RhymePackEntry][] = [];
    const seen = new Set<string>();

    const pushEntry = (item: unknown, index: number): string | null => {
      if (typeof item !== 'object' || item === null) return `第 ${index + 1} 条候选不是对象。`;
      const record = item as Record<string, unknown>;
      const char = typeof record['char'] === 'string' ? record['char'].trim() : '';
      const tone = typeof record['tone'] === 'string' ? record['tone'].trim() : '';
      const rhyme = typeof record['rhyme'] === 'string' ? record['rhyme'].trim() : '';
      const basis = typeof record['basis'] === 'string' ? record['basis'].trim() : '';
      if (char.length === 0) return `第 ${index + 1} 条候选缺少 char（字头）。`;
      if (!VALID_TONES.includes(tone as MarkTone)) return `字头“${char}”的 tone 必须是 平 / 仄 / 中。`;
      if (!rhyme) return `字头“${char}”缺少 rhyme（韵部）。`;
      if (!basis) return `字头“${char}”缺少 basis（韵谱依据）。`;
      if (seen.has(char)) return `字头“${char}”在包中重复出现。`;
      seen.add(char);
      pairs.push([char, { char, tone: tone as MarkTone, rhyme, basis }]);
      return null;
    };

    if (Array.isArray(rawEntries)) {
      if (rawEntries.length === 0) return { ok: false, error: 'entries 为空，韵谱包没有任何候选。' };
      for (let index = 0; index < rawEntries.length; index += 1) {
        const error = pushEntry(rawEntries[index], index);
        if (error) return { ok: false, error };
      }
    } else if (rawEntries && typeof rawEntries === 'object') {
      const keys = Object.keys(rawEntries as Record<string, unknown>);
      if (keys.length === 0) return { ok: false, error: 'entries 为空，韵谱包没有任何候选。' };
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const item = (rawEntries as Record<string, unknown>)[key];
        const error = pushEntry(typeof item === 'object' && item !== null ? { char: key, ...(item as object) } : item, index);
        if (error) return { ok: false, error };
      }
    } else {
      return { ok: false, error: 'entries 必须是候选数组或以字头为键的对象。' };
    }

    const explicitId = typeof body['id'] === 'string' && body['id'].trim() ? body['id'].trim() : '';
    const id = explicitId || `pack-${name.replace(/\s+/g, '-')}`;
    const pack: RhymePack = {
      id,
      name,
      version,
      importedAt: new Date().toISOString(),
      entries: Object.fromEntries(pairs),
    };
    const current = this.packState().current;
    if (current && current.id === id && current.version === version) {
      return { ok: true, duplicate: true, pack, entryCount: pairs.length };
    }
    return { ok: true, duplicate: false, pack, entryCount: pairs.length };
  }

  restore(next: RhymePackState): void {
    const cloned = clone(next);
    localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(cloned));
    this.packState.set(cloned);
  }
}
