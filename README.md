<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e1f38639-6564-414f-bf29-f3c5b0accf99

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## AI Provider Configuration

This app supports both Gemini and OpenAI for classification/OCR.

1. Copy `.env.example` to `.env.local`
2. Set `AI_PROVIDER` to `gemini` or `openai`
3. Configure the matching API key (`GEMINI_API_KEY` or `OPENAI_API_KEY`)

## Scripts

- `npm run dev`: Start full-stack dev server (`tsx server.ts`)
- `npm run lint`: Type-check TypeScript (`tsc --noEmit`)
- `npm run build`: Build front-end assets with Vite
- `npm run start`: Start server with tsx (`tsx server.ts`)
