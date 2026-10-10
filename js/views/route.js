import { ROUTE_MODES, buildAmapRouteUrl } from "../logic/amap.js";

// «Как добраться» в карточке места и в карточке еды: кнопка раскрывает выбор
// режима маршрута — «На машине» или «Пешком». Каждая кнопка режима — обычная
// внешняя ссылка на Amap (logic/amap.js), открывается в новой вкладке или в
// приложении. Режим приложение не угадывает (см. ROUTE_MODES) и не
// запоминает: выбор явный и стоит одного нажатия. Подпись честно говорит,
// что маршрут строит внешний сервис и ему нужен интернет — сама карточка
// работает и без сети.

let nextId = 0;

// Возвращает [кнопка, панель выбора] — оба элемента вставляются в блок
// действий карточки (flex с переносом): панель занимает строку целиком.
export function createRouteControl(location, name) {
  nextId += 1;
  const panelId = `route-choice-${nextId}`;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn--secondary route-toggle";
  toggle.textContent = "Как добраться";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panelId);

  const panel = document.createElement("div");
  panel.className = "route-choice";
  panel.id = panelId;
  panel.hidden = true;

  const hint = document.createElement("p");
  hint.className = "route-choice__hint";
  hint.textContent = "Маршрут от вас откроется в Amap — нужен интернет.";
  panel.appendChild(hint);

  const modes = document.createElement("div");
  modes.className = "route-choice__modes";
  ROUTE_MODES.forEach((mode) => {
    const link = document.createElement("a");
    link.href = buildAmapRouteUrl(location, name, mode.id);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "btn btn--secondary route-choice__mode";
    link.dataset.mode = mode.id;
    link.textContent = mode.label;
    modes.appendChild(link);
  });
  panel.appendChild(modes);

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });

  return [toggle, panel];
}
