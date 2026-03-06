import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Save, Plus, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function ManualInput({ onAdd }: { onAdd: () => void }) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store_name: '',
    direction: 'expense',
    household_category: '',
    business_category: '',
    purpose: 'personal',
    memo: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseInt(formData.amount, 10)
        })
      });
      
      if (res.ok) {
        setSuccess(true);
        onAdd();
        setTimeout(() => {
          setSuccess(false);
          setFormData({
            ...formData,
            amount: '',
            store_name: '',
            memo: ''
          });
        }, 2000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">手動入力</h2>
        <p className="text-slate-500 mt-2">レシートや現金払いの記録を手動で追加します。</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {success ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-emerald-600"
          >
            <CheckCircle2 className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-bold">記録を追加しました！</h3>
            <p className="text-emerald-600/80 mt-2">+5 EXP</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">日付</label>
                <input 
                  type="date" 
                  required
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">金額（円）</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="1500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">店舗名・支払先</label>
              <input 
                type="text" 
                required
                value={formData.store_name}
                onChange={e => setFormData({...formData, store_name: e.target.value})}
                className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="セブンイレブン 渋谷店"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">収支</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, direction: 'expense'})}
                    className={`flex-1 py-3 md:py-2 text-sm font-medium transition-colors ${formData.direction === 'expense' ? 'bg-rose-500 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                  >
                    支出
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, direction: 'income'})}
                    className={`flex-1 py-3 md:py-2 text-sm font-medium transition-colors ${formData.direction === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                  >
                    収入
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">用途</label>
                <select 
                  value={formData.purpose}
                  onChange={e => setFormData({...formData, purpose: e.target.value})}
                  className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white appearance-none"
                >
                  <option value="personal">個人用（家計）</option>
                  <option value="business">事業用（経費）</option>
                  <option value="mixed">共通（按分）</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">家計カテゴリ</label>
                <input 
                  type="text" 
                  value={formData.household_category}
                  onChange={e => setFormData({...formData, household_category: e.target.value})}
                  className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="食費、日用品など"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">事業カテゴリ</label>
                <input 
                  type="text" 
                  value={formData.business_category}
                  onChange={e => setFormData({...formData, business_category: e.target.value})}
                  className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="消耗品費、通信費など"
                  disabled={formData.purpose === 'personal'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 md:mb-2">メモ</label>
              <input 
                type="text" 
                value={formData.memo}
                onChange={e => setFormData({...formData, memo: e.target.value})}
                className="w-full px-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="任意"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-70"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    記録を追加する
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
