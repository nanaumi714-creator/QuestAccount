import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, Download, Camera, CheckCircle2, AlertCircle } from 'lucide-react';

type ImportSummary = {
  parsed: number;
  failed: number;
  added: number;
  skipped: number;
};

const DATE_KEYS = ['date', '日付', '取引日', '利用日'];
const AMOUNT_KEYS = ['amount', '金額', '利用金額', '支払金額'];
const STORE_KEYS = ['store_name', '店舗名', '利用店名', '内容', '摘要', '支払先'];

type CsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current.trim());
  return result;
}

function isLikelyHeader(cols: string[]): boolean {
  const normalized = cols.map((c) => c.trim().toLowerCase());
  const keySet = new Set([...DATE_KEYS, ...AMOUNT_KEYS, ...STORE_KEYS].map((k) => k.toLowerCase()));
  return normalized.some((cell) => keySet.has(cell));
}

function parseCsvRows(csvText: string): { rows: CsvRow[]; hasHeader: boolean } {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], hasHeader: false };

  const firstCols = parseCsvLine(lines[0]);
  const hasHeader = isLikelyHeader(firstCols);

  if (hasHeader) {
    const headers = firstCols;
    return {
      hasHeader: true,
      rows: lines.slice(1).map((line) => {
        const cols = parseCsvLine(line);
        const row: CsvRow = {};
        headers.forEach((header, idx) => {
          row[header] = cols[idx] ?? '';
        });
        return row;
      }),
    };
  }

  return {
    hasHeader: false,
    rows: lines.map((line) => {
      const cols = parseCsvLine(line);
      const row: CsvRow = {};
      cols.forEach((value, idx) => {
        row[`col_${idx}`] = value;
      });
      return row;
    }),
  };
}

function findValue(row: CsvRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function findValueWithoutHeader(row: CsvRow, type: 'date' | 'amount' | 'store'): string {
  const values = Object.values(row).map((v) => v.trim()).filter(Boolean);

  if (type === 'date') {
    return values.find((v) => /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(v)) || '';
  }
  if (type === 'amount') {
    return values.find((v) => /^-?[¥\d,\s]+$/.test(v) && /\d/.test(v)) || '';
  }
  return values.find((v) => !/^[-?¥\d,\s/]+$/.test(v) && v.length > 1) || '';
}

function normalizeDate(dateText: string): string {
  return dateText.replace(/\//g, '-');
}

function normalizeAmount(amountText: string): number | null {
  const normalized = amountText.replace(/[¥,\s]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount !== 0 ? Math.abs(Math.round(amount)) : null;
}

export default function Integration({ onAdd }: { onAdd: (exp: number) => void }) {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await processCSV(text);
    };
    reader.readAsText(file);
  };

  const processCSV = async (csvText: string) => {
    setCsvLoading(true);
    setMessage(null);

    try {
      const { rows, hasHeader } = parseCsvRows(csvText);

      let parsed = 0;
      let failed = 0;
      const transactions = rows
        .map((row) => {
          const dateRaw = hasHeader ? findValue(row, DATE_KEYS) : findValueWithoutHeader(row, 'date');
          const amountRaw = hasHeader ? findValue(row, AMOUNT_KEYS) : findValueWithoutHeader(row, 'amount');
          const storeName = hasHeader ? findValue(row, STORE_KEYS) : findValueWithoutHeader(row, 'store');

          if (!dateRaw || !amountRaw || !storeName) {
            failed++;
            return null;
          }

          const amountNumeric = normalizeAmount(amountRaw);
          if (amountNumeric === null) {
            failed++;
            return null;
          }

          parsed++;
          return {
            date: normalizeDate(dateRaw),
            amount: amountNumeric,
            store_name: storeName,
            direction: amountRaw.trim().startsWith('-') ? 'income' : 'expense',
            source: 'csv',
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (transactions.length === 0) {
        setMessage({ type: 'error', text: 'CSVから取引データを抽出できませんでした。フォーマットを確認してください。' });
        return;
      }

      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: 'インポート中にエラーが発生しました。' });
        return;
      }

      const summary: ImportSummary = {
        parsed,
        failed,
        added: data.added ?? 0,
        skipped: data.skipped ?? 0,
      };
      setMessage({
        type: 'success',
        text: `取込完了: 解析 ${summary.parsed}件 / 登録 ${summary.added}件 / 重複スキップ ${summary.skipped}件 / 失敗 ${summary.failed}件`,
      });
      onAdd(summary.added * 2);
    } catch (error) {
      setMessage({ type: 'error', text: 'インポート中にエラーが発生しました。' });
    } finally {
      setCsvLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      await processOCR(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const processOCR = async (imageBase64: string, mimeType: string) => {
    setOcrLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await res.json();

      if (res.ok && data.date && data.amount && data.store_name) {
        const addRes = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            source: 'ocr',
          }),
        });
        if (addRes.ok) {
          setMessage({ type: 'success', text: `レシートを読み取りました: ${data.store_name} (${data.amount}円)` });
          onAdd(10);
        }
      } else {
        setMessage({ type: 'error', text: 'レシートの読み取りに失敗しました。画像が不鮮明な可能性があります。' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'OCR処理中にエラーが発生しました。' });
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">外部連携・入出力</h2>
        <p className="text-slate-500 mt-2">CSVインポート、レシートOCR、確定申告用データのエクスポート</p>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">CSV一括インポート</h3>
          <p className="text-slate-500 text-sm mb-6">
            クレジットカードや銀行の明細CSVをアップロードします。日付、金額、店舗名を自動抽出して未確認キューに追加します。
          </p>
          <label className="relative flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 hover:border-indigo-400 transition-colors cursor-pointer group">
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={csvLoading} />
            <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-indigo-600">
              {csvLoading ? (
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  <span className="font-medium">CSVファイルを選択</span>
                </>
              )}
            </div>
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">レシートOCR (AI読取)</h3>
          <p className="text-slate-500 text-sm mb-6">
            レシートの画像をアップロードすると、Gemini AIが内容を解析し、自動的に取引データとして登録します。
          </p>
          <label className="relative flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 hover:border-emerald-400 transition-colors cursor-pointer group">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={ocrLoading} />
            <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-emerald-600">
              {ocrLoading ? (
                <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              ) : (
                <>
                  <Camera className="w-6 h-6" />
                  <span className="font-medium">カメラで撮影 / 画像を選択</span>
                </>
              )}
            </div>
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6 md:col-span-2">
          <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-4">
            <Download className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">確定申告用データ出力</h3>
          <p className="text-slate-500 text-sm mb-6">
            確認済みの「事業用」「共通（按分）」取引を、会計ソフト（freee / マネーフォワード等）にインポートできる形式でダウンロードします。
          </p>
          <button
            onClick={() => window.open('/api/export/freee', '_blank')}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
          >
            <Download className="w-5 h-5" />
            freee形式でCSVダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
