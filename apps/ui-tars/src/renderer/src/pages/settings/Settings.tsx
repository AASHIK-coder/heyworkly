/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
// /apps/ui-tars/src/renderer/src/pages/settings/index.tsx
import { RefreshCcw, Trash } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { api } from '@renderer/api';
import { SearchEngineForSettings, VLMProviderV2 } from '@main/store/types';
import { useSetting } from '@renderer/hooks/useSetting';
import { Button } from '@renderer/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Input } from '@renderer/components/ui/input';
import { DragArea } from '@renderer/components/Common/drag';
import { BROWSER_OPERATOR } from '@renderer/const';

import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';

import googleIcon from '@resources/icons/google-color.svg?url';
import bingIcon from '@resources/icons/bing-color.svg?url';
import baiduIcon from '@resources/icons/baidu-color.svg?url';
import { REPO_OWNER, REPO_NAME } from '@main/shared/constants';

const formSchema = z.object({
  language: z.enum(['en', 'zh']),
  vlmProvider: z.union([z.nativeEnum(VLMProviderV2), z.string().min(1)], {
    errorMap: () => ({ message: 'Please select a VLM Provider' }),
  }),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
  maxLoopCount: z.number().min(25).max(200),
  loopIntervalInMs: z.number().min(0).max(3000),
  searchEngineForBrowser: z.nativeEnum(SearchEngineForSettings),
});

const PROVIDER_PRESETS: Record<
  string,
  { baseUrl: string; modelPlaceholder: string }
> = {
  [VLMProviderV2.openrouter]: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelPlaceholder: 'e.g. bytedance/ui-tars-1.5-7b',
  },
  [VLMProviderV2.custom]: {
    baseUrl: '',
    modelPlaceholder: 'Enter your model name',
  },
};

const POPULAR_MODELS = [
  // UI-TARS native models
  {
    id: 'bytedance/ui-tars-1.5-7b',
    label: 'UI-TARS 1.5 7B (Default)',
    category: 'ByteDance',
  },
  // Anthropic
  {
    id: 'anthropic/claude-opus-4',
    label: 'Claude Opus 4',
    category: 'Anthropic',
  },
  {
    id: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    category: 'Anthropic',
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    category: 'Anthropic',
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    category: 'Anthropic',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    category: 'Anthropic',
  },
  // OpenAI
  { id: 'openai/gpt-4.1', label: 'GPT-4.1', category: 'OpenAI' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', category: 'OpenAI' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', category: 'OpenAI' },
  { id: 'openai/o4-mini', label: 'o4-mini', category: 'OpenAI' },
  // Google
  {
    id: 'google/gemini-2.5-pro-preview',
    label: 'Gemini 2.5 Pro',
    category: 'Google',
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    label: 'Gemini 2.5 Flash',
    category: 'Google',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    category: 'Google',
  },
  // Qwen
  {
    id: 'qwen/qwen-2.5-vl-72b-instruct',
    label: 'Qwen 2.5 VL 72B',
    category: 'Qwen',
  },
  {
    id: 'qwen/qwen-2.5-vl-7b-instruct',
    label: 'Qwen 2.5 VL 7B',
    category: 'Qwen',
  },
];

const SECTIONS = {
  vlm: 'VLM Settings',
  chat: 'Chat Settings',
  general: 'General',
} as const;

