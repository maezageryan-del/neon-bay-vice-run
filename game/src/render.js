// Drawing only: the world state and the current screen in, pixels out.
// The 1280x720 view is scaled to fit the window; the world is drawn through
// a camera that follows the player. HUD, minimap, mission panels, the title
// screen and the game-over screens are all painted here.
import { CITY, FONT, MISSIONS, PALETTE, VIEW } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_OVER = 'over';

function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtTimer(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- world drawing ---------------------------------------------------------
  function drawCity(state) {
    const camX = state.camX; const camY = state.camY;
    // Ground (block interiors / grass).
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Roads: full grid bands.
    ctx.fillStyle = PALETTE.road;
    for (let gx = 0; gx <= CITY.size; gx += CITY.block) {
      const sx = gx - camX - CITY.road / 2;
      if (sx > -CITY.road && sx < VIEW.width) ctx.fillRect(sx, 0, CITY.road, VIEW.height);
      const sy = gx - camY - CITY.road / 2;
      if (sy > -CITY.road && sy < VIEW.height) ctx.fillRect(0, sy, VIEW.width, CITY.road);
    }
    // Sidewalk bands around each block.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let bx = 0; bx < CITY.size; bx += CITY.block) {
      for (let by = 0; by < CITY.size; by += CITY.block) {
        const sx = bx + CITY.road / 2 - camX;
        const sy = by + CITY.road / 2 - camY;
        const s = CITY.block - CITY.road;
        if (sx > -s && sx < VIEW.width && sy > -s && sy < VIEW.height) ctx.fillRect(sx, sy, s, s);
      }
    }
    ctx.fillStyle = PALETTE.grass;
    for (let bx = 0; bx < CITY.size; bx += CITY.block) {
      for (let by = 0; by < CITY.size; by += CITY.block) {
        const sx = bx + CITY.road / 2 + CITY.sidewalk - camX;
        const sy = by + CITY.road / 2 + CITY.sidewalk - camY;
        const s = CITY.block - CITY.road - CITY.sidewalk * 2;
        if (sx > -s && sx < VIEW.width && sy > -s && sy < VIEW.height) ctx.fillRect(sx, sy, s, s);
      }
    }
    // Dashed centre lines.
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let gx = 0; gx <= CITY.size; gx += CITY.block) {
      const sx = gx - camX;
      if (sx > 0 && sx < VIEW.width) { ctx.moveTo(sx, 0); ctx.lineTo(sx, VIEW.height); }
      const sy = gx - camY;
      if (sy > 0 && sy < VIEW.height) { ctx.moveTo(0, sy); ctx.lineTo(VIEW.width, sy); }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Buildings + windows.
    for (const b of state.buildings) {
      const sx = b.x - camX; const sy = b.y - camY;
      if (sx + b.w < 0 || sy + b.h < 0 || sx > VIEW.width || sy > VIEW.height) continue;
      ctx.fillStyle = PALETTE.buildingEdge;
      ctx.fillRect(sx - 3, sy - 3, b.w + 6, b.h + 6);
      ctx.fillStyle = b.color;
      ctx.fillRect(sx, sy, b.w, b.h);
      ctx.fillStyle = 'rgba(255,220,130,0.5)';
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13 + b.floors) % 3 !== 0) {
            ctx.fillRect(sx + 10 + i * ((b.w - 20) / cols), sy + 10 + j * ((b.h - 20) / rows), 9, 6);
          }
        }
      }
    }
    // Neon signs.
    ctx.textBaseline = 'middle';
    for (const s of state.signs) {
      const sx = s.x - camX; const sy = s.y - camY;
      if (sx < -160 || sy < -30 || sx > VIEW.width + 160 || sy > VIEW.height + 30) continue;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      text(s.text, sx, sy, 15, s.color, 'center', 'bold');
      ctx.shadowBlur = 0;
    }
    ctx.textBaseline = 'alphabetic';
    // Landmarks: glowing pads + labels.
    for (const lm of Object.values(state.landmarks)) {
      const sx = lm.x - camX; const sy = lm.y - camY;
      if (sx < -140 || sy < -80 || sx > VIEW.width + 140 || sy > VIEW.height + 80) continue;
      ctx.strokeStyle = lm.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = lm.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, 62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(10,10,20,0.72)';
      const w = ctx.measureText(lm.name).width;
      void w;
      text(lm.name.toUpperCase(), sx, sy - 74, 16, lm.color, 'center', 'bold');
    }
  }

  function drawCar(car, state, isPlayerCar) {
    const sx = car.x - state.camX; const sy = car.y - state.camY;
    if (sx < -90 || sy < -90 || sx > VIEW.width + 90 || sy > VIEW.height + 90) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-24, -10, 54, 28);
    // Body.
    ctx.fillStyle = car.dead ? '#3a3a42' : car.color;
    roundRect(-27, -13, 54, 26, 7);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = car.police ? '#1c2a4a' : 'rgba(16,22,38,0.9)';
    roundRect(-8, -10, 22, 20, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,220,255,0.55)';
    ctx.fillRect(12, -9, 5, 18);
    // Police livery: stripe + light bar.
    if (car.police) {
      ctx.fillStyle = PALETTE.policeStripe;
      ctx.fillRect(-27, -4, 54, 8);
      const flash = Math.floor(state.elapsed * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-6, -11, 12, 6);
      ctx.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-6, 5, 12, 6);
    }
    // Getaway marker.
    if (car.getaway) {
      ctx.fillStyle = PALETTE.neonPink;
      ctx.fillRect(-27, -3, 54, 6);
    }
    // Headlights.
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.fillRect(25, -10, 3, 6);
    ctx.fillRect(25, 4, 3, 6);
    ctx.restore();
    // Damage smoke.
    if (car.smoke > 0.15) {
      ctx.fillStyle = `rgba(190,190,200,${0.25 + car.smoke * 0.3})`;
      const n = 3 + Math.floor(car.smoke * 4);
      for (let i = 0; i < n; i += 1) {
        const wob = Math.sin(state.elapsed * 3 + i * 1.7 + car.x) * 8;
        ctx.beginPath();
        ctx.arc(sx + wob, sy - 14 - i * 9 - (state.elapsed * 14 + i * 7) % 12, 6 + i * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (isPlayerCar) {
      ctx.strokeStyle = PALETTE.waypoint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - 34 - Math.sin(state.elapsed * 4) * 3, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPed(ped, state) {
    const sx = ped.x - state.camX; const sy = ped.y - state.camY;
    if (sx < -30 || sy < -30 || sx > VIEW.width + 30 || sy > VIEW.height + 30) return;
    if (ped.down > 0) {
      ctx.fillStyle = ped.color;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillRect(-12, -5, 24, 10);
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(sx, sy + 3, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.playerSkin;
    ctx.beginPath(); ctx.arc(sx, sy, 4.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    const sx = p.x - state.camX; const sy = p.y - state.camY;
    // Punch arc flash.
    if (p.punchTimer > 0.18) {
      ctx.strokeStyle = p.hasGun ? '#ffe27a' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, p.hasGun ? 44 : 24, p.angle - 0.7, p.angle + 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(sx, sy + 4, 11, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.neonPink;
    ctx.fillRect(-6, -11, 12, 6); // shoulders
    ctx.fillRect(-6, 5, 12, 6);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.playerSkin;
    ctx.beginPath(); ctx.arc(2, 0, 5.4, 0, Math.PI * 2); ctx.fill();
    if (p.hasGun) {
      ctx.fillStyle = '#22242e';
      ctx.fillRect(8, -2, 11, 4);
    }
    ctx.restore();
    if (p.hurtTimer > 0) {
      ctx.fillStyle = 'rgba(255,60,70,0.25)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const sx = pk.x - state.camX; const sy = pk.y - state.camY;
      const bob = Math.sin(state.elapsed * 3.4) * 4;
      ctx.save();
      ctx.translate(sx, sy + bob);
      ctx.shadowColor = pk.kind === 'package' ? PALETTE.neonAmber : PALETTE.neonCyan;
      ctx.shadowBlur = 16;
      if (pk.kind === 'package') {
        ctx.fillStyle = '#c98a3e';
        ctx.fillRect(-13, -11, 26, 22);
        ctx.fillStyle = '#8a5a24';
        ctx.fillRect(-13, -3, 26, 5);
        ctx.fillRect(-3, -11, 5, 22);
      } else {
        ctx.fillStyle = '#22242e';
        ctx.fillRect(-13, -4, 24, 8);
        ctx.fillRect(6, 2, 6, 8);
        ctx.fillStyle = '#9aa3c0';
        ctx.fillRect(-13, -4, 24, 2);
      }
      ctx.restore();
      text(pk.kind === 'package' ? 'PACKAGE' : 'PISTOL', sx, sy - 26 + bob, 13, '#ffffff', 'center', 'bold');
    }
  }

  function drawWaypoint(state, wp) {
    if (!wp) return;
    const sx = wp.x - state.camX; const sy = wp.y - state.camY;
    const onScreen = sx > 30 && sx < VIEW.width - 30 && sy > 30 && sy < VIEW.height - 30;
    if (onScreen) {
      const bob = Math.sin(state.elapsed * 4) * 5;
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 44 + bob);
      ctx.lineTo(sx - 11, sy - 66 + bob);
      ctx.lineTo(sx + 11, sy - 66 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.waypoint;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 20 + Math.sin(state.elapsed * 4) * 3, 0, Math.PI * 2); ctx.stroke();
      text(wp.label, sx, sy - 76 + bob, 14, PALETTE.waypoint, 'center', 'bold');
    } else {
      // Edge arrow pointing toward the target.
      const cx = VIEW.width / 2; const cy = VIEW.height / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      // Clamp inside the frame so the label beside the arrow never clips.
      const ex = Math.min(VIEW.width - 120, Math.max(120, cx + Math.cos(ang) * (VIEW.width / 2 - 60)));
      const ey = Math.min(VIEW.height - 60, Math.max(70, cy + Math.sin(ang) * (VIEW.height / 2 - 60)));
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(-12, -12); ctx.lineTo(-12, 12);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(wp.x - state.player.x, wp.y - state.player.y) / 10);
      text(`${wp.label}  ${d}m`, ex, ey - 24, 14, PALETTE.waypoint, 'center', 'bold');
    }
  }

  // ---- HUD ---------------------------------------------------------------------
  function drawMinimap(state, wp) {
    const mw = 216; const mh = 216;
    const mx = VIEW.width - mw - 18; const my = 64;
    ctx.fillStyle = 'rgba(10,12,24,0.82)';
    roundRect(mx - 4, my - 4, mw + 8, mh + 8, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(120,140,200,0.5)';
    ctx.lineWidth = 1;
    roundRect(mx - 4, my - 4, mw + 8, mh + 8, 8); ctx.stroke();
    const s = mw / CITY.size;
    // Roads.
    ctx.strokeStyle = 'rgba(150,165,220,0.65)';
    ctx.beginPath();
    for (let g = 0; g <= CITY.size; g += CITY.block) {
      ctx.moveTo(mx + g * s, my); ctx.lineTo(mx + g * s, my + mh);
      ctx.moveTo(mx, my + g * s); ctx.lineTo(mx + mw, my + g * s);
    }
    ctx.stroke();
    // Landmarks.
    for (const lm of Object.values(state.landmarks)) {
      ctx.fillStyle = lm.color;
      ctx.fillRect(mx + lm.x * s - 2, my + lm.y * s - 2, 4, 4);
    }
    // Waypoint.
    if (wp) {
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath();
      ctx.arc(mx + wp.x * s, my + wp.y * s, 5 + Math.sin(state.elapsed * 5) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police dots.
    ctx.fillStyle = '#3b82ff';
    for (const cop of state.police) {
      ctx.beginPath();
      ctx.arc(mx + cop.x * s, my + cop.y * s, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic dots.
    ctx.fillStyle = 'rgba(220,225,245,0.55)';
    for (const car of state.cars) {
      ctx.fillRect(mx + car.x * s - 1.4, my + car.y * s - 1.4, 2.8, 2.8);
    }
    // Player arrow.
    const px = mx + state.player.x * s; const py = my + state.player.y * s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    text('NEON BAY', mx + mw / 2, my + mh + 18, 12, PALETTE.muted, 'center', 'bold');
  }

  function drawHud(state, wp) {
    // Cash + clock, top-left.
    ctx.fillStyle = 'rgba(10,12,24,0.66)';
    roundRect(14, 12, 252, 76, 8); ctx.fill();
    text(`$${state.cash}`, 28, 50, 32, PALETTE.cash, 'left', 'bold');
    text(fmtClock(state.clock), 28, 78, 17, PALETTE.text, 'left');
    text(state.player.hasGun ? 'PISTOL' : 'FISTS', 150, 78, 15, state.player.hasGun ? PALETTE.neonCyan : PALETTE.muted, 'left', 'bold');
    // Wanted stars, top-centre.
    const starY = 40;
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW.width / 2 - 78 + i * 40;
      text('★', x, starY, 36, i < state.wanted ? PALETTE.star : PALETTE.starOff, 'center');
    }
    if (state.wanted > 0 && state.seenTimer > 1) {
      text('LOSING THE HEAT…', VIEW.width / 2, 68, 14, PALETTE.muted, 'center', 'bold');
    }
    // Health bar, bottom-left, with its label inside the panel.
    const hw = 250;
    ctx.fillStyle = 'rgba(10,12,24,0.66)';
    roundRect(14, VIEW.height - 58, hw + 20, 44, 8); ctx.fill();
    text('HEALTH', 24, VIEW.height - 44, 11, PALETTE.muted, 'left', 'bold');
    text(`${Math.max(0, Math.round(state.player.health))}`, 24 + hw, VIEW.height - 44, 11, PALETTE.text, 'right', 'bold');
    ctx.fillStyle = '#3a2030';
    ctx.fillRect(24, VIEW.height - 40, hw, 14);
    ctx.fillStyle = state.player.health > 30 ? PALETTE.health : '#ff2222';
    ctx.fillRect(24, VIEW.height - 40, hw * Math.max(0, state.player.health) / 100, 14);
    // Car health when driving.
    if (state.player.inCar) {
      const cw = 250;
      ctx.fillStyle = 'rgba(10,12,24,0.66)';
      roundRect(14, VIEW.height - 96, cw + 20, 34, 8); ctx.fill();
      ctx.fillStyle = '#20303a';
      ctx.fillRect(24, VIEW.height - 86, cw, 12);
      ctx.fillStyle = PALETTE.neonCyan;
      ctx.fillRect(24, VIEW.height - 86, cw * Math.max(0, state.player.inCar.health) / 100, 12);
      text(`CAR  ${Math.max(0, Math.round(state.player.inCar.health))}%`, 24, VIEW.height - 90, 12, PALETTE.text, 'left', 'bold');
    }
    // Mission tracker, bottom-right.
    const mission = MISSIONS[state.missionIndex];
    ctx.fillStyle = 'rgba(10,12,24,0.72)';
    roundRect(VIEW.width - 356, VIEW.height - 108, 342, 94, 8); ctx.fill();
    if (state.missionState === 'done') {
      text('ALL MISSIONS COMPLETE', VIEW.width - 339, VIEW.height - 74, 17, PALETTE.cash, 'left', 'bold');
      text('Free roam Neon Bay — the city is yours.', VIEW.width - 339, VIEW.height - 48, 14, PALETTE.text, 'left');
    } else if (mission) {
      text(`MISSION ${state.missionIndex + 1}/3 — ${mission.name.toUpperCase()}`, VIEW.width - 339, VIEW.height - 80, 16, PALETTE.neonAmber, 'left', 'bold');
      const stageText = state.missionState === 'active'
        ? mission.stages[state.missionStage]
        : state.missionState === 'briefing' ? 'Read the briefing — press SPACE to start' : 'Press SPACE for the next mission';
      text(stageText, VIEW.width - 339, VIEW.height - 54, 14.5, PALETTE.text, 'left');
      if (state.missionTimer > 0) {
        text(`TIME ${fmtTimer(state.missionTimer)}`, VIEW.width - 339, VIEW.height - 28, 16,
          state.missionTimer < 15 ? '#ff5e6a' : PALETTE.waypoint, 'left', 'bold');
      } else {
        text(`REWARD $${mission.reward}`, VIEW.width - 339, VIEW.height - 28, 14, PALETTE.cash, 'left', 'bold');
      }
    }
    // Context hint.
    if (!state.player.inCar) {
      let nearCar = false;
      for (const c of state.cars) {
        if (Math.hypot(c.x - state.player.x, c.y - state.player.y) < 56) nearCar = true;
      }
      if (nearCar) text('Press E to enter car', VIEW.width / 2, VIEW.height - 26, 17, '#ffffff', 'center', 'bold');
    } else {
      text('W A S D drive · E exit · P pause', VIEW.width / 2, VIEW.height - 26, 14, PALETTE.muted, 'center');
    }
    // Banner.
    if (state.bannerTimer > 0 && state.banner) {
      ctx.fillStyle = 'rgba(10,12,24,0.8)';
      const bw = Math.max(340, state.banner.length * 9.6);
      roundRect(VIEW.width / 2 - bw / 2, 92, bw, 40, 8); ctx.fill();
      text(state.banner, VIEW.width / 2, 119, 17, PALETTE.neonAmber, 'center', 'bold');
    }
    drawMinimap(state, wp);
  }

  // ---- panels ---------------------------------------------------------------------
  function panel(w, h) {
    ctx.fillStyle = 'rgba(4,5,12,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const x = (VIEW.width - w) / 2; const y = (VIEW.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14); ctx.stroke();
    return { x, y };
  }
  function wrap(value, maxChars) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawTitle(state, save) {
    drawCity(state);
    // A light dusk veil only: the cover shot should read as the living city
    // first and the title second, so the neon stays bright behind the words.
    ctx.fillStyle = 'rgba(8,6,20,0.34)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.shadowColor = PALETTE.neonPink;
    ctx.shadowBlur = 30;
    text('NEON BAY', VIEW.width / 2, 168, 96, PALETTE.neonPink, 'center', 'bold');
    ctx.shadowColor = PALETTE.neonCyan;
    ctx.shadowBlur = 22;
    text('VICE RUN', VIEW.width / 2, 238, 58, PALETTE.neonCyan, 'center', 'bold');
    ctx.shadowBlur = 0;
    const lines = [
      'Dusk falls on Neon Bay. Marlo runs the Bayview Diner — and every',
      'wheel, package and getaway in the city. Three jobs. One long night.',
      'Steal cars, outrun the heat, and make the bay yours.',
    ];
    lines.forEach((l, i) => text(l, VIEW.width / 2, 300 + i * 26, 19, PALETTE.text, 'center'));
    const controls = [
      'WASD / Arrows — move & drive      Shift — run',
      'E — enter / steal / exit car      Space — punch / shoot',
      'P / Esc — pause      Spray shop — repaint, lose the heat ($100)',
    ];
    controls.forEach((l, i) => text(l, VIEW.width / 2, 424 + i * 25, 16.5, PALETTE.muted, 'center'));
    if (save && (save.bestCash > 0 || save.missionsDone > 0)) {
      text(`BEST SAVE — $${save.bestCash} · ${save.missionsDone}/3 missions complete`,
        VIEW.width / 2, 530, 17, PALETTE.cash, 'center', 'bold');
    }
    const pulse = 0.7 + Math.sin(state.elapsed * 3.2) * 0.3;
    ctx.globalAlpha = pulse;
    text('PRESS SPACE OR CLICK TO START', VIEW.width / 2, 586, 24, PALETTE.star, 'center', 'bold');
    ctx.globalAlpha = 1;
    text('An original top-down open-world crime game — procedural city, traffic, police, three chained missions.', VIEW.width / 2, 668, 14, PALETTE.muted, 'center');
  }

  function drawBriefing(state) {
    drawCity(state);
    for (const c of state.cars) drawCar(c, state, false);
    for (const ped of state.peds) drawPed(ped, state);
    drawPlayer(state);
    const mission = MISSIONS[state.missionIndex];
    const { x, y } = panel(680, 380);
    text(`MISSION ${state.missionIndex + 1} OF 3`, x + 340, y + 58, 17, PALETTE.neonCyan, 'center', 'bold');
    text(mission.name.toUpperCase(), x + 340, y + 108, 42, PALETTE.neonAmber, 'center', 'bold');
    text(mission.giver, x + 340, y + 140, 16, PALETTE.muted, 'center');
    wrap(mission.brief, 62).forEach((l, i) => text(l, x + 340, y + 182 + i * 25, 17.5, PALETTE.text, 'center'));
    mission.stages.forEach((s, i) => text(`${i + 1}.  ${s}`, x + 340, y + 268 + i * 24, 15.5, PALETTE.muted, 'center'));
    text(`REWARD $${mission.reward}`, x + 340, y + 330, 19, PALETTE.cash, 'center', 'bold');
    text('PRESS SPACE TO START', x + 340, y + 362, 16, PALETTE.star, 'center', 'bold');
  }

  function drawComplete(state) {
    drawHud(state, null);
    const mission = MISSIONS[state.missionIndex];
    const { x, y } = panel(620, 250);
    text('MISSION COMPLETE', x + 310, y + 76, 38, PALETTE.cash, 'center', 'bold');
    text(mission.name, x + 310, y + 118, 22, PALETTE.text, 'center');
    text(`+$${mission.reward}  —  Cash $${state.cash}`, x + 310, y + 158, 20, PALETTE.neonAmber, 'center', 'bold');
    if (state.missionIndex === 0) text('A pistol is waiting at the Neon Garage.', x + 310, y + 190, 16, PALETTE.neonCyan, 'center');
    text(state.missionIndex >= 2 ? 'PRESS SPACE — FREE ROAM' : 'PRESS SPACE FOR THE NEXT MISSION', x + 310, y + 226, 16, PALETTE.star, 'center', 'bold');
  }

  /** Paint one frame. `screen` is one of the SCREEN_* values; `extra` carries {save, overKind}. */
  function draw(state, screen, wp, extra = {}) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.textBaseline = 'alphabetic';

    if (screen === SCREEN_TITLE) { drawTitle(state, extra.save); return; }
    if (screen === SCREEN_BRIEFING) { drawBriefing(state); return; }

    drawCity(state);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, state, state.player.inCar === car);
    for (const cop of state.police) drawCar(cop, state, false);
    for (const ped of state.peds) drawPed(ped, state);
    drawPlayer(state);
    drawWaypoint(state, wp);
    // Dusk grade: a warm-violet wash over the world.
    ctx.fillStyle = 'rgba(70,30,90,0.10)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (screen === SCREEN_COMPLETE) { drawComplete(state); return; }
    drawHud(state, wp);
    if (screen === SCREEN_PAUSED) {
      const { x, y } = panel(440, 220);
      void x; void y;
      text('PAUSED', VIEW.width / 2, VIEW.height / 2 - 18, 44, PALETTE.text, 'center', 'bold');
      text('Neon Bay waits for no one — but it will wait for you.', VIEW.width / 2, VIEW.height / 2 + 24, 16, PALETTE.muted, 'center');
      text('Press P to resume', VIEW.width / 2, VIEW.height / 2 + 62, 18, PALETTE.star, 'center', 'bold');
    }
    if (screen === SCREEN_OVER) {
      const busted = extra.overKind === 'busted';
      const { x, y } = panel(520, 260);
      void x; void y;
      text(busted ? 'BUSTED' : 'WASTED', VIEW.width / 2, VIEW.height / 2 - 52, 56,
        busted ? '#3b82ff' : PALETTE.health, 'center', 'bold');
      text(busted ? 'The Neon Bay PD finally boxed you in.' : 'The bay claims another runner.',
        VIEW.width / 2, VIEW.height / 2 - 8, 17, PALETTE.text, 'center');
      text(`Cash $${state.cash} · Missions ${state.missionIndex + (state.missionState === 'done' ? 1 : 0)}/3`,
        VIEW.width / 2, VIEW.height / 2 + 28, 17, PALETTE.muted, 'center');
      text('PRESS R OR SPACE TO RUN AGAIN', VIEW.width / 2, VIEW.height / 2 + 74, 18, PALETTE.star, 'center', 'bold');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
