Sports Insight Bot
Sports Insight Bot is a full-stack AI-powered sports analysis chatbot that provides tactical insights, match analysis, and image-based sports discussions through an interactive conversational interface.

> **Status (Nov 2026): being rebuilt.** The old version below no longer works: its model has no providers left on OpenRouter, and all visitors shared one conversation. The rebuild is a cricket-first, multimodal Analyst with an interactive cricket Ground (Svelte 5 + FastAPI on Vercel, model `google/gemma-4-26b-a4b-it`).
> - Plan: [PRD (#1)](https://github.com/v1d1tt/sports-insight-bot/issues/1) and `docs/PRD.md`, built in 10 vertical-slice tickets (#2–#11)
> - Model choice: `docs/model-eval/` (6 small vision models tested)
> - Domain terms: `GLOSSARY.md`; decisions: `docs/adr/`
>
> The sections below describe the old version and will be replaced in slice 01.

Project Overview
Sports Insight Bot is a full-stack AI-powered sports analysis chatbot that provides tactical insights, match analysis, and image-based sports discussions through an interactive conversational interface.

Tech Stack:

Backend
Python
FastAPI
OpenRouter (OpenAI-compatible API)
Multimodal Vision Language Model (Qwen 2.5 VL)

Handles:
Text-based chat
Image-to-text sports context extraction
Tactical analysis responses
Deployed on Render

Frontend
HTML
CSS
Vanilla JavaScript
Glassmorphism-style UI with sports-themed design
Image upload + chat interface
Deployed on Vercel


Deployment:

Backend (Render)
Deployed as a FastAPI Web Service
Uses uvicorn as the ASGI server
Environment variables managed securely on Render
Handles all AI processing and API requests

Frontend (Vercel)
Deployed as a static site
Communicates with backend via HTTPS API calls
Provides the complete chatbot user experience

 Note:  
  This monorepo is created for unified code visibility and evaluation purposes.  
  Production deployments currently use separate repositories for frontend and backend.

MONOREPO STRUCTURE:

sports-insight-bot/
│
├── backend/
│   ├── backend.py           # FastAPI backend
│   ├── requirements.txt     # Python dependencies
│   ├── Procfile             # Render deployment config
│   └── .env                 # Environment variables (not committed)
│
├── frontend/
│   ├── index.html           # Chat UI
│   ├── style.css            # Styling
│   └── script.js            # Client-side logic
│
├── .gitignore
└── README.md

---

 Features:

- Conversational chatbot interface
- Sports-related question answering
- Clean frontend–backend separation
- Cloud-based deployment
- Monorepo architecture for easier evaluation



 Startup guide:

Backend:

cd backend
pip install -r requirements.txt
uvicorn backend:app --reload

Frontend:

Static files, no build step: open frontend/index.html in a browser.

Security Notes
API keys are stored using environment variables
.env is excluded via .gitignore
CORS enabled for frontend–backend communication

Author:
Vidit Arora
Software Engineering Student @ DTU
Interests: FullStack Development, AI/ML, Systems Programming

Acknowledgements
This project is built for learning, experimentation, and evaluation purposes, and demonstrates real-world integration of AI, backend APIs, and frontend deployment.

