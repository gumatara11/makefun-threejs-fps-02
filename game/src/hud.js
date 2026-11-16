// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, round score,
// alive counts, bomb status, kill feed, buy menu, progress bars and the overlay
// panels (start / pause / match end). It never touches the simulation; main.js
// pushes numbers in and reads the play callback out.
const COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'Plant the bomb on site A or B, or eliminate the defenders. First to 5 rounds takes the match.',
    action: 'Mulai',
  },
  paused: {
    title: 'DUSTLINE — Paused',
    copy: 'The simulation is frozen. Click Lanjut to lock the mouse and resume.',
    action: 'Lanjut',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Main lagi',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const ammoBox = document.getElementById('ammo');
  const healthValue = document.getElementById('health-value');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const scoreValue = document.getElementById('score-value');
  const aliveValue = document.getElementById('alive-value');
  const bombValue = document.getElementById('bomb-value');
  const weaponValue = document.getElementById('weapon-value');
  const hitmarker = document.getElementById('hitmarker');
  const killfeed = document.getElementById('killfeed');
  const buyMenu = document.getElementById('buymenu');
  const buyMoney = document.getElementById('buymenu-money');
  const banner = document.getElementById('banner');
  const plantBar = document.getElementById('plantbar');
  const plantFill = document.getElementById('plantbar-fill');
  const plantLabel = document.getElementById('plantbar-label');
  let hitTimer = 0;
  let bannerTimer = 0;
  const cache = {};

  // --- Minimap ---------------------------------------------------------------
  // Top-down 48x36 m foundry yard on a 192x144 canvas (4 px/m, canvas top =
  // north, -z). Static walls/lanes/sites/spawns are pre-rendered once; live
  // dots are drawn from window.__DUSTLINE__ (read lazily — it is defined
  // after createHud runs) at ~10 Hz. 2D canvas only, no WebGL draw calls.
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const MM_W = 192;
  const MM_H = 144;
  const mmX = (x) => (x + 24) * 4;
  const mmY = (z) => (z + 18) * 4;
  const TEAL = '#2ec4b6';
  const AMBER = '#f0a830';
  const ENEMY = '#ff5a3c';
  let minimapStatic = null;

  function buildMinimapStatic() {
    const c = document.createElement('canvas');
    c.width = MM_W;
    c.height = MM_H;
    const g = c.getContext('2d');
    // Floor.
    g.fillStyle = '#1b1e24';
    g.fillRect(0, 0, MM_W, MM_H);
    // Faint 6 m grid.
    g.strokeStyle = 'rgba(255,255,255,0.045)';
    g.lineWidth = 1;
    for (let x = -18; x <= 18; x += 6) {
      g.beginPath(); g.moveTo(mmX(x), 0); g.lineTo(mmX(x), MM_H); g.stroke();
    }
    for (let z = -12; z <= 12; z += 6) {
      g.beginPath(); g.moveTo(0, mmY(z)); g.lineTo(MM_W, mmY(z)); g.stroke();
    }
    // Plant sites (from world.js SITES).
    g.fillStyle = 'rgba(46,196,182,0.22)';
    g.fillRect(mmX(14), mmY(-13), 8 * 4, 8 * 4);
    g.strokeStyle = TEAL; g.lineWidth = 1.5;
    g.strokeRect(mmX(14), mmY(-13), 8 * 4, 8 * 4);
    g.fillStyle = 'rgba(240,168,48,0.22)';
    g.fillRect(mmX(14), mmY(5), 8 * 4, 8 * 4);
    g.strokeStyle = AMBER;
    g.strokeRect(mmX(14), mmY(5), 8 * 4, 8 * 4);
    g.font = 'bold 11px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = TEAL;
    g.fillText('A', mmX(18), mmY(-9));
    g.fillStyle = AMBER;
    g.fillText('B', mmX(18), mmY(9));
    // Spawn zones (from world.js SPAWNS).
    g.setLineDash([4, 3]);
    g.strokeStyle = TEAL;
    g.strokeRect(mmX(-22), mmY(-6), 4 * 4, 12 * 4);
    g.strokeStyle = AMBER;
    g.strokeRect(mmX(14), mmY(-3), 6 * 4, 6 * 4);
    g.setLineDash([]);
    // Walls: outer border, mid wall (x=0, gaps A-long/Mid/B), B corridor.
    g.strokeStyle = '#7d838d';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, MM_W - 3, MM_H - 3);
    const wallV = (z0, z1) => {
      g.beginPath(); g.moveTo(mmX(0), mmY(z0)); g.lineTo(mmX(0), mmY(z1)); g.stroke();
    };
    wallV(-18, -14); wallV(-10, -2); wallV(2, 10); wallV(14, 18);
    const wallH = (x0, x1, z) => {
      g.beginPath(); g.moveTo(mmX(x0), mmY(z)); g.lineTo(mmX(x1), mmY(z)); g.stroke();
    };
    wallH(-6, 12, 8); wallH(-6, 12, 16);
    // Cover boxes (site containers/crates/tanks + mid crates/pillar).
    g.fillStyle = '#4a5058';
    const boxAt = (x, z, w, d) => g.fillRect(mmX(x - w / 2), mmY(z - d / 2), w * 4, d * 4);
    boxAt(15, -9, 3.0, 1.2); boxAt(18.5, -12, 1.2, 1.2); boxAt(13, -5.5, 1.6, 1.6);
    boxAt(15, 9, 3.0, 1.2); boxAt(18.5, 12, 1.2, 1.2); boxAt(13, 5.5, 1.6, 1.6);
    boxAt(-6, -4, 1.2, 1.2); boxAt(6, 4, 1.2, 1.2);
    boxAt(-10, 8, 1.6, 1.6); boxAt(10, -8, 1.6, 1.6);
    boxAt(-14, -8, 1.2, 1.2); boxAt(-2, 6, 2.4, 1.2);
    // Furnace glow on the north wall (x -14..-10, z -18).
    g.fillStyle = '#ff7a1f';
    g.fillRect(mmX(-14), 0, 4 * 4, 4);
    return c;
  }

  function drawMinimap() {
    if (!minimapCtx) return;
    try {
      if (!minimapStatic) minimapStatic = buildMinimapStatic();
      const g = minimapCtx;
      g.clearRect(0, 0, MM_W, MM_H);
      g.drawImage(minimapStatic, 0, 0);
      const D = window.__DUSTLINE__;
      if (!D) return;
      const bomb = D.state && D.state.bomb;
      const carrier = bomb && bomb.carrier;
      const dot = (x, z, r, fill, stroke) => {
        g.beginPath();
        g.arc(mmX(x), mmY(z), r, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        if (stroke) {
          g.lineWidth = 1.5;
          g.strokeStyle = stroke;
          g.stroke();
        }
      };
      // Planted / dropped bomb marker.
      if (bomb && (bomb.status === 'planted' || bomb.status === 'dropped') && bomb.position) {
        const blink = bomb.status === 'planted' ? (Math.floor(performance.now() / 350) % 2 === 0) : true;
        if (blink) {
          g.fillStyle = bomb.status === 'planted' ? ENEMY : AMBER;
          const bx = mmX(bomb.position.x);
          const by = mmY(bomb.position.z);
          g.save();
          g.translate(bx, by);
          g.rotate(Math.PI / 4);
          const s = 4.5;
          g.fillRect(-s / 2, -s / 2, s, s);
          g.restore();
          g.lineWidth = 1.5;
          g.strokeStyle = '#ffffff';
          g.strokeRect(bx - 4, by - 4, 8, 8);
        }
      }
      // Bots: friendly (attackers) teal, enemy (defenders) amber-red.
      const bots = D.bots || [];
      for (const bot of bots) {
        if (!bot || !bot.alive || !bot.body || !bot.body.position) continue;
        const p = bot.body.position;
        const isFriend = bot.team === 'attackers';
        dot(p.x, p.z, 3.5, isFriend ? TEAL : ENEMY, '#101216');
        if (bot.hasBomb || carrier === bot) {
          g.beginPath();
          g.arc(mmX(p.x), mmY(p.z), 6, 0, Math.PI * 2);
          g.lineWidth = 1.5;
          g.strokeStyle = '#ffffff';
          g.stroke();
        }
      }
      // Player: white dot + view cone (forward = (-sin yaw, -cos yaw)).
      const player = D.player;
      if (player && player.body && player.body.position) {
        const p = player.body.position;
        const yaw = player.body.yaw || 0;
        const dx = -Math.sin(yaw);
        const dz = -Math.cos(yaw);
        const px = mmX(p.x);
        const py = mmY(p.z);
        if (player.alive) {
          const base = Math.atan2(dz, dx);
          g.beginPath();
          g.moveTo(px, py);
          g.arc(px, py, 16, base - 0.6, base + 0.6);
          g.closePath();
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.fill();
        }
        dot(p.x, p.z, 4, player.alive ? '#ffffff' : '#5a6068', TEAL);
        if (player.hasBomb || carrier === player) {
          g.beginPath();
          g.arc(px, py, 7, 0, Math.PI * 2);
          g.lineWidth = 1.5;
          g.strokeStyle = '#ffffff';
          g.stroke();
        }
      }
    } catch (e) {
      // Minimap must never break the HUD: fail silent, retry next tick.
    }
  }

  // Live minimap refresh (~10 Hz); cheap 2D canvas, no WebGL cost.
  setInterval(drawMinimap, 100);
  drawMinimap();

  function setText(element, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    element.textContent = value;
  }

  return {
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const v = Math.max(0, Math.ceil(value));
      setText(healthValue, 'health', String(v));
      healthValue.parentElement.classList.toggle('low', v <= 25);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buymoney', `$${value}`);
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${Math.ceil(seconds)}` : `${Math.ceil(seconds)}`;
      setText(timerValue, 'timer', text);
    },
    setScore(a, d) {
      setText(scoreValue, 'score', `${a} — ${d}`);
    },
    setAlive(a, d) {
      setText(aliveValue, 'alive', `ATK ${a} · DEF ${d}`);
    },
    setBomb(text) {
      setText(bombValue, 'bomb', text);
    },
    setWeapon(name) {
      setText(weaponValue, 'weapon', name);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, ms = 3000) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.hidden = true;
    },
    setProgress(label, fraction) {
      if (fraction <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuyMenu(canVK, canFrag) {
      buyMenu.hidden = false;
      buyMenu.querySelector('[data-buy="VK47"]').classList.toggle('disabled', !canVK);
      buyMenu.querySelector('[data-buy="FRAG"]').classList.toggle('disabled', !canFrag);
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? scoreText : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
