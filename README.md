# PDF Editor

A web-based PDF editor with a React frontend and FastAPI backend.

## Features

- Upload PDF files
- Preview pages as thumbnails
- Merge multiple PDFs
- Split PDFs into ranges
- Rotate pages
- Reorder pages
- Delete pages
- Add watermarks
- Edit page content (text elements)
- Download the edited PDF

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type-safe JavaScript |
| Vite | Build tool and dev server |
| PDF.js | In-browser PDF rendering |
| dnd-kit | Drag-and-drop page reordering |

### Backend
| Technology | Purpose |
|------------|---------|
| FastAPI | REST API framework |
| PyMuPDF (fitz) | Page rendering, text extraction, drawing |
| pypdf | PDF read/write, merge, split, rotate |
| pdfplumber | PDF content inspection |
| ReportLab | Watermark generation |
| Pillow | Image processing |
| Uvicorn | ASGI server |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │              React Frontend                  │   │
│  │                                              │   │
│  │  PDFUploader → PageGrid → PageThumbnail      │   │
│  │                 ↓                            │   │
│  │             PageEditor  ←→  Toolbar          │   │
│  │                                              │   │
│  │         api/pdf.ts (fetch calls)             │   │
│  └──────────────────┬───────────────────────────┘   │
└─────────────────────┼───────────────────────────────┘
                      │ HTTP (localhost:5173 → :8000)
┌─────────────────────┼───────────────────────────────┐
│              FastAPI Backend                        │
│                                                     │
│  ┌──────────────────▼───────────────────────────┐   │
│  │          routers/pdf.py (REST API)            │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐   │
│  │        services/pdf_ops.py (core logic)       │   │
│  │                                               │   │
│  │  PyMuPDF ── render, edit, redact, draw        │   │
│  │  pypdf   ── merge, split, rotate, reorder     │   │
│  │  ReportLab── watermark generation             │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │                               │
│              backend/tmp/  (temp PDF files)         │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. User uploads a PDF → backend saves it to `backend/tmp/` and returns a `file_id`
2. Frontend fetches page thumbnails using the `file_id`
3. User performs operations (rotate, merge, edit, etc.) → frontend calls the relevant API endpoint
4. Backend processes the PDF and returns a new `file_id` for the result
5. User downloads the final PDF via the `/download/{file_id}` endpoint

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Poppler](https://poppler.freedesktop.org/) (required by `pdf2image`)
  - macOS: `brew install poppler`
  - Ubuntu: `apt install poppler-utils`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/global-link/pdf-editor.git
   cd pdf-editor
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Install frontend dependencies:
   ```bash
   cd frontend && npm install && cd ..
   ```

### Running the App

```bash
./start.sh
```

This starts both the backend (port 8000) and frontend (port 5173).

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Versioning

This project uses Git tags for versioning. To roll back to a previous version:

```bash
# List all tags
git tag

# Check out a specific version
git checkout v1.0.0
```

To create a new tag:
```bash
git tag -a v1.1.0 -m "Description of this version"
git push origin v1.1.0
```

| Version | Description |
|---------|-------------|
| v1.0.0 | Initial release with rotated PDF support |

## API

The backend API is available at `http://localhost:8000/api/pdf`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload a PDF |
| GET | `/preview/{file_id}/{page}` | Get page thumbnail |
| POST | `/merge` | Merge multiple PDFs |
| POST | `/split` | Split PDF into ranges |
| POST | `/rotate` | Rotate pages |
| POST | `/reorder` | Reorder pages |
| POST | `/delete-pages` | Delete pages |
| POST | `/watermark` | Add a watermark |
| POST | `/apply-edits` | Apply in-page edits |
| GET | `/download/{file_id}` | Download the result |
