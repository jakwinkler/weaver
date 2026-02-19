import { useState, type FormEvent } from 'react';
import { useComments, useCreateComment } from '@/api/hooks-phase2';
import { apiClient } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

interface CommentsSectionProps {
  issueKey: string;
}

export function CommentsSection({ issueKey }: CommentsSectionProps) {
  const { data: comments, isLoading } = useComments(issueKey);
  const createComment = useCreateComment(issueKey);
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await createComment.mutateAsync({
      body: { text: body.trim() },
    });
    setBody('');
  };

  const handleDelete = async (commentId: string) => {
    try {
      await apiClient.delete(`/issues/${issueKey}/comments/${commentId}`);
      queryClient.invalidateQueries({ queryKey: ['comments', issueKey] });
    } catch {
      // Error handling could be improved with a toast notification
    }
  };

  if (isLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-500">Loading comments...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Comments</h2>

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div>
          <label htmlFor="commentBody" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="commentBody"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {createComment.isError && (
          <p className="mt-1 text-sm text-red-600">Failed to add comment.</p>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={createComment.isPending || !body.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createComment.isPending ? 'Posting...' : 'Comment'}
          </button>
        </div>
      </form>

      {/* Comments list */}
      <div className="space-y-4">
        {(!comments || comments.length === 0) && (
          <p className="py-4 text-center text-sm text-gray-400">No comments yet.</p>
        )}

        {comments?.map((comment) => {
          const bodyText =
            typeof comment.body === 'object' && comment.body !== null
              ? (comment.body as Record<string, unknown>).text ||
                JSON.stringify(comment.body)
              : String(comment.body);

          return (
            <div
              key={comment.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                    {comment.authorId.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {comment.authorId.slice(0, 8)}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                  title="Delete comment"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {String(bodyText)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
