import { useRef, useState } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { X, Sparkles, MessagesSquare, Cpu, Info } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { cn } from '@renderer/utils';

import { VLMSettings, type VLMSettingsRef } from './category/vlm';
import { ChatSettings, type ChatSettingsRef } from './category/chat';
import {
  LocalBrowserSettings,
  type LocalBrowserSettingsRef,
} from './category/localBrowser';
import { GeneralSettings } from './category/general';

interface GlobalSettingsStore {
  isOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
}

export const useGlobalSettings = create<GlobalSettingsStore>((set) => ({
  isOpen: false,
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
  toggleSettings: () => set((state) => ({ isOpen: !state.isOpen })),
}));

const NAV_ITEMS = [
  {
    id: 'model',
    label: 'Model',
    icon: Sparkles,
    description: 'VLM provider & credentials',
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: MessagesSquare,
    description: 'Language & loop behavior',
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: Cpu,
    description: 'Browser operator defaults',
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    description: 'Updates & version info',
  },
] as const;

type NavId = (typeof NAV_ITEMS)[number]['id'];

export const GlobalSettings = () => {
  const { isOpen, closeSettings } = useGlobalSettings();
  const [activeSection, setActiveSection] = useState<NavId>('model');
  const [isSaving, setIsSaving] = useState(false);

  const vlmRef = useRef<VLMSettingsRef>(null);
  const chatRef = useRef<ChatSettingsRef>(null);
  const operatorRef = useRef<LocalBrowserSettingsRef>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const results = await Promise.allSettled([
        vlmRef.current?.submit(),
        chatRef.current?.submit(),
        operatorRef.current?.submit(),
      ]);

      const hasError = results.some((r) => r.status === 'rejected');
      if (hasError) {
        toast.error('Some settings have validation errors. Please fix them.');
      } else {
        toast.success('Settings saved');
        closeSettings();
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Dialog */}
      <div className="relative z-10 w-[720px] max-w-[90vw] h-[560px] max-h-[85vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            onClick={closeSettings}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: Nav + Content */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <nav className="w-44 border-r border-border py-2 px-2 flex-shrink-0">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-6">
                {activeSection === 'model' && (
                  <SettingsSection
                    title="Model Configuration"
                    description="Configure your Vision Language Model provider, API credentials, and model selection."
                  >
                    <VLMSettings ref={vlmRef} />
                  </SettingsSection>
                )}

                {activeSection === 'agent' && (
                  <SettingsSection
                    title="Agent Configuration"
                    description="Control language preferences and agent loop behavior during task execution."
                  >
                    <ChatSettings ref={chatRef} />
                  </SettingsSection>
                )}

                {activeSection === 'browser' && (
                  <SettingsSection
                    title="Browser Configuration"
                    description="Set defaults for the embedded browser operator."
                  >
                    <LocalBrowserSettings ref={operatorRef} />
                  </SettingsSection>
                )}

                {activeSection === 'about' && (
                  <SettingsSection
                    title="About"
                    description="Application version and update information."
                  >
                    <GeneralSettings />
                  </SettingsSection>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSettings}
                className="px-4"
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="px-5">
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}
