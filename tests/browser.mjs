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
// Optional coordinator source is read-only; assets/server/raw SW cases stay in this checkout.
const html = await readFile(join(process.env.ASHWORTH_SOURCE || root, 'index.html'), 'utf8');
const sizes = [[844,390],[390,844],[1024,768],[1280,720]];
const cases = [];
const add = (name, options, fn) => cases.push([name, async () => {
  const { viewport = { width:1280, height:720 }, touch = false, raw = false, primeCaches = false, reducedMotion = 'no-preference', ...init } = options;
  const context = await browser.newContext({ viewport, hasTouch:touch, isMobile:touch, reducedMotion, serviceWorkers: raw ? 'allow' : 'block' });
  const errors = []; const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  let failure;
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
  } catch(error) { failure=error; }
  finally {
    // Let asynchronous event/rejection delivery settle, even when an assertion failed.
    try { await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,0))); }
    catch(error) { failure ||= error; }
    await context.close();
  }
  if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors.map(message=>new Error(message))],
    `Uncaught pageerror fails this case: ${errors.join('; ')}${failure ? `; assertion: ${failure.message}` : ''}`);
  if(failure)throw failure;
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
  await evaluate(page, () => { __test.resume(true);__test.gameOver(); });
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
      pumpZ:__test.weapons.shotgun.built.pump.position.z,stepT:__test.player.stepT,shake:__test.player.shake,
      muzzle:__test.muzzleLight.intensity,heldDetail:__test.held(),
      weapons:Object.values(__test.weapons).map(w=>({pumping:w.pumping,bloom:w.bloom,kickZ:w.kickZ||0,kickR:w.kickR||0,flashTimer:w.flashTimer||0,raise:w.raise||0,reloadMax:w.reloadMax||0,opacity:w.flashMat.opacity,reloading:w.reloading,cool:w.cool}))};
  });
  for (const field of ['aiming','firing','held','touchFire','touchJump','joy']) assert.equal(state[field],false,field);
  assert.equal(state.onGround,true); assert.equal(state.pumpZ,-.36);
  for (const field of ['recoilP','recoilY','recoilVP','recoilVY','lookDX','lookDY','fbX','fbY','bob','bobAmt','y','vy','stepT','shake','muzzle']) assert.equal(state[field],0,field);
  assert.deepEqual(state.heldDetail.touch,{joyId:-1,joyOn:false,joyX:0,joyZ:0,joyMag:0,lookId:-1,fire:false,jump:false});
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
// Safety regressions exercise actual simulation functions; absent parent APIs fail explicitly.
const enemyTypes=['walker','runner','crawler','brute','conductor'];
const pending = (value, name) => assert.ok(value,`PENDING parent feature/API: ${name}`);
for(const type of enemyTypes)for(const source of ['flank','door'])add(`safe ${source} spawns: ${type}, both edges and ends, seeded entrances`, {}, async page=>{
  const result=await evaluate(page,({type,source})=>{
    __test.startGame();__test.setup({waveNum:3});__seed(1984);
    const failures=[],entrances=new Set(),minByEntrance={};let count=0,min=Infinity;
    for(const x of [-6,6])for(const z of [-39,0,39])for(let iteration=0;iteration<64;iteration++){
      __test.clearEnemies();__test.player.pos.set(x,1.68,z);
      if(source==='door'){
        __test.wave.src='door';__test.wave.queue=1;__test.wave.composition=[type];
        __test.trainState.mode='open';__test.trainState.z=0;__test.train.position.z=0;__test.spawnOne();
      }else __test.spawnFlank(type);
      if(__test.enemies.length!==1)throw new Error('spawn must create exactly one enemy');
      const e=__test.enemies[0],distance=Math.hypot(e.pos.x-x,e.pos.z-z);count++;min=Math.min(min,distance);
      const entrance=e.state==='exit'?'train-door':e.pos.y>0?'elevated':Math.abs(e.pos.x)>__test.limits.PLAT?'track-bed':Math.abs(e.pos.x)<=1.6?'alcove':'platform';
      entrances.add(entrance);minByEntrance[entrance]=Math.min(minByEntrance[entrance]??Infinity,distance);
      if(distance<7-1e-9&&failures.length<8)failures.push({x,z,iteration,spawn:e.pos.toArray(),distance,state:e.state});
      if(source==='door'&&__test.wave.queue!==0)throw new Error('door fallback did not consume exactly one queue entry');
    }
    __test.clearEnemies();return {count,min,minByEntrance,entrances:[...entrances],failures};
  },{type,source});
  console.log(`  ${source}/${type}`,JSON.stringify(result));
  assert.deepEqual(result.failures,[],'every entrance, including near-end bed/near-door fallbacks, needs >=7 horizontal metres');
  for(const entrance of ['track-bed',...(type==='crawler'?[]:['alcove','platform']),...(source==='door'?['train-door']:[])])
    assert.ok(result.entrances.includes(entrance),`seed did not exercise ${entrance}`);
});
for(const type of enemyTypes)add(`near train-door placement rejects ${type} in favour of safe flank`, {}, async page=>{
  const result=await evaluate(page,type=>{
    __test.startGame();__test.setup({waveNum:3});__test.player.pos.set(-6,1.68,0);
    __test.wave.src='door';__test.wave.queue=1;__test.wave.composition=[type];
    __test.trainState.mode='open';__test.trainState.z=0;__test.train.position.z=0;
    const centre=__test.trainDoors.findIndex((_,i)=>Math.abs(__test.trainDoorWorldZ(i))<.01);
    if(centre<0)throw new Error('no centre door in train setup');
    // First draw selects door path, second chooses centre door, next two centre its placement.
    const original=Math.random,draws=[.99,(centre+.5)/__test.trainDoors.length,.5,.5];
    try{Math.random=()=>draws.length?draws.shift():original();__test.spawnOne();}finally{Math.random=original;}
    const e=__test.enemies[0];return {type:e.type,state:e.state,spawn:e.pos.toArray(),distance:Math.hypot(e.pos.x+6,e.pos.z),queue:__test.wave.queue};
  },type);
  assert.equal(result.type,type);assert.equal(result.queue,0);assert.notEqual(result.state,'exit',JSON.stringify(result));
  assert.ok(result.distance>=7-1e-9,JSON.stringify(result));assert.ok(result.spawn[1]<=0,JSON.stringify(result));
});
add('no elevated spawns or ground route for any enemy type', {}, async page=>{
  const result=await evaluate(page,()=>{
    __test.startGame();__test.setup({waveNum:15});__seed(42);
    const elevated=[];let count=0;
    for(const type of ['walker','runner','crawler','brute','conductor'])for(const x of [-6,6])for(const z of [-39,0,39])for(let i=0;i<32;i++){
      __test.clearEnemies();__test.player.pos.set(x,1.68,z);__test.spawnFlank(type);count++;
      const e=__test.enemies[0];if((e.pos.y>0||e.pos.z<__test.limits.Z_MIN+.55||e.pos.z>__test.limits.Z_MAX-.55)&&elevated.length<8)
        elevated.push({type,player:[x,z],spawn:e.pos.toArray()});
    }
    __test.clearEnemies();return {count,elevated};
  });
  console.log('  elevated route',JSON.stringify(result));assert.deepEqual(result.elevated,[]);
});
for(const pushedBy of ['blocker','enemy'])add(`player end clamps after ${pushedBy} collision pushes`, {}, async page=>{
  const rows=await evaluate(page,pushedBy=>{
    __test.startGame();const rows=[],original=__test.blockers.splice(0);
    try{
      for(const x of [-6,0,6])for(const end of [-1,1]){
        __test.clearEnemies();__test.blockers.length=0;
        const z=end<0?__test.limits.Z_MIN+3:__test.limits.Z_MAX-3;
        __test.player.pos.set(x,1.68,z);__test.player.vel.set(0,0,0);
        const obstacle={x,z:z-end*.2,r:1};
        if(pushedBy==='blocker')__test.blockers.push(obstacle);else __test.spawnZombie('brute',x,0,obstacle.z,{});
        __test.updatePlayer(.05);rows.push({x,end,z:__test.player.pos.z,y:__test.player.y});
      }
    }finally{__test.blockers.splice(0,__test.blockers.length,...original);__test.clearEnemies();}
    return {rows,min:__test.limits.Z_MIN+3,max:__test.limits.Z_MAX-3};
  },pushedBy);
  for(const row of rows.rows){assert.ok(row.z>=rows.min&&row.z<=rows.max,JSON.stringify(row));assert.equal(row.y,0,JSON.stringify(row));}
});
add('enemy end clamps after crowd/blocker steering pushes at platform level', {}, async page=>{
  const result=await evaluate(page,()=>{
    __test.startGame();const original=__test.blockers.splice(0),rows=[];
    try{
      for(const type of ['walker','runner','crawler','brute','conductor'])for(const x of [-6,0,6])for(const end of [-1,1]){
        __test.clearEnemies();__test.blockers.length=0;
        const limit=end<0?__test.limits.Z_MIN+.55:__test.limits.Z_MAX-.55;
        __test.player.pos.set(x,1.68,end*60);
        const e=__test.spawnZombie(type,x,0,limit+end*.1,{});
        e.speed=10;__test.spawnZombie('brute',x,0,limit-end*.3,{});
        __test.blockers.push({x,z:limit-end*.2,r:1});
        for(let i=0;i<4;i++)__test.updateEnemies(.05);
        rows.push({type,x,end,z:e.pos.z,y:e.pos.y});
      }
    }finally{__test.blockers.splice(0,__test.blockers.length,...original);__test.clearEnemies();}
    return {rows,min:__test.limits.Z_MIN+.55,max:__test.limits.Z_MAX-.55,bed:__test.limits.BED};
  });
  for(const row of result.rows){assert.ok(row.z>=result.min&&row.z<=result.max,JSON.stringify(row));
    // Edge steering can legitimately descend onto the track-bed transition.
    assert.ok(row.y<=1e-9&&row.y>=result.bed,JSON.stringify(row));if(row.x===0)assert.equal(row.y,0,JSON.stringify(row));}
});
add('bullet end walls agree with closed player bounds and occlude enemies beyond', {}, async page=>{
  const result=await evaluate(page,()=>{
    __test.startGame();const rows=[];
    for(const x of [-5,0,5])for(const end of [-1,1]){
      __test.clearEnemies();const wall=end<0?__test.limits.Z_MIN:__test.limits.Z_MAX;
      const origin=[x,__test.limits.EYE,wall-end*4],direction=[0,0,end];
      const hits=__test.wallRay(origin,direction),world=hits[0];
      const e=__test.spawnZombie('walker',x,0,wall+end*3,{});
      rows.push({x,end,wall,world,unbounded:__test.ray(origin,direction),occluded:__test.ray(origin,direction,world?.distance||120)});
      __test.player.pos.set(x,1.68,wall+end*3);__test.player.vel.set(0,0,0);__test.updatePlayer(.05);
      rows.at(-1).playerZ=__test.player.pos.z;rows.at(-1).playerY=__test.player.y;
      // Exercise fire's worldT comparison, not merely the ray helper.
      __test.camera.position.set(...origin);__test.camera.rotation.set(0,end<0?0:Math.PI,0);
      __test.camera.updateMatrixWorld(true);__test.weapons.pistol.cool=0;
      const hp=e.hp;__test.fire();rows.at(-1).damage=hp-e.hp;
    }
    __test.clearEnemies();return rows;
  });
  for(const row of result){assert.ok(row.world,JSON.stringify(row));assert.ok(Math.abs(row.world.point[2]-row.wall)<.2,JSON.stringify(row));
    assert.ok(row.unbounded,`probe missed enemy: ${JSON.stringify(row)}`);assert.equal(row.occluded,null);assert.equal(row.damage,0);
    assert.ok(row.end*(row.playerZ-row.wall)<=-3+1e-9,`player can stand beyond bullet wall: ${JSON.stringify(row)}`);assert.equal(row.playerY,0);}
});
for(const drop of ['ammo','med'])add(`dropped ${drop} stays platform-level, including formerly elevated origin`, {}, async page=>{
  const rows=await evaluate(page,drop=>{
    __test.startGame();__test.player.pos.set(0,1.68,30);const rows=[];
    for(const x of [-10,0,10])for(const y of [-1.25,0,2.85]){
      __test.clearPickups();const pos=__test.player.pos.clone().set(x,y,-39);
      if(drop==='ammo')__test.dropAmmo(pos);else __test.dropMed(pos);
      const p=__test.pickups[0];rows.push({x,y,initial:p.m.position.toArray(),halo:p.halo.position.toArray()});
      __test.updatePickups(.1);rows.at(-1).updated=p.m.position.toArray();
    }
    __test.clearPickups();return {rows,plat:__test.limits.PLAT};
  },drop);
  for(const row of rows.rows){assert.ok(Math.abs(row.initial[0])<=rows.plat-.9);assert.equal(row.initial[2],-39);
    assert.ok(row.initial[1]>=.15&&row.initial[1]<=.21,JSON.stringify(row));assert.equal(row.halo[1],.03);
    assert.ok(row.updated[1]>=.135&&row.updated[1]<=.225,JSON.stringify(row));}
});
for(const type of enemyTypes)add(`broad-phase rays hit ${type} head/body centres and outer head at range`, {}, async page=>{
  const rows=await evaluate(page,type=>{
    __test.startGame();__test.clearEnemies();const e=__test.spawnZombie(type,0,0,0,{}),rows=[];
    for(const yaw of [0,Math.PI/2,Math.PI])for(const range of [3,8,20])for(const [index,hb] of e.hitbox.entries())for(const edge of [0,...(hb.head?[.9]:[])]){
      e.yaw=yaw;const radius=hb.r*e.scale,zo=(hb.z||0)*e.scale;
      const target=[Math.sin(yaw)*zo,hb.y*e.scale+radius*edge,Math.cos(yaw)*zo];
      // Shoot perpendicular to facing so prone hitboxes cannot occlude each other.
      const direction=[Math.cos(yaw),0,-Math.sin(yaw)];
      const origin=target.map((v,i)=>v-direction[i]*range),hit=__test.ray(origin,direction);
      rows.push({type,yaw,range,index,edge,hit,expected:range-radius*Math.sqrt(1-edge*edge),head:!!hb.head});
    }
    __test.clearEnemies();return rows;
  },type);
  for(const row of rows){assert.ok(row.hit,JSON.stringify(row));assert.equal(row.hit.type,type);assert.equal(row.hit.head,row.head,JSON.stringify(row));
    assert.ok(Math.abs(row.hit.t-row.expected)<1e-6,JSON.stringify(row));}
});
add('refined weapons preserve attachment markers and keep pump ribs on the pump', {}, async page=>{
  const result=await evaluate(page,()=>{
    const attachments=Object.fromEntries(Object.entries(__test.weapons).map(([name,w])=>[name,
      {muzzle:w.built.muzzle.toArray(),eject:w.built.eject.toArray()}]));
    const pump=__test.weapons.shotgun.built.pump;pump.geometry.computeBoundingBox();
    const ribs=pump.children.map(r=>{r.geometry.computeBoundingBox();return {
      min:r.geometry.boundingBox.min.toArray().map((v,i)=>v+r.position.toArray()[i]),
      max:r.geometry.boundingBox.max.toArray().map((v,i)=>v+r.position.toArray()[i])};});
    return {attachments,ribs,min:pump.geometry.boundingBox.min.toArray(),max:pump.geometry.boundingBox.max.toArray()};
  });
  assert.deepEqual(result.attachments,{pistol:{muzzle:[0,.012,-.36],eject:[.06,.03,.02]},
    smg:{muzzle:[0,.005,-.84],eject:[.06,.02,-.02]},shotgun:{muzzle:[0,.03,-.94],eject:[.06,.02,.06]}});
  assert.equal(result.ribs.length,5);
  for(const rib of result.ribs)for(const axis of [1,2]){
    assert.ok(rib.min[axis]>=result.min[axis]-1e-6);assert.ok(rib.max[axis]<=result.max[axis]+1e-6);
  }
});
const released={aiming:false,firing:false,keys:false,lookDX:0,lookDY:0,fbX:0,fbY:0,
  touch:{joyId:-1,joyOn:false,joyX:0,joyZ:0,joyMag:0,lookId:-1,fire:false,jump:false}};
