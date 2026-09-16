// «X км от вас» — расстояние от текущей позиции устройства до места/еды на
// карточке. Отдельная, самостоятельная механика поверх уже существующего
// Browser Geolocation API (js/views/places.js, «Рядом со мной», Итерация 8):
// не resolveOrigin() и не stg:trip.stay (D-11, trip.js) — та точка отсчёта
// остаётся «точкой проживания», а не текущей позицией на прогулке. «Рядом со
// мной» продолжает жить своей текущей механикой без изменений.
//
// Позиция живёт только в памяти этой вкладки (PRODUCT.md 6.4, D-26, D-28):
// не пишется в localStorage, никуда не отправляется, теряется при
// перезагрузке страницы. Модуль не знает про DOM (как distance.js рядом).

import { haversineKm } from "./distance.js";
import { isValidLocation } from "./amap.js";

let currentPosition = null;
let primePromise = null;

// Синхронное чтение уже известной позиции — не ждёт промис и не запрашивает
// геолокацию сама.
export function getKnownPosition() {
  return currentPosition;
}

// Обновление из любого места, где позиция уже реально запрошена явным
// действием пользователя (сейчас — «Рядом со мной» в places.js): один и тот
// же грант разрешения используется картой обеих механик, второй попап не
// нужен.
export function setKnownPosition(point) {
  currentPosition = point;
}

// Тихая попытка получить позицию БЕЗ показа диалога разрешения — только если
// разрешение уже выдано браузером раньше. Если разрешения ещё нет — ничего не
// запрашиваем и не показываем: отдельный popup ради карточки запускать
// нельзя. Сам браузерный запрос выполняется максимум один раз за сессию
// (кэшированный промис, а не флаг): и app.js на старте, и рендер карточки
// Place/Food (place.js, food.js) могут await-нуть один и тот же результат —
// это не новый вызов getCurrentPosition(), а ожидание уже идущего, поэтому
// карточка не рисуется быстрее, чем становится известно, есть ли позиция.
export function primeCurrentPosition() {
  if (!primePromise) {
    primePromise = (async () => {
      if (!("permissions" in navigator) || !("geolocation" in navigator)) return;
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state !== "granted") return;
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              currentPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
              resolve();
            },
            () => {
              // Разрешение есть, но координаты недоступны/ошибка — карточки
              // просто не покажут расстояние, отдельной ошибки нигде нет.
              resolve();
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        });
      } catch {
        // Permissions API недоступен или заблокирован — расстояние от
        // текущей позиции просто не показываем, карточка работает как обычно.
      }
    })();
  }
  return primePromise;
}

// «2,4 км от вас» — одна точность (0,1 км) на всех дистанциях, в отличие от
// formatDistance() (distance.js, D-11: «~N км», целые от 10 км) — это другой,
// вторичный элемент карточки, не связанный со списком «Рядом»/сортировкой и
// с точкой проживания. Округление до 0,0 не показываем — «0 км от вас»
// читалось бы как ошибка.
export function formatUserDistance(km) {
  if (!Number.isFinite(km)) return "";
  const rounded = Math.round(km * 10) / 10;
  if (rounded <= 0) return "";
  return `${rounded.toFixed(1).replace(".", ",")} км от вас`;
}

// Готовый текст для карточки Place/Food или "" — если текущей позиции нет,
// location отсутствует/{0,0}/NaN, либо результат округляется до 0.
export function userDistanceText(location) {
  if (!currentPosition || !isValidLocation(location)) return "";
  return formatUserDistance(haversineKm(currentPosition, location));
}
