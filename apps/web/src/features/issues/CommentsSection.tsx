import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import { useComments, useCreateComment } from '@/api/hooks-phase2';
import { useHasPermission } from '@/api';
import { apiClient } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { RichTextEditor, RichTextRenderer, normalizeCommentBody } from './RichTextEditor';
import { isRichTextEmpty } from '@/lib/richText';
import { loadDraft, saveDraft, clearDraft } from './useCommentDraft';
import { UserAvatar } from '@/components/UserAvatar';
import { Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores';

interface CommentsSectionProps {
  issueKey: string;
}

export function CommentsSection({ issueKey }: CommentsSectionProps) {
  const { data: comments, isLoading } = useComments(issueKey);
  const createComment = useCreateComment(issueKey);
  const queryClient = useQueryClient();
  const canCreate = useHasPermission('comments.create');
  const canDelete = useHasPermission('comments.delete');
  const tenantId = useAuthStore((state) => state.tenantId);
  const userId = useAuthStore((state) => state.user?.id);

  const [editorContent, setEditorContent] = useState<Record<string, unknown> | null>(() =>
    loadDraft(issueKey),
  );
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEditorChange = useCallback(
    (json: Record<string, unknown>) => {
      setEditorContent(json);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => saveDraft(issueKey, json), 500);
    },
    [issueKey],
  );

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setEditorContent(loadDraft(issueKey));
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [issueKey, tenantId, userId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editorContent) return;
    await createComment.mutateAsync({ body: editorContent });
    setEditorContent(null);
    clearDraft(issueKey);
  };

  const handleDelete = async (commentId: string) => {
    try {
      await apiClient.delete(`/issues/${issueKey}/comments/${commentId}`);
      queryClient.invalidateQueries({ queryKey: ['comments', issueKey] });
    } catch {
      // ignore
    }
  };

  const isEmptyDoc = isRichTextEmpty(editorContent);

  if (isLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-500">Loading comments...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Add comment form */}
      {canCreate && (
        <form onSubmit={handleSubmit} className="mb-6">
          <RichTextEditor
            key={`${tenantId}:${userId}:${issueKey}`}
            issueKey={issueKey}
            content={editorContent}
            onChange={handleEditorChange}
            placeholder="Add a comment..."
          />
          {createComment.isError && (
            <p className="mt-1 text-sm text-red-600">Failed to add comment.</p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={createComment.isPending || isEmptyDoc}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createComment.isPending ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </form>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {(!comments || comments.length === 0) && (
          <p className="py-4 text-center text-sm text-gray-400">No comments yet.</p>
        )}

        {comments?.map((comment) => (
          <div key={comment.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <UserAvatar
                  user={{
                    displayName: comment.authorDisplayName,
                    email: comment.authorEmail,
                    avatarUrl: comment.authorAvatarUrl ?? undefined,
                  }}
                  size="sm"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {comment.authorDisplayName ?? comment.authorId.slice(0, 8)}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              {canDelete && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                  title="Delete comment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-2">
              <RichTextRenderer content={normalizeCommentBody(comment.body)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
