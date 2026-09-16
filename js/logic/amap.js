// «Как добраться» — маршрут до места во внешнем приложении Amap (AMAP Global,
// D-02, D-12, PRODUCT.md 8.5, разрешение открытого Q-03). Документированный
// URI route-planning механизм: https://lbs.amap.com/api/uri-api/guide/travel/route
// (проверено точечно 2026-09-16). Модуль чистый: не знает ни про DOM, ни про
// storage (PRODUCT.md 10.3), как distance.js рядом.
//
// Координатный нюанс (R-05, D-19): у документированного uri.amap.com/navigation
// нет параметра пересчёта системы координат (в отличие от отдельного
// uri.amap.com/marker, где документирован coordinate=gaode|wgs84). Проект
// хранит координаты в WGS-84 — они передаются как есть, без самодельного
// пересчёта в GCJ-02: это осознанный компромисс владельца, а не недосмотр.
// Возможное смещение точки в Китае — уже известный и принятый риск R-05;
// «Показать таксисту» с китайским адресом остаётся точным запасным вариантом
// и существует отдельно от этой кнопки.

// Валидные, отличные от «нулевого острова» координаты — черновики вроде
// bohou-village хранят location: { lat: 0, lng: 0 } как явную заглушку, а не
// реальную точку; loadPlaces()/loadFood() и так скрывают черновики (D-18), но
// проверка остаётся на случай неполных данных у verified-записи.
export function isValidLocation(location) {
  return (
    Boolean(location) &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    !(location.lat === 0 && location.lng === 0)
  );
}

// to=lon,lat[,name] (долгота, затем широта — формат uri.amap.com/navigation);
// from не задаём — при пустом start Amap на мобильном устройстве сама берёт
// текущую позицию пользователя (документированное поведение). mode=walk —
// пешеходный маршрут. callnative=1 — попытка открыть приложение Amap, если
// оно установлено; страница https://uri.amap.com сама остаётся рабочей
// веб-страницей, если приложения нет (официальный H5-запасной вариант,
// никаких дополнительных проверок наличия приложения не требуется).
export function buildAmapWalkingUrl(location, name) {
  const to = `${location.lng},${location.lat},${encodeURIComponent(name)}`;
  return `https://uri.amap.com/navigation?to=${to}&mode=walk&callnative=1`;
}
