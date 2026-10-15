# Design
Extend existing semantic token kinds with error/warning/success. Fixed complete words: error/fatal/fail/failed/failure; warn/warning; success/succeeded/passed. No arbitrary regex or context-sensitive severity inference (e.g. a quoted word still matches). Preserve URLs as higher-priority whole tokens. Unicode letters/numbers/underscore count as word characters.

Colours use the selected terminal theme red/yellow/green; absent scheme colours fall back to existing semantic palette entries, adding no new isolated theme constants. Scan at most 4096 UTF-16 units per physical row; never modify the actual buffer. Keep at most 64 tokens per row, 360 retained decorated lines and 2048 active decorations. Prune before scanning, scan viewport before recent backlog, use available decoration capacity, and dispose/recreate signatures after truncation so newly freed capacity is reusable. Wrapped keywords split across physical rows are not matched in this cut; search still supports cross-row matching.

Use Trellis before-dev/check with existing frontend guidelines; no new UI surface, persistence, IPC, or prompt required. Custom user-saved rules remain a later design slice.
