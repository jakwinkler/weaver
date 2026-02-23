import { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';

export interface ChecklistItem {
  id: string;
  subject: string;
  is_done: boolean;
  position: number;
}

export interface ChecklistApi {
  list(): Promise<ChecklistItem[]>;
  add(subject: string): Promise<ChecklistItem>;
  update(itemId: string, data: { subject?: string; is_done?: boolean }): Promise<ChecklistItem>;
  remove(itemId: string): Promise<void>;
  reorder(order: string[]): Promise<ChecklistItem[]>;
}

export function useChecklist(api: ChecklistApi) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubject, setNewSubject] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.list();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const doneCount = items.filter((i) => i.is_done).length;
  const totalCount = items.length;
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    try {
      const item = await api.add(newSubject.trim());
      if (item?.id) {
        setItems((prev) => [...prev, item]);
      } else {
        // Refetch if response format is unexpected
        await fetchItems();
      }
      setNewSubject('');
    } catch {
      // ignore
    }
  };

  const handleToggle = async (item: ChecklistItem) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i)),
    );
    try {
      const updated = await api.update(item.id, { is_done: !item.is_done });
      if (updated?.id) {
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      }
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_done: item.is_done } : i)),
      );
    }
  };

  const handleDelete = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await api.remove(itemId);
    } catch {
      await fetchItems();
    }
  };

  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditText(item.subject);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) {
      cancelEdit();
      return;
    }
    const currentEditingId = editingId;
    const trimmed = editText.trim();
    cancelEdit();
    try {
      const updated = await api.update(currentEditingId, { subject: trimmed });
      if (updated?.id) {
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        await fetchItems();
      }
    } catch {
      await fetchItems();
    }
  };

  const handleEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
    try {
      await api.reorder(newItems.map((i) => i.id));
    } catch {
      await fetchItems();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
    try {
      await api.reorder(newItems.map((i) => i.id));
    } catch {
      await fetchItems();
    }
  };

  return {
    items,
    loading,
    newSubject,
    setNewSubject,
    editingId,
    editText,
    setEditText,
    editInputRef,
    doneCount,
    totalCount,
    percent,
    handleAdd,
    handleToggle,
    handleDelete,
    startEdit,
    saveEdit,
    cancelEdit,
    handleEditKeyDown,
    handleMoveUp,
    handleMoveDown,
  };
}
