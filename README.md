# Exam Guardrail System

Integrity First Online Exam Monitoring Platform.

## Features
- **Sentinel Client**: Real-time browser monitoring (tab switching, window resizing, keyboard hijacking protection).
- **AI Proctoring**: Face detection, head pose estimation, and voice detection using TensorFlow.js.
- **Auditor Dashboard**: Real-time violation logging and Trust Score calculation.
- **Security**: Fullscreen lock, copy/paste blocking, and question visibility protection.

## Setup
1. The app runs on port 3000.
2. AI models are loaded from public CDNs.
3. SQLite is used for local persistence.

## Environment Variables
- `GEMINI_API_KEY`: For AI-assisted analysis (optional).
- `JWT_SECRET`: For authentication.
