const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const introModal = document.getElementById("introModal");
const playBtn = document.getElementById("playBtn");
const retryBtn = document.getElementById("retryBtn");
const boostBtn = document.getElementById("boostBtn");
const endOverlay = document.getElementById("endOverlay");
const resultText = document.getElementById("resultText");

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const accuracyEl = document.getElementById("accuracy");
const timeLeftEl = document.getElementById("timeLeft");
const energyFillEl = document.getElementById("energyFill");
const heatFillEl = document.getElementById("heatFill");

const laneButtons = Array.from(document.querySelectorAll(".lane-btn"));

const world = {
	width: canvas.width,
	height: canvas.height,
	lanes: 4,
	hitY: canvas.height - 120,
	scroll: 380,
};

const windows = {
	perfect: 0.08,
	great: 0.14,
	good: 0.21,
};

const laneMap = {
	d: 0,
	f: 1,
	j: 2,
	k: 3,
};

const laneColors = ["#27bcff", "#39e7c1", "#ffd178", "#ff8f74"];

const state = {
	running: false,
	songLength: 75,
	bpm: 132,
	notes: [],
	nextMiss: 0,
	startMs: 0,
	score: 0,
	combo: 0,
	maxCombo: 0,
	hits: 0,
	judged: 0,
	energy: 100,
	heat: 0,
	boostCharges: 2,
	particles: [],
	laneFlash: [0, 0, 0, 0],
	endReason: "",
	lastFrame: 0,
};

function laneCenter(lane) {
	const laneWidth = world.width / world.lanes;
	return laneWidth * lane + laneWidth / 2;
}

function gameTime() {
	if (!state.running) return 0;
	return Math.max(0, (performance.now() - state.startMs) / 1000);
}

function chartNotes() {
	const list = [];
	const beat = 60 / state.bpm;
	const beats = Math.floor(state.songLength / beat) - 1;
	let seed = 5;

	for (let i = 4; i < beats; i += 1) {
		seed = (seed * 11 + 3) % 19;
		const lane = seed % 4;
		const t = i * beat;
		list.push({ lane, t, judged: false, result: "" });

		if (i % 5 === 0) {
			list.push({ lane: (lane + 2) % 4, t: t + beat * 0.5, judged: false, result: "" });
		}
	}

	state.notes = list.sort((a, b) => a.t - b.t);
	state.nextMiss = 0;
}

function scoreByJudge(j) {
	if (j === "perfect") return 320;
	if (j === "great") return 220;
	if (j === "good") return 120;
	return 0;
}

function createBurst(x, y, color, amount = 9) {
	for (let i = 0; i < amount; i += 1) {
		state.particles.push({
			x,
			y,
			vx: (Math.random() - 0.5) * 4,
			vy: -Math.random() * 3.2,
			life: 500 + Math.random() * 260,
			size: 2 + Math.random() * 3,
			color,
		});
	}
}

