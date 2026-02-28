import React from 'react';
import { Lock, Globe, ChevronLeft, ChevronRight, RotateCw, Search } from 'lucide-react';

interface BrowserShellProps {
  children: React.ReactNode;
  url?: string;
  isLive?: boolean;
  className?: string;
}

export const BrowserShell: React.FC<BrowserShellProps> = ({
  children,
  url = '',
  isLive = false,
  className = '',
}) => {
  const isSecure = url.startsWith('https://');
  const displayUrl = url || 'about:blank';

  return (
    <div
      className={`flex flex-col bg-white dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/50 shadow-lg h-full ${className}`}
    >
      {/* Tab bar */}
      <div className="bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-850 border-b border-gray-200/60 dark:border-gray-700/40 flex-shrink-0">
        <div className="flex items-center px-3 pt-2.5 pb-0">
          {/* Traffic lights */}
          <div className="flex space-x-2 mr-4">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57] shadow-sm ring-1 ring-black/5" />
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E] shadow-sm ring-1 ring-black/5" />
            <div className="w-3 h-3 rounded-full bg-[#28C840] shadow-sm ring-1 ring-black/5" />
          </div>

          {/* Active tab */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-t-lg px-4 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 border border-b-0 border-gray-200/60 dark:border-gray-600/40 max-w-[200px] relative -mb-px z-10">
            {isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            <Globe size={12} className="text-gray-400 flex-shrink-0" />
            <span className="truncate">{url ? new URL(url).hostname : 'New Tab'}</span>
          </div>
        </div>
      </div>

      {/* Toolbar with URL bar */}
      <div className="bg-white dark:bg-gray-850 border-b border-gray-200/80 dark:border-gray-700/40 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Nav buttons */}
          <div className="flex items-center gap-0.5">
            <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <ChevronRight size={16} />
            </button>
            <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <RotateCw size={14} />
            </button>
          </div>

          {/* URL bar */}
          <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-gray-600/40 hover:border-gray-300 dark:hover:border-gray-500 transition-colors group">
            {isSecure ? (
              <Lock className="mr-2 text-green-600 dark:text-green-400 flex-shrink-0" size={12} />
            ) : (
              <Search className="mr-2 text-gray-400 dark:text-gray-500 flex-shrink-0" size={12} />
            )}
            <span className="truncate flex-1 select-all">{displayUrl}</span>
          </div>
        </div>
      </div>

      {/* Content area — fills remaining space */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 relative overflow-hidden">{children}</div>
    </div>
  );
};
