# Audio guides v32: editorial selection and rights

- 33 curated destinations: beaches, historic towns, cultural sites, meaningful natural locations and food markets. Plain shopping and generic waterparks are excluded. The original place directory is unchanged.
- Every script is originally authored using supported facts from the place catalog and additional official tourism pages. Legends are explicitly introduced as legends, not proven historical events.
- Source videos are **outbound references only**. No video audio, music, voice, transcripts or copyrighted narration is sampled or copied. Deep links are optional online extras.
- The audio engine is Silero's `v5_cis_base_nostress` with `ru_ekaterina`, whose authors publish this specific CIS Base model under MIT. Source: https://github.com/snakers4/silero-models/blob/master/README.md and https://github.com/snakers4/silero-models/blob/master/LICENSE_CIS
- The ambient composition is written in Python: soft four-chord synthesized pad and optional chime. No third-party music.
- Audio files use MPEG-4 AAC-LC in .m4a containers, mono 24kHz / ~24kbit/s, compatible with iPhone/Safari. Exact total size is verified by CI, not estimated in code.
- Audio narration is prepared at build time only, and remains an explicit download, not a mandatory Service Worker precache. Users who previously saved .mp3 files can clear retired files via the UI; do not silently delete their cache.
- Test the actual voice character and Chinese names on a phone before relying on background/lock-screen behavior: passing browser tests cannot ensure subjective naturalness. A more expressive model is not necessarily indistinguishable from professional human voice actors.

## Выпуск v34 — голос по пожеланию владельца

Вместо женского `ru_ekaterina` подготовлен более ровный мужской Piper `ru_RU-denis-medium` в новых AAC/M4A файлах. Используется прежняя тихая оригинальная музыкальная подложка; ничего не копируется из видеообзоров. Офлайн-файлы старых голосов удаляются **только после подтверждения владельца**.
