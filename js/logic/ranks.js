// Звания путешественника. Вычисляются из текущего XP,
// без отдельного хранилища и возможности накрутить награды кликами.
export const RANKS = Object.freeze([
  { min: 0, title: "Новичок острова", icon: "🧭", prize: "Компас первых открытий" },
  { min: 100, title: "Пляжный следопыт", icon: "🐚", prize: "Жемчужная ракушка" },
  { min: 300, title: "Морской исследователь", icon: "🐬", prize: "Медаль морских историй" },
  { min: 600, title: "Хранитель тропиков", icon: "🌺", prize: "Тропическая орхидея" },
  { min: 1000, title: "Мастер приключений", icon: "🦀", prize: "Золотой краб Хайнаня" },
  { min: 1500, title: "Легенда Хайнаня", icon: "👑", prize: "Корона исследователя" },
]);
export function rankForXp(value) {
  const xp = Math.max(0, Math.floor(Number(value) || 0));
  let index = 0;
  while (index < RANKS.length - 1 && xp >= RANKS[index + 1].min) index++;
  const current = RANKS[index];
  const next = RANKS[index + 1] || null;
  return {
    ...current, xp, number: index + 1, unlocked: index + 1,
    total: RANKS.length, next,
    remaining: next ? next.min - xp : 0,
    percent: next ? Math.round((xp - current.min) / (next.min - current.min) * 100) : 100,
  };
}
