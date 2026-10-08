#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve, root, runCases } from './helpers.mjs';
import { instrument, browserInit } from './instrument.mjs';

if (!process.env.ASHWORTH_PLAYWRIGHT) throw new Error('Set ASHWORTH_PLAYWRIGHT to an externally installed playwright/index.mjs (see docs/TESTING.md).');
const { chromium } = await import(pathToFileURL(process.env.ASHWORTH_PLAYWRIGHT).href);
let browser;
try { browser = await chromium.launch({ headless: true, ...(process.env.ASHWORTH_CHROME ? { executablePath: process.env.ASHWORTH_CHROME } : {}) }); }
catch (error) {
  if (process.env.ASHWORTH_CHROME || !error.message.includes("Executable doesn't exist")) throw error;
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
}
const server = await serve();
const html = await readFile(join(root, 'index.html'), 'utf8');
const sizes = [[844,390],[390,844],[1024,768],[1280,720]];
const cases = [];
const add = (name, options, fn) => cases.push([name, async () => {
  const { viewport = { width:1280, height:720 }, touch = false, raw = false, primeCaches = false, ...init } = options;
  const context = await browser.newContext({ viewport, hasTouch:touch, isMobile:touch, serviceWorkers: raw ? 'allow' : 'block' });
  const errors = []; const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    if (!raw) {
      await context.addInitScript(browserInit, init);
      await page.route('**/*', async route => {
        if (new URL(route.request().url()).pathname === '/' || new URL(route.request().url()).pathname === '/index.html') {
          await route.fulfill({ status:200, contentType:'text/html', body:instrument(html) });
        } else await route.continue();
      });
    }
    if (primeCaches) {
      await page.goto(server.url+'/sw.js');
      await page.evaluate(async () => {
        await (await caches.open('another-game-v9')).put('/unrelated.txt',new Response('keep'));
        await (await caches.open('ashworth-v1')).put('/old.txt',new Response('old'));
      });
    }
    await page.goto(server.url, { waitUntil:'load' });
    if (!raw && !init.webglFail) await page.waitForFunction(() => !!window.__test);
    await fn(page, context, errors);
  } finally { await context.close(); }
}]);
const evaluate = (page, fn, arg) => page.evaluate(fn, arg);
// Native buttons take precedence as the menus gain semantics; IDs support baseline divs.
const action = async (page, name, fallback) => {
  const button=page.getByRole('button',{name});
  return await button.count() ? button : typeof fallback==='string' ? page.locator(fallback) : fallback;
};

