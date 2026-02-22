import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useDataStore } from '../store/useDataStore';
import type { DataRow } from '../types';
import { normalizeDisplayText } from '../utils/text';

type DisplayMode = 'percent' | 'count';
type SortType = 'asc' | 'desc';

interface MainRow {
  name: string;
  count: number;
  percent: number;
}

interface MainResult {
  rows: MainRow[];
  base: number;
  mean: number | null;
  maxValue: number;
  totalCountByOption: Record<string, number>;
}

interface CrossResultRow {
  option: string;
  totalCount: number;
  totalPercent: number;
  byCross: Record<string, number>;
  byCrossPercent: Record<string, number>;
}

interface CrossResult {
  rows: CrossResultRow[];
  crossValues: string[];
  crossBase: Record<string, number>;
  mainBase: number;
  maxValue: number;
  meanByCross: Record<string, number>;
  totalMean: number | null;
}

interface CrossBlockConfig {
  id: string;
  crossColumn: string;
  topN: number;
  bulbEnabled: boolean;
}

interface TaskConfig {
  id: string;
  mainColumn: string;
  displayMode: DisplayMode;
  sortType: SortType;
  precision: number;
  customOrder: string[] | null;
  crosses: CrossBlockConfig[];
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitMulti(value: unknown): string[] {
  const text = normalizeDisplayText(value);
  if (!text) return [];
  return [...new Set(text.split(',').map((v) => normalizeDisplayText(v)).filter(Boolean))];
}

function isLikelyNumeric(values: string[]): boolean {
  const sample = values.slice(0, 15);
  if (!sample.length) return false;
  const numeric = sample.filter((v) => Number.isFinite(Number(v))).length;
  return numeric / sample.length >= 0.8;
}

function zTest(p1: number, n1: number, p2: number, n2: number): number {
  const p1Dec = p1 / 100;
  const p2Dec = p2 / 100;
  const pPool = (p1Dec * n1 + p2Dec * n2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (!Number.isFinite(se) || se === 0) return 0;
  return (p1Dec - p2Dec) / se;
}

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

function toSheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\\\/?*\[\]:]/g, '_').slice(0, 28) || 'Sheet';
  let name = base;
  let i = 1;
  while (used.has(name)) {
    name = `${base.slice(0, 26)}_${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}

async function copyAoA(aoa: Array<Array<string | number>>): Promise<void> {
  const text = aoa.map((row) => row.map((cell) => String(cell)).join('\t')).join('\n');
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function buildMainResult(
  rows: DataRow[],
  mainColumn: string,
  displayMode: DisplayMode,
  sortType: SortType,
  customOrder: string[] | null
): MainResult {
  const map = new Map<string, number>();
  let base = 0;

  for (const row of rows) {
    const vals = splitMulti(row[mainColumn]);
    if (!vals.length) continue;
    base += 1;
    for (const v of vals) {
      map.set(v, (map.get(v) ?? 0) + 1);
    }
  }

  let list: MainRow[] = [...map.entries()].map(([name, count]) => ({
    name,
    count,
    percent: base ? (count / base) * 100 : 0,
  }));

  if (customOrder && customOrder.length) {
    const index = new Map(customOrder.map((n, i) => [n, i]));
    list.sort((a, b) => {
      const ai = index.has(a.name) ? (index.get(a.name) as number) : Number.MAX_SAFE_INTEGER;
      const bi = index.has(b.name) ? (index.get(b.name) as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return sortType === 'asc' ? a.count - b.count : b.count - a.count;
    });
  } else {
    list.sort((a, b) => (sortType === 'asc' ? a.count - b.count : b.count - a.count));
  }

  const numeric = isLikelyNumeric(list.map((r) => r.name));
  const mean = numeric && base
    ? list.reduce((acc, r) => acc + Number(r.name) * r.count, 0) / base
    : null;

  const maxValue = displayMode === 'percent'
    ? Math.max(100, ...list.map((r) => r.percent))
    : Math.max(base, ...list.map((r) => r.count));

  const totalCountByOption: Record<string, number> = {};
  list.forEach((r) => {
    totalCountByOption[r.name] = r.count;
  });

  return { rows: list, base, mean, maxValue, totalCountByOption };
}

function buildCrossResult(
  rows: DataRow[],
  mainColumn: string,
  crossColumn: string,
  mainResult: MainResult,
  displayMode: DisplayMode
): CrossResult {
  const mainOptions = mainResult.rows.map((r) => r.name);
  const crossSet = new Set<string>();
  const matrix: Record<string, Record<string, number>> = {};
  const crossBase: Record<string, number> = {};

  for (const opt of mainOptions) matrix[opt] = {};

  let mainBase = 0;
  for (const row of rows) {
    const mainVals = splitMulti(row[mainColumn]);
    if (!mainVals.length) continue;
    mainBase += 1;

    const crossVals = splitMulti(row[crossColumn]);
    const uniqueCross = [...new Set(crossVals)];

    for (const cv of uniqueCross) {
      crossSet.add(cv);
      crossBase[cv] = (crossBase[cv] ?? 0) + 1;
    }

    for (const mv of mainVals) {
      if (!matrix[mv]) continue;
      for (const cv of uniqueCross) {
        matrix[mv][cv] = (matrix[mv][cv] ?? 0) + 1;
      }
    }
  }

  const crossValues = [...crossSet];

  const rowsOut: CrossResultRow[] = mainOptions.map((option) => {
    const totalCount = mainResult.totalCountByOption[option] ?? 0;
    const byCross: Record<string, number> = {};
    const byCrossPercent: Record<string, number> = {};

    for (const cv of crossValues) {
      const c = matrix[option]?.[cv] ?? 0;
      byCross[cv] = c;
      byCrossPercent[cv] = crossBase[cv] ? (c / crossBase[cv]) * 100 : 0;
    }

    return {
      option,
      totalCount,
      totalPercent: mainBase ? (totalCount / mainBase) * 100 : 0,
      byCross,
      byCrossPercent,
    };
  });

  const maxValue = displayMode === 'percent'
    ? Math.max(100, ...rowsOut.flatMap((r) => crossValues.map((cv) => r.byCrossPercent[cv] ?? 0)))
    : Math.max(1, ...rowsOut.flatMap((r) => crossValues.map((cv) => r.byCross[cv] ?? 0)));

  const numeric = isLikelyNumeric(mainOptions);
  const meanByCross: Record<string, number> = {};
  let totalMean: number | null = null;
  if (numeric) {
    const numOpts = mainOptions.map((v) => Number(v));
    for (const cv of crossValues) {
      const base = crossBase[cv] ?? 0;
      if (!base) {
        meanByCross[cv] = 0;
        continue;
      }
      const sum = numOpts.reduce((acc, nv, i) => acc + nv * (rowsOut[i].byCross[cv] ?? 0), 0);
      meanByCross[cv] = sum / base;
    }

    if (mainResult.base) {
      const sum = mainOptions.reduce(
        (acc, opt) => acc + Number(opt) * (mainResult.totalCountByOption[opt] ?? 0),
        0
      );
      totalMean = sum / mainResult.base;
    }
  }

  return { rows: rowsOut, crossValues, crossBase, mainBase, maxValue, meanByCross, totalMean };
}

function defaultTask(headers: string[]): TaskConfig {
  return {
    id: uid('task'),
    mainColumn: '',
    displayMode: 'percent',
    sortType: 'desc',
    precision: 0,
    customOrder: null,
    crosses: [],
  };
}

export default function AnalysisWorkspace() {
  const dataset = useDataStore((s) => s.dataset);
  const filteredRows = useDataStore((s) => s.filteredRows);
  const activeRows = filteredRows ?? dataset?.rows ?? [];
  const headers = dataset?.headers.map((h) => h.text) ?? [];

  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [dragging, setDragging] = useState<{ taskId: string; option: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const markCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 800);
  };

  useEffect(() => {
    if (!headers.length) {
      setTasks([]);
      return;
    }

    setTasks((prev) => {
      if (!prev.length) return [];
      return prev.map((t) => ({
        ...t,
        mainColumn: t.mainColumn && headers.includes(t.mainColumn) ? t.mainColumn : '',
        crosses: t.crosses.map((c) => ({
          ...c,
          crossColumn: c.crossColumn && headers.includes(c.crossColumn) ? c.crossColumn : '',
        })),
      }));
    });
  }, [dataset, headers.join('|')]);

  const updateTask = (taskId: string, patch: Partial<TaskConfig>) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const removeTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const addTask = () => {
    if (!headers.length) return;
    setTasks((prev) => [...prev, defaultTask(headers)]);
  };

  const addCross = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              crosses: [
                ...t.crosses,
                {
                  id: uid('cross'),
                  crossColumn: '',
                  topN: 0,
                  bulbEnabled: false,
                },
              ],
            }
          : t
      )
    );
  };

  const updateCross = (taskId: string, crossId: string, patch: Partial<CrossBlockConfig>) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              crosses: t.crosses.map((c) => (c.id === crossId ? { ...c, ...patch } : c)),
            }
          : t
      )
    );
  };

  const removeCross = (taskId: string, crossId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              crosses: t.crosses.filter((c) => c.id !== crossId),
            }
          : t
      )
    );
  };

  const downloadAll = () => {
    if (!tasks.length || !headers.length) return;
    const defaultName = `snapdata_all_${Date.now()}.xlsx`;
    const fileName = window.prompt('File name', defaultName) || defaultName;

    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    tasks.forEach((task, taskIndex) => {
      const main = buildMainResult(activeRows, task.mainColumn, task.displayMode, task.sortType, task.customOrder);
      const mainAoa: Array<Array<string | number>> = [];
      mainAoa.push([`Task ${taskIndex + 1} - Main - ${task.mainColumn}`]);
      mainAoa.push(['Option', task.displayMode === 'percent' ? '%' : 'Count']);
      mainAoa.push(['Base (n)', main.base]);
      main.rows.forEach((r) => {
        mainAoa.push([r.name, task.displayMode === 'percent' ? Number(r.percent.toFixed(task.precision)) : r.count]);
      });
      if (main.mean !== null) mainAoa.push(['Mean', Number(main.mean.toFixed(2))]);

      const wsMain = XLSX.utils.aoa_to_sheet(mainAoa);
      XLSX.utils.book_append_sheet(wb, wsMain, toSheetName(`T${taskIndex + 1}_Main`, usedNames));

      task.crosses.forEach((cross, crossIndex) => {
        if (!cross.crossColumn || cross.crossColumn === task.mainColumn) return;
        const c = buildCrossResult(activeRows, task.mainColumn, cross.crossColumn, main, task.displayMode);
        const aoa: Array<Array<string | number>> = [];
        aoa.push([`Task ${taskIndex + 1} - Cross ${crossIndex + 1} - ${task.mainColumn} x ${cross.crossColumn}`]);
        aoa.push(['Option', 'Total', ...c.crossValues]);
        aoa.push(['Base (n)', c.mainBase, ...c.crossValues.map((cv) => c.crossBase[cv] ?? 0)]);
        c.rows.forEach((row) => {
          aoa.push([
            row.option,
            task.displayMode === 'percent' ? Number(row.totalPercent.toFixed(task.precision)) : row.totalCount,
            ...c.crossValues.map((cv) =>
              task.displayMode === 'percent'
                ? Number((row.byCrossPercent[cv] ?? 0).toFixed(task.precision))
                : row.byCross[cv] ?? 0
            ),
          ]);
        });
        if (c.totalMean !== null) {
          aoa.push(['Mean', Number(c.totalMean.toFixed(2)), ...c.crossValues.map((cv) => Number((c.meanByCross[cv] ?? 0).toFixed(2)))]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, toSheetName(`T${taskIndex + 1}_C${crossIndex + 1}`, usedNames));
      });
    });

    XLSX.writeFile(wb, fileName);
  };

  if (!dataset) return null;

  return (
    <section style={{ marginBottom: 25 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {tasks.map((task, taskIndex) => {
          const main = buildMainResult(activeRows, task.mainColumn, task.displayMode, task.sortType, task.customOrder);

          const onDropRow = (targetOption: string) => {
            if (!dragging || dragging.taskId !== task.id || dragging.option === targetOption) return;
            const ordered = main.rows.map((r) => r.name);
            const from = ordered.indexOf(dragging.option);
            const to = ordered.indexOf(targetOption);
            if (from < 0 || to < 0) return;
            const next = moveItem(ordered, from, to);
            updateTask(task.id, { customOrder: next });
          };

          const copyMain = async () => {
            const aoa: Array<Array<string | number>> = [];
            aoa.push(['Option', task.displayMode === 'percent' ? '%' : 'Count']);
            aoa.push(['Base (n)', main.base]);
            main.rows.forEach((r) => {
              aoa.push([r.name, task.displayMode === 'percent' ? `${r.percent.toFixed(task.precision)}%` : r.count]);
            });
            if (main.mean !== null) aoa.push(['Mean', main.mean.toFixed(2)]);
            await copyAoA(aoa);
            markCopied(`main_${task.id}`);
          };

          return (
            <div key={task.id} className="task-block">
              <button
                type="button"
                className="ico-round remove-btn"
                onClick={() => removeTask(task.id)}
                title="移除题目"
              >
                ×
              </button>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="analysis-title" style={{ marginBottom: 0 }}>分析题目 {taskIndex + 1}</div>
              </div>

              <div className="header-controls">
                <select
                  value={task.mainColumn}
                  onChange={(e) => updateTask(task.id, { mainColumn: e.target.value, customOrder: null })}
                  className="custom-select"
                  style={{ marginBottom: 10, width: '100%' }}
                >
                  <option value="">选择分析列...</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {task.mainColumn ? (
                <>
                  <div className="header-controls" style={{ marginBottom: 8 }}>
                    <div></div>
                    <div className="header-right-container">
                      <button
                        type="button"
                        onClick={copyMain}
                        className={`btn-copy ${copiedKey === `main_${task.id}` ? 'copied' : ''}`}
                      >
                        <span className="copy-text">复制</span>
                      </button>
                      <div className="display-toggle">
                        <button
                          type="button"
                          className={`toggle-btn ${task.displayMode === 'percent' ? 'active' : ''}`}
                          onClick={() => updateTask(task.id, { displayMode: 'percent' })}
                        >
                          百分比
                        </button>
                        <button
                          type="button"
                          className={`toggle-btn ${task.displayMode === 'count' ? 'active' : ''}`}
                          onClick={() => updateTask(task.id, { displayMode: 'count' })}
                        >
                          频数
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 30 }}></th>
                          <th className="col-name"></th>
                          <th>
                            Total
                            <div className="header-icons">
                              <button
                                type="button"
                                className="ico-round"
                                onClick={() => updateTask(task.id, { sortType: 'asc', customOrder: null })}
                                title="升序"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="ico-round"
                                onClick={() => updateTask(task.id, { sortType: 'desc', customOrder: null })}
                                title="降序"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                className="ico-round"
                                onClick={() => updateTask(task.id, { precision: Math.max(0, task.precision - 1) })}
                                title="减少小数位"
                              >
                                ◀
                              </button>
                              <button
                                type="button"
                                className="ico-round"
                                onClick={() => updateTask(task.id, { precision: Math.min(4, task.precision + 1) })}
                                title="增加小数位"
                              >
                                ▶
                              </button>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ color: 'var(--gray-text)', fontStyle: 'italic' }}>
                          <td className="col-sort">-</td>
                          <td className="col-name" title="Base (n)">Base (n)</td>
                          <td className="base-cell"><span className="value">{main.base}</span></td>
                        </tr>
                        {main.rows.map((row) => {
                          const v = task.displayMode === 'percent' ? row.percent : row.count;
                          const barPct = main.maxValue ? (v / main.maxValue) * 100 : 0;
                          return (
                            <tr
                              key={row.name}
                              className="drag-row"
                              draggable
                              onDragStart={() => setDragging({ taskId: task.id, option: row.name })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => onDropRow(row.name)}
                            >
                              <td style={{ cursor: 'move', color: 'var(--status-muted)' }}>☰</td>
                              <td className="col-name" title={row.name}>{row.name}</td>
                              <td className="bar-cell" style={{ ['--bar-percent' as string]: `${barPct}%` }}>
                                <span className="value">{task.displayMode === 'percent' ? `${row.percent.toFixed(task.precision)}%` : row.count.toLocaleString()}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {main.mean !== null ? (
                          <tr className="mean-row">
                            <td></td>
                            <td className="col-name" title="mean">mean</td>
                            <td className="base-cell"><span className="value">{main.mean.toFixed(2)}</span></td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-state">请选择分析列</div>
              )}

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {task.crosses.map((cross, crossIndex) => {
                  const noMainSelected = !task.mainColumn;
                  const noCrossSelected = !cross.crossColumn;
                  const sameColumn = !!cross.crossColumn && cross.crossColumn === task.mainColumn;
                  const crossResult = noMainSelected || noCrossSelected || sameColumn
                    ? null
                    : buildCrossResult(activeRows, task.mainColumn, cross.crossColumn, main, task.displayMode);

                  const highlightMap: Record<string, Set<string>> = {};
                  if (crossResult && cross.topN > 0) {
                    crossResult.rows.forEach((row) => {
                      const topCols = crossResult.crossValues
                        .map((cv) => ({ cv, v: task.displayMode === 'percent' ? row.byCrossPercent[cv] ?? 0 : row.byCross[cv] ?? 0 }))
                        .sort((a, b) => b.v - a.v)
                        .slice(0, cross.topN)
                        .map((x) => x.cv);
                      highlightMap[row.option] = new Set(topCols);
                    });
                  }

                  const bulbMap: Record<string, string | null> = {};
                  if (crossResult && cross.bulbEnabled) {
                    crossResult.rows.forEach((row) => {
                      const ranking = crossResult.crossValues
                        .map((cv) => ({ cv, p: row.byCrossPercent[cv] ?? 0, n: crossResult.crossBase[cv] ?? 0 }))
                        .sort((a, b) => b.p - a.p);
                      if (ranking.length < 2 || !ranking[0].n || !ranking[1].n) {
                        bulbMap[row.option] = null;
                        return;
                      }
                      const z = zTest(ranking[0].p, ranking[0].n, ranking[1].p, ranking[1].n);
                      bulbMap[row.option] = Math.abs(z) > 1.44 ? ranking[0].cv : null;
                    });
                  }

                  const conclusions = crossResult
                    ? crossResult.rows
                        .map((row) => {
                          const cv = bulbMap[row.option];
                          if (!cv) return null;
                          return `${cv} 在 ${row.option}（${(row.byCrossPercent[cv] ?? 0).toFixed(1)}% / ${row.totalPercent.toFixed(1)}%）显著较高`;
                        })
                        .filter(Boolean) as string[]
                    : [];

                  const copyCross = async () => {
                    if (!crossResult) return;
                    const aoa: Array<Array<string | number>> = [];
                    aoa.push(['Option', 'Total', ...crossResult.crossValues]);
                    aoa.push(['Base (n)', crossResult.mainBase, ...crossResult.crossValues.map((cv) => crossResult.crossBase[cv] ?? 0)]);
                    crossResult.rows.forEach((row) => {
                      aoa.push([
                        row.option,
                        task.displayMode === 'percent' ? `${row.totalPercent.toFixed(task.precision)}%` : row.totalCount,
                        ...crossResult.crossValues.map((cv) =>
                          task.displayMode === 'percent'
                            ? `${(row.byCrossPercent[cv] ?? 0).toFixed(task.precision)}%`
                            : row.byCross[cv] ?? 0
                        ),
                      ]);
                    });
                    if (crossResult.totalMean !== null) {
                      aoa.push(['Mean', crossResult.totalMean.toFixed(2), ...crossResult.crossValues.map((cv) => (crossResult.meanByCross[cv] ?? 0).toFixed(2))]);
                    }
                    await copyAoA(aoa);
                    markCopied(`cross_${cross.id}`);
                  };

                  const copyConclusions = async () => {
                    if (!conclusions.length) return;
                    await copyAoA(conclusions.map((line) => [line]));
                    markCopied(`conclusion_${cross.id}`);
                  };

                  return (
                    <div
                      key={cross.id}
                      style={{
                        position: 'relative',
                        padding: '12px 0 0 0',
                        borderTop: '1px solid var(--muji-border)',
                      }}
                    >
                      <button
                        type="button"
                        className="ico-round remove-btn"
                        style={{ top: 10, right: 0 }}
                        onClick={() => removeCross(task.id, cross.id)}
                        title="移除交叉分析"
                      >
                        ×
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Cross {crossIndex + 1}</div>
                      </div>

                      <div className="header-controls">
                        <select
                          value={cross.crossColumn}
                          onChange={(e) => updateCross(task.id, cross.id, { crossColumn: e.target.value })}
                          className="custom-select"
                          style={{ minWidth: 220, marginBottom: 0, width: 'auto' }}
                        >
                          <option value="">选择交叉列...</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>

                      {(noMainSelected || sameColumn) ? (
                        <div className="empty-state" style={{ color: '#b42318', padding: 10 }}>
                          {noMainSelected
                            ? '请先选择主分析列。'
                            : '主分析列与交叉列不能相同。'}
                        </div>
                      ) : null}

                      {crossResult ? (
                        <>
                          <div className="header-controls" style={{ marginBottom: 8 }}>
                            <div></div>
                            <div className="header-right-container">
                              <button
                                type="button"
                                onClick={copyCross}
                                className={`btn-copy ${copiedKey === `cross_${cross.id}` ? 'copied' : ''}`}
                              >
                                <span className="copy-text">复制</span>
                              </button>
                              <div className="diff-btn-container">
                                <div className="diff-options" style={{ display: cross.topN > 0 || cross.bulbEnabled ? 'flex' : 'none' }}>
                                  <button type="button" className={`diff-option ${cross.topN === 1 ? 'active' : ''}`} onClick={() => updateCross(task.id, cross.id, { topN: 1, bulbEnabled: false })}>1</button>
                                  <button type="button" className={`diff-option ${cross.topN === 2 ? 'active' : ''}`} onClick={() => updateCross(task.id, cross.id, { topN: 2, bulbEnabled: false })}>2</button>
                                  <button type="button" className={`diff-option ${cross.topN === 3 ? 'active' : ''}`} onClick={() => updateCross(task.id, cross.id, { topN: 3, bulbEnabled: false })}>3</button>
                                  <button type="button" className={`bulb-btn ${cross.bulbEnabled ? 'active' : ''}`} onClick={() => updateCross(task.id, cross.id, { bulbEnabled: !cross.bulbEnabled, topN: cross.bulbEnabled ? 1 : 0 })}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M9 18h6" />
                                      <path d="M10 22h4" />
                                      <path d="M12 2a7 7 0 0 0-4 12c.8.6 1.5 1.6 1.7 2.6h4.6c.2-1 .9-2 1.7-2.6A7 7 0 0 0 12 2z" />
                                    </svg>
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className={`diff-toggle ${(cross.topN > 0 || cross.bulbEnabled) ? 'active' : ''}`}
                                  onClick={() => {
                                    if (cross.topN > 0 || cross.bulbEnabled) {
                                      updateCross(task.id, cross.id, { topN: 0, bulbEnabled: false });
                                    } else {
                                      updateCross(task.id, cross.id, { topN: 1, bulbEnabled: false });
                                    }
                                  }}
                                >
                                  <span>差异</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="table-container">
                            <table className="cross-table">
                              <thead>
                                <tr>
                                  <th className="freeze-col" style={{ width: 280 }}></th>
                                  <th className="freeze-col-2" style={{ width: 120 }}>Total</th>
                                  {crossResult.crossValues.map((cv) => (
                                    <th key={cv}>{cv}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ color: 'var(--gray-text)', fontStyle: 'italic' }}>
                                  <td className="freeze-col" title="Base (n)">Base (n)</td>
                                  <td className="freeze-col-2">{crossResult.mainBase}</td>
                                  {crossResult.crossValues.map((cv) => (
                                    <td key={`base_${cv}`} className="base-cell"><span className="value">{crossResult.crossBase[cv] ?? 0}</span></td>
                                  ))}
                                </tr>
                                {crossResult.rows.map((row) => (
                                  <tr key={row.option}>
                                    <td className="freeze-col" title={row.option}>{row.option}</td>
                                    <td className="freeze-col-2">
                                      {task.displayMode === 'percent' ? `${row.totalPercent.toFixed(task.precision)}%` : row.totalCount.toLocaleString()}
                                    </td>
                                    {crossResult.crossValues.map((cv) => {
                                      const rawValue = task.displayMode === 'percent' ? row.byCrossPercent[cv] ?? 0 : row.byCross[cv] ?? 0;
                                      const barPct = crossResult.maxValue ? (rawValue / crossResult.maxValue) * 100 : 0;
                                      const diffOn = highlightMap[row.option]?.has(cv);
                                      const bulbOn = bulbMap[row.option] === cv;
                                      const style = {
                                        ['--bar-percent' as string]: `${barPct}%`,
                                      } as const;
                                      const className = bulbOn
                                        ? 'bar-cell bulb-highlight'
                                        : diffOn
                                          ? 'bar-cell highlight-value'
                                          : 'bar-cell';

                                      return (
                                        <td key={`${row.option}_${cv}`} className={className} style={style}>
                                          <span className="value">{task.displayMode === 'percent'
                                            ? `${(row.byCrossPercent[cv] ?? 0).toFixed(task.precision)}%`
                                            : (row.byCross[cv] ?? 0).toLocaleString()}</span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                                {crossResult.totalMean !== null ? (
                                  <tr className="mean-row">
                                    <td className="freeze-col" title="Mean">Mean</td>
                                    <td className="freeze-col-2">{crossResult.totalMean.toFixed(2)}</td>
                                    {crossResult.crossValues.map((cv) => (
                                      <td key={`mean_${cv}`} className="base-cell"><span className="value">{(crossResult.meanByCross[cv] ?? 0).toFixed(2)}</span></td>
                                    ))}
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>

                          {conclusions.length ? (
                            <div className="smart-conclusion" style={{ display: 'block' }}>
                              <div className="conclusion-header">
                                <div className="conclusion-title">智能结论</div>
                                <div className="conclusion-actions">
                                  <button
                                    type="button"
                                    onClick={copyConclusions}
                                    className={`conclusion-btn ${copiedKey === `conclusion_${cross.id}` ? 'copied' : ''}`}
                                  >
                                    <span className="copy-text">复制</span>
                                  </button>
                                </div>
                              </div>
                              <div className="conclusion-content">
                                {conclusions.map((line) => (
                                  <div key={line} className="conclusion-item">{line}</div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="smart-conclusion" style={{ display: 'block' }}>
                              <div className="conclusion-header">
                                <div className="conclusion-title">智能结论</div>
                                <div className="conclusion-actions">
                                  <button
                                    type="button"
                                    onClick={copyConclusions}
                                    className={`conclusion-btn ${copiedKey === `conclusion_${cross.id}` ? 'copied' : ''}`}
                                  >
                                    <span className="copy-text">复制</span>
                                  </button>
                                </div>
                              </div>
                              <div className="conclusion-content">未发现显著高的数据点。</div>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                  <button type="button" onClick={() => addCross(task.id)} className="btn-base">
                    + 添加交叉分析
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <div className="add-task-block" onClick={addTask}>
          <div className="add-task-content">
            <div className="add-task-icon">+</div>
            <div className="add-task-text">添加分析题目</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24, paddingTop: 20, borderTop: '1px solid var(--muji-border)' }}>
          <button type="button" className="btn-main" onClick={downloadAll}>下载以上所有表格</button>
        </div>
      </div>
    </section>
  );
}
