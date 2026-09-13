// Чистая логика для экрана «Подготовка»: группировка по этапам и
// форматирование даты проверки. Не обращается к DOM (PRODUCT.md 10.3:
// «logic/ не обращается к странице — только принимает и возвращает данные»).

import { PHASE_ORDER } from "./trip.js";

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatVerifiedDate(dateStr) {
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const monthIdx = parseInt(m, 10) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${parseInt(d, 10)} ${MONTHS[monthIdx]} ${y}`;
}

export function groupByPhase(items) {
  const groups = {};
  PHASE_ORDER.forEach((phase) => {
    groups[phase] = [];
  });
  items.forEach((item) => {
    if (groups[item.phase]) {
      groups[item.phase].push(item);
    }
  });
  // Внутри этапа критичные пункты — первыми (PRODUCT.md 8.7).
  PHASE_ORDER.forEach((phase) => {
    groups[phase].sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical)));
  });
  return groups;
}
