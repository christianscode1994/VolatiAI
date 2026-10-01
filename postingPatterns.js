// postingPatterns.js

function jitter(ms, variance = 0.3) {
  const delta = ms * variance;
  const min = ms - delta;
  const max = ms + delta;
  return Math.floor(min + Math.random() * (max - min));
}

export function humanInterval(baseMinutes) {
  const baseMs = baseMinutes * 60 * 1000;
  return jitter(baseMs, 0.4);
}

export function randomDelay(minMs = 500, maxMs = 3000) {
  return new Promise(resolve => {
    const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
    setTimeout(resolve, delay);
  });
}

export function shouldBurst() {
  return Math.random() < 0.15; // 15% chance of burst mode
}

export function shouldQuiet() {
  return Math.random() < 0.10; // 10% chance of quiet mode
}
