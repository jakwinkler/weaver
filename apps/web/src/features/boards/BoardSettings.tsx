import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { BoardConfig, BoardSwimlaneField } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BoardStatusOption {
  id: string;
  name: string;
}

interface BoardSettingsProps {
  config: BoardConfig;
  statuses: BoardStatusOption[];
  canConfigure: boolean;
  isSaving: boolean;
  hasError?: boolean;
  onConfigChange: (config: BoardConfig) => void | Promise<void>;
}

const GROUPING_OPTIONS: { value: BoardSwimlaneField; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'epic', label: 'Epic' },
];

export function BoardSettings({
  config,
  statuses,
  canConfigure,
  isSaving,
  hasError = false,
  onConfigChange,
}: BoardSettingsProps) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({});
  const swimlaneField = config.swimlaneField ?? 'none';

  const handleLimitsOpenChange = (open: boolean) => {
    if (open) {
      setDraftLimits(
        Object.fromEntries(
          statuses.map((status) => [status.id, String(config.wipLimits?.[status.id] ?? '')]),
        ),
      );
    }
    setLimitsOpen(open);
  };

  const handleGroupingChange = (value: BoardSwimlaneField) => {
    void onConfigChange({ ...config, swimlaneField: value });
  };

  const handleSaveLimits = async () => {
    const wipLimits: Record<string, number> = {};
    for (const status of statuses) {
      const value = Number(draftLimits[status.id]);
      if (Number.isInteger(value) && value > 0) {
        wipLimits[status.id] = value;
      }
    }
    await onConfigChange({ ...config, wipLimits });
    setLimitsOpen(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="board-grouping" className="text-xs text-muted-foreground">
          Group by
        </Label>
        <Select
          value={swimlaneField}
          onValueChange={(value) => handleGroupingChange(value as BoardSwimlaneField)}
          disabled={!canConfigure || isSaving}
        >
          <SelectTrigger id="board-grouping" aria-label="Group by" className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Configure WIP limits"
        disabled={!canConfigure || isSaving}
        onClick={() => handleLimitsOpenChange(true)}
      >
        <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
        WIP limits
      </Button>

      {hasError && (
        <p role="alert" className="basis-full text-sm text-destructive">
          Board settings could not be saved.
        </p>
      )}

      <Dialog open={limitsOpen} onOpenChange={handleLimitsOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WIP limits</DialogTitle>
            <DialogDescription>
              Set a soft issue limit for each status. Leave a value blank for no limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {statuses.map((status) => (
              <div key={status.id} className="grid grid-cols-[1fr_7rem] items-center gap-4">
                <Label htmlFor={`wip-limit-${status.id}`}>{status.name}</Label>
                <Input
                  id={`wip-limit-${status.id}`}
                  aria-label={`${status.name} limit`}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={draftLimits[status.id] ?? ''}
                  onChange={(event) =>
                    setDraftLimits((current) => ({
                      ...current,
                      [status.id]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLimitsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void handleSaveLimits()}>
              {isSaving ? 'Saving...' : 'Save limits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
