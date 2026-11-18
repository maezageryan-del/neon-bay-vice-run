// Keyboard and pointer input. Held keys give movement axes; one-shot presses
// (interact, attack, pause, confirm) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_INTERACT = 1;
export const ACTION_ATTACK = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_RESTART = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;

  function setHeld(code, value) {
    if (UP.has(code)) held.up = value;
    else if (DOWN.has(code)) held.down = value;
    else if (LEFT.has(code)) held.left = value;
    else if (RIGHT.has(code)) held.right = value;
    else if (RUN.has(code)) held.run = value;
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (setHeld(event.code, true)) { event.preventDefault(); return; }
    if (!event.repeat) {
      if (event.code === 'KeyE') actions |= ACTION_INTERACT;
      else if (event.code === 'Space') actions |= ACTION_ATTACK | ACTION_CONFIRM;
      else if (event.code === 'Enter') actions |= ACTION_CONFIRM;
      else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
      else if (event.code === 'KeyR') actions |= ACTION_RESTART;
      else return;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => { setHeld(event.code, false); });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
  });
  target.addEventListener('pointerdown', () => { actions |= ACTION_ATTACK; });

  return {
    held,
    /** Vertical axis: -1 up, 1 down. */
    axisY() { return (held.down ? 1 : 0) - (held.up ? 1 : 0); },
    /** Horizontal axis: -1 left, 1 right. */
    axisX() { return (held.right ? 1 : 0) - (held.left ? 1 : 0); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Shot/autopilot hook: force held keys. */
    setHeld(patch) { Object.assign(held, patch); },
  };
}
