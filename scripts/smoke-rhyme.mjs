/**
 * 无浏览器环境下对韵谱包数据所有权语义的冒烟验证。
 * 运行：node scripts/smoke-rhyme.mjs
 * （先由 esbuild 把 TS 服务层编译到 scripts/.smoke-out/）
 */
import { PoetryStoreService } from './.smoke-out/poetry-store.service.js';
import { SAMPLE_RHYME_PACKAGE_V1, SAMPLE_RHYME_PACKAGE_V2 } from './.smoke-out/rhyme-package.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';

// 1. 旧数据升级：既有判定视为人工确认
console.log('旧数据升级');
localStorage.setItem(
  STORAGE_KEY,
  JSON.stringify({
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
  }),
);
let svc = new PoetryStoreService();
let mark = svc.activeVersion().marks['0:4'];
check('既有判定标记为人工确认', mark.judgment?.source === 'manual');
check('带迁移标记', mark.judgment?.migrated === true);
check('原有依据保留', mark.basis === '旧依据');
check('schema 升级到 v2', svc.workspace().schemaVersion === 2);

// 2. 包只提供候选，不覆盖人工判定
console.log('候选与人工判定分离');
localStorage.clear();
svc = new PoetryStoreService();
svc.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
check('包已导入', svc.rhymePackage()?.id === 'sample-pingshui');
check('产生待决候选', svc.pendingAdjudications().length > 0);
mark = svc.activeVersion().marks['0:4'];
check('人工判定未被覆盖（晓仍为平）', mark.tone === '平');
check('人工依据未被覆盖', mark.basis === '《平水韵》上声十七筱');
const xiaoItem = svc.pendingAdjudications().find((i) => i.char === '晓');
check('冲突项留在裁决队列', xiaoItem?.conflict === true && xiaoItem?.candidate.tone === '仄');

// 3. 确认后才写入校勘稿
console.log('确认写入');
svc.acceptCandidate(xiaoItem);
mark = svc.activeVersion().marks['0:4'];
check('确认后写入候选值', mark.tone === '仄');
check('记录包来源与版本', mark.judgment?.source === 'package' && mark.judgment?.packageVersion === '2026.06');
check('确认后离开待决队列', !svc.pendingAdjudications().some((i) => i.char === '晓'));

// 4. 拒绝与退回重核
console.log('拒绝与退回重核');
const niaoItem = svc.pendingAdjudications().find((i) => i.char === '鸟');
svc.rejectCandidate(niaoItem);
check('拒绝不写入', svc.activeVersion().marks['1:4'].tone === '平');
check('拒绝留痕', svc.decidedAdjudications().find((i) => i.char === '鸟')?.status === 'rejected');
svc.reopenAdjudication(svc.decidedAdjudications().find((i) => i.char === '鸟'));
check('退回重核后回到待决', svc.pendingAdjudications().some((i) => i.char === '鸟'));
svc.rejectCandidate(svc.pendingAdjudications().find((i) => i.char === '鸟'));

// 5. 导入失败：保留上一包与进度；重试同版本幂等
console.log('导入失败与幂等重试');
const resolutionsBefore = svc.workspace().rhyme.resolutions.length;
svc.importRhymePackage('{ 这不是合法 JSON');
check('失败报告落盘', svc.lastImport()?.status === 'error');
check('上一包保留', svc.rhymePackage()?.version === '2026.06');
check('裁决进度保留', svc.workspace().rhyme.resolutions.length === resolutionsBefore);
check('已确认内容保留', svc.activeVersion().marks['0:4'].tone === '仄');
svc.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V1));
check('同版本重复导入幂等', svc.lastImport()?.status === 'duplicate');
check('进度未被重置', svc.workspace().rhyme.resolutions.length === resolutionsBefore);

// 6. 包更新：未确认退回重核，已确认保留并标旧依据
console.log('包更新语义');
svc.importRhymePackage(JSON.stringify(SAMPLE_RHYME_PACKAGE_V2));
mark = svc.activeVersion().marks['0:4'];
check('已确认内容保留（晓仍为仄）', mark.tone === '仄');
check('判定仍属旧版包', mark.judgment?.packageVersion === '2026.06');
check('标出旧依据', mark.judgment?.staleBasis === true);
check('进入旧依据清单', svc.staleConfirmations().some((i) => i.char === '晓'));
check('未确认位置退回重核（鸟）', svc.pendingAdjudications().some((i) => i.char === '鸟'));
check('人工判定不受包更新影响', svc.activeVersion().marks['0:2'].judgment?.source === 'manual');

// 7. 旧依据复核
console.log('旧依据复核');
const stale = svc.staleConfirmations().find((i) => i.char === '晓');
svc.resolveStale(stale, 'adopt');
mark = svc.activeVersion().marks['0:4'];
check('采用新候选后依据更新', mark.judgment?.packageVersion === '2026.10' && mark.judgment?.staleBasis === false);
check('旧依据清单清空', svc.staleConfirmations().length === 0);

// 8. 人工改动转回人工所有权
console.log('人工再判定');
svc.selectCell(0, 4);
svc.setMark({ tone: '平' });
mark = svc.activeVersion().marks['0:4'];
check('人工改动后归人工所有', mark.judgment?.source === 'manual');
check('与包候选重新形成待决冲突', svc.pendingAdjudications().some((i) => i.char === '晓' && i.conflict));

console.log(`\n${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
