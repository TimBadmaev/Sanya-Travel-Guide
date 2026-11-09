// Лента открытий v23: берёт фотографии и названия строго из verified-каталога.
// Карточка открывает старую подробную карточку: источники, Amap и паспорт живы.
import { loadConfig, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { getVisit } from "../logic/passport.js";

const tiles = [
  { id: "beach", icon: "🏖️", title: "Пляжи", copy: "Песок и море", image: "yalong-bay-beach-1.webp" },
  { id: "nature", icon: "🌿", title: "Природа", copy: "Тропики и виды", image: "yalong-tropical-forest-park-1.webp" },
  { id: "culture", icon: "🏯", title: "Культура", copy: "Истории острова", image: "nanshan-cultural-zone-1.webp" },
  { id: "market", icon: "🏮", title: "Местная жизнь", copy: "Рынки и вкусы", image: "sanya-bay-beach-1.webp" },
];
function el(parent, tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}
function photo(parent, file, alt, className) {
  const img = el(parent, "img", className);
  img.src = "assets/photos/" + file;
  img.alt = alt;
  img.loading = "eager";
  img.decoding = "async";
  return img;
}

export async function renderDiscover(container, ctx) {
  container.innerHTML = '<p class="loading">Ищем открытия…</p>';
  let places;
  try {
    [places] = await Promise.all([loadPlaces(), loadConfig()]);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    container.textContent = loadErrorMessage(err);
    const retry = el(container, "button", "btn btn--primary", "Повторить");
    retry.addEventListener("click", () => renderDiscover(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  const visits = storage.getPassport();
  container.replaceChildren();
  const page = el(container, "div", "discover");
  const hero = el(page, "section", "discover__hero");
  el(hero, "span", "discover__eyebrow", "ТВОЙ ПУТЕВОДИТЕЛЬ ПО ПРИКЛЮЧЕНИЯМ");
  el(hero, "h2", "", "Что откроем сегодня?");
  el(hero, "p", "", "В Санье столько всего интересного. Выбери, куда отправиться!");
  const search = el(hero, "a", "discover__search", "🔎 Найти место по названию");
  search.href = "#/places";

  el(page, "h3", "discover__heading", "Выбери настроение");
  const categories = el(page, "div", "discover__categories");
  tiles.forEach((tile) => {
    const a = el(categories, "a", "discover__category");
    a.href = "#/places?f=" + tile.id;
    photo(a, tile.image, "", "discover__category-photo");
    const overlay = el(a, "div", "discover__category-text");
    el(overlay, "span", "discover__category-icon", tile.icon);
    el(overlay, "strong", "", tile.title);
    el(overlay, "span", "", tile.copy);
  });

  const links = el(page, "div", "discover__shortcut-grid");
  [
    ["🌴", "10 дел на Хайнане", "Личные впечатления с отметками", "#/must-do"],
    ["🎟️", "Экскурсии", "Идеи для целого дня", "#/excursions"],
    ["🗺️", "Карта и маршруты", "Реальные улицы Саньи офлайн · A → B", "#/map"],
    ["🏝️", "Обзор Хайнаня", "Весь остров и бухты", "#/island"],
    ["🎧", "Аудиогиды", "33 истории и сохранение перед поездкой", "#/audio"],
    ["🍜", "Где поесть", "Кафе и местные блюда", "#/places?mode=food"],
    ["⭐", "Избранное", "Твои сохранённые места", "#/places?f=saved"],
    ["🧭", "Рядом", "Места около тебя", "#/places?near=1"],
  ].forEach(([icon, name, copy, href]) => {
    const a = el(links, "a", "discover__shortcut");
    a.href = href;
    el(a, "span", "discover__shortcut-icon", icon);
    const body = el(a, "span", "discover__shortcut-body");
    el(body, "strong", "", name);
    el(body, "small", "", copy);
    el(a, "span", "discover__shortcut-chevron", "›");
  });

  const row = el(page, "div", "discover__section-row");
  el(row, "h3", "", "Места, которые вдохновляют");
  const all = el(row, "a", "", "Все места ›");
  all.href = "#/places";
  const featured = places.filter((p) => Array.isArray(p.photos) && p.photos.length && p.category !== "shopping").slice(0, 5);
  const list = el(page, "div", "discover__featured");
  featured.forEach((place) => {
    const card = el(list, "a", "discover__place");
    card.href = "#/place/" + place.id;
    photo(card, place.photos[0].file, place.photos[0].alt || place.name.ru, "discover__place-photo");
    const body = el(card, "div", "discover__place-copy");
    const stamp = getVisit(visits, place.id);
    el(body, "span", "discover__place-eyebrow", stamp ? "✓ ТЫ ЗДЕСЬ БЫЛ" : "✦ ИДЕЯ ДЛЯ ОТКРЫТИЯ");
    el(body, "strong", "", place.name.ru);
    el(body, "p", "", place.summary);
  });
}
