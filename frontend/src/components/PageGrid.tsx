import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { PageThumbnail } from "./PageThumbnail";

export type PageState = {
  originalIndex: number; // index into the current server-side PDF
  rotation: number;      // local pending rotation (visual only until applied)
}

interface Props {
  fileId: string;
  pages: PageState[];
  selected: Set<number>;
  onPagesChange: (pages: PageState[]) => void;
  onSelectionChange: (sel: Set<number>) => void;
  onRotationChange: (pages: PageState[]) => void;
  onEditPage: (pageIndex: number) => void;
}

export function PageGrid({
  fileId, pages, selected, onPagesChange, onSelectionChange, onRotationChange, onEditPage,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = pages.findIndex((p) => p.originalIndex === active.id);
    const newIdx = pages.findIndex((p) => p.originalIndex === over.id);
    onPagesChange(arrayMove(pages, oldIdx, newIdx));
  };

  const toggleSelect = (origIdx: number) => {
    const next = new Set(selected);
    if (next.has(origIdx)) next.delete(origIdx);
    else next.add(origIdx);
    onSelectionChange(next);
  };

  const rotate = (origIdx: number, deg: number) => {
    onRotationChange(
      pages.map((p) =>
        p.originalIndex === origIdx
          ? { ...p, rotation: (p.rotation + deg + 360) % 360 }
          : p
      )
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.originalIndex)} strategy={rectSortingStrategy}>
        <div className="page-grid">
          {pages.map((p, displayIdx) => (
            <PageThumbnail
              key={p.originalIndex}
              fileId={fileId}
              pageIndex={p.originalIndex}
              displayIndex={displayIdx + 1}
              selected={selected.has(p.originalIndex)}
              rotation={p.rotation}
              onToggleSelect={() => toggleSelect(p.originalIndex)}
              onRotate={(deg) => rotate(p.originalIndex, deg)}
              onEdit={() => onEditPage(p.originalIndex)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
