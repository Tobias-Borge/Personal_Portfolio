const GRAVITY = 9.8;
const MASS_CART = 1.0;
const MASS_POLE = 0.1;
const TOTAL_MASS = MASS_CART + MASS_POLE;
const LENGTH = 0.5;
const POLE_MASS_LENGTH = MASS_POLE * LENGTH;
const FORCE_MAG = 10.0;
const TAU = 0.02;
const X_THRESHOLD = 2.4;
const FAIL_ANGLE = (90 * Math.PI) / 180;
const IMPULSE = 1.0;
const RESET_LOW = -0.05;
const RESET_HIGH = 0.05;
const CART_WIDTH = 50;
const CART_HEIGHT = 28;
const WHEEL_RADIUS = 8;
const TIP_RADIUS = 8;
const TOP_PAD = 20;
const BOTTOM_PAD = 22;

// Same K as Autonomus Balance Simulator/lqr_controller.py (default CartPole params).
const LQR_K = [-3.443268891391064, -7.89495409459249, -74.36836021751594, -17.234810904024105];

const statusEl = document.getElementById("balance-status");
const bumpButtons = document.querySelectorAll("[data-bump]");
const weights = window.CARTPOLE_DQN;

const PALETTE_DQN = {
  cart: "#7eb8ae",
  wheel: "#0e1318",
  wheelStroke: "#9ad0c7",
  pole: "#e8eef2",
  tip: "#9ad0c7",
};

const PALETTE_LQR = {
  cart: "#c4a574",
  wheel: "#0e1318",
  wheelStroke: "#e0c9a4",
  pole: "#e8eef2",
  tip: "#e0c9a4",
};

let pendingBump = 0;
let lastTime = 0;
let accumulator = 0;

function randomBetween(low, high) {
  return low + Math.random() * (high - low);
}

function resetState() {
  return [
    randomBetween(RESET_LOW, RESET_HIGH),
    randomBetween(RESET_LOW, RESET_HIGH),
    randomBetween(RESET_LOW, RESET_HIGH),
    randomBetween(RESET_LOW, RESET_HIGH),
  ];
}

function dense(input, kernel, bias, relu) {
  const out = new Array(bias.length);
  for (let j = 0; j < bias.length; j += 1) {
    let sum = bias[j];
    for (let i = 0; i < input.length; i += 1) {
      sum += input[i] * kernel[i][j];
    }
    out[j] = relu ? Math.max(0, sum) : sum;
  }
  return out;
}

function dqnAct(observation) {
  const hidden1 = dense(observation, weights.dense.kernel, weights.dense.bias, true);
  const hidden2 = dense(hidden1, weights.dense_1.kernel, weights.dense_1.bias, true);
  const qValues = dense(hidden2, weights.dense_2.kernel, weights.dense_2.bias, false);
  return qValues[1] > qValues[0] ? 1 : 0;
}

function lqrAct(observation) {
  const force = -(
    LQR_K[0] * observation[0] +
    LQR_K[1] * observation[1] +
    LQR_K[2] * observation[2] +
    LQR_K[3] * observation[3]
  );
  return force >= 0 ? 1 : 0;
}

function step(observation, action) {
  let [x, xDot, theta, thetaDot] = observation;
  const force = action === 1 ? FORCE_MAG : -FORCE_MAG;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const temp = (force + POLE_MASS_LENGTH * thetaDot * thetaDot * sinTheta) / TOTAL_MASS;
  const thetaAcc =
    (GRAVITY * sinTheta - cosTheta * temp) /
    (LENGTH * (4.0 / 3.0 - (MASS_POLE * cosTheta * cosTheta) / TOTAL_MASS));
  const xAcc = temp - (POLE_MASS_LENGTH * thetaAcc * cosTheta) / TOTAL_MASS;

  x += TAU * xDot;
  xDot += TAU * xAcc;
  theta += TAU * thetaDot;
  thetaDot += TAU * thetaAcc;

  const next = [x, xDot, theta, thetaDot];
  const terminated =
    x < -X_THRESHOLD || x > X_THRESHOLD || theta < -FAIL_ANGLE || theta > FAIL_ANGLE;
  return { next, reward: 1, terminated };
}

function bump(observation, direction) {
  const impulse = direction > 0 ? IMPULSE : -IMPULSE;
  return [observation[0], observation[1], observation[2], observation[3] + impulse];
}

function makeSetup(prefix, act, palette) {
  const canvas = document.getElementById(`${prefix}-canvas`);
  return {
    name: prefix.toUpperCase(),
    canvas,
    ctx: canvas.getContext("2d"),
    scoreEl: document.getElementById(`${prefix}-score`),
    episodeEl: document.getElementById(`${prefix}-episode`),
    act,
    palette,
    state: [0, 0, 0, 0],
    score: 0,
    episode: 1,
  };
}

const setups = [
  makeSetup("dqn", dqnAct, PALETTE_DQN),
  makeSetup("lqr", lqrAct, PALETTE_LQR),
];

