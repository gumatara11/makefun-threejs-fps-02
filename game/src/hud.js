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
      setText(healthValue, 'health', String(Math.max(0, Math.ceil(value))));
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
