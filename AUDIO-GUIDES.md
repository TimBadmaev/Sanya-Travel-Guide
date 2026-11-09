# Russian audio guides for Sanya Travel Guide

There are 57 original Russian narration scripts in `data/audio-guides.json`, matching all currently verified destinations. They paraphrase the project’s curated source-backed descriptions and editorial stories. References per guide remain in the JSON and the original place pages.

Audio renderer: `scripts/render_audio.py`. Workflow: `.github/workflows/generate-audio.yml`, which is intentionally scoped to the feature branch. It uses the downloadable `ru_RU-denis-medium` Piper neural voice; the model weights are never added to this repository. Audio generation is performed during development, NOT in the browser or in China. Model card lists dataset license CC0: https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/denis/medium/MODEL_CARD. Piper runtime GPL-3.0 is used as a separate build tool; it is not distributed inside the PWA. Confirm voice-model conditions independently before reuse in a commercial product.

MP3 files are 22.05 kHz, mono, 40 kbit/s. They are shipped as static website assets and NOT added to the service worker's mandatory install cache. Travellers choose individual offline downloads. Keep this separation when updating the PWA.

Script length is an estimated 1–5 minutes at natural Russian speech tempo. Verify produced audio duration with `python scripts/verify_audio.py`, and review pronunciation of Chinese place names before publication.
