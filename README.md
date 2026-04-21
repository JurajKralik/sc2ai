# sc2ai OpenUI5 dashboard

Local OpenUI5 app that shows recent AI Arena matches for the bot configured in `.env`.

## Run

```bash
npm install
npm start
```

Then open the local URL from UI5, usually `http://localhost:8080`.

## Notes

- The app reads `BOT_ID` and `AIARENA_API_KEY` from `.env`.
- It fetches bot metadata and the 20 most recent matches.
- Replay and ArenaClient log links open directly from the table.