add('normal boot: renderer, title, no uncaught errors', {}, async (page, context, errors) => {
  const result = await evaluate(page, () => { __test.render(); return {state:__test.state.gameState,memory:__test.memory()}; });
  assert.equal(result.state, 'menu'); assert.ok(result.memory.calls > 0); assert.deepEqual(errors, []);
  assert.ok(await page.locator('#panel h1').isVisible());
});
add('desktop difficulty/deploy/redeploy/resume gestures never fire', {}, async page => {
  await (await action(page,/^HERO$/i,'#dSurv')).click();
  assert.equal(await evaluate(page, () => __test.state.gameState), 'menu');
  await (await action(page,/DEPLOY/i,'#cta')).click();
  assert.equal(await evaluate(page, () => __test.state.gameState), 'playing');
  const ammo = {deploy:await evaluate(page, () => __test.weapons.pistol.ammo)};
  await evaluate(page, () => { __test.setup({fallbackLook:true}); __test.gameOver(); });
  await (await action(page,/REDEPLOY/i,page.getByText('CLICK TO REDEPLOY',{exact:true}))).click();
  ammo.redeploy=await evaluate(page, () => __test.weapons.pistol.ammo);
  await evaluate(page, () => {__test.weapons.pistol.ammo=15;__test.weapons.pistol.cool=0;__test.pause();});
  await (await action(page,/RESUME/i,'#pauseCta')).click();
  assert.equal(await evaluate(page, () => __test.state.gameState), 'playing');
  ammo.resume=await evaluate(page, () => __test.weapons.pistol.ammo);
  assert.deepEqual(ammo,{deploy:15,redeploy:15,resume:15},'menu gestures consumed rounds');
});
add('only canvas mouse gestures shoot; both mouse buttons release independently', {}, async page => {
  await evaluate(page,()=>{__test.startGame();__test.setup({fallbackLook:true});
    document.body.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));});
  assert.equal(await evaluate(page,()=>__test.weapons.pistol.ammo),15);
  await page.locator('#c').dispatchEvent('mousedown',{button:0,bubbles:true});
  assert.equal(await evaluate(page,()=>__test.weapons.pistol.ammo),14);
  await page.locator('#c').dispatchEvent('mousedown',{button:2,bubbles:true});
  assert.deepEqual(await evaluate(page,()=>({fire:__test.state.firing,aim:__test.state.aiming})),{fire:true,aim:true});
  await page.locator('#c').dispatchEvent('mouseup',{button:2,bubbles:true});
  assert.deepEqual(await evaluate(page,()=>({fire:__test.state.firing,aim:__test.state.aiming})),{fire:true,aim:false});
  await page.locator('#c').dispatchEvent('mouseup',{button:0,bubbles:true});
  assert.equal(await evaluate(page,()=>__test.state.firing),false);
});
add('forced WebGL failure: fallback, no exception, no frame', { webglFail:true }, async (page, context, errors) => {
  assert.match(await page.locator('#panel').innerText(), /WebGL|graphics/i);
  // Load has completed module execution; this task barrier lets pageerror delivery settle.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.deepEqual(errors, []);
  // Drain RAF once: a scheduled game loop must not hide behind our controlled clock.
  assert.equal(await page.evaluate(() => {__step(performance.now()+16);return window.__frameCount;}), 0);
});
for (const [width,height] of sizes) add(`seeded touch menus fit ${width}x${height}`, { viewport:{width,height}, touch:true }, async page => {
  async function checkMenu(actions) {
    const title = page.locator('#panel h1'); await title.scrollIntoViewIfNeeded();
    const box = await title.boundingBox(); assert.ok(box && box.y >= -1 && box.y + box.height <= height + 1, `clipped title ${JSON.stringify(box)}`);
    for (const locator of actions) {
      await locator.scrollIntoViewIfNeeded(); const b = await locator.boundingBox();
      assert.ok(b && b.x >= -1 && b.x+b.width <= width+1 && b.y >= -1 && b.y+b.height <= height+1, `unreachable control ${JSON.stringify(b)}`);
    }
  }
  await checkMenu([await action(page,/DEPLOY/i,'#cta'),await action(page,/^EASY$/i,'#dCasual'),await action(page,/^HERO$/i,'#dSurv')]);
  await evaluate(page, () => { __test.startGame();__test.pause(); });
  await checkMenu([await action(page,/RESUME/i,'#pauseCta')]);
  await evaluate(page, () => { __test.resume();__test.gameOver(); });
  await checkMenu([await action(page,/REDEPLOY/i,page.getByText('CLICK TO REDEPLOY',{exact:true})),await action(page,/QUIT/i,'#quitBtn')]);
  for(const label of await page.locator('#panel em').all()) {
    const stat=label.locator('..');await stat.scrollIntoViewIfNeeded();const box=await stat.boundingBox();
    assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1&&box.y>=-1&&box.y+box.height<=height+1,`clipped statistic ${JSON.stringify(box)}`);
  }
});
add('movement at 30/60/120 Hz: walk/sprint/aim/strafe and stop', {}, async page => {
  const results = await evaluate(page, () => {
    const rows = [];
    for (const mode of ['walk','sprint','aim','strafe']) for (const hz of [30,60,120]) {
      __test.startGame();for(const key in __test.keys)__test.keys[key]=false;
      __test.setup({aiming:mode==='aim',fallbackLook:false});
      Object.assign(__test.keys,{w:true,shift:mode==='sprint',d:mode==='strafe'});
      let distance=0;
      // Integrate actual velocity, resetting position to avoid station collisions/bounds.
      for(let i=0;i<hz*2;i++){__test.player.pos.set(0,1.68,30);__test.updatePlayer(1/hz);distance+=Math.hypot(__test.player.vel.x,__test.player.vel.z)/hz;} 
      for(const key in __test.keys)__test.keys[key]=false;
      for(let i=0;i<hz;i++)__test.updatePlayer(1/hz);
      rows.push({mode,hz,distance,stopped:__test.player.vel.length()});
    }
    return rows;
  });
  console.log('  movement', JSON.stringify(results));
  for(const mode of ['walk','sprint','aim','strafe']) {
    const rows=results.filter(r=>r.mode===mode), distances=rows.map(r=>r.distance);
    assert.ok(Math.max(...distances)-Math.min(...distances)<.15, `${mode} refresh-rate travel differs: ${distances}`);
    assert.ok(rows.every(r=>r.stopped<.01), `${mode} did not stop`);
  }
});
add('full restart resets held input, airborne/recoil/weapon transients', {}, async page => {
  const state = await evaluate(page, () => {
    __test.startGame();__test.dirty();__test.startGame();
    return { ...__test.state, onGround:__test.player.onGround, bob:__test.player.bob, bobAmt:__test.player.bobAmt, y:__test.player.y,vy:__test.player.vy,
      held:Object.values(__test.keys).some(Boolean),touchFire:__test.touch.fire,touchJump:__test.touch.jump,joy:__test.touch.joyOn,
      pumpZ:__test.weapons.shotgun.built.pump.position.z,
      weapons:Object.values(__test.weapons).map(w=>({pumping:w.pumping,bloom:w.bloom,kickZ:w.kickZ||0,kickR:w.kickR||0,flashTimer:w.flashTimer||0,opacity:w.flashMat.opacity,reloading:w.reloading,cool:w.cool}))};
  });
  for (const field of ['aiming','firing','held','touchFire','touchJump','joy']) assert.equal(state[field],false,field);
  assert.equal(state.onGround,true); assert.equal(state.pumpZ,-.36);
  for (const field of ['recoilP','recoilY','recoilVP','recoilVY','lookDX','lookDY','bob','bobAmt','y','vy']) assert.equal(state[field],0,field);
  for (const weapon of state.weapons) for(const [field,value] of Object.entries(weapon)) assert.equal(value,0,field);
});
add('focus loss clears held aim/fire and safely suspends', {}, async page => {
  const state = await evaluate(page, () => { __test.startGame();__test.dirty();window.dispatchEvent(new Event('blur'));return __test.state; });
  assert.equal(state.aiming,false);assert.equal(state.firing,false);assert.notEqual(state.gameState,'playing');
});
const validBest={waves:3,kills:4,acc:50,score:100,time:60,ngP:1};
const validBadges=[true,false,true,false,true];
const validSave={ngP:2,badges:validBadges,best:validBest};
const noBadges=[false,false,false,false,false];
const saves = [
  ['missing',undefined],['malformed','{bad json'],['null',null],['primitive',7],['array',[]],['unknown',{version:99}],
  ['old',{ngP:4,badges:[false],best:null},4],
  ['negative',{ngP:-5,badges:[true],best:{score:null}},0,[true,false,false,false,false]],
  ['wrong types',{ngP:'7',badges:[1,'x'],best:{score:'bad',time:-1}}],
  ['valid',validSave,2,validBadges,validBest],
  ['invalid best/valid progress',{ngP:3,badges:validBadges,best:{score:null}},3,validBadges],
  ['missing badges',{ngP:2,best:validBest},2,noBadges,validBest],
  ['wrong badges type',{ngP:2,badges:'true',best:validBest},2,noBadges,validBest],
  ['boolean badges only',{ngP:2,badges:[true,'true',1,null,false,true]},2,[true,false,false,false,false]],
  ['huge progression',{ngP:1e300,badges:[],best:{score:-5}}],
  ['fractional progression',{...validSave,ngP:1.5},0,validBadges,validBest],
  ['overflowing health',{...validSave,ngP:3000},0,validBadges,validBest],
  ['nonfinite progression','{"ngP":1e400,"badges":[true]}',0,[true,false,false,false,false]]
];
for (const [name,save,ngP=0,badge=noBadges,bestRun=null] of saves) add(`saved progress: ${name}`, {save}, async (page,context,errors) => {
  const state=await evaluate(page,()=>__test.state);
  assert.deepEqual({ngP:state.ngP,badge:state.badge,bestRun:state.bestRun},{ngP,badge,bestRun});
  await evaluate(page,()=>{__test.startGame();__test.gameOver();});
  if(bestRun){
    assert.deepEqual(await evaluate(page,()=>__test.state.bestRun),bestRun,'weaker run must not replace best score');
    assert.deepEqual(await evaluate(page,()=>JSON.parse(localStorage.getItem('ashworthSave'))),{ngP,badges:badge,best:bestRun});
  }
  assert.deepEqual(errors,[]);
});
add('saved progress: reload resets fields and validates every best metric', {save:validSave}, async page => {
  const result=await evaluate(page, ({validSave,noBadges}) => {
    const failures=[];
    const read=()=>{const {ngP,badge,bestRun}=__test.state;return {ngP,badge,bestRun};};
    const load=save=>{localStorage.setItem('ashworthSave',typeof save==='string'?save:JSON.stringify(save));__test.loadSave();return read();};
    for(const field of ['waves','kills','score','ngP','acc','time']) {
      const invalid=field==='acc'?[-1,101,'50',null,true]:field==='time'?[-1,'60',null,true]:[-1,.5,Number.MAX_SAFE_INTEGER+1,'1',null,true];
      for(const value of [...invalid,undefined]) {
        load(validSave);
        const state=load({...validSave,best:{...validSave.best,[field]:value}});
        if(state.ngP!==2||JSON.stringify(state.badge)!==JSON.stringify(validSave.badges)||state.bestRun!==null)failures.push({field,value,state});
      }
      const state=load(JSON.stringify(validSave).replace(`"${field}":${validSave.best[field]}`,`"${field}":1e400`));
      if(state.bestRun!==null)failures.push({field,value:'nonfinite',state});
    }
    for(const best of [true,100,'record',[],{}]) {
      const state=load({...validSave,best});if(state.bestRun!==null)failures.push({best,state});
    }
    for(const save of ['{bad json','null','[]','true','{}']) {
      load(validSave);const state=load(save);
      if(state.ngP!==0||JSON.stringify(state.badge)!==JSON.stringify(noBadges)||state.bestRun!==null)failures.push({save,state});
    }
    load(validSave);localStorage.removeItem('ashworthSave');__test.loadSave();const missing=read();
    load(validSave);Storage.prototype.getItem=()=>{throw new Error('storage disabled');};__test.loadSave();const disabled=read();
    return {failures,missing,disabled};
  },{validSave,noBadges});
  assert.deepEqual(result.failures,[]);
  for(const state of [result.missing,result.disabled])assert.deepEqual(state,{ngP:0,badge:noBadges,bestRun:null});
});
add('saved progress: health overflow boundary and valid best endpoints', {}, async page => {
  const result=await evaluate(page, validSave => {
    let limit=0;while(Number.isFinite(Math.pow(1.3,limit+1)*10000))limit++;
    const rows=[];
    for(const ngP of [limit,limit+1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1]) {
      localStorage.setItem('ashworthSave',JSON.stringify({...validSave,ngP}));__test.loadSave();rows.push({input:ngP,loaded:__test.state.ngP,best:__test.state.bestRun});
    }
    const bests=[];
    for(const acc of [0,100]){
      const best={waves:0,kills:0,score:Number.MAX_SAFE_INTEGER,ngP:Number.MAX_SAFE_INTEGER,acc,time:.5};
      localStorage.setItem('ashworthSave',JSON.stringify({...validSave,best}));__test.loadSave();bests.push({best,loaded:__test.state.bestRun});
    }
    return {limit,rows,bests};
  },validSave);
  assert.ok(result.limit>100);
  for(const row of result.rows){assert.equal(row.loaded,row.input===result.limit?result.limit:0);assert.deepEqual(row.best,validBest);}
  for(const row of result.bests)assert.deepEqual(row.loaded,row.best);
});
add('storage-disabled play still boots and ends safely', {storageDisabled:true}, async (page,context,errors) => {
  assert.deepEqual(await evaluate(page,()=>{const {ngP,badge,bestRun}=__test.state;return {ngP,badge,bestRun};}),{ngP:0,badge:noBadges,bestRun:null});
  await evaluate(page,()=>{__test.startGame();__test.gameOver();});
  assert.deepEqual(errors,[]);
});
for(const path of ['clear','corpse']) add(`GPU disposal plateau after warm-up: ${path}`, {}, async page => {
  const counts = await evaluate(page, path => {
    __test.startGame();__test.updatePlayer(1/60);__test.render();const counts=[];
    for(let cycle=0;cycle<7;cycle++) {
      for(const [i,type] of ['walker','runner','crawler','brute','conductor'].entries())__test.spawnZombie(type,(i-2)*1.5,0,20,{});
      __test.render();
      if(path==='clear')__test.clearEnemies();
      else { for(const enemy of __test.enemies){enemy.dead=true;enemy.fallDir=1;}for(let i=0;i<270;i++)__test.updateEnemies(1/60); }
      __test.render();counts.push(__test.memory());
      if(__test.enemies.length)throw new Error('cleanup left enemies');
    }
    return counts;
  }, path);
  console.log(`  ${path} resources`,JSON.stringify(counts));
  for(const field of ['geometries','textures','programs'])assert.ok(counts.at(-1)[field]<=counts[2][field]+1,`${field} grew after warm-up: ${counts.map(c=>c[field])}`);
});
add('recipes match wave queue for EASY/HERO and NG+ levels', {}, async page => {
  const recipes=await evaluate(page, () => {
    const rows=[];
    for(const casual of [true,false])for(const ngP of [0,1,5,100])for(const waveNum of [0,2,4,13,14]) {
      __test.startGame();__test.setup({casual,ngP,waveNum});__test.startWave();
      rows.push({casual,ngP,wave:__test.state.waveNum,queue:__test.wave.queue,length:__test.wave.composition.length,valid:__test.wave.composition.every(t=>['walker','runner','crawler','brute','conductor'].includes(t))});
    }return rows;
  });
  for(const row of recipes){assert.ok(row.valid);assert.equal(row.length,row.queue,JSON.stringify(row));}
});
add('scripted director reaches wave 15 victory and respects live cap', {}, async page => {
  const result=await evaluate(page, () => {
    __test.startGame();__test.setup({casual:true,ngP:0});let max=0,steps=0;const waves=[];
    while(__test.state.gameState==='playing'&&steps++<40000) {
      __test.updateTrain(1/30);__test.updateWaves(1/30);
      const alive=__test.enemies.filter(e=>!e.dead).length;max=Math.max(max,alive);
      if(alive>Math.min(30,12+Math.round(__test.state.waveNum*1.6)))throw new Error('live cap exceeded');
      if(__test.state.waveNum&&!waves.includes(__test.state.waveNum))waves.push(__test.state.waveNum);
      // Scripted kills avoid balance/random damage; director/spawn/train code remains actual.
      if(__test.wave.state==='fighting'||alive>=Math.min(30,12+Math.round(__test.state.waveNum*1.6)))__test.clearEnemies();
    }
    return {state:__test.state.gameState,waves,max,ngP:__test.state.ngP};
  });
  assert.equal(result.state,'won');assert.deepEqual(result.waves,Array.from({length:15},(_,i)=>i+1));assert.equal(result.ngP,1);assert.ok(result.max<=30);
});
add('normal weapon switch, deliberate shot and timed reload conserve ammo', {}, async page => {
  await evaluate(page, () => __test.startGame());
  for (const [key,name] of [['1','pistol'],['2','smg'],['3','shotgun']]) {
    await page.keyboard.press(key);
    await evaluate(page, () => { for(let i=0;i<30;i++)__test.updateWeapon(1/60);__test.fire(); });
    let w=await evaluate(page, name=>({ammo:__test.weapons[name].ammo,reserve:__test.weapons[name].reserve,mag:__test.weapons[name].def.mag}),name);
    assert.equal(w.ammo,w.mag-1,name);
    await page.keyboard.press('r');
    await evaluate(page, () => { for(let i=0;i<200;i++)__test.updateWeapon(1/60); });
    const loaded=await evaluate(page,name=>({ammo:__test.weapons[name].ammo,reserve:__test.weapons[name].reserve}),name);
    assert.equal(loaded.ammo,w.mag);assert.equal(loaded.reserve,w.reserve-1);
  }
});
add('real SW: primed offline query reload', {raw:true}, async (page,context,errors) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.goto(server.url+'/?offline=1',{waitUntil:'load'});
  assert.ok(await page.locator('#panel h1').isVisible());assert.deepEqual(errors,[]);
});
add('real SW: unrelated cache preservation', {raw:true,primeCaches:true}, async (page,context,errors) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(async () => (await caches.keys()).every(k=>k!=='ashworth-v1'));
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('another-game-v9'),'unrelated cache deleted');
  assert.deepEqual(errors,[]);
});

