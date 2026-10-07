// 2048 bot for play2048.co — expectimax search with lookup-table heuristics.
// Paste into the browser console on https://play2048.co (or use as a bookmarklet).
// Stop it any time with:  __bot2048.stop()

const AI = (() => {
  // Board = two 32-bit ints (hi = rows 0-1, lo = rows 2-3). Each row is 16 bits,
  // 4 bits per cell holding the tile's exponent (2 -> 1, 4 -> 2, 2048 -> 11).
  // Column c lives in bits 4c..4c+3 of its row, so "left" means toward nibble 0.
  const LEFT = new Uint16Array(65536);
  const RIGHT = new Uint16Array(65536);
  const HEUR = new Float64Array(65536);

  // Heuristic weights (tuned values from nneonneo's well-known 2048 AI).
  const LOST_PENALTY = 200000, MONO_POW = 4, MONO_W = 47, SUM_POW = 3.5,
    SUM_W = 11, MERGE_W = 700, EMPTY_W = 270;

  const rev = (r) => ((r & 0xF) << 12) | (((r >> 4) & 0xF) << 8) | (((r >> 8) & 0xF) << 4) | ((r >> 12) & 0xF);

  for (let r = 0; r < 65536; r++) {
    const line = [r & 0xF, (r >> 4) & 0xF, (r >> 8) & 0xF, (r >> 12) & 0xF];

    // Heuristic for this row (also used for columns).
    let sum = 0, empty = 0, merges = 0, prev = 0, counter = 0;
    for (const rank of line) {
      sum += Math.pow(rank, SUM_POW);
      if (rank === 0) empty++;
      else {
        if (prev === rank) counter++;
        else if (counter > 0) { merges += 1 + counter; counter = 0; }
        prev = rank;
      }
    }
    if (counter > 0) merges += 1 + counter;
    let monoL = 0, monoR = 0;
    for (let i = 1; i < 4; i++) {
      const a = Math.pow(line[i - 1], MONO_POW) * MONO_W, b = Math.pow(line[i], MONO_POW) * MONO_W;
      if (line[i - 1] > line[i]) monoL += a - b; else monoR += b - a;
    }
    HEUR[r] = LOST_PENALTY + EMPTY_W * empty + MERGE_W * merges - Math.min(monoL, monoR) - SUM_W * sum;

    // Slide + merge to the left (each tile merges at most once per move).
    const tiles = line.filter((v) => v);
    const out = [];
    for (let i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1] && tiles[i] !== 0xF) { out.push(tiles[i] + 1); i++; }
      else out.push(tiles[i]);
    }
    while (out.length < 4) out.push(0);
    LEFT[r] = out[0] | (out[1] << 4) | (out[2] << 8) | (out[3] << 12);
  }
  for (let r = 0; r < 65536; r++) RIGHT[r] = rev(LEFT[rev(r)]);

  const row = (hi, lo, i) => (i === 0 ? hi >>> 16 : i === 1 ? hi & 0xFFFF : i === 2 ? lo >>> 16 : lo & 0xFFFF);

  // Transpose: rows become columns. Result written to TH/TL.
  let TH = 0, TL = 0;
  function transpose(hi, lo) {
    const r = [hi >>> 16, hi & 0xFFFF, lo >>> 16, lo & 0xFFFF];
    const c = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) c[j] |= ((r[i] >> (4 * j)) & 0xF) << (4 * i);
    TH = ((c[0] << 16) | c[1]) >>> 0; TL = ((c[2] << 16) | c[3]) >>> 0;
  }

  // Moves: 0 up, 1 down, 2 left, 3 right. Result written to MH/ML.
  let MH = 0, ML = 0;
  function move(hi, lo, dir) {
    if (dir >= 2) {
      const T = dir === 2 ? LEFT : RIGHT;
      MH = ((T[hi >>> 16] << 16) | T[hi & 0xFFFF]) >>> 0;
      ML = ((T[lo >>> 16] << 16) | T[lo & 0xFFFF]) >>> 0;
    } else {
      transpose(hi, lo);
      const T = dir === 0 ? LEFT : RIGHT;
      const h = ((T[TH >>> 16] << 16) | T[TH & 0xFFFF]) >>> 0;
      const l = ((T[TL >>> 16] << 16) | T[TL & 0xFFFF]) >>> 0;
      transpose(h, l);
      MH = TH; ML = TL;
    }
  }

  function heur(hi, lo) {
    transpose(hi, lo);
    return HEUR[hi >>> 16] + HEUR[hi & 0xFFFF] + HEUR[lo >>> 16] + HEUR[lo & 0xFFFF] +
      HEUR[TH >>> 16] + HEUR[TH & 0xFFFF] + HEUR[TL >>> 16] + HEUR[TL & 0xFFFF];
  }

  function distinctTiles(hi, lo) {
    let seen = 0;
    for (let i = 0; i < 4; i++) { const r = row(hi, lo, i); for (let j = 0; j < 4; j++) seen |= 1 << ((r >> (4 * j)) & 0xF); }
    seen >>= 1; let n = 0; while (seen) { n += seen & 1; seen >>= 1; }
    return n;
  }

  // Expectimax: chance nodes average over every 2/4 spawn, move nodes take the best move.
  const PROB_CUTOFF = 0.0001, CACHE_DEPTH = 15;
  let depth = 0, depthLimit = 0, cache = null;

  function chanceNode(hi, lo, prob) {
    if (prob < PROB_CUTOFF || depth >= depthLimit) return heur(hi, lo);
    if (depth < CACHE_DEPTH) {
      const hit = cache.get(hi)?.get(lo);
      if (hit && hit.depth <= depth) return hit.score;
    }
    let empties = 0;
    for (let s = 0; s < 32; s += 4) { if (((hi >>> s) & 0xF) === 0) empties++; if (((lo >>> s) & 0xF) === 0) empties++; }
    prob /= empties;
    let total = 0;
    for (let s = 0; s < 32; s += 4) {
      if (((hi >>> s) & 0xF) === 0) total += moveNode((hi | (1 << s)) >>> 0, lo, prob * 0.9) * 0.9 + moveNode((hi | (2 << s)) >>> 0, lo, prob * 0.1) * 0.1;
      if (((lo >>> s) & 0xF) === 0) total += moveNode(hi, (lo | (1 << s)) >>> 0, prob * 0.9) * 0.9 + moveNode(hi, (lo | (2 << s)) >>> 0, prob * 0.1) * 0.1;
    }
    total /= empties;
    if (depth < CACHE_DEPTH) {
      let m = cache.get(hi); if (!m) cache.set(hi, (m = new Map()));
      m.set(lo, { depth, score: total });
    }
    return total;
  }

  function moveNode(hi, lo, prob) {
    let best = 0;
    depth++;
    for (let d = 0; d < 4; d++) {
      move(hi, lo, d);
      const h = MH, l = ML;
      if (h !== hi || l !== lo) best = Math.max(best, chanceNode(h, l, prob));
    }
    depth--;
    return best;
  }

  // Returns the best direction (0 up, 1 down, 2 left, 3 right), or -1 if no move is possible.
  function bestMove(hi, lo) {
    cache = new Map();
    depthLimit = Math.max(3, distinctTiles(hi, lo) - 2);
    let best = -1, bestScore = -1;
    for (let d = 0; d < 4; d++) {
      move(hi, lo, d);
      const h = MH, l = ML;
      if (h === hi && l === lo) continue;
      depth = 0;
      const s = chanceNode(h, l, 1) + 1e-6;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  // grid[r][c] = tile value (0, 2, 4, ...) -> packed board.
  function pack(grid) {
    let hi = 0, lo = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const v = grid[r][c], rank = v ? Math.min(15, Math.round(Math.log2(v))) : 0;
      if (r < 2) hi |= rank << (16 * (1 - r) + 4 * c); else lo |= rank << (16 * (3 - r) + 4 * c);
    }
    return [hi >>> 0, lo >>> 0];
  }

  return { bestMove, move: (hi, lo, d) => (move(hi, lo, d), [MH, ML]), pack, row };
})();

