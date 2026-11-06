// pluginLoader.js

const collectors = new Map();
const broadcasters = new Map();

export function registerCollector(name, fn) {
  collectors.set(name, fn);
}

export function getCollector(name) {
  return collectors.get(name);
}

export function listCollectors() {
  return Array.from(collectors.keys());
}

export function registerBroadcaster(name, fn) {
  broadcasters.set(name, fn);
}

export function getBroadcaster(name) {
  return broadcasters.get(name);
}

export function listBroadcasters() {
  return Array.from(broadcasters.keys());
}
