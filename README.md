# AI Chat Agent - MERN Stack

A ChatGPT-like AI sales chatbot using Bootstrap 5, React, Node/Express, and Anthropic API. Trained per company using data in `train_data/_<CompanyName>/` folders.

## Tech Stack
- **Frontend**: React + Vite, Bootstrap 5
- **Backend**: Node.js, Express
- **AI**: Anthropic API (Claude)
- **Training**: Company-specific folders with .txt, .md, .json files

## Project Structure
```
AIChatBot/
├── client/           # React frontend
├── server/           # Express API
├── train_data/       # Company training data
│   ├── _default/     # Default context
│   └── _JP_Loft/     # Example: JP Loft
├── package.json
└── .env
```

## Setup

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Configure environment**  
   Create or edit `.env` in the project root and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_key_here
   PORT=5000
   ```

   Optional voice setup (for admin voice preview and spoken AI replies):
   ```
   ELEVENLABS_API_KEY=your_elevenlabs_key_here
   ELEVENLABS_DEFAULT_VOICE_PROFILE=professional
   ```
   The admin Voice Settings page includes premade `professional`, `corporate`, and `sales` profiles with male/female choices and live preview, plus custom voice training (upload audio samples, choose male/female, then test/select your own voice).

3. **Run the app**
   - Backend: `npm run server` (or `npm start`)
   - Frontend: `npm run client` (from project root)
   - Or both: `npm run dev`

4. Open http://localhost:3000

## Training Data

- Add folders under `train_data/` with underscore prefix: `_CompanyName`
- Place `.txt`, `.md`, or `.json` files inside
- The AI uses this content as context when that company is selected
- Example: `train_data/_Acme_Corp/services.txt`, `train_data/_Acme_Corp/faq.md`