for(const touch of [false,true])for(const event of ['blur','pagehide','hidden','resize','lost-lock'])for(const paused of (event==='lost-lock'?[false]:[false,true]))for(const ration of [0,3])
  add(`safe lifecycle ${event}: ${touch?'touch':'desktop'}, ${paused?'paused':'playing'}, ration ${ration}`, {touch,controlledLifecycle:true}, async page=>{
    const result=await evaluate(page,({event,paused,ration,touch})=>{
      __test.startGame();__test.setup({fallbackLook:true,pausesLeft:3});
      __test.spawnZombie('runner',0,0,29,{});if(paused)__test.pause();
      __test.setup({pausesLeft:ration});__test.dirty();
      // Lost-lock needs a previously locked desktop; touch receives the same lifecycle notification.
      if(event==='lost-lock'){__test.setup({fallbackLook:false,pointerLocked:true});__environment.lock=null;document.dispatchEvent(new Event('pointerlockchange'));}
      if(event==='blur'){__environment.focused=false;window.dispatchEvent(new Event('blur'));}
      if(event==='hidden'){__environment.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
      if(event==='pagehide')window.dispatchEvent(new Event('pagehide'));
      if(event==='resize')window.dispatchEvent(new Event('resize'));
      const after={state:__test.state.gameState,ration:__test.state.pausesLeft,held:__test.held()},frozen=__test.frozen();
      __test.advance(4);const later={state:__test.state.gameState,ration:__test.state.pausesLeft,frozen:__test.frozen()};
      // Returning visible/focused alone must not restart a safely suspended run.
      __environment.hidden=false;__environment.focused=true;
      document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
      __test.advance(4);return {after,later,frozen,returned:{state:__test.state.gameState,frozen:__test.frozen()}};
    },{event,paused,ration,touch});
    if(result.after.state!=='suspended')console.log('  lifecycle evidence',JSON.stringify({event,paused,ration,touch,after:result.after,
      laterState:result.later.state,hp:[result.frozen.hp,result.later.frozen.hp],runT:[result.frozen.runT,result.later.frozen.runT],returnedState:result.returned.state}));
    assert.deepEqual(result.after,{state:'suspended',ration,held:released});
    assert.equal(result.later.state,'suspended');assert.equal(result.later.ration,ration);assert.deepEqual(result.later.frozen,result.frozen,'unseen combat/timers advanced after 4s');
    assert.equal(result.returned.state,'suspended');assert.deepEqual(result.returned.frozen,result.frozen,'focus return auto-resumed combat');
  });
add('suspend API only transitions playing/paused and never spends or resets ration', {controlledLifecycle:true}, async page=>{
  pending(await evaluate(page,()=>typeof __test.suspend==='function'),'suspend()');
  for(const state of ['menu','playing','paused','over']){
    const result=await evaluate(page,state=>{
      if(state==='menu')__test.quitToTitle();else{__test.startGame();__test.setup({fallbackLook:true});if(state==='paused')__test.pause();if(state==='over')__test.gameOver();}
      __test.setup({pausesLeft:0});__test.suspend();__test.suspend();return __test.state;
    },state);
    assert.equal(result.gameState,['playing','paused'].includes(state)?'suspended':state);assert.equal(result.pausesLeft,0);
  }
});
for(const blocked of ['hidden','unfocused','missing-lock'])add(`automatic resume blocks ${blocked} combat`, {controlledLifecycle:true}, async page=>{
  const result=await evaluate(page,blocked=>{
    __test.startGame();__test.setup({fallbackLook:blocked!=='missing-lock'});__test.pause();const ration=__test.state.pausesLeft;
    __environment.hidden=blocked==='hidden';__environment.focused=blocked!=='unfocused';__test.resume();
    const before=__test.frozen();__test.advance(4);return {state:__test.state.gameState,ration:__test.state.pausesLeft,spent:ration,before,after:__test.frozen()};
  },blocked);
  assert.equal(result.state,'suspended');assert.equal(result.ration,result.spent);assert.deepEqual(result.after,result.before);
});
add('tactical pause releases its own desktop lock; missing-lock countdown safely suspends', {controlledLifecycle:true}, async page=>{
  const result=await evaluate(page,()=>{
    __test.startGame();__test.dirty();__environment.lock=document.getElementById('c');
    __test.setup({pointerLocked:true,fallbackLook:false,pausesLeft:3});__test.pause();
    const initial={state:__test.state.gameState,ration:__test.state.pausesLeft,held:__test.held()},frozen=__test.frozen();
    __test.advance(2.8);const early=__test.state.gameState;
    __test.advance(.3);const after={state:__test.state.gameState,ration:__test.state.pausesLeft};
    __test.advance(4);return {initial,early,after,frozen,later:__test.frozen()};
  });
  assert.deepEqual(result.initial,{state:'paused',ration:2,held:released});assert.equal(result.early,'paused');
  assert.deepEqual(result.after,{state:'suspended',ration:2});assert.deepEqual(result.later,result.frozen);
});
for(const touch of [false,true])add(`normal tactical pause auto-resumes at 3s once: ${touch?'touch':'fallback'}`, {touch,controlledLifecycle:true}, async page=>{
  const result=await evaluate(page,()=>{
    __test.startGame();__test.setup({fallbackLook:true,pausesLeft:3});__test.pause();__test.pause();
    const initial=__test.frozen(),spent=__test.state.pausesLeft;
    __test.advance(2.8);const early={state:__test.state.gameState,frozen:__test.frozen()};
    __test.advance(.3);return {spent,initial,early,state:__test.state.gameState,ration:__test.state.pausesLeft};
  });
  assert.equal(result.spent,2);assert.equal(result.early.state,'paused');assert.deepEqual(result.early.frozen,result.initial);
  assert.equal(result.state,'playing');assert.equal(result.ration,2);
});
for(const gesture of ['mouse','touch','keyboard'])for(const intent of ['resume','quit'])add(`suspension ${intent} by explicit ${gesture} gesture`,
  {touch:gesture==='touch',controlledLifecycle:true,pointerLockReject:true}, async page=>{
    pending(await evaluate(page,()=>typeof __test.suspend==='function'),'suspend()');
    await evaluate(page,()=>{__test.startGame();__test.setup({fallbackLook:false,pausesLeft:0});__test.suspend();});
    const button=page.getByRole('button',{name:intent==='resume'?/^RESUME$/i:/QUIT TO TITLE/i});
    assert.equal(await button.count(),1);assert.ok(await button.isVisible());
    if(gesture==='keyboard'){await button.focus();await page.keyboard.press('Enter');}
    else if(gesture==='touch')await button.tap();else await button.click();
    await page.waitForFunction(expected=>__test.state.gameState===expected,intent==='resume'?'playing':'menu');
    assert.equal(await evaluate(page,()=>__test.weapons.pistol.ammo),15,'resume gesture fired');
    if(intent==='resume'){
      assert.equal(await evaluate(page,()=>__test.state.pausesLeft),0);
      if(gesture!=='touch'){
        await page.waitForFunction(()=>__test.state.fallbackLook);assert.ok(await evaluate(page,()=>__lockRequests>0),'did not exercise rejected pointer lock');
      }
    }
  });
for(const [name,reducedMotion,savedPrefs,expected] of [
  ['default normal','no-preference',undefined,{muted:false,reducedEffects:false}],
  ['default reduced motion','reduce',undefined,{muted:false,reducedEffects:true}],
  ['explicit normal overrides OS','reduce',{muted:true,reducedEffects:false},{muted:true,reducedEffects:false}],
  ['explicit reduced overrides OS','no-preference',{muted:false,reducedEffects:true},{muted:false,reducedEffects:true}],
  ['malformed','reduce','{bad json',{muted:false,reducedEffects:true}],
  ['invalid types','no-preference',{muted:'yes',reducedEffects:1},{muted:false,reducedEffects:false}]
])add(`comfort preferences: ${name}`, {reducedMotion,savedPrefs}, async page=>{
  const prefs=await evaluate(page,()=>__test.prefs);pending(prefs,'prefs / ashworthPrefs');assert.deepEqual(prefs,expected);
  for(const [label,id,key] of [['MUTE SOUND','muteBtn','muted'],['REDUCED EFFECTS','effectsBtn','reducedEffects']]){
    const button=page.getByRole('button',{name:label,exact:true});assert.equal(await button.count(),1);
    assert.equal(await button.getAttribute('id'),id);assert.equal(await button.getAttribute('aria-pressed'),String(expected[key]));
  }
});
add('comfort controls on menu/pause/suspension persist through reload and blocked storage', {controlledLifecycle:true}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / ashworthPrefs');
  for(const screen of ['menu','pause','suspend']){
    if(screen!=='menu')await evaluate(page,screen=>{__test.startGame();__test.setup({fallbackLook:true});if(screen==='pause')__test.pause();else __test.suspend();},screen);
    for(const label of ['MUTE SOUND','REDUCED EFFECTS']){
      const button=page.getByRole('button',{name:label,exact:true});assert.equal(await button.count(),1);assert.ok(await button.isVisible());
      await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');await button.click();
    }
  }
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();await page.getByRole('button',{name:'REDUCED EFFECTS',exact:true}).click();
  assert.deepEqual(await evaluate(page,()=>JSON.parse(localStorage.getItem('ashworthPrefs'))),{muted:true,reducedEffects:true});
  // Init script does not re-seed preferences, so this reload tests actual persistence.
  await page.reload();await page.waitForFunction(()=>!!window.__test);
  assert.deepEqual(await evaluate(page,()=>__test.prefs),{muted:true,reducedEffects:true});
  await evaluate(page,()=>{Storage.prototype.setItem=()=>{throw new Error('blocked storage');};});
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();assert.equal(await evaluate(page,()=>__test.prefs.muted),false);
});
add('comfort mute controls master gain; unmute reuses one native audio context', {}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / ashworthPrefs');
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();
  await (await action(page,/^HERO$/i,'#dSurv')).click();
  const muted=await evaluate(page,()=>({count:__audio.contexts,master:__audio.gains[0]?.gain.value}));
  assert.equal(muted.count,1);assert.equal(muted.master,0,'master gain must be muted, not just saved UI state');
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();
  const unmuted=await evaluate(page,()=>({count:__audio.contexts,master:__audio.gains[0]?.gain.value}));
  assert.equal(unmuted.count,1);assert.ok(unmuted.master>0);
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();
  assert.equal(await evaluate(page,()=>__audio.gains[0]?.gain.value),0);
});
add('comfort reduced effects removes camera/weapon motion, retains ballistic recoil and hit rules', {}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / reduced effects');
  await page.getByRole('button',{name:'REDUCED EFFECTS',exact:true}).click();
  const result=await evaluate(page,()=>{
    __test.startGame();__test.setup({fallbackLook:false});__test.player.pos.set(0,1.68,30);__test.player.bob=2;__test.player.bobAmt=1;
    __test.player.shake=1;__test.keys.w=true;__test.fire();const flash=__test.weapons.pistol.flashMat.opacity;
    __test.updatePlayer(.05);__test.updateWeapon(.05);const w=__test.weapons.pistol;
    return {camera:__test.camera.position.toArray(),rotation:__test.camera.rotation.toArray().slice(0,3),player:__test.player.pos.toArray(),
      pitch:__test.player.pitch+__test.state.recoilP*.017,yaw:__test.player.yaw+__test.state.recoilY*.017,y:__test.player.y,recoil:__test.state.recoilP,ammo:w.ammo,flash,
      holder:w.holder.position.toArray(),base:[w.def.pos.x,w.def.pos.y,w.def.pos.z],holderRotation:w.holder.rotation.toArray().slice(0,3)};
  });
  assert.equal(result.ammo,14);assert.ok(result.recoil>0,'ballistic recoil was removed');assert.ok(result.flash>=0&&result.flash<1,'muzzle flash not reduced');
  assert.deepEqual(result.camera,[result.player[0],1.68+result.y,result.player[2]]);assert.deepEqual(result.rotation,[result.pitch,result.yaw,0]);
  assert.deepEqual(result.holder,result.base);assert.ok(result.holderRotation.every(angle=>angle===0));
});
add('comfort reduced effects preserves actual head/body damage and ammo calculations', {}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / reduced effects');
  // Unlock audio before both samples: its random synthesis must not appear in only one.
  await page.getByRole('button',{name:'HERO',exact:true}).click();
  async function shoot(){return evaluate(page,()=>{
    const rows=[];
    for(const head of [false,true]){
      __test.startGame();__test.clearEnemies();__test.setup({fallbackLook:false});
      const e=__test.spawnZombie('conductor',0,0,10,{}),hb=e.hitbox[head?0:1];
      __test.camera.position.set(0,hb.y*e.scale,20);__test.camera.rotation.set(0,0,0);__test.camera.updateMatrixWorld(true);
      __seed(1234);const hp=e.hp;__test.fire();rows.push({head,damage:hp-e.hp,hits:__test.stats.hits,ammo:__test.weapons.pistol.ammo,
        recoilVP:__test.state.recoilVP,recoilVY:__test.state.recoilVY});
    }return rows;
  });}
  const normal=await shoot();await evaluate(page,()=>__test.quitToTitle());
  await page.getByRole('button',{name:'REDUCED EFFECTS',exact:true}).click();const reduced=await shoot();
  assert.deepEqual(reduced,normal,'reduced effects changed ballistics');
  for(const row of reduced){assert.equal(row.hits,1);assert.equal(row.ammo,14);assert.ok(row.damage>0);assert.ok(row.recoilVP>0);}
  assert.ok(reduced[1].damage>reduced[0].damage,'head multiplier disappeared');
});
add('comfort preferences tolerate storage disabled before boot', {storageDisabled:true}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / ashworthPrefs');
  await page.getByRole('button',{name:'MUTE SOUND',exact:true}).click();
  await page.getByRole('button',{name:'REDUCED EFFECTS',exact:true}).click();
  assert.deepEqual(await evaluate(page,()=>__test.prefs),{muted:true,reducedEffects:true});
  await evaluate(page,()=>{__test.startGame();__test.gameOver();});
});
add('comfort reduced effects disables grain/flicker/white flash, not damage/enemy cues', {}, async page=>{
  pending(await evaluate(page,()=>__test.prefs),'prefs / reduced effects');
  await page.getByRole('button',{name:'REDUCED EFFECTS',exact:true}).click();
  const result=await evaluate(page,()=>{
    __test.startGame();const e=__test.spawnZombie('brute',0,0,28,{});
    __test.damageEnemy(e,1,false);__test.updateEnemies(0);__test.damagePlayer(10,e.pos);const hp=__test.player.hp;
    const flicker=__test.flickers.map(f=>f.k);const variations=[];
    for(let i=0;i<100;i++){__test.updateFlicker(1);if(__test.flickers.some(f=>f.k!==1))variations.push(i);}
    const cues={enemy:e.flash,enemyGlow:e.refs.mats[1].emissive.r,damage:getComputedStyle(document.getElementById('dmg')).opacity,
      arrows:[...document.querySelectorAll('.dmgArrow')].some(a=>Number(getComputedStyle(a).opacity)>0)};
    const grain=getComputedStyle(document.getElementById('grain'));
    const disabled=grain.display==='none'||grain.visibility==='hidden'||Number(grain.opacity)===0;
    __test.gameOver();const deathFlash=Number(getComputedStyle(document.getElementById('flash')).opacity);
    __test.startGame();__test.victory();const winFlash=Number(getComputedStyle(document.getElementById('flash')).opacity);
    return {hp,cues,disabled,flicker,variations,after:__test.flickers.map(f=>f.k),deathFlash,winFlash};
  });
  assert.equal(result.hp,90);assert.ok(result.cues.enemy>0);assert.ok(result.cues.enemyGlow>0,'enemy hit cue hidden');assert.ok(Number(result.cues.damage)>0,'damage cue hidden');
  assert.ok(result.cues.arrows,'directional damage cue hidden');assert.ok(result.disabled,'film grain still visible');
  assert.deepEqual(result.variations,[],'flicker varied during reduced-effects steps');assert.deepEqual(result.after,result.flicker);
  assert.equal(result.deathFlash,0);assert.equal(result.winFlash,0);
});
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
    for(const casual of [true,false])for(const ngP of [0,1,2,3,5,100])for(const waveNum of [0,2,4,13,14]) {
      __test.startGame();__test.setup({casual,ngP,waveNum});__test.startWave();
      const counts={walker:0,runner:0,crawler:0,brute:0,conductor:0};
      for(const type of __test.wave.composition)counts[type]++;
      rows.push({casual,ngP,wave:__test.state.waveNum,queue:__test.wave.queue,length:__test.wave.composition.length,counts,valid:__test.wave.composition.every(t=>['walker','runner','crawler','brute','conductor'].includes(t))});
    }return rows;
  });
  for(const row of recipes){
    assert.ok(row.valid);assert.equal(row.length,row.queue,JSON.stringify(row));
    if(row.wave===15){
      assert.equal(row.queue,row.casual?29:36);
      const brute=Math.min(12,6+row.ngP*2),conductor=Math.min(3,1+row.ngP),crawler=9;
      const runner=Math.min(12,row.queue-brute-conductor-crawler);
      assert.deepEqual(row.counts,{brute,conductor,crawler,runner,walker:row.queue-brute-conductor-crawler-runner},JSON.stringify(row));
      if(!row.casual&&row.ngP===0)assert.deepEqual(row.counts,{walker:8,runner:12,crawler:9,brute:6,conductor:1},'HERO NG0 finale must stay unchanged');
      if(row.casual&&row.ngP===1)assert.deepEqual(row.counts,{walker:0,runner:10,crawler:9,brute:8,conductor:2},'EASY NG+1 must retain its bosses and crawler pressure');
    }
  }
});
for(const [label,casual,ngP] of [['EASY NG0',true,0],['EASY NG+1',true,1],['HERO NG0',false,0]])add(`scripted director reaches wave 15 victory and respects live cap: ${label}`, {}, async page => {
  const result=await evaluate(page, ({casual,ngP}) => {
    __test.startGame();__test.setup({casual,ngP});let max=0,steps=0;const waves=[];
    while(__test.state.gameState==='playing'&&steps++<40000) {
      __test.updateTrain(1/30);__test.updateWaves(1/30);
      const alive=__test.enemies.filter(e=>!e.dead).length;max=Math.max(max,alive);
      if(alive>Math.min(30,12+Math.round(__test.state.waveNum*1.6)))throw new Error('live cap exceeded');
      if(__test.state.waveNum&&!waves.includes(__test.state.waveNum))waves.push(__test.state.waveNum);
      // Scripted kills avoid balance/random damage; director/spawn/train code remains actual.
      if(__test.wave.state==='fighting'||alive>=Math.min(30,12+Math.round(__test.state.waveNum*1.6)))__test.clearEnemies();
    }
    return {state:__test.state.gameState,waves,max,ngP:__test.state.ngP};
  },{casual,ngP});
  assert.equal(result.state,'won');assert.deepEqual(result.waves,Array.from({length:15},(_,i)=>i+1));assert.equal(result.ngP,ngP+1);assert.ok(result.max<=30);
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
