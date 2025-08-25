function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  delay,
  randomInt,
  timestamp
};
