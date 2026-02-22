import { useCreateTimeEntry } from '@/api';
import { useAuthStore } from '@/stores/auth.store';
import { TimerWidget } from '@weaver/plugin-timer';

interface TimerWidgetSlotProps {
  issueKey: string;
}

export function TimerWidgetSlot({ issueKey }: TimerWidgetSlotProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? 'anonymous';
  const createTimeEntry = useCreateTimeEntry(issueKey);

  const handleLogTime = async (minutes: number, description?: string) => {
    await createTimeEntry.mutateAsync({ minutes, description });
  };

  return (
    <TimerWidget
      issueKey={issueKey}
      userId={userId}
      onLogTime={handleLogTime}
    />
  );
}
