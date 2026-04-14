import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { previewURL } from "../api/pdf";

interface Props {
  fileId: string;
  pageIndex: number;
  displayIndex: number;
  selected: boolean;
  rotation: number;
  onToggleSelect: () => void;
  onRotate: (deg: number) => void;
  onEdit: () => void;
}

export function PageThumbnail({
  fileId, pageIndex, displayIndex, selected, rotation, onToggleSelect, onRotate, onEdit,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pageIndex });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`page-card ${selected ? "selected" : ""}`}
    >
      {/* drag handle */}
      <div className="drag-handle" {...attributes} {...listeners}>⠿</div>

      {/* checkbox */}
      <input
        type="checkbox"
        className="page-checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
      />

      {/* thumbnail image */}
      <div className="thumb-wrap">
        <img
          src={previewURL(fileId, pageIndex)}
          alt={`Page ${displayIndex}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>

      <div className="page-label">Page {displayIndex}</div>

      {/* rotate buttons */}
      <div className="rotate-btns">
        <button title="Rotate left" onClick={() => onRotate(-90)}>↺</button>
        <button title="Rotate right" onClick={() => onRotate(90)}>↻</button>
      </div>

      {/* edit button */}
      <button className="edit-btn" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
        Edit page
      </button>
    </div>
  );
}
