# Repository Guidelines

## Project Structure & Modules
- `src/index.js`: Bot entry; loads commands and handles interactions.
- `src/commands/*.js`: One slash command per file. Default export with `data` (SlashCommandBuilder) and `execute(interaction)`.
- `src/db/database.js`: SQLite via better-sqlite3; data stored in `meeting.db` (ignored by Git).
- `src/utils/formatter.js`, `src/utils/guards.js`: Formatting helpers and permission/channel guards.
- `.env.example` → copy to `.env`; configure required IDs and tokens.

## Build, Test, and Development
- `npm install`: Install dependencies.
- `npm run deploy`: Register slash commands (uses `DISCORD_APP_ID` + `DISCORD_TOKEN`). Run after command changes.
- `npm start`: Launch the bot.
- `npm run dev`: Run with file watching for local iteration.
- `npm run lint`: Lint `src/` with ESLint.
- `npm test`: Placeholder (no tests configured yet).

## Coding Style & Naming
- **Runtime**: Node.js 20+, ES Modules (`"type": "module"`).
- **Indentation**: 2 spaces; include semicolons; prefer single quotes.
- **Naming**: camelCase for variables/functions; UPPER_SNAKE for env keys; command files lowercase (multi-word kebab-case, e.g., `review-add.js`).
- **Commands**: Export `default { data, execute }`; keep command names short (`/add`, `/done`, ...).

## Testing Guidelines
- Manual flow: set `.env` (TOKEN, APP_ID, CHANNEL IDs) → `npm run deploy` → `npm start` → exercise `/add`, `/list`, `/check`, `/done`, `/link` in a test guild.
- Verify: message + thread creation, status updates, checkbox toggles, DB row in `meeting.db`.
- Future: add unit tests for `utils/` with Vitest/Jest; keep helpers pure and side‑effect free.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`. Scopes: `commands`, `db`, `utils`, `config`.
- PRs include: summary, before/after notes or screenshots/logs, commands run, linked issues, test steps, and risks/rollout. Ensure `npm run lint` passes.

## Security & Configuration Tips
- Never commit secrets; use `.env` and keep `.env.example` updated.
- Restrict usage with `COMMAND_CHANNEL_ID` and `ALLOWED_ROLE_ID`.
- Persist `meeting.db` across deployments; do not commit it.
- Re‑run `npm run deploy` whenever command schemas change.
