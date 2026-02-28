/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState, useImperativeHandle } from 'react';
import { CheckCircle, XCircle, Loader2, EyeOff, Eye } from 'lucide-react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { VLMProviderV2 } from '@main/store/types';
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
import { Input } from '@renderer/components/ui/input';
import { Alert, AlertDescription } from '@renderer/components/ui/alert';
import { cn } from '@renderer/utils';

import { api } from '@/renderer/src/api';

const formSchema = z.object({
  vlmProvider: z.union([z.nativeEnum(VLMProviderV2), z.string().min(1)], {
    errorMap: () => ({ message: 'Please select a VLM Provider' }),
  }),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
});

const PROVIDER_PRESETS: Record<
  string,
  { baseUrl: string; modelPlaceholder: string }
> = {
  [VLMProviderV2.openrouter]: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelPlaceholder: 'e.g. anthropic/claude-sonnet-4.6',
  },
  [VLMProviderV2.custom]: {
    baseUrl: '',
    modelPlaceholder: 'Enter your model name',
  },
};

const POPULAR_MODELS = [
  // UI-TARS native models (use specialized coordinate format)
  {
    id: 'bytedance/ui-tars-1.5-7b',
    label: 'UI-TARS 1.5 7B (Default)',
    category: 'ByteDance',
  },
  // Anthropic (general VLM — use standard coordinate format)
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
  // OpenAI (general VLM)
  { id: 'openai/gpt-4.1', label: 'GPT-4.1', category: 'OpenAI' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', category: 'OpenAI' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', category: 'OpenAI' },
  { id: 'openai/o4-mini', label: 'o4-mini', category: 'OpenAI' },
  // Google (general VLM)
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
  // Qwen (general VLM)
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

export interface VLMSettingsRef {
  submit: () => Promise<z.infer<typeof formSchema>>;
}

interface VLMSettingsProps {
  ref?: React.RefObject<VLMSettingsRef | null>;
  autoSave?: boolean;
  className?: string;
}

export function VLMSettings({
  ref,
  autoSave = false,
  className,
}: VLMSettingsProps) {
  const { settings, updateSetting } = useSetting();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vlmProvider: undefined,
      vlmBaseUrl: '',
      vlmApiKey: '',
      vlmModelName: '',
    },
  });

  useEffect(() => {
    if (Object.keys(settings).length) {
      form.reset({
        vlmProvider: settings.vlmProvider,
        vlmBaseUrl: settings.vlmBaseUrl,
        vlmApiKey: settings.vlmApiKey,
        vlmModelName: settings.vlmModelName,
      });
    }
  }, [settings, form]);

  const [newProvider, newBaseUrl, newApiKey, newModelName] = form.watch([
    'vlmProvider',
    'vlmBaseUrl',
    'vlmApiKey',
    'vlmModelName',
  ]);

  useEffect(() => {
    if (!autoSave) return;
    if (!Object.keys(settings).length) return;
    if (
      newProvider === undefined &&
      newBaseUrl === '' &&
      newApiKey === '' &&
      newModelName === ''
    ) {
      return;
    }

    const validAndSave = async () => {
      if (newProvider !== settings.vlmProvider) {
        updateSetting({ ...settings, vlmProvider: newProvider });
      }
      const isUrlValid = await form.trigger('vlmBaseUrl');
      if (isUrlValid && newBaseUrl !== settings.vlmBaseUrl) {
        updateSetting({ ...settings, vlmBaseUrl: newBaseUrl });
      }
      const isKeyValid = await form.trigger('vlmApiKey');
      if (isKeyValid && newApiKey !== settings.vlmApiKey) {
        updateSetting({ ...settings, vlmApiKey: newApiKey });
      }
      const isNameValid = await form.trigger('vlmModelName');
      if (isNameValid && newModelName !== settings.vlmModelName) {
        updateSetting({ ...settings, vlmModelName: newModelName });
      }
    };

    validAndSave();
  }, [
    autoSave,
    newProvider,
    newBaseUrl,
    newApiKey,
    newModelName,
    settings,
    updateSetting,
    form,
  ]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    updateSetting({ ...settings, ...values });
    toast.success('Settings saved successfully');
  };

  useImperativeHandle(ref, () => ({
    submit: async () => {
      return new Promise<z.infer<typeof formSchema>>((resolve, reject) => {
        form.handleSubmit(
          (values) => {
            onSubmit(values);
            resolve(values);
          },
          (errors) => {
            reject(errors);
          },
        )();
      });
    },
  }));

  const preset = PROVIDER_PRESETS[newProvider];

  return (
    <Form {...form}>
      <form className={cn('space-y-5', className)}>
        {/* Provider */}
        <FormField
          control={form.control}
          name="vlmProvider"
          render={({ field }) => {
            const handleProviderChange = (value: string) => {
              field.onChange(value);
              const p = PROVIDER_PRESETS[value];
              if (p?.baseUrl) {
                form.setValue('vlmBaseUrl', p.baseUrl);
              }
            };
            return (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Provider
                </FormLabel>
                <Select
                  onValueChange={handleProviderChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                  </FormControl>
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
                    Get your API key at{' '}
                    <span className="font-medium">openrouter.ai</span>
                  </p>
                )}
                {field.value === VLMProviderV2.custom && (
                  <p className="text-xs text-muted-foreground">
                    Any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM,
                    etc.)
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Base URL */}
        <FormField
          control={form.control}
          name="vlmBaseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Base URL
              </FormLabel>
              <FormControl>
                <Input placeholder="https://api.example.com/v1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* API Key */}
        <FormField
          control={form.control}
          name="vlmApiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                API Key
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="sk-..."
                    {...field}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-full px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Model Name */}
        <FormField
          control={form.control}
          name="vlmModelName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Model
              </FormLabel>
              {newProvider === VLMProviderV2.openrouter && (
                <Select
                  onValueChange={(value) => field.onChange(value)}
                  value={
                    POPULAR_MODELS.some((m) => m.id === field.value)
                      ? field.value
                      : undefined
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Quick select a model..." />
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
                <Input
                  placeholder={preset?.modelPlaceholder || 'Enter model name'}
                  {...field}
                />
              </FormControl>
              {newProvider === VLMProviderV2.openrouter && (
                <p className="text-xs text-muted-foreground">
                  Pick from the list or type any OpenRouter model ID
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Connection Test */}
        <div className="pt-1">
          <ModelAvailabilityCheck
            modelConfig={{
              baseUrl: newBaseUrl,
              apiKey: newApiKey,
              modelName: newModelName,
            }}
          />
        </div>
      </form>
    </Form>
  );
}

// ── Model Availability Check ──────────────────────────────────────────────

interface ModelAvailabilityCheckProps {
  modelConfig: {
    baseUrl: string;
    apiKey: string;
    modelName: string;
  };
  disabled?: boolean;
  className?: string;
}

type CheckStatus = 'idle' | 'checking' | 'success' | 'error';

interface CheckState {
  status: CheckStatus;
  message?: string;
}

export function ModelAvailabilityCheck({
  modelConfig,
  disabled = false,
  className,
}: ModelAvailabilityCheckProps) {
  const [checkState, setCheckState] = useState<CheckState>({
    status: 'idle',
  });

  const { baseUrl, apiKey, modelName } = modelConfig;
  const isConfigValid = baseUrl && apiKey && modelName;

  const handleCheckModel = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isConfigValid) {
      toast.error('Fill in all fields before testing the connection');
      return;
    }

    setCheckState({ status: 'checking' });

    try {
      const isAvailable = await api.checkModelAvailability(modelConfig);

      if (isAvailable) {
        setCheckState({
          status: 'success',
          message: `${modelName} is available`,
        });
      } else {
        setCheckState({
          status: 'error',
          message: `${modelName} is not responding`,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setCheckState({
        status: 'error',
        message: `Connection failed: ${errorMessage}`,
      });
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCheckModel}
        disabled={
          disabled || checkState.status === 'checking' || !isConfigValid
        }
      >
        {checkState.status === 'checking' ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Testing...
          </>
        ) : (
          'Test Connection'
        )}
      </Button>

      {checkState.status === 'success' && (
        <Alert className="border-green-200 bg-green-50 py-2">
          <CheckCircle className="h-3.5 w-3.5 !text-green-600" />
          <AlertDescription className="text-green-800 text-xs">
            {checkState.message}
          </AlertDescription>
        </Alert>
      )}

      {checkState.status === 'error' && (
        <Alert className="border-red-200 bg-red-50 py-2">
          <XCircle className="h-3.5 w-3.5 !text-red-600" />
          <AlertDescription className="text-red-800 text-xs">
            {checkState.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
