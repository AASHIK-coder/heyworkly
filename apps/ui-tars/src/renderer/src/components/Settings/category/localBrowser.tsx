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
import { SearchEngineForSettings } from '@/main/store/types';

import googleIcon from '@resources/icons/google-color.svg?url';
import bingIcon from '@resources/icons/bing-color.svg?url';
import baiduIcon from '@resources/icons/baidu-color.svg?url';

const formSchema = z.object({
  searchEngineForBrowser: z.nativeEnum(SearchEngineForSettings),
});

export interface LocalBrowserSettingsRef {
  submit: () => Promise<z.infer<typeof formSchema>>;
}

interface LocalBrowserSettingsProps {
  ref?: React.RefObject<LocalBrowserSettingsRef | null>;
  autoSave?: boolean;
}

export function LocalBrowserSettings({
  ref,
  autoSave = false,
}: LocalBrowserSettingsProps) {
  const { settings, updateSetting } = useSetting();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      searchEngineForBrowser: undefined,
    },
  });

  const [newSearchEngine] = form.watch(['searchEngineForBrowser']);

  useEffect(() => {
    if (Object.keys(settings).length) {
      form.reset({
        searchEngineForBrowser: settings.searchEngineForBrowser,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    if (!autoSave) return;
    if (!Object.keys(settings).length) return;
    if (newSearchEngine === undefined) return;

    const validAndSave = async () => {
      if (newSearchEngine !== settings.searchEngineForBrowser) {
        updateSetting({
          ...settings,
          searchEngineForBrowser: newSearchEngine,
        });
      }
    };

    validAndSave();
  }, [autoSave, newSearchEngine, settings, updateSetting, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    updateSetting({ ...settings, ...values });
    toast.success('Operator settings saved');
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
          name="searchEngineForBrowser"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Default Search Engine
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select search engine" />
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
                      <img src={bingIcon} alt="Bing" className="w-4 h-4" />
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
      </form>
    </Form>
  );
}
