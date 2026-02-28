/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useImperativeHandle } from 'react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useSetting } from '@renderer/hooks/useSetting';
import {
  Form,
  FormControl,
  FormDescription,
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

const formSchema = z.object({
  language: z.enum(['en', 'zh']),
  maxLoopCount: z.number().min(25).max(200),
  loopIntervalInMs: z.number().min(0).max(3000),
});

export interface ChatSettingsRef {
  submit: () => Promise<z.infer<typeof formSchema>>;
}

interface ChatSettingsProps {
  ref?: React.RefObject<ChatSettingsRef | null>;
  autoSave?: boolean;
}

export function ChatSettings({ ref, autoSave = false }: ChatSettingsProps) {
  const { settings, updateSetting } = useSetting();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      language: undefined,
      maxLoopCount: 0,
      loopIntervalInMs: 1000,
    },
  });

  const [newLanguage, newCount, newInterval] = form.watch([
    'language',
    'maxLoopCount',
    'loopIntervalInMs',
  ]);

  useEffect(() => {
    if (Object.keys(settings).length) {
      form.reset({
        language: settings.language,
        maxLoopCount: settings.maxLoopCount,
        loopIntervalInMs: settings.loopIntervalInMs,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    if (!autoSave) return;
    if (!Object.keys(settings).length) return;
    if (newLanguage === undefined && newCount === 0 && newInterval === 1000) {
      return;
    }

    const validAndSave = async () => {
      if (newLanguage !== settings.language) {
        updateSetting({ ...settings, language: newLanguage });
      }
      const isLoopValid = await form.trigger('maxLoopCount');
      if (isLoopValid && newCount !== settings.maxLoopCount) {
        updateSetting({ ...settings, maxLoopCount: newCount });
      }
      const isIntervalValid = await form.trigger('loopIntervalInMs');
      if (isIntervalValid && newInterval !== settings.loopIntervalInMs) {
        updateSetting({ ...settings, loopIntervalInMs: newInterval });
      }
    };

    validAndSave();
  }, [
    autoSave,
    newLanguage,
    newCount,
    newInterval,
    settings,
    updateSetting,
    form,
  ]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    updateSetting({ ...settings, ...values });
    toast.success('Chat settings saved');
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

  return (
    <Form {...form}>
      <form className="space-y-5">
        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Language
              </FormLabel>
              <FormDescription className="text-xs">
                Language used in LLM conversations
              </FormDescription>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="maxLoopCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Max Loops
                </FormLabel>
                <FormDescription className="text-xs">
                  25 – 200
                </FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    value={field.value === 0 ? '' : field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
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
                <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Loop Interval
                </FormLabel>
                <FormDescription className="text-xs">
                  0 – 3000 ms
                </FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="1000"
                    {...field}
                    value={field.value === 0 ? '' : field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
