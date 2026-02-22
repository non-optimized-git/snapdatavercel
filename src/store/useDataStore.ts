import { create } from 'zustand';
import type { DataRow, FilterCondition, ParsedDataset } from '../types';

function normalizeValue(value: unknown): string {
  return String(value ?? '').trim();
}

function toNumber(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function conditionMatches(row: DataRow, condition: FilterCondition): boolean {
  const cell = normalizeValue(row[condition.column]);
  const target = normalizeValue(condition.value);
  const cellLower = cell.toLowerCase();
  const targetLower = target.toLowerCase();

  switch (condition.operator) {
    case '=':
      return cellLower === targetLower;
    case '!=':
      return cellLower !== targetLower;
    case 'contains':
      return cellLower.includes(targetLower);
    case 'not_contains':
      return !cellLower.includes(targetLower);
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const a = toNumber(cell);
      const b = toNumber(target);
      if (a === null || b === null) return false;
      if (condition.operator === '>') return a > b;
      if (condition.operator === '>=') return a >= b;
      if (condition.operator === '<') return a < b;
      return a <= b;
    }
    default:
      return true;
  }
}

function newFilterCondition(defaultColumn = ''): FilterCondition {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    column: defaultColumn,
    operator: '=',
    value: '',
  };
}

interface DataStore {
  dataset: ParsedDataset | null;
  filters: FilterCondition[];
  filteredRows: DataRow[] | null;
  isParsing: boolean;
  parseError: string | null;
  setDataset: (dataset: ParsedDataset | null) => void;
  setIsParsing: (isParsing: boolean) => void;
  setParseError: (parseError: string | null) => void;
  addFilter: () => void;
  updateFilter: (id: string, patch: Partial<FilterCondition>) => void;
  removeFilter: (id: string) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  reset: () => void;
}

export const useDataStore = create<DataStore>((set, get) => ({
  dataset: null,
  filters: [],
  filteredRows: null,
  isParsing: false,
  parseError: null,
  setDataset: (dataset) =>
    set({
      dataset,
      parseError: null,
      filters: dataset?.headers.length ? [newFilterCondition(dataset.headers[0].text)] : [],
      filteredRows: null,
    }),
  setIsParsing: (isParsing) => set({ isParsing }),
  setParseError: (parseError) => set({ parseError }),
  addFilter: () =>
    set((state) => ({
      filters: [...state.filters, newFilterCondition(state.dataset?.headers[0]?.text ?? '')],
    })),
  updateFilter: (id, patch) =>
    set((state) => ({
      filters: state.filters.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  removeFilter: (id) =>
    set((state) => ({
      filters: state.filters.filter((item) => item.id !== id),
    })),
  applyFilters: () => {
    const { dataset, filters } = get();
    if (!dataset) return;

    const activeFilters = filters.filter((f) => f.column && f.value.trim() !== '');
    if (!activeFilters.length) {
      set({ filteredRows: null });
      return;
    }

    const rows = dataset.rows.filter((row) => activeFilters.every((f) => conditionMatches(row, f)));
    set({ filteredRows: rows });
  },
  clearFilters: () =>
    set((state) => ({
      filters: state.dataset?.headers.length ? [newFilterCondition(state.dataset.headers[0].text)] : [],
      filteredRows: null,
    })),
  reset: () =>
    set({
      dataset: null,
      filters: [],
      filteredRows: null,
      isParsing: false,
      parseError: null,
    }),
}));
