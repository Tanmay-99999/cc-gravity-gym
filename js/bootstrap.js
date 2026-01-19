// Bootstrap loader: fetch collections from backend API and populate an in-memory cache
// This file uses top-level await; include as <script type="module"> before other scripts.
const API_BASE = window.__API_BASE__ || 'http://localhost:5000/api';
const KEYS = ['gym_users','gym_plans','gym_trainers','gym_members','gym_payments','gym_checkins','gym_prospects','gym_bookings'];

window.__BOOTSTRAP_CACHE__ = window.__BOOTSTRAP_CACHE__ || {};

async function fetchAndSeed(){
  for(const key of KEYS){
    try{
      const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`);
      if(!res.ok) { window.__BOOTSTRAP_CACHE__[key] = []; continue; }
      const data = await res.json();
      if(data && Array.isArray(data.items) && data.items.length){
        // convert items (they include id and stored data)
        const items = data.items.map(it=>{
          const copy = Object.assign({}, it);
          // keep id in the item; this will be used by the client cache
          return copy;
        });
        window.__BOOTSTRAP_CACHE__[key] = items;
      } else {
        window.__BOOTSTRAP_CACHE__[key] = [];
      }
    }catch(e){
      // backend not available or CORS blocked — initialize empty cache
      window.__BOOTSTRAP_CACHE__[key] = [];
    }
  }
}

// Run immediately (top-level await in module script ensures it completes before other scripts load)
await fetchAndSeed();
console.log('Bootstrap cache loaded for keys:', Object.keys(window.__BOOTSTRAP_CACHE__));
