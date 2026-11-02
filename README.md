# 溫馨小屋 · Bot 狀態

A cozy single-room live dashboard for Grok Bots. Reads the same **ntfy** JSON protocol as [Codila’s grokbot-wallpaper](https://github.com/Bodila51/grokbot-wallpaper), but renders a warm cabin living room instead of a multi-floor office.

## Open

```
https://ykleung2025.github.io/bot-cabin/#<TOPIC>
```

- Put the topic **only** after `#` so it never hits GitHub servers in the path.
- Optional mailbox override: `#<TOPIC>&ntfy=https://your-ntfy.example`
- Or host form: `#<TOPIC>@ntfy.example.com`

Do **not** commit a real topic into this repo.

## Protocol (bots → ntfy)

POST JSON to `https://ntfy.sh/<TOPIC>` (or your relay). Examples:

```json
{"roster":["Alpha","Beta"]}
{"looks":{"Alpha":{"shape":"sphere","color":"#E8A87C","accessory":"bow"}}}
{"groups":{"Alpha":"沙發","Beta":"書桌"}}
{"bot":"Alpha","status":"working","step":"整理教案"}
{"type":"usage","total_used_pct":12.5,"resets_at":"2026-11-09T00:00:00+08:00","bots":{"Alpha":4.1}}
{"chat":{"Alpha":"grokbot://app/v1/agent?id=..."}}
```

In this cabin, `groups` map to corners of **one** room: 沙發 / 書桌 / 窗邊 / 壁爐.

## Local preview

```bash
cd bot-cabin
python3 -m http.server 8765
# open http://127.0.0.1:8765/#your-fake-topic
```

## Stack

Static HTML/CSS/JS only. No build step. Topic stays client-side after `#`.
