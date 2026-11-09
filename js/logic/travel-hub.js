// Contextual travel shortcuts: deterministic, no location permission or network.
import { TRIP_STATE } from "./trip.js";

export function travelActions(state, { hasHotel = false, today = "", plannedToday = false } = {}) {
  const base = [
    { icon: "🗺️", label: "Офлайн-карта", href: "#/map" },
    { icon: "🎮", label: "Игры", href: "#/games" },
  ];
  if (state.state === TRIP_STATE.DURING) {
    return {
      kicker: "ПОМОЩНИК В ПОЕЗДКЕ",
      title: "Что пригодится сегодня?",
      subtitle: plannedToday ? "На сегодня есть сохранённые планы." : "Спокойный день? Найди место рядом или открой план.",
      primary: { icon: "📅", label: plannedToday ? "Мой план на сегодня" : "Что делать сегодня", href: plannedToday ? "#/plan/" + today : "#/now" },
      actions: [
        { icon: "🍜", label: "Поесть рядом", href: "#/places?mode=food&near=1" },
        { icon: "🏨", label: hasHotel ? "Адрес отеля" : "Указать отель", href: hasHotel ? "#/handy/taxi" : "#/settings?section=home" },
        { icon: "🀄", label: "Показать по-китайски", href: "#/handy" },
        ...base,
      ],
    };
  }
  if (state.state === TRIP_STATE.BEFORE || state.state === TRIP_STATE.NO_DATES) {
    return {
      kicker: "ВСЁ ПЕРЕД ВЫЛЕТОМ",
      title: "Готовимся без суеты",
      subtitle: "Проверь офлайн-копию и сохрани необходимые материалы заранее.",
      primary: { icon: "📶", label: "Проверить офлайн-готовность", href: "#/offline" },
      actions: [
        { icon: "🧳", label: "Чек-лист", href: "#/prepare" },
        { icon: "🎧", label: "Скачать аудиогиды", href: "#/audio?download=all" },
        { icon: "🏨", label: hasHotel ? "Адрес отеля" : "Указать отель", href: hasHotel ? "#/handy/taxi" : "#/settings?section=home" },
        ...base,
      ],
    };
  }
  return {
    kicker: "МОЯ ИСТОРИЯ",
    title: "Путешествие продолжается в воспоминаниях",
    subtitle: "Сохрани открытую карту, заметки и достижения.",
    primary: { icon: "📸", label: "Мой путь по Санье", href: "#/passport/journey" },
    actions: [
      { icon: "💾", label: "Сохранить данные", href: "#/data" },
      { icon: "⭐", label: "Альбом", href: "#/passport/album" },
      ...base,
    ],
  };
}
