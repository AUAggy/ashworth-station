#!/usr/bin/env node
// Matched fixed-quality rendering evidence, not mobile-device certification.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {serve,root} from './helpers.mjs';
import {instrument,browserInit} from './instrument.mjs';

assert.ok(process.env.ASHWORTH_PLAYWRIGHT,'Set ASHWORTH_PLAYWRIGHT to an external playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.ASHWORTH_PLAYWRIGHT).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.ASHWORTH_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const server=await serve();
const source=await readFile(join(root,'index.html'),'utf8');
let html=instrument(source);
const at=html.lastIndexOf('requestAnimationFrame(frame);');
html=html.slice(0,at)+`window.__bench={renderer,scene,TEX,EG,MAT,pool,basePR,COARSE,ANISO,updateLightPool,updatePoolGlow};\n`+html.slice(at);
const directory=process.env.ASHWORTH_ARTIFACTS||join(tmpdir(),`ashworth-render-${Date.now()}`);
await mkdir(directory,{recursive:true});
const profiles=[
  {name:'desktop',width:1280,height:720,dpr:1,touch:false},
  {name:'phone-landscape',width:844,height:390,dpr:2,touch:true},
  {name:'phone-portrait',width:390,height:844,dpr:2,touch:true},
  {name:'tablet',width:1024,height:768,dpr:2,touch:true}
];
const results=[];
try{
  for(const profile of profiles){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,
      hasTouch:profile.touch,isMobile:profile.touch,reducedMotion:'no-preference',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(browserInit,{});
    await page.route(server.url+'/',route=>route.fulfill({body:html,contentType:'text/html'}));
    const start=performance.now();
    try{
      await page.goto(server.url);await page.waitForFunction(()=>!!window.__bench);
      const loadMs=performance.now()-start;
      await page.addStyleTag({content:'*{animation:none!important;transition:none!important} #banner,#hspop{display:none!important}'});
      const scenes=[];
      for(const scene of ['pistol','smg','shotgun','threats','train','crowd']){
        const state=await page.evaluate(scene=>{
          __test.startGame();__test.setup({fallbackLook:false});__seed(1984);
          if(['smg','shotgun'].includes(scene)){__test.switchWeapon(scene);__test.weapons[scene].raise=0;__test.weapons[scene].cool=0;}
          if(scene==='train'){
            __test.train.visible=true;__test.train.position.z=0;__test.player.pos.set(3,1.68,5);__test.player.yaw=Math.PI/2;
          }
          if(scene==='threats'||scene==='crowd'){
            const count=scene==='crowd'?30:5;
            for(let i=0;i<count;i++)__test.spawnZombie(['walker','runner','crawler','brute','conductor'][i%5],(i%5-2)*1.7,0,scene==='crowd'?10-Math.floor(i/5)*4:20,{});
            __test.updateEnemies(0);
          }
          __test.updatePlayer(0);__test.updateWeapon(0);
          __bench.renderer.setPixelRatio(__bench.basePR);
          __bench.updateLightPool(0,__test.camera.position);__bench.updatePoolGlow(1);
          __test.render();
          let punctualLights=0;
          __bench.scene.traverse(o=>{if(o.isPointLight||o.isSpotLight||o.isDirectionalLight)punctualLights++;});
          const attributes=__bench.renderer.getContext().getContextAttributes();
          const dimensions=Object.fromEntries(Object.entries(__bench.TEX).filter(([,t])=>t.isTexture).map(([k,t])=>[k,[t.image.width,t.image.height]]));
          return {...__test.memory(),pixelRatio:__bench.renderer.getPixelRatio(),pool:__bench.pool.length,
            coarse:__bench.COARSE,anisotropy:__bench.ANISO,antialias:attributes.antialias,punctualLights,dimensions};
        },scene);
        assert.equal(state.pool,profile.touch?4:6);assert.equal(state.coarse,profile.touch);
        assert.ok(state.pixelRatio<=(profile.touch?1.25:1.75));
        if(profile.touch){assert.equal(state.antialias,false);assert.ok(state.anisotropy<=4);}
        await page.screenshot({path:join(directory,`${profile.name}-${scene}.png`)});
        scenes.push({name:scene,...state});
      }
      // Benchmark the same frozen crowded scene. Do not allow adaptive resolution or
      // changing enemy simulation to conceal a slower graphics pass.
      const timing=await page.evaluate(()=>new Promise(resolve=>{
        const intervals=[];let last,warmup=20;
        function sample(now){
          __test.render();
          if(warmup>0){warmup--;last=now;}
          else{intervals.push(now-last);last=now;}
          if(intervals.length<120)__nativeRAF(sample);
          else{
            const gl=__bench.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
            resolve({intervals,...__test.memory(),pixelRatio:__bench.renderer.getPixelRatio(),
              driver:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
          }
        }
        __nativeRAF(sample);
      }));
      const sorted=[...timing.intervals].sort((a,b)=>a-b);
      timing.medianMs=sorted[Math.floor(sorted.length/2)];timing.p95Ms=sorted[Math.ceil(sorted.length*.95)-1];
      assert.equal(timing.pixelRatio,scenes.at(-1).pixelRatio);assert.deepEqual(errors,[]);
      results.push({profile,loadMs,scenes,timing});
      console.log('PASS fixed-quality',profile.name,'median',timing.medianMs.toFixed(2),'p95',timing.p95Ms.toFixed(2),
        'calls',timing.calls,'triangles',timing.triangles,'PR',timing.pixelRatio);
    }finally{await context.close();}
  }
  const report={label:process.env.ASHWORTH_CAPTURE_LABEL||'unset',htmlSHA256:createHash('sha256').update(source).digest('hex'),
    browser:browser.version(),note:'Desktop headless Chromium / touch emulation. Frozen crowded scene, fixed original quality, raw pre-clamp RAF intervals. Not real-device thermal, battery, playability, or GPU-time certification.',results};
  await writeFile(join(directory,'render.json'),JSON.stringify(report,null,2));
  if(process.env.ASHWORTH_COMPARE){
    const before=JSON.parse(await readFile(process.env.ASHWORTH_COMPARE,'utf8'));
    for(const row of results){
      const old=before.results.find(r=>r.profile.name===row.profile.name);assert.ok(old,'Missing matched profile');
      assert.deepEqual(row.profile,old.profile);assert.equal(row.timing.pixelRatio,old.timing.pixelRatio);
      for(const scene of row.scenes){
        const previous=old.scenes.find(s=>s.name===scene.name);
        for(const key of ['pool','coarse','anisotropy','antialias','punctualLights','dimensions','calls','textures','programs'])
          assert.deepEqual(scene[key],previous[key],`${row.profile.name}/${scene.name}: ${key} budget changed`);
        assert.ok(scene.triangles<=previous.triangles,`${row.profile.name}/${scene.name}: triangles increased`);
        assert.ok(scene.geometries<=previous.geometries,`${row.profile.name}/${scene.name}: geometries increased`);
      }
      console.log('COMPARE',row.profile.name,'median delta',((row.timing.medianMs/old.timing.medianMs-1)*100).toFixed(1)+'%',
        'p95 delta',((row.timing.p95Ms/old.timing.p95Ms-1)*100).toFixed(1)+'%');
    }
  }
  console.log('Artifacts:',directory);
}finally{await browser.close();await server.close();}
