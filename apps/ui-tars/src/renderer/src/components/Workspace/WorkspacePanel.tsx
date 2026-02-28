import React, { useState, useMemo, useEffect } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/tabs';
import { Slider } from '@renderer/components/ui/slider';
import { Button } from '@renderer/components/ui/button';
import {
  SkipBack,
  SkipForward,
  MonitorPlay,
  ListOrdered,
  Radio,
} from 'lucide-react';
import { type ConversationWithSoM } from '@main/shared/types';
import { StatusEnum } from '@ui-tars/shared/types';
import { BrowserView } from './BrowserView';
import { StepsTimeline } from './StepsTimeline';

interface WorkspacePanelProps {
  messages: ConversationWithSoM[];
  selectImgIndex?: number;
  status?: string;
  sessionId?: string;
}

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
  messages,
  selectImgIndex,
  status,
  sessionId,
}) => {
  const [activeTab, setActiveTab] = useState('live');
  const [currentIndex, setCurrentIndex] = useState(0);

  const isRunning = status === StatusEnum.RUNNING;

  // Reset workspace state when session changes (e.g. New Chat)
  useEffect(() => {
    setActiveTab('live');
    setCurrentIndex(0);
  }, [sessionId]);

  const imageEntries = useMemo(() => {
    return messages
      .map((msg, index) => ({
        originalIndex: index,
        imageData: msg.screenshotBase64 || msg.screenshotBase64WithElementMarker,
      }))
      .filter((entry) => entry.imageData);
  }, [messages]);

  // Sync with external selectImgIndex (from chat panel click)
  useEffect(() => {
    if (typeof selectImgIndex === 'number') {
      const targetIndex = imageEntries.findIndex(
        (entry) => entry.originalIndex === selectImgIndex,
      );
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
        setActiveTab('replay');
      }
    }
  }, [selectImgIndex, imageEntries]);

  // Auto-follow latest step in replay
  useEffect(() => {
    if (imageEntries.length > 0) {
      setCurrentIndex(imageEntries.length - 1);
    }
  }, [imageEntries.length]);

  const handleSliderChange = (value: number[]) => {
    setCurrentIndex(value[0]);
  };

  const handlePrevious = () => {
    setCurrentIndex((c) => Math.max(0, c - 1));
  };

  const handleNext = () => {
    setCurrentIndex((c) => Math.min(imageEntries.length - 1, c + 1));
  };

  const handleStepClick = (imageIndex: number) => {
    setCurrentIndex(imageIndex);
    setActiveTab('replay');
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 flex-shrink-0">
        <TabsList>
          <TabsTrigger value="live" className="flex items-center gap-1.5">
            <Radio size={14} />
            Live
            {isRunning && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="replay" className="flex items-center gap-1.5">
            <MonitorPlay size={14} />
            Replay
            {imageEntries.length > 0 && (
              <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-medium tabular-nums">
                {imageEntries.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="steps" className="flex items-center gap-1.5">
            <ListOrdered size={14} />
            Steps
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Live embedded browser — forceMount keeps webview alive across tab switches */}
      <TabsContent
        value="live"
        forceMount
        className={`flex-1 min-h-0 overflow-hidden ${activeTab !== 'live' ? 'hidden' : ''}`}
      >
        <BrowserView
          messages={messages}
          currentIndex={imageEntries.length - 1}
          isRunning={isRunning}
          showLive={true}
          sessionId={sessionId}
        />
      </TabsContent>

      {/* Screenshot replay with navigation */}
      <TabsContent value="replay" className="flex-1 overflow-y-auto">
        <BrowserView
          messages={messages}
          currentIndex={currentIndex}
          isRunning={false}
          showLive={false}
        />

        {/* Navigation controls */}
        {imageEntries.length > 0 && (
          <div className="flex items-center mt-3 gap-1.5 pb-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={imageEntries.length <= 1 || currentIndex === 0}
              className="h-7 w-7"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={imageEntries.length <= 1 || currentIndex === imageEntries.length - 1}
              className="h-7 w-7"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
            <div className="flex-1 px-1">
              <Slider
                value={[currentIndex]}
                min={0}
                max={Math.max(0, imageEntries.length - 1)}
                step={1}
                onValueChange={handleSliderChange}
                disabled={imageEntries.length <= 1}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-right">
              {currentIndex + 1} / {imageEntries.length}
            </span>
          </div>
        )}
      </TabsContent>

      <TabsContent value="steps" className="flex-1">
        <StepsTimeline
          messages={messages}
          currentIndex={currentIndex}
          onStepClick={handleStepClick}
        />
      </TabsContent>
    </Tabs>
  );
};

export default WorkspacePanel;
