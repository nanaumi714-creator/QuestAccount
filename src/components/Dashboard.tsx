import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Wallet, Activity } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ level: 1, exp: 0, streak: 0 });
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/stats').then(res => res.json()).then(setStats);
    fetch('/api/transactions?status=confirmed').then(res => res.json()).then(setTransactions);
  }, []);

  const totalExpense = transactions
    .filter(t => t.direction === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncome = transactions
    .filter(t => t.direction === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">ダッシュボード</h2>
        <p className="text-slate-500 mt-2">今月の収支とあなたのステータス</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <StatCard 
          title="今月の支出" 
          amount={totalExpense} 
          icon={<TrendingDown className="w-6 h-6 text-rose-500" />} 
          trend="+12%" 
          trendUp={true} 
        />
        <StatCard 
          title="今月の収入" 
          amount={totalIncome} 
          icon={<TrendingUp className="w-6 h-6 text-emerald-500" />} 
          trend="-5%" 
          trendUp={false} 
        />
        <StatCard 
          title="現在の残高" 
          amount={totalIncome - totalExpense} 
          icon={<Wallet className="w-6 h-6 text-indigo-500" />} 
          trend="安定" 
          trendUp={true} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            最近の取引
          </h3>
          <div className="space-y-4">
            {transactions.slice(0, 5).map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    tx.direction === 'expense' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {tx.direction === 'expense' ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{tx.store_name}</div>
                    <div className="text-sm text-slate-500">{tx.date} • {tx.household_category || tx.business_category || '未分類'}</div>
                  </div>
                </div>
                <div className={`font-bold ${tx.direction === 'expense' ? 'text-slate-900' : 'text-emerald-600'}`}>
                  {tx.direction === 'expense' ? '-' : '+'}{tx.amount.toLocaleString()}円
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                確認済みの取引がありません
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-md p-5 md:p-6 text-white">
          <h3 className="text-lg font-bold mb-6 opacity-90">プレイヤーステータス</h3>
          
          <div className="flex items-center justify-center mb-8">
            <div className="relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/20" />
                <motion.circle 
                  cx="64" cy="64" r="60" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={377} 
                  strokeDashoffset={377 - (377 * (stats.exp / (stats.level * 100)))}
                  className="text-white"
                  initial={{ strokeDashoffset: 377 }}
                  animate={{ strokeDashoffset: 377 - (377 * (stats.exp / (stats.level * 100))) }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black">Lv.{stats.level}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1 opacity-80">
                <span>次のレベルまで</span>
                <span>{stats.level * 100 - stats.exp} EXP</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <motion.div 
                  className="bg-white h-2 rounded-full" 
                  initial={{ width: 0 }}
                  animate={{ width: `${(stats.exp / (stats.level * 100)) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/20 flex justify-between items-center">
              <span className="opacity-80">連続確認日数</span>
              <span className="font-bold text-xl flex items-center gap-1">
                <span className="text-orange-300">🔥</span> {stats.streak}日
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, amount, icon, trend, trendUp }: any) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-xl">
          {icon}
        </div>
        <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
          trendUp ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {trend}
        </span>
      </div>
      <h3 className="text-slate-500 font-medium mb-1">{title}</h3>
      <div className="text-3xl font-bold tracking-tight text-slate-900">
        ¥{amount.toLocaleString()}
      </div>
    </motion.div>
  );
}
