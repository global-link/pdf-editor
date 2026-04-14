# PDF Editor

A web-based PDF editor with a React frontend and FastAPI backend, with Supabase authentication.

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
- User authentication (email/password + Google OAuth via Supabase)

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type-safe JavaScript |
| Vite | Build tool and dev server |
| PDF.js | In-browser PDF rendering |
| dnd-kit | Drag-and-drop page reordering |
| Supabase JS | Auth client (OIDC-abstracted) |
| React Router | Client-side routing |

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
| PyJWT | JWT verification (HS256 + RS256/JWKS) |
| pydantic-settings | Environment-based config |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │              React Frontend                  │   │
│  │                                              │   │
│  │  AuthProvider (Supabase / OIDC)              │   │
│  │    ↓                                        │   │
│  │  LoginPage / SignupPage                      │   │
│  │    ↓ (authenticated)                        │   │
│  │  EditorShell                                 │   │
│  │    PDFUploader → PageGrid → PageThumbnail    │   │
│  │                 ↓                            │   │
│  │             PageEditor  ←→  Toolbar          │   │
│  │                                              │   │
│  │  api/client.ts (authedFetch + Bearer JWT)    │   │
│  └──────────────────┬───────────────────────────┘   │
└─────────────────────┼───────────────────────────────┘
                      │ HTTP (localhost:5173 → :8000)
┌─────────────────────┼───────────────────────────────┐
│              FastAPI Backend                        │
│                                                     │
│  ┌──────────────────▼───────────────────────────┐   │
│  │     middleware/auth.py (JWT verification)     │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐   │
│  │  routers/pdf.py + routers/auth.py (REST API)  │   │
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
                      │ JWKS key fetch
              ┌───────▼────────┐
              │  Supabase Auth │
              │ (or any OIDC   │
              │  provider)     │
              └────────────────┘
```

### Data Flow

1. User signs in via Supabase → receives a JWT access token
2. Frontend attaches the token as `Authorization: Bearer <token>` on every API request
3. Backend verifies the JWT against Supabase's JWKS endpoint
4. User uploads a PDF → backend saves it to `backend/tmp/` and returns a `file_id`
5. Frontend fetches page thumbnails using the `file_id`
6. User performs operations (rotate, merge, edit, etc.) → frontend calls the relevant API endpoint
7. Backend processes the PDF and returns a new `file_id` for the result
8. User downloads the final PDF via the `/download/{file_id}` endpoint

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
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

### Configuration

**Backend** — copy and fill in `.env`:
```bash
cp .env.example .env
```

```dotenv
# For Supabase with ECC/RS256 signing keys (default for new projects):
OIDC_JWKS_URI=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
OIDC_ISSUER=https://<project-ref>.supabase.co/auth/v1
OIDC_AUDIENCE=authenticated

# For older Supabase projects using HS256, use this instead:
# OIDC_SECRET=<jwt-secret-from-supabase-dashboard>
```

**Frontend** — copy and fill in `frontend/.env`:
```bash
cp frontend/.env.example frontend/.env
```

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key-from-supabase-dashboard>
```

Get these values from **Supabase dashboard → Project Settings → API**.

### Running the App

```bash
./start.sh
```

This starts both the backend (port 8000) and frontend (port 5173).

Open [http://localhost:5173](http://localhost:5173) in your browser.

## API

All endpoints except image/download URLs require a valid `Authorization: Bearer <token>` header.

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/me` | Required | Returns current user identity |

### PDF
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/pdf/upload` | Required | Upload a PDF |
| GET | `/api/pdf/preview/{file_id}/{page}` | Public | Get page thumbnail |
| POST | `/api/pdf/merge` | Required | Merge multiple PDFs |
| POST | `/api/pdf/split` | Required | Split PDF into ranges |
| POST | `/api/pdf/rotate` | Required | Rotate pages |
| POST | `/api/pdf/reorder` | Required | Reorder pages |
| POST | `/api/pdf/delete-pages` | Required | Delete pages |
| POST | `/api/pdf/watermark` | Required | Add a watermark |
| GET | `/api/pdf/elements/{file_id}/{page}` | Required | Get page text elements |
| POST | `/api/pdf/apply-edits` | Required | Apply in-page edits |
| GET | `/api/pdf/render-notext/{file_id}/{page}` | Public | Render page without text (editor background) |
| GET | `/api/pdf/download/{file_id}` | Public | Download the result |

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
git tag -a v1.2.0 -m "Description of this version"
git push origin v1.2.0
```

| Version | Description |
|---------|-------------|
| v1.0.0 | Initial release with rotated PDF support |
| v1.1.0 | User authentication via Supabase (email/password + Google OAuth) |
| v1.2.0 | User profiles and onboarding state (Supabase Postgres + service role API) |
| v1.2.1 | Fix Google OAuth callback flow (implicit + PKCE, trigger exception handler) |
