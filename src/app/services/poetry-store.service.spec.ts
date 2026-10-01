import { TestBed } from '@angular/core/testing';
import { PoetryStoreService } from './poetry-store.service';
import { SAMPLE_PACK_V1, SAMPLE_PACK_V2 } from './rhyme-pack.service';

describe('PoetryStoreService 两套数据所有权与裁决', () => {
  let store: PoetryStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    store = TestBed.inject(PoetryStoreService);
  });

  function cellAt(line: number, position: number) {
    return store.analysis()[line].cells[position];
  }

  it('导入韵谱包不会直接覆盖人工判定，只产生候选与冲突', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    // 晓：人工平声，韵谱仄声 → 冲突未决，人工判定保留
    const xiao = cellAt(0, 4);
    expect(xiao.adjudication).toBe('conflict');
    expect(xiao.actual).toBe('平');
    expect(xiao.mark.rhyme).toBe('A');
    // 觉：无人工判定 → 候选待确认，仍显示待标
    const jue = cellAt(0, 3);
    expect(jue.adjudication).toBe('candidate');
    expect(jue.mark.tone).toBe('?');
    expect(store.conflictCount()).toBe(5);
    expect(store.pendingCount()).toBeGreaterThan(5);
  });

  it('采纳候选后才写入校勘稿，并记录韵谱依据', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 3); // 觉：仄 / 入声三觉
    const jue = cellAt(0, 3);
    expect(jue.mark.tone).toBe('仄');
    expect(jue.mark.basis).toContain('入声三觉');
    expect(jue.mark.provenance?.owner).toBe('rhyme-pack');
    expect(jue.mark.provenance?.packVersion).toBe('v1');
    expect(jue.adjudication).toBe('accepted');
    expect(store.adjudicationQueue().some((item) => item.line === 0 && item.position === 3)).toBeFalse();
  });

  it('保留人工时校勘稿不变，仅记录裁决结果', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    const before = cellAt(0, 4);
    const tone = before.mark.tone;
    const rhyme = before.mark.rhyme;
    store.keepManual(0, 4);
    const after = cellAt(0, 4);
    expect(after.mark.tone).toBe(tone);
    expect(after.mark.rhyme).toBe(rhyme);
    expect(after.adjudication).toBe('kept-manual');
    expect(after.mark.provenance?.owner).toBe('manual');
  });

  it('一键采纳只处理无冲突候选，冲突项留在队列', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    const conflictsBefore = store.conflictCount();
    store.acceptAllNonConflicting();
    expect(store.conflictCount()).toBe(conflictsBefore);
    expect(store.adjudicationQueue().every((item) => item.state === 'conflict')).toBeTrue();
    expect(cellAt(0, 0).adjudication).toBe('accepted'); // 春
  });

  it('人工编辑音义字段即收回所有权并撤回该位置裁决', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 3);
    store.selectCell(0, 3);
    store.setMark({ tone: '平' });
    const jue = cellAt(0, 3);
    expect(jue.mark.provenance?.owner).toBe('manual');
    expect(jue.adjudication).toBe('conflict');
    expect(store.adjudicationQueue().some((item) => item.line === 0 && item.position === 3)).toBeTrue();
  });

  it('同包同版本重复导入是幂等的，不产生新历史与重复进度', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    const historyCount = store.packHistory().length;
    const importedAt = store.currentPack()?.importedAt;
    store.importSamplePack(SAMPLE_PACK_V1);
    expect(store.packHistory().length).toBe(historyCount);
    expect(store.currentPack()?.importedAt).toBe(importedAt);
  });

  it('导入失败保留上一包与裁决进度，可修正后重试', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 3);
    const packVersion = store.currentPack()?.version;
    const pendingBefore = store.pendingCount();
    store.importPackText('{损坏的 JSON');
    expect(store.packError()).toContain('导入失败');
    expect(store.currentPack()?.version).toBe(packVersion);
    expect(store.pendingCount()).toBe(pendingBefore);
    expect(cellAt(0, 3).adjudication).toBe('accepted');
    // 修正后重试成功
    store.importSamplePack(SAMPLE_PACK_V2);
    expect(store.currentPack()?.version).toBe('v2');
    expect(store.packError()).toBe('');
  });

  it('包更新后：未确认冲突仍在队列，已确认且候选未变保持确认', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 0); // 春（v1 采纳）
    store.importSamplePack(SAMPLE_PACK_V2);
    expect(cellAt(0, 0).adjudication).toBe('accepted');
    // 声未确认，仍退回重核（保持冲突在队列中）
    expect(store.adjudicationQueue().some((item) => item.line === 2 && item.position === 4)).toBeTrue();
  });

  it('包更新后：依据旧包确认而新候选已变，判定保留并标为旧依据', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 3); // 觉：v1 仄声
    expect(cellAt(0, 3).mark.tone).toBe('仄');
    store.importSamplePack(SAMPLE_PACK_V2); // v2 觉改平声
    const jue = cellAt(0, 3);
    expect(jue.adjudication).toBe('stale');
    expect(jue.mark.tone).toBe('仄'); // 判定不自动覆盖
    expect(jue.mark.provenance?.owner).toBe('rhyme-pack');
    expect(jue.priorCandidate?.rhyme).toContain('入声三觉');
    expect(store.staleCount()).toBe(1);
    expect(store.adjudicationQueue().some((item) => item.line === 0 && item.position === 3)).toBeFalse();
    // 复核后可改用新候选
    store.acceptCandidate(0, 3);
    expect(cellAt(0, 3).mark.tone).toBe('平');
    expect(cellAt(0, 3).adjudication).toBe('accepted');
  });

  it('送回裁决后当前判定按人工保留，位置重新出现在队列', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.keepManual(0, 4);
    expect(cellAt(0, 4).adjudication).toBe('kept-manual');
    store.reopenAdjudication(0, 4);
    expect(cellAt(0, 4).adjudication).toBe('conflict');
    expect(cellAt(0, 4).actual).toBe('平');
  });

  it('撤销把校勘稿与韵谱包状态一起回滚（含包更新）', () => {
    store.importSamplePack(SAMPLE_PACK_V1);
    store.acceptCandidate(0, 3);
    store.importSamplePack(SAMPLE_PACK_V2);
    expect(store.currentPack()?.version).toBe('v2');
    expect(store.packHistory()[0]?.version).toBe('v1');
    store.undo();
    expect(store.currentPack()?.version).toBe('v1');
    expect(store.packHistory().length).toBe(0);
    expect(cellAt(0, 3).adjudication).toBe('accepted');
  });
});

describe('PoetryStoreService 旧数据升级', () => {
  beforeEach(() => localStorage.clear());

  it('升级前的现有判定一律视为人工确认', () => {
    const oldWorkspace = {
      title: '旧稿',
      author: '佚名',
      templateId: 'wuyan-zeqi',
      activeVersionId: 'v',
      updatedAt: new Date().toISOString(),
      versions: [{
        id: 'v',
        name: '旧版本',
        source: '旧底本',
        createdAt: new Date().toISOString(),
        text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
        marks: {
          '0:4': { tone: '平', rhyme: 'A', pauseAfter: false, basis: '旧签注依据', note: '韵脚' },
        },
        antithesisPairs: [],
      }],
    };
    localStorage.setItem('sologsb-1015-poetry-workspace-v1', JSON.stringify(oldWorkspace));
    TestBed.resetTestingModule();
    const store = TestBed.inject(PoetryStoreService);
    const mark = store.analysis()[0].cells[4].mark;
    expect(mark.provenance?.owner).toBe('manual');
    expect(store.workspace().schemaVersion).toBe(2);
  });
});
