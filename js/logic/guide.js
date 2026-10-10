// «Начните своё путешествие» — пять остановок на экране «Сейчас», которые
// по шагам знакомят с путеводителем. Чистые функции: без DOM, хранилища и
// адреса страницы (PRODUCT.md 10.3).
//
// Главное правило то же, что у паспорта: прогресс не хранится. Каждый шаг
// каждый раз выводится из данных, которые приложение и так ведёт: статус
// офлайн-копии, избранное, «Мой план», отметки паспорта и открытые наклейки.
// Флажков «шаг пройден» нет, поэтому шаг честно закрывается обратно, если
// данные изменились (место убрали из плана, отметку сняли). Действие, которое
// по данным проверить нельзя (например, «открыл каталог»), выполненным не
// считается — шаг ждёт следа в данных.

import { pluralizeRu } from "./trip.js";

export const GUIDE_STEP_IDS = ["prepare", "find", "plan", "memory", "sticker"];

const PLACE_WORDS = ["место", "места", "мест"];

function verifiedIds(ids, known) {
  return [...new Set((ids || []).filter((id) => typeof id === "string" && known.has(id)))];
}

// Места «Моего плана» в порядке дат, без повторов и без мест, которых нет в
// каталоге.
function plannedPlaceIds(myPlan, known) {
  const days = (myPlan && myPlan.days) || {};
  const ids = [];
  Object.keys(days)
    .sort()
    .forEach((date) => ids.push(...((days[date] && days[date].placeIds) || [])));
  return verifiedIds(ids, known);
}

// Вход:
//   offline        — состояние офлайн-копии из js/pwa.js → offlineState()
//                    ("ready", "partial", "not-ready", "unknown",
//                    "unsupported") или null, пока идёт проверка;
//   places         — verified-места (loadPlaces);
//   savedIds       — stg:saved;
//   myPlan         — stg:myplan;
//   journey        — visitJourney(): отметки паспорта по порядку;
//   stickersEarned — сколько наклеек открыто по расчёту паспорта, или null,
//                    если контент паспорта не загрузился (проверить нельзя).
// Результат: { steps, done, total, currentId }. У шага — id, title, text,
// icon, href (существующий экран), done, note (что видно в данных сейчас).
export function guideProgress({ offline = null, places = [], savedIds = [], myPlan = null, journey = [], stickersEarned = null } = {}) {
  const known = new Set(places.map((place) => place.id));
  const nameOf = (id) => {
    const place = places.find((p) => p.id === id);
    return place ? place.name.ru : "";
  };
  const saved = verifiedIds(savedIds, known);
  const planned = plannedPlaceIds(myPlan, known);
  const withNote = journey.filter((stop) => stop.visit.note);
  const last = journey.length ? journey[journey.length - 1] : null;
  const earned = Number.isInteger(stickersEarned) ? stickersEarned : 0;

  const offlineNote = {
    ready: "Офлайн-копия сохранена на этом телефоне.",
    unsupported: "В этом браузере офлайн-режим недоступен — подробности в «Подготовке».",
  };
  const firstCard = planned[0] || saved[0];

  const steps = [
    {
      id: "prepare",
      icon: "🎒",
      title: "Подготовьте путеводитель",
      text: "Откройте «Подготовку» и проверьте, что всё работает без интернета.",
      href: "#/prepare",
      done: offline === "ready",
      note: offline === null ? "Проверяем офлайн-копию…" : offlineNote[offline] || "Офлайн-копия ещё не готова — проверьте в «Подготовке».",
    },
    {
      id: "find",
      icon: "🔎",
      title: "Найдите место",
      text: "Загляните в каталог и сохраните то, что приглянулось, — ♡ в карточке.",
      href: "#/places",
      done: saved.length > 0 || planned.length > 0 || journey.length > 0,
      note: saved.length
        ? `В избранном: ${saved.length} ${pluralizeRu(saved.length, PLACE_WORDS)}.`
        : planned.length || journey.length
          ? "Место уже выбрано."
          : "Шаг отметится, когда место появится в избранном, плане или паспорте.",
    },
    {
      id: "plan",
      icon: "🗓",
      title: "Запланируйте посещение",
      text: "Откройте карточку места и нажмите «Добавить в мой план».",
      href: planned.length ? "#/plan" : saved[0] ? `#/place/${saved[0]}` : "#/places",
      done: planned.length > 0,
      note: planned.length
        ? `В плане: ${planned.length} ${pluralizeRu(planned.length, PLACE_WORDS)}.`
        : saved[0]
          ? `Можно начать с места «${nameOf(saved[0])}».`
          : "Шаг отметится, когда в «Моём плане» появится место.",
    },
    {
      id: "memory",
      icon: "📝",
      title: "Сохраните воспоминание",
      text: "В карточке места нажмите «Отметить посещение» и добавьте заметку.",
      href: withNote.length ? "#/passport/journey" : last ? `#/place/${last.place.id}` : firstCard ? `#/place/${firstCard}` : "#/places",
      done: withNote.length > 0,
      note: withNote.length
        ? `Отмечено: ${journey.length} ${pluralizeRu(journey.length, PLACE_WORDS)}, с заметкой — ${withNote.length}.`
        : last
          ? `Отметка есть — осталось добавить заметку к месту «${last.place.name.ru}».`
          : "Шаг отметится, когда у отмеченного места появится заметка.",
    },
    {
      id: "sticker",
      icon: "🏷️",
      title: "Получите первую наклейку",
      text: "Откройте альбом паспорта и посмотрите, как открываются наклейки.",
      href: "#/passport/album",
      done: earned > 0,
      note: earned > 0
        ? `Открыто наклеек: ${earned}.`
        : "Наклейки открываются сами, когда отмеченные места подходят под условие.",
    },
  ];

  const current = steps.find((step) => !step.done) || null;
  return {
    steps,
    done: steps.filter((step) => step.done).length,
    total: steps.length,
    currentId: current ? current.id : null,
  };
}