function toRgba(hex, alpha) {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateHud() {
	const acc = state.judged === 0 ? 100 : (state.hits / state.judged) * 100;
	scoreEl.textContent = String(Math.floor(state.score));
	comboEl.textContent = `${state.combo}x`;
	accuracyEl.textContent = `${acc.toFixed(1)}%`;
	energyFillEl.style.width = `${Math.max(0, Math.min(100, state.energy))}%`;
	heatFillEl.style.width = `${Math.max(0, Math.min(100, state.heat))}%`;
	boostBtn.textContent = `BOOST x${state.boostCharges}`;
	timeLeftEl.textContent = `${Math.ceil(Math.max(0, state.songLength - gameTime()))}s`;
}

function registerMiss(lane, tapped) {
	state.judged += 1;
	state.combo = 0;
	state.energy -= tapped ? 7 : 8.5;
	state.heat += tapped ? 2.6 : 3.8;
	createBurst(laneCenter(lane), world.hitY, "#ff8f74", 7);
	updateHud();
}

function judgeLane(lane) {
	if (!state.running) return;
	const now = gameTime();
	let target = null;

	for (let i = state.nextMiss; i < state.notes.length; i += 1) {
		const note = state.notes[i];
		if (note.judged || note.lane !== lane) continue;
		if (note.t < now - windows.good) continue;
		if (note.t > now + windows.good) break;
		target = note;
		break;
	}

	state.laneFlash[lane] = 100;
	laneButtons[lane].classList.add("active");
	setTimeout(() => laneButtons[lane].classList.remove("active"), 85);

	if (!target) {
		registerMiss(lane, true);
		return;
	}

	const diff = Math.abs(target.t - now);
	let judge = "miss";
	if (diff <= windows.perfect) judge = "perfect";
	else if (diff <= windows.great) judge = "great";
	else if (diff <= windows.good) judge = "good";

	if (judge === "miss") {
		registerMiss(lane, true);
		return;
	}

	target.judged = true;
	target.result = judge;

	state.judged += 1;
	state.hits += judge === "good" ? 0.7 : judge === "great" ? 0.9 : 1;
	state.combo += 1;
	state.maxCombo = Math.max(state.maxCombo, state.combo);
	state.energy = Math.min(100, state.energy + (judge === "perfect" ? 1.8 : 1));
	state.heat = Math.max(0, state.heat - (judge === "perfect" ? 0.7 : 0.3));

	const mult = 1 + Math.floor(state.combo / 10) * 0.18;
	state.score += scoreByJudge(judge) * mult;

	createBurst(laneCenter(lane), world.hitY, laneColors[lane], judge === "perfect" ? 12 : 8);
	updateHud();
}

function useBoost() {
	if (!state.running || state.boostCharges <= 0) return;
	const now = gameTime();
	let removed = 0;

	for (let i = 0; i < state.notes.length; i += 1) {
		const note = state.notes[i];
		if (note.judged) continue;
		const dt = note.t - now;
		if (dt >= -0.06 && dt <= 0.38) {
			note.judged = true;
			note.result = "boost";
			removed += 1;
			state.score += 70;
			createBurst(laneCenter(note.lane), world.hitY - 6, "#8acbff", 6);
			if (removed >= 3) break;
		}
	}

	if (removed > 0) {
		state.boostCharges -= 1;
		state.combo = Math.max(0, state.combo - 1);
		state.heat += 16;
		updateHud();
	}
}

function processMisses(now) {
	while (state.nextMiss < state.notes.length) {
		const note = state.notes[state.nextMiss];
		if (note.judged) {
			state.nextMiss += 1;
			continue;
		}
		if (note.t + windows.good < now) {
			note.judged = true;
			note.result = "miss";
			registerMiss(note.lane, false);
			state.nextMiss += 1;
			continue;
		}
		break;
	}
}

function drawBackground(t) {
	const g = ctx.createLinearGradient(0, 0, 0, world.height);
	g.addColorStop(0, "#061c32");
	g.addColorStop(0.5, "#103a5b");
	g.addColorStop(1, "#195374");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, world.width, world.height);

	const glowY = 170 + Math.sin(t * 2) * 18;
	const glow = ctx.createRadialGradient(world.width / 2, glowY, 20, world.width / 2, glowY, 230);
	glow.addColorStop(0, "rgba(255,255,255,0.17)");
	glow.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, world.width, world.height);
}

function drawLanes() {
	const laneWidth = world.width / world.lanes;
	for (let i = 0; i < world.lanes; i += 1) {
		const flash = state.laneFlash[i] / 100;
		ctx.fillStyle = `rgba(255,255,255,${0.05 + flash * 0.12})`;
		ctx.fillRect(i * laneWidth, 0, laneWidth, world.height);

		ctx.strokeStyle = "rgba(255,255,255,0.14)";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(i * laneWidth, 0);
		ctx.lineTo(i * laneWidth, world.height);
		ctx.stroke();
	}

	ctx.beginPath();
	ctx.moveTo(world.width, 0);
	ctx.lineTo(world.width, world.height);
	ctx.stroke();
}

function drawHitLine() {
	ctx.strokeStyle = "rgba(255,255,255,0.88)";
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(0, world.hitY);
	ctx.lineTo(world.width, world.hitY);
	ctx.stroke();
}

