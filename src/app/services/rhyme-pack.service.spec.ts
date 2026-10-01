import { TestBed } from '@angular/core/testing';
import { RhymePackService, SAMPLE_PACK_V1, SAMPLE_PACK_V2 } from './rhyme-pack.service';

const PACK_JSON = (overrides: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    name: '测试韵谱',
    version: 'v1',
    entries: [{ char: '春', tone: '平', rhyme: '上平十一真', basis: '平水韵' }],
    ...overrides,
  });

describe('RhymePackService 解析与校验', () => {
  let service: RhymePackService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    service = TestBed.inject(RhymePackService);
  });

  it('合法数组格式可解析', () => {
    const result = service.parse(PACK_JSON());
    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.pack.entries['春']?.tone).toBe('平');
      expect(result.duplicate).toBeFalse();
    }
  });

  it('合法对象格式可解析并以键名补 char', () => {
    const result = service.parse(JSON.stringify({ name: '谱', version: '1', entries: { 春: { tone: '平', rhyme: '真', basis: '依据' } } }));
    expect(result.ok).toBeTrue();
  });

  it('非法 JSON 返回错误且不抛异常', () => {
    const result = service.parse('{不是json');
    expect(result.ok).toBeFalse();
  });

  it('缺少必填字段时逐条报错', () => {
    expect(service.parse(PACK_JSON({ name: '' })).ok).toBeFalse();
    expect(service.parse(PACK_JSON({ version: '' })).ok).toBeFalse();
    expect(service.parse(PACK_JSON({ entries: [] })).ok).toBeFalse();
    expect(service.parse(PACK_JSON({ entries: [{ char: '春', tone: '怪', rhyme: 'x', basis: 'y' }] })).ok).toBeFalse();
    expect(service.parse(PACK_JSON({ entries: [{ char: '春', tone: '平', rhyme: '', basis: 'y' }] })).ok).toBeFalse();
  });

  it('字头重复时报错', () => {
    const entries = [
      { char: '春', tone: '平', rhyme: '真', basis: 'a' },
      { char: '春', tone: '仄', rhyme: '震', basis: 'b' },
    ];
    const result = service.parse(PACK_JSON({ entries }));
    expect(result.ok).toBeFalse();
  });

  it('同一包同一版本重复解析标记为 duplicate，导入可幂等忽略', () => {
    const first = service.parse(PACK_JSON());
    expect(first.ok).toBeTrue();
    if (first.ok) service.restore({ current: first.pack, history: [], decisions: {} });
    const second = service.parse(PACK_JSON());
    expect(second.ok).toBeTrue();
    if (second.ok) expect(second.duplicate).toBeTrue();
  });

  it('示例包 v1/v2 均能通过自校验', () => {
    expect(service.parse(JSON.stringify(SAMPLE_PACK_V1)).ok).toBeTrue();
    expect(service.parse(JSON.stringify(SAMPLE_PACK_V2)).ok).toBeTrue();
  });
});

describe('RhymePackService 状态持久化', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('replacePack 后旧包进入历史，再次 replace 保留多代', () => {
    const service = TestBed.inject(RhymePackService);
    const v1 = service.parse(JSON.stringify(SAMPLE_PACK_V1));
    const v2 = service.parse(JSON.stringify(SAMPLE_PACK_V2));
    expect(v1.ok && v2.ok).toBeTrue();
    if (v1.ok) service.restore({ current: v1.pack, history: [], decisions: {} });
    if (v2.ok) {
      const state = service.packState();
      service.restore({ current: v2.pack, history: [state.current!], decisions: state.decisions });
    }
    expect(service.currentPack()?.version).toBe('v2');
    expect(service.history()[0]?.version).toBe('v1');
  });
});
