import { useState, useMemo, useCallback, useRef } from 'react';
import { useComments } from '@/api/hooks-phase2';
import { useActivity } from '@/api/hooks-phase2';
import {
  useTimeEntries,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  getAttachmentUrl,
} from '@/api/hooks-phase3';
import { useProjectPlugins, useHasPermission } from '@/api';
import { CommentsSection } from './CommentsSection';
import { ActivityLog, ActivityEntryRow, ActionIcon } from './ActivityLog';
import { TimeTrackingSection, TimeEntryIcon, formatTime } from './TimeTrackingSection';
import { normalizeCommentBody } from './RichTextEditor';
import { RichTextRenderer } from '@/components/RichTextRenderer';
import {
  Trash2,
  MessageSquare,
  FileText,
  Layers,
  Paperclip,
  Upload,
  Download,
  FileIcon,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

interface IssueActivityTabsProps {
  issueKey: string;
}

type Tab = 'comments' | 'logs' | 'all' | 'attachments';

type TimelineItem =
  | { type: 'comment'; data: any; date: string | Date }
  | { type: 'activity'; data: any; date: string | Date }
  | { type: 'time_entry'; data: any; date: string | Date };

export function IssueActivityTabs({ issueKey }: IssueActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('comments');
  const { data: attachments } = useAttachments(issueKey);

  const projectKey = issueKey.split('-')[0];
  const { data: projectPlugins } = useProjectPlugins(projectKey);
  const timeTrackingEnabled =
    !projectPlugins || projectPlugins.some((p) => p.pluginId === '@weaver/plugin-time-tracking');

  const allTabs: {
    key: Tab;
    label: string;
    icon: React.ReactNode;
    count?: number;
    hidden?: boolean;
  }[] = [
    { key: 'comments', label: 'Comments', icon: <MessageSquare className="h-4 w-4" /> },
    {
      key: 'logs',
      label: 'Logs',
      icon: <FileText className="h-4 w-4" />,
      hidden: !timeTrackingEnabled,
    },
    { key: 'all', label: 'All', icon: <Layers className="h-4 w-4" /> },
    {
      key: 'attachments',
      label: 'Attachments',
      icon: <Paperclip className="h-4 w-4" />,
      count: attachments?.length,
    },
  ];
  const tabs = allTabs.filter((t) => !t.hidden);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* Tab bar */}
      <div className="mb-6 flex border-b border-gray-200">
        {tabs.map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {icon}
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'comments' && <CommentsSection issueKey={issueKey} />}
      {activeTab === 'logs' && timeTrackingEnabled && <LogsTab issueKey={issueKey} />}
      {activeTab === 'all' && (
        <AllTab issueKey={issueKey} includeTimeEntries={timeTrackingEnabled} />
      )}
      {activeTab === 'attachments' && <AttachmentsTab issueKey={issueKey} />}
    </div>
  );
}

function LogsTab({ issueKey }: { issueKey: string }) {
  return (
    <div className="space-y-8">
      <ActivityLog issueKey={issueKey} />
      <TimeTrackingSection issueKey={issueKey} />
    </div>
  );
}

function formatFileSize(bytes: number | string): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

function AttachmentsTab({ issueKey }: { issueKey: string }) {
  const { data: attachments, isLoading } = useAttachments(issueKey);
  const uploadAttachment = useUploadAttachment(issueKey);
  const deleteAttachment = useDeleteAttachment(issueKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const canUpdate = useHasPermission('issues.update');

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of files) {
        uploadAttachment.mutate(file);
      }
    },
    [uploadAttachment],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-gray-500">Loading attachments...</p>;
  }

  return (
    <div>
      {/* Drop zone */}
      {canUpdate && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            isDragging
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className={`mb-2 h-8 w-8 ${isDragging ? 'text-indigo-500' : 'text-gray-400'}`} />
          <p className="text-sm font-medium text-gray-700">
            Drop files here or <span className="text-indigo-600">browse</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">Any file type supported</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
        </div>
      )}

      {uploadAttachment.isPending && <p className="mb-4 text-sm text-indigo-600">Uploading...</p>}

      {/* Attachments list */}
      {(!attachments || attachments.length === 0) && (
        <p className="py-4 text-center text-sm text-gray-400">No attachments yet.</p>
      )}

      <div className="space-y-2">
        {attachments?.map((att) => (
          <div
            key={att.id}
            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {isImageMime(att.mimeType) ? (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
                  <img
                    src={getAttachmentUrl(att.id)}
                    alt={att.filename}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-white">
                  <FileIcon className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{att.filename}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(att.size)} &middot; {new Date(att.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <a
                href={getAttachmentUrl(att.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              {canUpdate && (
                <button
                  onClick={() => deleteAttachment.mutate(att.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllTab({
  issueKey,
  includeTimeEntries = true,
}: {
  issueKey: string;
  includeTimeEntries?: boolean;
}) {
  const { data: comments } = useComments(issueKey);
  const { data: activities } = useActivity(issueKey);
  const { data: timeEntries } = useTimeEntries(issueKey);
  const queryClient = useQueryClient();
  const canDeleteComment = useHasPermission('comments.delete');

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    comments?.forEach((c) => {
      items.push({ type: 'comment', data: c, date: c.createdAt });
    });

    activities?.forEach((a) => {
      if (a.action === 'commented') return;
      items.push({ type: 'activity', data: a, date: a.createdAt });
    });

    if (includeTimeEntries) {
      timeEntries?.forEach((t) => {
        items.push({ type: 'time_entry', data: t, date: t.loggedAt || t.createdAt });
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [comments, activities, timeEntries, includeTimeEntries]);

  const handleDeleteComment = async (commentId: string) => {
    try {
      await apiClient.delete(`/issues/${issueKey}/comments/${commentId}`);
      queryClient.invalidateQueries({ queryKey: ['comments', issueKey] });
    } catch {
      // ignore
    }
  };

  return (
    <div>
      {timeline.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-400">No activity yet.</p>
      )}

      <div className="relative mt-6">
        {timeline.length > 0 && <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />}
        <div className="space-y-4">
          {timeline.map((item) => {
            if (item.type === 'comment') {
              return (
                <div key={`comment-${item.data.id}`} className="relative flex gap-3">
                  <div className="relative z-10 flex-shrink-0">
                    <ActionIcon action="commented" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {item.data.authorDisplayName ?? item.data.authorId.slice(0, 8)}
                        </span>
                        <span className="text-xs text-gray-400">
                          commented {new Date(item.date).toLocaleString()}
                        </span>
                      </div>
                      {canDeleteComment && (
                        <button
                          onClick={() => handleDeleteComment(item.data.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                          title="Delete comment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1">
                      <RichTextRenderer
                        issueKey={issueKey}
                        content={normalizeCommentBody(item.data.body)}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            if (item.type === 'activity') {
              return <ActivityEntryRow key={`activity-${item.data.id}`} entry={item.data} />;
            }

            if (item.type === 'time_entry') {
              return (
                <div key={`time-${item.data.id}`} className="relative flex gap-3">
                  <div className="relative z-10 flex-shrink-0">
                    <TimeEntryIcon />
                  </div>
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm text-gray-900">
                        Logged{' '}
                        <span className="font-medium text-indigo-700">
                          {formatTime(item.data.minutes)}
                        </span>
                        {item.data.description && (
                          <span className="text-gray-600"> — {item.data.description}</span>
                        )}
                      </p>
                      <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                        {new Date(item.date).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}
