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

**Frontend:** React, TypeScript, Vite  
**Backend:** FastAPI, Python

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
