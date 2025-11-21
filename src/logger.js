const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.LOG_LEVEL || "").toLowerCase();
const defaultLevel = process.env.NODE_ENV === "production" ? "info" : "debug";

const currentLevelName = LEVELS[envLevel] ? envLevel : defaultLevel;
const currentLevel = LEVELS[currentLevelName];

function shouldLog(levelName) {
  const level = LEVELS[levelName] ?? LEVELS.info;
  return level >= currentLevel;
}

function createLoggerMethod(levelName, consoleMethod) {
  return (...args) => {
    if (!shouldLog(levelName)) return;
    // 这里保持使用原生 console，方便本地调试和现有基础设施接入
    // 未来如果需要，可以在这里扩展为写文件、集中收集等
    // eslint-disable-next-line no-console
    console[consoleMethod](...args);
  };
}

export const logger = {
  debug: createLoggerMethod("debug", "debug"),
  info: createLoggerMethod("info", "log"),
  warn: createLoggerMethod("warn", "warn"),
  error: createLoggerMethod("error", "error"),
};

export default logger;