function drawNotes(now) {
	const laneWidth = world.width / world.lanes;
	for (let i = 0; i < state.notes.length; i += 1) {
		const note = state.notes[i];
		if (note.judged && note.result !== "boost") continue;

		const dt = note.t - now;
		const y = world.hitY - dt * world.scroll;
		if (y < -50 || y > world.height + 50) continue;

		const x = laneWidth * note.lane + laneWidth / 2;
		const color = note.result === "boost" ? "#8acbff" : laneColors[note.lane];

		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(Math.PI / 4);
		ctx.fillStyle = color;
		ctx.fillRect(-14, -14, 28, 28);
		ctx.restore();
	}
}

function drawParticles() {
	for (let i = state.particles.length - 1; i >= 0; i -= 1) {
		const p = state.particles[i];
		const alpha = Math.max(0, p.life / 760);
		ctx.fillStyle = toRgba(p.color, alpha);
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
		ctx.fill();
	}
}

function render() {
	const now = gameTime();
	drawBackground(now);
	drawLanes();
	drawNotes(now);
	drawParticles();
	drawHitLine();
}

function endGame(reason) {
	state.running = false;
	state.endReason = reason;
	const acc = state.judged === 0 ? 100 : (state.hits / state.judged) * 100;
	resultText.textContent = `${reason} Score ${Math.floor(state.score)} | Max Combo ${state.maxCombo}x | Precision ${acc.toFixed(1)}%`;
	endOverlay.classList.add("show");
	document.body.classList.remove("modal-open");
}

function update(dt) {
	if (!state.running) return;
	const now = gameTime();

	for (let i = 0; i < state.laneFlash.length; i += 1) {
		state.laneFlash[i] = Math.max(0, state.laneFlash[i] - dt * 0.12);
	}

	for (let i = state.particles.length - 1; i >= 0; i -= 1) {
		const p = state.particles[i];
		p.life -= dt;
		p.x += p.vx;
		p.y += p.vy;
		p.vy += 0.02;
		if (p.life <= 0) state.particles.splice(i, 1);
	}

	processMisses(now);
	state.heat = Math.max(0, state.heat - dt * 0.003);
	updateHud();

	if (state.energy <= 0) {
		endGame("Sin energia");
		return;
	}
	if (state.heat >= 100) {
		endGame("Heat al maximo");
		return;
	}
	if (now >= state.songLength) {
		endGame("Cancion completada");
	}
}

function loop(ts) {
	if (!state.lastFrame) state.lastFrame = ts;
	const dt = Math.min(33, ts - state.lastFrame);
	state.lastFrame = ts;

	update(dt);
	render();
	requestAnimationFrame(loop);
}

function resetState() {
	state.running = true;
	state.score = 0;
	state.combo = 0;
	state.maxCombo = 0;
	state.hits = 0;
	state.judged = 0;
	state.energy = 100;
	state.heat = 0;
	state.boostCharges = 2;
	state.particles = [];
	state.laneFlash = [0, 0, 0, 0];
	state.lastFrame = performance.now();
	state.startMs = performance.now() + 120;
	state.endReason = "";
	chartNotes();
	updateHud();
}

function startGame() {
	endOverlay.classList.remove("show");
	introModal.classList.remove("open");
	document.body.classList.remove("modal-open");
	resetState();
}

function bindControls() {
	laneButtons.forEach((btn) => {
		btn.addEventListener("pointerdown", () => {
			const lane = Number.parseInt(btn.dataset.lane, 10);
			judgeLane(lane);
		});
	});

	window.addEventListener("keydown", (event) => {
		const lane = laneMap[event.key.toLowerCase()];
		if (lane !== undefined) {
			event.preventDefault();
			judgeLane(lane);
		}
		if (event.code === "Space") {
			event.preventDefault();
			useBoost();
		}
	});

	boostBtn.addEventListener("click", useBoost);
	playBtn.addEventListener("click", startGame);
	retryBtn.addEventListener("click", startGame);
}

function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) return;
	navigator.serviceWorker.register("./sw.js").catch(() => {
		// Keep gameplay running even if SW registration fails.
	});
}

function init() {
	document.body.classList.add("modal-open");
	bindControls();
	updateHud();
	registerServiceWorker();
	requestAnimationFrame(loop);
}

init();
