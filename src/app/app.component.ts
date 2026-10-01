import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import type { CharacterMark } from './models/poem.models';
import { METER_TEMPLATES, PoetryStoreService } from './services/poetry-store.service';
import { SAMPLE_RHYME_PACKAGE_V1, SAMPLE_RHYME_PACKAGE_V2 } from './services/rhyme-package';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    NzAlertModule,
    NzBadgeModule,
    NzButtonModule,
    NzDividerModule,
    NzEmptyModule,
    NzInputModule,
    NzProgressModule,
    NzSelectModule,
    NzSwitchModule,
    NzTabsModule,
    NzTagModule,
    NzToolTipModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly store = inject(PoetryStoreService);
  readonly templates = METER_TEMPLATES;
  readonly mainTabIndex = signal(0);
  readonly selectedCell = computed(() => this.store.selectedCell());
  /** 当前选中字的待决候选（若有） */
  readonly selectedAdjudication = computed(() => {
    const line = this.store.selectedLine();
    const position = this.store.selectedPosition();
    return this.store.pendingAdjudications().find((item) => item.line === line && item.position === position);
  });
  /** 当前选中字的旧依据判定（若有） */
  readonly selectedStale = computed(() => {
    const line = this.store.selectedLine();
    const position = this.store.selectedPosition();
    return this.store.staleConfirmations().find((item) => item.line === line && item.position === position);
  });

  get totalErrors(): number {
    return this.store.issues().filter((issue) => issue.level === 'error').length;
  }

  get totalWarnings(): number {
    return this.store.issues().filter((issue) => issue.level === 'warning').length;
  }

  get checkedRate(): number {
    const cells = this.store.analysis().flatMap((line) => line.cells);
    if (!cells.length) return 0;
    return Math.round((cells.filter((cell) => cell.actual !== '?').length / cells.length) * 100);
  }

  get pendingConflicts(): number {
    return this.store.pendingAdjudications().filter((item) => item.conflict).length;
  }

  get hasNonConflictPending(): boolean {
    return this.store.pendingAdjudications().some((item) => !item.conflict);
  }

  setTone(tone: '平' | '仄' | '中' | '?'): void {
    this.store.setMark({ tone });
  }

  updateSource(source: string): void {
    this.store.setMark({ basis: source });
  }

  updateVersionSource(source: string): void {
    this.store.updateVersionSource(source);
  }

  onPackageFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.store.importRhymePackage(String(reader.result ?? ''));
      input.value = '';
    };
    reader.onerror = () => {
      this.store.toast.set('读取文件失败，未改动现有韵谱包');
      input.value = '';
    };
    reader.readAsText(file);
  }

  loadSamplePackage(version: 1 | 2): void {
    const pack = version === 1 ? SAMPLE_RHYME_PACKAGE_V1 : SAMPLE_RHYME_PACKAGE_V2;
    this.store.importRhymePackage(JSON.stringify(pack));
  }

  acceptSelectedCandidate(): void {
    const item = this.selectedAdjudication();
    if (item) this.store.acceptCandidate(item);
  }

  locateCell(line: number, position: number): void {
    this.store.selectCell(line, position);
    this.mainTabIndex.set(0);
  }

  judgmentLabel(mark: CharacterMark): string {
    const judgment = mark.judgment;
    if (!judgment) return '未确认';
    if (judgment.source === 'manual') return judgment.migrated ? '人工确认 · 旧数据迁移' : '人工确认';
    const pack = this.store.rhymePackage();
    const stale = judgment.staleBasis || judgment.packageId !== pack?.id || judgment.packageVersion !== pack?.version;
    const ref = `韵谱包「${judgment.packageName ?? judgment.packageId}」${judgment.packageVersion}`;
    return stale ? `${ref} · 旧依据` : ref;
  }

  judgmentColor(mark: CharacterMark): string {
    const judgment = mark.judgment;
    if (!judgment) return 'default';
    if (judgment.source === 'manual') return 'success';
    const pack = this.store.rhymePackage();
    const stale = judgment.staleBasis || judgment.packageId !== pack?.id || judgment.packageVersion !== pack?.version;
    return stale ? 'warning' : 'processing';
  }

  trackTemplate(index: number, item: (typeof METER_TEMPLATES)[number]): string {
    return item.id;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const inTextEntry = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.getAttribute('contenteditable') === 'true';
    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.store.redo() : this.store.undo();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.store.redo();
      return;
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.store.toast.set('内容已保存在本机');
      return;
    }
    if (inTextEntry) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const line = this.store.analysis()[this.store.selectedLine()];
      const next = Math.max(0, this.store.selectedPosition() - 1);
      this.store.selectCell(this.store.selectedLine(), Math.min(next, Math.max(0, line?.cells.length - 1)));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const line = this.store.analysis()[this.store.selectedLine()];
      const next = Math.min((line?.cells.length ?? 1) - 1, this.store.selectedPosition() + 1);
      this.store.selectCell(this.store.selectedLine(), next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(0, this.store.selectedLine() - 1);
      const max = Math.max(0, (this.store.analysis()[next]?.cells.length ?? 1) - 1);
      this.store.selectCell(next, Math.min(this.store.selectedPosition(), max));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(this.store.analysis().length - 1, this.store.selectedLine() + 1);
      const max = Math.max(0, (this.store.analysis()[next]?.cells.length ?? 1) - 1);
      this.store.selectCell(next, Math.min(this.store.selectedPosition(), max));
    } else if (event.key === '1') {
      this.setTone('平');
    } else if (event.key === '2') {
      this.setTone('仄');
    } else if (event.key === '3') {
      this.setTone('中');
    } else if (event.key === ' ') {
      event.preventDefault();
      this.store.togglePause();
    } else if (event.key.toLowerCase() === 'r') {
      this.store.cycleRhyme();
    } else if (event.key.toLowerCase() === 'a') {
      this.acceptSelectedCandidate();
    }
  }
}
