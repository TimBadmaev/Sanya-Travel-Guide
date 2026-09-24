import { loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";

// Экран поездки (#/settings): даты и район проживания. Один экран в двух
// режимах — первый запуск и обычные настройки ([I3-9], MVP-UX-SPEC §8 п. 6
// «та же форма»). Оба поля необязательны: приложение полностью пригодно
// без настройки (D-08).

const SAVE_FAILED_TEXT = "Не удалось сохранить: хранилище браузера недоступно.";
// storage.getTrip() читает перевёрнутый период как «дат нет» ([I3-5]): без
// этого сообщения форма молча закрывалась, а даты исчезали (D-09).
const DATE_ORDER_TEXT = "Окончание поездки раньше начала — проверьте даты.";

// Значение radio «Пока не выбрано» — пустая строка (id района быть не может).
const AREA_NONE = "";

// То же для подвопроса «Где именно?»: пустая строка = точка не уточнена.
const SPOT_NONE = "";
const SPOT_NONE_LABEL = "Не знаю — считать от центра района";

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Поездка";
  container.appendChild(heading);

  const wrap = document.createElement("div");
  wrap.className = "error-state";
  const p = document.createElement("p");
  p.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--primary";
  btn.textContent = "Повторить";
  btn.addEventListener("click", onRetry);
  wrap.append(p, btn);
  container.appendChild(wrap);
}

function createDateField(labelText, id, value) {
  const field = document.createElement("div");
  field.className = "settings-field";

  const label = document.createElement("label");
  label.className = "settings-field__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "date";
  input.id = id;
  input.className = "settings-field__input";
  if (value) input.value = value;

  field.append(label, input);
  return { field, input };
}

// Длина ввода адреса и названия: адрес отеля заведомо короче, а поле не
// должно принимать вставку целого письма-подтверждения.
const TEXT_MAX_LENGTH = 200;

// Текстовое поле с подписью над ним: подписи длиннее, чем у дат.
function createTextField(labelText, id, value, multiline) {
  const field = document.createElement("div");
  field.className = "settings-field settings-field--stacked";

  const label = document.createElement("label");
  label.className = "settings-field__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement(multiline ? "textarea" : "input");
  if (multiline) {
    input.rows = 2;
  } else {
    input.type = "text";
  }
  input.id = id;
  input.className = "settings-field__input";
  input.maxLength = TEXT_MAX_LENGTH;
  input.autocomplete = "off";
  input.value = value || "";

  field.append(label, input);
  return { field, input };
}