export default function Settings() {
  const { settings, updateSetting, clearSetting } = useSetting();
  const [activeSection, setActiveSection] = useState('vlm');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateDetail, setUpdateDetail] = useState<{
    currentVersion: string;
    version: string;
    link: string | null;
  } | null>();

  const handleCheckForUpdates = async () => {
    setUpdateLoading(true);
    try {
      const detail = await api.checkForUpdatesDetail();
      console.log('detail', detail);

      if (detail.updateInfo) {
        setUpdateDetail({
          currentVersion: detail.currentVersion,
          version: detail.updateInfo.version,
          link: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${detail.updateInfo.version}`,
        });
        return;
      } else if (!detail.isPackaged) {
        toast.info('Unpackaged version does not support update check!');
      } else {
        toast.success('No update available', {
          description: `current version: ${detail.currentVersion} is the latest version`,
          position: 'top-right',
          richColors: true,
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setUpdateLoading(false);
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      language: 'en',
      vlmBaseUrl: '',
      vlmApiKey: '',
      vlmModelName: '',
      maxLoopCount: 100,
      loopIntervalInMs: 1000,
      searchEngineForBrowser: SearchEngineForSettings.GOOGLE,
      ...settings,
    },
  });

  const watchedProvider = form.watch('vlmProvider');

  useEffect(() => {
    if (Object.keys(settings)) {
      form.reset({
        language: settings.language,
        vlmProvider: settings.vlmProvider,
        vlmBaseUrl: settings.vlmBaseUrl,
        vlmApiKey: settings.vlmApiKey,
        vlmModelName: settings.vlmModelName,
        maxLoopCount: settings.maxLoopCount,
        loopIntervalInMs: settings.loopIntervalInMs,
        searchEngineForBrowser: settings.searchEngineForBrowser,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5 },
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (section: string) => {
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth' });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log('onSubmit', values);

    updateSetting(values);
    // toast.success('Settings saved successfully');
    // await api.closeSettingsWindow();
    await api.showMainWindow();
  };

  const onCancel = async () => {
    // await api.closeSettingsWindow();
  };

  const handleClearSettings = async () => {
    try {
      await clearSetting();
      toast.success('All settings cleared successfully');
    } catch (error) {
      toast.error('Failed to clear settings', {
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <DragArea />

      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        <Tabs
          orientation="vertical"
          value={activeSection}
          onValueChange={scrollToSection}
          className="w-34 shrink-0"
        >
          <TabsList className="flex flex-col h-auto bg-transparent p-0">
            {Object.entries(SECTIONS).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="justify-start w-full rounded-none border-0 border-l-4 data-[state=active]:shadow-none data-[state=active]:border-primary mb-1"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ScrollArea className="flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div
                id="vlm"
                ref={(el) => {
                  sectionRefs.current.vlm = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.vlm}</h2>
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>Language</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="zh">中文</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Provider */}
                <FormField
                  control={form.control}
                  name="vlmProvider"
                  render={({ field }) => {
                    const handleProviderChange = (value: string) => {
                      field.onChange(value);
                      const preset = PROVIDER_PRESETS[value];
                      if (preset?.baseUrl) {
                        form.setValue('vlmBaseUrl', preset.baseUrl);
                      }
                    };
                    return (
                      <FormItem>
                        <FormLabel>VLM Provider</FormLabel>
                        <Select
                          onValueChange={handleProviderChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select VLM provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(VLMProviderV2).map((provider) => (
                              <SelectItem key={provider} value={provider}>
                                {provider}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value === VLMProviderV2.openrouter && (
                          <p className="text-xs text-muted-foreground">
                            Use any OpenRouter model. Get your API key at
                            openrouter.ai
                          </p>
                        )}
                        {field.value === VLMProviderV2.custom && (
                          <p className="text-xs text-muted-foreground">
                            Any OpenAI-compatible endpoint (Ollama, LM Studio,
                            vLLM, etc.)
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Base URL */}
                <FormField
                  control={form.control}
                  name="vlmBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM Base URL</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter VLM Base URL" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* VLM API Key */}
                <FormField
                  control={form.control}
                  name="vlmApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM API Key</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter VLM API_Key" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* VLM Model Name */}
                <FormField
                  control={form.control}
                  name="vlmModelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM Model Name</FormLabel>
                      {watchedProvider === VLMProviderV2.openrouter && (
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                          }}
                          value={
                            POPULAR_MODELS.some((m) => m.id === field.value)
                              ? field.value
                              : undefined
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Quick select a popular model..." />
                          </SelectTrigger>
                          <SelectContent>
                            {POPULAR_MODELS.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <span className="text-muted-foreground text-xs mr-1.5">
                                  {model.category}
                                </span>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormControl>
                        <Input placeholder="Enter VLM Model Name" {...field} />
                      </FormControl>
                      {watchedProvider === VLMProviderV2.openrouter && (
                        <p className="text-xs text-muted-foreground">
                          Select a popular model above or type any OpenRouter
                          model ID
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
              {/* Chat Settings */}
              <div
                id="chat"
                ref={(el) => {
                  sectionRefs.current.chat = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.chat}</h2>
                <FormField
                  control={form.control}
                  name="maxLoopCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Loop</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter a number between 25-200"
                          {...field}
                          value={field.value === 0 ? '' : field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loopIntervalInMs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loop Wait Time (ms)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter a number between 0-3000"
                          {...field}
                          value={field.value === 0 ? '' : field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="searchEngineForBrowser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Search engine for {BROWSER_OPERATOR}:
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[124px]">
                            <SelectValue placeholder="Select a search engine" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SearchEngineForSettings.GOOGLE}>
                            <div className="flex items-center gap-2">
                              <img
                                src={googleIcon}
                                alt="Google"
                                className="w-4 h-4"
                              />
                              <span>Google</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BING}>
                            <div className="flex items-center gap-2">
                              <img
                                src={bingIcon}
                                alt="Bing"
                                className="w-4 h-4"
                              />
                              <span>Bing</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BAIDU}>
                            <div className="flex items-center gap-2">
                              <img
                                src={baiduIcon}
                                alt="Baidu"
                                className="w-4 h-4"
                              />
                              <span>Baidu</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div
                id="general"
                ref={(el) => {
                  sectionRefs.current.general = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.general}</h2>
                <Button
                  variant="outline"
                  type="button"
                  disabled={updateLoading}
                  onClick={handleCheckForUpdates}
                >
                  <RefreshCcw
                    className={`h-4 w-4 mr-2 ${updateLoading ? 'animate-spin' : ''}`}
                  />
                  {updateLoading ? 'Checking...' : 'Check Updates'}
                </Button>
                {updateDetail?.version && (
                  <div className="text-sm text-gray-500">
                    {`${updateDetail.currentVersion} -> ${updateDetail.version}(latest)`}
                  </div>
                )}
                {updateDetail?.link && (
                  <div className="text-sm text-gray-500">
                    Release Notes:{' '}
                    <a
                      href={updateDetail.link}
                      target="_blank"
                      className="underline"
                      rel="noreferrer"
                    >
                      {updateDetail.link}
                    </a>
                  </div>
                )}
                <div className="h-50" />
              </div>
            </form>
          </Form>
        </ScrollArea>
      </div>

      <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            type="button"
            className="text-red-400 border-red-400 hover:bg-red-50 hover:text-red-500"
            onClick={handleClearSettings}
          >
            <Trash className="h-4 w-4" />
            Clear
          </Button>
          <div className="flex gap-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" onClick={form.handleSubmit(onSubmit)}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Settings as Component };
