import { authedFetch, BASE_URL } from "./client";

const BASE = `${BASE_URL}/api/pdf`;

export interface UploadResult {
  file_id: string;
  page_count: number;
  filename: string;
}

export async function uploadPDF(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await authedFetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// These three return plain URLs used as <img src> or <a href> — no auth header needed.
export function previewURL(file_id: string, page: number) {
  return `${BASE}/preview/${file_id}/${page}`;
}

export const noTextRenderURL = (fileId: string, page: number, scale = 1.8) =>
  `${BASE}/render-notext/${fileId}/${page}?scale=${scale}`;

export function downloadURL(file_id: string) {
  return `${BASE}/download/${file_id}`;
}

export async function mergePDFs(file_ids: string[]): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function reorderPages(file_id: string, order: number[]): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, order }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePages(file_id: string, keep: number[]): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/delete-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, keep }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function rotatePages(
  file_id: string,
  rotations: Record<number, number>
): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, rotations }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addWatermark(
  file_id: string,
  text: string,
  opacity = 0.3,
  font_size = 48
): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/watermark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, text, opacity, font_size }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function splitPDF(
  file_id: string,
  ranges: { start: number; end: number }[]
): Promise<{ file_ids: string[] }> {
  const res = await authedFetch(`${BASE}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, ranges }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface PageElement {
  type: "text";
  x: number; y: number; w: number; h: number;
  text: string; fontSize: number; color: string;
  fromPdf: boolean;
}

export async function getPageElements(
  file_id: string,
  page: number
): Promise<{ elements: PageElement[]; pageWidth: number; pageHeight: number }> {
  const res = await authedFetch(`${BASE}/elements/${file_id}/${page}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function applyEdits(
  file_id: string,
  page_index: number,
  edits: object[]
): Promise<{ file_id: string; page_count: number }> {
  const res = await authedFetch(`${BASE}/apply-edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, page_index, edits }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
