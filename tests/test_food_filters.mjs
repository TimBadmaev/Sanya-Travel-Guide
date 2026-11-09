import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFoodFacets, foodPriceBand, FOOD_CUISINES, FOOD_PRICES } from "../js/logic/food-filters.js";

const raw=JSON.parse(readFileSync(new URL("../data/food.json",import.meta.url)));
const items=raw.filter(x=>x.status==="verified");
const cuisineIds=new Set(FOOD_CUISINES.slice(1).map(x=>x.value));

test("food records have unique IDs and supported cuisine tags",()=>{
 assert.equal(raw.length,32);
 assert.equal(items.length,31);
 assert.equal(new Set(raw.map(x=>x.id)).size,raw.length);
 for(const x of raw){
   assert.ok(Array.isArray(x.cuisines)&&x.cuisines.length,x.id);
   assert.ok(x.cuisines.every(t=>cuisineIds.has(t)),x.id);
 }
});
test("missing average price never turns into cheap food",()=>{
 const noPrice=items.find(x=>x.id==="yalong-yatai-pinzhi-qingbuliang");
 assert.equal(foodPriceBand(noPrice),"unknown");
 assert.ok(applyFoodFacets(items,{price:"unknown"}).some(x=>x.id===noPrice.id));
 assert.ok(!applyFoodFacets(items,{price:"under-60"}).some(x=>x.id===noPrice.id));
});
test("sourced averages respect exact price bands",()=>{
 const prices=items.filter(x=>Number.isFinite(x.avgCheckCny));
 assert.equal(prices.length,11);
 assert.equal(prices.length,items.length-applyFoodFacets(items,{price:"unknown"}).length);
 for(const x of prices){
   assert.ok(Number.isInteger(x.avgCheckCny)&&x.avgCheckCny>0,x.id);
   assert.ok(x.avgCheckSource.startsWith("https://"),x.id);
 }
 assert.equal(foodPriceBand(items.find(x=>x.id==="city-huajie-qingbuliang-desserts")),"under-60");
 assert.equal(foodPriceBand(items.find(x=>x.id==="yalong-yatai-xiaohaitun-seafood")),"over-120");
 assert.equal(FOOD_PRICES.length,5);
});
test("filters combine by AND and preserve original order",()=>{
 const area=applyFoodFacets(items,{area:"yalong"});
 assert.equal(area.length,16);
 const coconut=applyFoodFacets(items,{area:"yalong",cuisine:"coconut"});
 assert.equal(coconut.length,4);
 const priced=applyFoodFacets(items,{area:"yalong",cuisine:"coconut",price:"61-120"});
 assert.deepEqual(priced.map(x=>x.id),["yalong-dongrong-yexiaoji","yalong-yatai-diadia-coconut-chicken"]);
 assert.equal(applyFoodFacets(items,{area:"yalong",cuisine:"coconut",price:"over-120"}).length,0);
 assert.equal(applyFoodFacets(items).length,items.length);
 assert.equal(applyFoodFacets(items,{area:"unlisted"}).length,0);
});
