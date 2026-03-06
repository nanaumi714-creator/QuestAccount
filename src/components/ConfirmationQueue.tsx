import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, CheckCircle2, ChevronRight, AlertCircle, Zap } from 'lucide-react';

export default function ConfirmationQueue({ onConfirm }: { onConfirm: () => void }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifyingId, setClassifyingId] = useState<number | null>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions?status=unconfirmed');
      const data = await res.json();
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoClassify = async (id: number) => {
    setClassifyingId(id);
    try {
      const res = await fetch(`/api/transactions/${id}/auto-classify`, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        setTransactions(prev => prev.map(t => 
          t.id === id ? { 
            ...t, 
            household_category: data.household_category,
            business_category: data.business_category,
            purpose: data.purpose,
            confidence: data.confidence
          } : t
        ));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setClassifyingId(null);
    }
  };

  const handleConfirm = async (id: number, tx: any) => {
    try {
      const res = await fetch(`/api/transactions/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_category: tx.household_category || '未分類',
          business_category: tx.business_category,
          purpose: tx.purpose || 'personal',
          memo: tx.memo,
          save_rule: true // Automatically save rule on confirm
        })
      });

      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== id));
        onConfirm();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const updateTransaction = (id: number, field: string, value: any) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">未確認の取引はありません</h2>
        <p className="text-slate-500 max-w-md">
          素晴らしい！すべての取引の確認が完了しています。
          新しい取引が追加されるまで、ゆっくりお休みください。
        </p>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">確認キュー</h2>
          <p className="text-slate-500 mt-2">
            未確認の取引が <span className="font-bold text-indigo-600">{transactions.length}件</span> あります
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-medium hover:bg-indigo-100 transition-colors">
          <Check className="w-4 h-4" />
          すべて確認済みにする
        </button>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {transactions.map((tx) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md"
            >
              <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                {/* Mobile Header: Store & Amount */}
                <div className="flex justify-between items-start md:hidden mb-1">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="text-base font-bold text-slate-900 truncate">{tx.store_name}</div>
                    <div className="text-xs text-slate-500 mt-1">{tx.date}</div>
                  </div>
                  <div className={`text-lg font-bold flex-shrink-0 ${tx.direction === 'expense' ? 'text-slate-900' : 'text-emerald-600'}`}>
                    {tx.direction === 'expense' ? '-' : '+'}{tx.amount.toLocaleString()}円
                  </div>
                </div>

                {/* Desktop: Date & Amount */}
                <div className="hidden md:block w-32 flex-shrink-0">
                  <div className="text-sm text-slate-500 font-medium mb-1">{tx.date}</div>
                  <div className={`text-xl font-bold ${tx.direction === 'expense' ? 'text-slate-900' : 'text-emerald-600'}`}>
                    {tx.direction === 'expense' ? '-' : '+'}{tx.amount.toLocaleString()}円
                  </div>
                </div>

                {/* Desktop: Store Name */}
                <div className="hidden md:block flex-1 min-w-0">
                  <div className="text-lg font-bold text-slate-900 truncate">{tx.store_name}</div>
                  <div className="text-sm text-slate-500 truncate mt-1">
                    {tx.normalized_store_name !== tx.store_name && `正規化: ${tx.normalized_store_name}`}
                  </div>
                </div>

                {/* Classification Controls */}
                <div className="flex flex-row gap-2 md:gap-3 md:flex-1">
                  <div className="flex-1">
                    <select
                      value={tx.purpose || 'personal'}
                      onChange={(e) => updateTransaction(tx.id, 'purpose', e.target.value)}
                      className="w-full text-sm px-3 py-2.5 md:py-2 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                    >
                      <option value="personal">個人用</option>
                      <option value="business">事業用</option>
                      <option value="mixed">共通（按分）</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="カテゴリ"
                      value={tx.purpose === 'personal' ? (tx.household_category || '') : (tx.business_category || '')}
                      onChange={(e) => updateTransaction(tx.id, tx.purpose === 'personal' ? 'household_category' : 'business_category', e.target.value)}
                      className="w-full text-sm px-3 py-2.5 md:py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-1 md:mt-0">
                  <button
                    onClick={() => handleAutoClassify(tx.id)}
                    disabled={classifyingId === tx.id}
                    className="p-2.5 md:p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors disabled:opacity-50"
                    title="AIで自動分類"
                  >
                    {classifyingId === tx.id ? (
                      <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleConfirm(tx.id, tx)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm shadow-indigo-200"
                  >
                    確認
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* AI Confidence Indicator */}
              {tx.confidence && (
                <div className="px-5 py-2 bg-indigo-50/50 border-t border-indigo-100 flex items-center gap-2 text-xs font-medium text-indigo-700">
                  <Zap className="w-3.5 h-3.5" />
                  AI推論: 信頼度 {Math.round(tx.confidence * 100)}%
                  {tx.confidence < 0.85 && (
                    <span className="text-amber-600 flex items-center gap-1 ml-2">
                      <AlertCircle className="w-3.5 h-3.5" />
                      要確認
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
