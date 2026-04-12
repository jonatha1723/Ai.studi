import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "node:fs/promises";
import { fileURLToPath } from "url";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let db: any;

async function initFirebase() {
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const firebaseConfig = JSON.parse(configData);
    
    let app;
    if (!getApps().length) {
      app = initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } else {
      app = getApp();
    }
    
    // Get Firestore instance, handling specific database ID if present
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } else {
      db = getFirestore(app);
    }
    console.log('[Server] Firebase Admin initialized successfully');
  } catch (err) {
    console.error('[Server] Failed to initialize Firebase Admin:', err);
  }
}

// Initialize before starting server logic
await initFirebase();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON with larger limit for images
  app.use(express.json({ limit: '10mb' }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Serve static files from dist
    app.use(express.static(distPath, { index: false }));
    
    // For any other route, serve index.html (SPA Fallback)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Google Test Server running on http://localhost:${PORT}`);
  });
}

startServer();
