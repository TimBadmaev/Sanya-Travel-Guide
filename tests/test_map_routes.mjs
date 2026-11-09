import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildAmapBetweenRouteUrl,buildYandexRouteUrl} from "../js/logic/amap.js";

const roads=JSON.parse(readFileSync(new URL("../data/sanya-roads.json",import.meta.url),"utf8"));

test("real ODbL street paths are sourced and cover key tourist areas",()=>{
  assert.match(roads.source,/OpenStreetMap/);
  assert.match(roads.sourceUrl,/openstreetmap.org\/copyright/);
  assert.ok(roads.roads.length>=1200,"Road network too sparse");
  for(const area of ["yalong","city","dadonghai","haitang","tianya"]){
    assert.ok(roads.areas[area]>=100,area);
  }
  for(const [kind,p] of roads.roads){
    assert.ok(Number.isInteger(kind)&&kind>=0&&kind<=6);
    assert.ok(p.length>=2);
    for(const [lng,lat] of p)assert.ok(lng>108.5&&lng<111&&lat>17.9&&lat<20.5);
  }
});

test("Amap H5 route links accept two known places or device position",()=>{
 const a={lat:18.232,lng:109.64},b={lat:18.253,lng:109.508};
 const both=buildAmapBetweenRouteUrl(a,b,"Ялунвань","Санья","walk");
 assert.ok(both.startsWith("https://uri.amap.com/navigation?"));
 assert.match(both,/from=109\.64,18\.232/);
 assert.match(both,/to=109\.508,18\.253/);
 assert.match(both,/mode=walk/);
 const current=buildAmapBetweenRouteUrl(null,b,"Моё местоположение","Центр","car");
 assert.match(current,/from=&to=109\.508,18\.253/);
 assert.match(current,/mode=car/);
 assert.throws(()=>buildAmapBetweenRouteUrl(a,{lat:0,lng:0}),/координаты/i);
});

test("Yandex route remains optional alternative, never fabricated local routing",()=>{
 const a={lat:18.232,lng:109.64},b={lat:18.253,lng:109.508};
 const x=buildYandexRouteUrl(a,b,"walk");
 assert.match(x,/yandex\.ru\/maps/);
 assert.match(decodeURIComponent(x),/rtext=18\.232,109\.64~18\.253,109\.508/);
 assert.match(x,/rtt=pd/);
 assert.match(buildYandexRouteUrl(null,b,"car"),/rtt=auto/);
});

test("dark hero uses a luminous non-emoji sun and photos are not over-darkened",()=>{
 const css=readFileSync(new URL("../css/island.css",import.meta.url),"utf8");
 const app=readFileSync(new URL("../js/views/adventure.js",import.meta.url),"utf8");
 assert.ok(css.includes(".quest-app .quest-intro::after"));
 assert.ok(css.includes("radial-gradient(circle at 43% 46%"));
 assert.ok(css.includes("brightness(1.13)"));
 assert.ok(app.includes("rgba(5,22,41,.62),rgba(5,22,41,.04)"));
});
