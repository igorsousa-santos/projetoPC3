// Load dotenv only in development (Vercel provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
    const dotenv = await import('dotenv');
    dotenv.config();
}

export const PORT = process.env.PORT || 3001;
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-123';

// Support both standard and VITE_ prefixed variables for Vercel/Local compatibility
export const LASTFM_API_KEY = process.env.LASTFM_API_KEY || process.env.VITE_LASTFM_API_KEY;
export const LASTFM_SHARED_SECRET = process.env.LASTFM_SHARED_SECRET || process.env.VITE_LASTFM_SHARED_SECRET || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

export const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';