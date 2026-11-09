// Offline filters for food. No services, no geolocation and no assumptions about missing prices.
export const FOOD_CUISINES = [
  { value: "any", label: "Любая кухня" },
  { value: "coconut", label: "Кокосовая курица" },
  { value: "seafood", label: "Морепродукты" },
  { value: "hainan", label: "Хайнаньская" },
  { value: "hotpot", label: "Хого / суп" },
  { value: "cantonese", label: "Кантонская" },
  { value: "noodles", label: "Лапша" },
  { value: "grill", label: "Гриль" },
  { value: "roast", label: "Утка" },
  { value: "dessert", label: "Десерты" },
  { value: "mixed", label: "Разная кухня / гастрозона" },
];

export const FOOD_PRICES = [
  { value: "any", label: "Любая цена" },
  { value: "under-60", label: "До 60 ¥/чел." },
  { value: "61-120", label: "61–120 ¥/чел." },
  { value: "over-120", label: "Больше 120 ¥/чел." },
  { value: "unknown", label: "Цена не указана" },
];

// Price filters apply ONLY to sourced average per-person checks. A missing
// number is not a cheap restaurant. Never infer price from "foodcourt" or cuisine.
export function foodPriceBand(item) {
  const amount = item && item.avgCheckCny;
  if (!Number.isFinite(amount) || amount <= 0 || !item.avgCheckSource) return "unknown";
  if (amount <= 60) return "under-60";
  if (amount <= 120) return "61-120";
  return "over-120";
}

// Facets combine with AND; "any" does not discard unpriced or untagged entries.
// The caller handles free-text search and "nearby" with existing shared logic.
export function applyFoodFacets(items, { area = "any", cuisine = "any", price = "any" } = {}) {
  return items.filter((item) =>
    (area === "any" || item.area === area) &&
    (cuisine === "any" || (Array.isArray(item.cuisines) && item.cuisines.includes(cuisine))) &&
    (price === "any" || foodPriceBand(item) === price)
  );
}
