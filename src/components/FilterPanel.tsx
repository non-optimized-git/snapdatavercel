import { useMemo } from 'react';
import type { FilterOperator } from '../types';
import { useDataStore } from '../store/useDataStore';

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
];

function uniquePreviewValues(rows: Array<Record<string, unknown>>, column: string): string[] {
  if (!column) return [];
  const set = new Set<string>();
  for (const row of rows) {
    const text = String(row[column] ?? '').trim();
    if (!text) continue;
    set.add(text);
    if (set.size >= 20) break;
  }
  return [...set];
}

export default function FilterPanel() {
  const { dataset, filters, filteredRows, addFilter, updateFilter, removeFilter, applyFilters, clearFilters } =
    useDataStore();

  const statusText = useMemo(() => {
    if (!dataset) return '请先上传数据';
    if (filteredRows === null) return `未筛选（共 ${dataset.rows.length} 行）`;
    return `筛选后：${filteredRows.length} / ${dataset.rows.length} 行`;
  }, [dataset, filteredRows]);

  if (!dataset) return null;

  return (
    <section className="filter-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
        <span className="section-title" style={{ marginBottom: 0 }}>数据筛选</span>
        <button
          type="button"
          onClick={addFilter}
          className="btn-base"
          style={{ height: 28, fontSize: 11, padding: '0 10px' }}
        >
          + 添加筛选条件
        </button>
      </div>

      <div className="space-y-2">
        {filters.map((filter) => {
          const values = uniquePreviewValues(dataset.rows as Array<Record<string, unknown>>, filter.column);
          return (
            <div key={filter.id} className="filter-row" style={{ marginBottom: 10 }}>
              <select
                value={filter.column}
                onChange={(event) => updateFilter(filter.id, { column: event.target.value })}
                className="filter-select"
                style={{ minWidth: 220, flex: 1 }}
              >
                {dataset.headers.map((header) => (
                  <option key={header.text} value={header.text}>
                    {header.text}
                  </option>
                ))}
              </select>

              <select
                value={filter.operator}
                onChange={(event) => updateFilter(filter.id, { operator: event.target.value as FilterOperator })}
                className="filter-select"
                style={{ minWidth: 96, width: 96 }}
              >
                {OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>

              <input
                list={`filter-values-${filter.id}`}
                value={filter.value}
                onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                placeholder="Filter value"
                className="filter-value-combobox"
                style={{ minWidth: 140, flex: 1 }}
              />
              <datalist id={`filter-values-${filter.id}`}>
                {values.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>

              <button
                type="button"
                onClick={() => removeFilter(filter.id)}
                className="ico-round"
                title="移除筛选条件"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="filter-actions">
        <button
          type="button"
          onClick={applyFilters}
          className="btn-base"
        >
          应用筛选
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="btn-base"
        >
          清除筛选
        </button>
        <span className="filter-status">{statusText}</span>
      </div>
    </section>
  );
}
