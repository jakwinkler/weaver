import { useState, useRef, type ChangeEvent } from 'react';
import { Play, Pause, Square, X } from 'lucide-react';
import { useTimerState } from './useTimerState';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface TimerWidgetProps {
  issueKey: string;
  userId: string;
  onLogTime: (minutes: number, description?: string) => Promise<void>;
}

export function TimerWidget({ issueKey, userId, onLogTime }: TimerWidgetProps) {
  const { status, elapsedMs, start, pause, stop } = useTimerState(userId, issueKey);

  const [showDialog, setShowDialog] = useState(false);
  const [description, setDescription] = useState('');
  const stoppedMinutesRef = useRef(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [isLogging, setIsLogging] = useState(false);

  const handleStop = () => {
    const totalMs = stop();
    const minutes = Math.max(1, Math.round(totalMs / 60000));
    stoppedMinutesRef.current = minutes;
    setEditMinutes(minutes);
    setDescription('');
    setShowDialog(true);
  };

  const handleLogTime = async () => {
    setIsLogging(true);
    try {
      await onLogTime(editMinutes, description.trim() || undefined);
      setShowDialog(false);
    } finally {
      setIsLogging(false);
    }
  };

  const handleDiscard = () => {
    setShowDialog(false);
  };

  // @ts-ignore
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Timer
      </h3>

      <div className="mb-3 text-center">
        <span
          className={`font-mono text-2xl font-bold ${status === 'running' ? 'text-green-600' : 'text-gray-900'}`}
        >
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      <div className="flex justify-center gap-2">
        {status === 'idle' && (
          <button
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </button>
        )}

        {status === 'running' && (
          <>
            <button
              onClick={pause}
              className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-600"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </>
        )}

        {status === 'paused' && (
          <>
            <button
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </>
        )}
      </div>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Log Time</h2>
                <p className="text-sm text-gray-500">
                  Record the time spent on {issueKey}
                </p>
              </div>
              <button
                onClick={handleDiscard}
                className="rounded-sm p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="timer-minutes"
                  className="block text-sm font-medium text-gray-700"
                >
                  Minutes
                </label>
                <input
                  id="timer-minutes"
                  type="number"
                  min={1}
                  value={editMinutes}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditMinutes(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="timer-description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description (optional)
                </label>
                <textarea
                  id="timer-description"
                  value={description}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  placeholder="What did you work on?"
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={handleDiscard}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                onClick={handleLogTime}
                disabled={isLogging}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLogging ? 'Logging...' : 'Log Time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
