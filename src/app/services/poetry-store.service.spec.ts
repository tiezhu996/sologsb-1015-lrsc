import { TestBed } from '@angular/core/testing';
import { PoetryStoreService } from './poetry-store.service';
import { SAMPLE_RHYME_PACKAGE_V1, SAMPLE_RHYME_PACKAGE_V2 } from './rhyme-package';

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';

function makeService(): PoetryStoreService {
  TestBed.configureTestingModule({});
  return TestBed.inject(PoetryStoreService);
}

describe('PoetryStoreService · 韵谱包数据所有权', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('初始数据的既有判定带人工确认来源', () => {
    const store = makeService();
    const marks = Object.values(store.activeVersion().marks);
    expect(marks.length).toBeGreaterThan(0);
    marks.forEach((mark) => expect(mark.judgment?.source).toBe('manual'));
  });

  it('旧数据升级：既有判定一律视为人工确认', () => {
    const legacy = {
      title: '旧稿',
      author: '古人',
      templateId: 'wuyan-zeqi',
      versions: [
        {
          id: 'v1',
          name: '旧版本',
          source: '旧藏',
          createdAt: '2020-01-01T00:00:00.000Z',
          text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
          marks: { '0:4': { tone: '平', rhyme: 'A', pauseAfter: false, basis: '旧依据', note: '' } },
          antithesisPairs: [],
        },
      ],
      activeVersionId: 'v1',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const store = makeService();
    const mark = store.activeVersion().marks['0:4'];
    expect(mark.judgment?.source).toBe('manual');
    expect(mark.judgment?.migrated).toBeTrue();
    expect(mark.basis).toBe('旧依据');
    expect(store.workspace().schemaVersion).toBe(2);
    expect(store.workspace().rhyme.active).toBeNull();
  });

  it('导入后包只提供候选，不覆盖人工判定，冲突留在裁决队列', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    expect(store.rhymePackage()?.id).toBe('sample-pingshui');
    expect(store.pendingAdjudications().length).toBeGreaterThan(0);
    // “晓”在包中为仄，但现稿人工判定为平：不得被覆盖
    const mark = store.activeVersion().marks['0:4'];
    expect(mark.tone).toBe('平');
    expect(mark.basis).toBe('《平水韵》上声十七筱');
    const conflict = store.pendingAdjudications().find((item) => item.char === '晓');
    expect(conflict?.conflict).toBeTrue();
    expect(conflict?.candidate.tone).toBe('仄');
  });

  it('校勘员确认后候选才写入校勘稿，并记录包来源', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    const item = store.pendingAdjudications().find((entry) => entry.char === '晓');
    expect(item).toBeDefined();
    store.acceptCandidate(item!);
    const mark = store.activeVersion().marks['0:4'];
    expect(mark.tone).toBe('仄');
    expect(mark.judgment?.source).toBe('package');
    expect(mark.judgment?.packageVersion).toBe('2026.06');
    expect(store.pendingAdjudications().some((entry) => entry.char === '晓')).toBeFalse();
  });

  it('保留现稿：候选不写入、裁决留痕，可退回重核', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    const item = store.pendingAdjudications().find((entry) => entry.char === '晓')!;
    store.rejectCandidate(item);
    expect(store.activeVersion().marks['0:4'].tone).toBe('平');
    expect(store.pendingAdjudications().some((entry) => entry.char === '晓')).toBeFalse();
    const decided = store.decidedAdjudications().find((entry) => entry.char === '晓');
    expect(decided?.status).toBe('rejected');
    store.reopenAdjudication(decided!);
    expect(store.pendingAdjudications().some((entry) => entry.char === '晓')).toBeTrue();
  });

  it('导入失败：保留上一包与裁决进度，重试同版本幂等', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    store.acceptCandidate(store.pendingAdjudications().find((entry) => entry.char === '晓')!);
    const resolutionsBefore = store.workspace().rhyme.resolutions.length;
    expect(resolutionsBefore).toBeGreaterThan(0);

    store.importRhymePackage('{ 这不是合法 JSON');
    expect(store.lastImport()?.status).toBe('error');
    expect(store.rhymePackage()?.version).toBe('2026.06');
    expect(store.workspace().rhyme.resolutions.length).toBe(resolutionsBefore);
    expect(store.activeVersion().marks['0:4'].tone).toBe('仄');

    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    expect(store.lastImport()?.status).toBe('duplicate');
    expect(store.workspace().rhyme.resolutions.length).toBe(resolutionsBefore);
    expect(store.activeVersion().marks['0:4'].tone).toBe('仄');
  });

  it('包更新：未确认位置退回重核，已确认内容保留并标出旧依据', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    store.acceptCandidate(store.pendingAdjudications().find((entry) => entry.char === '晓')!);
    store.rejectCandidate(store.pendingAdjudications().find((entry) => entry.char === '鸟')!);

    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V2));

    // 已确认内容保留，依据标记为旧
    const confirmed = store.activeVersion().marks['0:4'];
    expect(confirmed.tone).toBe('仄');
    expect(confirmed.judgment?.source).toBe('package');
    expect(confirmed.judgment?.packageVersion).toBe('2026.06');
    expect(confirmed.judgment?.staleBasis).toBeTrue();
    expect(store.staleConfirmations().some((entry) => entry.char === '晓')).toBeTrue();
    // 被拒绝（未确认）的位置退回重核
    expect(store.pendingAdjudications().some((entry) => entry.char === '鸟')).toBeTrue();
    // 人工判定不受包更新影响
    expect(store.activeVersion().marks['0:2'].judgment?.source).toBe('manual');
  });

  it('旧依据复核：可采用新候选，或保留现判定转为人工所有', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    store.acceptCandidate(store.pendingAdjudications().find((entry) => entry.char === '晓')!);
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V2));

    const stale = store.staleConfirmations().find((entry) => entry.char === '晓')!;
    store.resolveStale(stale, 'adopt');
    const adopted = store.activeVersion().marks['0:4'];
    expect(adopted.judgment?.source).toBe('package');
    expect(adopted.judgment?.packageVersion).toBe('2026.10');
    expect(adopted.judgment?.staleBasis).toBeFalse();
    expect(store.staleConfirmations().length).toBe(0);
  });

  it('旧依据复核：保留现判定后不重回裁决队列', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    store.acceptCandidate(store.pendingAdjudications().find((entry) => entry.char === '晓')!);
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V2));

    const stale = store.staleConfirmations().find((entry) => entry.char === '晓')!;
    store.resolveStale(stale, 'keep');
    const kept = store.activeVersion().marks['0:4'];
    expect(kept.tone).toBe('仄');
    expect(kept.judgment?.source).toBe('manual');
    expect(kept.judgment?.staleBasis).toBeFalse();
    expect(store.staleConfirmations().length).toBe(0);
    expect(store.pendingAdjudications().some((entry) => entry.char === '晓')).toBeFalse();
  });

  it('人工改动字音判定后，所有权转回人工', () => {
    const store = makeService();
    store.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
    store.acceptCandidate(store.pendingAdjudications().find((entry) => entry.char === '晓')!);
    store.selectCell(0, 4);
    store.setMark({ tone: '平' });
    const mark = store.activeVersion().marks['0:4'];
    expect(mark.judgment?.source).toBe('manual');
    expect(store.pendingAdjudications().some((entry) => entry.char === '晓')).toBeTrue();
  });
});
