import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";

const db = new Database("exam_guardrail.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT DEFAULT 'student'
  );

  CREATE TABLE IF NOT EXISTS exam_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    trust_score INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    student_id TEXT,
    type TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { id, name, role } = req.body;
    // Simple mock login for demo
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!user) {
      db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?)").run(id, name, role || 'student');
    }
    res.json({ id, name, role: role || 'student' });
  });

  app.post("/api/sessions/start", (req, res) => {
    const { studentId } = req.body;
    const sessionId = Math.random().toString(36).substring(7);
    db.prepare("INSERT INTO exam_sessions (id, student_id) VALUES (?, ?)").run(sessionId, studentId);
    res.json({ sessionId });
  });

  app.post("/api/violations", (req, res) => {
    const { sessionId, studentId, type, details } = req.body;
    db.prepare("INSERT INTO violations (session_id, student_id, type, details) VALUES (?, ?, ?, ?)")
      .run(sessionId, studentId, type, JSON.stringify(details));
    
    // Calculate new trust score
    const penalties: Record<string, number> = {
      TAB_SWITCH: 15,
      WINDOW_RESIZE: 10,
      COPY_ATTEMPT: 20,
      IDLE_DETECTED: 5,
      MULTIPLE_FACES: 30,
      FACE_MISSING: 20,
      VOICE_DETECTED: 20,
      LOUD_AUDIO: 25,
      AUDIO_DEVICE_CHANGE: 30,
      LOOKING_AWAY: 10,
      FULLSCREEN_EXIT: 15,
      PROHIBITED_OBJECT: 25,
      MOBILE_PHONE_USAGE: 25,
      TURNING_AROUND: 15,
      MANUAL_OVERRIDE: 5
    };

    const penalty = penalties[type] || 5;
    db.prepare("UPDATE exam_sessions SET trust_score = MAX(0, trust_score - ?) WHERE id = ?")
      .run(penalty, sessionId);

    const session = db.prepare("SELECT * FROM exam_sessions WHERE id = ?").get(sessionId);
    
    // Broadcast to dashboard
    io.emit("violation_update", { sessionId, studentId, type, details, trustScore: session.trust_score });
    
    res.json({ success: true, trustScore: session.trust_score });
  });

  app.get("/api/admin/sessions", (req, res) => {
    const sessions = db.prepare(`
      SELECT s.*, u.name as student_name, 
      (SELECT COUNT(*) FROM violations WHERE session_id = s.id) as violation_count
      FROM exam_sessions s
      JOIN users u ON s.student_id = u.id
      ORDER BY s.start_time DESC
    `).all();
    res.json(sessions);
  });

  app.get("/api/admin/violations/:sessionId", (req, res) => {
    const violations = db.prepare("SELECT * FROM violations WHERE session_id = ? ORDER BY timestamp DESC")
      .all(req.params.sessionId);
    res.json(violations);
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Exam Guardrail System running on http://localhost:${PORT}`);
  });
}

startServer();
