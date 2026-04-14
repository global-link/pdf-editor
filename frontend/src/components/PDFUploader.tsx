import { useRef, useState } from "react";
import { uploadPDF } from "../api/pdf";

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
    try {
      const data = await uploadPDF(file);
      onUploaded(data.file_id, data.page_count, data.filename);
    } catch {
      alert("Upload failed");
    }
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