function copyState(state) {
  return state.slice();
}

function startTogether() {
  const start = resetState();
  setups.forEach((setup) => {
    setup.state = copyState(start);
    setup.score = 0;
    setup.episode = 1;
    setup.scoreEl.textContent = "0";
    setup.episodeEl.textContent = "1";
  });
}

function queueBump(direction) {
  pendingBump = direction;
}

function advanceSetup(setup) {
  const result = step(setup.state, setup.act(setup.state));
  setup.state = result.next;
  setup.score += result.reward;
  if (pendingBump) {
    setup.state = bump(setup.state, pendingBump);
  }
  if (result.terminated) {
    setup.episode += 1;
    setup.score = 0;
    setup.state = resetState();
  }
  setup.scoreEl.textContent = String(Math.floor(setup.score));
  setup.episodeEl.textContent = String(setup.episode);
  return result.terminated;
}

function physicsStep() {
  const failed = [];
  setups.forEach((setup) => {
    if (advanceSetup(setup)) failed.push(setup.name);
  });
  if (pendingBump) {
    const side = pendingBump > 0 ? "høyre" : "venstre";
    statusEl.textContent = `Dytt ${side} på begge — se hvem som retter opp.`;
    pendingBump = 0;
  }
  if (failed.length) {
    statusEl.textContent = `${failed.join(" og ")} falt. Den siden starter på nytt.`;
  }
}

function getLayout(canvas, state) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const worldWidth = X_THRESHOLD * 2;
  const cartY = height - CART_HEIGHT / 2 - WHEEL_RADIUS - BOTTOM_PAD;
  const axleY = cartY - 4;
  const maxPole = Math.max(40, axleY - TOP_PAD - TIP_RADIUS);
  const scale = Math.min(width / worldWidth, maxPole / (2 * LENGTH));
  const poleLen = scale * (2 * LENGTH);
  return {
    width,
    height,
    poleLen,
    cartY,
    axleY,
    cartX: state[0] * scale + width / 2,
  };
}

function neededCanvasHeight(cssWidth) {
  const worldWidth = X_THRESHOLD * 2;
  const poleLen = (cssWidth / worldWidth) * (2 * LENGTH);
  return Math.ceil(poleLen + CART_HEIGHT / 2 + WHEEL_RADIUS + BOTTOM_PAD + TOP_PAD + TIP_RADIUS);
}

function sizeCanvas(setup) {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = setup.canvas.clientWidth;
  const cssHeight = Math.max(240, neededCanvasHeight(cssWidth));
  setup.canvas.style.height = `${cssHeight}px`;
  setup.canvas.width = Math.round(cssWidth * ratio);
  setup.canvas.height = Math.round(cssHeight * ratio);
  setup.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawSetup(setup) {
  const { canvas, ctx, state, palette } = setup;
  const { width, height, poleLen, cartY, axleY, cartX } = getLayout(canvas, state);
  const poleX = cartX + Math.sin(state[2]) * poleLen;
  const poleY = axleY - Math.cos(state[2]) * poleLen;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(147, 161, 173, 0.45)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(16, cartY + CART_HEIGHT / 2);
  ctx.lineTo(width - 16, cartY + CART_HEIGHT / 2);
  ctx.stroke();

  ctx.fillStyle = palette.cart;
  roundRect(ctx, cartX - CART_WIDTH / 2, cartY - CART_HEIGHT / 2, CART_WIDTH, CART_HEIGHT, 6);
  ctx.fill();

  ctx.fillStyle = palette.wheel;
  ctx.strokeStyle = palette.wheelStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cartX - 14, cartY + CART_HEIGHT / 2, WHEEL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cartX + 14, cartY + CART_HEIGHT / 2, WHEEL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = palette.pole;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cartX, axleY);
  ctx.lineTo(poleX, poleY);
  ctx.stroke();

  ctx.fillStyle = palette.tip;
  ctx.beginPath();
  ctx.arc(poleX, poleY, TIP_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  accumulator += (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  while (accumulator >= TAU) {
    physicsStep();
    accumulator -= TAU;
  }
  setups.forEach(drawSetup);
  requestAnimationFrame(loop);
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    event.preventDefault();
    queueBump(-1);
  } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    event.preventDefault();
    queueBump(1);
  }
});

bumpButtons.forEach((button) => {
  button.addEventListener("click", () => {
    queueBump(Number(button.dataset.bump));
  });
});

window.addEventListener("resize", () => {
  setups.forEach(sizeCanvas);
  setups.forEach(drawSetup);
});

if (!weights) {
  statusEl.textContent = "Fant ikke den trente DQN-modellen. Last siden på nytt.";
} else {
  statusEl.textContent = "Begge balanserer. Ett dytt treffer både DQN og LQR.";
  startTogether();
  setups.forEach(sizeCanvas);
  requestAnimationFrame(loop);
}
