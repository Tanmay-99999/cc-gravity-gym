Gym Management System — Backend Added
====================================

What I added:
 - backend/ (Node.js + Express)
   - package.json
   - server.js
   - .env.example

Backend API:
 - GET  /api/:key           -> returns { ok: true, items: [...] }
 - POST /api/:key/full      -> replace all items for this key; body { items: [...] }
 - DELETE /api/:key/full    -> delete all items for this key

How the frontend sync works:
 - I modified js/storage.js to keep a synchronous cache and localStorage compatibility.
 - When Storage.get(key) is called it returns cached/local data synchronously.
 - If backend is enabled (Storage.USE_BACKEND = true), storage.js will fetch the latest data from backend asynchronously and update cache + localStorage.
 - When Storage.set(key, value) is called, it updates cache + localStorage and posts the full array to the backend using POST /api/:key/full.

Setup steps:
 1. Ensure you have Node.js and npm installed.
 2. Configure your MySQL database and create a database (e.g., gym_management).
 3. Copy backend/.env.example -> backend/.env and fill DB credentials.
 4. From terminal, run:
    cd gym-management-system/backend
    npm install
    npm start
 5. Serve the frontend (open index.html or use Live Server). Backend default port 5000; update Storage.API_BASE in js/storage.js if different.

Note: The backend stores each array entry as JSON in a generic 'items' table. This keeps the change minimal and avoids needing to change frontend data shapes.