// ---- Browser driver for play2048.co ----
if (typeof window !== 'undefined') (() => {
  const MOVE_DELAY_MS = 0; // extra pause between moves if you want to watch
  const KEYS = [['ArrowUp', 38], ['ArrowDown', 40], ['ArrowLeft', 37], ['ArrowRight', 39]];

  // The page sends the whole game state to its render worker on every move — listen in.
  let state = null;
  const origPost = window.__orig2048Post || Worker.prototype.postMessage;
  window.__orig2048Post = origPost;
  Worker.prototype.postMessage = function (msg, ...rest) {
    const s = msg?.args?.[0];
    if (msg?.type === 'call' && s?.board) state = s;
    return origPost.call(this, msg, ...rest);
  };

  const press = (i) => {
    const [key, keyCode] = KEYS[i];
    const target = document.activeElement || document.body;
    for (const type of ['keydown', 'keyup'])
      target.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
  };

  const toGrid = (board) => {
    const g = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const line of board) for (const t of line) if (t) g[t.position.y][t.position.x] = t.value;
    return g;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (cond, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await sleep(10); } return false; };

  let running = true;
  window.__bot2048 = { stop: () => { running = false; console.log('2048 bot stopped'); } };

  (async () => {
    // No state yet: nudge the game with any legal move so it reports the board.
    for (let i = 0; !state && i < 4; i++) { press([2, 1, 3, 0][i]); await waitFor(() => state, 600); }
    if (!state) return console.log('2048 bot: could not read the board — is this play2048.co?');
    console.log('2048 bot running. Stop with __bot2048.stop()');

    while (running) {
      if (state.state === 'won' || state.state === 'over' || state.state !== 'playing') {
        const keep = [...document.querySelectorAll('button')].find((b) => /keep (going|playing)|continue/i.test(b.textContent));
        if (state.state !== 'over' && keep) { keep.click(); await sleep(500); continue; }
        if (state.state === 'over') break;
      }
      const [hi, lo] = AI.pack(toGrid(state.board));
      const dir = AI.bestMove(hi, lo);
      if (dir < 0) break;
      const before = state.moveCount;
      press(dir);
      await waitFor(() => state.moveCount !== before, 2000);
      if (MOVE_DELAY_MS) await sleep(MOVE_DELAY_MS);
    }
    const best = Math.max(...toGrid(state.board).flat());
    console.log(`2048 bot finished. Score ${state.score}, biggest tile ${best}, ${state.moveCount} moves.`);
  })();
})();