export async function renderSettings(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let config;
  try {
    config = await loadConfig();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderSettings(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузился JSON.
    return;
  }

  const trip = storage.getTrip();
  const isFirstRun = trip.isFirstRun;

  // Сюда можно попасть тремя путями. Обычный переход с Главной и переход по
  // плашке со «Мест» оставляют в истории свою запись — уходим ctx.back() на
  // неё: список возвращается со своими фильтрами и прокруткой, а числа
  // пересчитываются при ре-рендере. Редирект первого запуска сделан
  // location.replace ([I3-10]), записи «#/» в истории нет, и history.back()
  // увёл бы из приложения — поэтому home.js помечает такой переход
  // параметром first=1, и выход делается replace.
  const replacedHome = ctx.query.get("first") === "1";
  const leave = () => {
    if (replacedHome) {
      window.location.replace("#/");
    } else {
      // ctx.from пуст при глубокой ссылке и перезагрузке — тогда на Главную.
      ctx.back(ctx.from || "#/");
    }
  };

  container.innerHTML = "";

  // «← Назад» без сохранения (Итерация 5, M8): в установленном приложении
  // нет кнопки «Назад» браузера. Выход тот же, что у «Готово». В первом
  // запуске кнопки нет — выход без сохранения там «Пропустить всё» ([I3-1]).
  if (!isFirstRun) {
    const backLink = document.createElement("a");
    backLink.href = ctx.from || "#/";
    backLink.className = "place-detail__back";
    backLink.textContent = "← Назад";
    backLink.addEventListener("click", (event) => {
      event.preventDefault();
      leave();
    });
    container.appendChild(backLink);
  }

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = isFirstRun ? "Когда и где вы будете?" : "Поездка";
  container.appendChild(heading);

  const intro = document.createElement("p");
  intro.className = "settings__intro";
  intro.textContent = isFirstRun
    ? "Оба поля необязательны. С ними экран «Сейчас» покажет то, что актуально, а места — расстояние от места вашего проживания."
    : "Даты, район и адрес можно изменить в любой момент.";
  container.appendChild(intro);

  const form = document.createElement("form");
  form.className = "settings-form";
  form.noValidate = true;

  // Блок 1 — даты.
  const datesSection = document.createElement("section");
  datesSection.className = "settings-section";
  const datesTitle = document.createElement("h3");
  datesTitle.className = "settings-section__title";
  datesTitle.textContent = "Когда поездка?";
  datesSection.appendChild(datesTitle);

  const start = createDateField("Начало", "trip-start", trip.start);
  const end = createDateField("Окончание", "trip-end", trip.end);
  datesSection.append(start.field, end.field);
  form.appendChild(datesSection);

  // Блок 2 — район проживания. Список — из config.areas (только verified) в
  // порядке файла; подписи и порядок меняются правкой config.json, не кода
  // (D-20). Ялунвань — обычный вариант списка.
  const areaSection = document.createElement("fieldset");
  areaSection.className = "settings-section settings-section--areas";
  const areaLegend = document.createElement("legend");
  areaLegend.className = "settings-section__title";
  areaLegend.textContent = "Где вы живёте?";
  areaSection.appendChild(areaLegend);

  const knownAreaIds = config.areas.map((area) => area.id);
  // Район, которого больше нет в справочнике, показывается как «Пока не
  // выбрано» (PRODUCT.md 9.7: удалённая сущность молча игнорируется).
  const currentArea = knownAreaIds.includes(trip.area) ? trip.area : AREA_NONE;

  // Точка проживания (ITERATION-3-LOCATION-REVIEW §6). Живёт в замыкании и
  // уходит в setTrip() целиком: белый список полей в storage.setTrip() иначе
  // потерял бы её при сохранении одних только дат (§5.3 ревью).
  let stay = trip.stay;
  // Ориентир принадлежит району: при смене района точка сбрасывается (L-4).
  // Возврат к исходному району возвращает и сохранённую точку.
  const stayForArea = (areaId) => (areaId === trip.area ? trip.stay : null);

  const areaOptions = [{ id: AREA_NONE, name: "Пока не выбрано" }, ...config.areas];
  areaOptions.forEach((area, index) => {
    const optionId = `trip-area-${index}`;
    // Обёртка, а не вложение в <label>: клик по вложенному radio не должен
    // попадать в label района.
    const group = document.createElement("div");
    group.className = "settings-option-group";

    const row = document.createElement("label");
    row.className = "settings-option";
    row.htmlFor = optionId;

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "trip-area";
    radio.id = optionId;
    radio.className = "settings-option__radio";
    radio.value = area.id;
    radio.checked = area.id === currentArea;

    const text = document.createElement("span");
    text.className = "settings-option__label";
    text.textContent = area.name;

    row.append(radio, text);
    group.appendChild(row);

    // Подвопрос «Где именно?» — только у района с ориентирами; блоков в
    // форме по-прежнему два (MVP-UX-SPEC §8). Он есть в разметке у каждого
    // такого района и скрыт, пока район не выбран: так смена района
    // перерисовывает не форму, а только видимость (прецедент — обновление
    // чипов в places.js без ре-рендера ряда).
    if (Array.isArray(area.spots) && area.spots.length) {
      const spotSection = document.createElement("fieldset");
      spotSection.className = "settings-subsection";
      spotSection.hidden = area.id !== currentArea;

      const spotLegend = document.createElement("legend");
      spotLegend.className = "settings-subsection__title";
      spotLegend.textContent = "Где именно?";
      spotSection.appendChild(spotLegend);

      const selectedSpotId =
        stayForArea(area.id) && stayForArea(area.id).source === "spot"
          ? stayForArea(area.id).spotId
          : SPOT_NONE;

      // «Не знаю» — первый вариант и значение по умолчанию: без него
      // поведение ровно сегодняшнее, расстояния от центра района (R6).
      const spotOptions = [...area.spots, { id: SPOT_NONE, name: SPOT_NONE_LABEL }];
      spotOptions.forEach((spot, spotIndex) => {
        const spotOptionId = `trip-spot-${index}-${spotIndex}`;
        const spotRow = document.createElement("label");
        spotRow.className = "settings-option settings-option--nested";
        spotRow.htmlFor = spotOptionId;

        const spotRadio = document.createElement("input");
        spotRadio.type = "radio";
        spotRadio.name = `trip-spot-${area.id}`;
        spotRadio.id = spotOptionId;
        spotRadio.className = "settings-option__radio";
        spotRadio.value = spot.id;
        spotRadio.checked = spot.id === selectedSpotId;
        spotRadio.addEventListener("change", () => {
          stay = spot.id ? { source: "spot", spotId: spot.id } : null;
        });

        const spotText = document.createElement("span");
        spotText.className = "settings-option__label";
        spotText.textContent = spot.name;

        spotRow.append(spotRadio, spotText);
        spotSection.appendChild(spotRow);
      });

      group.appendChild(spotSection);
    }

    areaSection.appendChild(group);
  });

  // Смена района: показываем подвопрос выбранного района, прячем остальные и
  // сбрасываем точку. Один делегированный слушатель, без ре-рендера формы.
  areaSection.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || target.name !== "trip-area") return;
    stay = stayForArea(target.value);
    const selectedStay = stay && stay.source === "spot" ? stay.spotId : SPOT_NONE;
    areaSection.querySelectorAll(".settings-option-group").forEach((group) => {
      const areaRadio = group.querySelector('input[name="trip-area"]');
      const spotSection = group.querySelector(".settings-subsection");
      if (!spotSection) return;
      const isSelected = areaRadio.value === target.value;
      spotSection.hidden = !isSelected;
      if (!isSelected) return;
      spotSection.querySelectorAll('input[type="radio"]').forEach((spotRadio) => {
        spotRadio.checked = spotRadio.value === selectedStay;
      });
    });
  });

  form.appendChild(areaSection);

  // Блок 3 — адрес проживания для таксиста (Q-15). Только в обычном режиме:
  // первый запуск остаётся двумя блоками (MVP-UX-SPEC §8). С районом и точкой
  // не связан: смена района адрес не сбрасывает.
  let addressInput = null;
  let nameInput = null;
  if (!isFirstRun) {
    const homeSection = document.createElement("section");
    homeSection.className = "settings-section";
    const homeTitle = document.createElement("h3");
    homeTitle.className = "settings-section__title";
    homeTitle.textContent = "Адрес для таксиста";
    homeSection.appendChild(homeTitle);

    const homeHint = document.createElement("p");
    homeHint.className = "settings__hint";
    homeHint.textContent =
      "Скопируйте адрес отеля на китайском из подтверждения брони или из Amap. Приложение адрес не проверяет — он откроется крупно в «Под рукой».";
    homeSection.appendChild(homeHint);

    const home = trip.home;
    const address = createTextField("Адрес на китайском", "trip-home-address", home ? home.addressZh : "", true);
    const name = createTextField("Название по-русски (необязательно)", "trip-home-name", home && home.nameRu, false);
    addressInput = address.input;
    nameInput = name.input;
    homeSection.append(address.field, name.field);
    form.appendChild(homeSection);
  }

  // Блок 4 — действия. «Готово» — в нижней половине экрана (PRODUCT.md 8.9).
  const actions = document.createElement("div");
  actions.className = "settings-actions";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn btn--primary";
  submitBtn.textContent = "Готово";
  actions.appendChild(submitBtn);

  const status = document.createElement("p");
  status.className = "settings__status";
  status.setAttribute("role", "status");

  // Сообщение о перевёрнутом периоде снимается, как только даты правят:
  // ошибка не «залипает» на исправленной форме.
  const clearDateError = () => {
    if (status.textContent === DATE_ORDER_TEXT) status.textContent = "";
  };
  [start.input, end.input].forEach((input) => {
    input.addEventListener("change", clearDateError);
    input.addEventListener("input", clearDateError);
  });

  function save(value) {
    if (!ctx.isCurrent()) return;
    if (!storage.setTrip(value)) {
      // Экран остаётся и не делает вид, что сохранил ([I3-6]).
      status.textContent = SAVE_FAILED_TEXT;
      return;
    }
    status.textContent = "";
    leave();
  }

  if (isFirstRun) {
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "settings-actions__skip";
    skipBtn.textContent = "Пропустить всё";
    // Ключ stg:trip всё равно создаётся — первый запуск больше не
    // показывается ([I3-1]).
    skipBtn.addEventListener("click", () => save({ start: null, end: null, area: null, stay: null, home: null }));
    actions.appendChild(skipBtn);
  }

  actions.appendChild(status);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = form.querySelector('input[name="trip-area"]:checked');
    // Обе даты заданы и перевёрнуты — не сохраняем и говорим об этом (D-09).
    // Одна из дат пустая — это нормальное «пока не знаю», проверять нечего.
    if (start.input.value && end.input.value && start.input.value > end.input.value) {
      status.textContent = DATE_ORDER_TEXT;
      end.input.focus();
      return;
    }
    save({
      start: start.input.value || null,
      end: end.input.value || null,
      area: selected && selected.value ? selected.value : null,
      stay,
      // Без поля адреса на экране (первый запуск) — передаём сохранённое
      // значение целиком, иначе белый список setTrip() его потеряет.
      home: addressInput ? { addressZh: addressInput.value, nameRu: nameInput.value } : trip.home,
    });
  });

  container.appendChild(form);

  // Iteration 9: копия всех данных пользователя — отдельный экран #/data.
  // В первом запуске копировать ещё нечего, но восстановить — можно.
  const dataLink = document.createElement("a");
  dataLink.href = "#/data";
  dataLink.className = "home-link settings__data-link";
  dataLink.textContent = isFirstRun ? "Восстановить данные из копии" : "Мои данные: копия и восстановление";
  container.appendChild(dataLink);
}
