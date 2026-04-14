import { useRef, useState } from "react";

interface Props {
  onUploaded: (fileId: string, pageCount: number, filename: string) => void;
  loading: boolean;
}

export function PDFUploader({ onUploaded, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf") {
      alert("Please select a PDF file.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("http://localhost:8000/api/pdf/upload", { method: "POST", body: form });
    if (!res.ok) { alert("Upload failed"); return; }
    const data = await res.json();
    onUploaded(data.file_id, data.page_count, data.filename);
  };

  return (
    <div
      className={`uploader ${dragging ? "dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="upload-icon">📄</div>
          <p>Drop a PDF here or <strong>click to browse</strong></p>
        </>
      )}
    </div>
  );
}
