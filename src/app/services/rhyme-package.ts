import type { MarkTone, RhymePackage, RhymePackageEntry } from '../models/poem.models';

const TONES: readonly MarkTone[] = ['平', '仄', '中'];

/**
 * 解析并校验韵谱包。任何一步不合法都抛出异常，
 * 调用方据此放弃提交，从而保留上一包与裁决进度。
 */
export function parseRhymePackage(raw: string): RhymePackage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('韵谱包必须是 JSON 对象');
  }
  const pack = data as Record<string, unknown>;
  const id = expectText(pack['id'], 'id');
  const name = expectText(pack['name'], 'name');
  const version = expectText(pack['version'], 'version');
  if (!pack['entries'] || typeof pack['entries'] !== 'object' || Array.isArray(pack['entries'])) {
    throw new Error('entries 必须是「字 → 字音」对象');
  }
  const entries: Record<string, RhymePackageEntry> = {};
  for (const [char, value] of Object.entries(pack['entries'] as Record<string, unknown>)) {
    if (Array.from(char).length !== 1) {
      throw new Error(`字音键「${char}」必须是单个汉字`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`「${char}」的字音必须是对象`);
    }
    const entry = value as Record<string, unknown>;
    const tone = entry['tone'];
    if (typeof tone !== 'string' || !TONES.includes(tone as MarkTone)) {
      throw new Error(`「${char}」的平仄只能是 平 / 仄 / 中`);
    }
    entries[char] = {
      tone: tone as MarkTone,
      rhyme: typeof entry['rhyme'] === 'string' ? entry['rhyme'] : '',
      basis: typeof entry['basis'] === 'string' ? entry['basis'] : '',
    };
  }
  if (Object.keys(entries).length === 0) {
    throw new Error('韵谱包不包含任何字音');
  }
  return { id, name, version, importedAt: '', entries };
}

function expectText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`韵谱包缺少有效的 ${field} 字段`);
  }
  return value.trim();
}

/** 示例韵谱包 · 第一版 */
export const SAMPLE_RHYME_PACKAGE_V1 = {
  id: 'sample-pingshui',
  name: '示例 · 平水韵字音包',
  version: '2026.06',
  entries: {
    春: { tone: '平', rhyme: '上平十一真', basis: '《平水韵》上平声十一真' },
    眠: { tone: '平', rhyme: '下平一先', basis: '《平水韵》下平声一先' },
    不: { tone: '仄', rhyme: '入声五物', basis: '《平水韵》入声五物' },
    觉: { tone: '仄', rhyme: '入声三觉', basis: '《平水韵》入声三觉' },
    晓: { tone: '仄', rhyme: '上声十七筱', basis: '《平水韵》上声十七筱' },
    处: { tone: '仄', rhyme: '去声六御', basis: '《平水韵》去声六御' },
    闻: { tone: '平', rhyme: '上平十二文', basis: '《平水韵》上平声十二文' },
    啼: { tone: '平', rhyme: '上平八齐', basis: '《平水韵》上平声八齐' },
    鸟: { tone: '仄', rhyme: '上声十七筱', basis: '《平水韵》上声十七筱' },
    夜: { tone: '仄', rhyme: '去声二十二祃', basis: '《平水韵》去声二十二祃' },
    来: { tone: '平', rhyme: '上平十灰', basis: '《平水韵》上平声十灰' },
    风: { tone: '平', rhyme: '上平一东', basis: '《平水韵》上平声一东' },
    雨: { tone: '仄', rhyme: '上声七麌', basis: '《平水韵》上声七麌' },
    声: { tone: '平', rhyme: '下平八庚', basis: '《平水韵》下平声八庚' },
    花: { tone: '平', rhyme: '下平六麻', basis: '《平水韵》下平声六麻' },
    落: { tone: '仄', rhyme: '入声十药', basis: '《平水韵》入声十药' },
    知: { tone: '平', rhyme: '上平四支', basis: '《平水韵》上平声四支' },
    多: { tone: '平', rhyme: '下平五歌', basis: '《平水韵》下平声五歌' },
    少: { tone: '仄', rhyme: '上声十七筱', basis: '《平水韵》上声十七筱' },
  },
};

/** 示例韵谱包 · 修订版（部分字音有修订，用于演示包更新后的重核与旧依据标记） */
export const SAMPLE_RHYME_PACKAGE_V2 = {
  ...SAMPLE_RHYME_PACKAGE_V1,
  version: '2026.10',
  entries: {
    ...SAMPLE_RHYME_PACKAGE_V1.entries,
    觉: { tone: '平', rhyme: '去声十八啸', basis: '《平水韵》去声十八啸（睡醒读去）' },
    少: { tone: '平', rhyme: '下平二萧', basis: '《平水韵》下平声二萧（异读存疑）' },
    人: { tone: '平', rhyme: '上平十一真', basis: '《平水韵》上平声十一真' },
    月: { tone: '仄', rhyme: '入声六月', basis: '《平水韵》入声六月' },
  },
};
