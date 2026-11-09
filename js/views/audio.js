import { loadAudioGuides, loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { guideAudioUrl, audioCacheAvailable, isAudioSaved, savedAudioBlob, saveAudio, removeAudio, offlineGuideIds } from "../logic/audio-cache.js";

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Optional audio text remains usable even without a downloaded file.
export function renderAudioPlayer(container, place, guide) {
  if (!guide) return;
  const section = el("section", "audio-guide");
  section.setAttribute("aria-label", "Аудиогид по месту");
  section.appendChild(el("p", "audio-guide__eyebrow", "🎧 АУДИОГИД · НА РУССКОМ"));
  section.appendChild(el("h3", "audio-guide__title", guide.title));
  section.appendChild(el("p", "audio-guide__subtitle",
    `История места · около ${guide.minutes} мин · слушайте прямо здесь`));

  const media = document.createElement("audio");
  media.preload = "none";
  media.setAttribute("aria-label", "Аудиогид: " + guide.title);
  const controls = el("div", "audio-guide__controls");
  const play = el("button", "btn btn--primary audio-guide__play", "▶ Слушать");
  play.type = "button";
  play.disabled = true; // Wait for the local Cache API check before first tap.
  const back = el("button", "btn btn--secondary audio-guide__back", "↶ 15 с");
  back.type = "button";
  back.setAttribute("aria-label", "Назад на 15 секунд");
  const speed = el("button", "btn btn--secondary audio-guide__speed", "1×");
  speed.type = "button";
  speed.setAttribute("aria-label", "Изменить скорость воспроизведения");
  controls.append(play, back, speed);

  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "audio-guide__seek";
  seek.min = "0";
  seek.max = "1000";
  seek.value = "0";
  seek.step = "1";
  seek.disabled = true;
  seek.setAttribute("aria-label", "Позиция аудиогида");
  const times = el("div", "audio-guide__times");
  const current = el("span", "", "0:00");
  const duration = el("span", "", `~${formatTime(guide.estimatedSeconds)}`);
  times.append(current, duration);
  const status = el("p", "audio-guide__status", "Проверяем сохранённое аудио…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const download = el("button", "btn btn--secondary audio-guide__download", "↓ Сохранить офлайн");
  download.type = "button";
  download.disabled = !audioCacheAvailable();
  const text = el("details", "audio-guide__transcript");
  const summary = el("summary", "", "Читать полный текст истории");
  const copy = el("div", "audio-guide__script");
  guide.text.split(/\n+/).map(p => p.trim()).filter(Boolean).forEach((paragraph) =>
    copy.appendChild(el("p", "", paragraph)));
  text.append(summary, copy);
  section.append(controls, seek, times, download, status, text, media);
  container.appendChild(section);

  let saved = false;
  let blobUrl = null;
  let ready = false;
  let active = true;
  const rawUrl = guideAudioUrl(guide);
  const onLeave = () => { active = false; media.pause(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  window.addEventListener("hashchange", onLeave, { once: true });
  const showSave = () => {
    download.textContent = saved ? "✓ Удалить офлайн-копию" : "↓ Сохранить офлайн";
    status.textContent = saved ? "✓ Аудио сохранено и доступно без сети" :
      "Для офлайна сохраните запись. Без загрузки требуется интернет.";
  };
  const reflect = () => {
    play.textContent = media.paused ? "▶ Слушать" : "❚❚ Пауза";
    const total = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    current.textContent = formatTime(media.currentTime);
    duration.textContent = formatTime(total || guide.estimatedSeconds);
    seek.disabled = !total;
    if (total) seek.value = String(Math.round(media.currentTime / total * 1000));
  };
  async function restore() {
    try {
      const blob = await savedAudioBlob(guide);
      if (!active) return;
      if (blob) {
        saved = true;
        blobUrl = URL.createObjectURL(blob);
        media.src = blobUrl;
      }
    } catch { /* Browsers may deny Cache API: streaming remains usable. */ }
    if (!active) return;
    ready = true;
    play.disabled = false;
    showSave();
  }
  restore();
  play.addEventListener("click", () => {
    if (!ready) return;
    if (media.paused) {
      // Keep play() directly inside a user gesture (especially important in iOS).
      if (!media.src) media.src = rawUrl;
      const playback = media.play();
      if (playback && playback.catch) playback.catch(() => {
        status.textContent = "Не получилось воспроизвести запись. Проверьте интернет или скачайте аудио заранее.";
      });
    } else media.pause();
  });
  media.addEventListener("play", reflect);
  media.addEventListener("pause", reflect);
  media.addEventListener("timeupdate", reflect);
  media.addEventListener("loadedmetadata", reflect);
  media.addEventListener("ended", reflect);
  media.addEventListener("error", () => {
    if (!active) return;
    status.textContent = saved ? "Не удалось открыть офлайн-запись." :
      "Аудиофайл пока недоступен. Можно прочитать историю ниже.";
  });
  back.addEventListener("click", () => { media.currentTime = Math.max(0, media.currentTime - 15); reflect(); });
  speed.addEventListener("click", () => {
    media.playbackRate = media.playbackRate === 1 ? 1.25 : media.playbackRate === 1.25 ? 1.5 : 1;
    speed.textContent = `${media.playbackRate}×`;
  });
  seek.addEventListener("input", () => {
    if (Number.isFinite(media.duration) && media.duration > 0) {
      media.currentTime = Number(seek.value) / 1000 * media.duration;
      reflect();
    }
  });
  download.addEventListener("click", async () => {
    if (!active) return;
    download.disabled = true;
    try {
      if (saved) {
        await removeAudio(guide);
        saved = false;
        status.textContent = "Офлайн-копия удалена.";
        // The current playback is unaffected; blob URL remains until leaving.
      } else {
        status.textContent = "Загружаем аудио для прослушивания без сети…";
        await saveAudio(guide);
        saved = true;
        if (media.paused && !media.currentTime && !blobUrl) {
          const blob = await savedAudioBlob(guide);
          if (blob) {
            blobUrl = URL.createObjectURL(blob);
            media.src = blobUrl;
          }
        }
      }
      if (active) showSave();
    } catch (e) {
      if (active) status.textContent = e?.message || "Не удалось загрузить запись.";
    } finally { if (active) download.disabled = !audioCacheAvailable(); }
  });

  if ("mediaSession" in navigator && "MediaMetadata" in window) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: guide.title, artist: "Sanya Travel Guide", album: "Аудиогид по Хайнаню"
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => { media.currentTime = Math.max(0, media.currentTime - 15); });
      navigator.mediaSession.setActionHandler("seekforward", () => { media.currentTime += 15; });
      navigator.mediaSession.setActionHandler("play", () => media.play());
      navigator.mediaSession.setActionHandler("pause", () => media.pause());
    } catch { /* Not every iOS PWA supports Media Session actions. */ }
  }
}

export async function renderAudioCatalog(container, ctx) {
  container.innerHTML = '<p class="loading">Загружаем аудиогиды…</p>';
  let guides, places, config;
  try {
    [guides, places, config] = await Promise.all([loadAudioGuides(), loadPlaces(), loadConfig()]);
  } catch (error) {
    if (!ctx.isCurrent()) return;
    container.textContent = loadErrorMessage(error);
    return;
  }
  if (!ctx.isCurrent()) return;
  const byId = new Map(places.map(p => [p.id, p]));
  const areas = new Map(config.areas.map(a => [a.id, a.name]));
  const entries = Object.entries(guides).filter(([id]) => byId.has(id))
    .sort((a,b) => ((a[1].area === "yalong") ? -1 : 0)-((b[1].area === "yalong") ? -1 : 0));
  container.innerHTML = "";
  const back = el("a", "place-detail__back", "← На главную");
  back.href = "#/";
  back.addEventListener("click", e => {e.preventDefault();ctx.back("#/");});
  container.append(back, el("h2", "view-title", "🎧 Аудиогиды Хайнаня"));
  container.appendChild(el("p", "audio-catalog__intro",
    `${entries.length} историй на русском, примерно по 1–5 минут. Слушайте в карточке места. Перед поездкой можно сохранить нужные записи для офлайна.`));

  const tools = el("div", "audio-catalog__tools");
  const areaControl = document.createElement("select");
  areaControl.className = "audio-filter";
  areaControl.setAttribute("aria-label", "Район аудиогидов");
  [{id:"any",name:"Все районы"},{id:"yalong",name:areas.get("yalong")}]
    .concat([...areas].filter(([id])=>id!=="yalong").map(([id,name])=>({id,name})))
    .filter(x=>x.id==="any"||entries.some(([,g])=>g.area===x.id))
    .forEach(({id,name})=>{const o=document.createElement("option");o.value=id;o.textContent=name;areaControl.appendChild(o);});
  const search=document.createElement("input");
  search.type="search";search.className="audio-filter";
  search.placeholder="Поиск по названию";search.setAttribute("aria-label","Поиск аудиогида");
  tools.append(areaControl,search);
  const actions=el("div","audio-catalog__actions");
  const download=el("button","btn btn--primary","↓ Скачать выбранные");
  download.type="button";download.disabled=!audioCacheAvailable();
  const cancel=el("button","btn btn--secondary","Отмена");cancel.type="button";cancel.hidden=true;
  const message=el("p","audio-catalog__status","Аудио скачивается только по вашему выбору, не при открытии приложения.");
  message.setAttribute("role","status");message.setAttribute("aria-live","polite");
  actions.append(download,cancel);
  const list=el("div","audio-catalog__list");
  container.append(tools,actions,message,list);
  let saved=new Set();
  let abort=null;
  try { saved=await offlineGuideIds(guides); } catch {}
  const filtered=() => entries.filter(([id,g])=>
    (areaControl.value==="any"||g.area===areaControl.value) &&
    (!search.value.trim()||`${g.title} ${byId.get(id).name.zh}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
  function draw() {
    if (!ctx.isCurrent()) return;
    list.innerHTML="";
    const view=filtered();
    download.textContent=`↓ Скачать выбранные (${view.length})`;
    if (!view.length) {list.appendChild(el("p","empty-state","По этим условиям ничего не найдено."));return;}
    for(const [id,g] of view) {
      const card=el("a","audio-catalog__item");
      card.href=`#/place/${id}`;
      card.append(el("span","audio-catalog__item-icon","🎧"));
      const content=el("span","audio-catalog__item-text");
      content.append(el("strong","",g.title),el("small","",`${areas.get(g.area)||"Другой район"} · ~${g.minutes} мин`));
      card.append(content,el("span","audio-catalog__item-save",saved.has(id)?"✓ офлайн":"▶"));
      list.appendChild(card);
    }
  }
  areaControl.addEventListener("change",draw);
  search.addEventListener("input",draw);
  cancel.addEventListener("click",()=>abort?.abort());
  download.addEventListener("click",async()=>{
    const selection=filtered();
    if (!selection.length||abort) return;
    abort=new AbortController();
    download.disabled=true;cancel.hidden=false;
    let done=0,errors=0,skipped=0;
    for (const [id,g] of selection) {
      if (!ctx.isCurrent()||abort.signal.aborted) break;
      message.textContent=`Сохраняем ${done+skipped+errors+1} из ${selection.length}: ${g.title}`;
      try {
        if (saved.has(id)) skipped++;
        else { await saveAudio(g,{signal:abort.signal});saved.add(id);done++; }
      } catch(e) {
        if(abort.signal.aborted)break;
        errors++;
        message.textContent=`Не удалось сохранить: ${g.title}. ${e?.message||"Ошибка"}`;
      }
      draw();
    }
    if (ctx.isCurrent()) {
      message.textContent=`Сохранено: ${done}; уже было: ${skipped}; ошибок: ${errors}.` +
        (abort.signal.aborted?" Загрузка остановлена.":"");
      abort=null;cancel.hidden=true;download.disabled=!audioCacheAvailable();draw();
    }
  });
  draw();
}
