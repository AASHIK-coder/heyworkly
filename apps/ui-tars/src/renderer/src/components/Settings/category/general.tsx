import { useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import { RefreshCcw, ExternalLink } from 'lucide-react';
import { api } from '@/renderer/src/api';
import { toast } from 'sonner';

import { REPO_OWNER, REPO_NAME } from '@main/shared/constants';

export const GeneralSettings = () => {
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
          description: `v${detail.currentVersion} is the latest version`,
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

  return (
    <div className="space-y-5">
      {/* Updates section */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Updates
        </label>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={updateLoading}
            onClick={handleCheckForUpdates}
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 mr-1.5 ${updateLoading ? 'animate-spin' : ''}`}
            />
            {updateLoading ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>

        {updateDetail?.version && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <p className="text-sm font-medium">
              Update available: v{updateDetail.version}
            </p>
            <p className="text-xs text-muted-foreground">
              Current version: v{updateDetail.currentVersion}
            </p>
            {updateDetail.link && (
              <a
                href={updateDetail.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
              >
                View release notes
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
