import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  PlusCircle, 
  Settings, 
  Trophy,
  Flame,
  Star,
  Link
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import ConfirmationQueue from './components/ConfirmationQueue';
import ManualInput from './components/ManualInput';
import Integration from './components/Integration';

export default function App() {
  const [activeTab, setActiveTab] = useState('queue');
  const [stats, setStats] = useState({ level: 1, exp: 0, streak: 0 });

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        if (data) setStats(data);
      });
  }, []);

  const handleExpGain = (amount: number) => {
    fetch('/api/stats/exp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    })
      .then(res => res.json())
      .then(data => {
        setStats(prev => ({ ...prev, level: data.level, exp: data.exp }));
        if (data.leveledUp) {
          // Trigger level up animation
          alert(`Level Up! You are now level ${data.level}`);
        }
      });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'queue':
        return <ConfirmationQueue onConfirm={() => handleExpGain(10)} />;
      case 'input':
        return <ManualInput onAdd={() => handleExpGain(5)} />;
      case 'integration':
        return <Integration onAdd={(exp) => handleExpGain(exp)} />;
      default:
        return <ConfirmationQueue onConfirm={() => handleExpGain(10)} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <h1 className="text-xl font-bold tracking-tight text-indigo-600 flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          QuestAccount
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center text-orange-500 text-sm font-medium">
            <Flame className="w-4 h-4 mr-1" />
            {stats.streak}
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold border border-indigo-100">
            Lv.{stats.level}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold tracking-tight text-indigo-600 flex items-center gap-2">
            <Trophy className="w-6 h-6" />
            QuestAccount
          </h1>
        </div>
        
        {/* User Stats Widget */}
        <div className="p-4 mx-4 mt-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-indigo-900">Lv.{stats.level}</span>
            <div className="flex items-center text-orange-500 text-sm font-medium">
              <Flame className="w-4 h-4 mr-1" />
              {stats.streak} Day Streak
            </div>
          </div>
          <div className="w-full bg-indigo-200 rounded-full h-2.5">
            <motion.div 
              className="bg-indigo-600 h-2.5 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: `${(stats.exp / (stats.level * 100)) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="text-xs text-indigo-600 mt-1 text-right">
            {stats.exp} / {stats.level * 100} EXP
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavItem 
            icon={<CheckSquare />} 
            label="確認キュー" 
            active={activeTab === 'queue'} 
            onClick={() => setActiveTab('queue')} 
            badge={3} // Mock badge
          />
          <NavItem 
            icon={<LayoutDashboard />} 
            label="ダッシュボード" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<PlusCircle />} 
            label="手動入力" 
            active={activeTab === 'input'} 
            onClick={() => setActiveTab('input')} 
          />
          <NavItem 
            icon={<Link />} 
            label="外部連携" 
            active={activeTab === 'integration'} 
            onClick={() => setActiveTab('integration')} 
          />
          <NavItem 
            icon={<Settings />} 
            label="設定" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-8 pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-5xl mx-auto"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 flex justify-around items-center p-2 pb-safe z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <MobileNavItem 
          icon={<CheckSquare />} 
          label="確認" 
          active={activeTab === 'queue'} 
          onClick={() => setActiveTab('queue')} 
          badge={3}
        />
        <MobileNavItem 
          icon={<LayoutDashboard />} 
          label="分析" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <MobileNavItem 
          icon={<PlusCircle />} 
          label="入力" 
          active={activeTab === 'input'} 
          onClick={() => setActiveTab('input')} 
        />
        <MobileNavItem 
          icon={<Link />} 
          label="連携" 
          active={activeTab === 'integration'} 
          onClick={() => setActiveTab('integration')} 
        />
      </nav>
    </div>
  );
}

function MobileNavItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-16 h-14 relative transition-colors ${
        active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {React.cloneElement(icon, { className: `w-6 h-6 mb-1 transition-transform ${active ? 'scale-110' : ''}` })}
        {badge > 0 && (
          <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
            {badge}
          </span>
        )}
        <span className={`text-[10px] font-medium transition-all ${active ? 'opacity-100 font-bold' : 'opacity-80'}`}>{label}</span>
      </div>
    </button>
  );
}

function NavItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
        active 
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <div className="flex items-center gap-3 font-medium">
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
        {label}
      </div>
      {badge > 0 && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          active ? 'bg-white text-indigo-600' : 'bg-indigo-100 text-indigo-600'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
