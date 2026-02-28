/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { StatusEnum } from '@ui-tars/shared/types';

import { toast } from 'sonner';

import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { Button } from '@renderer/components/ui/button';
import { api } from '@renderer/api';

import {
  Play,
  Send,
  Square,
  Loader2,
  Paperclip,
  X,
  FileText,
  ImageIcon,
} from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
import { useSession } from '@renderer/hooks/useSession';

import { Operator } from '@main/store/types';
import { useSetting } from '../../hooks/useSetting';

/** Lightweight metadata for display — no heavy base64 for text files */
interface AttachmentMeta {
  type: 'image' | 'text';
  fileName: string;
  mimeType: string;
  content: string; // base64 for images (preview), empty for text files
}

const ACCEPTED_FILE_TYPES =
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.xls,.csv';

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const ChatInput = ({
  operator,
  sessionId,
  disabled,
  checkBeforeRun,
}: {
  operator: Operator;
  sessionId: string;
  disabled: boolean;
  checkBeforeRun?: () => Promise<boolean>;
}) => {
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();
  const [localInstructions, setLocalInstructions] = useState('');
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { run, stopAgentRuning } = useRunAgent();
  const { getSession, updateSession, chatMessages } = useSession();
  const { settings, updateSetting } = useSetting();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const running = status === StatusEnum.RUNNING;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (status === StatusEnum.INIT) {
      return;
    }
  }, [status]);

  useEffect(() => {
    switch (operator) {
      case Operator.RemoteComputer:
        updateSetting({ ...settings, operator: Operator.RemoteComputer });
        break;
      case Operator.RemoteBrowser:
        updateSetting({ ...settings, operator: Operator.RemoteBrowser });
        break;
      case Operator.LocalComputer:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
      case Operator.LocalBrowser:
        updateSetting({ ...settings, operator: Operator.LocalBrowser });
        break;
      default:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
    }
  }, [operator]);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const validExtensions = ACCEPTED_FILE_TYPES.split(',');
      const validFiles = Array.from(fileList).filter((f) =>
        validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );

      if (validFiles.length === 0) {
        toast.error('No supported files. Accepted: images, PDF, DOCX, Excel, CSV');
        return;
      }
      if (validFiles.length < fileList.length) {
        toast.warning('Some files were skipped (unsupported type)');
      }

      setProcessingFiles(true);
      try {
        const files = await Promise.all(
          validFiles.map(async (f) => ({
            name: f.name,
            base64: await readFileAsBase64(f),
          })),
        );
        // Files are processed AND stored in main process state in one step
        // Only metadata comes back to renderer for display
        const metadata = await api.uploadAndProcessFiles({ files });
        setAttachments((prev) => [...prev, ...(metadata as AttachmentMeta[])]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to process files';
        toast.error(message);
      } finally {
        setProcessingFiles(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    // Also remove from main process state
    api.removeAttachment({ index });
  }, []);

  const getInstantInstructions = () => {
    if (localInstructions?.trim()) {
      return localInstructions;
    }
    if (isCallUser && savedInstructions?.trim()) {
      return savedInstructions;
    }
    return '';
  };

  const startRun = async () => {
    if (checkBeforeRun) {
      const checked = await checkBeforeRun();

      if (!checked) {
        return;
      }
    }

    const instructions = getInstantInstructions();

    let history = chatMessages;

    const session = await getSession(sessionId);
    await updateSession(sessionId, {
      name: instructions,
      meta: {
        ...session!.meta,
        ...(restUserData || {}),
      },
    });

    run(instructions, history, () => {
      setLocalInstructions('');
      setAttachments([]);
    }, attachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    // `enter` to submit
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      getInstantInstructions()
    ) {
      e.preventDefault();

      startRun();
    }
  };

  const isCallUser = useMemo(() => status === StatusEnum.CALL_USER, [status]);

  const lastHumanMessage =
    [...(messages || [])]
      .reverse()
      .find((m) => m?.from === 'human' && m?.value !== IMAGE_PLACEHOLDER)
      ?.value || '';

  const stopRun = async () => {
    await stopAgentRuning(() => {
      setLocalInstructions('');
      setAttachments([]);
    });
    await api.clearHistory();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const renderButton = () => {
    if (running) {
      return (
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={stopRun}
        >
          <Square className="h-4 w-4" />
        </Button>
      );
    }

    if (isCallUser && !localInstructions) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-pink-100 hover:bg-pink-200 text-pink-500 border-pink-200"
                onClick={startRun}
                disabled={!getInstantInstructions()}
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="whitespace-pre-line">
                Send last instructions when you&apos;re done for the
                agent&apos;s &apos;CALL_USER&apos;
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={startRun}
        disabled={!getInstantInstructions() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="px-4 w-full">
      <div className="flex flex-col space-y-4">
        <div
          className={`relative w-full ${dragOver ? 'ring-2 ring-primary rounded-2xl' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Attachment preview bar */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap px-4 pt-3 pb-2 bg-secondary/50 rounded-t-2xl border border-b-0 border-input">
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-background rounded-full px-2.5 py-1 text-xs border"
                >
                  {file.type === 'image' ? (
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate">
                    {file.fileName}
                  </span>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {processingFiles && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            placeholder={
              isCallUser && savedInstructions
                ? `${savedInstructions}`
                : running && lastHumanMessage && messages?.length > 1
                  ? lastHumanMessage
                  : 'What can I do for you today?'
            }
            className={`min-h-[120px] resize-none px-4 pb-16 ${
              attachments.length > 0
                ? 'rounded-t-none rounded-b-2xl'
                : 'rounded-2xl'
            }`}
            value={localInstructions}
            disabled={running || disabled}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
              }
            }}
          />

          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            {processingFiles && !attachments.length && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={running || disabled}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Attach files (images, PDF, DOCX, Excel, CSV)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {renderButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
