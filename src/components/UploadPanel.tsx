import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useDataStore } from '../store/useDataStore';
import type { DataRow, Header, ParsedDataset } from '../types';
import { normalizeDisplayText } from '../utils/text';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isAllowedExcelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeHeaders(rawHeaderRow: unknown[]): Header[] {
  const seen = new Map<string, number>();
  return rawHeaderRow.map((value, index) => {
    const base = normalizeDisplayText(value) || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const text = count === 1 ? base : `${base}_${count}`;
    return { text, index };
  });
}

function toRows(matrix: unknown[][], headers: Header[]): DataRow[] {
  const bodyRows = matrix.slice(1);
  return bodyRows.map((row) => {
    const record: DataRow = {};
    headers.forEach((header, i) => {
      const cell = row[i];
      if (typeof cell === 'number' || typeof cell === 'string' || typeof cell === 'boolean' || cell === null) {
        record[header.text] = cell;
      } else if (cell === undefined) {
        record[header.text] = '';
      } else {
        record[header.text] = String(cell);
      }
    });
    return record;
  });
}

export default function UploadPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { dataset, isParsing, parseError, setDataset, setIsParsing, setParseError, reset } = useDataStore();

  const summary = useMemo(() => {
    if (!dataset) return null;
    return {
      fileName: dataset.fileName,
      fileSize: formatFileSize(dataset.fileSize),
      rowCount: dataset.rows.length,
      columnCount: dataset.headers.length,
      uploadedAt: dataset.uploadedAt,
    };
  }, [dataset]);

  const clearDataset = () => {
    if (!dataset) return;
    const ok = window.confirm('确认删除当前文件并重新上传吗？');
    if (!ok) return;
    reset();
  };

  const parseFile = async (file: File) => {
    if (!isAllowedExcelFile(file.name)) {
      setParseError('Only .xlsx / .xls files are supported.');
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('No worksheet found in this file.');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        defval: '',
      }) as unknown as unknown[][];

      if (!matrix.length) {
        throw new Error('Worksheet is empty.');
      }

      const headers = normalizeHeaders(matrix[0]);
      const rows = toRows(matrix, headers);

      const parsedDataset: ParsedDataset = {
        fileName: file.name,
        fileSize: file.size,
        headers,
        rows,
        uploadedAt: new Date().toLocaleString(),
      };

      setDataset(parsedDataset);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error.';
      setParseError(`Parse failed: ${message}`);
      setDataset(null);
    } finally {
      setIsParsing(false);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await parseFile(file);
    event.target.value = '';
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await parseFile(file);
  };

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="section-title" style={{ marginBottom: 0 }}>数据上传</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`file-box ${dragActive ? 'drag-over' : ''}`}
      >
        {!summary ? (
          <>
            <div className="file-info">点击或拖拽 Excel 文件到此区域</div>
            <div className="drag-hint">支持 .xlsx, .xls 格式</div>
          </>
        ) : null}

        {isParsing ? <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muji-red)' }}>Parsing file...</p> : null}
        {parseError ? <p style={{ marginTop: 8, fontSize: 12, color: '#b42318' }}>{parseError}</p> : null}

        {summary ? (
          <div className="file-summary-line">
            <div className="file-summary-text">
              {summary.fileName} ｜ <span className="red-number">{summary.fileSize}</span> ｜ <span className="red-number">{summary.rowCount}</span>行 ｜ <span className="red-number">{summary.columnCount}</span>列
            </div>
            <button
              type="button"
              className="ico-round file-clear-btn"
              onClick={(e) => { e.stopPropagation(); clearDataset(); }}
              title="删除当前文件"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={onFileChange}
        className="hidden"
      />
    </section>
  );
}
