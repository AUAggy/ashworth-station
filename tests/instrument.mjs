// Inserted into a intercepted response only; never shipped in index.html.
export const hooks = `
window.__clockOrigin = last;
window.__test = {
  startGame, updatePlayer, updateWeapon, fire, startReload, switchWeapon,
  spawnZombie, clearEnemies, updateEnemies, killEnemy, updateWaves, updateTrain,
  startWave, buildComposition, loadSave, gameOver, victory, quitToTitle, pause, resume,
  suspend: typeof suspend === 'function' ? suspend : undefined,
  spawnFlank, spawnOne, raycastEnemies, dropAmmo, dropMed, updatePickups, clearPickups,
  damageEnemy, damagePlayer, updateFlicker,
  player, weapons, keys, touch, wave, enemies, stats, trainState, train, trainDoors, trainDoorWorldZ, pickups, blockers,
  camera, muzzleLight, flickers,
  limits: {Z_MIN,Z_MAX,PLAT,BED,EYE,TRAIN_X},
  get prefs(){return typeof prefs === 'undefined' ? null : {...prefs};},
  // Run the real frame and dt clamp, omitting GPU submission only for clock probes.
  advance: seconds => {
    const render=renderer.render;renderer.render=()=>{};
    try {window.__advance(seconds);} finally {renderer.render=render;}
  },
  wallRay: (origin,dir) => {
    scene.updateMatrixWorld(true);
    rc.set(new THREE.Vector3(...origin),new THREE.Vector3(...dir).normalize());
    return rc.intersectObjects(hitTargets,false).map(h=>({distance:h.distance,point:h.point.toArray()}));
  },
  ray: (origin,dir,maxT=120) => {
    const hit=raycastEnemies(new THREE.Vector3(...origin),new THREE.Vector3(...dir).normalize(),maxT);
    return hit ? {type:hit.e.type,head:!!hit.hb.head,t:hit.t} : null;
  },
  render: () => renderer.render(scene,camera),
  memory: () => ({...renderer.info.memory, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles, programs:renderer.info.programs.length}),
  get state(){return {gameState,curWeapon,aiming,firing,recoilP,recoilY,recoilVP,recoilVY,lookDX,lookDY,fbX,fbY,pointerLocked,fallbackLook,runT,pauseT,ngP,badge:[...badge],bestRun,waveNum,pausesLeft};},
  setup: o => { if('ngP' in o)ngP=o.ngP; if('waveNum' in o)waveNum=o.waveNum; if('casual' in o)setDiff(o.casual); if('aiming' in o)aiming=o.aiming; if('fallbackLook' in o)fallbackLook=o.fallbackLook; if('pointerLocked' in o)pointerLocked=o.pointerLocked; if('pausesLeft' in o)pausesLeft=o.pausesLeft; },
  frozen: () => ({hp:player.hp,runT,waveT:wave.t,spawnT:wave.spawnT,queue:wave.queue,
    trainZ:trainState.z,player:player.pos.toArray(),enemies:enemies.map(e=>({pos:e.pos.toArray(),hp:e.hp,windup:e.windup,atkCd:e.atkCd}))}),
  held: () => ({aiming,firing,keys:Object.values(keys).some(Boolean),lookDX,lookDY,fbX,fbY,
    touch:{joyId:touch.joyId,joyOn:touch.joyOn,joyX:touch.joyX,joyZ:touch.joyZ,joyMag:touch.joyMag,lookId:touch.lookId,fire:touch.fire,jump:touch.jump}}),
  dirty: () => {
    aiming=firing=true; recoilP=recoilY=recoilVP=recoilVY=1; lookDX=lookDY=1;
    player.onGround=false;player.y=2;player.vy=4;player.bob=2;player.bobAmt=1;player.stepT=1;player.shake=1;
    muzzleLight.intensity=34;
    keys.w=true;fbX=.8;fbY=-.7;
    touch.fire=true;touch.jump=true;touch.joyOn=true;touch.joyId=7;touch.lookId=8;touch.joyX=1;touch.joyZ=-1;touch.joyMag=1;
    for(const w of Object.values(weapons)){w.pumping=.3;w.bloom=.03;w.kickZ=.1;w.kickR=.1;w.raise=1;w.reloadMax=2;w.flashTimer=.04;w.flashMat.opacity=1;w.reloading=1;w.cool=1;}
    weapons.shotgun.built.pump.position.z=-.2;
  }
};
`;

export function instrument(html) {
  const call = 'requestAnimationFrame(frame);';
  const at = html.lastIndexOf(call);
  if (at < 0) throw new Error('Final frame scheduling call not found; inspect boot before updating instrumentation');
  return html.slice(0, at) + hooks + html.slice(at);
}

export function browserInit({ seed = 1984, webglFail = false, save, storageDisabled = false,
  savedPrefs, controlledLifecycle = false, pointerLockReject = false } = {}) {
  // Actual RAF is available only for optional real-time performance captures.
  window.__nativeRAF = window.requestAnimationFrame.bind(window);
  let callbacks = new Map(), next = 0;
  window.requestAnimationFrame = cb => { callbacks.set(++next, cb); return next; };
  window.cancelAnimationFrame = id => callbacks.delete(id);
  window.__frameCount = 0;
  window.__step = now => {
    const batch = callbacks; callbacks = new Map();
    for (const cb of batch.values()) { window.__frameCount++; cb(now); }
  };
  let clock;
  window.__advance = seconds => {
    if(clock===undefined)clock=window.__clockOrigin;
    for(let left=seconds;left>1e-9;left-=.05){clock+=Math.min(.05,left)*1000;window.__step(clock);}
  };
  let s = seed >>> 0;
  window.__seed = value => { s=value>>>0; };
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  if(controlledLifecycle){
    const env={hidden:false,focused:true,lock:null};window.__environment=env;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>env.hidden});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>env.hidden?'hidden':'visible'});
    document.hasFocus=()=>env.focused;
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>env.lock});
    document.exitPointerLock=()=>{env.lock=null;document.dispatchEvent(new Event('pointerlockchange'));};
  }
  window.__lockRequests=0;
  if(pointerLockReject)HTMLCanvasElement.prototype.requestPointerLock=function(){
    window.__lockRequests++;return Promise.reject(new DOMException('Test: pointer lock rejected','NotAllowedError'));
  };
  // Observe the native audio graph without creating an additional audio context.
  window.__audio={contexts:0,gains:[]};
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    const gain=AC.prototype.createGain;
    AC.prototype.createGain=function(...args){const node=gain.apply(this,args);window.__audio.gains.push(node);return node;};
    const Wrapped=new Proxy(AC,{construct(target,args){window.__audio.contexts++;return Reflect.construct(target,args);}});
    window.AudioContext=Wrapped;if(window.webkitAudioContext)window.webkitAudioContext=Wrapped;
  }
  if (webglFail) {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type.startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    };
  }
  if (save !== undefined) localStorage.setItem('ashworthSave', typeof save === 'string' ? save : JSON.stringify(save));
  if (savedPrefs !== undefined) localStorage.setItem('ashworthPrefs', typeof savedPrefs === 'string' ? savedPrefs : JSON.stringify(savedPrefs));
  if (storageDisabled) Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
}
