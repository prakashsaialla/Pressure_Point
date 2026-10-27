# PRESSURE POINT - Multiplayer Strategy Game

A cyberpunk competitive strategy game for 2–8 operators. Players join a private room by code, take one timed action each round, compete for six districts, predict hidden crisis outcomes and earn Influence and performance bonuses. Highest Influence after five rounds wins.


## What is included

- Responsive React + TypeScript + Vite frontend
- Netlify Function at `netlify/functions/game.ts`
- Strong-consistency Netlify Blobs room storage and conditional ETag writes
- Server-validated room membership, resource costs, turn submissions, round resolution, scoring, and winner selection
- Server-validated room membership, resource costs, turn submissions, round resolution, scoring and winner selection
- SVG project cover image at `public/pressure-point-cover.svg`
- Automated pure game-engine tests at `tests/game-engine.test.mjs`
- Root-level `netlify.toml`, `package.json` and `package-lock.json`

## Rules in brief

- 2–8 players; five rounds; 30 seconds per round.
- Each operator starts with 10 Credits, 3 Intel, 5 Energy, and 2 Security.
- Choose one action per round: Expand, Generate, Fortify, Scout, Predict, Sabotage, or Recover.
- Each operator starts with 10 Credits, 3 Intel, 5 Energy and 2 Security.
- Choose one action per round: Expand, Generate, Fortify, Scout, Predict, Sabotage or Recover.
- Decisions are locked once submitted. The server resolves the round when everyone submits or the deadline expires.
- Capturing a district earns 100 Influence. Controlled districts earn 25 Influence each round, with additional district-specific resources or Influence.
- Correct predictions earn 50 Influence; the crisis objective earns 75; round efficiency earns 50; three positive rounds in a row earn a 75-point streak bonus. Successfully defending a sabotage earns 30 Influence.
- Sabotage can weaken reserves or take an unprotected district. Security can absorb hostile operations.
- The server picks the hidden crisis outcome. A correct forecast is only scored after resolution.
- Ties break by districts controlled, remaining resource value, then correct predictions.

## Deploy to Netlify

1. Upload this project to a Netlify site using the source/build deployment workflow available in your Netlify account. The build command is `npm run build`, publish directory is `dist`, and Functions directory is `netlify/functions`.
2. The project uses Netlify Blobs, which is provisioned by Netlify for deployed Functions. No external API key or separately managed database is intended.
3. Once deployed, open the public site in two separate browsers/devices. Create a room in one, join with the code in the other, start the match, and complete a round.
4. Verify that `/.netlify/functions/game` responds and that room state survives refreshes.

**Important:** Netlify Drop workflows can differ between static drag-and-drop publishing and source builds with Functions. If your Drop screen treats the ZIP as static assets only, use a Netlify deployment flow that builds the included source and publishes Functions; a static-only upload cannot run the multiplayer backend.

## Local development

Requires Node.js 20+ and npm.

```bash
npm install
npm test
npm run dev
```

The frontend calls `/.netlify/functions/game` directly. For a local end-to-end multiplayer test, run the app through Netlify's local development environment so the Function and Blobs emulator are available; opening the Vite server alone does not provide the backend.

## Tests and known limitations

- The game engine tests cover host permissions, minimum player count, unaffordable actions, duplicate submissions, a complete two-player three-round simulation, winner selection, private crisis outcomes, and timeout fallback.
- The game has not been deployed from this environment, and the full Vite production build was not run because npm package installation could not reach the package registry here. Run the included build on Netlify to validate dependency resolution and bundling.
- Netlify Blobs conditional writes reduce conflicting room updates, but Blobs are a key-value store rather than a transactional database. This design is intended for a small challenge demo, not high-concurrency production gaming. Simultaneous writes can return a retry message.
- Player sessions use browser-stored room tokens. They prevent simple room-code-only impersonation but are not a substitute for a full account system or competitive anti-cheat infrastructure.
- No public URL is included because deployment requires access to a Netlify account and a successful external deploy.
