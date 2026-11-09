import { loadAudioGuides, loadAudioSizes, loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { guideAudioUrl, audioCacheAvailable, savedAudioBlob, saveAudio, removeAudio, offlineGuideIds, legacyAudioCacheInfo, clearLegacyAudioCache } from "../logic/audio-cache.js";

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
  section.appendChild(el("p", "audio-guide__eyebrow", "🎧 ИСТОРИЯ МЕСТА · ЖИВОЙ РАССКАЗ"));
  section.appendChild(el("h3", "audio-guide__title", guide.title));
  section.appendChild(el("p", "audio-guide__subtitle",
    `≈${guide.minutes} мин · русский голос · негромкая авторская музыка`));

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
  section.append(controls, seek, times, download, status, text);
  if (guide.video && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(guide.video.url)) {
    const video = el("a", "audio-guide__video", "▶ Видеообзор: " + guide.video.title);
    video.href = guide.video.url;
    video.rel = "noopener noreferrer";
    video.target = "_blank";
    const explanation = el("span", "audio-guide__video-note", "YouTube откроется отдельно, потребуется интернет.");
    section.append(video, explanation);
  }
  section.appendChild(media);
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

export async function renderAudioCatalog(container,ctx){
  container.innerHTML='<p class="loading">Загружаем коллекцию историй…</p>';
  let guides,places,config,sizes;
  try {
    [guides,places,config,sizes]=await Promise.all([
      loadAudioGuides(),loadPlaces(),loadConfig(),loadAudioSizes()
    ]);
  }catch(e){
    if(ctx.isCurrent())container.textContent=loadErrorMessage(e);
    return;
  }
  if(!ctx.isCurrent())return;
  const areaNames=new Map(config.areas.map(a=>[a.id,a.name]));
  const byId=new Map(places.map(p=>[p.id,p]));
  const entries=Object.entries(guides).filter(([id])=>byId.has(id))
    .sort((a,b)=>((a[1].area==="yalong")?-1:0)-((b[1].area==="yalong")?-1:0));
  const fmtBytes=bytes=>(Math.max(0,bytes)/1048576).toFixed(1).replace(".",",")+" МБ";
  const fullBytes=sizes.totalBytes||0;
  container.innerHTML="";
  const parent=ctx.from&&ctx.from.startsWith("#/excursions")?"#/excursions":
    ctx.from&&ctx.from.startsWith("#/me")?"#/me":"#/";
  const back=el("a","place-detail__back",parent==="#/"?"← На главную":
    parent==="#/me"?"← В моё":"← К экскурсиям");
  back.href=parent;
  back.addEventListener("click",e=>{e.preventDefault();ctx.back(parent);});
  const eyebrow=el("p","audio-catalog__eyebrow","НАСТОЯЩИЕ ИСТОРИИ ОСТРОВА");
  const title=el("h2","view-title","🎧 Аудиогид по Хайнаню");
  const intro=el("p","audio-catalog__intro",
    `${entries.length} историй: легенды, исторические города, природа и рынки. Без рассказов об обычных магазинах. Всё вместе — ${fmtBytes(fullBytes)}.`);
  container.append(back,eyebrow,title,intro);

  const pack=el("section","audio-catalog__pack");
  const packHeading=el("h3","","Вся коллекция для офлайна");
  const packCopy=el("p","","Один раз сохраните истории перед экскурсиями. Интернет для дальнейшего прослушивания не понадобится. Файлы могут быть удалены браузером при нехватке памяти.");
  const downloadAll=el("button","btn btn--primary audio-catalog__all",
    `↓ Скачать все ${entries.length} историй · ${fmtBytes(fullBytes)}`);
  downloadAll.type="button";downloadAll.disabled=!audioCacheAvailable();
  pack.append(packHeading,packCopy,downloadAll);container.appendChild(pack);

  const confirmBox=el("div","audio-catalog__confirm");
  confirmBox.hidden=true;
  confirmBox.setAttribute("role","group");
  confirmBox.setAttribute("aria-label","Подтверждение загрузки всех аудиогидов");
  confirmBox.appendChild(el("p","",
    `Будет загружено до ${fmtBytes(fullBytes)} (${entries.length} записей). Используйте Wi-Fi и оставьте эту страницу открытой до завершения.`));
  const confirmStart=el("button","btn btn--primary","Начать загрузку всех");
  confirmStart.type="button";
  const confirmNo=el("button","btn btn--secondary","Не сейчас");
  confirmNo.type="button";
  confirmBox.append(confirmStart,confirmNo);
  container.appendChild(confirmBox);

  const toolbar=el("div","audio-catalog__tools");
  const region=el("select","audio-filter");
  region.setAttribute("aria-label","Район аудиогидов");
  const opts=[{id:"any",name:"Все районы"},{id:"yalong",name:areaNames.get("yalong")||"Ялунвань"},
    ...[...areaNames].filter(([id])=>id!=="yalong").map(([id,name])=>({id,name}))];
  for(const o of opts){
    if(o.id!=="any"&&!entries.some(([,g])=>g.area===o.id))continue;
    const option=el("option","",o.name);option.value=o.id;region.appendChild(option);
  }
  region.value="yalong";
  const search=el("input","audio-filter");
  search.type="search";search.placeholder="Найти историю по названию";
  search.setAttribute("aria-label","Поиск аудиогида");
  toolbar.append(region,search);
  container.appendChild(toolbar);

  const actions=el("div","audio-catalog__actions");
  const download=el("button","btn btn--secondary","↓ Скачать выбранный район");
  download.type="button";download.disabled=!audioCacheAvailable();
  const cancel=el("button","btn btn--secondary","Остановить");
  cancel.type="button";cancel.hidden=true;
  actions.append(download,cancel);
  const status=el("p","audio-catalog__status",
    "Все истории доступны текстом без сети; записи загружаются по вашему выбору.");
  status.setAttribute("aria-live","polite");
  status.setAttribute("role","status");
  const list=el("div","audio-catalog__list");
  const legacy=el("div","audio-catalog__legacy");legacy.hidden=true;
  container.append(actions,status,legacy,list);

  let saved=new Set(),controller=null;
  try{saved=await offlineGuideIds(guides);}catch{}
  if(!ctx.isCurrent())return;
  async function discoverOld(){
    try{
      const old=await legacyAudioCacheInfo();
      if(!ctx.isCurrent())return;
      legacy.innerHTML="";
      legacy.hidden=!old.count;
      if(!old.count)return;
      const p=el("p","",
        `Найдены старые MP3 из прошлой версии: ${old.count} шт., ${fmtBytes(old.bytes)}. Новые записи работают отдельно.`);
      const clear=el("button","btn btn--secondary","Удалить только старые MP3");
      clear.type="button";
      clear.addEventListener("click",async()=>{
        if(!window.confirm("Удалить старые записи предыдущей версии? Новые аудиогиды останутся."))return;
        const count=await clearLegacyAudioCache();
        legacy.hidden=true;
        status.textContent=`Удалено устаревших записей: ${count}. Новая коллекция сохранена.`;
      });
      legacy.append(p,clear);
    }catch{/* Some private modes cannot inspect Cache Storage. */}
  }
  discoverOld();
  const filtered=()=>entries.filter(([id,g])=>
    (region.value==="any"||g.area===region.value)&&
    (!search.value.trim()||`${g.title} ${byId.get(id).name.zh}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
  function draw(){
    if(!ctx.isCurrent())return;
    const current=filtered();
    download.textContent=`↓ Скачать показанные (${current.length})`;
    downloadAll.textContent=`↓ Скачать все ${entries.length} · ${fmtBytes(fullBytes)}`;
    list.innerHTML="";
    for(const [id,g] of current){
      const card=el("a","audio-catalog__item");card.href=`#/place/${id}`;
      const info=el("span","audio-catalog__item-text");
      info.append(el("strong","",g.title),
        el("small","",`${areaNames.get(g.area)||"Другое"} · ${g.minutes} мин`));
      card.append(el("span","audio-catalog__item-icon","🎧"),info,
        el("span","audio-catalog__item-save",saved.has(id)?"✓ офлайн":"▶"));
      list.appendChild(card);
    }
    if(!current.length)list.appendChild(el("p","empty-state","Ничего не найдено."));
  }
  async function downloadSelection(selection){
    if(controller||!selection.length)return;
    confirmBox.hidden=true;
    controller=new AbortController();
    const signal=controller.signal;
    download.disabled=true;downloadAll.disabled=true;cancel.hidden=false;
    let done=0,skipped=0,errors=0;
    for(const [id,g] of selection){
      if(!ctx.isCurrent()||signal.aborted)break;
      status.textContent=`Загружаем ${done+skipped+errors+1} из ${selection.length}: ${g.title}…`;
      try{
        if(saved.has(id))skipped++;
        else{await saveAudio(g,{signal});saved.add(id);done++;}
      }catch(e){
        if(signal.aborted)break;
        errors++;
        status.textContent=`Не удалось загрузить ${g.title}: ${e?.message||"ошибка"}`;
      }
      draw();
    }
    if(ctx.isCurrent()){
      status.textContent=`Сохранено новых: ${done}. Уже было: ${skipped}. Ошибок: ${errors}.`+
        (signal.aborted?" Загрузка остановлена.":"");
      controller=null;
      download.disabled=!audioCacheAvailable();
      downloadAll.disabled=!audioCacheAvailable();
      cancel.hidden=true;
      draw();
    }
  }
  region.addEventListener("change",draw);
  search.addEventListener("input",draw);
  download.addEventListener("click",()=>downloadSelection(filtered()));
  cancel.addEventListener("click",()=>controller?.abort());
  downloadAll.addEventListener("click",()=>{
    if(controller)return;
    confirmBox.hidden=false;
    confirmStart.focus();
  });
  confirmNo.addEventListener("click",()=>{confirmBox.hidden=true;downloadAll.focus();});
  confirmStart.addEventListener("click",()=>downloadSelection(entries));
  draw();
  if(ctx.query.get("download")==="all"){
    confirmBox.hidden=false; // Show consent on incoming excursions link, never download automatically.
  }
}
