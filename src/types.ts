export interface Header {
  text: string;
  index: number;
}

export type DataRow = Record<string, string | number | boolean | null>;

export interface ParsedDataset {
  fileName: string;
  fileSize: number;
  headers: Header[];
  rows: DataRow[];
  uploadedAt: string;
}

export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
}
