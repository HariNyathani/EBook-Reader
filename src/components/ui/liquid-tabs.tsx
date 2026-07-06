'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface Tab {
  id: string;
  label: string;
}

interface LiquidTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function LiquidTabs({ tabs, activeTab, onChange, className }: LiquidTabsProps) {
  return (
    <div className={cn('flex items-center space-x-1 rounded-full p-1 glass-inset', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-1.5 text-sm font-semibold transition-colors outline-none rounded-full cursor-pointer',
            activeTab === tab.id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900',
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="active-tab-indicator"
              className="absolute inset-0 z-0 rounded-full bg-white/90 shadow-[0_2px_8px_rgba(31,38,135,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/80"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
