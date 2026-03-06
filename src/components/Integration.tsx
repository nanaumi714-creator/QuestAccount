import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, Download, Camera, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Integration({ onAdd }: { onAdd: (exp: number) => void }) {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

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
      const lines = csvText.split('\n').filter(l => l.trim());
      const parsed = [];
      for (const line of lines) {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const dateCol = cols.find(c => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(c));
        const amountCol = cols.find(c => /^-?\d+$/.test(c) && Math.abs(parseInt(c)) > 0);
        const storeCol = cols.find(c => c !== dateCol && c !== amountCol && isNaN(Number(c)) && c.length > 0);

        if (dateCol && amountCol && storeCol) {
          parsed.push({
            date: dateCol.replace(/\//g, '-'),
            amount: Math.abs(parseInt(amountCol)),
            store_name: storeCol,
            direction: parseInt(amountCol) < 0 ? 'income' : 'expense',
            source: 'csv'
          });
        }
      }

      if (parsed.length === 0) {
        setMessage({ type: 'error', text: 'CSVから取引データを抽出できませんでした。フォーマットを確認してください。' });
        return;
      }

      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: parsed })
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: `${data.added}件の取引をインポートしました（重複スキップ: ${data.skipped}件）` });
        onAdd(data.added * 2); // 2 EXP per imported tx
      }
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
        body: JSON.stringify({ imageBase64, mimeType })
      });
      const data = await res.json();

      if (res.ok && data.date && data.amount && data.store_name) {
        // Add to transactions
        const addRes = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            source: 'ocr'
          })
        });
        if (addRes.ok) {
          setMessage({ type: 'success', text: `レシートを読み取りました: ${data.store_name} (${data.amount}円)` });
          onAdd(10); // 10 EXP for OCR
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
        {/* CSV Import */}
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

        {/* Receipt OCR */}
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

        {/* Export */}
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
