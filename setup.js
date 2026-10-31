#!/usr/bin/env node
// Entry point kept at the repo root so `npm start` / `node setup.js --tool …` keep working.
import { main } from './cli/main.js';

main().catch((e) => {
  if (e?.name === 'ExitPromptError') { console.log('\n👋'); process.exit(0); }
  console.error(e);
  process.exit(1);
});
