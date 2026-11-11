import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// scripts/open.ts
import { spawn as spawn2 } from "node:child_process";

// src/service-client.ts
import { fileURLToPath } from "node:url";
import { readFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import { join as join2 } from "node:path";

// src/paths.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";
var dataDir = resolve(process.env.AI_TODOS_DATA_DIR || join(homedir(), ".ai-todos"));
var dbPath = join(dataDir, "ai-todos.sqlite");
var runtimePath = join(dataDir, "runtime.json");
var port = Number(process.env.AI_TODOS_PORT || 16943);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("AI_TODOS_PORT must be an integer between 1024 and 65535");
var origin = `http://127.0.0.1:${port}`;

// package.json
var package_default = {
  name: "ai-todos",
  version: "0.1.21",
  private: true,
  type: "module",
  description: "Standalone local Codex productivity plugin",
  engines: {
    node: ">=24.0.0"
  },
  scripts: {
    build: "node scripts/build.ts",
    start: "node src/server.ts",
    open: "node scripts/open.ts",
    stop: "node scripts/stop.ts",
    mcp: "node src/mcp.ts",
    check: "node --test test/*.test.js",
    "package:plugin": "node scripts/package-plugin.ts",
    typecheck: "tsc --noEmit"
  },
  dependencies: {
    "@modelcontextprotocol/ext-apps": "2.0.3",
    "@modelcontextprotocol/sdk": "1.32.1",
    "@radix-ui/react-dialog": "1.1.19",
    "@radix-ui/react-popover": "1.1.19",
    "@radix-ui/react-select": "2.3.3",
    i18next: "26.4.3",
    "lucide-react": "0.525.0",
    react: "19.1.1",
    "react-day-picker": "9.14.0",
    "react-dom": "19.1.1",
    "react-i18next": "17.0.16",
    ws: "8.22.0",
    zod: "4.6.5"
  },
  devDependencies: {
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@types/ws": "8.18.2",
    esbuild: "0.28.2",
    typescript: "7.0.2"
  }
};

// node_modules/i18next/dist/esm/i18next.js
var isString = (obj) => typeof obj === "string";
var defer = () => {
  let res;
  let rej;
  const promise = new Promise((resolve2, reject) => {
    res = resolve2;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  return promise;
};
var makeString = (object) => {
  if (object == null) return "";
  return String(object);
};
var copy = (a, s, t2) => {
  a.forEach((m) => {
    if (s[m]) t2[m] = s[m];
  });
};
var lastOfPathSeparatorRegExp = /###/g;
var cleanKey = (key) => key && key.includes("###") ? key.replace(lastOfPathSeparatorRegExp, ".") : key;
var canNotTraverseDeeper = (object) => !object || isString(object);
var getLastOfPath = (object, path, Empty) => {
  const stack = !isString(path) ? path : path.split(".");
  let stackIndex = 0;
  while (stackIndex < stack.length - 1) {
    if (canNotTraverseDeeper(object)) return {};
    const key = cleanKey(stack[stackIndex]);
    if (!object[key] && Empty) object[key] = new Empty();
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      object = object[key];
    } else {
      object = {};
    }
    ++stackIndex;
  }
  if (canNotTraverseDeeper(object)) return {};
  return {
    obj: object,
    k: cleanKey(stack[stackIndex])
  };
};
var setPath = (object, path, newValue) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  if (obj !== void 0 || path.length === 1) {
    obj[k] = newValue;
    return;
  }
  let e = path[path.length - 1];
  let p = path.slice(0, path.length - 1);
  let last = getLastOfPath(object, p, Object);
  while (last.obj === void 0 && p.length) {
    e = `${p[p.length - 1]}.${e}`;
    p = p.slice(0, p.length - 1);
    last = getLastOfPath(object, p, Object);
    if (last?.obj && typeof last.obj[`${last.k}.${e}`] !== "undefined") {
      last.obj = void 0;
    }
  }
  last.obj[`${last.k}.${e}`] = newValue;
};
var pushPath = (object, path, newValue, concat) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  obj[k] = obj[k] || [];
  obj[k].push(newValue);
};
var getPath = (object, path) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path);
  if (!obj) return void 0;
  if (!Object.prototype.hasOwnProperty.call(obj, k)) return void 0;
  return obj[k];
};
var getPathWithDefaults = (data, defaultData, key) => {
  const value = getPath(data, key);
  if (value !== void 0) {
    return value;
  }
  return getPath(defaultData, key);
};
var deepExtend = (target, source, overwrite) => {
  for (const prop in source) {
    if (prop !== "__proto__" && prop !== "constructor") {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        if (isString(target[prop]) || target[prop] instanceof String || isString(source[prop]) || source[prop] instanceof String) {
          if (overwrite) target[prop] = source[prop];
        } else {
          deepExtend(target[prop], source[prop], overwrite);
        }
      } else {
        target[prop] = source[prop];
      }
    }
  }
  return target;
};
var regexEscape = (str) => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
var _entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
};
var escape = (data) => {
  if (isString(data)) {
    return data.replace(/[&<>"'\/]/g, (s) => _entityMap[s]);
  }
  return data;
};
var RegExpCache = class {
  constructor(capacity) {
    this.capacity = capacity;
    this.regExpMap = /* @__PURE__ */ new Map();
    this.regExpQueue = [];
  }
  getRegExp(pattern) {
    const regExpFromCache = this.regExpMap.get(pattern);
    if (regExpFromCache !== void 0) {
      return regExpFromCache;
    }
    const regExpNew = new RegExp(pattern);
    if (this.regExpQueue.length === this.capacity) {
      this.regExpMap.delete(this.regExpQueue.shift());
    }
    this.regExpMap.set(pattern, regExpNew);
    this.regExpQueue.push(pattern);
    return regExpNew;
  }
};
var chars = [" ", ",", "?", "!", ";"];
var looksLikeObjectPathRegExpCache = new RegExpCache(20);
var looksLikeObjectPath = (key, nsSeparator, keySeparator) => {
  nsSeparator = nsSeparator || "";
  keySeparator = keySeparator || "";
  const possibleChars = chars.filter((c) => !nsSeparator.includes(c) && !keySeparator.includes(c));
  if (possibleChars.length === 0) return true;
  const r = looksLikeObjectPathRegExpCache.getRegExp(`(${possibleChars.map((c) => c === "?" ? "\\?" : c).join("|")})`);
  let matched = !r.test(key);
  if (!matched) {
    const ki = key.indexOf(keySeparator);
    if (ki > 0 && !r.test(key.substring(0, ki))) {
      matched = true;
    }
  }
  return matched;
};
var deepFind = (obj, path, keySeparator = ".") => {
  if (!obj) return void 0;
  if (obj[path]) {
    if (!Object.prototype.hasOwnProperty.call(obj, path)) return void 0;
    return obj[path];
  }
  const tokens = path.split(keySeparator);
  let current = obj;
  for (let i = 0; i < tokens.length; ) {
    if (!current || typeof current !== "object") {
      return void 0;
    }
    let next;
    let nextPath = "";
    for (let j = i; j < tokens.length; ++j) {
      if (j !== i) {
        nextPath += keySeparator;
      }
      nextPath += tokens[j];
      next = current[nextPath];
      if (next !== void 0) {
        if (["string", "number", "boolean"].includes(typeof next) && j < tokens.length - 1) {
          continue;
        }
        i += j - i + 1;
        break;
      }
    }
    current = next;
  }
  return current;
};
var getCleanedCode = (code) => code?.replace(/_/g, "-");
var consoleLogger = {
  type: "logger",
  log(args) {
    this.output("log", args);
  },
  warn(args) {
    this.output("warn", args);
  },
  error(args) {
    this.output("error", args);
  },
  output(type, args) {
    console?.[type]?.apply?.(console, args);
  }
};
var Logger = class _Logger {
  constructor(concreteLogger, options = {}) {
    this.init(concreteLogger, options);
  }
  init(concreteLogger, options = {}) {
    this.prefix = options.prefix || "i18next:";
    this.logger = concreteLogger || consoleLogger;
    this.options = options;
    this.debug = options.debug;
  }
  log(...args) {
    return this.forward(args, "log", "", true);
  }
  warn(...args) {
    return this.forward(args, "warn", "", true);
  }
  error(...args) {
    return this.forward(args, "error", "");
  }
  deprecate(...args) {
    return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
  }
  forward(args, lvl, prefix, debugOnly) {
    if (debugOnly && !this.debug) return null;
    args = args.map((a) => isString(a) ? a.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : a);
    if (isString(args[0])) args[0] = `${prefix}${this.prefix} ${args[0]}`;
    return this.logger[lvl](args);
  }
  create(moduleName) {
    return new _Logger(this.logger, {
      ...{
        prefix: `${this.prefix}:${moduleName}:`
      },
      ...this.options
    });
  }
  clone(options) {
    options = options || this.options;
    options.prefix = options.prefix || this.prefix;
    return new _Logger(this.logger, options);
  }
};
var baseLogger = new Logger();
var EventEmitter = class {
  constructor() {
    this.observers = {};
  }
  on(events, listener) {
    events.split(" ").forEach((event) => {
      if (!this.observers[event]) this.observers[event] = /* @__PURE__ */ new Map();
      const numListeners = this.observers[event].get(listener) || 0;
      this.observers[event].set(listener, numListeners + 1);
    });
    return this;
  }
  off(event, listener) {
    if (!this.observers[event]) return;
    if (!listener) {
      delete this.observers[event];
      return;
    }
    this.observers[event].delete(listener);
  }
  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
    return this;
  }
  emit(event, ...args) {
    if (this.observers[event]) {
      const cloned = Array.from(this.observers[event].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0; i < numTimesAdded; i++) {
          observer(...args);
        }
      });
    }
    if (this.observers["*"]) {
      const cloned = Array.from(this.observers["*"].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0; i < numTimesAdded; i++) {
          observer(event, ...args);
        }
      });
    }
  }
};
var nonEmptyBundles = /* @__PURE__ */ new WeakSet();
var ResourceStore = class extends EventEmitter {
  constructor(data, options = {
    ns: ["translation"],
    defaultNS: "translation"
  }) {
    super();
    this.data = data || {};
    this.options = options;
    if (this.options.keySeparator === void 0) {
      this.options.keySeparator = ".";
    }
    if (this.options.ignoreJSONStructure === void 0) {
      this.options.ignoreJSONStructure = true;
    }
  }
  addNamespaces(ns) {
    if (!this.options.ns.includes(ns)) {
      this.options.ns.push(ns);
    }
  }
  removeNamespaces(ns) {
    const index = this.options.ns.indexOf(ns);
    if (index > -1) {
      this.options.ns.splice(index, 1);
    }
  }
  getResource(lng, ns, key, options = {}) {
    const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
    const ignoreJSONStructure = options.ignoreJSONStructure !== void 0 ? options.ignoreJSONStructure : this.options.ignoreJSONStructure;
    let path;
    if (lng.includes(".")) {
      path = lng.split(".");
    } else {
      path = [lng, ns];
      if (key) {
        if (Array.isArray(key)) {
          path.push(...key);
        } else if (isString(key) && keySeparator) {
          path.push(...key.split(keySeparator));
        } else {
          path.push(key);
        }
      }
    }
    const result = getPath(this.data, path);
    if (!result && !ns && !key && lng.includes(".")) {
      lng = path[0];
      ns = path[1];
      key = path.slice(2).join(".");
    }
    if (result || !ignoreJSONStructure || !isString(key)) return result;
    return deepFind(this.data?.[lng]?.[ns], key, keySeparator);
  }
  addResource(lng, ns, key, value, options = {
    silent: false
  }) {
    const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
    let path = [lng, ns];
    if (key) path = path.concat(keySeparator ? key.split(keySeparator) : key);
    if (lng.includes(".")) {
      path = lng.split(".");
      value = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    setPath(this.data, path, value);
    if (!options.silent) this.emit("added", lng, ns, key, value);
  }
  addResources(lng, ns, resources2, options = {
    silent: false
  }) {
    for (const m in resources2) {
      if (isString(resources2[m]) || Array.isArray(resources2[m])) this.addResource(lng, ns, m, resources2[m], {
        silent: true
      });
    }
    if (!options.silent) this.emit("added", lng, ns, resources2);
  }
  addResourceBundle(lng, ns, resources2, deep, overwrite, options = {
    silent: false,
    skipCopy: false
  }) {
    let path = [lng, ns];
    if (lng.includes(".")) {
      path = lng.split(".");
      deep = resources2;
      resources2 = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    let pack = getPath(this.data, path) || {};
    if (!options.skipCopy) resources2 = JSON.parse(JSON.stringify(resources2));
    if (deep) {
      deepExtend(pack, resources2, overwrite);
    } else {
      pack = {
        ...pack,
        ...resources2
      };
    }
    setPath(this.data, path, pack);
    if (!options.silent) this.emit("added", lng, ns, resources2);
  }
  removeResourceBundle(lng, ns) {
    if (this.hasResourceBundle(lng, ns)) {
      delete this.data[lng][ns];
    }
    this.removeNamespaces(ns);
    this.emit("removed", lng, ns);
  }
  hasResourceBundle(lng, ns) {
    return this.getResource(lng, ns) !== void 0;
  }
  getResourceBundle(lng, ns) {
    if (!ns) ns = this.options.defaultNS;
    return this.getResource(lng, ns);
  }
  getDataByLanguage(lng) {
    return this.data[lng];
  }
  hasLanguageSomeTranslations(lng) {
    const data = this.getDataByLanguage(lng);
    const n = data && Object.keys(data) || [];
    return !!n.find((v) => {
      const bundle = data[v];
      if (nonEmptyBundles.has(bundle)) return true;
      if (!bundle || Object.keys(bundle).length === 0) return false;
      if (typeof bundle === "object") nonEmptyBundles.add(bundle);
      return true;
    });
  }
  toJSON() {
    return this.data;
  }
};
var postProcessor = {
  processors: {},
  addPostProcessor(module) {
    this.processors[module.name] = module;
  },
  handle(processors, value, key, options, translator) {
    processors.forEach((processor) => {
      value = this.processors[processor]?.process(value, key, options, translator) ?? value;
    });
    return value;
  }
};
var PATH_KEY = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
function createProxy() {
  const state = [];
  const handler = /* @__PURE__ */ Object.create(null);
  let proxy;
  handler.get = (target, key) => {
    proxy?.revoke?.();
    if (key === PATH_KEY) return state;
    state.push(key);
    proxy = Proxy.revocable(target, handler);
    return proxy.proxy;
  };
  return Proxy.revocable(/* @__PURE__ */ Object.create(null), handler).proxy;
}
function keysFromSelector(selector, opts) {
  const {
    [PATH_KEY]: path
  } = selector(createProxy());
  const keySeparator = opts?.keySeparator ?? ".";
  const nsSeparator = opts?.nsSeparator ?? ":";
  const strict = opts?.enableSelector === "strict";
  if (path.length > 1 && nsSeparator) {
    const ns = opts?.ns;
    const nsList = strict ? Array.isArray(ns) ? ns : ns ? [ns] : null : Array.isArray(ns) ? ns : null;
    if (nsList) {
      const candidates = strict ? nsList : nsList.length > 1 ? nsList.slice(1) : [];
      if (candidates.includes(path[0])) {
        return `${path[0]}${nsSeparator}${path.slice(1).join(keySeparator)}`;
      }
    }
  }
  return path.join(keySeparator);
}
var shouldHandleAsObject = (res) => !isString(res) && typeof res !== "boolean" && typeof res !== "number";
var Translator = class _Translator extends EventEmitter {
  constructor(services, options = {}) {
    super();
    copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, this);
    this.options = options;
    if (this.options.keySeparator === void 0) {
      this.options.keySeparator = ".";
    }
    this.logger = baseLogger.create("translator");
    this.checkedLoadedFor = {};
  }
  changeLanguage(lng) {
    if (lng) this.language = lng;
  }
  exists(key, o = {
    interpolation: {}
  }) {
    const opt = {
      ...o
    };
    if (key == null) return false;
    const resolved = this.resolve(key, opt);
    if (resolved?.res === void 0) return false;
    const isObject = shouldHandleAsObject(resolved.res);
    if (opt.returnObjects === false && isObject) {
      return false;
    }
    return true;
  }
  extractFromKey(key, opt) {
    let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === void 0) nsSeparator = ":";
    const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
    let namespaces = opt.ns || this.options.defaultNS || [];
    const wouldCheckForNsInKey = nsSeparator && key.includes(nsSeparator);
    const seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !opt.keySeparator && !this.options.userDefinedNsSeparator && !opt.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
    if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
      const m = key.match(this.interpolator.nestingRegexp);
      if (m && m.length > 0) {
        return {
          key,
          namespaces: isString(namespaces) ? [namespaces] : namespaces
        };
      }
      const parts = key.split(nsSeparator);
      if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.includes(parts[0])) namespaces = parts.shift();
      key = parts.join(keySeparator);
    }
    return {
      key,
      namespaces: isString(namespaces) ? [namespaces] : namespaces
    };
  }
  translate(keys, o, lastKey) {
    let opt = typeof o === "object" ? {
      ...o
    } : o;
    if (typeof opt !== "object" && this.options.overloadTranslationOptionHandler) {
      opt = this.options.overloadTranslationOptionHandler(arguments);
    }
    if (typeof opt === "object") opt = {
      ...opt
    };
    if (!opt) opt = {};
    if (keys == null) return "";
    if (typeof keys === "function") keys = keysFromSelector(keys, {
      ...this.options,
      ...opt
    });
    if (!Array.isArray(keys)) keys = [String(keys)];
    keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
      ...this.options,
      ...opt
    }) : String(k));
    const returnDetails = opt.returnDetails !== void 0 ? opt.returnDetails : this.options.returnDetails;
    const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
    const {
      key,
      namespaces
    } = this.extractFromKey(keys[keys.length - 1], opt);
    const namespace = namespaces[namespaces.length - 1];
    let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === void 0) nsSeparator = ":";
    const lng = opt.lng || this.language;
    const appendNamespaceToCIMode = opt.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (lng?.toLowerCase() === "cimode") {
      if (appendNamespaceToCIMode) {
        if (returnDetails) {
          return {
            res: `${namespace}${nsSeparator}${key}`,
            usedKey: key,
            exactUsedKey: key,
            usedLng: lng,
            usedNS: namespace,
            usedParams: this.getUsedParamsDetails(opt)
          };
        }
        return `${namespace}${nsSeparator}${key}`;
      }
      if (returnDetails) {
        return {
          res: key,
          usedKey: key,
          exactUsedKey: key,
          usedLng: lng,
          usedNS: namespace,
          usedParams: this.getUsedParamsDetails(opt)
        };
      }
      return key;
    }
    const resolved = this.resolve(keys, opt);
    let res = resolved?.res;
    const resUsedKey = resolved?.usedKey || key;
    const resExactUsedKey = resolved?.exactUsedKey || key;
    const noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
    const joinArrays = opt.joinArrays !== void 0 ? opt.joinArrays : this.options.joinArrays;
    const handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
    const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
    const hasDefaultValue = _Translator.hasDefaultValue(opt);
    const defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, opt) : "";
    const defaultValueSuffixOrdinalFallback = opt.ordinal && needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, {
      ordinal: false
    }) : "";
    const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
    const defaultValue = needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] || opt[`defaultValue${defaultValueSuffix}`] || opt[`defaultValue${defaultValueSuffixOrdinalFallback}`] || opt.defaultValue;
    let resForObjHndl = res;
    if (handleAsObjectInI18nFormat && !res && hasDefaultValue) {
      resForObjHndl = defaultValue;
    }
    const handleAsObject = shouldHandleAsObject(resForObjHndl);
    const resType = Object.prototype.toString.apply(resForObjHndl);
    if (handleAsObjectInI18nFormat && resForObjHndl && handleAsObject && !noObject.includes(resType) && !(isString(joinArrays) && Array.isArray(resForObjHndl))) {
      if (!opt.returnObjects && !this.options.returnObjects) {
        if (!this.options.returnedObjectHandler) {
          this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        }
        const r = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, resForObjHndl, {
          ...opt,
          ns: namespaces
        }) : `key '${key} (${this.language})' returned an object instead of string.`;
        if (returnDetails) {
          resolved.res = r;
          resolved.usedParams = this.getUsedParamsDetails(opt);
          return resolved;
        }
        return r;
      }
      if (keySeparator) {
        const resTypeIsArray = Array.isArray(resForObjHndl);
        const copy2 = resTypeIsArray ? [] : {};
        const newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
        for (const m in resForObjHndl) {
          if (Object.prototype.hasOwnProperty.call(resForObjHndl, m)) {
            const deepKey = `${newKeyToUse}${keySeparator}${m}`;
            if (hasDefaultValue && !res) {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                defaultValue: shouldHandleAsObject(defaultValue) ? defaultValue[m] : void 0,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            } else {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            }
            if (copy2[m] === deepKey) copy2[m] = resForObjHndl[m];
          }
        }
        res = copy2;
      }
    } else if (handleAsObjectInI18nFormat && isString(joinArrays) && Array.isArray(res)) {
      res = res.join(joinArrays);
      if (res) res = this.extendTranslation(res, keys, opt, lastKey);
    } else {
      let usedDefault = false;
      let usedKey = false;
      if (!this.isValidLookup(res) && hasDefaultValue) {
        usedDefault = true;
        res = defaultValue;
      }
      if (!this.isValidLookup(res)) {
        usedKey = true;
        res = key;
      }
      const missingKeyNoValueFallbackToKey = opt.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
      const resForMissing = missingKeyNoValueFallbackToKey && usedKey ? void 0 : res;
      const updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
      if (usedKey || usedDefault || updateMissing) {
        this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, needsPluralHandling && !updateMissing ? `${key}${this.pluralResolver.getSuffix(lng, opt.count, opt)}` : key, updateMissing ? defaultValue : res);
        if (keySeparator) {
          const fk = this.resolve(key, {
            ...opt,
            keySeparator: false
          });
          if (fk && fk.res) this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let lngs = [];
        const fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, opt.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
          for (let i = 0; i < fallbackLngs.length; i++) {
            lngs.push(fallbackLngs[i]);
          }
        } else if (this.options.saveMissingTo === "all") {
          lngs = this.languageUtils.toResolveHierarchy(opt.lng || this.language);
        } else {
          lngs.push(opt.lng || this.language);
        }
        const send = (l, k, specificDefaultValue) => {
          const defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
          if (this.options.missingKeyHandler) {
            this.options.missingKeyHandler(l, namespace, k, defaultForMissing, updateMissing, opt);
          } else if (this.backendConnector?.saveMissing) {
            this.backendConnector.saveMissing(l, namespace, k, defaultForMissing, updateMissing, opt);
          }
          this.emit("missingKey", l, namespace, k, res);
        };
        if (this.options.saveMissing) {
          if (this.options.saveMissingPlurals && needsPluralHandling) {
            lngs.forEach((language) => {
              const suffixes = this.pluralResolver.getSuffixes(language, opt);
              if (needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] && !suffixes.includes(`${this.options.pluralSeparator}zero`)) {
                suffixes.push(`${this.options.pluralSeparator}zero`);
              }
              suffixes.forEach((suffix) => {
                send([language], key + suffix, opt[`defaultValue${suffix}`] || defaultValue);
              });
            });
          } else {
            send(lngs, key, defaultValue);
          }
        }
      }
      res = this.extendTranslation(res, keys, opt, resolved, lastKey);
      if (usedKey && res === key && this.options.appendNamespaceToMissingKey) {
        res = `${namespace}${nsSeparator}${key}`;
      }
      if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
        res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${namespace}${nsSeparator}${key}` : key, usedDefault ? res : void 0, opt);
      }
    }
    if (returnDetails) {
      resolved.res = res;
      resolved.usedParams = this.getUsedParamsDetails(opt);
      return resolved;
    }
    return res;
  }
  extendTranslation(res, key, opt, resolved, lastKey) {
    if (this.i18nFormat?.parse) {
      res = this.i18nFormat.parse(res, {
        ...this.options.interpolation.defaultVariables,
        ...opt
      }, opt.lng || this.language || resolved.usedLng, resolved.usedNS, resolved.usedKey, {
        resolved
      });
    } else if (!opt.skipInterpolation) {
      if (opt.interpolation) this.interpolator.init({
        ...opt,
        ...{
          interpolation: {
            ...this.options.interpolation,
            ...opt.interpolation
          }
        }
      });
      const skipOnVariables = isString(res) && (opt?.interpolation?.skipOnVariables !== void 0 ? opt.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let nestBef;
      if (skipOnVariables) {
        const nb = res.match(this.interpolator.nestingRegexp);
        nestBef = nb && nb.length;
      }
      let data = opt.replace && !isString(opt.replace) ? opt.replace : opt;
      if (this.options.interpolation.defaultVariables) data = {
        ...this.options.interpolation.defaultVariables,
        ...data
      };
      res = this.interpolator.interpolate(res, data, opt.lng || this.language || resolved.usedLng, opt);
      if (skipOnVariables) {
        const na = res.match(this.interpolator.nestingRegexp);
        const nestAft = na && na.length;
        if (nestBef < nestAft) opt.nest = false;
      }
      if (!opt.lng && resolved && resolved.res) opt.lng = this.language || resolved.usedLng;
      if (opt.nest !== false) res = this.interpolator.nest(res, (...args) => {
        if (lastKey?.[0] === args[0] && !opt.context) {
          this.logger.warn(`It seems you are nesting recursively key: ${args[0]} in key: ${key[0]}`);
          return null;
        }
        return this.translate(...args, key);
      }, opt);
      if (opt.interpolation) this.interpolator.reset();
    }
    const postProcess = opt.postProcess || this.options.postProcess;
    const postProcessorNames = isString(postProcess) ? [postProcess] : postProcess;
    if (res != null && postProcessorNames?.length && opt.applyPostProcessor !== false) {
      res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? {
        i18nResolved: {
          ...resolved,
          usedParams: this.getUsedParamsDetails(opt)
        },
        ...opt
      } : opt, this);
    }
    return res;
  }
  resolve(keys, opt = {}) {
    let found;
    let usedKey;
    let exactUsedKey;
    let usedLng;
    let usedNS;
    if (isString(keys)) keys = [keys];
    if (Array.isArray(keys)) keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
      ...this.options,
      ...opt
    }) : k);
    keys.forEach((k) => {
      if (this.isValidLookup(found)) return;
      const extracted = this.extractFromKey(k, opt);
      const key = extracted.key;
      usedKey = key;
      let namespaces = extracted.namespaces;
      if (this.options.fallbackNS) namespaces = namespaces.concat(this.options.fallbackNS);
      const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
      const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
      const needsContextHandling = opt.context !== void 0 && (isString(opt.context) || typeof opt.context === "number") && opt.context !== "";
      const codes = opt.lngs ? opt.lngs : this.languageUtils.toResolveHierarchy(opt.lng || this.language, opt.fallbackLng);
      namespaces.forEach((ns) => {
        if (this.isValidLookup(found)) return;
        usedNS = ns;
        if (!this.checkedLoadedFor[`${codes[0]}-${ns}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(usedNS)) {
          this.checkedLoadedFor[`${codes[0]}-${ns}`] = true;
          this.logger.warn(`key "${usedKey}" for languages "${codes.join(", ")}" won't get resolved as namespace "${usedNS}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
        }
        codes.forEach((code) => {
          if (this.isValidLookup(found)) return;
          usedLng = code;
          const finalKeys = [key];
          if (this.i18nFormat?.addLookupKeys) {
            this.i18nFormat.addLookupKeys(finalKeys, key, code, ns, opt);
          } else {
            let pluralSuffix;
            if (needsPluralHandling) pluralSuffix = this.pluralResolver.getSuffix(code, opt.count, opt);
            const zeroSuffix = `${this.options.pluralSeparator}zero`;
            const ordinalPrefix = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (needsPluralHandling) {
              if (opt.ordinal && pluralSuffix.startsWith(ordinalPrefix)) {
                finalKeys.push(key + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
              }
              finalKeys.push(key + pluralSuffix);
              if (needsZeroSuffixLookup) {
                finalKeys.push(key + zeroSuffix);
              }
            }
            if (needsContextHandling) {
              const contextKey = `${key}${this.options.contextSeparator || "_"}${opt.context}`;
              finalKeys.push(contextKey);
              if (needsPluralHandling) {
                if (opt.ordinal && pluralSuffix.startsWith(ordinalPrefix)) {
                  finalKeys.push(contextKey + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                }
                finalKeys.push(contextKey + pluralSuffix);
                if (needsZeroSuffixLookup) {
                  finalKeys.push(contextKey + zeroSuffix);
                }
              }
            }
          }
          let possibleKey;
          while (possibleKey = finalKeys.pop()) {
            if (!this.isValidLookup(found)) {
              exactUsedKey = possibleKey;
              found = this.getResource(code, ns, possibleKey, opt);
            }
          }
        });
      });
    });
    return {
      res: found,
      usedKey,
      exactUsedKey,
      usedLng,
      usedNS
    };
  }
  isValidLookup(res) {
    return res !== void 0 && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
  }
  getResource(code, ns, key, options = {}) {
    if (this.i18nFormat?.getResource) return this.i18nFormat.getResource(code, ns, key, options);
    return this.resourceStore.getResource(code, ns, key, options);
  }
  getUsedParamsDetails(options = {}) {
    const optionsKeys = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"];
    const useOptionsReplaceForData = options.replace && !isString(options.replace);
    let data = useOptionsReplaceForData ? options.replace : options;
    if (useOptionsReplaceForData && typeof options.count !== "undefined") {
      data = {
        ...data,
        count: options.count
      };
    }
    if (this.options.interpolation.defaultVariables) {
      data = {
        ...this.options.interpolation.defaultVariables,
        ...data
      };
    }
    if (!useOptionsReplaceForData) {
      data = {
        ...data
      };
      for (const key of optionsKeys) {
        delete data[key];
      }
    }
    return data;
  }
  static hasDefaultValue(options) {
    const prefix = "defaultValue";
    for (const option in options) {
      if (Object.prototype.hasOwnProperty.call(options, option) && option.startsWith(prefix) && void 0 !== options[option]) {
        return true;
      }
    }
    return false;
  }
};
var LanguageUtil = class {
  constructor(options) {
    this.options = options;
    this.supportedLngs = this.options.supportedLngs || false;
    this.logger = baseLogger.create("languageUtils");
    this.resolveHierarchyCache = {};
  }
  clearCache() {
    this.resolveHierarchyCache = {};
  }
  getScriptPartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || !code.includes("-")) return null;
    const p = code.split("-");
    if (p.length === 2) return null;
    p.pop();
    if (p[p.length - 1].toLowerCase() === "x") return null;
    return this.formatLanguageCode(p.join("-"));
  }
  getLanguagePartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || !code.includes("-")) return code;
    const p = code.split("-");
    return this.formatLanguageCode(p[0]);
  }
  formatLanguageCode(code) {
    if (isString(code) && code.includes("-")) {
      let formattedCode;
      try {
        formattedCode = Intl.getCanonicalLocales(code)[0];
      } catch (e) {
      }
      if (formattedCode && this.options.lowerCaseLng) {
        formattedCode = formattedCode.toLowerCase();
      }
      if (formattedCode) return formattedCode;
      if (this.options.lowerCaseLng) {
        return code.toLowerCase();
      }
      return code;
    }
    return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
  }
  isSupportedCode(code) {
    if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
      code = this.getLanguagePartFromCode(code);
    }
    return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(code);
  }
  getBestMatchFromCodes(codes) {
    if (!codes) return null;
    let found;
    codes.forEach((code) => {
      if (found) return;
      const cleanedLng = this.formatLanguageCode(code);
      if (!this.options.supportedLngs || this.isSupportedCode(cleanedLng)) found = cleanedLng;
    });
    if (!found && this.options.supportedLngs) {
      codes.forEach((code) => {
        if (found) return;
        const lngScOnly = this.getScriptPartFromCode(code);
        if (this.isSupportedCode(lngScOnly)) return found = lngScOnly;
        const lngOnly = this.getLanguagePartFromCode(code);
        if (this.isSupportedCode(lngOnly)) return found = lngOnly;
        found = this.options.supportedLngs.find((supportedLng) => {
          if (supportedLng === lngOnly) return true;
          if (!supportedLng.includes("-") && !lngOnly.includes("-")) return false;
          if (supportedLng.includes("-") && !lngOnly.includes("-") && supportedLng.slice(0, supportedLng.indexOf("-")) === lngOnly) return true;
          if (supportedLng.startsWith(lngOnly) && lngOnly.length > 1) return true;
          return false;
        });
      });
    }
    if (!found) found = this.getFallbackCodes(this.options.fallbackLng)[0];
    return found;
  }
  getFallbackCodes(fallbacks, code) {
    if (!fallbacks) return [];
    if (typeof fallbacks === "function") fallbacks = fallbacks(code);
    if (isString(fallbacks)) fallbacks = [fallbacks];
    if (Array.isArray(fallbacks)) return fallbacks;
    if (!code) return fallbacks.default || [];
    let found = fallbacks[code];
    if (!found) found = fallbacks[this.getScriptPartFromCode(code)];
    if (!found) found = fallbacks[this.formatLanguageCode(code)];
    if (!found) found = fallbacks[this.getLanguagePartFromCode(code)];
    if (!found) found = fallbacks.default;
    return found || [];
  }
  toResolveHierarchy(code, fallbackCode) {
    const fallbackLng = this.options.fallbackLng;
    const fallbackLngKey = Array.isArray(fallbackLng) ? fallbackLng.join("|") : fallbackLng;
    if (fallbackLngKey !== this._cachedFallbackLng) {
      this.resolveHierarchyCache = {};
      this._cachedFallbackLng = fallbackLngKey;
    }
    const hasCacheableFallback = fallbackCode === void 0 || fallbackCode === false || isString(fallbackCode);
    const usesUncacheableOptionsFallback = fallbackCode === void 0 && typeof this.options.fallbackLng === "function";
    const cacheable = isString(code) && hasCacheableFallback && !usesUncacheableOptionsFallback;
    let cacheKey = null;
    if (cacheable) {
      let fallbackCacheKey;
      if (fallbackCode === void 0) fallbackCacheKey = "undefined";
      else if (fallbackCode === false) fallbackCacheKey = "boolean:false";
      else fallbackCacheKey = `string:${fallbackCode}`;
      cacheKey = `${code.length}:${code}|${fallbackCacheKey}`;
    }
    if (cacheKey !== null) {
      const cached = this.resolveHierarchyCache[cacheKey];
      if (cached !== void 0) return cached.slice();
    }
    const fallbackCodes = this.getFallbackCodes((fallbackCode === false ? [] : fallbackCode) || this.options.fallbackLng || [], code);
    const codes = [];
    const addCode = (c) => {
      if (!c) return;
      if (this.isSupportedCode(c)) {
        codes.push(c);
      } else {
        this.logger.warn(`rejecting language code not found in supportedLngs: ${c}`);
      }
    };
    if (isString(code) && (code.includes("-") || code.includes("_"))) {
      if (this.options.load !== "languageOnly") addCode(this.formatLanguageCode(code));
      if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly") addCode(this.getScriptPartFromCode(code));
      if (this.options.load !== "currentOnly") addCode(this.getLanguagePartFromCode(code));
    } else if (isString(code)) {
      addCode(this.formatLanguageCode(code));
    }
    fallbackCodes.forEach((fc) => {
      if (!codes.includes(fc)) addCode(this.formatLanguageCode(fc));
    });
    if (cacheKey !== null) {
      this.resolveHierarchyCache[cacheKey] = codes;
      return codes.slice();
    }
    return codes;
  }
};
var suffixesOrder = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
};
var dummyRule = {
  select: (count) => count === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
var PluralResolver = class {
  constructor(languageUtils, options = {}) {
    this.languageUtils = languageUtils;
    this.options = options;
    this.logger = baseLogger.create("pluralResolver");
    this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(code, options = {}) {
    const cleanedCode = getCleanedCode(code === "dev" ? "en" : code);
    const type = options.ordinal ? "ordinal" : "cardinal";
    const cacheKey = JSON.stringify({
      cleanedCode,
      type
    });
    if (cacheKey in this.pluralRulesCache) {
      return this.pluralRulesCache[cacheKey];
    }
    let rule;
    try {
      rule = new Intl.PluralRules(cleanedCode, {
        type
      });
    } catch (err) {
      if (typeof Intl === "undefined") {
        this.logger.error("No Intl support, please use an Intl polyfill!");
        return dummyRule;
      }
      if (!code.match(/-|_/)) return dummyRule;
      const lngPart = this.languageUtils.getLanguagePartFromCode(code);
      rule = this.getRule(lngPart, options);
    }
    this.pluralRulesCache[cacheKey] = rule;
    return rule;
  }
  needsPlural(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule) rule = this.getRule("dev", options);
    return rule?.resolvedOptions().pluralCategories.length > 1;
  }
  getPluralFormsOfKey(code, key, options = {}) {
    return this.getSuffixes(code, options).map((suffix) => `${key}${suffix}`);
  }
  getSuffixes(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule) rule = this.getRule("dev", options);
    if (!rule) return [];
    return rule.resolvedOptions().pluralCategories.sort((pluralCategory1, pluralCategory2) => suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2]).map((pluralCategory) => `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${pluralCategory}`);
  }
  getSuffix(code, count, options = {}) {
    const rule = this.getRule(code, options);
    if (rule) {
      return `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${rule.select(count)}`;
    }
    this.logger.warn(`no plural rule found for: ${code}`);
    return this.getSuffix("dev", count, options);
  }
};
var deepFindWithDefaults = (data, defaultData, key, keySeparator = ".", ignoreJSONStructure = true) => {
  let path = getPathWithDefaults(data, defaultData, key);
  if (!path && ignoreJSONStructure && isString(key)) {
    path = deepFind(data, key, keySeparator);
    if (path === void 0) path = deepFind(defaultData, key, keySeparator);
  }
  return path;
};
var regexSafe = (val) => val.replace(/\$/g, "$$$$");
var Interpolator = class {
  constructor(options = {}) {
    this.logger = baseLogger.create("interpolator");
    this.options = options;
    this.format = options?.interpolation?.format || ((value) => value);
    this.init(options);
  }
  init(options = {}) {
    if (!options.interpolation) options.interpolation = {
      escapeValue: true
    };
    const {
      escape: escape$1,
      escapeValue,
      useRawValueToEscape,
      prefix,
      prefixEscaped,
      suffix,
      suffixEscaped,
      formatSeparator,
      unescapeSuffix,
      unescapePrefix,
      nestingPrefix,
      nestingPrefixEscaped,
      nestingSuffix,
      nestingSuffixEscaped,
      nestingOptionsSeparator,
      maxReplaces,
      alwaysFormat
    } = options.interpolation;
    this.escape = escape$1 !== void 0 ? escape$1 : escape;
    this.escapeValue = escapeValue !== void 0 ? escapeValue : true;
    this.useRawValueToEscape = useRawValueToEscape !== void 0 ? useRawValueToEscape : false;
    this.prefix = prefix ? regexEscape(prefix) : prefixEscaped || "{{";
    this.suffix = suffix ? regexEscape(suffix) : suffixEscaped || "}}";
    this.formatSeparator = formatSeparator || ",";
    this.unescapePrefix = unescapeSuffix ? "" : unescapePrefix ? regexEscape(unescapePrefix) : "-";
    this.unescapeSuffix = this.unescapePrefix ? "" : unescapeSuffix ? regexEscape(unescapeSuffix) : "";
    this.nestingPrefix = nestingPrefix ? regexEscape(nestingPrefix) : nestingPrefixEscaped || regexEscape("$t(");
    this.nestingSuffix = nestingSuffix ? regexEscape(nestingSuffix) : nestingSuffixEscaped || regexEscape(")");
    this.nestingOptionsSeparator = nestingOptionsSeparator || ",";
    this.maxReplaces = maxReplaces || 1e3;
    this.alwaysFormat = alwaysFormat !== void 0 ? alwaysFormat : false;
    this.resetRegExp();
  }
  reset() {
    if (this.options) this.init(this.options);
  }
  resetRegExp() {
    const getOrResetRegExp = (existingRegExp, pattern) => {
      if (existingRegExp?.source === pattern) {
        existingRegExp.lastIndex = 0;
        return existingRegExp;
      }
      return new RegExp(pattern, "g");
    };
    this.regexp = getOrResetRegExp(this.regexp, `${this.prefix}(.+?)${this.suffix}`);
    this.regexpUnescape = getOrResetRegExp(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`);
    this.nestingRegexp = getOrResetRegExp(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
  }
  interpolate(str, data, lng, options) {
    let match;
    let value;
    let replaces;
    const defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
    const handleFormat = (key) => {
      if (!key.includes(this.formatSeparator)) {
        const path = deepFindWithDefaults(data, defaultData, key, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(path, void 0, lng, {
          ...options,
          ...data,
          interpolationkey: key
        }) : path;
      }
      const p = key.split(this.formatSeparator);
      const k = p.shift().trim();
      const f = p.join(this.formatSeparator).trim();
      return this.format(deepFindWithDefaults(data, defaultData, k, this.options.keySeparator, this.options.ignoreJSONStructure), f, lng, {
        ...options,
        ...data,
        interpolationkey: k
      });
    };
    this.resetRegExp();
    if (!this.escapeValue && typeof str === "string" && /\$t\([^)]*\{[^}]*\{\{/.test(str)) {
      this.logger.warn("nesting options string contains interpolated variables with escapeValue: false \u2014 if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.");
    }
    const missingInterpolationHandler = options?.missingInterpolationHandler || this.options.missingInterpolationHandler;
    const skipOnVariables = options?.interpolation?.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    const todos = [{
      regex: this.regexpUnescape,
      safeValue: (val) => val
    }, {
      regex: this.regexp,
      safeValue: (val) => this.escapeValue ? this.escape(val) : val
    }];
    todos.forEach((todo) => {
      replaces = 0;
      while (match = todo.regex.exec(str)) {
        const matchedVar = match[1].trim();
        value = handleFormat(matchedVar);
        if (value === void 0) {
          if (typeof missingInterpolationHandler === "function") {
            const temp = missingInterpolationHandler(str, match, options);
            value = isString(temp) ? temp : "";
          } else if (options && Object.prototype.hasOwnProperty.call(options, matchedVar)) {
            value = "";
          } else if (skipOnVariables) {
            value = match[0];
            continue;
          } else {
            this.logger.warn(`missed to pass in variable ${matchedVar} for interpolating ${str}`);
            value = "";
          }
        } else if (!isString(value) && !this.useRawValueToEscape) {
          value = makeString(value);
        }
        const safeValue = todo.safeValue(value);
        str = str.replace(match[0], regexSafe(safeValue));
        if (skipOnVariables) {
          todo.regex.lastIndex += safeValue.length;
          todo.regex.lastIndex -= match[0].length;
        } else {
          todo.regex.lastIndex = 0;
        }
        replaces++;
        if (replaces >= this.maxReplaces) {
          break;
        }
      }
    });
    return str;
  }
  nest(str, fc, options = {}) {
    let match;
    let value;
    let clonedOptions;
    const handleHasOptions = (key, inheritedOptions) => {
      const sep = this.nestingOptionsSeparator;
      if (!key.includes(sep)) return key;
      const c = key.split(new RegExp(`${regexEscape(sep)}[ ]*{`));
      let optionsString = `{${c[1]}`;
      key = c[0];
      optionsString = this.interpolate(optionsString, clonedOptions);
      const matchedSingleQuotes = optionsString.match(/'/g);
      const matchedDoubleQuotes = optionsString.match(/"/g);
      if ((matchedSingleQuotes?.length ?? 0) % 2 === 0 && !matchedDoubleQuotes || (matchedDoubleQuotes?.length ?? 0) % 2 !== 0) {
        optionsString = optionsString.replace(/'/g, '"');
      }
      try {
        clonedOptions = JSON.parse(optionsString);
        if (inheritedOptions) clonedOptions = {
          ...inheritedOptions,
          ...clonedOptions
        };
      } catch (e) {
        this.logger.warn(`failed parsing options string in nesting for key ${key}`, e);
        return `${key}${sep}${optionsString}`;
      }
      if (clonedOptions.defaultValue && clonedOptions.defaultValue.includes(this.prefix)) delete clonedOptions.defaultValue;
      return key;
    };
    while (match = this.nestingRegexp.exec(str)) {
      let formatters = [];
      clonedOptions = {
        ...options
      };
      clonedOptions = clonedOptions.replace && !isString(clonedOptions.replace) ? clonedOptions.replace : clonedOptions;
      clonedOptions.applyPostProcessor = false;
      delete clonedOptions.defaultValue;
      const keyEndIndex = /{.*}/s.test(match[1]) ? match[1].lastIndexOf("}") + 1 : match[1].indexOf(this.formatSeparator);
      if (keyEndIndex !== -1) {
        formatters = match[1].slice(keyEndIndex).split(this.formatSeparator).map((elem) => elem.trim()).filter(Boolean);
        match[1] = match[1].slice(0, keyEndIndex);
      }
      value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
      if (value && match[0] === str && !isString(value)) return value;
      if (!isString(value)) value = makeString(value);
      if (!value) {
        this.logger.warn(`missed to resolve ${match[1]} for nesting ${str}`);
        value = "";
      }
      if (formatters.length) {
        value = formatters.reduce((v, f) => this.format(v, f, options.lng, {
          ...options,
          interpolationkey: match[1].trim()
        }), value.trim());
      }
      str = str.replace(match[0], regexSafe(makeString(value)));
      this.regexp.lastIndex = 0;
    }
    return str;
  }
};
var parseFormatStr = (formatStr) => {
  let formatName = formatStr.toLowerCase().trim();
  const formatOptions = {};
  if (formatStr.includes("(")) {
    const p = formatStr.split("(");
    formatName = p[0].toLowerCase().trim();
    const optStr = p[1].slice(0, -1);
    if (formatName === "currency" && !optStr.includes(":")) {
      if (!formatOptions.currency) formatOptions.currency = optStr.trim();
    } else if (formatName === "relativetime" && !optStr.includes(":")) {
      if (!formatOptions.range) formatOptions.range = optStr.trim();
    } else {
      const opts = optStr.split(";");
      opts.forEach((opt) => {
        if (opt) {
          const [key, ...rest] = opt.split(":");
          const val = rest.join(":").trim().replace(/^'+|'+$/g, "");
          const trimmedKey = key.trim();
          if (!formatOptions[trimmedKey]) formatOptions[trimmedKey] = val;
          if (val === "false") formatOptions[trimmedKey] = false;
          if (val === "true") formatOptions[trimmedKey] = true;
          if (!isNaN(val)) formatOptions[trimmedKey] = parseInt(val, 10);
        }
      });
    }
  }
  return {
    formatName,
    formatOptions
  };
};
var createCachedFormatter = (fn) => {
  const cache = {};
  return (v, l, o) => {
    let optForCache = o;
    if (o && o.interpolationkey && o.formatParams && o.formatParams[o.interpolationkey] && o[o.interpolationkey]) {
      optForCache = {
        ...optForCache,
        [o.interpolationkey]: void 0
      };
    }
    const key = l + JSON.stringify(optForCache);
    let frm = cache[key];
    if (!frm) {
      frm = fn(getCleanedCode(l), o);
      cache[key] = frm;
    }
    return frm(v);
  };
};
var createNonCachedFormatter = (fn) => (v, l, o) => fn(getCleanedCode(l), o)(v);
var Formatter = class {
  constructor(options = {}) {
    this.logger = baseLogger.create("formatter");
    this.options = options;
    this.init(options);
  }
  init(services, options = {
    interpolation: {}
  }) {
    this.formatSeparator = options.interpolation.formatSeparator || ",";
    const cf = options.cacheInBuiltFormats ? createCachedFormatter : createNonCachedFormatter;
    this.formats = {
      number: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      currency: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt,
          style: "currency"
        });
        return (val) => formatter.format(val);
      }),
      datetime: cf((lng, opt) => {
        const formatter = new Intl.DateTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      relativetime: cf((lng, opt) => {
        const formatter = new Intl.RelativeTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val, opt.range || "day");
      }),
      list: cf((lng, opt) => {
        const formatter = new Intl.ListFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      })
    };
  }
  add(name, fc) {
    this.formats[name.toLowerCase().trim()] = fc;
  }
  addCached(name, fc) {
    this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
  }
  format(value, format, lng, options = {}) {
    if (!format) return value;
    if (value == null) return value;
    const rawFormats = format.split(this.formatSeparator);
    const formats = [];
    for (let i = 0; i < rawFormats.length; i++) {
      let f = rawFormats[i];
      while (f.indexOf("(") > -1 && !f.includes(")") && i + 1 < rawFormats.length) {
        f = `${f}${this.formatSeparator}${rawFormats[++i]}`;
      }
      formats.push(f);
    }
    const result = formats.reduce((mem, f) => {
      const {
        formatName,
        formatOptions
      } = parseFormatStr(f);
      if (this.formats[formatName]) {
        let formatted = mem;
        try {
          const valOptions = options?.formatParams?.[options.interpolationkey] || {};
          const l = valOptions.locale || valOptions.lng || options.locale || options.lng || lng;
          formatted = this.formats[formatName](mem, l, {
            ...formatOptions,
            ...options,
            ...valOptions
          });
        } catch (error) {
          this.logger.warn(error);
        }
        return formatted;
      } else {
        this.logger.warn(`there was no format function for ${formatName}`);
      }
      return mem;
    }, value);
    return result;
  }
};
var removePending = (q, name) => {
  if (q.pending[name] !== void 0) {
    delete q.pending[name];
    q.pendingCount--;
  }
};
var Connector = class extends EventEmitter {
  constructor(backend, store, services, options = {}) {
    super();
    this.backend = backend;
    this.store = store;
    this.services = services;
    this.languageUtils = services.languageUtils;
    this.options = options;
    this.logger = baseLogger.create("backendConnector");
    this.waitingReads = [];
    this.maxParallelReads = options.maxParallelReads || 10;
    this.readingCalls = 0;
    this.maxRetries = options.maxRetries >= 0 ? options.maxRetries : 5;
    this.retryTimeout = options.retryTimeout >= 1 ? options.retryTimeout : 350;
    this.state = {};
    this.queue = [];
    this.backend?.init?.(services, options.backend, options);
  }
  queueLoad(languages2, namespaces, options, callback) {
    const toLoad = {};
    const pending = {};
    const toLoadLanguages = {};
    const toLoadNamespaces = {};
    languages2.forEach((lng) => {
      let hasAllNamespaces = true;
      namespaces.forEach((ns) => {
        const name = `${lng}|${ns}`;
        if (!options.reload && this.store.hasResourceBundle(lng, ns)) {
          this.state[name] = 2;
        } else if (this.state[name] < 0) ;
        else if (this.state[name] === 1) {
          if (pending[name] === void 0) pending[name] = true;
        } else {
          this.state[name] = 1;
          hasAllNamespaces = false;
          if (pending[name] === void 0) pending[name] = true;
          if (toLoad[name] === void 0) toLoad[name] = true;
          if (toLoadNamespaces[ns] === void 0) toLoadNamespaces[ns] = true;
        }
      });
      if (!hasAllNamespaces) toLoadLanguages[lng] = true;
    });
    if (Object.keys(toLoad).length || Object.keys(pending).length) {
      this.queue.push({
        pending,
        pendingCount: Object.keys(pending).length,
        loaded: {},
        errors: [],
        callback
      });
    }
    return {
      toLoad: Object.keys(toLoad),
      pending: Object.keys(pending),
      toLoadLanguages: Object.keys(toLoadLanguages),
      toLoadNamespaces: Object.keys(toLoadNamespaces)
    };
  }
  loaded(name, err, data) {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    if (err) this.emit("failedLoading", lng, ns, err);
    if (!err && data) {
      this.store.addResourceBundle(lng, ns, data, void 0, void 0, {
        skipCopy: true
      });
    }
    this.state[name] = err ? -1 : 2;
    if (err && data) this.state[name] = 0;
    const loaded = {};
    this.queue.forEach((q) => {
      pushPath(q.loaded, [lng], ns);
      removePending(q, name);
      if (err) q.errors.push(err);
      if (q.pendingCount === 0 && !q.done) {
        Object.keys(q.loaded).forEach((l) => {
          if (!loaded[l]) loaded[l] = {};
          const loadedKeys = q.loaded[l];
          if (loadedKeys.length) {
            loadedKeys.forEach((n) => {
              if (loaded[l][n] === void 0) loaded[l][n] = true;
            });
          }
        });
        q.done = true;
        if (q.errors.length) {
          q.callback(q.errors);
        } else {
          q.callback();
        }
      }
    });
    this.emit("loaded", loaded);
    this.queue = this.queue.filter((q) => !q.done);
  }
  read(lng, ns, fcName, tried = 0, wait = this.retryTimeout, callback) {
    if (!lng.length) return callback(null, {});
    if (this.readingCalls >= this.maxParallelReads) {
      this.waitingReads.push({
        lng,
        ns,
        fcName,
        tried,
        wait,
        callback
      });
      return;
    }
    this.readingCalls++;
    const resolver = (err, data) => {
      this.readingCalls--;
      if (this.waitingReads.length > 0) {
        const next = this.waitingReads.shift();
        this.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
      }
      if (err && data && tried < this.maxRetries) {
        setTimeout(() => {
          this.read(lng, ns, fcName, tried + 1, wait * 2, callback);
        }, wait);
        return;
      }
      callback(err, data);
    };
    const fc = this.backend[fcName].bind(this.backend);
    if (fc.length === 2) {
      try {
        const r = fc(lng, ns);
        if (r && typeof r.then === "function") {
          r.then((data) => resolver(null, data)).catch(resolver);
        } else {
          resolver(null, r);
        }
      } catch (err) {
        resolver(err);
      }
      return;
    }
    return fc(lng, ns, resolver);
  }
  prepareLoading(languages2, namespaces, options = {}, callback) {
    if (!this.backend) {
      this.logger.warn("No backend was added via i18next.use. Will not load resources.");
      return callback && callback();
    }
    if (isString(languages2)) languages2 = this.languageUtils.toResolveHierarchy(languages2);
    if (isString(namespaces)) namespaces = [namespaces];
    const toLoad = this.queueLoad(languages2, namespaces, options, callback);
    if (!toLoad.toLoad.length) {
      if (!toLoad.pending.length) callback();
      return null;
    }
    toLoad.toLoad.forEach((name) => {
      this.loadOne(name);
    });
  }
  load(languages2, namespaces, callback) {
    this.prepareLoading(languages2, namespaces, {}, callback);
  }
  reload(languages2, namespaces, callback) {
    this.prepareLoading(languages2, namespaces, {
      reload: true
    }, callback);
  }
  loadOne(name, prefix = "") {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    this.read(lng, ns, "read", void 0, void 0, (err, data) => {
      if (err) this.logger.warn(`${prefix}loading namespace ${ns} for language ${lng} failed`, err);
      if (!err && data) this.logger.log(`${prefix}loaded namespace ${ns} for language ${lng}`, data);
      this.loaded(name, err, data);
    });
  }
  saveMissing(languages2, namespace, key, fallbackValue, isUpdate, options = {}, clb = () => {
  }) {
    if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(namespace)) {
      this.logger.warn(`did not save key "${key}" as the namespace "${namespace}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
      return;
    }
    if (key === void 0 || key === null || key === "") return;
    if (this.backend?.create) {
      const opts = {
        ...options,
        isUpdate
      };
      const fc = this.backend.create.bind(this.backend);
      if (fc.length < 6) {
        try {
          let r;
          if (fc.length === 5) {
            r = fc(languages2, namespace, key, fallbackValue, opts);
          } else {
            r = fc(languages2, namespace, key, fallbackValue);
          }
          if (r && typeof r.then === "function") {
            r.then((data) => clb(null, data)).catch(clb);
          } else {
            clb(null, r);
          }
        } catch (err) {
          clb(err);
        }
      } else {
        fc(languages2, namespace, key, fallbackValue, clb, opts);
      }
    }
    if (!languages2 || !languages2[0]) return;
    this.store.addResource(languages2[0], namespace, key, fallbackValue);
  }
};
var get = () => ({
  debug: false,
  initAsync: true,
  ns: ["translation"],
  defaultNS: ["translation"],
  fallbackLng: ["dev"],
  fallbackNS: false,
  supportedLngs: false,
  nonExplicitSupportedLngs: false,
  load: "all",
  preload: false,
  keySeparator: ".",
  nsSeparator: ":",
  pluralSeparator: "_",
  contextSeparator: "_",
  enableSelector: false,
  partialBundledLanguages: false,
  saveMissing: false,
  updateMissing: false,
  saveMissingTo: "fallback",
  saveMissingPlurals: true,
  missingKeyHandler: false,
  missingInterpolationHandler: false,
  postProcess: false,
  postProcessPassResolved: false,
  returnNull: false,
  returnEmptyString: true,
  returnObjects: false,
  joinArrays: false,
  returnedObjectHandler: false,
  parseMissingKeyHandler: false,
  appendNamespaceToMissingKey: false,
  appendNamespaceToCIMode: false,
  overloadTranslationOptionHandler: (args) => {
    let ret = {};
    if (typeof args[1] === "object") ret = args[1];
    if (isString(args[1])) ret.defaultValue = args[1];
    if (isString(args[2])) ret.tDescription = args[2];
    if (typeof args[2] === "object" || typeof args[3] === "object") {
      const options = args[3] || args[2];
      Object.keys(options).forEach((key) => {
        ret[key] = options[key];
      });
    }
    return ret;
  },
  interpolation: {
    escapeValue: true,
    prefix: "{{",
    suffix: "}}",
    formatSeparator: ",",
    unescapePrefix: "-",
    nestingPrefix: "$t(",
    nestingSuffix: ")",
    nestingOptionsSeparator: ",",
    maxReplaces: 1e3,
    skipOnVariables: true
  },
  cacheInBuiltFormats: true
});
var transformOptions = (options) => {
  if (isString(options.ns)) options.ns = [options.ns];
  if (isString(options.fallbackLng)) options.fallbackLng = [options.fallbackLng];
  if (isString(options.fallbackNS)) options.fallbackNS = [options.fallbackNS];
  if (options.supportedLngs && !options.supportedLngs.includes("cimode")) {
    options.supportedLngs = options.supportedLngs.concat(["cimode"]);
  }
  return options;
};
var noop = () => {
};
var bindMemberFunctions = (inst) => {
  const mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
  mems.forEach((mem) => {
    if (typeof inst[mem] === "function") {
      inst[mem] = inst[mem].bind(inst);
    }
  });
};
var I18n = class _I18n extends EventEmitter {
  constructor(options = {}, callback) {
    super();
    this.options = transformOptions(options);
    this.services = {};
    this.logger = baseLogger;
    this.modules = {
      external: []
    };
    bindMemberFunctions(this);
    if (callback && !this.isInitialized && !options.isClone) {
      if (!this.options.initAsync) {
        this.init(options, callback);
        return this;
      }
      setTimeout(() => {
        this.init(options, callback);
      }, 0);
    }
  }
  init(options = {}, callback) {
    this.isInitializing = true;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options.defaultNS == null && options.ns) {
      if (isString(options.ns)) {
        options.defaultNS = options.ns;
      } else if (!options.ns.includes("translation")) {
        options.defaultNS = options.ns[0];
      }
    }
    const defOpts = get();
    this.options = {
      ...defOpts,
      ...this.options,
      ...transformOptions(options)
    };
    this.options.interpolation = {
      ...defOpts.interpolation,
      ...this.options.interpolation
    };
    if (options.keySeparator !== void 0) {
      this.options.userDefinedKeySeparator = options.keySeparator;
    }
    if (options.nsSeparator !== void 0) {
      this.options.userDefinedNsSeparator = options.nsSeparator;
    }
    if (typeof this.options.overloadTranslationOptionHandler !== "function") {
      this.options.overloadTranslationOptionHandler = defOpts.overloadTranslationOptionHandler;
    }
    const createClassOnDemand = (ClassOrObject) => {
      if (!ClassOrObject) return null;
      if (typeof ClassOrObject === "function") return new ClassOrObject();
      return ClassOrObject;
    };
    if (!this.options.isClone) {
      if (this.modules.logger) {
        baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
      } else {
        baseLogger.init(null, this.options);
      }
      let formatter;
      if (this.modules.formatter) {
        formatter = this.modules.formatter;
      } else {
        formatter = Formatter;
      }
      const lu = new LanguageUtil(this.options);
      this.store = new ResourceStore(this.options.resources, this.options);
      const s = this.services;
      s.logger = baseLogger;
      s.resourceStore = this.store;
      s.languageUtils = lu;
      s.pluralResolver = new PluralResolver(lu, {
        prepend: this.options.pluralSeparator
      });
      if (formatter) {
        s.formatter = createClassOnDemand(formatter);
        if (s.formatter.init) s.formatter.init(s, this.options);
        this.options.interpolation.format = s.formatter.format.bind(s.formatter);
      }
      s.interpolator = new Interpolator(this.options);
      s.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      };
      s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
      s.backendConnector.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      if (this.modules.languageDetector) {
        s.languageDetector = createClassOnDemand(this.modules.languageDetector);
        if (s.languageDetector.init) s.languageDetector.init(s, this.options.detection, this.options);
      }
      if (this.modules.i18nFormat) {
        s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
        if (s.i18nFormat.init) s.i18nFormat.init(this);
      }
      this.translator = new Translator(this.services, this.options);
      this.translator.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      this.modules.external.forEach((m) => {
        if (m.init) m.init(this);
      });
    }
    this.format = this.options.interpolation.format;
    if (!callback) callback = noop;
    if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      if (codes.length > 0 && codes[0] !== "dev") this.options.lng = codes[0];
    }
    if (!this.services.languageDetector && !this.options.lng) {
      this.logger.warn("init: no languageDetector is used and no lng is defined");
    }
    const storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
    storeApi.forEach((fcName) => {
      this[fcName] = (...args) => this.store[fcName](...args);
    });
    const storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
    storeApiChained.forEach((fcName) => {
      this[fcName] = (...args) => {
        this.store[fcName](...args);
        return this;
      };
    });
    const deferred = defer();
    const load = () => {
      const finish = (err, t2) => {
        this.isInitializing = false;
        if (this.isInitialized && !this.initializedStoreOnce) this.logger.warn("init: i18next is already initialized. You should call init just once!");
        this.isInitialized = true;
        if (!this.options.isClone) this.logger.log("initialized", this.options);
        this.emit("initialized", this.options);
        deferred.resolve(t2);
        callback(err, t2);
      };
      if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return finish(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, finish);
    };
    if (this.options.resources || !this.options.initAsync) {
      load();
    } else {
      setTimeout(load, 0);
    }
    return deferred;
  }
  loadResources(language, callback = noop) {
    let usedCallback = callback;
    const usedLng = isString(language) ? language : this.language;
    if (typeof language === "function") usedCallback = language;
    if (!this.options.resources || this.options.partialBundledLanguages) {
      if (usedLng?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return usedCallback();
      const toLoad = [];
      const append = (lng) => {
        if (!lng) return;
        if (lng === "cimode") return;
        const lngs = this.services.languageUtils.toResolveHierarchy(lng);
        lngs.forEach((l) => {
          if (l === "cimode") return;
          if (!toLoad.includes(l)) toLoad.push(l);
        });
      };
      if (!usedLng) {
        const fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
        fallbacks.forEach((l) => append(l));
      } else {
        append(usedLng);
      }
      this.options.preload?.forEach?.((l) => append(l));
      this.services.backendConnector.load(toLoad, this.options.ns, (e) => {
        if (!e && !this.resolvedLanguage && this.language) this.setResolvedLanguage(this.language);
        usedCallback(e);
      });
    } else {
      usedCallback(null);
    }
  }
  reloadResources(lngs, ns, callback) {
    const deferred = defer();
    if (typeof lngs === "function") {
      callback = lngs;
      lngs = void 0;
    }
    if (typeof ns === "function") {
      callback = ns;
      ns = void 0;
    }
    if (!lngs) lngs = this.languages;
    if (!ns) ns = this.options.ns;
    if (!callback) callback = noop;
    this.services.backendConnector.reload(lngs, ns, (err) => {
      deferred.resolve();
      callback(err);
    });
    return deferred;
  }
  use(module) {
    if (!module) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!module.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    if (module.type === "backend") {
      this.modules.backend = module;
    }
    if (module.type === "logger" || module.log && module.warn && module.error) {
      this.modules.logger = module;
    }
    if (module.type === "languageDetector") {
      this.modules.languageDetector = module;
    }
    if (module.type === "i18nFormat") {
      this.modules.i18nFormat = module;
    }
    if (module.type === "postProcessor") {
      postProcessor.addPostProcessor(module);
    }
    if (module.type === "formatter") {
      this.modules.formatter = module;
    }
    if (module.type === "3rdParty") {
      this.modules.external.push(module);
    }
    return this;
  }
  setResolvedLanguage(l) {
    if (!l || !this.languages) return;
    if (["cimode", "dev"].includes(l)) return;
    for (let li = 0; li < this.languages.length; li++) {
      const lngInLngs = this.languages[li];
      if (["cimode", "dev"].includes(lngInLngs)) continue;
      if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
        this.resolvedLanguage = lngInLngs;
        break;
      }
    }
    if (!this.resolvedLanguage && !this.languages.includes(l) && this.store.hasLanguageSomeTranslations(l)) {
      this.resolvedLanguage = l;
      this.languages.unshift(l);
    }
  }
  changeLanguage(lng, callback) {
    this.isLanguageChangingTo = lng;
    const deferred = defer();
    this.emit("languageChanging", lng);
    const setLngProps = (l) => {
      this.language = l;
      this.languages = this.services.languageUtils.toResolveHierarchy(l);
      this.resolvedLanguage = void 0;
      this.setResolvedLanguage(l);
    };
    const done = (err, l) => {
      if (l) {
        if (this.isLanguageChangingTo === lng) {
          setLngProps(l);
          this.translator.changeLanguage(l);
          this.isLanguageChangingTo = void 0;
          this.emit("languageChanged", l);
          this.logger.log("languageChanged", l);
        }
      } else {
        this.isLanguageChangingTo = void 0;
      }
      deferred.resolve((...args) => this.t(...args));
      if (callback) callback(err, (...args) => this.t(...args));
    };
    const setLng = (lngs) => {
      if (!lng && !lngs && this.services.languageDetector) lngs = [];
      const fl = isString(lngs) ? lngs : lngs && lngs[0];
      const l = this.store.hasLanguageSomeTranslations(fl) ? fl : this.services.languageUtils.getBestMatchFromCodes(isString(lngs) ? [lngs] : lngs);
      if (l) {
        if (!this.language) {
          setLngProps(l);
        }
        if (!this.translator.language) this.translator.changeLanguage(l);
        this.services.languageDetector?.cacheUserLanguage?.(l);
      }
      this.loadResources(l, (err) => {
        done(err, l);
      });
    };
    if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
      setLng(this.services.languageDetector.detect());
    } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
      if (this.services.languageDetector.detect.length === 0) {
        this.services.languageDetector.detect().then(setLng);
      } else {
        this.services.languageDetector.detect(setLng);
      }
    } else {
      setLng(lng);
    }
    return deferred;
  }
  getFixedT(lng, ns, keyPrefix, fixedOpts) {
    const scopeNs = fixedOpts?.scopeNs;
    const fixedT = (key, opts, ...rest) => {
      let o;
      if (typeof opts !== "object") {
        o = this.options.overloadTranslationOptionHandler([key, opts].concat(rest));
      } else {
        o = {
          ...opts
        };
      }
      o.lng = o.lng || fixedT.lng;
      o.lngs = o.lngs || fixedT.lngs;
      const explicitCallNs = o.ns !== void 0 && o.ns !== null;
      o.ns = o.ns || fixedT.ns;
      if (o.keyPrefix !== "") o.keyPrefix = o.keyPrefix || keyPrefix || fixedT.keyPrefix;
      const selectorOpts = {
        ...this.options,
        ...o
      };
      if (Array.isArray(scopeNs) && !explicitCallNs) selectorOpts.ns = scopeNs;
      if (typeof o.keyPrefix === "function") o.keyPrefix = keysFromSelector(o.keyPrefix, selectorOpts);
      const keySeparator = this.options.keySeparator || ".";
      let resultKey;
      if (o.keyPrefix && Array.isArray(key)) {
        resultKey = key.map((k) => {
          if (typeof k === "function") k = keysFromSelector(k, selectorOpts);
          return `${o.keyPrefix}${keySeparator}${k}`;
        });
      } else {
        if (typeof key === "function") key = keysFromSelector(key, selectorOpts);
        resultKey = o.keyPrefix ? `${o.keyPrefix}${keySeparator}${key}` : key;
      }
      return this.t(resultKey, o);
    };
    if (isString(lng)) {
      fixedT.lng = lng;
    } else {
      fixedT.lngs = lng;
    }
    fixedT.ns = ns;
    fixedT.keyPrefix = keyPrefix;
    return fixedT;
  }
  t(...args) {
    return this.translator?.translate(...args);
  }
  exists(...args) {
    return this.translator?.exists(...args);
  }
  setDefaultNamespace(ns) {
    this.options.defaultNS = ns;
  }
  hasLoadedNamespace(ns, options = {}) {
    if (!this.isInitialized) {
      this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
      return false;
    }
    if (!this.languages || !this.languages.length) {
      this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
      return false;
    }
    const lng = options.lng || this.resolvedLanguage || this.languages[0];
    const fallbackLng = this.options ? this.options.fallbackLng : false;
    const lastLng = this.languages[this.languages.length - 1];
    if (lng.toLowerCase() === "cimode") return true;
    const loadNotPending = (l, n) => {
      const loadState = this.services.backendConnector.state[`${l}|${n}`];
      return loadState === -1 || loadState === 0 || loadState === 2;
    };
    if (options.precheck) {
      const preResult = options.precheck(this, loadNotPending);
      if (preResult !== void 0) return preResult;
    }
    if (this.hasResourceBundle(lng, ns)) return true;
    if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages) return true;
    if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns))) return true;
    return false;
  }
  loadNamespaces(ns, callback) {
    const deferred = defer();
    if (!this.options.ns) {
      if (callback) callback();
      return Promise.resolve();
    }
    if (isString(ns)) ns = [ns];
    ns.forEach((n) => {
      if (!this.options.ns.includes(n)) this.options.ns.push(n);
    });
    this.loadResources((err) => {
      deferred.resolve();
      if (callback) callback(err);
    });
    return deferred;
  }
  loadLanguages(lngs, callback) {
    const deferred = defer();
    if (isString(lngs)) lngs = [lngs];
    const preloaded = this.options.preload || [];
    const newLngs = lngs.filter((lng) => !preloaded.includes(lng) && this.services.languageUtils.isSupportedCode(lng));
    if (!newLngs.length) {
      if (callback) callback();
      return Promise.resolve();
    }
    this.options.preload = preloaded.concat(newLngs);
    this.loadResources((err) => {
      deferred.resolve();
      if (callback) callback(err);
    });
    return deferred;
  }
  dir(lng) {
    if (!lng) lng = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language);
    if (!lng) return "rtl";
    try {
      const l = new Intl.Locale(lng);
      if (l && l.getTextInfo) {
        const ti = l.getTextInfo();
        if (ti && ti.direction) return ti.direction;
      }
    } catch (e) {
    }
    const rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
    const languageUtils = this.services?.languageUtils || new LanguageUtil(get());
    if (lng.toLowerCase().indexOf("-latn") > 1) return "ltr";
    return rtlLngs.includes(languageUtils.getLanguagePartFromCode(lng)) || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(options = {}, callback) {
    const instance2 = new _I18n(options, callback);
    instance2.createInstance = _I18n.createInstance;
    return instance2;
  }
  cloneInstance(options = {}, callback = noop) {
    const forkResourceStore = options.forkResourceStore;
    if (forkResourceStore) delete options.forkResourceStore;
    const mergedOptions = {
      ...this.options,
      ...options,
      ...{
        isClone: true
      }
    };
    const clone = new _I18n(mergedOptions);
    if (options.debug !== void 0 || options.prefix !== void 0) {
      clone.logger = clone.logger.clone(options);
    }
    const membersToCopy = ["store", "services", "language"];
    membersToCopy.forEach((m) => {
      clone[m] = this[m];
    });
    clone.services = {
      ...this.services
    };
    clone.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    if (forkResourceStore) {
      const clonedData = Object.keys(this.store.data).reduce((prev, l) => {
        prev[l] = {
          ...this.store.data[l]
        };
        prev[l] = Object.keys(prev[l]).reduce((acc, n) => {
          acc[n] = {
            ...prev[l][n]
          };
          return acc;
        }, prev[l]);
        return prev;
      }, {});
      clone.store = new ResourceStore(clonedData, mergedOptions);
      clone.services.resourceStore = clone.store;
    }
    if (options.interpolation) {
      const defOpts = get();
      const mergedInterpolation = {
        ...defOpts.interpolation,
        ...this.options.interpolation,
        ...options.interpolation
      };
      const mergedForInterpolator = {
        ...mergedOptions,
        interpolation: mergedInterpolation
      };
      clone.services.interpolator = new Interpolator(mergedForInterpolator);
    }
    clone.translator = new Translator(clone.services, mergedOptions);
    clone.translator.on("*", (event, ...args) => {
      clone.emit(event, ...args);
    });
    clone.init(mergedOptions, callback);
    clone.translator.options = mergedOptions;
    clone.translator.backendConnector.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    return clone;
  }
  toJSON() {
    return {
      options: this.options,
      store: this.store,
      language: this.language,
      languages: this.languages,
      resolvedLanguage: this.resolvedLanguage
    };
  }
};
var instance = I18n.createInstance();
var createInstance = instance.createInstance;
var dir = instance.dir;
var init = instance.init;
var loadResources = instance.loadResources;
var reloadResources = instance.reloadResources;
var use = instance.use;
var changeLanguage = instance.changeLanguage;
var getFixedT = instance.getFixedT;
var t = instance.t;
var exists = instance.exists;
var setDefaultNamespace = instance.setDefaultNamespace;
var hasLoadedNamespace = instance.hasLoadedNamespace;
var loadNamespaces = instance.loadNamespaces;
var loadLanguages = instance.loadLanguages;

// src/locales/en.ts
var en_default = {
  "workspace.more": "Show {{count}} more sessions",
  "workspace.attention": "Needs your attention",
  "workspace.running": "Running",
  "workspace.confirmed": "Confirmed",
  "workspace.sessionCount": "{{count}} sessions",
  "workspace.hook": "Codex live event",
  "workspace.hostSource": "Codex host status",
  "workspace.historySource": "Historical observation",
  "workspace.viewHistory": "View history",
  "workspace.empty": "No matching sessions",
  "workspace.list": "List",
  "workspace.subtitle": "Handle what needs you, then check running sessions",
  "workspace.label": "Workspace",
  "workspace.projects": "Projects",
  "workspace.history": "Session history",
  "workspace.allProjects": "All projects",
  "activity.unknownHint": "The session state is unknown. Open it to check.",
  "activity.sessions": "Sessions",
  "activity.title": "Activity",
  "activity.pending": "Awaiting confirmation",
  "activity.confirmed": "Confirmed complete",
  "activity.hint": "Observed state changes and human confirmations. Unrecorded history is not reconstructed.",
  "activity.empty": "No session activity yet",
  "activity.more": "Show {{count}} more",
  "card.lastActivity": "Last activity: {{at}}",
  "task.nextComplete": "If this task is done, confirm completion to move it to Completed.",
  "task.startWork": "Start in Codex",
  "task.nextStart": "Open a Codex chat to start this task.",
  "task.pendingCompletion": "Confirm completion",
  "task.completedByUser": "Task completion confirmed by the user",
  "errors.completionState": "This task cannot be completed directly. Review submitted deliveries instead.",
  "errors.completionActive": "AI is still working or waiting for a response. Finish the current turn in the chat first.",
  "time.previousMonth": "Go to previous month",
  "time.nextMonth": "Go to next month",
  "time.dateLabel": "{{date}}",
  "time.selectedDate": "{{date}}, selected",
  "time.todayDate": "Today, {{date}}",
  "time.todaySelected": "Today, {{date}}, selected",
  "app.title": "Todos \xB7 Workspace",
  "nav.today": "Home",
  "nav.work": "Sessions",
  "nav.projects": "Projects",
  "nav.okr": "OKRs",
  "nav.inbox": "Inbox",
  "nav.plans": "Daily plans",
  "nav.settings": "Settings",
  "nav.label": "Workspace navigation",
  "common.name": "Name",
  "common.description": "Description",
  "common.note": "Notes",
  "common.save": "Save settings",
  "common.saving": "Saving",
  "common.saveChanges": "Save changes",
  "common.delete": "Delete",
  "common.deleted": "Deleted",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.edit": "Edit",
  "common.refresh": "Refresh",
  "common.details": "Details",
  "common.unknown": "Unknown",
  "common.on": "On",
  "common.off": "Off",
  "common.all": "All",
  "common.restore": "Restore",
  "common.current": "Current",
  "common.suggestion": "Suggestion",
  "common.empty": "Not provided",
  "common.processing": "Processing\u2026",
  "common.saved": "Settings saved",
  "entity.task": "Task",
  "entity.project": "Project",
  "entity.objective": "Objective",
  "entity.keyResult": "Key result",
  "entity.plan": "Plan",
  "entity.save": "Save {{value}}",
  "entity.saved": "{{value}} saved",
  "entity.new": "New {{value}}",
  "entity.stored": "Saved to the local database",
  "entity.revision": "Current review revision r{{revision}}",
  "entity.settingsRevision": "Current review revision r{{value}}",
  "entity.editTitle": "Edit {{entity}}",
  "entity.newTitle": "New {{entity}}",
  "project.managed": "Project names are managed in Codex and updated on sync.",
  "project.none": "No project",
  "project.all": "All projects",
  "project.sync": "Sync Codex projects",
  "project.synced": "Synced {{count, number}} Codex project folders: {{added, number}} added, {{updated, number}} updated.",
  "project.syncFailed": "Codex project sync failed: {{value}}",
  "project.noDescription": "No project description yet.",
  "project.viewTasks": "View tasks",
  "project.organize": "Organize work by project",
  "project.sharedTasks": "Projects, boards and timelines share the same tasks.",
  "project.acceptedCount": "{{accepted, number}} / {{count, number}} accepted",
  "connection.openLocal": "Open full app",
  "connection.fullscreen": "Fullscreen",
  "connection.fullscreenDenied": "The host did not switch this app to fullscreen.",
  "connection.localApp": "Local app: ",
  "connection.disconnected": "Workspace disconnected",
  "connection.connecting": "Connecting to the local workspace\u2026",
  "connection.unavailable": "Connection unavailable: ",
  "connection.toolFailed": "Tool call failed",
  "connection.localReview": "Open the local app for human review.",
  "connection.openDenied": "The host did not allow this local link. Open {{url}} manually.",
  "connection.selectFocus": "Select a task to focus on first.",
  "connection.rescheduleLocked": "Request changes or reopen the task before rescheduling.",
  "connection.reviewLocal": "Open the delivery evidence in the local app and confirm your decision.",
  "connection.copyDenied": "Use the copy shortcut to copy the selected instructions.",
  "connection.sendDenied": "The host declined to send the instructions. Copy them to the original chat.",
  "connection.historyOnly": "The host live API is unavailable. Trusted hooks supply runtime status.",
  "connection.hookSetup": "Live status is not connected; only chat history is synced. Run codex in a terminal, enter /hooks, and review and trust the ai-todos plugin hooks. Reopen the chats you want to track; they will appear under In progress when runtime events arrive.",
  "session.synced": "Updated the Codex chat catalog: {{count, number}} chats, including history. {{value}}",
  "session.syncFailed": "Codex chat sync failed: {{value}}",
  "session.confirmed": "Chat confirmed complete",
  "session.confirmedAt": "Confirmed complete \xB7 {{at}}",
  "session.open": "Open chat",
  "session.handle": "Continue in original chat",
  "session.confirmAll": "Confirm all",
  "session.confirmAllHint": "Confirm all pending chats matching the current filters",
  "session.confirmAllProgress": "Confirming {{done}} / {{total}}",
  "session.confirmAllResult": "{{succeeded}} chats confirmed; {{failed}} unsuccessful",
  "session.confirm": "Confirm complete",
  "session.dragConfirm": "Drag to Completed to confirm this turn's result.",
  "session.invalidConfirmation": "Only stopped chats without a linked task can be confirmed complete.",
  "session.api": "Codex chat API",
  "session.unlinked": "No AI linked",
  "session.source": "Source: {{value}} \xB7 {{value2}} \xB7 {{event}}",
  "session.observeHint": "Sync Codex or enable hooks to observe runtime status. A task being in execution does not mean AI is running.",
  "board.unstarted": "Not started",
  "board.executing": "In progress",
  "board.waitingUser": "Needs your attention",
  "board.completed": "Completed",
  "board.label": "Task execution board",
  "board.mode": "Board",
  "board.search": "Search tasks",
  "board.searchPlaceholder": "Search tasks\u2026",
  "board.summary": "{{taskCount}} \xB7 {{sessionCount}} on the board",
  "board.taskCount": "{{count, number}} tasks",
  "board.taskCount_one": "{{count, number}} task",
  "board.taskCount_other": "{{count, number}} tasks",
  "board.sessionCount": "{{count, number}} chats",
  "board.sessionCount_one": "{{count, number}} chat",
  "board.sessionCount_other": "{{count, number}} chats",
  "board.cards": "{{label}} cards",
  "board.moreSessions": "More chats ({{count, number}} remaining)",
  "board.empty": "No tasks",
  "board.collapseHistory": "Hide completion history",
  "board.historyCount": "View completion history ({{count, number}} items)",
  "board.historyCount_one": "View completion history ({{count, number}} item)",
  "board.historyCount_other": "View completion history ({{count, number}} items)",
  "board.resumeLinked": "Open the linked AI chat to continue execution.",
  "board.interruptLinked": "Interrupt or continue in the original AI chat.",
  "board.noDragAccept": "Completion or acceptance requires a real human review; it cannot be recorded by dragging a task.",
  "board.sameColumn": "The task is already in this column.",
  "board.resolveRequest": "Handle the AI approval or input request before deciding whether to request changes.",
  "board.submitFirst": "The task has not been submitted for acceptance. Continue in the original chat or submit a delivery.",
  "board.useDetails": "Use task details to advance the current stage.",
  "board.taskChanged": "The task has changed. Refresh and review it again.",
  "task.new": "New task",
  "task.create": "Create task",
  "task.add": "Add task",
  "task.name": "Task name",
  "task.title": "Task title",
  "task.description": "Task description",
  "task.criteria": "Acceptance criteria (optional)",
  "task.definition": "Task description and acceptance criteria",
  "task.namePlaceholder": "Enter a task; AI can improve its title and definition.",
  "task.criteriaPlaceholder": "Optional: describe the results you want to check.",
  "task.priority": "Priority",
  "priority.low": "Low",
  "priority.normal": "Normal",
  "priority.high": "High",
  "task.priorityLabel": "{{priority}} priority",
  "task.saveFirst": "Save your changes first.",
  "task.saved": "Task saved",
  "task.stateUpdated": "Task status updated",
  "task.deleted": "Task deleted",
  "task.open": "Open task",
  "task.openNamed": "Open task {{title}}",
  "task.openDetails": "Open task details for {{title}}",
  "task.expand": "Expand task {{title}}",
  "task.editNamed": "Edit task {{title}}",
  "task.openDelivery": "Open task to handle delivery",
  "task.reopen": "Reopen task",
  "task.advance": "Advance task",
  "task.redefine": "Redefine",
  "task.ready": "Confirm requirements",
  "task.nextStep": "Next step",
  "task.nextReview": "Check the delivery and evidence, then accept or request changes.",
  "task.nextApproval": "Open the chat and respond to the pending approval request.",
  "task.nextInput": "Open the chat and answer the AI's question or provide the missing information.",
  "task.nextResume": "Inspect the linked chat for the failure or interruption. Opening it does not resume execution automatically.",
  "task.nextRunning": "AI is working. Open the chat to view progress.",
  "task.saveBeforeNext": "You have unsaved changes. Save them before the next step.",
  "task.handleApproval": "Review approval",
  "task.reply": "Reply to AI",
  "task.resumeSession": "Open chat",
  "task.viewProgress": "View progress",
  "task.otherActions": "Other actions",
  "task.execute": "Start execution",
  "task.cancel": "Cancel task",
  "task.deleteUnstarted": "Delete unstarted task",
  "task.executionHint": "Starting execution records intent. AI runtime status comes from the host API or trusted hooks. Stop does not change delivery status.",
  "task.lockedHint": "The current state preserves the reviewed content. Request changes or reopen the task before editing.",
  "task.reviewedRevision": "Revision actually reviewed: r{{revision}}",
  "task.deliveryState": "Delivery: {{state}}",
  "state.defining": "Confirm requirements",
  "state.ready": "Confirmed",
  "state.executing": "AI in execution",
  "state.awaitingAcceptance": "Awaiting my acceptance",
  "state.changesRequested": "Changes requested",
  "state.accepted": "Accepted",
  "state.cancelled": "Cancelled",
  "state.manualExecuting": "In execution",
  "runtime.queued": "Queued",
  "runtime.running": "Running",
  "runtime.waitingApproval": "Awaiting approval",
  "runtime.waitingInput": "Awaiting input",
  "runtime.interrupted": "Interrupted",
  "runtime.failed": "Execution failed",
  "runtime.pendingConfirmation": "Awaiting confirmation",
  "runtime.turnEnded": "Turn ended",
  "runtime.unknown": "Status unconfirmed",
  "runtime.planningQueued": "Planning queued",
  "runtime.planningRunning": "Planning",
  "runtime.planningApproval": "Planning awaits approval",
  "runtime.planningInput": "Planning awaits input",
  "runtime.planningInterrupted": "Planning interrupted",
  "runtime.planningFailed": "Planning failed",
  "schedule.title": "Schedule and task links",
  "schedule.start": "Planned start",
  "schedule.end": "Planned end",
  "schedule.scheduled": "Scheduled",
  "schedule.unscheduled": "Unscheduled",
  "schedule.saved": "Schedule saved",
  "schedule.reminder": "Reminder",
  "time.seconds": "{{value}} seconds",
  "time.seconds_one": "{{value}} second",
  "time.seconds_other": "{{value}} seconds",
  "time.minutes": "{{value}} minutes",
  "time.minutes_one": "{{value}} minute",
  "time.minutes_other": "{{value}} minutes",
  "time.hours": "{{value}} hours",
  "time.hours_one": "{{value}} hour",
  "time.hours_other": "{{value}} hours",
  "time.today": "Today",
  "time.now": "Now",
  "time.label": "Time",
  "time.field": "{{label}} time",
  "time.selectDate": "Select date",
  "time.selectDateTime": "Select date and time",
  "time.clear": "Clear",
  "timeline.mode": "Activity",
  "timeline.window": "Scheduled: {{count, number}} tasks",
  "timeline.window_one": "Scheduled: {{count, number}} task",
  "timeline.window_other": "Scheduled: {{count, number}} tasks",
  "timeline.backward": "Previous range",
  "timeline.forward": "Next range",
  "timeline.outsideWindow": "{{before}} earlier and {{after}} later tasks outside this range",
  "timeline.earlierTasks": "Earlier ({{count}})",
  "timeline.laterTasks": "Later ({{count}})",
  "timeline.granularity": "Gantt chart time scale",
  "timeline.day": "Day",
  "timeline.week": "Week",
  "timeline.month": "Month",
  "timeline.taskProject": "Task / Project",
  "timeline.axis": "Gantt chart timeline; scroll horizontally.",
  "timeline.range": "{{title}}: {{value}} to {{value2}}",
  "timeline.locked": "{{state}}: schedule locked. Click to view details.",
  "timeline.empty": "No scheduled tasks. Drag a task here from below.",
  "timeline.allScheduled": "All active tasks are scheduled.",
  "timeline.returnHint": "Drop a task bar here to clear its schedule and keep the task.",
  "timeline.dropHint": "Drop on either half of a date column to schedule one day.",
  "timeline.controls": "Moving and resizing snap to half-day (12-hour) steps. Drag unscheduled cards onto a date; drag bars back to the pool to clear dates. Awaiting acceptance and accepted tasks are locked. Arrow keys move half a day; Shift adjusts the end.",
  "focus.start": "Start focus",
  "focus.pause": "Pause focus",
  "focus.resume": "Resume focus",
  "focus.end": "Finish and record",
  "focus.prepare": "Ready to focus",
  "focus.addTask": "Add a task to begin",
  "focus.running": "Focusing",
  "focus.paused": "Focus paused",
  "focus.missingTask": "The original focus task was removed",
  "focus.duration": "Focused for {{duration}} this session",
  "focus.task": "Focus task",
  "focus.stats": "Focus statistics",
  "focus.statsDate": "Statistics date",
  "focus.todayTime": "Today's time",
  "focus.dateTime": "Time on selected date",
  "focus.totalTime": "Total time",
  "focus.recordCount": "Saved focus records",
  "focus.details": "View focus details",
  "focus.selectTask": "Select task",
  "focus.timeSpent": "Time spent",
  "focus.noRecords": "No time records for the selected date.",
  "focus.byProject": "Totals by project",
  "focus.recentRecords": "Recent records",
  "focus.wallClockHint": "Closing the panel does not stop the timer. Running timers count elapsed wall time during sleep or service downtime. Pause before leaving.",
  "focus.active": "Current focus",
  "focus.taskPaused": "Focus paused",
  "focus.taskAction": "Focus on this task",
  "focus.barRunning": "Focusing",
  "focus.barPaused": "Paused",
  "focus.barPause": "Pause",
  "focus.barResume": "Resume",
  "today.label": "Today",
  "today.tasks": "Today's tasks",
  "today.progress": "Today's progress",
  "today.added": "Task added to today",
  "today.splitAdded": "Split into {{count, number}} tasks for today",
  "today.capturePlaceholder": "Enter a task; press Enter to add it to today",
  "today.addTask": "Add task to today",
  "today.addTaskShortcut": "Add task to today (\u21B5)",
  "today.fullDefinition": "Fill in task details",
  "today.draftImproved": "AI improved the task draft",
  "today.suggestSplit": "This task can be split up",
  "today.reviewDraft": "Review the description and acceptance criteria before adding it to today.",
  "today.viewDefinition": "View description and acceptance criteria",
  "today.keepSingle": "Keep as one task",
  "today.splitCount": "Split into {{count, number}} tasks",
  "today.awaitingCount": "{{value}} awaiting my acceptance \xB7 ",
  "today.incompleteCount": "{{count, number}} unfinished",
  "today.notPlanned": "No tasks planned for today",
  "today.noTasks": "No tasks to execute today",
  "today.poolCount": "{{count, number}} unfinished tasks in the backlog",
  "today.poolCount_one": "{{count, number}} unfinished task in the backlog",
  "today.poolCount_other": "{{count, number}} unfinished tasks in the backlog",
  "today.poolHint": "There are {{count, number}} unfinished tasks in the backlog. Choose some to get started.",
  "today.poolHint_one": "There is {{count, number}} unfinished task in the backlog. Choose it to get started.",
  "today.poolHint_other": "There are {{count, number}} unfinished tasks in the backlog. Choose some to get started.",
  "today.inboxHint": "There are ideas in your inbox. Organize and confirm them before adding them to today.",
  "today.addHint": "Add a task above; saving it adds it to today.",
  "today.acceptedCount": "Accepted today: {{count, number}}",
  "today.cancelledCount": " \xB7 Cancelled: {{value}}",
  "today.chooseTasks": "Choose tasks for today",
  "today.arrange": "Plan today",
  "today.adjust": "Adjust today's tasks and notes",
  "today.arrangeAction": "Plan",
  "today.saved": "Today's plan saved",
  "today.dateHint": "{{date}} \xB7 Select tasks to add to today",
  "today.fromBacklog": "Plan today from the backlog",
  "today.selectionHint": "Select to add to today. Deselecting removes it from today; the task stays in the backlog.",
  "today.createHint": "Define the task and save to add it to today",
  "today.inboxCount": "Inbox {{count, number}}",
  "today.chooseIdeas": "Choose ideas, organize them, then add them to today",
  "today.backlog": "Backlog",
  "today.selectedCount": "Selected {{selected, number}} / {{count, number}}",
  "today.clearIncomplete": "Deselect unfinished",
  "today.selectAll": "Add all",
  "today.noIncomplete": "No unfinished tasks right now.",
  "today.finishedCount": "Finished today: {{count, number}}",
  "today.historyCount": "Previously accepted: {{count, number}}",
  "today.note": "Today's notes",
  "today.totalCount": "{{count, number}} tasks today",
  "today.totalCount_one": "{{count, number}} task today",
  "today.totalCount_other": "{{count, number}} tasks today",
  "today.save": "Save today's plan",
  "today.remove": "Remove from today",
  "today.add": "Add to today",
  "today.included": "Added to today",
  "today.accepted": "Accepted",
  "today.notIncluded": "Not added",
  "plan.includedTasks": "Included tasks",
  "plan.selectedCount": "{{count, number}} selected",
  "plan.noTasks": "Create tasks first, then add them to a plan.",
  "plan.date": "Plan date",
  "plan.edit": "Edit plan",
  "plan.description": "Plan existing tasks by date. View and edit task lists for different dates; today's plan appears on Home.",
  "plan.emptyTasks": "No tasks selected yet.",
  "plan.emptyTitle": "Give today a clear plan",
  "plan.emptyHint": "Choose existing tasks and add a date and notes. Plans do not duplicate tasks.",
  "inbox.saved": "Saved to inbox; excluded from backlog and overdue counts",
  "inbox.promoted": "Converted inbox idea to a task",
  "inbox.promotedToday": "Converted to a task and added to today",
  "inbox.archived": "Archived; restore it at the bottom of the inbox",
  "inbox.restored": "Restored to inbox",
  "inbox.capture": "Save to inbox",
  "inbox.captureShortcut": "Save to inbox (\u2325/Alt+\u21B5)",
  "inbox.original": "Original inbox idea",
  "inbox.kicker": "Capture first, organize later",
  "inbox.pendingCount": "{{count, number}} ideas await your decision, excluded from backlog and overdue counts.",
  "inbox.pendingCount_one": "{{count, number}} idea awaits your decision, excluded from backlog and overdue counts.",
  "inbox.pendingCount_other": "{{count, number}} ideas await your decision, excluded from backlog and overdue counts.",
  "inbox.intro": "Capture an idea as it comes; you can clarify it later.",
  "inbox.placeholder": "Capture an idea; press Enter to save",
  "inbox.captureLabel": "Capture an inbox idea",
  "inbox.save": "Capture",
  "inbox.emptyTitle": "Inbox is clear",
  "inbox.emptyHint": "Enter new ideas above and press Enter to capture them.",
  "inbox.search": "Search ideas",
  "inbox.searchLabel": "Search inbox",
  "inbox.clearSearch": "Clear search",
  "inbox.filterLabel": "Filter inbox",
  "inbox.unorganized": "To organize",
  "inbox.organized": "Organized",
  "inbox.noMatches": "No matching ideas",
  "inbox.filterHint": "Try a different filter or clear the search.",
  "inbox.aiDraft": "AI draft",
  "inbox.preserveOriginal": "The original idea is preserved. Confirming updates the task's displayed content.",
  "inbox.organizing": "Organizing",
  "inbox.reorganize": "Organize again",
  "inbox.aiOrganize": "Organize with AI",
  "inbox.promote": "Convert to task",
  "inbox.addToday": "Add to today",
  "inbox.define": "Refine task definition",
  "inbox.archiveNamed": "Archive {{title}}",
  "inbox.archive": "Archive",
  "inbox.collapseArchived": "Hide archived",
  "inbox.archivedCount": "View archived {{count, number}}",
  "ai.improve": "Improve task with AI",
  "ai.improving": "AI is improving the task",
  "ai.draftReady": "AI improved the draft. Review it before saving.",
  "ai.improveTitle": "Improve title and definition with AI",
  "ai.optimizeField": "Optimize {{label}} with AI",
  "ai.generatingField": "Generating suggestions for {{label}}",
  "ai.generating": "Generating\u2026",
  "ai.titleHint": "Improve the title, description and acceptance criteria using the current content",
  "ai.fieldHint": "Optimize {{label}} using the current title, description and acceptance criteria",
  "ai.definitionHint": "AI suggests changes based on the current content. Apply them, then save.",
  "ai.preview": "AI suggestion preview",
  "ai.suggestions": "AI suggestions",
  "ai.confirmHint": "The current content stays unchanged until you confirm.",
  "ai.skip": "Dismiss",
  "ai.apply": "Apply suggestions",
  "ai.waiting": "Waiting for AI suggestions\u2026",
  "ai.linkTitle": "AI chat link",
  "ai.unlinked": "Not linked yet",
  "ai.taskId": "Task ID: {{id}}",
  "ai.trustedSession": "Trusted AI chat",
  "ai.unlink": "No link",
  "ai.saveLink": "Save link",
  "ai.linkSaved": "Link saved",
  "ai.linkHint": "Link chats synced from the official Codex API or observed through trusted hooks. Catalog sync does not mean AI is running.",
  "ai.generatePrompt": "Generate execution instructions",
  "prompt.title": "Hand off to Codex",
  "prompt.deliveryHint": "Sending instructions does not mean the task is running or delivered.",
  "prompt.identityHint": "Instructions include the original task ID and trusted session verification requirements.",
  "prompt.label": "Execution instructions",
  "prompt.copy": "Copy instructions",
  "prompt.copied": "Execution instructions copied",
  "prompt.send": "Send to current chat",
  "prompt.sent": "Execution instructions sent to the current chat",
  "history.title": "Task history",
  "history.updated": "Task updated",
  "history.transition": "Advanced to {{value}}",
  "history.bound": "Trusted chat linked",
  "history.submitted": "Delivery evidence submitted",
  "history.accepted": "Accepted by human reviewer",
  "history.rejected": "Human reviewer requested changes",
  "history.focus": "Recorded focus time: {{value}}",
  "history.reviewed": " \xB7 Reviewed r{{revision}}",
  "delivery.summary": "Delivery summary",
  "delivery.evidence": "Delivery evidence",
  "delivery.evidenceLabel": "Evidence name",
  "delivery.evidenceUri": "Evidence URL or absolute local path",
  "delivery.evidenceNote": "Evidence notes (verification commands and actual results)",
  "delivery.confirm": "I am submitting actual delivery evidence",
  "delivery.hint": "Submission moves the task to awaiting acceptance. File paths are for human review; the service does not read or execute files. More evidence can be submitted together through MCP.",
  "delivery.submitAcceptance": "Submit for acceptance",
  "delivery.submit": "Submit delivery",
  "delivery.title": "Submit actual delivery",
  "delivery.revision": "Submission based on the revision actually reviewed: r{{revision}}",
  "delivery.submitted": "Submitted; awaiting human review",
  "delivery.submittedAt": "Submitted at {{at}}",
  "review.title": "Human delivery review",
  "review.intro": "Reviewing r{{revision}} of \u201C{{title}}\u201D. Check the acceptance criteria and evidence before confirming your decision.",
  "review.reviewer": "Reviewer",
  "review.decision": "Review decision",
  "review.accept": "Accept",
  "review.reject": "Request changes",
  "review.note": "Review notes (required when requesting changes)",
  "review.confirm": "I reviewed this version's delivery evidence and explicitly confirm this decision",
  "review.record": "Record human decision",
  "review.recorded": "Human decision recorded",
  "review.revisionHint": "Revision actually reviewed: r{{revision}} \xB7 Confirmation is rejected if the task changes",
  "review.action": "Review delivery",
  "review.acceptOrReject": "Review and accept / request changes",
  "review.latest": "Latest human review",
  "review.actualRevision": " \xB7 Actually reviewed r{{revision}}",
  "delete.title": "Confirm deletion",
  "delete.hint": "Only unexecuted data without references or time records can be deleted. Cancel tasks with execution records.",
  "settings.language": "Language",
  "settings.followSystem": "Follow system",
  "settings.languageHint": "Automatic mode follows the Codex host language, then the browser language.",
  "settings.languageStorageFailed": "Could not save the language preference. Refreshing will restore automatic selection.",
  "settings.reminders": "Reminder settings",
  "settings.editReminders": "Edit reminder settings",
  "settings.enableReminders": "Enable task reminders",
  "settings.followUp": "Execution follow-up interval (minutes; 0 to disable)",
  "settings.reviewTime": "Daily review time (leave blank to disable)",
  "settings.timezone": "Time zone",
  "settings.reminderLabel": "Task reminders: ",
  "settings.followUpLabel": "Progress follow-up: ",
  "settings.followUpMinutes": "Every {{followUpMinutes, number}} minutes",
  "settings.reviewLabel": "Daily review: ",
  "settings.timezoneLabel": "Time zone: ",
  "settings.allowNotifications": "Allow browser notifications",
  "settings.notificationsUnsupported": "This browser does not support system notifications. Reminders are still saved in the reminder log.",
  "settings.notificationsAllowed": "Browser notifications enabled while the page is open",
  "settings.notificationsDenied": "Notifications are disabled. Reminders are still saved in the reminder log.",
  "settings.schedulerHint": "The local service checks and saves due reminders every 15 seconds. Scheduling pauses during downtime or sleep and resumes with current reminders. Browser notifications require an open page and permission; they do not wake AI.",
  "notices.title": "Reminder log",
  "notices.unreadCount": "{{count, number}} unread",
  "notices.read": "Read",
  "notices.viewToday": "View today's plan",
  "notices.empty": "No reminders yet.",
  "notices.taskReminder": "Task reminder: {{title}}",
  "notices.followUp": "Progress follow-up: {{title}}",
  "notices.dailyReview": "Daily review: reflect on deliveries, focus time and tomorrow's plan",
  "okr.objective": "Objective",
  "okr.unit": "Unit (optional)",
  "okr.unitPlaceholder": "For example: items, times, %, dollars",
  "okr.unitHint": "Used to display progress, such as 20 / 100 items. For percentages, use %, a baseline of 0 and a target of 100.",
  "okr.baseline": "Baseline",
  "okr.target": "Target",
  "okr.current": "Current value",
  "okr.keyResultCount": "{{count, number}} key results",
  "okr.keyResultCount_one": "{{count, number}} key result",
  "okr.keyResultCount_other": "{{count, number}} key results",
  "okr.addKeyResult": "Add key result",
  "okr.editObjective": "Edit objective",
  "okr.expandObjective": "Expand objective {{title}}",
  "okr.collapseObjective": "Collapse objective {{title}}",
  "okr.updateKeyResult": "Update KR",
  "okr.noKeyResults": "No key results yet.",
  "okr.emptyTitle": "Choose a goal worth pursuing",
  "okr.emptyHint": "Key results track current and target values. Tasks can link to a KR.",
  "errors.notFound": "{{kind}} does not exist",
  "errors.staleRevision": "The data has changed. Reopen and review it before trying again.",
  "errors.schedulePair": "Provide both the planned start and end times.",
  "errors.scheduleOrder": "The end time must be later than the start time.",
  "errors.krTarget": "The KR target must differ from its baseline.",
  "errors.duplicatePlanTask": "A task cannot appear twice in a plan.",
  "errors.taskLocked": "Request changes or reopen the task before editing it.",
  "errors.onlyTaskToday": "Only tasks can be added to today's plan.",
  "errors.requestReused": "A requestId cannot be reused for different creation requests.",
  "errors.restoreIdea": "Restore the archived idea first.",
  "errors.stalePlan": "Today's plan has changed. Close and reopen Plan today before trying again.",
  "errors.projectName": "Project names are managed by Codex. Rename the project there, then sync.",
  "errors.references": "Remove related task, KR or plan references first.",
  "errors.taskRecords": "Cancel tasks with execution or time records to preserve the audit trail.",
  "errors.workflowRecords": "Cancel tasks with workflow records to preserve the audit trail.",
  "errors.noticeMissing": "The reminder does not exist.",
  "errors.bindState": "Only tasks in definition, ready or changes requested can be linked to a chat.",
  "errors.humanRebind": "Relinking must be done by a person in the UI.",
  "errors.trustedSession": "Sync Codex chats or enable trusted plugin hooks first.",
  "errors.sessionBound": "This chat is already linked to a task. Continue using that task.",
  "errors.transition": "Cannot transition from {{from}} to {{to}}.",
  "errors.humanReopen": "Reopening an accepted task must be done by a person in the UI.",
  "errors.bindBeforeExecute": "Link a trusted chat before AI execution.",
  "errors.finishFocus": "Finish this task's focus timer first.",
  "errors.submitState": "Only tasks in execution can submit a delivery.",
  "errors.evidenceUri": "Evidence must be an HTTP(S) URL or an absolute local path.",
  "errors.evidenceCredentials": "Evidence URLs cannot contain credentials.",
  "errors.reviewState": "Only tasks awaiting acceptance with delivery evidence can be reviewed.",
  "errors.rejectReason": "Provide a reason for requesting changes.",
  "errors.sessionMissing": "The chat does not exist.",
  "errors.staleSession": "The chat has changed. Refresh and confirm again.",
  "errors.confirmState": "Only chats whose turn has stopped or ended can be confirmed complete.",
  "errors.taskAcceptance": "Confirm completion of linked chats through task acceptance.",
  "errors.finishCurrentFocus": "Finish the current focus session first.",
  "errors.endedTaskFocus": "Ended tasks cannot be timed.",
  "errors.noFocus": "No task is being focused on.",
  "errors.resumeFocus": "Only paused focus sessions can be resumed.",
  "errors.pauseFocus": "Only running focus sessions can be paused.",
  "errors.tooLarge": "The request is too large.",
  "errors.jsonRequired": "A JSON request is required.",
  "errors.loopbackOnly": "Only the local loopback address is allowed.",
  "errors.unauthorized": "Unauthorized",
  "errors.routeMissing": "Not found",
  "errors.crossSite": "Cross-site request rejected.",
  "errors.reopenApp": "Reopen ai-todos.",
  "errors.invalidUiRequest": "Invalid UI request.",
  "errors.deliveryRequired": "The task has not submitted a delivery.",
  "errors.expiredReview": "The review has expired. Reopen the delivery evidence.",
  "errors.invalidTimezone": "Invalid time zone",
  "errors.projectPath": "Project folders must use absolute paths.",
  "errors.sessionPath": "Chat folders must use absolute paths.",
  "errors.codexTimeout": "Codex timed out. Try again later.",
  "errors.codexMissing": "Codex CLI was not found. Install it and sign in before trying again.",
  "errors.codexStart": "Could not start Codex.",
  "errors.codexClosed": "The Codex connection closed.",
  "errors.codexHost": "The Codex host connection is unavailable.",
  "errors.codexExit": "Codex exited. Check the CLI sign-in and model configuration.",
  "errors.codexLarge": "The Codex response is too large.",
  "errors.codexTools": "Codex requested extra permissions or tools. The task draft is unchanged.",
  "errors.codexRequest": "{{message}}",
  "errors.newSessionState": "A new chat cannot be created for this task in its current state.",
  "errors.archiveFailed": "Linking failed, and the new chat {{id}} could not be archived: {{message}}",
  "errors.syncFirst": "Sync Codex chats first.",
  "errors.unboundSession": "The chat has no linked task.",
  "errors.openCodex": "Could not open Codex. Check that the desktop app is installed. Original chat: {{url}}",
  "errors.projectPagination": "Codex project pagination repeated. No projects were synced.",
  "errors.sessionPagination": "Codex chat pagination repeated. No chats were synced.",
  "errors.toolsPagination": "Codex tool configuration pagination repeated. Generation did not start.",
  "errors.generationIncomplete": "Codex did not finish generation. The draft is unchanged.",
  "errors.invalidSuggestion": "Codex did not return a valid task suggestion. Try again.",
  "errors.serviceStart": "The local service could not start. Check {{path}} and make sure {{origin}} is not occupied by another app.",
  "prompt.execution": "Use ai-todos to execute the original task {{id}} \u201C{{title}}\u201D. First call ai_todos_task to read the task and acceptance criteria, and retain the revision actually read. {{binding}}Advance through definition \u2192 ready \u2192 execution. After real delivery, use submit to provide a summary and actual evidence; never invent test results. Stop only ends the current turn. Ask the user to review the evidence in the local app; AI must not accept its own delivery.",
  "prompt.bound": "This task is linked to Codex sessionId={{sessionId}}. Verify it against the sessionId provided by this chat's trusted hook. Execute only if they match; otherwise stop and ask the user to open the original chat. ",
  "prompt.unbound": "Get sessionId from this chat's trusted hook and check the observed chats in ai_todos_snapshot before linking. Never guess IDs or create duplicate tasks. ",
  "prompt.description": "Task description:\n{{description}}",
  "prompt.criteria": "Acceptance criteria:\n{{criteria}}",
  "okr.unlink": "No KR link",
  "common.closeDialog": "Close dialog",
  "task.cancelledCount": "Cancelled ({{count, number}})",
  "time.calendarNavigation": "Calendar navigation",
  "settings.followUpMinutes_other": "Every {{followUpMinutes, number}} minutes",
  "project.synced_other": "Synced {{count, number}} Codex project folders: {{added, number}} added, {{updated, number}} updated.",
  "settings.followUpMinutes_one": "Every {{followUpMinutes, number}} minute",
  "project.synced_one": "Synced {{count, number}} Codex project folder: {{added, number}} added, {{updated, number}} updated."
};

// src/locales/zh-CN.ts
var zh_CN_default = {
  "workspace.more": "\u518D\u663E\u793A {{count}} \u4E2A\u4F1A\u8BDD",
  "workspace.attention": "\u9700\u8981\u4F60\u5904\u7406",
  "workspace.running": "\u6B63\u5728\u8FD0\u884C",
  "workspace.confirmed": "\u5DF2\u786E\u8BA4",
  "workspace.sessionCount": "{{count}} \u4E2A\u4F1A\u8BDD",
  "workspace.hook": "Codex \u5B9E\u65F6\u4E8B\u4EF6",
  "workspace.hostSource": "Codex \u5BBF\u4E3B\u72B6\u6001",
  "workspace.historySource": "\u5386\u53F2\u89C2\u5BDF",
  "workspace.viewHistory": "\u67E5\u770B\u8BB0\u5F55",
  "workspace.empty": "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD",
  "workspace.list": "\u5217\u8868",
  "workspace.subtitle": "\u5148\u5904\u7406\u9700\u8981\u4F60\u7684\u4E8B\uFF0C\u518D\u5173\u6CE8\u6B63\u5728\u8FD0\u884C\u7684\u4F1A\u8BDD",
  "workspace.label": "\u5DE5\u4F5C\u7A7A\u95F4",
  "workspace.projects": "\u9879\u76EE",
  "workspace.history": "\u4F1A\u8BDD\u8BB0\u5F55",
  "workspace.allProjects": "\u5168\u90E8\u9879\u76EE",
  "activity.unknownHint": "\u4F1A\u8BDD\u72B6\u6001\u6682\u4E0D\u53EF\u786E\u8BA4\uFF0C\u8BF7\u6253\u5F00\u4F1A\u8BDD\u67E5\u770B\u3002",
  "activity.sessions": "\u4F1A\u8BDD",
  "activity.title": "\u4F1A\u8BDD\u8BB0\u5F55",
  "activity.pending": "\u5F85\u786E\u8BA4\u5B8C\u6210",
  "activity.confirmed": "\u4EBA\u5DE5\u786E\u8BA4\u5B8C\u6210",
  "activity.hint": "\u8BB0\u5F55\u5DF2\u89C2\u5BDF\u5230\u7684\u72B6\u6001\u53D8\u5316\u548C\u4EBA\u5DE5\u786E\u8BA4\uFF1B\u672A\u8BB0\u5F55\u7684\u5386\u53F2\u4E0D\u4F1A\u8865\u9020\u3002",
  "activity.empty": "\u6682\u65E0\u4F1A\u8BDD\u6D3B\u52A8\u8BB0\u5F55",
  "activity.more": "\u518D\u663E\u793A {{count}} \u6761",
  "card.lastActivity": "\u6700\u8FD1\u6D3B\u52A8\uFF1A{{at}}",
  "task.nextComplete": "\u5982\u679C\u8FD9\u9879\u4EFB\u52A1\u5DF2\u7ECF\u505A\u5B8C\uFF0C\u70B9\u51FB\u201C\u786E\u8BA4\u5B8C\u6210\u201D\u79FB\u5230\u5DF2\u5B8C\u6210\u3002",
  "task.startWork": "\u5728 Codex \u5F00\u59CB",
  "task.nextStart": "\u6253\u5F00 Codex \u4F1A\u8BDD\uFF0C\u5F00\u59CB\u5904\u7406\u8FD9\u9879\u4EFB\u52A1\u3002",
  "task.pendingCompletion": "\u5F85\u786E\u8BA4\u5B8C\u6210",
  "task.completedByUser": "\u7528\u6237\u786E\u8BA4\u4EFB\u52A1\u5B8C\u6210",
  "errors.completionState": "\u5F53\u524D\u4EFB\u52A1\u4E0D\u80FD\u76F4\u63A5\u786E\u8BA4\u5B8C\u6210\uFF1B\u5F85\u9A8C\u6536\u4EFB\u52A1\u8BF7\u5BA1\u9605\u4EA4\u4ED8\u3002",
  "errors.completionActive": "AI \u4ECD\u5728\u5904\u7406\u6216\u7B49\u5F85\u56DE\u590D\uFF0C\u8BF7\u5148\u5728\u4F1A\u8BDD\u4E2D\u7ED3\u675F\u672C\u8F6E\u5DE5\u4F5C\u3002",
  "time.previousMonth": "\u4E0A\u4E2A\u6708",
  "time.nextMonth": "\u4E0B\u4E2A\u6708",
  "time.dateLabel": "{{date}}",
  "time.selectedDate": "{{date}}\uFF0C\u5DF2\u9009\u4E2D",
  "time.todayDate": "\u4ECA\u5929\uFF0C{{date}}",
  "time.todaySelected": "\u4ECA\u5929\uFF0C{{date}}\uFF0C\u5DF2\u9009\u4E2D",
  "app.title": "\u4EFB\u52A1 \xB7 \u5DE5\u4F5C\u53F0",
  "nav.today": "\u9996\u9875",
  "nav.work": "\u4F1A\u8BDD",
  "nav.projects": "\u9879\u76EE",
  "nav.okr": "OKR",
  "nav.inbox": "\u6536\u4EF6\u7BB1",
  "nav.plans": "\u6BCF\u65E5\u8BA1\u5212",
  "nav.settings": "\u8BBE\u7F6E",
  "nav.label": "\u529F\u80FD\u5BFC\u822A",
  "common.name": "\u540D\u79F0",
  "common.description": "\u8BF4\u660E",
  "common.note": "\u5907\u6CE8",
  "common.save": "\u4FDD\u5B58\u914D\u7F6E",
  "common.saving": "\u4FDD\u5B58\u4E2D",
  "common.saveChanges": "\u4FDD\u5B58\u66F4\u6539",
  "common.delete": "\u5220\u9664",
  "common.deleted": "\u5DF2\u5220\u9664",
  "common.cancel": "\u53D6\u6D88",
  "common.confirm": "\u786E\u5B9A",
  "common.edit": "\u7F16\u8F91",
  "common.refresh": "\u5237\u65B0",
  "common.details": "\u8BE6\u60C5",
  "common.unknown": "\u672A\u77E5",
  "common.on": "\u5F00\u542F",
  "common.off": "\u5173\u95ED",
  "common.all": "\u5168\u90E8",
  "common.restore": "\u6062\u590D",
  "common.current": "\u5F53\u524D",
  "common.suggestion": "\u5EFA\u8BAE",
  "common.empty": "\u672A\u586B\u5199",
  "common.processing": "\u5904\u7406\u4E2D\u2026",
  "common.saved": "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
  "entity.task": "\u4EFB\u52A1",
  "entity.project": "\u9879\u76EE",
  "entity.objective": "\u76EE\u6807",
  "entity.keyResult": "\u5173\u952E\u7ED3\u679C",
  "entity.plan": "\u8BA1\u5212",
  "entity.save": "\u4FDD\u5B58{{value}}",
  "entity.saved": "{{value}}\u5DF2\u4FDD\u5B58",
  "entity.new": "\u65B0\u5EFA{{value}}",
  "entity.stored": "\u4FDD\u5B58\u5230\u672C\u5730\u6301\u4E45\u5316\u6570\u636E\u5E93",
  "entity.revision": "\u5F53\u524D\u5BA1\u9605\u7248\u672C r{{revision}}",
  "entity.settingsRevision": "\u5F53\u524D\u5BA1\u9605\u7248\u672C r{{value}}",
  "entity.editTitle": "\u7F16\u8F91{{entity}}",
  "entity.newTitle": "\u65B0\u5EFA{{entity}}",
  "project.managed": "\u9879\u76EE\u540D\u79F0\u5728 Codex \u4E2D\u7EF4\u62A4\uFF0C\u540C\u6B65\u540E\u66F4\u65B0\u3002",
  "project.none": "\u65E0\u9879\u76EE",
  "project.all": "\u5168\u90E8\u9879\u76EE",
  "project.sync": "\u540C\u6B65 Codex \u9879\u76EE",
  "project.synced": "\u5DF2\u540C\u6B65 {{count, number}} \u4E2A Codex \u9879\u76EE\u76EE\u5F55\uFF0C\u65B0\u589E {{added, number}} \u4E2A\uFF0C\u66F4\u65B0 {{updated, number}} \u4E2A\u3002",
  "project.syncFailed": "Codex \u9879\u76EE\u672A\u540C\u6B65\uFF1A{{value}}",
  "project.noDescription": "\u8FD8\u6CA1\u6709\u9879\u76EE\u8BF4\u660E\u3002",
  "project.viewTasks": "\u67E5\u770B\u4EFB\u52A1",
  "project.organize": "\u6309\u9879\u76EE\u7EC4\u7EC7\u5DE5\u4F5C",
  "project.sharedTasks": "\u9879\u76EE\u3001\u770B\u677F\u548C\u65F6\u95F4\u7EBF\u5171\u4EAB\u540C\u4E00\u7EC4\u4EFB\u52A1\u3002",
  "project.acceptedCount": "{{accepted, number}} / {{count, number}} \u5DF2\u9A8C\u6536",
  "connection.openLocal": "\u6253\u5F00\u5B8C\u6574\u5E94\u7528",
  "connection.fullscreen": "\u5168\u5C4F",
  "connection.fullscreenDenied": "\u5F53\u524D\u7A97\u53E3\u672A\u5C06\u5E94\u7528\u5207\u6362\u5230\u5168\u5C4F\u3002",
  "connection.localApp": "\u672C\u5730\u5E94\u7528\uFF1A",
  "connection.disconnected": "\u5DE5\u4F5C\u53F0\u5C1A\u672A\u8FDE\u63A5",
  "connection.connecting": "\u6B63\u5728\u8FDE\u63A5\u672C\u5730\u5DE5\u4F5C\u53F0\u2026",
  "connection.unavailable": "\u8FDE\u63A5\u6682\u4E0D\u53EF\u7528\uFF1A",
  "connection.toolFailed": "\u5DE5\u5177\u8C03\u7528\u5931\u8D25",
  "connection.localReview": "\u4EBA\u5DE5\u5BA1\u9605\u8BF7\u6253\u5F00\u672C\u5730\u5E94\u7528\u3002",
  "connection.openDenied": "\u5BBF\u4E3B\u672A\u5141\u8BB8\u6253\u5F00\u672C\u5730\u94FE\u63A5\uFF0C\u8BF7\u624B\u52A8\u6253\u5F00 {{url}}",
  "connection.selectFocus": "\u8BF7\u5148\u9009\u62E9\u4E13\u6CE8\u4EFB\u52A1",
  "connection.rescheduleLocked": "\u8BF7\u5148\u9000\u56DE\u6216\u91CD\u65B0\u6253\u5F00\u4EFB\u52A1\uFF0C\u518D\u8C03\u6574\u6392\u671F\u3002",
  "connection.reviewLocal": "\u8BF7\u5728\u672C\u5730\u5E94\u7528\u4E2D\u6253\u5F00\u4EA4\u4ED8\u8BC1\u636E\u5E76\u660E\u786E\u786E\u8BA4\u3002",
  "connection.copyDenied": "\u8BF7\u4F7F\u7528\u590D\u5236\u5FEB\u6377\u952E\u590D\u5236\u9009\u4E2D\u7684\u6307\u4EE4",
  "connection.sendDenied": "\u5BBF\u4E3B\u62D2\u7EDD\u53D1\u9001\uFF0C\u8BF7\u590D\u5236\u6307\u4EE4\u5230\u539F\u4F1A\u8BDD",
  "connection.historyOnly": "\u5BBF\u4E3B\u5B9E\u65F6\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u8FD0\u884C\u72B6\u6001\u7531\u53EF\u4FE1 hooks \u8865\u5145\u3002",
  "connection.hookSetup": "\u5B9E\u65F6\u72B6\u6001\u5C1A\u672A\u63A5\u901A\uFF0C\u5F53\u524D\u53EA\u540C\u6B65\u4E86\u5386\u53F2\u4F1A\u8BDD\u3002\u8BF7\u5728\u7EC8\u7AEF\u8FD0\u884C codex\uFF0C\u8F93\u5165 /hooks\uFF0C\u5BA1\u9605\u5E76\u4FE1\u4EFB ai-todos \u63D2\u4EF6\u7684 hooks\u3002\u7136\u540E\u91CD\u65B0\u6253\u5F00\u9700\u8981\u8DDF\u8E2A\u7684\u4F1A\u8BDD\uFF1B\u6536\u5230\u8FD0\u884C\u4E8B\u4EF6\u540E\u4F1A\u81EA\u52A8\u663E\u793A\u5728\u201C\u8FDB\u884C\u4E2D\u201D\u3002",
  "session.synced": "\u5DF2\u66F4\u65B0 Codex \u4F1A\u8BDD\u76EE\u5F55\uFF0C\u5171 {{count, number}} \u4E2A\uFF08\u542B\u5386\u53F2\u4F1A\u8BDD\uFF09\u3002{{value}}",
  "session.syncFailed": "Codex \u4F1A\u8BDD\u672A\u540C\u6B65\uFF1A{{value}}",
  "session.confirmed": "\u4F1A\u8BDD\u5DF2\u786E\u8BA4\u5B8C\u6210",
  "session.confirmedAt": "\u5DF2\u786E\u8BA4\u5B8C\u6210 \xB7 {{at}}",
  "session.open": "\u6253\u5F00\u4F1A\u8BDD",
  "session.handle": "\u56DE\u539F\u4F1A\u8BDD\u5904\u7406",
  "session.confirmAll": "\u4E00\u952E\u5904\u7406",
  "session.confirmAllHint": "\u786E\u8BA4\u5F53\u524D\u7B5B\u9009\u8303\u56F4\u5185\u7684\u5168\u90E8\u5F85\u786E\u8BA4\u4F1A\u8BDD",
  "session.confirmAllProgress": "\u6B63\u5728\u786E\u8BA4 {{done}} / {{total}}",
  "session.confirmAllResult": "\u5DF2\u786E\u8BA4 {{succeeded}} \u4E2A\u4F1A\u8BDD\uFF0C{{failed}} \u4E2A\u672A\u6210\u529F",
  "session.confirm": "\u786E\u8BA4\u5B8C\u6210",
  "session.dragConfirm": "\u62D6\u5230\u201C\u5DF2\u5B8C\u6210\u201D\u53EF\u786E\u8BA4\u672C\u8F6E\u7ED3\u679C",
  "session.invalidConfirmation": "\u53EA\u6709\u5DF2\u7ED3\u675F\u4E14\u672A\u5173\u8054\u4EFB\u52A1\u7684\u4F1A\u8BDD\u53EF\u4EE5\u786E\u8BA4\u5B8C\u6210",
  "session.api": "Codex \u4F1A\u8BDD\u63A5\u53E3",
  "session.unlinked": "\u672A\u5173\u8054 AI",
  "session.source": "\u6765\u6E90\uFF1A{{value}} \xB7 {{value2}} \xB7 {{event}}",
  "session.observeHint": "\u540C\u6B65 Codex \u6216\u542F\u7528 hooks \u540E\u53EF\u89C2\u5BDF\uFF1B\u4E1A\u52A1\u6267\u884C\u4E2D\u4E0D\u4EE3\u8868 AI \u6B63\u5728\u8FD0\u884C",
  "board.unstarted": "\u672A\u5F00\u59CB",
  "board.executing": "\u8FDB\u884C\u4E2D",
  "board.waitingUser": "\u9700\u8981\u4F60\u5904\u7406",
  "board.completed": "\u5DF2\u5B8C\u6210",
  "board.label": "\u4EFB\u52A1\u6267\u884C\u770B\u677F",
  "board.mode": "\u770B\u677F",
  "board.search": "\u641C\u7D22\u4EFB\u52A1",
  "board.searchPlaceholder": "\u641C\u7D22\u4EFB\u52A1\u2026",
  "board.summary": "{{taskCount}} \xB7 {{sessionCount}}",
  "board.taskCount": "{{count, number}} \u4EFB\u52A1",
  "board.taskCount_other": "{{count, number}} \u4EFB\u52A1",
  "board.sessionCount": "{{count, number}} \u4F1A\u8BDD",
  "board.sessionCount_other": "{{count, number}} \u4F1A\u8BDD",
  "board.cards": "{{label}}\u5361\u7247",
  "board.moreSessions": "\u66F4\u591A\u4F1A\u8BDD\uFF08\u8FD8\u5269 {{count, number}} \u4E2A\uFF09",
  "board.empty": "\u6682\u65E0\u4EFB\u52A1",
  "board.collapseHistory": "\u6536\u8D77\u5B8C\u6210\u5386\u53F2",
  "board.historyCount": "\u67E5\u770B\u5B8C\u6210\u5386\u53F2\uFF08{{count, number}} \u9879\uFF09",
  "board.historyCount_other": "\u67E5\u770B\u5B8C\u6210\u5386\u53F2\uFF08{{count, number}} \u9879\uFF09",
  "board.resumeLinked": "\u8BF7\u6253\u5F00\u5173\u8054\u7684 AI \u4F1A\u8BDD\u7EE7\u7EED\u6267\u884C",
  "board.interruptLinked": "\u8BF7\u5728\u539F AI \u4F1A\u8BDD\u4E2D\u4E2D\u65AD\u6216\u7EE7\u7EED",
  "board.noDragAccept": "\u4E0D\u80FD\u901A\u8FC7\u62D6\u62FD\u5236\u9020\u5B8C\u6210\u6216\u9A8C\u6536\uFF1B\u8BF7\u5B8C\u6210\u771F\u5B9E\u4EBA\u5DE5\u9A8C\u6536",
  "board.sameColumn": "\u4EFB\u52A1\u5DF2\u7ECF\u5728\u8FD9\u4E00\u5217",
  "board.resolveRequest": "\u8BF7\u5148\u5904\u7406 AI \u7684\u5BA1\u6279\u6216\u8F93\u5165\u8BF7\u6C42\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u9000\u56DE\u4FEE\u6539",
  "board.submitFirst": "\u4EFB\u52A1\u5C1A\u672A\u660E\u786E\u63D0\u4EA4\u9A8C\u6536\uFF0C\u8BF7\u5148\u5728\u539F\u4F1A\u8BDD\u7EE7\u7EED\u6216\u63D0\u4EA4\u4EA4\u4ED8\u7ED3\u679C",
  "board.useDetails": "\u8BF7\u901A\u8FC7\u4EFB\u52A1\u8BE6\u60C5\u63A8\u8FDB\u5F53\u524D\u9636\u6BB5",
  "board.taskChanged": "\u4EFB\u52A1\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5E76\u91CD\u65B0\u5BA1\u9605\u3002",
  "task.new": "\u65B0\u5EFA\u4EFB\u52A1",
  "task.create": "\u521B\u5EFA\u4EFB\u52A1",
  "task.add": "\u6DFB\u52A0\u4EFB\u52A1",
  "task.name": "\u4EFB\u52A1\u540D\u79F0",
  "task.title": "\u4EFB\u52A1\u6807\u9898",
  "task.description": "\u4EFB\u52A1\u8BF4\u660E",
  "task.criteria": "\u9A8C\u6536\u6807\u51C6\uFF08\u9009\u586B\uFF09",
  "task.definition": "\u4EFB\u52A1\u8BF4\u660E\u4E0E\u9A8C\u6536\u6807\u51C6",
  "task.namePlaceholder": "\u8F93\u5165\u4EFB\u52A1\uFF0CAI \u53EF\u5B8C\u5584\u6807\u9898\u4E0E\u5B9A\u4E49",
  "task.criteriaPlaceholder": "\u9009\u586B\uFF1A\u5199\u4E0B\u4F60\u5E0C\u671B\u6838\u5BF9\u7684\u7ED3\u679C\u3002",
  "task.priority": "\u4F18\u5148\u7EA7",
  "priority.low": "\u4F4E",
  "priority.normal": "\u666E\u901A",
  "priority.high": "\u9AD8",
  "task.priorityLabel": "{{priority}}\u4F18\u5148\u7EA7",
  "task.saveFirst": "\u8BF7\u5148\u4FDD\u5B58\u66F4\u6539",
  "task.saved": "\u4EFB\u52A1\u5DF2\u4FDD\u5B58",
  "task.stateUpdated": "\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0",
  "task.deleted": "\u4EFB\u52A1\u5DF2\u5220\u9664",
  "task.open": "\u6253\u5F00\u4EFB\u52A1",
  "task.openNamed": "\u6253\u5F00\u4EFB\u52A1 {{title}}",
  "task.openDetails": "\u6253\u5F00\u4EFB\u52A1\u8BE6\u60C5 {{title}}",
  "task.expand": "\u5C55\u5F00\u4EFB\u52A1 {{title}}",
  "task.editNamed": "\u7F16\u8F91\u4EFB\u52A1 {{title}}",
  "task.openDelivery": "\u6253\u5F00\u4EFB\u52A1\u5904\u7406\u4EA4\u4ED8",
  "task.reopen": "\u91CD\u5F00\u4EFB\u52A1",
  "task.advance": "\u63A8\u8FDB\u4EFB\u52A1",
  "task.redefine": "\u91CD\u65B0\u5B9A\u4E49",
  "task.ready": "\u786E\u8BA4\u8981\u6C42",
  "task.nextStep": "\u4E0B\u4E00\u6B65",
  "task.nextReview": "\u68C0\u67E5\u4EA4\u4ED8\u7ED3\u679C\u548C\u8BC1\u636E\uFF0C\u9009\u62E9\u901A\u8FC7\u6216\u9000\u56DE\u3002",
  "task.nextApproval": "\u6253\u5F00\u4F1A\u8BDD\uFF0C\u5904\u7406 AI \u6B63\u5728\u7B49\u5F85\u7684\u5BA1\u6279\u3002",
  "task.nextInput": "\u6253\u5F00\u4F1A\u8BDD\uFF0C\u56DE\u590D AI \u7684\u95EE\u9898\u6216\u8865\u5145\u6240\u9700\u4FE1\u606F\u3002",
  "task.nextResume": "\u67E5\u770B\u5173\u8054\u4F1A\u8BDD\u4E2D\u7684\u5931\u8D25\u6216\u4E2D\u65AD\u539F\u56E0\uFF1B\u6B64\u64CD\u4F5C\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u6267\u884C\u3002",
  "task.nextRunning": "AI \u6B63\u5728\u5904\u7406\uFF0C\u53EF\u6253\u5F00\u4F1A\u8BDD\u67E5\u770B\u8FDB\u5EA6\u3002",
  "task.saveBeforeNext": "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF0C\u8BF7\u5148\u4FDD\u5B58\uFF0C\u518D\u8FDB\u884C\u4E0B\u4E00\u6B65\u3002",
  "task.handleApproval": "\u5904\u7406\u5BA1\u6279",
  "task.reply": "\u56DE\u590D AI",
  "task.resumeSession": "\u6253\u5F00\u4F1A\u8BDD",
  "task.viewProgress": "\u67E5\u770B\u8FDB\u5EA6",
  "task.otherActions": "\u5176\u4ED6\u64CD\u4F5C",
  "task.execute": "\u5F00\u59CB\u6267\u884C",
  "task.cancel": "\u53D6\u6D88\u4EFB\u52A1",
  "task.deleteUnstarted": "\u5220\u9664\u672A\u6267\u884C\u4EFB\u52A1",
  "task.executionHint": "\u5F00\u59CB\u6267\u884C\u8BB0\u5F55\u4E1A\u52A1\u610F\u56FE\uFF1BAI \u8FD0\u884C\u72B6\u6001\u6765\u81EA\u5BBF\u4E3B\u63A5\u53E3\u6216\u53EF\u4FE1 hooks\u3002Stop \u4E0D\u6539\u53D8\u4EA4\u4ED8\u72B6\u6001\u3002",
  "task.lockedHint": "\u5F53\u524D\u72B6\u6001\u4FDD\u7559\u5BA1\u9605\u5185\u5BB9\u3002\u9700\u8981\u66F4\u6539\u8BF7\u5148\u9000\u56DE\u6216\u91CD\u65B0\u6253\u5F00\u3002",
  "task.reviewedRevision": "\u672C\u6B21\u5B9E\u9645\u5BA1\u9605\u7248\u672C r{{revision}}",
  "task.deliveryState": "\u4EA4\u4ED8\uFF1A{{state}}",
  "state.defining": "\u5F85\u786E\u8BA4\u8981\u6C42",
  "state.ready": "\u5DF2\u786E\u5B9A",
  "state.executing": "AI \u6267\u884C\u4E2D",
  "state.awaitingAcceptance": "\u5F85\u6211\u9A8C\u6536",
  "state.changesRequested": "\u9700\u4FEE\u6539",
  "state.accepted": "\u9A8C\u6536\u901A\u8FC7",
  "state.cancelled": "\u5DF2\u53D6\u6D88",
  "state.manualExecuting": "\u6267\u884C\u4E2D",
  "runtime.queued": "\u7B49\u5F85\u6267\u884C",
  "runtime.running": "\u6B63\u5728\u6267\u884C",
  "runtime.waitingApproval": "\u7B49\u5F85\u5BA1\u6279",
  "runtime.waitingInput": "\u7B49\u5F85\u8F93\u5165",
  "runtime.interrupted": "\u5DF2\u4E2D\u65AD",
  "runtime.failed": "\u6267\u884C\u5931\u8D25",
  "runtime.pendingConfirmation": "\u5F85\u786E\u5B9A",
  "runtime.turnEnded": "\u672C\u8F6E\u5DF2\u7ED3\u675F",
  "runtime.unknown": "\u72B6\u6001\u672A\u786E\u8BA4",
  "runtime.planningQueued": "\u7B49\u5F85\u89C4\u5212",
  "runtime.planningRunning": "\u6B63\u5728\u89C4\u5212",
  "runtime.planningApproval": "\u89C4\u5212\u7B49\u5F85\u5BA1\u6279",
  "runtime.planningInput": "\u89C4\u5212\u7B49\u5F85\u8F93\u5165",
  "runtime.planningInterrupted": "\u89C4\u5212\u5DF2\u4E2D\u65AD",
  "runtime.planningFailed": "\u89C4\u5212\u5931\u8D25",
  "schedule.title": "\u6392\u671F\u4E0E\u4EFB\u52A1\u5F52\u5C5E",
  "schedule.start": "\u8BA1\u5212\u5F00\u59CB",
  "schedule.end": "\u8BA1\u5212\u7ED3\u675F",
  "schedule.scheduled": "\u5DF2\u6392\u671F",
  "schedule.unscheduled": "\u672A\u6392\u671F",
  "schedule.saved": "\u6392\u671F\u5DF2\u4FDD\u5B58",
  "schedule.reminder": "\u63D0\u9192",
  "time.seconds": "{{value}} \u79D2",
  "time.seconds_other": "{{value}} \u79D2",
  "time.minutes": "{{value}} \u5206\u949F",
  "time.minutes_other": "{{value}} \u5206\u949F",
  "time.hours": "{{value}} \u5C0F\u65F6",
  "time.hours_other": "{{value}} \u5C0F\u65F6",
  "time.today": "\u4ECA\u5929",
  "time.now": "\u73B0\u5728",
  "time.label": "\u65F6\u95F4",
  "time.field": "{{label}}\u65F6\u95F4",
  "time.selectDate": "\u9009\u62E9\u65E5\u671F",
  "time.selectDateTime": "\u9009\u62E9\u65E5\u671F\u548C\u65F6\u95F4",
  "time.clear": "\u6E05\u9664",
  "timeline.mode": "\u4F1A\u8BDD\u8BB0\u5F55",
  "timeline.window": "\u8BA1\u5212\u7A97\u53E3\uFF1A{{count, number}} \u9879",
  "timeline.window_other": "\u8BA1\u5212\u7A97\u53E3\uFF1A{{count, number}} \u9879",
  "timeline.backward": "\u4E0A\u4E00\u6BB5",
  "timeline.forward": "\u4E0B\u4E00\u6BB5",
  "timeline.outsideWindow": "\u5F53\u524D\u8303\u56F4\u5916\u8FD8\u6709 {{before}} \u9879\u66F4\u65E9\u3001{{after}} \u9879\u66F4\u665A\u7684\u4EFB\u52A1",
  "timeline.earlierTasks": "\u66F4\u65E9\uFF08{{count}}\uFF09",
  "timeline.laterTasks": "\u66F4\u665A\uFF08{{count}}\uFF09",
  "timeline.granularity": "\u7518\u7279\u56FE\u65F6\u95F4\u7C92\u5EA6",
  "timeline.day": "\u65E5",
  "timeline.week": "\u5468",
  "timeline.month": "\u6708",
  "timeline.taskProject": "\u4EFB\u52A1 / \u9879\u76EE",
  "timeline.axis": "\u7518\u7279\u56FE\u65F6\u95F4\u8F74\uFF0C\u53EF\u6C34\u5E73\u6EDA\u52A8",
  "timeline.range": "{{title}}\uFF1A{{value}} \u81F3 {{value2}}",
  "timeline.locked": "{{state}}\uFF0C\u6392\u671F\u5DF2\u9501\u5B9A\uFF1B\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5\u3002",
  "timeline.empty": "\u6682\u65E0\u5DF2\u6392\u671F\u4EFB\u52A1\uFF0C\u53EF\u4ECE\u4E0B\u65B9\u62D6\u5165\u4EFB\u52A1\u3002",
  "timeline.allScheduled": "\u6240\u6709\u6D3B\u52A8\u4EFB\u52A1\u5747\u5DF2\u6392\u671F\u3002",
  "timeline.returnHint": "\u5C06\u4EFB\u52A1\u6761\u62D6\u56DE\u8FD9\u91CC\u53EF\u53D6\u6D88\u6392\u671F\uFF0C\u4FDD\u7559\u4EFB\u52A1\u3002",
  "timeline.dropHint": "\u62D6\u5230\u65E5\u671F\u5217\u7684\u524D\u534A\u683C\u6216\u540E\u534A\u683C\uFF0C\u9ED8\u8BA4\u5B89\u6392\u4E00\u5929\u3002",
  "timeline.controls": "\u79FB\u52A8\u548C\u62C9\u4F38\u5747\u6309\u534A\u5929\uFF0812 \u5C0F\u65F6\uFF09\u5438\u9644\uFF1B\u6574\u5F20\u672A\u6392\u671F\u5361\u7247\u53EF\u62D6\u5165\u65E5\u671F\u5217\uFF0C\u4EFB\u52A1\u6761\u53EF\u62D6\u56DE\u672A\u6392\u671F\u533A\u3002\u5F85\u9A8C\u6536\u3001\u5DF2\u9A8C\u6536\u4EFB\u52A1\u4E0D\u53EF\u8C03\u6574\u3002\u952E\u76D8 \u2190 \u2192 \u79FB\u52A8\u534A\u5929\uFF0CShift \u8C03\u6574\u7ED3\u675F\u3002",
  "focus.start": "\u5F00\u59CB\u4E13\u6CE8",
  "focus.pause": "\u6682\u505C\u4E13\u6CE8",
  "focus.resume": "\u7EE7\u7EED\u4E13\u6CE8",
  "focus.end": "\u7ED3\u675F\u5E76\u8BB0\u5F55",
  "focus.prepare": "\u51C6\u5907\u4E13\u6CE8",
  "focus.addTask": "\u6DFB\u52A0\u4E00\u9879\u4EFB\u52A1\u5F00\u59CB",
  "focus.running": "\u4E13\u6CE8\u4E2D",
  "focus.paused": "\u4E13\u6CE8\u5DF2\u6682\u505C",
  "focus.missingTask": "\u539F\u4E13\u6CE8\u4EFB\u52A1\u5DF2\u79FB\u9664",
  "focus.duration": "\u672C\u8F6E\u5DF2\u4E13\u6CE8 {{duration}}",
  "focus.task": "\u4E13\u6CE8\u4EFB\u52A1",
  "focus.stats": "\u4E13\u6CE8\u7EDF\u8BA1",
  "focus.statsDate": "\u7EDF\u8BA1\u65E5\u671F",
  "focus.todayTime": "\u4ECA\u65E5\u6295\u5165",
  "focus.dateTime": "\u9009\u5B9A\u65E5\u671F\u6295\u5165",
  "focus.totalTime": "\u7D2F\u8BA1\u6295\u5165",
  "focus.recordCount": "\u5DF2\u4FDD\u5B58\u4E13\u6CE8\u8BB0\u5F55",
  "focus.details": "\u67E5\u770B\u4E13\u6CE8\u660E\u7EC6",
  "focus.selectTask": "\u9009\u62E9\u4EFB\u52A1",
  "focus.timeSpent": "\u6295\u5165\u65F6\u95F4",
  "focus.noRecords": "\u9009\u5B9A\u65E5\u671F\u6682\u65E0\u65F6\u95F4\u8BB0\u5F55\u3002",
  "focus.byProject": "\u6309\u9879\u76EE\u7D2F\u8BA1",
  "focus.recentRecords": "\u6700\u8FD1\u8BB0\u5F55",
  "focus.wallClockHint": "\u5173\u95ED\u9762\u677F\u4E0D\u4F1A\u505C\u6B62\u8BA1\u65F6\u3002\u8BBE\u5907\u4F11\u7720\u6216\u670D\u52A1\u9000\u51FA\u671F\u95F4\uFF0C\u8FD0\u884C\u4E2D\u7684\u8BA1\u65F6\u4ECD\u6309\u5899\u949F\u7D2F\u8BA1\uFF1B\u79BB\u5F00\u524D\u8BF7\u6682\u505C\u3002",
  "focus.active": "\u5F53\u524D\u4E13\u6CE8",
  "focus.taskPaused": "\u4E13\u6CE8\u6682\u505C\u4E2D",
  "focus.taskAction": "\u4E13\u6CE8\u6B64\u4EFB\u52A1",
  "focus.barRunning": "\u6B63\u5728\u4E13\u6CE8",
  "focus.barPaused": "\u5DF2\u6682\u505C",
  "focus.barPause": "\u6682\u505C",
  "focus.barResume": "\u7EE7\u7EED",
  "today.label": "\u4ECA\u65E5",
  "today.tasks": "\u4ECA\u65E5\u4EFB\u52A1",
  "today.progress": "\u4ECA\u65E5\u8FDB\u5EA6",
  "today.added": "\u4EFB\u52A1\u5DF2\u52A0\u5165\u4ECA\u5929",
  "today.splitAdded": "\u5DF2\u62C6\u6210 {{count, number}} \u9879\u4ECA\u65E5\u4EFB\u52A1",
  "today.capturePlaceholder": "\u8F93\u5165\u4EFB\u52A1\uFF0C\u56DE\u8F66\u52A0\u5165\u4ECA\u5929",
  "today.addTask": "\u6DFB\u52A0\u4ECA\u65E5\u4EFB\u52A1",
  "today.addTaskShortcut": "\u6DFB\u52A0\u4ECA\u65E5\u4EFB\u52A1\uFF08\u21B5\uFF09",
  "today.fullDefinition": "\u586B\u5199\u5B8C\u6574\u4EFB\u52A1",
  "today.draftImproved": "\u4EFB\u52A1\u8349\u7A3F\u5DF2\u7531 AI \u5B8C\u5584",
  "today.suggestSplit": "\u8FD9\u9879\u4EFB\u52A1\u503C\u5F97\u62C6\u5F00",
  "today.reviewDraft": "\u53EF\u4EE5\u67E5\u770B\u8BF4\u660E\u4E0E\u9A8C\u6536\u6807\u51C6\uFF0C\u518D\u52A0\u5165\u4ECA\u5929\u3002",
  "today.viewDefinition": "\u67E5\u770B\u4EFB\u52A1\u8BF4\u660E\u4E0E\u9A8C\u6536\u6807\u51C6",
  "today.keepSingle": "\u4FDD\u7559\u5355\u9879",
  "today.splitCount": "\u62C6\u6210 {{count, number}} \u9879",
  "today.awaitingCount": "{{value}} \u5F85\u6211\u9A8C\u6536 \xB7 ",
  "today.incompleteCount": "{{count, number}} \u672A\u5B8C\u6210",
  "today.notPlanned": "\u4ECA\u5929\u8FD8\u6CA1\u5B89\u6392\u4EFB\u52A1",
  "today.noTasks": "\u4ECA\u5929\u8FD8\u6CA1\u6709\u5F85\u6267\u884C\u4EFB\u52A1",
  "today.poolCount": "\u5F85\u529E\u6C60\u8FD8\u6709 {{count, number}} \u9879\u672A\u5B8C\u6210\u4EFB\u52A1",
  "today.poolCount_other": "\u5F85\u529E\u6C60\u8FD8\u6709 {{count, number}} \u9879\u672A\u5B8C\u6210\u4EFB\u52A1",
  "today.poolHint": "\u5F85\u529E\u6C60\u8FD8\u6709 {{count, number}} \u9879\u672A\u5B8C\u6210\u4EFB\u52A1\uFF0C\u9009\u597D\u540E\u5373\u53EF\u5F00\u59CB\u3002",
  "today.poolHint_other": "\u5F85\u529E\u6C60\u8FD8\u6709 {{count, number}} \u9879\u672A\u5B8C\u6210\u4EFB\u52A1\uFF0C\u9009\u597D\u540E\u5373\u53EF\u5F00\u59CB\u3002",
  "today.inboxHint": "\u6536\u4EF6\u7BB1\u91CC\u5DF2\u6709\u60F3\u6CD5\uFF0C\u6574\u7406\u5E76\u786E\u8BA4\u540E\u518D\u52A0\u5165\u4ECA\u5929\u3002",
  "today.addHint": "\u76F4\u63A5\u5728\u4E0A\u65B9\u6DFB\u52A0\u4EFB\u52A1\uFF0C\u4FDD\u5B58\u540E\u4F1A\u81EA\u52A8\u52A0\u5165\u4ECA\u5929\u3002",
  "today.acceptedCount": "\u4ECA\u65E5\u5DF2\u9A8C\u6536 {{count, number}}",
  "today.cancelledCount": " \xB7 \u5DF2\u53D6\u6D88 {{value}}",
  "today.chooseTasks": "\u9009\u62E9\u4EFB\u52A1\u52A0\u5165\u4ECA\u5929",
  "today.arrange": "\u5B89\u6392\u4ECA\u5929",
  "today.adjust": "\u8C03\u6574\u4ECA\u65E5\u4EFB\u52A1\u4E0E\u5907\u6CE8",
  "today.arrangeAction": "\u5B89\u6392",
  "today.saved": "\u4ECA\u65E5\u5B89\u6392\u5DF2\u4FDD\u5B58",
  "today.dateHint": "{{date}} \xB7 \u52FE\u9009\u4EFB\u52A1\u52A0\u5165\u4ECA\u5929",
  "today.fromBacklog": "\u4ECE\u5F85\u529E\u6C60\u5B89\u6392\u4ECA\u5929",
  "today.selectionHint": "\u52FE\u9009\u52A0\u5165\u4ECA\u65E5\uFF1B\u53D6\u6D88\u52FE\u9009\u53EA\u4ECE\u4ECA\u65E5\u79FB\u9664\uFF0C\u4EFB\u52A1\u4ECD\u4FDD\u7559\u5728\u5F85\u529E\u6C60\u3002",
  "today.createHint": "\u586B\u5199\u5B9A\u4E49\uFF0C\u4FDD\u5B58\u540E\u52A0\u5165\u4ECA\u5929",
  "today.inboxCount": "\u6536\u4EF6\u7BB1 {{count, number}}",
  "today.chooseIdeas": "\u6311\u9009\u60F3\u6CD5\uFF0C\u6574\u7406\u540E\u52A0\u5165\u4ECA\u5929",
  "today.backlog": "\u5F85\u529E\u6C60",
  "today.selectedCount": "\u5DF2\u9009 {{selected, number}} / {{count, number}} \u9879",
  "today.clearIncomplete": "\u6E05\u7A7A\u672A\u5B8C\u6210",
  "today.selectAll": "\u5168\u90E8\u52A0\u5165",
  "today.noIncomplete": "\u6682\u65F6\u6CA1\u6709\u672A\u5B8C\u6210\u4EFB\u52A1\u3002",
  "today.finishedCount": "\u4ECA\u65E5\u5DF2\u7ED3\u675F {{count, number}}",
  "today.historyCount": "\u5386\u53F2\u5DF2\u9A8C\u6536 {{count, number}}",
  "today.note": "\u4ECA\u65E5\u5907\u6CE8",
  "today.totalCount": "\u4ECA\u65E5\u5171 {{count, number}} \u9879",
  "today.totalCount_other": "\u4ECA\u65E5\u5171 {{count, number}} \u9879",
  "today.save": "\u4FDD\u5B58\u4ECA\u65E5\u5B89\u6392",
  "today.remove": "\u4ECE\u4ECA\u65E5\u79FB\u9664",
  "today.add": "\u52A0\u5165\u4ECA\u65E5",
  "today.included": "\u5DF2\u52A0\u5165\u4ECA\u65E5",
  "today.accepted": "\u5DF2\u9A8C\u6536",
  "today.notIncluded": "\u672A\u52A0\u5165",
  "plan.includedTasks": "\u5305\u542B\u4EFB\u52A1",
  "plan.selectedCount": "\u5DF2\u9009 {{count, number}} \u9879",
  "plan.noTasks": "\u5148\u521B\u5EFA\u4EFB\u52A1\uFF0C\u518D\u52A0\u5165\u8BA1\u5212\u3002",
  "plan.date": "\u8BA1\u5212\u65E5\u671F",
  "plan.edit": "\u7F16\u8F91\u8BA1\u5212",
  "plan.description": "\u6309\u65E5\u671F\u5B89\u6392\u5DF2\u6709\u4EFB\u52A1\uFF0C\u53EF\u67E5\u770B\u548C\u7F16\u8F91\u4E0D\u540C\u65E5\u671F\u7684\u4EFB\u52A1\u6E05\u5355\uFF1B\u5F53\u5929\u5B89\u6392\u4F1A\u663E\u793A\u5728\u9996\u9875\u3002",
  "plan.emptyTasks": "\u5C1A\u672A\u9009\u62E9\u4EFB\u52A1\u3002",
  "plan.emptyTitle": "\u8BA9\u4ECA\u5929\u6709\u4E00\u4E2A\u660E\u786E\u8BA1\u5212",
  "plan.emptyHint": "\u9009\u62E9\u73B0\u6709\u4EFB\u52A1\uFF0C\u6DFB\u52A0\u65E5\u671F\u548C\u5907\u6CE8\u3002\u8BA1\u5212\u4E0D\u4F1A\u590D\u5236\u4EFB\u52A1\u3002",
  "inbox.saved": "\u5DF2\u8BB0\u5165\u6536\u4EF6\u7BB1\uFF0C\u4E0D\u8BA1\u5165\u5F85\u529E\u548C\u903E\u671F",
  "inbox.promoted": "\u5DF2\u4ECE\u6536\u4EF6\u7BB1\u8F6C\u4E3A\u4EFB\u52A1",
  "inbox.promotedToday": "\u5DF2\u8F6C\u4E3A\u4EFB\u52A1\u5E76\u52A0\u5165\u4ECA\u5929",
  "inbox.archived": "\u5DF2\u5F52\u6863\uFF0C\u53EF\u5728\u6536\u4EF6\u7BB1\u5E95\u90E8\u6062\u590D",
  "inbox.restored": "\u5DF2\u6062\u590D\u5230\u6536\u4EF6\u7BB1",
  "inbox.capture": "\u5B58\u5165\u6536\u4EF6\u7BB1",
  "inbox.captureShortcut": "\u5B58\u5165\u6536\u4EF6\u7BB1\uFF08\u2325/Alt+\u21B5\uFF09",
  "inbox.original": "\u6536\u4EF6\u7BB1\u539F\u59CB\u60F3\u6CD5",
  "inbox.kicker": "\u5148\u6355\u83B7\uFF0C\u540E\u6574\u7406",
  "inbox.pendingCount": "{{count, number}} \u6761\u60F3\u6CD5\u7B49\u4F60\u51B3\u5B9A\uFF0C\u4E0D\u8BA1\u5165\u5F85\u529E\u548C\u903E\u671F\u3002",
  "inbox.pendingCount_other": "{{count, number}} \u6761\u60F3\u6CD5\u7B49\u4F60\u51B3\u5B9A\uFF0C\u4E0D\u8BA1\u5165\u5F85\u529E\u548C\u903E\u671F\u3002",
  "inbox.intro": "\u60F3\u5230\u4EC0\u4E48\u5C31\u5148\u653E\u8FDB\u6765\uFF0C\u4E0D\u9700\u8981\u9A6C\u4E0A\u60F3\u6E05\u695A\u3002",
  "inbox.placeholder": "\u60F3\u5230\u4EC0\u4E48\u5148\u8BB0\u4E0B\u6765\uFF0C\u56DE\u8F66\u4FDD\u5B58",
  "inbox.captureLabel": "\u8BB0\u5F55\u6536\u4EF6\u7BB1\u60F3\u6CD5",
  "inbox.save": "\u8BB0\u4E0B",
  "inbox.emptyTitle": "\u6536\u4EF6\u7BB1\u5DF2\u7ECF\u6E05\u7A7A",
  "inbox.emptyHint": "\u6709\u65B0\u60F3\u6CD5\u65F6\uFF0C\u5728\u4E0A\u65B9\u8F93\u5165\u5E76\u56DE\u8F66\u8BB0\u4E0B\u3002",
  "inbox.search": "\u641C\u7D22\u60F3\u6CD5",
  "inbox.searchLabel": "\u641C\u7D22\u6536\u4EF6\u7BB1",
  "inbox.clearSearch": "\u6E05\u9664\u641C\u7D22",
  "inbox.filterLabel": "\u7B5B\u9009\u6536\u4EF6\u7BB1",
  "inbox.unorganized": "\u5F85\u6574\u7406",
  "inbox.organized": "\u5DF2\u6574\u7406",
  "inbox.noMatches": "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u60F3\u6CD5",
  "inbox.filterHint": "\u6362\u4E00\u4E2A\u7B5B\u9009\u6761\u4EF6\uFF0C\u6216\u6E05\u9664\u641C\u7D22\u5185\u5BB9\u3002",
  "inbox.aiDraft": "AI \u6574\u7406\u7A3F",
  "inbox.preserveOriginal": "\u539F\u59CB\u60F3\u6CD5\u4F1A\u4FDD\u7559\uFF0C\u786E\u8BA4\u540E\u53EA\u6539\u53D8\u4EFB\u52A1\u5C55\u793A\u5185\u5BB9\u3002",
  "inbox.organizing": "\u6574\u7406\u4E2D",
  "inbox.reorganize": "\u91CD\u65B0\u6574\u7406",
  "inbox.aiOrganize": "AI \u6574\u7406",
  "inbox.promote": "\u8F6C\u4E3A\u4EFB\u52A1",
  "inbox.addToday": "\u52A0\u5165\u4ECA\u5929",
  "inbox.define": "\u5B8C\u5584\u4EFB\u52A1\u5B9A\u4E49",
  "inbox.archiveNamed": "\u5F52\u6863 {{title}}",
  "inbox.archive": "\u5F52\u6863",
  "inbox.collapseArchived": "\u6536\u8D77\u5DF2\u5F52\u6863",
  "inbox.archivedCount": "\u67E5\u770B\u5DF2\u5F52\u6863 {{count, number}}",
  "ai.improve": "AI \u5B8C\u5584\u4EFB\u52A1",
  "ai.improving": "AI \u6B63\u5728\u5B8C\u5584\u4EFB\u52A1",
  "ai.draftReady": "AI \u5DF2\u5B8C\u5584\u8349\u7A3F\uFF0C\u8BF7\u786E\u8BA4\u540E\u4FDD\u5B58",
  "ai.improveTitle": "AI \u5B8C\u5584\u6807\u9898\u4E0E\u4EFB\u52A1\u5B9A\u4E49",
  "ai.optimizeField": "AI \u4F18\u5316{{label}}",
  "ai.generatingField": "\u6B63\u5728\u751F\u6210{{label}}\u5EFA\u8BAE",
  "ai.generating": "\u751F\u6210\u4E2D\u2026",
  "ai.titleHint": "\u6839\u636E\u5F53\u524D\u5185\u5BB9\u5B8C\u5584\u6807\u9898\u3001\u4EFB\u52A1\u8BF4\u660E\u548C\u9A8C\u6536\u6807\u51C6",
  "ai.fieldHint": "\u7ED3\u5408\u5F53\u524D\u6807\u9898\u3001\u8BF4\u660E\u548C\u9A8C\u6536\u6807\u51C6\u4F18\u5316{{label}}",
  "ai.definitionHint": "AI \u6839\u636E\u5F53\u524D\u586B\u5199\u7684\u5185\u5BB9\u751F\u6210\u5EFA\u8BAE\uFF0C\u5E94\u7528\u540E\u518D\u4FDD\u5B58\u3002",
  "ai.preview": "AI \u4F18\u5316\u9884\u89C8",
  "ai.suggestions": "AI \u4F18\u5316\u5EFA\u8BAE",
  "ai.confirmHint": "\u786E\u8BA4\u524D\u4E0D\u4F1A\u4FEE\u6539\u5F53\u524D\u5185\u5BB9\u3002",
  "ai.skip": "\u6682\u4E0D\u91C7\u7528",
  "ai.apply": "\u5E94\u7528\u4F18\u5316",
  "ai.waiting": "\u7B49\u5F85 AI \u5EFA\u8BAE\u2026",
  "ai.linkTitle": "AI \u4F1A\u8BDD\u5173\u8054",
  "ai.unlinked": "\u5C1A\u672A\u5173\u8054",
  "ai.taskId": "\u4EFB\u52A1 ID\uFF1A{{id}}",
  "ai.trustedSession": "\u53EF\u4FE1 AI \u4F1A\u8BDD",
  "ai.unlink": "\u4E0D\u5173\u8054",
  "ai.saveLink": "\u4FDD\u5B58\u5173\u8054",
  "ai.linkSaved": "\u5173\u8054\u5DF2\u4FDD\u5B58",
  "ai.linkHint": "\u53EF\u5173\u8054 Codex \u5B98\u65B9\u63A5\u53E3\u540C\u6B65\u6216\u53EF\u4FE1 hooks \u89C2\u5BDF\u5230\u7684\u4F1A\u8BDD\u3002\u540C\u6B65\u76EE\u5F55\u4E0D\u4EE3\u8868 AI \u6B63\u5728\u8FD0\u884C\u3002",
  "ai.generatePrompt": "\u751F\u6210\u6267\u884C\u6307\u4EE4",
  "prompt.title": "\u4EA4\u7ED9 Codex \u6267\u884C",
  "prompt.deliveryHint": "\u53D1\u9001\u6307\u4EE4\u4E0D\u4EE3\u8868\u4EFB\u52A1\u5DF2\u7ECF\u8FD0\u884C\u6216\u4EA4\u4ED8\u3002",
  "prompt.identityHint": "\u6307\u4EE4\u5305\u542B\u539F\u4EFB\u52A1 ID \u548C\u53EF\u4FE1\u4F1A\u8BDD\u6838\u5BF9\u8981\u6C42\u3002",
  "prompt.label": "\u6267\u884C\u6307\u4EE4",
  "prompt.copy": "\u590D\u5236\u6307\u4EE4",
  "prompt.copied": "\u6267\u884C\u6307\u4EE4\u5DF2\u590D\u5236",
  "prompt.send": "\u53D1\u9001\u5230\u5F53\u524D\u5BF9\u8BDD",
  "prompt.sent": "\u6267\u884C\u6307\u4EE4\u5DF2\u4EA4\u7ED9\u5F53\u524D\u5BF9\u8BDD",
  "history.title": "\u4EFB\u52A1\u5386\u53F2",
  "history.updated": "\u4FEE\u6539\u4EFB\u52A1",
  "history.transition": "\u63A8\u8FDB\u5230 {{value}}",
  "history.bound": "\u5173\u8054\u53EF\u4FE1\u4F1A\u8BDD",
  "history.submitted": "\u63D0\u4EA4\u4EA4\u4ED8\u8BC1\u636E",
  "history.accepted": "\u4EBA\u5DE5\u9A8C\u6536\u901A\u8FC7",
  "history.rejected": "\u4EBA\u5DE5\u9000\u56DE\u4FEE\u6539",
  "history.focus": "\u8BB0\u5F55\u4E13\u6CE8 {{value}}",
  "history.reviewed": " \xB7 \u5BA1\u9605 r{{revision}}",
  "delivery.summary": "\u4EA4\u4ED8\u6458\u8981",
  "delivery.evidence": "\u4EA4\u4ED8\u8BC1\u636E",
  "delivery.evidenceLabel": "\u8BC1\u636E\u540D\u79F0",
  "delivery.evidenceUri": "\u8BC1\u636E URL \u6216\u672C\u5730\u7EDD\u5BF9\u8DEF\u5F84",
  "delivery.evidenceNote": "\u8BC1\u636E\u8BF4\u660E\uFF08\u9A8C\u8BC1\u547D\u4EE4\u4E0E\u5B9E\u9645\u7ED3\u679C\uFF09",
  "delivery.confirm": "\u6211\u63D0\u4EA4\u7684\u662F\u5B9E\u9645\u4EA4\u4ED8\u8BC1\u636E",
  "delivery.hint": "\u63D0\u4EA4\u540E\u8FDB\u5165\u5F85\u9A8C\u6536\u3002\u6587\u4EF6\u8DEF\u5F84\u4F9B\u4EBA\u5DE5\u67E5\u9605\uFF0C\u670D\u52A1\u4E0D\u4F1A\u8BFB\u53D6\u6216\u6267\u884C\u6587\u4EF6\u3002\u66F4\u591A\u8BC1\u636E\u53EF\u901A\u8FC7 MCP \u4E00\u6B21\u63D0\u4EA4\u3002",
  "delivery.submitAcceptance": "\u63D0\u4EA4\u9A8C\u6536",
  "delivery.submit": "\u63D0\u4EA4\u4EA4\u4ED8",
  "delivery.title": "\u63D0\u4EA4\u771F\u5B9E\u4EA4\u4ED8",
  "delivery.revision": "\u63D0\u4EA4\u57FA\u4E8E\u5B9E\u9645\u5BA1\u9605 r{{revision}}",
  "delivery.submitted": "\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u5BA1\u9605",
  "delivery.submittedAt": "\u63D0\u4EA4\u4E8E {{at}}",
  "review.title": "\u4EBA\u5DE5\u5BA1\u9605\u4EA4\u4ED8",
  "review.intro": "\u6B63\u5728\u5BA1\u9605\u300C{{title}}\u300D\u7684 r{{revision}}\u3002\u8BF7\u5148\u68C0\u67E5\u9A8C\u6536\u6807\u51C6\u4E0E\u8BC1\u636E\uFF0C\u518D\u786E\u8BA4\u51B3\u5B9A\u3002",
  "review.reviewer": "\u5BA1\u9605\u4EBA",
  "review.decision": "\u5BA1\u9605\u51B3\u5B9A",
  "review.accept": "\u9A8C\u6536\u901A\u8FC7",
  "review.reject": "\u9000\u56DE\u4FEE\u6539",
  "review.note": "\u5BA1\u9605\u8BF4\u660E\uFF08\u9000\u56DE\u65F6\u5FC5\u586B\uFF09",
  "review.confirm": "\u6211\u5DF2\u68C0\u67E5\u6B64\u7248\u672C\u7684\u4EA4\u4ED8\u8BC1\u636E\uFF0C\u5E76\u660E\u786E\u786E\u8BA4\u4E0A\u8FF0\u51B3\u5B9A",
  "review.record": "\u8BB0\u5F55\u4EBA\u5DE5\u51B3\u5B9A",
  "review.recorded": "\u5DF2\u8BB0\u5F55\u4EBA\u5DE5\u51B3\u5B9A",
  "review.revisionHint": "\u5B9E\u9645\u5BA1\u9605\u7248\u672C r{{revision}} \xB7 \u82E5\u4EFB\u52A1\u6539\u53D8\uFF0C\u6B64\u786E\u8BA4\u4F1A\u88AB\u62D2\u7EDD",
  "review.action": "\u5BA1\u9605\u4EA4\u4ED8",
  "review.acceptOrReject": "\u5BA1\u9605\u5E76\u9A8C\u6536 / \u9000\u56DE",
  "review.latest": "\u6700\u8FD1\u4EBA\u5DE5\u5BA1\u9605",
  "review.actualRevision": " \xB7 \u5B9E\u9645\u5BA1\u9605 r{{revision}}",
  "delete.title": "\u786E\u8BA4\u5220\u9664",
  "delete.hint": "\u53EA\u6709\u672A\u6267\u884C\u4E14\u6CA1\u6709\u5F15\u7528\u548C\u65F6\u95F4\u8BB0\u5F55\u7684\u6570\u636E\u53EF\u4EE5\u5220\u9664\u3002\u5DF2\u6709\u6267\u884C\u8BB0\u5F55\u7684\u4EFB\u52A1\u8BF7\u53D6\u6D88\u3002",
  "settings.language": "\u8BED\u8A00",
  "settings.followSystem": "\u8DDF\u968F\u7CFB\u7EDF",
  "settings.languageHint": "\u81EA\u52A8\u6A21\u5F0F\u4F18\u5148\u8DDF\u968F Codex \u5BBF\u4E3B\u8BED\u8A00\uFF0C\u5176\u6B21\u8DDF\u968F\u6D4F\u89C8\u5668\u8BED\u8A00\u3002",
  "settings.languageStorageFailed": "\u65E0\u6CD5\u4FDD\u5B58\u8BED\u8A00\u504F\u597D\uFF0C\u5237\u65B0\u540E\u5C06\u6062\u590D\u81EA\u52A8\u9009\u62E9\u3002",
  "settings.reminders": "\u63D0\u9192\u8BBE\u7F6E",
  "settings.editReminders": "\u7F16\u8F91\u63D0\u9192\u8BBE\u7F6E",
  "settings.enableReminders": "\u5F00\u542F\u4EFB\u52A1\u63D0\u9192",
  "settings.followUp": "\u6267\u884C\u4E2D\u4EFB\u52A1\u8DDF\u8FDB\u95F4\u9694\uFF08\u5206\u949F\uFF0C0 \u5173\u95ED\uFF09",
  "settings.reviewTime": "\u6BCF\u65E5\u590D\u76D8\u65F6\u95F4\uFF08\u7559\u7A7A\u5173\u95ED\uFF09",
  "settings.timezone": "\u65F6\u533A",
  "settings.reminderLabel": "\u4EFB\u52A1\u63D0\u9192\uFF1A",
  "settings.followUpLabel": "\u8FDB\u5EA6\u8DDF\u8FDB\uFF1A",
  "settings.followUpMinutes": "\u6BCF {{followUpMinutes, number}} \u5206\u949F",
  "settings.reviewLabel": "\u6BCF\u65E5\u590D\u76D8\uFF1A",
  "settings.timezoneLabel": "\u65F6\u533A\uFF1A",
  "settings.allowNotifications": "\u5141\u8BB8\u6D4F\u89C8\u5668\u901A\u77E5",
  "settings.notificationsUnsupported": "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u7CFB\u7EDF\u901A\u77E5\uFF0C\u63D0\u9192\u4ECD\u4FDD\u5B58\u5728\u63D0\u9192\u8BB0\u5F55\u3002",
  "settings.notificationsAllowed": "\u5DF2\u5141\u8BB8\u9875\u9762\u6253\u5F00\u65F6\u663E\u793A\u6D4F\u89C8\u5668\u901A\u77E5",
  "settings.notificationsDenied": "\u901A\u77E5\u672A\u542F\u7528\uFF0C\u63D0\u9192\u4ECD\u4FDD\u5B58\u5728\u63D0\u9192\u8BB0\u5F55",
  "settings.schedulerHint": "\u672C\u5730\u670D\u52A1\u6BCF 15 \u79D2\u68C0\u67E5\u5E76\u4FDD\u5B58\u5230\u671F\u63D0\u9192\u3002\u505C\u673A\u6216\u4F11\u7720\u671F\u95F4\u4E0D\u8C03\u5EA6\uFF0C\u6062\u590D\u540E\u8865\u5F53\u524D\u63D0\u9192\u3002\u6D4F\u89C8\u5668\u901A\u77E5\u9700\u8981\u9875\u9762\u6253\u5F00\u53CA\u6743\u9650\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5524\u9192 AI\u3002",
  "notices.title": "\u63D0\u9192\u8BB0\u5F55",
  "notices.unreadCount": "{{count, number}} \u6761\u672A\u8BFB",
  "notices.read": "\u5DF2\u8BFB",
  "notices.viewToday": "\u67E5\u770B\u4ECA\u65E5\u5B89\u6392",
  "notices.empty": "\u76EE\u524D\u6CA1\u6709\u63D0\u9192\u3002",
  "notices.taskReminder": "\u4EFB\u52A1\u63D0\u9192\uFF1A{{title}}",
  "notices.followUp": "\u8FDB\u5EA6\u8DDF\u8FDB\uFF1A{{title}}",
  "notices.dailyReview": "\u6BCF\u65E5\u590D\u76D8\uFF1A\u56DE\u987E\u4EA4\u4ED8\u3001\u4E13\u6CE8\u65F6\u95F4\u4E0E\u660E\u65E5\u8BA1\u5212",
  "okr.objective": "\u6240\u5C5E\u76EE\u6807",
  "okr.unit": "\u8BA1\u91CF\u5355\u4F4D\uFF08\u53EF\u9009\uFF09",
  "okr.unitPlaceholder": "\u4F8B\u5982\uFF1A\u4E2A\u3001\u6B21\u3001%\u3001\u5143",
  "okr.unitHint": "\u7528\u4E8E\u663E\u793A\u8FDB\u5EA6\uFF0C\u4F8B\u5982 20 / 100 \u4E2A\u3002\u767E\u5206\u6BD4\u53EF\u586B %\uFF0C\u8D77\u59CB\u503C\u8BBE\u4E3A 0\uFF0C\u76EE\u6807\u503C\u8BBE\u4E3A 100\u3002",
  "okr.baseline": "\u8D77\u59CB\u503C",
  "okr.target": "\u76EE\u6807\u503C",
  "okr.current": "\u5F53\u524D\u503C",
  "okr.keyResultCount": "{{count, number}} \u4E2A\u5173\u952E\u7ED3\u679C",
  "okr.keyResultCount_other": "{{count, number}} \u4E2A\u5173\u952E\u7ED3\u679C",
  "okr.addKeyResult": "\u6DFB\u52A0\u5173\u952E\u7ED3\u679C",
  "okr.editObjective": "\u7F16\u8F91\u76EE\u6807",
  "okr.expandObjective": "\u5C55\u5F00\u76EE\u6807 {{title}}",
  "okr.collapseObjective": "\u6536\u8D77\u76EE\u6807 {{title}}",
  "okr.updateKeyResult": "\u66F4\u65B0 KR",
  "okr.noKeyResults": "\u5C1A\u672A\u8BBE\u7F6E\u5173\u952E\u7ED3\u679C\u3002",
  "okr.emptyTitle": "\u786E\u5B9A\u4E00\u4E2A\u503C\u5F97\u63A8\u8FDB\u7684\u76EE\u6807",
  "okr.emptyHint": "\u5173\u952E\u7ED3\u679C\u8BB0\u5F55\u5F53\u524D\u503C\u4E0E\u76EE\u6807\u503C\uFF0C\u4EFB\u52A1\u53EF\u4EE5\u5173\u8054\u5230 KR\u3002",
  "errors.notFound": "{{kind}} \u4E0D\u5B58\u5728",
  "errors.staleRevision": "\u6570\u636E\u5DF2\u66F4\u65B0\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u5E76\u5BA1\u9605\u540E\u91CD\u8BD5\u3002",
  "errors.schedulePair": "\u6392\u671F\u5FC5\u987B\u540C\u65F6\u586B\u5199\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4",
  "errors.scheduleOrder": "\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4",
  "errors.krTarget": "KR \u76EE\u6807\u503C\u5FC5\u987B\u4E0E\u8D77\u59CB\u503C\u4E0D\u540C",
  "errors.duplicatePlanTask": "\u8BA1\u5212\u4E2D\u4E0D\u80FD\u91CD\u590D\u6DFB\u52A0\u4EFB\u52A1",
  "errors.taskLocked": "\u8BF7\u5148\u9000\u56DE\u4FEE\u6539\u6216\u91CD\u65B0\u6253\u5F00\u4EFB\u52A1\uFF0C\u518D\u7F16\u8F91\u5185\u5BB9",
  "errors.onlyTaskToday": "\u53EA\u6709\u4EFB\u52A1\u53EF\u4EE5\u52A0\u5165\u4ECA\u65E5\u8BA1\u5212",
  "errors.requestReused": "\u540C\u4E00 requestId \u4E0D\u80FD\u7528\u4E8E\u4E0D\u540C\u521B\u5EFA\u8BF7\u6C42",
  "errors.restoreIdea": "\u8BF7\u5148\u6062\u590D\u5DF2\u5F52\u6863\u7684\u60F3\u6CD5",
  "errors.stalePlan": "\u4ECA\u65E5\u8BA1\u5212\u5DF2\u66F4\u65B0\u3002\u8BF7\u5173\u95ED\u5E76\u91CD\u65B0\u6253\u5F00\u5B89\u6392\u4ECA\u5929\u540E\u91CD\u8BD5\u3002",
  "errors.projectName": "\u9879\u76EE\u540D\u79F0\u7531 Codex \u7EF4\u62A4\uFF0C\u8BF7\u5728 Codex \u4E2D\u4FEE\u6539\u540E\u540C\u6B65\u3002",
  "errors.references": "\u8BF7\u5148\u79FB\u9664\u76F8\u5173\u4EFB\u52A1\u3001KR \u6216\u8BA1\u5212\u5F15\u7528",
  "errors.taskRecords": "\u6709\u6267\u884C\u6216\u8BA1\u65F6\u8BB0\u5F55\u7684\u4EFB\u52A1\u8BF7\u53D6\u6D88\uFF0C\u4FDD\u7559\u5BA1\u8BA1\u8BB0\u5F55",
  "errors.workflowRecords": "\u5DF2\u6709\u5DE5\u4F5C\u6D41\u8BB0\u5F55\u7684\u4EFB\u52A1\u8BF7\u53D6\u6D88\uFF0C\u4FDD\u7559\u5BA1\u8BA1\u8BB0\u5F55",
  "errors.noticeMissing": "\u63D0\u9192\u4E0D\u5B58\u5728",
  "errors.bindState": "\u4EC5\u5B9A\u4E49\u3001\u5C31\u7EEA\u6216\u5F85\u4FEE\u6539\u4EFB\u52A1\u53EF\u7ED1\u5B9A\u4F1A\u8BDD",
  "errors.humanRebind": "\u91CD\u65B0\u7ED1\u5B9A\u5FC5\u987B\u7531\u4EBA\u5728\u754C\u9762\u64CD\u4F5C",
  "errors.trustedSession": "\u8BF7\u5148\u540C\u6B65 Codex \u4F1A\u8BDD\u6216\u542F\u7528\u53EF\u4FE1\u63D2\u4EF6 hooks",
  "errors.sessionBound": "\u8BE5\u4F1A\u8BDD\u5DF2\u7ED1\u5B9A\u4EFB\u52A1\uFF0C\u8BF7\u7EE7\u7EED\u4F7F\u7528\u539F\u4EFB\u52A1",
  "errors.transition": "\u4E0D\u80FD\u4ECE {{from}} \u53D8\u4E3A {{to}}",
  "errors.humanReopen": "\u91CD\u65B0\u6253\u5F00\u5DF2\u9A8C\u6536\u4EFB\u52A1\u5FC5\u987B\u7531\u4EBA\u5728\u754C\u9762\u64CD\u4F5C",
  "errors.bindBeforeExecute": "AI \u6267\u884C\u524D\u5FC5\u987B\u7ED1\u5B9A\u53EF\u4FE1\u4F1A\u8BDD",
  "errors.finishFocus": "\u8BF7\u5148\u7ED3\u675F\u6B64\u4EFB\u52A1\u7684\u4E13\u6CE8\u8BA1\u65F6",
  "errors.submitState": "\u53EA\u6709\u6267\u884C\u4E2D\u7684\u4EFB\u52A1\u53EF\u63D0\u4EA4\u4EA4\u4ED8",
  "errors.evidenceUri": "\u8BC1\u636E\u5FC5\u987B\u662F HTTP(S) URL \u6216\u672C\u5730\u7EDD\u5BF9\u8DEF\u5F84",
  "errors.evidenceCredentials": "\u8BC1\u636E URL \u4E0D\u80FD\u5305\u542B\u51ED\u636E",
  "errors.reviewState": "\u4EC5\u6709\u4EA4\u4ED8\u8BC1\u636E\u7684\u5F85\u9A8C\u6536\u4EFB\u52A1\u53EF\u5BA1\u9605",
  "errors.rejectReason": "\u8BF7\u586B\u5199\u9000\u56DE\u539F\u56E0",
  "errors.sessionMissing": "\u4F1A\u8BDD\u4E0D\u5B58\u5728",
  "errors.staleSession": "\u4F1A\u8BDD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5E76\u91CD\u65B0\u786E\u8BA4\u3002",
  "errors.confirmState": "\u53EA\u6709\u672C\u8F6E\u7ED3\u675F\u6216\u5DF2\u7ED3\u675F\u7684\u4F1A\u8BDD\u53EF\u4EE5\u786E\u8BA4\u5B8C\u6210",
  "errors.taskAcceptance": "\u5DF2\u5173\u8054\u4EFB\u52A1\u7684\u4F1A\u8BDD\u8BF7\u901A\u8FC7\u4EFB\u52A1\u9A8C\u6536\u786E\u8BA4\u5B8C\u6210",
  "errors.finishCurrentFocus": "\u8BF7\u5148\u7ED3\u675F\u5F53\u524D\u4E13\u6CE8",
  "errors.endedTaskFocus": "\u5DF2\u7ED3\u675F\u7684\u4EFB\u52A1\u4E0D\u80FD\u8BA1\u65F6",
  "errors.noFocus": "\u6CA1\u6709\u4E13\u6CE8\u4E2D\u7684\u4EFB\u52A1",
  "errors.resumeFocus": "\u53EA\u6709\u6682\u505C\u4E2D\u7684\u4E13\u6CE8\u53EF\u6062\u590D",
  "errors.pauseFocus": "\u53EA\u6709\u8FD0\u884C\u4E2D\u7684\u4E13\u6CE8\u53EF\u6682\u505C",
  "errors.tooLarge": "\u8BF7\u6C42\u8FC7\u5927",
  "errors.jsonRequired": "\u9700\u8981 JSON \u8BF7\u6C42",
  "errors.loopbackOnly": "\u4EC5\u5141\u8BB8\u672C\u673A\u56DE\u73AF\u5730\u5740",
  "errors.unauthorized": "\u672A\u6388\u6743",
  "errors.routeMissing": "\u672A\u627E\u5230\u8D44\u6E90",
  "errors.crossSite": "\u8DE8\u7AD9\u8BF7\u6C42\u5DF2\u62D2\u7EDD",
  "errors.reopenApp": "\u8BF7\u91CD\u65B0\u6253\u5F00 ai-todos",
  "errors.invalidUiRequest": "\u65E0\u6548\u7684\u754C\u9762\u8BF7\u6C42",
  "errors.deliveryRequired": "\u4EFB\u52A1\u5C1A\u672A\u63D0\u4EA4\u4EA4\u4ED8",
  "errors.expiredReview": "\u5BA1\u9605\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u4EA4\u4ED8\u8BC1\u636E",
  "errors.invalidTimezone": "\u65F6\u533A\u65E0\u6548",
  "errors.projectPath": "\u9879\u76EE\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84",
  "errors.sessionPath": "\u4F1A\u8BDD\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84",
  "errors.codexTimeout": "Codex \u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "errors.codexMissing": "\u627E\u4E0D\u5230 Codex CLI\uFF0C\u8BF7\u5B89\u88C5\u5E76\u767B\u5F55 Codex \u540E\u91CD\u8BD5\u3002",
  "errors.codexStart": "\u65E0\u6CD5\u542F\u52A8 Codex\u3002",
  "errors.codexClosed": "Codex \u8FDE\u63A5\u5DF2\u5173\u95ED\u3002",
  "errors.codexHost": "Codex \u5BBF\u4E3B\u8FDE\u63A5\u4E0D\u53EF\u7528\u3002",
  "errors.codexExit": "Codex \u5DF2\u9000\u51FA\uFF0C\u8BF7\u68C0\u67E5 CLI \u767B\u5F55\u548C\u6A21\u578B\u914D\u7F6E\u3002",
  "errors.codexLarge": "Codex \u54CD\u5E94\u8FC7\u5927\u3002",
  "errors.codexTools": "Codex \u8BF7\u6C42\u4E86\u989D\u5916\u6743\u9650\u6216\u5DE5\u5177\uFF0C\u4EFB\u52A1\u8349\u7A3F\u4FDD\u6301\u539F\u6837\u3002",
  "errors.codexRequest": "{{message}}",
  "errors.newSessionState": "\u5F53\u524D\u4EFB\u52A1\u4E0D\u53EF\u65B0\u5EFA\u4F1A\u8BDD\u3002",
  "errors.archiveFailed": "\u5173\u8054\u672A\u5B8C\u6210\uFF0C\u4E14\u65E0\u6CD5\u5F52\u6863\u65B0\u4F1A\u8BDD {{id}}\uFF1A{{message}}",
  "errors.syncFirst": "\u8BF7\u5148\u540C\u6B65 Codex \u4F1A\u8BDD\u3002",
  "errors.unboundSession": "\u4F1A\u8BDD\u672A\u5173\u8054\u4EFB\u52A1\u3002",
  "errors.openCodex": "\u65E0\u6CD5\u6253\u5F00 Codex\uFF0C\u8BF7\u786E\u8BA4\u684C\u9762\u5E94\u7528\u5DF2\u5B89\u88C5\u3002\u539F\u4F1A\u8BDD\uFF1A{{url}}",
  "errors.projectPagination": "Codex \u9879\u76EE\u5206\u9875\u91CD\u590D\uFF0C\u672A\u540C\u6B65\u4EFB\u4F55\u9879\u76EE\u3002",
  "errors.sessionPagination": "Codex \u4F1A\u8BDD\u5206\u9875\u91CD\u590D\uFF0C\u672A\u540C\u6B65\u4EFB\u4F55\u4F1A\u8BDD\u3002",
  "errors.toolsPagination": "Codex \u5DE5\u5177\u914D\u7F6E\u5206\u9875\u91CD\u590D\uFF0C\u672A\u5F00\u59CB\u751F\u6210\u3002",
  "errors.generationIncomplete": "Codex \u672A\u5B8C\u6210\u751F\u6210\uFF0C\u8349\u7A3F\u4FDD\u6301\u539F\u6837\u3002",
  "errors.invalidSuggestion": "Codex \u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u7684\u4EFB\u52A1\u5EFA\u8BAE\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "errors.serviceStart": "\u672C\u5730\u670D\u52A1\u542F\u52A8\u5931\u8D25\u3002\u8BF7\u67E5\u770B {{path}}\uFF0C\u786E\u8BA4\u7AEF\u53E3 {{origin}} \u672A\u88AB\u5176\u4ED6\u5E94\u7528\u5360\u7528\u3002",
  "prompt.execution": "\u4F7F\u7528 ai-todos \u6267\u884C\u539F\u4EFB\u52A1 {{id}}\u300C{{title}}\u300D\u3002\u5148\u8C03\u7528 ai_todos_task \u9605\u8BFB\u5F53\u524D\u4EFB\u52A1\u4E0E\u9A8C\u6536\u6807\u51C6\uFF0C\u5E76\u4FDD\u7559\u5B9E\u9645\u8BFB\u53D6\u7684 revision\u3002{{binding}}\u6309\u5B9A\u4E49 \u2192 \u5C31\u7EEA \u2192 \u5F00\u59CB\u6267\u884C\u63A8\u8FDB\u3002\u771F\u5B9E\u4EA4\u4ED8\u540E\u7528 submit \u63D0\u4EA4\u6458\u8981\u548C\u5B9E\u9645\u8BC1\u636E\uFF0C\u4E0D\u80FD\u865A\u62A5\u6D4B\u8BD5\u7ED3\u679C\u3002Stop \u53EA\u4EE3\u8868\u672C\u8F6E\u7ED3\u675F\u3002\u8BF7\u63D0\u793A\u7528\u6237\u5728\u672C\u5730\u5E94\u7528\u5BA1\u9605\u8BC1\u636E\uFF0CAI \u4E0D\u5F97\u81EA\u884C\u9A8C\u6536\u3002",
  "prompt.bound": "\u6B64\u4EFB\u52A1\u7ED1\u5B9A Codex sessionId={{sessionId}}\uFF1B\u5FC5\u987B\u4E0E\u672C\u4F1A\u8BDD\u53EF\u4FE1 hook \u63D0\u4F9B\u7684 sessionId \u6838\u5BF9\uFF0C\u4E00\u81F4\u624D\u80FD\u6267\u884C\uFF0C\u4E0D\u4E00\u81F4\u65F6\u505C\u6B62\u5E76\u8BA9\u7528\u6237\u6253\u5F00\u539F\u4F1A\u8BDD\u3002",
  "prompt.unbound": "\u5148\u4ECE\u672C\u4F1A\u8BDD\u53EF\u4FE1 hook \u83B7\u53D6 sessionId\uFF0C\u5E76\u67E5\u8BE2 ai_todos_snapshot \u4E2D\u5DF2\u89C2\u5BDF\u7684\u4F1A\u8BDD\u540E\u7ED1\u5B9A\uFF1B\u4E0D\u5F97\u731C\u6D4B ID\uFF0C\u4E0D\u8981\u91CD\u590D\u5EFA\u4EFB\u52A1\u3002",
  "prompt.description": "\u4EFB\u52A1\u5185\u5BB9\uFF1A\n{{description}}",
  "prompt.criteria": "\u9A8C\u6536\u6807\u51C6\uFF1A\n{{criteria}}",
  "okr.unlink": "\u4E0D\u5173\u8054 KR",
  "common.closeDialog": "\u5173\u95ED\u5BF9\u8BDD\u6846",
  "task.cancelledCount": "\u5DF2\u53D6\u6D88\uFF08{{count, number}}\uFF09",
  "time.calendarNavigation": "\u65E5\u5386\u5BFC\u822A",
  "settings.followUpMinutes_other": "\u6BCF {{followUpMinutes, number}} \u5206\u949F",
  "project.synced_other": "\u5DF2\u540C\u6B65 {{count, number}} \u4E2A Codex \u9879\u76EE\u76EE\u5F55\uFF0C\u65B0\u589E {{added, number}} \u4E2A\uFF0C\u66F4\u65B0 {{updated, number}} \u4E2A\u3002"
};

// src/i18n.ts
var languages = {
  "zh-CN": { name: "\u7B80\u4F53\u4E2D\u6587", translation: zh_CN_default },
  en: { name: "English", translation: en_default }
};
var resources = Object.fromEntries(Object.entries(languages).map(([locale, { translation }]) => [locale, { translation }]));
var i18n = createInstance();
void i18n.init({ resources, lng: "zh-CN", fallbackLng: "en", supportedLngs: Object.keys(languages), load: "currentOnly", keySeparator: false, nsSeparator: false, initAsync: false, interpolation: { escapeValue: false } });

// src/service-client.ts
var runtime;
async function connect() {
  try {
    const candidate = JSON.parse(readFileSync(runtimePath, "utf8"));
    if (candidate.origin !== origin) throw new Error("Port does not match");
    const response = await fetch(`${origin}/internal/ping`, { headers: { authorization: `Bearer ${candidate.token}` }, signal: AbortSignal.timeout(600) });
    if (response.ok) {
      const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(600) }).then((response2) => response2.json());
      if (health.name === "ai-todos" && typeof health.version === "string" && package_default.version.localeCompare(health.version, void 0, { numeric: true }) > 0) {
        const stopped = await fetch(`${origin}/internal/stop`, { method: "POST", headers: { authorization: `Bearer ${candidate.token}` }, signal: AbortSignal.timeout(1e3) });
        if (!stopped.ok) throw new Error("\u65E7\u670D\u52A1\u505C\u6B62\u5931\u8D25");
        return false;
      }
      runtime = candidate;
      return true;
    }
  } catch {
  }
  return false;
}
async function ensureService() {
  if (await connect()) return runtime;
  mkdirSync(dataDir, { recursive: true, mode: 448 });
  const log = openSync(join2(dataDir, "service.log"), "a", 384);
  const child = spawn(process.execPath, [fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../src/server.ts" : "../src/server.js", import.meta.url))], { detached: true, stdio: ["ignore", log, log], env: process.env });
  child.on("error", () => {
  });
  child.unref();
  closeSync(log);
  for (let n = 0; n < 40; n++) {
    await new Promise((resolve2) => setTimeout(resolve2, 100));
    if (await connect()) return runtime;
  }
  const params = { path: join2(dataDir, "service.log"), origin };
  throw Object.assign(new Error(i18n.t("errors.serviceStart", { ...params, lng: "zh-CN" })), { code: "errors.serviceStart", params });
}

// scripts/open.ts
var { origin: origin2 } = await ensureService();
console.log(origin2);
var command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
spawn2(command, [origin2], { stdio: "ignore" }).on("error", () => console.error("Open the URL above in your browser."));
