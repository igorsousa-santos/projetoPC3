import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './env.js';

const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

export default genAI;