// Inserted into a intercepted response only; never shipped in index.html.
export const hooks = `
window.__test = {
  startGame, updatePlayer, updateWeapon, fire, startReload, switchWeapon,
  spawnZombie, clearEnemies, updateEnemies, killEnemy, updateWaves, updateTrain,
  startWave, buildComposition, loadSave, gameOver, quitToTitle, pause, resume,
  player, weapons, keys, touch, wave, enemies, stats, trainState,
  render: () => renderer.render(scene,camera),
  memory: () => ({...renderer.info.memory, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles, programs:renderer.info.programs.length}),
  get state(){return {gameState,curWeapon,aiming,firing,recoilP,recoilY,recoilVP,recoilVY,lookDX,lookDY,ngP,badge:[...badge],bestRun,waveNum,pausesLeft};},
  setup: o => { if('ngP' in o)ngP=o.ngP; if('waveNum' in o)waveNum=o.waveNum; if('casual' in o)setDiff(o.casual); if('aiming' in o)aiming=o.aiming; if('fallbackLook' in o)fallbackLook=o.fallbackLook; },
  dirty: () => {
    aiming=firing=true; recoilP=recoilY=recoilVP=recoilVY=1; lookDX=lookDY=1;
    player.onGround=false;player.y=2;player.vy=4;player.bob=2;player.bobAmt=1;player.stepT=1;
    keys.w=true;touch.fire=true;touch.jump=true;touch.joyOn=true;touch.joyX=1;
    for(const w of Object.values(weapons)){w.pumping=.3;w.bloom=.03;w.kickZ=.1;w.kickR=.1;w.raise=1;w.flashTimer=.04;w.flashMat.opacity=1;w.reloading=1;w.cool=1;}
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

export function browserInit({ seed = 1984, webglFail = false, save } = {}) {
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
  let s = seed >>> 0;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  if (webglFail) {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type.startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    };
  }
  if (save !== undefined) localStorage.setItem('ashworthSave', typeof save === 'string' ? save : JSON.stringify(save));
}
