// Расстояние по прямой между двумя точками и его формат для интерфейса.
// Контракт зафиксирован в PLACES-IMPLEMENTATION.md §7 и перенесён без
// изменений. Модуль чистый: не знает ни про DOM, ни про storage, ни про
// location (PRODUCT.md 10.3).

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function isPoint(point) {
  return Boolean(point) && Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

// Расстояние по прямой (формула гаверсинусов, PRODUCT.md 8.4) между точками
// WGS-84 { lat, lng }. Возвращает километры; NaN, если точка задана неверно.
export function haversineKm(from, to) {
  if (!isPoint(from) || !isPoint(to)) return NaN;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// «~3,4 км» до 10 км (один знак, запятая), «~27 км» от 10 км (целое) —
// D-11, PRODUCT.md 8.4. Округление до 0,1 выбирает формат (9,96 км даёт
// «~10 км», а не «~10,0 км»); целое значение считается от исходных
// километров, иначе 14,479 км дало бы «~15 км» вместо «~14 км» ([К3-6]).
// То, что округляется до 0,0, показываем как «менее 0,1 км» (решение
// владельца, ITERATION-3-CLOSEOUT.md): «~0,0 км» читается как ошибка.
// Меняется только текст — расчёт и сортировка идут по исходным километрам.
// Время в пути не показываем никогда (D-11, X-12).
export function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  const rounded = Math.round(km * 10) / 10;
  if (rounded === 0) return "менее 0,1 км";
  if (rounded < 10) return `~${rounded.toFixed(1).replace(".", ",")} км`;
  return `~${Math.round(km)} км`;
}