add('death, redeploy and quit-to-title transitions remain usable', {}, async page => {
  await evaluate(page,()=>{__test.startGame();__test.gameOver();});
  assert.equal(await evaluate(page,()=>__test.state.gameState),'over');
  await page.keyboard.press('q');
  assert.equal(await evaluate(page,()=>__test.state.gameState),'menu');
  assert.ok(await page.locator('#cta').isVisible());
  await evaluate(page,()=>{__test.startGame();__test.gameOver();__test.startGame();});
  assert.equal(await evaluate(page,()=>__test.state.gameState),'playing');
  assert.equal(await evaluate(page,()=>__test.player.hp),100);
});

if(process.argv.includes('--capture')) add('capture seeded scene and raw pre-clamp frame intervals (not device certification)', {}, async page => {
  const directory=process.env.ASHWORTH_ARTIFACTS||join(tmpdir(),`ashworth-capture-${Date.now()}`);await mkdir(directory,{recursive:true});
  await evaluate(page, () => {
    __test.startGame();__test.setup({fallbackLook:false});__test.player.pos.set(0,1.68,30);
    for(let i=0;i<30;i++)__test.spawnZombie(['walker','runner','crawler','brute','conductor'][i%5],(i%5-2)*1.7,0,10-Math.floor(i/5)*4,{});
    __test.updatePlayer(1/60);__test.render();
  });
  await page.screenshot({path:join(directory,'seeded-crowd.png')});
  const metrics=await page.evaluate(()=>new Promise(resolve=>{
    const intervals=[];let previous;
    function sample(now){if(previous!==undefined)intervals.push(now-previous);previous=now;__step(now);
      if(intervals.length<180)__nativeRAF(sample);else resolve({intervals,memory:__test.memory(),viewport:[innerWidth,innerHeight],pixelRatio:devicePixelRatio});}
    __nativeRAF(sample);
  }));
  metrics.seed=1984;metrics.commit=process.env.ASHWORTH_CAPTURE_LABEL||'label-unset';metrics.note='Raw wall-clock RAF intervals; desktop headless, not mobile thermal evidence.';
  await writeFile(join(directory,'performance.json'),JSON.stringify(metrics,null,2));console.log(`  artifacts: ${directory}`);
});
const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const selected = only ? cases.filter(([name])=>new RegExp(only,'i').test(name)) : cases;
try {
  assert.ok(selected.length,`No cases matched ${only}`);
  await runCases(selected);
} finally { await browser.close();await server.close(); }
