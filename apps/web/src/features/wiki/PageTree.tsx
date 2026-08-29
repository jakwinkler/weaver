import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PageTreeNode } from '@weaver/shared';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  GripVertical,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FlatNode {
  node: PageTreeNode;
  depth: number;
}

interface PageTreeProps {
  nodes: PageTreeNode[];
  selectedSlug?: string | null;
  canCreate: boolean;
  canMove: boolean;
  moving: boolean;
  onSelect: (slug: string) => void;
  onCreate: (parentId: string | null) => void;
  onMove: (slug: string, update: { parentId: string | null; sortOrder: number }) => Promise<void>;
}

function flattenTree(
  nodes: PageTreeNode[],
  collapsed: Set<string>,
  depth = 0,
): FlatNode[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(collapsed.has(node.id) ? [] : flattenTree(node.children, collapsed, depth + 1)),
  ]);
}

function findNode(nodes: PageTreeNode[], id: string): PageTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

function SortablePageRow({
  item,
  selected,
  collapsed,
  canCreate,
  canMove,
  onSelect,
  onToggle,
  onCreate,
}: {
  item: FlatNode;
  selected: boolean;
  collapsed: boolean;
  canCreate: boolean;
  canMove: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onCreate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.node.id,
    disabled: !canMove,
    data: item,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex min-h-9 items-center border-y border-transparent pr-1 text-sm',
        selected && 'border-border bg-background font-medium text-foreground',
        !selected && 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        isDragging && 'z-10 bg-background opacity-70 shadow-lg',
      )}
      role="treeitem"
      aria-current={selected ? 'page' : undefined}
      aria-level={item.depth + 1}
      aria-expanded={item.node.children.length > 0 ? !collapsed : undefined}
    >
      <div
        className="flex min-w-0 flex-1 items-center"
        style={{ paddingLeft: `${item.depth * 16 + 6}px` }}
      >
        {item.node.children.length > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            className="mr-0.5 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={collapsed ? 'Expand page' : 'Collapse page'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.node.children.length > 0 ? (
            <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
          ) : (
            <FileText className="mr-2 h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{item.node.title}</span>
        </button>
      </div>

      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="p-1 text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label={`Create a child page under ${item.node.title}`}
          title="New child page"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {canMove && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none p-1 text-muted-foreground opacity-0 focus:opacity-100 active:cursor-grabbing group-hover:opacity-100"
          aria-label={`Move ${item.node.title}`}
          title="Drag vertically to reorder. Drag right to nest or left to unnest."
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function PageTree({
  nodes,
  selectedSlug,
  canCreate,
  canMove,
  moving,
  onSelect,
  onCreate,
  onMove,
}: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const flatNodes = useMemo(() => flattenTree(nodes, collapsed), [collapsed, nodes]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;

    const activeIndex = flatNodes.findIndex(({ node }) => node.id === active.id);
    const overIndex = flatNodes.findIndex(({ node }) => node.id === over.id);
    const activeNode = flatNodes[activeIndex]?.node;
    const overNode = flatNodes[overIndex]?.node;
    if (!activeNode || !overNode) return;

    let parentId = overNode.parentId;
    let sortOrder = overNode.sortOrder + (activeIndex < overIndex ? 500 : -500);

    if (delta.x > 28) {
      parentId = overNode.id;
      const lastChild = [...overNode.children].sort((a, b) => b.sortOrder - a.sortOrder)[0];
      sortOrder = lastChild ? lastChild.sortOrder + 1000 : 0;
    } else if (delta.x < -28 && activeNode.parentId) {
      const currentParent = findNode(nodes, activeNode.parentId);
      parentId = currentParent?.parentId ?? null;
      sortOrder = currentParent ? currentParent.sortOrder + 500 : overNode.sortOrder + 500;
    }

    await onMove(activeNode.slug, { parentId, sortOrder });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pages</h2>
        {canCreate && (
          <Button variant="ghost" size="sm" onClick={() => onCreate(null)} disabled={moving}>
            <Plus />
            New page
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Wiki pages">
        {nodes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No pages yet.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void dragEnd(event)}>
            <SortableContext items={flatNodes.map(({ node }) => node.id)} strategy={verticalListSortingStrategy}>
              {flatNodes.map((item) => (
                <SortablePageRow
                  key={item.node.id}
                  item={item}
                  selected={item.node.slug === selectedSlug}
                  collapsed={collapsed.has(item.node.id)}
                  canCreate={canCreate}
                  canMove={canMove && !moving}
                  onSelect={() => onSelect(item.node.slug)}
                  onToggle={() => toggle(item.node.id)}
                  onCreate={() => onCreate(item.node.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
