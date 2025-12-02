var content = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const definition = defineContentScript({
    matches: [
      "*://*.taobao.com/*",
      "*://*.tmall.com/*",
      "*://*.jd.com/*",
      "*://*.amazon.com/*",
      "*://*.amazon.cn/*",
      "*://*.suning.com/*",
      "*://*.pinduoduo.com/*",
      "*://*.vip.com/*",
      "*://*.dangdang.com/*",
      "*://*.yhd.com/*"
    ],
    main() {
      console.log("图片抓取扩展已加载");
      function waitForPageLoad() {
        if (document.readyState === "complete") {
          injectToolbar();
        } else {
          window.addEventListener("load", injectToolbar);
        }
      }
      function injectToolbar() {
        if (document.getElementById("image-extractor-root")) {
          return;
        }
        const root2 = document.createElement("div");
        root2.id = "image-extractor-root";
        document.body.appendChild(root2);
        Promise.resolve().then(() => Toolbar$1).then(({ default: Toolbar2 }) => {
          new Toolbar2({
            target: root2
          });
        }).catch((error) => {
          console.error("加载工具栏失败:", error);
        });
      }
      window.addEventListener("message", (event2) => {
        if (event2.source !== window || !event2.data.type) return;
        switch (event2.data.type) {
          case "IMAGES_EXTRACTED":
            console.log("图片提取完成:", event2.data.images);
            break;
        }
      });
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            const hasRoot = document.getElementById("image-extractor-root");
            if (!hasRoot && isProductPage()) {
              setTimeout(injectToolbar, 1e3);
            }
          }
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      waitForPageLoad();
    }
  });
  function isProductPage() {
    const url = window.location.href;
    const productKeywords = ["item", "product", "goods", "detail"];
    const hasProductKeyword = productKeywords.some(
      (keyword) => url.toLowerCase().includes(keyword)
    );
    const hasProductElements = document.querySelector(
      '.price, .product-price, .goods-price, .product-name, .product-title, [class*="price"], [class*="product"], [data-sku]'
    );
    return hasProductKeyword || hasProductElements;
  }
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  function print$1(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  class WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
    static EVENT_NAME = getUniqueEventName("wxt:locationchange");
  }
  function getUniqueEventName(eventName) {
    return `${browser?.runtime?.id}:${"content"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  class ContentScriptContext {
    constructor(contentScriptName, options) {
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName(
      "wxt:content-script-started"
    );
    isTopFrame = window.self === window.top;
    abortController;
    locationWatcher = createLocationWatcher(this);
    receivedMessageIds = /* @__PURE__ */ new Set();
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     *
     * Intervals can be cleared by calling the normal `clearInterval` function.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     *
     * Timeouts can be cleared by calling the normal `setTimeout` function.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelAnimationFrame` function.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelIdleCallback` function.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      target.addEventListener?.(
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event2) {
      const isScriptStartedEvent = event2.data?.type === ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = event2.data?.contentScriptName === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has(event2.data?.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event2) => {
        if (this.verifyScriptStartedEvent(event2)) {
          this.receivedMessageIds.add(event2.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && options?.ignoreFirstEvent) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  }
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("content", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"content"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  const PUBLIC_VERSION = "5";
  if (typeof window !== "undefined") {
    ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add(PUBLIC_VERSION);
  }
  let legacy_mode_flag = false;
  let tracing_mode_flag = false;
  function enable_legacy_mode_flag() {
    legacy_mode_flag = true;
  }
  enable_legacy_mode_flag();
  const EACH_ITEM_REACTIVE = 1;
  const EACH_INDEX_REACTIVE = 1 << 1;
  const EACH_IS_CONTROLLED = 1 << 2;
  const EACH_IS_ANIMATED = 1 << 3;
  const EACH_ITEM_IMMUTABLE = 1 << 4;
  const PROPS_IS_IMMUTABLE = 1;
  const PROPS_IS_RUNES = 1 << 1;
  const PROPS_IS_UPDATED = 1 << 2;
  const PROPS_IS_BINDABLE = 1 << 3;
  const PROPS_IS_LAZY_INITIAL = 1 << 4;
  const TEMPLATE_FRAGMENT = 1;
  const TEMPLATE_USE_IMPORT_NODE = 1 << 1;
  const UNINITIALIZED = Symbol();
  const FILENAME = Symbol("filename");
  const NAMESPACE_HTML = "http://www.w3.org/1999/xhtml";
  const NAMESPACE_SVG = "http://www.w3.org/2000/svg";
  const ATTACHMENT_KEY = "@attach";
  const DEV = true;
  var is_array = Array.isArray;
  var index_of = Array.prototype.indexOf;
  var array_from = Array.from;
  var define_property = Object.defineProperty;
  var get_descriptor = Object.getOwnPropertyDescriptor;
  var get_descriptors = Object.getOwnPropertyDescriptors;
  var object_prototype = Object.prototype;
  var array_prototype = Array.prototype;
  var get_prototype_of = Object.getPrototypeOf;
  function is_function(thing) {
    return typeof thing === "function";
  }
  function run(fn) {
    return fn();
  }
  function run_all(arr) {
    for (var i = 0; i < arr.length; i++) {
      arr[i]();
    }
  }
  function deferred() {
    var resolve;
    var reject;
    var promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  function to_array(value, n) {
    if (Array.isArray(value)) {
      return value;
    }
    if (!(Symbol.iterator in value)) {
      return Array.from(value);
    }
    const array = [];
    for (const element2 of value) {
      array.push(element2);
      if (array.length === n) break;
    }
    return array;
  }
  const DERIVED = 1 << 1;
  const EFFECT = 1 << 2;
  const RENDER_EFFECT = 1 << 3;
  const MANAGED_EFFECT = 1 << 24;
  const BLOCK_EFFECT = 1 << 4;
  const BRANCH_EFFECT = 1 << 5;
  const ROOT_EFFECT = 1 << 6;
  const BOUNDARY_EFFECT = 1 << 7;
  const CONNECTED = 1 << 9;
  const CLEAN = 1 << 10;
  const DIRTY = 1 << 11;
  const MAYBE_DIRTY = 1 << 12;
  const INERT = 1 << 13;
  const DESTROYED = 1 << 14;
  const EFFECT_RAN = 1 << 15;
  const EFFECT_TRANSPARENT = 1 << 16;
  const EAGER_EFFECT = 1 << 17;
  const HEAD_EFFECT = 1 << 18;
  const EFFECT_PRESERVED = 1 << 19;
  const USER_EFFECT = 1 << 20;
  const WAS_MARKED = 1 << 15;
  const REACTION_IS_UPDATING = 1 << 21;
  const ASYNC = 1 << 22;
  const ERROR_VALUE = 1 << 23;
  const STATE_SYMBOL = Symbol("$state");
  const LEGACY_PROPS = Symbol("legacy props");
  const LOADING_ATTR_SYMBOL = Symbol("");
  const PROXY_PATH_SYMBOL = Symbol("proxy path");
  const STALE_REACTION = new class StaleReactionError extends Error {
    name = "StaleReactionError";
    message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
  }();
  const ELEMENT_NODE = 1;
  const DOCUMENT_FRAGMENT_NODE = 11;
  function snippet_without_render_tag() {
    {
      const error = new Error(`snippet_without_render_tag
Attempted to render a snippet without a \`{@render}\` block. This would cause the snippet code to be stringified instead of its content being rendered to the DOM. To fix this, change \`{snippet}\` to \`{@render snippet()}\`.
https://svelte.dev/e/snippet_without_render_tag`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function svelte_element_invalid_this_value() {
    {
      const error = new Error(`svelte_element_invalid_this_value
The \`this\` prop on \`<svelte:element>\` must be a string, if defined
https://svelte.dev/e/svelte_element_invalid_this_value`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function async_derived_orphan() {
    {
      const error = new Error(`async_derived_orphan
Cannot create a \`$derived(...)\` with an \`await\` expression outside of an effect tree
https://svelte.dev/e/async_derived_orphan`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function bind_invalid_checkbox_value() {
    {
      const error = new Error(`bind_invalid_checkbox_value
Using \`bind:value\` together with a checkbox input is not allowed. Use \`bind:checked\` instead
https://svelte.dev/e/bind_invalid_checkbox_value`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function component_api_changed(method, component) {
    {
      const error = new Error(`component_api_changed
Calling \`${method}\` on a component instance (of ${component}) is no longer valid in Svelte 5
https://svelte.dev/e/component_api_changed`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function component_api_invalid_new(component, name) {
    {
      const error = new Error(`component_api_invalid_new
Attempted to instantiate ${component} with \`new ${name}\`, which is no longer valid in Svelte 5. If this component is not under your control, set the \`compatibility.componentApi\` compiler option to \`4\` to keep it working.
https://svelte.dev/e/component_api_invalid_new`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function derived_references_self() {
    {
      const error = new Error(`derived_references_self
A derived value cannot reference itself recursively
https://svelte.dev/e/derived_references_self`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function effect_in_teardown(rune) {
    {
      const error = new Error(`effect_in_teardown
\`${rune}\` cannot be used inside an effect cleanup function
https://svelte.dev/e/effect_in_teardown`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function effect_in_unowned_derived() {
    {
      const error = new Error(`effect_in_unowned_derived
Effect cannot be created inside a \`$derived\` value that was not itself created inside an effect
https://svelte.dev/e/effect_in_unowned_derived`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function effect_orphan(rune) {
    {
      const error = new Error(`effect_orphan
\`${rune}\` can only be used inside an effect (e.g. during component initialisation)
https://svelte.dev/e/effect_orphan`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function effect_update_depth_exceeded() {
    {
      const error = new Error(`effect_update_depth_exceeded
Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
https://svelte.dev/e/effect_update_depth_exceeded`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function props_invalid_value(key) {
    {
      const error = new Error(`props_invalid_value
Cannot do \`bind:${key}={undefined}\` when \`${key}\` has a fallback value
https://svelte.dev/e/props_invalid_value`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function rune_outside_svelte(rune) {
    {
      const error = new Error(`rune_outside_svelte
The \`${rune}\` rune is only available inside \`.svelte\` and \`.svelte.js/ts\` files
https://svelte.dev/e/rune_outside_svelte`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function state_descriptors_fixed() {
    {
      const error = new Error(`state_descriptors_fixed
Property descriptors defined on \`$state\` objects must contain \`value\` and always be \`enumerable\`, \`configurable\` and \`writable\`.
https://svelte.dev/e/state_descriptors_fixed`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function state_prototype_fixed() {
    {
      const error = new Error(`state_prototype_fixed
Cannot set prototype of \`$state\` object
https://svelte.dev/e/state_prototype_fixed`);
      error.name = "Svelte error";
      throw error;
    }
  }
  function state_unsafe_mutation() {
    {
      const error = new Error(`state_unsafe_mutation
Updating state inside \`$derived(...)\`, \`$inspect(...)\` or a template expression is forbidden. If the value should not be reactive, declare it without \`$state\`
https://svelte.dev/e/state_unsafe_mutation`);
      error.name = "Svelte error";
      throw error;
    }
  }
  var bold$1 = "font-weight: bold";
  var normal$1 = "font-weight: normal";
  function console_log_state(method) {
    {
      console.warn(`%c[svelte] console_log_state
%cYour \`console.${method}\` contained \`$state\` proxies. Consider using \`$inspect(...)\` or \`$state.snapshot(...)\` instead
https://svelte.dev/e/console_log_state`, bold$1, normal$1);
    }
  }
  function event_handler_invalid(handler, suggestion) {
    {
      console.warn(`%c[svelte] event_handler_invalid
%c${handler} should be a function. Did you mean to ${suggestion}?
https://svelte.dev/e/event_handler_invalid`, bold$1, normal$1);
    }
  }
  function select_multiple_invalid_value() {
    {
      console.warn(`%c[svelte] select_multiple_invalid_value
%cThe \`value\` property of a \`<select multiple>\` element should be an array, but it received a non-array value. The selection will be kept as is.
https://svelte.dev/e/select_multiple_invalid_value`, bold$1, normal$1);
    }
  }
  function state_proxy_equality_mismatch(operator) {
    {
      console.warn(`%c[svelte] state_proxy_equality_mismatch
%cReactive \`$state(...)\` proxies and the values they proxy have different identities. Because of this, comparisons with \`${operator}\` will produce unexpected results
https://svelte.dev/e/state_proxy_equality_mismatch`, bold$1, normal$1);
    }
  }
  function reset(node) {
    return;
  }
  function equals(value) {
    return value === this.v;
  }
  function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
  }
  function safe_equals(value) {
    return !safe_not_equal(value, this.v);
  }
  var bold = "font-weight: bold";
  var normal = "font-weight: normal";
  function state_snapshot_uncloneable(properties) {
    {
      console.warn(
        `%c[svelte] state_snapshot_uncloneable
%c${properties ? `The following properties cannot be cloned with \`$state.snapshot\` — the return value contains the originals:

${properties}` : "Value cannot be cloned with `$state.snapshot` — the original value was returned"}
https://svelte.dev/e/state_snapshot_uncloneable`,
        bold,
        normal
      );
    }
  }
  const empty = [];
  function snapshot(value, skip_warning = false, no_tojson = false) {
    if (!skip_warning) {
      const paths = [];
      const copy = clone(value, /* @__PURE__ */ new Map(), "", paths, null, no_tojson);
      if (paths.length === 1 && paths[0] === "") {
        state_snapshot_uncloneable();
      } else if (paths.length > 0) {
        const slice = paths.length > 10 ? paths.slice(0, 7) : paths.slice(0, 10);
        const excess = paths.length - slice.length;
        let uncloned = slice.map((path) => `- <value>${path}`).join("\n");
        if (excess > 0) uncloned += `
- ...and ${excess} more`;
        state_snapshot_uncloneable(uncloned);
      }
      return copy;
    }
    return clone(value, /* @__PURE__ */ new Map(), "", empty, null, no_tojson);
  }
  function clone(value, cloned, path, paths, original = null, no_tojson = false) {
    if (typeof value === "object" && value !== null) {
      var unwrapped = cloned.get(value);
      if (unwrapped !== void 0) return unwrapped;
      if (value instanceof Map) return (
        /** @type {Snapshot<T>} */
        new Map(value)
      );
      if (value instanceof Set) return (
        /** @type {Snapshot<T>} */
        new Set(value)
      );
      if (is_array(value)) {
        var copy = (
          /** @type {Snapshot<any>} */
          Array(value.length)
        );
        cloned.set(value, copy);
        if (original !== null) {
          cloned.set(original, copy);
        }
        for (var i = 0; i < value.length; i += 1) {
          var element2 = value[i];
          if (i in value) {
            copy[i] = clone(element2, cloned, `${path}[${i}]`, paths, null, no_tojson);
          }
        }
        return copy;
      }
      if (get_prototype_of(value) === object_prototype) {
        copy = {};
        cloned.set(value, copy);
        if (original !== null) {
          cloned.set(original, copy);
        }
        for (var key in value) {
          copy[key] = clone(
            // @ts-expect-error
            value[key],
            cloned,
            `${path}.${key}`,
            paths,
            null,
            no_tojson
          );
        }
        return copy;
      }
      if (value instanceof Date) {
        return (
          /** @type {Snapshot<T>} */
          structuredClone(value)
        );
      }
      if (typeof /** @type {T & { toJSON?: any } } */
      value.toJSON === "function" && !no_tojson) {
        return clone(
          /** @type {T & { toJSON(): any } } */
          value.toJSON(),
          cloned,
          `${path}.toJSON()`,
          paths,
          // Associate the instance with the toJSON clone
          value
        );
      }
    }
    if (value instanceof EventTarget) {
      return (
        /** @type {Snapshot<T>} */
        value
      );
    }
    try {
      return (
        /** @type {Snapshot<T>} */
        structuredClone(value)
      );
    } catch (e) {
      {
        paths.push(path);
      }
      return (
        /** @type {Snapshot<T>} */
        value
      );
    }
  }
  function tag(source2, label) {
    source2.label = label;
    tag_proxy(source2.v, label);
    return source2;
  }
  function tag_proxy(value, label) {
    value?.[PROXY_PATH_SYMBOL]?.(label);
    return value;
  }
  function get_error(label) {
    const error = new Error();
    const stack2 = get_stack();
    if (stack2.length === 0) {
      return null;
    }
    stack2.unshift("\n");
    define_property(error, "stack", {
      value: stack2.join("\n")
    });
    define_property(error, "name", {
      value: label
    });
    return (
      /** @type {Error & { stack: string }} */
      error
    );
  }
  function get_stack() {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    const stack2 = new Error().stack;
    Error.stackTraceLimit = limit;
    if (!stack2) return [];
    const lines = stack2.split("\n");
    const new_lines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const posixified = line.replaceAll("\\", "/");
      if (line.trim() === "Error") {
        continue;
      }
      if (line.includes("validate_each_keys")) {
        return [];
      }
      if (posixified.includes("svelte/src/internal") || posixified.includes("node_modules/.vite")) {
        continue;
      }
      new_lines.push(line);
    }
    return new_lines;
  }
  let component_context = null;
  function set_component_context(context) {
    component_context = context;
  }
  let dev_stack = null;
  function set_dev_stack(stack2) {
    dev_stack = stack2;
  }
  function add_svelte_meta(callback, type, component, line, column, additional) {
    const parent = dev_stack;
    dev_stack = {
      type,
      file: component[FILENAME],
      line,
      column,
      parent,
      ...additional
    };
    try {
      return callback();
    } finally {
      dev_stack = parent;
    }
  }
  let dev_current_component_function = null;
  function set_dev_current_component_function(fn) {
    dev_current_component_function = fn;
  }
  function push(props, runes = false, fn) {
    component_context = {
      p: component_context,
      i: false,
      c: null,
      e: null,
      s: props,
      x: null,
      l: legacy_mode_flag && !runes ? { s: null, u: null, $: [] } : null
    };
    {
      component_context.function = fn;
      dev_current_component_function = fn;
    }
  }
  function pop(component) {
    var context = (
      /** @type {ComponentContext} */
      component_context
    );
    var effects = context.e;
    if (effects !== null) {
      context.e = null;
      for (var fn of effects) {
        create_user_effect(fn);
      }
    }
    if (component !== void 0) {
      context.x = component;
    }
    context.i = true;
    component_context = context.p;
    {
      dev_current_component_function = component_context?.function ?? null;
    }
    return component ?? /** @type {T} */
    {};
  }
  function is_runes() {
    return !legacy_mode_flag || component_context !== null && component_context.l === null;
  }
  let micro_tasks = [];
  function run_micro_tasks() {
    var tasks = micro_tasks;
    micro_tasks = [];
    run_all(tasks);
  }
  function queue_micro_task(fn) {
    if (micro_tasks.length === 0 && !is_flushing_sync) {
      var tasks = micro_tasks;
      queueMicrotask(() => {
        if (tasks === micro_tasks) run_micro_tasks();
      });
    }
    micro_tasks.push(fn);
  }
  function flush_tasks() {
    while (micro_tasks.length > 0) {
      run_micro_tasks();
    }
  }
  const adjustments = /* @__PURE__ */ new WeakMap();
  function handle_error(error) {
    var effect2 = active_effect;
    if (effect2 === null) {
      active_reaction.f |= ERROR_VALUE;
      return error;
    }
    if (error instanceof Error && !adjustments.has(error)) {
      adjustments.set(error, get_adjustments(error, effect2));
    }
    if ((effect2.f & EFFECT_RAN) === 0) {
      if ((effect2.f & BOUNDARY_EFFECT) === 0) {
        if (!effect2.parent && error instanceof Error) {
          apply_adjustments(error);
        }
        throw error;
      }
      effect2.b.error(error);
    } else {
      invoke_error_boundary(error, effect2);
    }
  }
  function invoke_error_boundary(error, effect2) {
    while (effect2 !== null) {
      if ((effect2.f & BOUNDARY_EFFECT) !== 0) {
        try {
          effect2.b.error(error);
          return;
        } catch (e) {
          error = e;
        }
      }
      effect2 = effect2.parent;
    }
    if (error instanceof Error) {
      apply_adjustments(error);
    }
    throw error;
  }
  function get_adjustments(error, effect2) {
    const message_descriptor = get_descriptor(error, "message");
    if (message_descriptor && !message_descriptor.configurable) return;
    var indent = "	";
    var component_stack = `
${indent}in ${effect2.fn?.name || "<unknown>"}`;
    var context = effect2.ctx;
    while (context !== null) {
      component_stack += `
${indent}in ${context.function?.[FILENAME].split("/").pop()}`;
      context = context.p;
    }
    return {
      message: error.message + `
${component_stack}
`,
      stack: error.stack?.split("\n").filter((line) => !line.includes("svelte/src/internal")).join("\n")
    };
  }
  function apply_adjustments(error) {
    const adjusted = adjustments.get(error);
    if (adjusted) {
      define_property(error, "message", {
        value: adjusted.message
      });
      define_property(error, "stack", {
        value: adjusted.stack
      });
    }
  }
  const batches = /* @__PURE__ */ new Set();
  let current_batch = null;
  let previous_batch = null;
  let batch_values = null;
  let queued_root_effects = [];
  let last_scheduled_effect = null;
  let is_flushing = false;
  let is_flushing_sync = false;
  class Batch {
    committed = false;
    /**
     * The current values of any sources that are updated in this batch
     * They keys of this map are identical to `this.#previous`
     * @type {Map<Source, any>}
     */
    current = /* @__PURE__ */ new Map();
    /**
     * The values of any sources that are updated in this batch _before_ those updates took place.
     * They keys of this map are identical to `this.#current`
     * @type {Map<Source, any>}
     */
    previous = /* @__PURE__ */ new Map();
    /**
     * When the batch is committed (and the DOM is updated), we need to remove old branches
     * and append new ones by calling the functions added inside (if/each/key/etc) blocks
     * @type {Set<() => void>}
     */
    #commit_callbacks = /* @__PURE__ */ new Set();
    /**
     * If a fork is discarded, we need to destroy any effects that are no longer needed
     * @type {Set<(batch: Batch) => void>}
     */
    #discard_callbacks = /* @__PURE__ */ new Set();
    /**
     * The number of async effects that are currently in flight
     */
    #pending = 0;
    /**
     * The number of async effects that are currently in flight, _not_ inside a pending boundary
     */
    #blocking_pending = 0;
    /**
     * A deferred that resolves when the batch is committed, used with `settled()`
     * TODO replace with Promise.withResolvers once supported widely enough
     * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
     */
    #deferred = null;
    /**
     * Deferred effects (which run after async work has completed) that are DIRTY
     * @type {Effect[]}
     */
    #dirty_effects = [];
    /**
     * Deferred effects that are MAYBE_DIRTY
     * @type {Effect[]}
     */
    #maybe_dirty_effects = [];
    /**
     * A set of branches that still exist, but will be destroyed when this batch
     * is committed — we skip over these during `process`
     * @type {Set<Effect>}
     */
    skipped_effects = /* @__PURE__ */ new Set();
    is_fork = false;
    is_deferred() {
      return this.is_fork || this.#blocking_pending > 0;
    }
    /**
     *
     * @param {Effect[]} root_effects
     */
    process(root_effects) {
      queued_root_effects = [];
      previous_batch = null;
      this.apply();
      var target = {
        parent: null,
        effect: null,
        effects: [],
        render_effects: [],
        block_effects: []
      };
      for (const root2 of root_effects) {
        this.#traverse_effect_tree(root2, target);
      }
      if (!this.is_fork) {
        this.#resolve();
      }
      if (this.is_deferred()) {
        this.#defer_effects(target.effects);
        this.#defer_effects(target.render_effects);
        this.#defer_effects(target.block_effects);
      } else {
        previous_batch = this;
        current_batch = null;
        flush_queued_effects(target.render_effects);
        flush_queued_effects(target.effects);
        previous_batch = null;
        this.#deferred?.resolve();
      }
      batch_values = null;
    }
    /**
     * Traverse the effect tree, executing effects or stashing
     * them for later execution as appropriate
     * @param {Effect} root
     * @param {EffectTarget} target
     */
    #traverse_effect_tree(root2, target) {
      root2.f ^= CLEAN;
      var effect2 = root2.first;
      while (effect2 !== null) {
        var flags = effect2.f;
        var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
        var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;
        var skip = is_skippable_branch || (flags & INERT) !== 0 || this.skipped_effects.has(effect2);
        if ((effect2.f & BOUNDARY_EFFECT) !== 0 && effect2.b?.is_pending()) {
          target = {
            parent: target,
            effect: effect2,
            effects: [],
            render_effects: [],
            block_effects: []
          };
        }
        if (!skip && effect2.fn !== null) {
          if (is_branch) {
            effect2.f ^= CLEAN;
          } else if ((flags & EFFECT) !== 0) {
            target.effects.push(effect2);
          } else if (is_dirty(effect2)) {
            if ((effect2.f & BLOCK_EFFECT) !== 0) target.block_effects.push(effect2);
            update_effect(effect2);
          }
          var child2 = effect2.first;
          if (child2 !== null) {
            effect2 = child2;
            continue;
          }
        }
        var parent = effect2.parent;
        effect2 = effect2.next;
        while (effect2 === null && parent !== null) {
          if (parent === target.effect) {
            this.#defer_effects(target.effects);
            this.#defer_effects(target.render_effects);
            this.#defer_effects(target.block_effects);
            target = /** @type {EffectTarget} */
            target.parent;
          }
          effect2 = parent.next;
          parent = parent.parent;
        }
      }
    }
    /**
     * @param {Effect[]} effects
     */
    #defer_effects(effects) {
      for (const e of effects) {
        const target = (e.f & DIRTY) !== 0 ? this.#dirty_effects : this.#maybe_dirty_effects;
        target.push(e);
        this.#clear_marked(e.deps);
        set_signal_status(e, CLEAN);
      }
    }
    /**
     * @param {Value[] | null} deps
     */
    #clear_marked(deps) {
      if (deps === null) return;
      for (const dep of deps) {
        if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
          continue;
        }
        dep.f ^= WAS_MARKED;
        this.#clear_marked(
          /** @type {Derived} */
          dep.deps
        );
      }
    }
    /**
     * Associate a change to a given source with the current
     * batch, noting its previous and current values
     * @param {Source} source
     * @param {any} value
     */
    capture(source2, value) {
      if (!this.previous.has(source2)) {
        this.previous.set(source2, value);
      }
      if ((source2.f & ERROR_VALUE) === 0) {
        this.current.set(source2, source2.v);
        batch_values?.set(source2, source2.v);
      }
    }
    activate() {
      current_batch = this;
      this.apply();
    }
    deactivate() {
      if (current_batch !== this) return;
      current_batch = null;
      batch_values = null;
    }
    flush() {
      this.activate();
      if (queued_root_effects.length > 0) {
        flush_effects();
        if (current_batch !== null && current_batch !== this) {
          return;
        }
      } else if (this.#pending === 0) {
        this.process([]);
      }
      this.deactivate();
    }
    discard() {
      for (const fn of this.#discard_callbacks) fn(this);
      this.#discard_callbacks.clear();
    }
    #resolve() {
      if (this.#blocking_pending === 0) {
        for (const fn of this.#commit_callbacks) fn();
        this.#commit_callbacks.clear();
      }
      if (this.#pending === 0) {
        this.#commit();
      }
    }
    #commit() {
      if (batches.size > 1) {
        this.previous.clear();
        var previous_batch_values = batch_values;
        var is_earlier = true;
        var dummy_target = {
          parent: null,
          effect: null,
          effects: [],
          render_effects: [],
          block_effects: []
        };
        for (const batch of batches) {
          if (batch === this) {
            is_earlier = false;
            continue;
          }
          const sources = [];
          for (const [source2, value] of this.current) {
            if (batch.current.has(source2)) {
              if (is_earlier && value !== batch.current.get(source2)) {
                batch.current.set(source2, value);
              } else {
                continue;
              }
            }
            sources.push(source2);
          }
          if (sources.length === 0) {
            continue;
          }
          const others = [...batch.current.keys()].filter((s) => !this.current.has(s));
          if (others.length > 0) {
            var prev_queued_root_effects = queued_root_effects;
            queued_root_effects = [];
            const marked = /* @__PURE__ */ new Set();
            const checked = /* @__PURE__ */ new Map();
            for (const source2 of sources) {
              mark_effects(source2, others, marked, checked);
            }
            if (queued_root_effects.length > 0) {
              current_batch = batch;
              batch.apply();
              for (const root2 of queued_root_effects) {
                batch.#traverse_effect_tree(root2, dummy_target);
              }
              batch.deactivate();
            }
            queued_root_effects = prev_queued_root_effects;
          }
        }
        current_batch = null;
        batch_values = previous_batch_values;
      }
      this.committed = true;
      batches.delete(this);
    }
    /**
     *
     * @param {boolean} blocking
     */
    increment(blocking) {
      this.#pending += 1;
      if (blocking) this.#blocking_pending += 1;
    }
    /**
     *
     * @param {boolean} blocking
     */
    decrement(blocking) {
      this.#pending -= 1;
      if (blocking) this.#blocking_pending -= 1;
      this.revive();
    }
    revive() {
      for (const e of this.#dirty_effects) {
        set_signal_status(e, DIRTY);
        schedule_effect(e);
      }
      for (const e of this.#maybe_dirty_effects) {
        set_signal_status(e, MAYBE_DIRTY);
        schedule_effect(e);
      }
      this.#dirty_effects = [];
      this.#maybe_dirty_effects = [];
      this.flush();
    }
    /** @param {() => void} fn */
    oncommit(fn) {
      this.#commit_callbacks.add(fn);
    }
    /** @param {(batch: Batch) => void} fn */
    ondiscard(fn) {
      this.#discard_callbacks.add(fn);
    }
    settled() {
      return (this.#deferred ??= deferred()).promise;
    }
    static ensure() {
      if (current_batch === null) {
        const batch = current_batch = new Batch();
        batches.add(current_batch);
        if (!is_flushing_sync) {
          Batch.enqueue(() => {
            if (current_batch !== batch) {
              return;
            }
            batch.flush();
          });
        }
      }
      return current_batch;
    }
    /** @param {() => void} task */
    static enqueue(task) {
      queue_micro_task(task);
    }
    apply() {
      return;
    }
  }
  function flushSync(fn) {
    var was_flushing_sync = is_flushing_sync;
    is_flushing_sync = true;
    try {
      var result2;
      if (fn) ;
      while (true) {
        flush_tasks();
        if (queued_root_effects.length === 0) {
          current_batch?.flush();
          if (queued_root_effects.length === 0) {
            last_scheduled_effect = null;
            return (
              /** @type {T} */
              result2
            );
          }
        }
        flush_effects();
      }
    } finally {
      is_flushing_sync = was_flushing_sync;
    }
  }
  function flush_effects() {
    var was_updating_effect = is_updating_effect;
    is_flushing = true;
    var source_stacks = /* @__PURE__ */ new Set();
    try {
      var flush_count = 0;
      set_is_updating_effect(true);
      while (queued_root_effects.length > 0) {
        var batch = Batch.ensure();
        if (flush_count++ > 1e3) {
          if (DEV) {
            var updates = /* @__PURE__ */ new Map();
            for (const source2 of batch.current.keys()) {
              for (const [stack2, update2] of source2.updated ?? []) {
                var entry = updates.get(stack2);
                if (!entry) {
                  entry = { error: update2.error, count: 0 };
                  updates.set(stack2, entry);
                }
                entry.count += update2.count;
              }
            }
            for (const update2 of updates.values()) {
              if (update2.error) {
                console.error(update2.error);
              }
            }
          }
          infinite_loop_guard();
        }
        batch.process(queued_root_effects);
        old_values.clear();
        if (DEV) {
          for (const source2 of batch.current.keys()) {
            source_stacks.add(source2);
          }
        }
      }
    } finally {
      is_flushing = false;
      set_is_updating_effect(was_updating_effect);
      last_scheduled_effect = null;
      {
        for (
          const source2 of
          /** @type {Set<Source>} */
          source_stacks
        ) {
          source2.updated = null;
        }
      }
    }
  }
  function infinite_loop_guard() {
    try {
      effect_update_depth_exceeded();
    } catch (error) {
      {
        define_property(error, "stack", { value: "" });
      }
      invoke_error_boundary(error, last_scheduled_effect);
    }
  }
  let eager_block_effects = null;
  function flush_queued_effects(effects) {
    var length = effects.length;
    if (length === 0) return;
    var i = 0;
    while (i < length) {
      var effect2 = effects[i++];
      if ((effect2.f & (DESTROYED | INERT)) === 0 && is_dirty(effect2)) {
        eager_block_effects = /* @__PURE__ */ new Set();
        update_effect(effect2);
        if (effect2.deps === null && effect2.first === null && effect2.nodes_start === null) {
          if (effect2.teardown === null && effect2.ac === null) {
            unlink_effect(effect2);
          } else {
            effect2.fn = null;
          }
        }
        if (eager_block_effects?.size > 0) {
          old_values.clear();
          for (const e of eager_block_effects) {
            if ((e.f & (DESTROYED | INERT)) !== 0) continue;
            const ordered_effects = [e];
            let ancestor = e.parent;
            while (ancestor !== null) {
              if (eager_block_effects.has(ancestor)) {
                eager_block_effects.delete(ancestor);
                ordered_effects.push(ancestor);
              }
              ancestor = ancestor.parent;
            }
            for (let j = ordered_effects.length - 1; j >= 0; j--) {
              const e2 = ordered_effects[j];
              if ((e2.f & (DESTROYED | INERT)) !== 0) continue;
              update_effect(e2);
            }
          }
          eager_block_effects.clear();
        }
      }
    }
    eager_block_effects = null;
  }
  function mark_effects(value, sources, marked, checked) {
    if (marked.has(value)) return;
    marked.add(value);
    if (value.reactions !== null) {
      for (const reaction of value.reactions) {
        const flags = reaction.f;
        if ((flags & DERIVED) !== 0) {
          mark_effects(
            /** @type {Derived} */
            reaction,
            sources,
            marked,
            checked
          );
        } else if ((flags & (ASYNC | BLOCK_EFFECT)) !== 0 && (flags & DIRTY) === 0 && depends_on(reaction, sources, checked)) {
          set_signal_status(reaction, DIRTY);
          schedule_effect(
            /** @type {Effect} */
            reaction
          );
        }
      }
    }
  }
  function depends_on(reaction, sources, checked) {
    const depends = checked.get(reaction);
    if (depends !== void 0) return depends;
    if (reaction.deps !== null) {
      for (const dep of reaction.deps) {
        if (sources.includes(dep)) {
          return true;
        }
        if ((dep.f & DERIVED) !== 0 && depends_on(
          /** @type {Derived} */
          dep,
          sources,
          checked
        )) {
          checked.set(
            /** @type {Derived} */
            dep,
            true
          );
          return true;
        }
      }
    }
    checked.set(reaction, false);
    return false;
  }
  function schedule_effect(signal) {
    var effect2 = last_scheduled_effect = signal;
    while (effect2.parent !== null) {
      effect2 = effect2.parent;
      var flags = effect2.f;
      if (is_flushing && effect2 === active_effect && (flags & BLOCK_EFFECT) !== 0 && (flags & HEAD_EFFECT) === 0) {
        return;
      }
      if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
        if ((flags & CLEAN) === 0) return;
        effect2.f ^= CLEAN;
      }
    }
    queued_root_effects.push(effect2);
  }
  function index(_, i) {
    return i;
  }
  function pause_effects(state2, to_destroy, controlled_anchor) {
    var transitions = [];
    var length = to_destroy.length;
    for (var i = 0; i < length; i++) {
      pause_children(to_destroy[i].e, transitions, true);
    }
    run_out_transitions(transitions, () => {
      var fast_path = transitions.length === 0 && controlled_anchor !== null;
      if (fast_path) {
        var anchor = (
          /** @type {Element} */
          controlled_anchor
        );
        var parent_node = (
          /** @type {Element} */
          anchor.parentNode
        );
        clear_text_content(parent_node);
        parent_node.append(anchor);
        state2.items.clear();
        link(state2, to_destroy[0].prev, to_destroy[length - 1].next);
      }
      for (var i2 = 0; i2 < length; i2++) {
        var item = to_destroy[i2];
        if (!fast_path) {
          state2.items.delete(item.k);
          link(state2, item.prev, item.next);
        }
        destroy_effect(item.e, !fast_path);
      }
      if (state2.first === to_destroy[0]) {
        state2.first = to_destroy[0].prev;
      }
    });
  }
  function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
    var anchor = node;
    var items = /* @__PURE__ */ new Map();
    var first = null;
    var is_controlled = (flags & EACH_IS_CONTROLLED) !== 0;
    var is_reactive_value = (flags & EACH_ITEM_REACTIVE) !== 0;
    var is_reactive_index = (flags & EACH_INDEX_REACTIVE) !== 0;
    if (is_controlled) {
      var parent_node = (
        /** @type {Element} */
        node
      );
      anchor = parent_node.appendChild(create_text());
    }
    var fallback = null;
    var each_array = /* @__PURE__ */ derived_safe_equal(() => {
      var collection = get_collection();
      return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
    });
    var array;
    var first_run = true;
    function commit() {
      reconcile(state2, array, anchor, flags, get_key);
      if (fallback !== null) {
        if (array.length === 0) {
          if (fallback.fragment) {
            anchor.before(fallback.fragment);
            fallback.fragment = null;
          } else {
            resume_effect(fallback.effect);
          }
          effect2.first = fallback.effect;
        } else {
          pause_effect(fallback.effect, () => {
            fallback = null;
          });
        }
      }
    }
    var effect2 = block(() => {
      array = /** @type {V[]} */
      get(each_array);
      var length = array.length;
      var keys = /* @__PURE__ */ new Set();
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var prev = null;
      var defer = should_defer_append();
      for (var i = 0; i < length; i += 1) {
        var value = array[i];
        var key = get_key(value, i);
        var item = first_run ? null : items.get(key);
        if (item) {
          if (is_reactive_value) {
            internal_set(item.v, value);
          }
          if (is_reactive_index) {
            internal_set(
              /** @type {Value<number>} */
              item.i,
              i
            );
          } else {
            item.i = i;
          }
          if (defer) {
            batch.skipped_effects.delete(item.e);
          }
        } else {
          item = create_item(
            first_run ? anchor : null,
            prev,
            value,
            key,
            i,
            render_fn,
            flags,
            get_collection
          );
          if (first_run) {
            item.o = true;
            if (prev === null) {
              first = item;
            } else {
              prev.next = item;
            }
            prev = item;
          }
          items.set(key, item);
        }
        keys.add(key);
      }
      if (length === 0 && fallback_fn && !fallback) {
        if (first_run) {
          fallback = {
            fragment: null,
            effect: branch(() => fallback_fn(anchor))
          };
        } else {
          var fragment = document.createDocumentFragment();
          var target = create_text();
          fragment.append(target);
          fallback = {
            fragment,
            effect: branch(() => fallback_fn(target))
          };
        }
      }
      if (!first_run) {
        if (defer) {
          for (const [key2, item2] of items) {
            if (!keys.has(key2)) {
              batch.skipped_effects.add(item2.e);
            }
          }
          batch.oncommit(commit);
          batch.ondiscard(() => {
          });
        } else {
          commit();
        }
      }
      get(each_array);
    });
    var state2 = { effect: effect2, items, first };
    first_run = false;
  }
  function reconcile(state2, array, anchor, flags, get_key) {
    var is_animated = (flags & EACH_IS_ANIMATED) !== 0;
    var length = array.length;
    var items = state2.items;
    var current = state2.first;
    var seen;
    var prev = null;
    var to_animate;
    var matched = [];
    var stashed = [];
    var value;
    var key;
    var item;
    var i;
    if (is_animated) {
      for (i = 0; i < length; i += 1) {
        value = array[i];
        key = get_key(value, i);
        item = /** @type {EachItem} */
        items.get(key);
        if (item.o) {
          item.a?.measure();
          (to_animate ??= /* @__PURE__ */ new Set()).add(item);
        }
      }
    }
    for (i = 0; i < length; i += 1) {
      value = array[i];
      key = get_key(value, i);
      item = /** @type {EachItem} */
      items.get(key);
      state2.first ??= item;
      if (!item.o) {
        item.o = true;
        var next = prev ? prev.next : current;
        link(state2, prev, item);
        link(state2, item, next);
        move(item, next, anchor);
        prev = item;
        matched = [];
        stashed = [];
        current = prev.next;
        continue;
      }
      if ((item.e.f & INERT) !== 0) {
        resume_effect(item.e);
        if (is_animated) {
          item.a?.unfix();
          (to_animate ??= /* @__PURE__ */ new Set()).delete(item);
        }
      }
      if (item !== current) {
        if (seen !== void 0 && seen.has(item)) {
          if (matched.length < stashed.length) {
            var start = stashed[0];
            var j;
            prev = start.prev;
            var a = matched[0];
            var b = matched[matched.length - 1];
            for (j = 0; j < matched.length; j += 1) {
              move(matched[j], start, anchor);
            }
            for (j = 0; j < stashed.length; j += 1) {
              seen.delete(stashed[j]);
            }
            link(state2, a.prev, b.next);
            link(state2, prev, a);
            link(state2, b, start);
            current = start;
            prev = b;
            i -= 1;
            matched = [];
            stashed = [];
          } else {
            seen.delete(item);
            move(item, current, anchor);
            link(state2, item.prev, item.next);
            link(state2, item, prev === null ? state2.first : prev.next);
            link(state2, prev, item);
            prev = item;
          }
          continue;
        }
        matched = [];
        stashed = [];
        while (current !== null && current.k !== key) {
          if ((current.e.f & INERT) === 0) {
            (seen ??= /* @__PURE__ */ new Set()).add(current);
          }
          stashed.push(current);
          current = current.next;
        }
        if (current === null) {
          continue;
        }
        item = current;
      }
      matched.push(item);
      prev = item;
      current = item.next;
    }
    let has_offscreen_items = items.size > length;
    if (current !== null || seen !== void 0) {
      var to_destroy = seen === void 0 ? [] : array_from(seen);
      while (current !== null) {
        if ((current.e.f & INERT) === 0) {
          to_destroy.push(current);
        }
        current = current.next;
      }
      var destroy_length = to_destroy.length;
      has_offscreen_items = items.size - destroy_length > length;
      if (destroy_length > 0) {
        var controlled_anchor = (flags & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;
        if (is_animated) {
          for (i = 0; i < destroy_length; i += 1) {
            to_destroy[i].a?.measure();
          }
          for (i = 0; i < destroy_length; i += 1) {
            to_destroy[i].a?.fix();
          }
        }
        pause_effects(state2, to_destroy, controlled_anchor);
      }
    }
    if (has_offscreen_items) {
      for (const item2 of items.values()) {
        if (!item2.o) {
          link(state2, prev, item2);
          prev = item2;
        }
      }
    }
    state2.effect.last = prev && prev.e;
    if (is_animated) {
      queue_micro_task(() => {
        if (to_animate === void 0) return;
        for (item of to_animate) {
          item.a?.apply();
        }
      });
    }
  }
  function create_item(anchor, prev, value, key, index2, render_fn, flags, get_collection) {
    var reactive = (flags & EACH_ITEM_REACTIVE) !== 0;
    var mutable = (flags & EACH_ITEM_IMMUTABLE) === 0;
    var v = reactive ? mutable ? /* @__PURE__ */ mutable_source(value, false, false) : source(value) : value;
    var i = (flags & EACH_INDEX_REACTIVE) === 0 ? index2 : source(index2);
    if (reactive) {
      v.trace = () => {
        var collection_index = typeof i === "number" ? index2 : i.v;
        get_collection()[collection_index];
      };
    }
    var item = {
      i,
      v,
      k: key,
      a: null,
      // @ts-expect-error
      e: null,
      o: false,
      prev,
      next: null
    };
    try {
      if (anchor === null) {
        var fragment = document.createDocumentFragment();
        fragment.append(anchor = create_text());
      }
      item.e = branch(() => render_fn(
        /** @type {Node} */
        anchor,
        v,
        i,
        get_collection
      ));
      if (prev !== null) {
        prev.next = item;
      }
      return item;
    } finally {
    }
  }
  function move(item, next, anchor) {
    var end = item.next ? (
      /** @type {TemplateNode} */
      item.next.e.nodes_start
    ) : anchor;
    var dest = next ? (
      /** @type {TemplateNode} */
      next.e.nodes_start
    ) : anchor;
    var node = (
      /** @type {TemplateNode} */
      item.e.nodes_start
    );
    while (node !== null && node !== end) {
      var next_node = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      dest.before(node);
      node = next_node;
    }
  }
  function link(state2, prev, next) {
    if (prev === null) {
      state2.first = next;
      state2.effect.first = next && next.e;
    } else {
      if (prev.e.next) {
        prev.e.next.prev = null;
      }
      prev.next = next;
      prev.e.next = next && next.e;
    }
    if (next !== null) {
      if (next.e.prev) {
        next.e.prev.next = null;
      }
      next.prev = prev;
      next.e.prev = prev && prev.e;
    }
  }
  function flatten(blockers, sync, async, fn) {
    const d = is_runes() ? derived : derived_safe_equal;
    if (async.length === 0 && blockers.length === 0) {
      fn(sync.map(d));
      return;
    }
    var batch = current_batch;
    var parent = (
      /** @type {Effect} */
      active_effect
    );
    var restore = capture();
    function run2() {
      Promise.all(async.map((expression) => /* @__PURE__ */ async_derived(expression))).then((result2) => {
        restore();
        try {
          fn([...sync.map(d), ...result2]);
        } catch (error) {
          if ((parent.f & DESTROYED) === 0) {
            invoke_error_boundary(error, parent);
          }
        }
        batch?.deactivate();
        unset_context();
      }).catch((error) => {
        invoke_error_boundary(error, parent);
      });
    }
    if (blockers.length > 0) {
      Promise.all(blockers).then(() => {
        restore();
        try {
          return run2();
        } finally {
          batch?.deactivate();
          unset_context();
        }
      });
    } else {
      run2();
    }
  }
  function capture() {
    var previous_effect = active_effect;
    var previous_reaction = active_reaction;
    var previous_component_context = component_context;
    var previous_batch2 = current_batch;
    {
      var previous_dev_stack = dev_stack;
    }
    return function restore(activate_batch = true) {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_component_context);
      if (activate_batch) previous_batch2?.activate();
      {
        set_dev_stack(previous_dev_stack);
      }
    };
  }
  async function track_reactivity_loss(promise) {
    var value = await promise;
    return () => {
      return value;
    };
  }
  function unset_context() {
    set_active_effect(null);
    set_active_reaction(null);
    set_component_context(null);
    {
      set_dev_stack(null);
    }
  }
  const recent_async_deriveds = /* @__PURE__ */ new Set();
  // @__NO_SIDE_EFFECTS__
  function derived(fn) {
    var flags = DERIVED | DIRTY;
    var parent_derived = active_reaction !== null && (active_reaction.f & DERIVED) !== 0 ? (
      /** @type {Derived} */
      active_reaction
    ) : null;
    if (active_effect !== null) {
      active_effect.f |= EFFECT_PRESERVED;
    }
    const signal = {
      ctx: component_context,
      deps: null,
      effects: null,
      equals,
      f: flags,
      fn,
      reactions: null,
      rv: 0,
      v: (
        /** @type {V} */
        UNINITIALIZED
      ),
      wv: 0,
      parent: parent_derived ?? active_effect,
      ac: null
    };
    return signal;
  }
  // @__NO_SIDE_EFFECTS__
  function async_derived(fn, location2) {
    let parent = (
      /** @type {Effect | null} */
      active_effect
    );
    if (parent === null) {
      async_derived_orphan();
    }
    var boundary = (
      /** @type {Boundary} */
      parent.b
    );
    var promise = (
      /** @type {Promise<V>} */
      /** @type {unknown} */
      void 0
    );
    var signal = source(
      /** @type {V} */
      UNINITIALIZED
    );
    var should_suspend = !active_reaction;
    var deferreds = /* @__PURE__ */ new Map();
    async_effect(() => {
      var d = deferred();
      promise = d.promise;
      try {
        Promise.resolve(fn()).then(d.resolve, d.reject).then(() => {
          if (batch === current_batch && batch.committed) {
            batch.deactivate();
          }
          unset_context();
        });
      } catch (error) {
        d.reject(error);
        unset_context();
      }
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      if (should_suspend) {
        var blocking = !boundary.is_pending();
        boundary.update_pending_count(1);
        batch.increment(blocking);
        deferreds.get(batch)?.reject(STALE_REACTION);
        deferreds.delete(batch);
        deferreds.set(batch, d);
      }
      const handler = (value, error = void 0) => {
        batch.activate();
        if (error) {
          if (error !== STALE_REACTION) {
            signal.f |= ERROR_VALUE;
            internal_set(signal, error);
          }
        } else {
          if ((signal.f & ERROR_VALUE) !== 0) {
            signal.f ^= ERROR_VALUE;
          }
          internal_set(signal, value);
          for (const [b, d2] of deferreds) {
            deferreds.delete(b);
            if (b === batch) break;
            d2.reject(STALE_REACTION);
          }
        }
        if (should_suspend) {
          boundary.update_pending_count(-1);
          batch.decrement(blocking);
        }
      };
      d.promise.then(handler, (e) => handler(null, e || "unknown"));
    });
    teardown(() => {
      for (const d of deferreds.values()) {
        d.reject(STALE_REACTION);
      }
    });
    {
      signal.f |= ASYNC;
    }
    return new Promise((fulfil) => {
      function next(p) {
        function go() {
          if (p === promise) {
            fulfil(signal);
          } else {
            next(promise);
          }
        }
        p.then(go, go);
      }
      next(promise);
    });
  }
  // @__NO_SIDE_EFFECTS__
  function user_derived(fn) {
    const d = /* @__PURE__ */ derived(fn);
    push_reaction_value(d);
    return d;
  }
  // @__NO_SIDE_EFFECTS__
  function derived_safe_equal(fn) {
    const signal = /* @__PURE__ */ derived(fn);
    signal.equals = safe_equals;
    return signal;
  }
  function destroy_derived_effects(derived2) {
    var effects = derived2.effects;
    if (effects !== null) {
      derived2.effects = null;
      for (var i = 0; i < effects.length; i += 1) {
        destroy_effect(
          /** @type {Effect} */
          effects[i]
        );
      }
    }
  }
  let stack = [];
  function get_derived_parent_effect(derived2) {
    var parent = derived2.parent;
    while (parent !== null) {
      if ((parent.f & DERIVED) === 0) {
        return (parent.f & DESTROYED) === 0 ? (
          /** @type {Effect} */
          parent
        ) : null;
      }
      parent = parent.parent;
    }
    return null;
  }
  function execute_derived(derived2) {
    var value;
    var prev_active_effect = active_effect;
    set_active_effect(get_derived_parent_effect(derived2));
    {
      let prev_eager_effects = eager_effects;
      set_eager_effects(/* @__PURE__ */ new Set());
      try {
        if (stack.includes(derived2)) {
          derived_references_self();
        }
        stack.push(derived2);
        derived2.f &= ~WAS_MARKED;
        destroy_derived_effects(derived2);
        value = update_reaction(derived2);
      } finally {
        set_active_effect(prev_active_effect);
        set_eager_effects(prev_eager_effects);
        stack.pop();
      }
    }
    return value;
  }
  function update_derived(derived2) {
    var value = execute_derived(derived2);
    if (!derived2.equals(value)) {
      if (!current_batch?.is_fork) {
        derived2.v = value;
      }
      derived2.wv = increment_write_version();
    }
    if (is_destroying_effect) {
      return;
    }
    if (batch_values !== null) {
      if (effect_tracking() || current_batch?.is_fork) {
        batch_values.set(derived2, value);
      }
    } else {
      var status = (derived2.f & CONNECTED) === 0 ? MAYBE_DIRTY : CLEAN;
      set_signal_status(derived2, status);
    }
  }
  let eager_effects = /* @__PURE__ */ new Set();
  const old_values = /* @__PURE__ */ new Map();
  function set_eager_effects(v) {
    eager_effects = v;
  }
  let eager_effects_deferred = false;
  function set_eager_effects_deferred() {
    eager_effects_deferred = true;
  }
  function source(v, stack2) {
    var signal = {
      f: 0,
      // TODO ideally we could skip this altogether, but it causes type errors
      v,
      reactions: null,
      equals,
      rv: 0,
      wv: 0
    };
    return signal;
  }
  // @__NO_SIDE_EFFECTS__
  function state(v, stack2) {
    const s = source(v);
    push_reaction_value(s);
    return s;
  }
  // @__NO_SIDE_EFFECTS__
  function mutable_source(initial_value, immutable = false, trackable = true) {
    const s = source(initial_value);
    if (!immutable) {
      s.equals = safe_equals;
    }
    if (legacy_mode_flag && trackable && component_context !== null && component_context.l !== null) {
      (component_context.l.s ??= []).push(s);
    }
    return s;
  }
  function set(source2, value, should_proxy = false) {
    if (active_reaction !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
    // to ensure we error if state is set inside an inspect effect
    (!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) && is_runes() && (active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 && !current_sources?.includes(source2)) {
      state_unsafe_mutation();
    }
    let new_value = should_proxy ? proxy(value) : value;
    {
      tag_proxy(
        new_value,
        /** @type {string} */
        source2.label
      );
    }
    return internal_set(source2, new_value);
  }
  function internal_set(source2, value) {
    if (!source2.equals(value)) {
      var old_value = source2.v;
      if (is_destroying_effect) {
        old_values.set(source2, value);
      } else {
        old_values.set(source2, old_value);
      }
      source2.v = value;
      var batch = Batch.ensure();
      batch.capture(source2, old_value);
      {
        if (active_effect !== null) {
          source2.updated ??= /* @__PURE__ */ new Map();
          const count = (source2.updated.get("")?.count ?? 0) + 1;
          source2.updated.set("", { error: (
            /** @type {any} */
            null
          ), count });
          if (count > 5) {
            const error = get_error("updated at");
            if (error !== null) {
              let entry = source2.updated.get(error.stack);
              if (!entry) {
                entry = { error, count: 0 };
                source2.updated.set(error.stack, entry);
              }
              entry.count++;
            }
          }
        }
        if (active_effect !== null) {
          source2.set_during_effect = true;
        }
      }
      if ((source2.f & DERIVED) !== 0) {
        if ((source2.f & DIRTY) !== 0) {
          execute_derived(
            /** @type {Derived} */
            source2
          );
        }
        set_signal_status(source2, (source2.f & CONNECTED) !== 0 ? CLEAN : MAYBE_DIRTY);
      }
      source2.wv = increment_write_version();
      mark_reactions(source2, DIRTY);
      if (is_runes() && active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
        if (untracked_writes === null) {
          set_untracked_writes([source2]);
        } else {
          untracked_writes.push(source2);
        }
      }
      if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
        flush_eager_effects();
      }
    }
    return value;
  }
  function flush_eager_effects() {
    eager_effects_deferred = false;
    var prev_is_updating_effect = is_updating_effect;
    set_is_updating_effect(true);
    const inspects = Array.from(eager_effects);
    try {
      for (const effect2 of inspects) {
        if ((effect2.f & CLEAN) !== 0) {
          set_signal_status(effect2, MAYBE_DIRTY);
        }
        if (is_dirty(effect2)) {
          update_effect(effect2);
        }
      }
    } finally {
      set_is_updating_effect(prev_is_updating_effect);
    }
    eager_effects.clear();
  }
  function update(source2, d = 1) {
    var value = get(source2);
    var result2 = d === 1 ? value++ : value--;
    set(source2, value);
    return result2;
  }
  function increment(source2) {
    set(source2, source2.v + 1);
  }
  function mark_reactions(signal, status) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    var runes = is_runes();
    var length = reactions.length;
    for (var i = 0; i < length; i++) {
      var reaction = reactions[i];
      var flags = reaction.f;
      if (!runes && reaction === active_effect) continue;
      if ((flags & EAGER_EFFECT) !== 0) {
        eager_effects.add(reaction);
        continue;
      }
      var not_dirty = (flags & DIRTY) === 0;
      if (not_dirty) {
        set_signal_status(reaction, status);
      }
      if ((flags & DERIVED) !== 0) {
        var derived2 = (
          /** @type {Derived} */
          reaction
        );
        batch_values?.delete(derived2);
        if ((flags & WAS_MARKED) === 0) {
          if (flags & CONNECTED) {
            reaction.f |= WAS_MARKED;
          }
          mark_reactions(derived2, MAYBE_DIRTY);
        }
      } else if (not_dirty) {
        if ((flags & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
          eager_block_effects.add(
            /** @type {Effect} */
            reaction
          );
        }
        schedule_effect(
          /** @type {Effect} */
          reaction
        );
      }
    }
  }
  const regex_is_valid_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
  function proxy(value) {
    if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
      return value;
    }
    const prototype = get_prototype_of(value);
    if (prototype !== object_prototype && prototype !== array_prototype) {
      return value;
    }
    var sources = /* @__PURE__ */ new Map();
    var is_proxied_array = is_array(value);
    var version = /* @__PURE__ */ state(0);
    var parent_version = update_version;
    var with_parent = (fn) => {
      if (update_version === parent_version) {
        return fn();
      }
      var reaction = active_reaction;
      var version2 = update_version;
      set_active_reaction(null);
      set_update_version(parent_version);
      var result2 = fn();
      set_active_reaction(reaction);
      set_update_version(version2);
      return result2;
    };
    if (is_proxied_array) {
      sources.set("length", /* @__PURE__ */ state(
        /** @type {any[]} */
        value.length
      ));
      {
        value = /** @type {any} */
        inspectable_array(
          /** @type {any[]} */
          value
        );
      }
    }
    var path = "";
    let updating = false;
    function update_path(new_path) {
      if (updating) return;
      updating = true;
      path = new_path;
      tag(version, `${path} version`);
      for (const [prop2, source2] of sources) {
        tag(source2, get_label(path, prop2));
      }
      updating = false;
    }
    return new Proxy(
      /** @type {any} */
      value,
      {
        defineProperty(_, prop2, descriptor) {
          if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
            state_descriptors_fixed();
          }
          var s = sources.get(prop2);
          if (s === void 0) {
            s = with_parent(() => {
              var s2 = /* @__PURE__ */ state(descriptor.value);
              sources.set(prop2, s2);
              if (typeof prop2 === "string") {
                tag(s2, get_label(path, prop2));
              }
              return s2;
            });
          } else {
            set(s, descriptor.value, true);
          }
          return true;
        },
        deleteProperty(target, prop2) {
          var s = sources.get(prop2);
          if (s === void 0) {
            if (prop2 in target) {
              const s2 = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
              sources.set(prop2, s2);
              increment(version);
              {
                tag(s2, get_label(path, prop2));
              }
            }
          } else {
            set(s, UNINITIALIZED);
            increment(version);
          }
          return true;
        },
        get(target, prop2, receiver) {
          if (prop2 === STATE_SYMBOL) {
            return value;
          }
          if (prop2 === PROXY_PATH_SYMBOL) {
            return update_path;
          }
          var s = sources.get(prop2);
          var exists = prop2 in target;
          if (s === void 0 && (!exists || get_descriptor(target, prop2)?.writable)) {
            s = with_parent(() => {
              var p = proxy(exists ? target[prop2] : UNINITIALIZED);
              var s2 = /* @__PURE__ */ state(p);
              {
                tag(s2, get_label(path, prop2));
              }
              return s2;
            });
            sources.set(prop2, s);
          }
          if (s !== void 0) {
            var v = get(s);
            return v === UNINITIALIZED ? void 0 : v;
          }
          return Reflect.get(target, prop2, receiver);
        },
        getOwnPropertyDescriptor(target, prop2) {
          var descriptor = Reflect.getOwnPropertyDescriptor(target, prop2);
          if (descriptor && "value" in descriptor) {
            var s = sources.get(prop2);
            if (s) descriptor.value = get(s);
          } else if (descriptor === void 0) {
            var source2 = sources.get(prop2);
            var value2 = source2?.v;
            if (source2 !== void 0 && value2 !== UNINITIALIZED) {
              return {
                enumerable: true,
                configurable: true,
                value: value2,
                writable: true
              };
            }
          }
          return descriptor;
        },
        has(target, prop2) {
          if (prop2 === STATE_SYMBOL) {
            return true;
          }
          var s = sources.get(prop2);
          var has = s !== void 0 && s.v !== UNINITIALIZED || Reflect.has(target, prop2);
          if (s !== void 0 || active_effect !== null && (!has || get_descriptor(target, prop2)?.writable)) {
            if (s === void 0) {
              s = with_parent(() => {
                var p = has ? proxy(target[prop2]) : UNINITIALIZED;
                var s2 = /* @__PURE__ */ state(p);
                {
                  tag(s2, get_label(path, prop2));
                }
                return s2;
              });
              sources.set(prop2, s);
            }
            var value2 = get(s);
            if (value2 === UNINITIALIZED) {
              return false;
            }
          }
          return has;
        },
        set(target, prop2, value2, receiver) {
          var s = sources.get(prop2);
          var has = prop2 in target;
          if (is_proxied_array && prop2 === "length") {
            for (var i = value2; i < /** @type {Source<number>} */
            s.v; i += 1) {
              var other_s = sources.get(i + "");
              if (other_s !== void 0) {
                set(other_s, UNINITIALIZED);
              } else if (i in target) {
                other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
                sources.set(i + "", other_s);
                {
                  tag(other_s, get_label(path, i));
                }
              }
            }
          }
          if (s === void 0) {
            if (!has || get_descriptor(target, prop2)?.writable) {
              s = with_parent(() => /* @__PURE__ */ state(void 0));
              {
                tag(s, get_label(path, prop2));
              }
              set(s, proxy(value2));
              sources.set(prop2, s);
            }
          } else {
            has = s.v !== UNINITIALIZED;
            var p = with_parent(() => proxy(value2));
            set(s, p);
          }
          var descriptor = Reflect.getOwnPropertyDescriptor(target, prop2);
          if (descriptor?.set) {
            descriptor.set.call(receiver, value2);
          }
          if (!has) {
            if (is_proxied_array && typeof prop2 === "string") {
              var ls = (
                /** @type {Source<number>} */
                sources.get("length")
              );
              var n = Number(prop2);
              if (Number.isInteger(n) && n >= ls.v) {
                set(ls, n + 1);
              }
            }
            increment(version);
          }
          return true;
        },
        ownKeys(target) {
          get(version);
          var own_keys = Reflect.ownKeys(target).filter((key2) => {
            var source3 = sources.get(key2);
            return source3 === void 0 || source3.v !== UNINITIALIZED;
          });
          for (var [key, source2] of sources) {
            if (source2.v !== UNINITIALIZED && !(key in target)) {
              own_keys.push(key);
            }
          }
          return own_keys;
        },
        setPrototypeOf() {
          state_prototype_fixed();
        }
      }
    );
  }
  function get_label(path, prop2) {
    if (typeof prop2 === "symbol") return `${path}[Symbol(${prop2.description ?? ""})]`;
    if (regex_is_valid_identifier.test(prop2)) return `${path}.${prop2}`;
    return /^\d+$/.test(prop2) ? `${path}[${prop2}]` : `${path}['${prop2}']`;
  }
  function get_proxied_value(value) {
    try {
      if (value !== null && typeof value === "object" && STATE_SYMBOL in value) {
        return value[STATE_SYMBOL];
      }
    } catch {
    }
    return value;
  }
  function is(a, b) {
    return Object.is(get_proxied_value(a), get_proxied_value(b));
  }
  const ARRAY_MUTATING_METHODS = /* @__PURE__ */ new Set([
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift"
  ]);
  function inspectable_array(array) {
    return new Proxy(array, {
      get(target, prop2, receiver) {
        var value = Reflect.get(target, prop2, receiver);
        if (!ARRAY_MUTATING_METHODS.has(
          /** @type {string} */
          prop2
        )) {
          return value;
        }
        return function(...args) {
          set_eager_effects_deferred();
          var result2 = value.apply(this, args);
          flush_eager_effects();
          return result2;
        };
      }
    });
  }
  function strict_equals(a, b, equal = true) {
    try {
      if (a === b !== (get_proxied_value(a) === get_proxied_value(b))) {
        state_proxy_equality_mismatch(equal ? "===" : "!==");
      }
    } catch {
    }
    return a === b === equal;
  }
  var is_firefox;
  var first_child_getter;
  var next_sibling_getter;
  function create_text(value = "") {
    return document.createTextNode(value);
  }
  // @__NO_SIDE_EFFECTS__
  function get_first_child(node) {
    return first_child_getter.call(node);
  }
  // @__NO_SIDE_EFFECTS__
  function get_next_sibling(node) {
    return next_sibling_getter.call(node);
  }
  function child(node, is_text) {
    {
      return /* @__PURE__ */ get_first_child(node);
    }
  }
  function first_child(fragment, is_text = false) {
    {
      var first = (
        /** @type {DocumentFragment} */
        /* @__PURE__ */ get_first_child(
          /** @type {Node} */
          fragment
        )
      );
      if (first instanceof Comment && first.data === "") return /* @__PURE__ */ get_next_sibling(first);
      return first;
    }
  }
  function sibling(node, count = 1, is_text = false) {
    let next_sibling = node;
    while (count--) {
      next_sibling = /** @type {TemplateNode} */
      /* @__PURE__ */ get_next_sibling(next_sibling);
    }
    {
      return next_sibling;
    }
  }
  function clear_text_content(node) {
    node.textContent = "";
  }
  function should_defer_append() {
    return false;
  }
  function autofocus(dom, value) {
    if (value) {
      const body = document.body;
      dom.autofocus = true;
      queue_micro_task(() => {
        if (document.activeElement === body) {
          dom.focus();
        }
      });
    }
  }
  let listening_to_form_reset = false;
  function add_form_reset_listener() {
    if (!listening_to_form_reset) {
      listening_to_form_reset = true;
      document.addEventListener(
        "reset",
        (evt) => {
          Promise.resolve().then(() => {
            if (!evt.defaultPrevented) {
              for (
                const e of
                /**@type {HTMLFormElement} */
                evt.target.elements
              ) {
                e.__on_r?.();
              }
            }
          });
        },
        // In the capture phase to guarantee we get noticed of it (no possibility of stopPropagation)
        { capture: true }
      );
    }
  }
  function without_reactive_context(fn) {
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      return fn();
    } finally {
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  function listen_to_event_and_reset_event(element2, event2, handler, on_reset = handler) {
    element2.addEventListener(event2, () => without_reactive_context(handler));
    const prev = element2.__on_r;
    if (prev) {
      element2.__on_r = () => {
        prev();
        on_reset(true);
      };
    } else {
      element2.__on_r = () => on_reset(true);
    }
    add_form_reset_listener();
  }
  function validate_effect(rune) {
    if (active_effect === null) {
      if (active_reaction === null) {
        effect_orphan(rune);
      }
      effect_in_unowned_derived();
    }
    if (is_destroying_effect) {
      effect_in_teardown(rune);
    }
  }
  function push_effect(effect2, parent_effect) {
    var parent_last = parent_effect.last;
    if (parent_last === null) {
      parent_effect.last = parent_effect.first = effect2;
    } else {
      parent_last.next = effect2;
      effect2.prev = parent_last;
      parent_effect.last = effect2;
    }
  }
  function create_effect(type, fn, sync) {
    var parent = active_effect;
    {
      while (parent !== null && (parent.f & EAGER_EFFECT) !== 0) {
        parent = parent.parent;
      }
    }
    if (parent !== null && (parent.f & INERT) !== 0) {
      type |= INERT;
    }
    var effect2 = {
      ctx: component_context,
      deps: null,
      nodes_start: null,
      nodes_end: null,
      f: type | DIRTY | CONNECTED,
      first: null,
      fn,
      last: null,
      next: null,
      parent,
      b: parent && parent.b,
      prev: null,
      teardown: null,
      transitions: null,
      wv: 0,
      ac: null
    };
    {
      effect2.component_function = dev_current_component_function;
    }
    if (sync) {
      try {
        update_effect(effect2);
        effect2.f |= EFFECT_RAN;
      } catch (e2) {
        destroy_effect(effect2);
        throw e2;
      }
    } else if (fn !== null) {
      schedule_effect(effect2);
    }
    var e = effect2;
    if (sync && e.deps === null && e.teardown === null && e.nodes_start === null && e.first === e.last && // either `null`, or a singular child
    (e.f & EFFECT_PRESERVED) === 0) {
      e = e.first;
      if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
        e.f |= EFFECT_TRANSPARENT;
      }
    }
    if (e !== null) {
      e.parent = parent;
      if (parent !== null) {
        push_effect(e, parent);
      }
      if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
        var derived2 = (
          /** @type {Derived} */
          active_reaction
        );
        (derived2.effects ??= []).push(e);
      }
    }
    return effect2;
  }
  function effect_tracking() {
    return active_reaction !== null && !untracking;
  }
  function teardown(fn) {
    const effect2 = create_effect(RENDER_EFFECT, null, false);
    set_signal_status(effect2, CLEAN);
    effect2.teardown = fn;
    return effect2;
  }
  function user_effect(fn) {
    validate_effect("$effect");
    {
      define_property(fn, "name", {
        value: "$effect"
      });
    }
    var flags = (
      /** @type {Effect} */
      active_effect.f
    );
    var defer = !active_reaction && (flags & BRANCH_EFFECT) !== 0 && (flags & EFFECT_RAN) === 0;
    if (defer) {
      var context = (
        /** @type {ComponentContext} */
        component_context
      );
      (context.e ??= []).push(fn);
    } else {
      return create_user_effect(fn);
    }
  }
  function create_user_effect(fn) {
    return create_effect(EFFECT | USER_EFFECT, fn, false);
  }
  function user_pre_effect(fn) {
    validate_effect("$effect.pre");
    {
      define_property(fn, "name", {
        value: "$effect.pre"
      });
    }
    return create_effect(RENDER_EFFECT | USER_EFFECT, fn, true);
  }
  function effect(fn) {
    return create_effect(EFFECT, fn, false);
  }
  function legacy_pre_effect(deps, fn) {
    var context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    var token = { effect: null, ran: false, deps };
    context.l.$.push(token);
    token.effect = render_effect(() => {
      deps();
      if (token.ran) return;
      token.ran = true;
      untrack(fn);
    });
  }
  function legacy_pre_effect_reset() {
    var context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    render_effect(() => {
      for (var token of context.l.$) {
        token.deps();
        var effect2 = token.effect;
        if ((effect2.f & CLEAN) !== 0) {
          set_signal_status(effect2, MAYBE_DIRTY);
        }
        if (is_dirty(effect2)) {
          update_effect(effect2);
        }
        token.ran = false;
      }
    });
  }
  function async_effect(fn) {
    return create_effect(ASYNC | EFFECT_PRESERVED, fn, true);
  }
  function render_effect(fn, flags = 0) {
    return create_effect(RENDER_EFFECT | flags, fn, true);
  }
  function template_effect(fn, sync = [], async = [], blockers = []) {
    flatten(blockers, sync, async, (values) => {
      create_effect(RENDER_EFFECT, () => fn(...values.map(get)), true);
    });
  }
  function block(fn, flags = 0) {
    var effect2 = create_effect(BLOCK_EFFECT | flags, fn, true);
    {
      effect2.dev_stack = dev_stack;
    }
    return effect2;
  }
  function managed(fn, flags = 0) {
    var effect2 = create_effect(MANAGED_EFFECT | flags, fn, true);
    {
      effect2.dev_stack = dev_stack;
    }
    return effect2;
  }
  function branch(fn) {
    return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn, true);
  }
  function execute_effect_teardown(effect2) {
    var teardown2 = effect2.teardown;
    if (teardown2 !== null) {
      const previously_destroying_effect = is_destroying_effect;
      const previous_reaction = active_reaction;
      set_is_destroying_effect(true);
      set_active_reaction(null);
      try {
        teardown2.call(null);
      } finally {
        set_is_destroying_effect(previously_destroying_effect);
        set_active_reaction(previous_reaction);
      }
    }
  }
  function destroy_effect_children(signal, remove_dom = false) {
    var effect2 = signal.first;
    signal.first = signal.last = null;
    while (effect2 !== null) {
      const controller = effect2.ac;
      if (controller !== null) {
        without_reactive_context(() => {
          controller.abort(STALE_REACTION);
        });
      }
      var next = effect2.next;
      if ((effect2.f & ROOT_EFFECT) !== 0) {
        effect2.parent = null;
      } else {
        destroy_effect(effect2, remove_dom);
      }
      effect2 = next;
    }
  }
  function destroy_block_effect_children(signal) {
    var effect2 = signal.first;
    while (effect2 !== null) {
      var next = effect2.next;
      if ((effect2.f & BRANCH_EFFECT) === 0) {
        destroy_effect(effect2);
      }
      effect2 = next;
    }
  }
  function destroy_effect(effect2, remove_dom = true) {
    var removed = false;
    if ((remove_dom || (effect2.f & HEAD_EFFECT) !== 0) && effect2.nodes_start !== null && effect2.nodes_end !== null) {
      remove_effect_dom(
        effect2.nodes_start,
        /** @type {TemplateNode} */
        effect2.nodes_end
      );
      removed = true;
    }
    destroy_effect_children(effect2, remove_dom && !removed);
    remove_reactions(effect2, 0);
    set_signal_status(effect2, DESTROYED);
    var transitions = effect2.transitions;
    if (transitions !== null) {
      for (const transition of transitions) {
        transition.stop();
      }
    }
    execute_effect_teardown(effect2);
    var parent = effect2.parent;
    if (parent !== null && parent.first !== null) {
      unlink_effect(effect2);
    }
    {
      effect2.component_function = null;
    }
    effect2.next = effect2.prev = effect2.teardown = effect2.ctx = effect2.deps = effect2.fn = effect2.nodes_start = effect2.nodes_end = effect2.ac = null;
  }
  function remove_effect_dom(node, end) {
    while (node !== null) {
      var next = node === end ? null : (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      node.remove();
      node = next;
    }
  }
  function unlink_effect(effect2) {
    var parent = effect2.parent;
    var prev = effect2.prev;
    var next = effect2.next;
    if (prev !== null) prev.next = next;
    if (next !== null) next.prev = prev;
    if (parent !== null) {
      if (parent.first === effect2) parent.first = next;
      if (parent.last === effect2) parent.last = prev;
    }
  }
  function pause_effect(effect2, callback, destroy = true) {
    var transitions = [];
    pause_children(effect2, transitions, true);
    run_out_transitions(transitions, () => {
      if (destroy) destroy_effect(effect2);
      if (callback) callback();
    });
  }
  function run_out_transitions(transitions, fn) {
    var remaining = transitions.length;
    if (remaining > 0) {
      var check = () => --remaining || fn();
      for (var transition of transitions) {
        transition.out(check);
      }
    } else {
      fn();
    }
  }
  function pause_children(effect2, transitions, local) {
    if ((effect2.f & INERT) !== 0) return;
    effect2.f ^= INERT;
    if (effect2.transitions !== null) {
      for (const transition of effect2.transitions) {
        if (transition.is_global || local) {
          transitions.push(transition);
        }
      }
    }
    var child2 = effect2.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || // If this is a branch effect without a block effect parent,
      // it means the parent block effect was pruned. In that case,
      // transparency information was transferred to the branch effect.
      (child2.f & BRANCH_EFFECT) !== 0 && (effect2.f & BLOCK_EFFECT) !== 0;
      pause_children(child2, transitions, transparent ? local : false);
      child2 = sibling2;
    }
  }
  function resume_effect(effect2) {
    resume_children(effect2, true);
  }
  function resume_children(effect2, local) {
    if ((effect2.f & INERT) === 0) return;
    effect2.f ^= INERT;
    if ((effect2.f & CLEAN) === 0) {
      set_signal_status(effect2, DIRTY);
      schedule_effect(effect2);
    }
    var child2 = effect2.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || (child2.f & BRANCH_EFFECT) !== 0;
      resume_children(child2, transparent ? local : false);
      child2 = sibling2;
    }
    if (effect2.transitions !== null) {
      for (const transition of effect2.transitions) {
        if (transition.is_global || local) {
          transition.in();
        }
      }
    }
  }
  function move_effect(effect2, fragment) {
    var node = effect2.nodes_start;
    var end = effect2.nodes_end;
    while (node !== null) {
      var next = node === end ? null : (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      fragment.append(node);
      node = next;
    }
  }
  let is_updating_effect = false;
  function set_is_updating_effect(value) {
    is_updating_effect = value;
  }
  let is_destroying_effect = false;
  function set_is_destroying_effect(value) {
    is_destroying_effect = value;
  }
  let active_reaction = null;
  let untracking = false;
  function set_active_reaction(reaction) {
    active_reaction = reaction;
  }
  let active_effect = null;
  function set_active_effect(effect2) {
    active_effect = effect2;
  }
  let current_sources = null;
  function push_reaction_value(value) {
    if (active_reaction !== null && true) {
      if (current_sources === null) {
        current_sources = [value];
      } else {
        current_sources.push(value);
      }
    }
  }
  let new_deps = null;
  let skipped_deps = 0;
  let untracked_writes = null;
  function set_untracked_writes(value) {
    untracked_writes = value;
  }
  let write_version = 1;
  let read_version = 0;
  let update_version = read_version;
  function set_update_version(value) {
    update_version = value;
  }
  function increment_write_version() {
    return ++write_version;
  }
  function is_dirty(reaction) {
    var flags = reaction.f;
    if ((flags & DIRTY) !== 0) {
      return true;
    }
    if (flags & DERIVED) {
      reaction.f &= ~WAS_MARKED;
    }
    if ((flags & MAYBE_DIRTY) !== 0) {
      var dependencies = reaction.deps;
      if (dependencies !== null) {
        var length = dependencies.length;
        for (var i = 0; i < length; i++) {
          var dependency = dependencies[i];
          if (is_dirty(
            /** @type {Derived} */
            dependency
          )) {
            update_derived(
              /** @type {Derived} */
              dependency
            );
          }
          if (dependency.wv > reaction.wv) {
            return true;
          }
        }
      }
      if ((flags & CONNECTED) !== 0 && // During time traveling we don't want to reset the status so that
      // traversal of the graph in the other batches still happens
      batch_values === null) {
        set_signal_status(reaction, CLEAN);
      }
    }
    return false;
  }
  function schedule_possible_effect_self_invalidation(signal, effect2, root2 = true) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    if (current_sources?.includes(signal)) {
      return;
    }
    for (var i = 0; i < reactions.length; i++) {
      var reaction = reactions[i];
      if ((reaction.f & DERIVED) !== 0) {
        schedule_possible_effect_self_invalidation(
          /** @type {Derived} */
          reaction,
          effect2,
          false
        );
      } else if (effect2 === reaction) {
        if (root2) {
          set_signal_status(reaction, DIRTY);
        } else if ((reaction.f & CLEAN) !== 0) {
          set_signal_status(reaction, MAYBE_DIRTY);
        }
        schedule_effect(
          /** @type {Effect} */
          reaction
        );
      }
    }
  }
  function update_reaction(reaction) {
    var previous_deps = new_deps;
    var previous_skipped_deps = skipped_deps;
    var previous_untracked_writes = untracked_writes;
    var previous_reaction = active_reaction;
    var previous_sources = current_sources;
    var previous_component_context = component_context;
    var previous_untracking = untracking;
    var previous_update_version = update_version;
    var flags = reaction.f;
    new_deps = /** @type {null | Value[]} */
    null;
    skipped_deps = 0;
    untracked_writes = null;
    active_reaction = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
    current_sources = null;
    set_component_context(reaction.ctx);
    untracking = false;
    update_version = ++read_version;
    if (reaction.ac !== null) {
      without_reactive_context(() => {
        reaction.ac.abort(STALE_REACTION);
      });
      reaction.ac = null;
    }
    try {
      reaction.f |= REACTION_IS_UPDATING;
      var fn = (
        /** @type {Function} */
        reaction.fn
      );
      var result2 = fn();
      var deps = reaction.deps;
      if (new_deps !== null) {
        var i;
        remove_reactions(reaction, skipped_deps);
        if (deps !== null && skipped_deps > 0) {
          deps.length = skipped_deps + new_deps.length;
          for (i = 0; i < new_deps.length; i++) {
            deps[skipped_deps + i] = new_deps[i];
          }
        } else {
          reaction.deps = deps = new_deps;
        }
        if (is_updating_effect && effect_tracking() && (reaction.f & CONNECTED) !== 0) {
          for (i = skipped_deps; i < deps.length; i++) {
            (deps[i].reactions ??= []).push(reaction);
          }
        }
      } else if (deps !== null && skipped_deps < deps.length) {
        remove_reactions(reaction, skipped_deps);
        deps.length = skipped_deps;
      }
      if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
        for (i = 0; i < /** @type {Source[]} */
        untracked_writes.length; i++) {
          schedule_possible_effect_self_invalidation(
            untracked_writes[i],
            /** @type {Effect} */
            reaction
          );
        }
      }
      if (previous_reaction !== null && previous_reaction !== reaction) {
        read_version++;
        if (untracked_writes !== null) {
          if (previous_untracked_writes === null) {
            previous_untracked_writes = untracked_writes;
          } else {
            previous_untracked_writes.push(.../** @type {Source[]} */
            untracked_writes);
          }
        }
      }
      if ((reaction.f & ERROR_VALUE) !== 0) {
        reaction.f ^= ERROR_VALUE;
      }
      return result2;
    } catch (error) {
      return handle_error(error);
    } finally {
      reaction.f ^= REACTION_IS_UPDATING;
      new_deps = previous_deps;
      skipped_deps = previous_skipped_deps;
      untracked_writes = previous_untracked_writes;
      active_reaction = previous_reaction;
      current_sources = previous_sources;
      set_component_context(previous_component_context);
      untracking = previous_untracking;
      update_version = previous_update_version;
    }
  }
  function remove_reaction(signal, dependency) {
    let reactions = dependency.reactions;
    if (reactions !== null) {
      var index2 = index_of.call(reactions, signal);
      if (index2 !== -1) {
        var new_length = reactions.length - 1;
        if (new_length === 0) {
          reactions = dependency.reactions = null;
        } else {
          reactions[index2] = reactions[new_length];
          reactions.pop();
        }
      }
    }
    if (reactions === null && (dependency.f & DERIVED) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
    // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
    // allows us to skip the expensive work of disconnecting and immediately reconnecting it
    (new_deps === null || !new_deps.includes(dependency))) {
      set_signal_status(dependency, MAYBE_DIRTY);
      if ((dependency.f & CONNECTED) !== 0) {
        dependency.f ^= CONNECTED;
        dependency.f &= ~WAS_MARKED;
      }
      destroy_derived_effects(
        /** @type {Derived} **/
        dependency
      );
      remove_reactions(
        /** @type {Derived} **/
        dependency,
        0
      );
    }
  }
  function remove_reactions(signal, start_index) {
    var dependencies = signal.deps;
    if (dependencies === null) return;
    for (var i = start_index; i < dependencies.length; i++) {
      remove_reaction(signal, dependencies[i]);
    }
  }
  function update_effect(effect2) {
    var flags = effect2.f;
    if ((flags & DESTROYED) !== 0) {
      return;
    }
    set_signal_status(effect2, CLEAN);
    var previous_effect = active_effect;
    var was_updating_effect = is_updating_effect;
    active_effect = effect2;
    is_updating_effect = true;
    {
      var previous_component_fn = dev_current_component_function;
      set_dev_current_component_function(effect2.component_function);
      var previous_stack = (
        /** @type {any} */
        dev_stack
      );
      set_dev_stack(effect2.dev_stack ?? dev_stack);
    }
    try {
      if ((flags & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
        destroy_block_effect_children(effect2);
      } else {
        destroy_effect_children(effect2);
      }
      execute_effect_teardown(effect2);
      var teardown2 = update_reaction(effect2);
      effect2.teardown = typeof teardown2 === "function" ? teardown2 : null;
      effect2.wv = write_version;
      var dep;
      if (DEV && tracing_mode_flag && (effect2.f & DIRTY) !== 0 && effect2.deps !== null) ;
    } finally {
      is_updating_effect = was_updating_effect;
      active_effect = previous_effect;
      {
        set_dev_current_component_function(previous_component_fn);
        set_dev_stack(previous_stack);
      }
    }
  }
  async function tick() {
    await Promise.resolve();
    flushSync();
  }
  function get(signal) {
    var flags = signal.f;
    var is_derived = (flags & DERIVED) !== 0;
    if (active_reaction !== null && !untracking) {
      var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
      if (!destroyed && !current_sources?.includes(signal)) {
        var deps = active_reaction.deps;
        if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
          if (signal.rv < read_version) {
            signal.rv = read_version;
            if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
              skipped_deps++;
            } else if (new_deps === null) {
              new_deps = [signal];
            } else if (!new_deps.includes(signal)) {
              new_deps.push(signal);
            }
          }
        } else {
          (active_reaction.deps ??= []).push(signal);
          var reactions = signal.reactions;
          if (reactions === null) {
            signal.reactions = [active_reaction];
          } else if (!reactions.includes(active_reaction)) {
            reactions.push(active_reaction);
          }
        }
      }
    }
    {
      recent_async_deriveds.delete(signal);
    }
    if (is_destroying_effect) {
      if (old_values.has(signal)) {
        return old_values.get(signal);
      }
      if (is_derived) {
        var derived2 = (
          /** @type {Derived} */
          signal
        );
        var value = derived2.v;
        if ((derived2.f & CLEAN) === 0 && derived2.reactions !== null || depends_on_old_values(derived2)) {
          value = execute_derived(derived2);
        }
        old_values.set(derived2, value);
        return value;
      }
    } else if (is_derived && (!batch_values?.has(signal) || current_batch?.is_fork && !effect_tracking())) {
      derived2 = /** @type {Derived} */
      signal;
      if (is_dirty(derived2)) {
        update_derived(derived2);
      }
      if (is_updating_effect && effect_tracking() && (derived2.f & CONNECTED) === 0) {
        reconnect(derived2);
      }
    }
    if (batch_values?.has(signal)) {
      return batch_values.get(signal);
    }
    if ((signal.f & ERROR_VALUE) !== 0) {
      throw signal.v;
    }
    return signal.v;
  }
  function reconnect(derived2) {
    if (derived2.deps === null) return;
    derived2.f ^= CONNECTED;
    for (const dep of derived2.deps) {
      (dep.reactions ??= []).push(derived2);
      if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
        reconnect(
          /** @type {Derived} */
          dep
        );
      }
    }
  }
  function depends_on_old_values(derived2) {
    if (derived2.v === UNINITIALIZED) return true;
    if (derived2.deps === null) return false;
    for (const dep of derived2.deps) {
      if (old_values.has(dep)) {
        return true;
      }
      if ((dep.f & DERIVED) !== 0 && depends_on_old_values(
        /** @type {Derived} */
        dep
      )) {
        return true;
      }
    }
    return false;
  }
  function untrack(fn) {
    var previous_untracking = untracking;
    try {
      untracking = true;
      return fn();
    } finally {
      untracking = previous_untracking;
    }
  }
  const STATUS_MASK = -7169;
  function set_signal_status(signal, status) {
    signal.f = signal.f & STATUS_MASK | status;
  }
  function deep_read_state(value) {
    if (typeof value !== "object" || !value || value instanceof EventTarget) {
      return;
    }
    if (STATE_SYMBOL in value) {
      deep_read(value);
    } else if (!Array.isArray(value)) {
      for (let key in value) {
        const prop2 = value[key];
        if (typeof prop2 === "object" && prop2 && STATE_SYMBOL in prop2) {
          deep_read(prop2);
        }
      }
    }
  }
  function deep_read(value, visited = /* @__PURE__ */ new Set()) {
    if (typeof value === "object" && value !== null && // We don't want to traverse DOM elements
    !(value instanceof EventTarget) && !visited.has(value)) {
      visited.add(value);
      if (value instanceof Date) {
        value.getTime();
      }
      for (let key in value) {
        try {
          deep_read(value[key], visited);
        } catch (e) {
        }
      }
      const proto = get_prototype_of(value);
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== Map.prototype && proto !== Set.prototype && proto !== Date.prototype) {
        const descriptors = get_descriptors(proto);
        for (let key in descriptors) {
          const get2 = descriptors[key].get;
          if (get2) {
            try {
              get2.call(value);
            } catch (e) {
            }
          }
        }
      }
    }
  }
  const all_registered_events = /* @__PURE__ */ new Set();
  const root_event_handles = /* @__PURE__ */ new Set();
  function create_event(event_name, dom, handler, options = {}) {
    function target_handler(event2) {
      if (!options.capture) {
        handle_event_propagation.call(dom, event2);
      }
      if (!event2.cancelBubble) {
        return without_reactive_context(() => {
          return handler?.call(this, event2);
        });
      }
    }
    if (event_name.startsWith("pointer") || event_name.startsWith("touch") || event_name === "wheel") {
      queue_micro_task(() => {
        dom.addEventListener(event_name, target_handler, options);
      });
    } else {
      dom.addEventListener(event_name, target_handler, options);
    }
    return target_handler;
  }
  function event(event_name, dom, handler, capture2, passive) {
    var options = { capture: capture2, passive };
    var target_handler = create_event(event_name, dom, handler, options);
    if (dom === document.body || // @ts-ignore
    dom === window || // @ts-ignore
    dom === document || // Firefox has quirky behavior, it can happen that we still get "canplay" events when the element is already removed
    dom instanceof HTMLMediaElement) {
      teardown(() => {
        dom.removeEventListener(event_name, target_handler, options);
      });
    }
  }
  function delegate(events) {
    for (var i = 0; i < events.length; i++) {
      all_registered_events.add(events[i]);
    }
    for (var fn of root_event_handles) {
      fn(events);
    }
  }
  let last_propagated_event = null;
  function handle_event_propagation(event2) {
    var handler_element = this;
    var owner_document = (
      /** @type {Node} */
      handler_element.ownerDocument
    );
    var event_name = event2.type;
    var path = event2.composedPath?.() || [];
    var current_target = (
      /** @type {null | Element} */
      path[0] || event2.target
    );
    last_propagated_event = event2;
    var path_idx = 0;
    var handled_at = last_propagated_event === event2 && event2.__root;
    if (handled_at) {
      var at_idx = path.indexOf(handled_at);
      if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */
      window)) {
        event2.__root = handler_element;
        return;
      }
      var handler_idx = path.indexOf(handler_element);
      if (handler_idx === -1) {
        return;
      }
      if (at_idx <= handler_idx) {
        path_idx = at_idx;
      }
    }
    current_target = /** @type {Element} */
    path[path_idx] || event2.target;
    if (current_target === handler_element) return;
    define_property(event2, "currentTarget", {
      configurable: true,
      get() {
        return current_target || owner_document;
      }
    });
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      var throw_error;
      var other_errors = [];
      while (current_target !== null) {
        var parent_element = current_target.assignedSlot || current_target.parentNode || /** @type {any} */
        current_target.host || null;
        try {
          var delegated = current_target["__" + event_name];
          if (delegated != null && (!/** @type {any} */
          current_target.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
          // -> the target could not have been disabled because it emits the event in the first place
          event2.target === current_target)) {
            delegated.call(current_target, event2);
          }
        } catch (error) {
          if (throw_error) {
            other_errors.push(error);
          } else {
            throw_error = error;
          }
        }
        if (event2.cancelBubble || parent_element === handler_element || parent_element === null) {
          break;
        }
        current_target = parent_element;
      }
      if (throw_error) {
        for (let error of other_errors) {
          queueMicrotask(() => {
            throw error;
          });
        }
        throw throw_error;
      }
    } finally {
      event2.__root = handler_element;
      delete event2.currentTarget;
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  function apply(thunk, element2, args, component, loc, has_side_effects = false, remove_parens = false) {
    let handler;
    let error;
    try {
      handler = thunk();
    } catch (e) {
      error = e;
    }
    if (typeof handler !== "function" && (has_side_effects || handler != null || error)) {
      const filename = component?.[FILENAME];
      const location2 = loc ? ` at ${filename}:${loc[0]}:${loc[1]}` : ` in ${filename}`;
      const phase = args[0]?.eventPhase < Event.BUBBLING_PHASE ? "capture" : "";
      const event_name = args[0]?.type + phase;
      const description = `\`${event_name}\` handler${location2}`;
      const suggestion = remove_parens ? "remove the trailing `()`" : "add a leading `() =>`";
      event_handler_invalid(description, suggestion);
      if (error) {
        throw error;
      }
    }
    handler?.apply(element2, args);
  }
  function create_fragment_from_html(html) {
    var elem = document.createElement("template");
    elem.innerHTML = html.replaceAll("<!>", "<!---->");
    return elem.content;
  }
  function assign_nodes(start, end) {
    var effect2 = (
      /** @type {Effect} */
      active_effect
    );
    if (effect2.nodes_start === null) {
      effect2.nodes_start = start;
      effect2.nodes_end = end;
    }
  }
  // @__NO_SIDE_EFFECTS__
  function from_html(content2, flags) {
    var is_fragment = (flags & TEMPLATE_FRAGMENT) !== 0;
    var use_import_node = (flags & TEMPLATE_USE_IMPORT_NODE) !== 0;
    var node;
    var has_start = !content2.startsWith("<!>");
    return () => {
      if (node === void 0) {
        node = create_fragment_from_html(has_start ? content2 : "<!>" + content2);
        if (!is_fragment) node = /** @type {Node} */
        /* @__PURE__ */ get_first_child(node);
      }
      var clone2 = (
        /** @type {TemplateNode} */
        use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
      );
      if (is_fragment) {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_first_child(clone2)
        );
        var end = (
          /** @type {TemplateNode} */
          clone2.lastChild
        );
        assign_nodes(start, end);
      } else {
        assign_nodes(clone2, clone2);
      }
      return clone2;
    };
  }
  // @__NO_SIDE_EFFECTS__
  function from_namespace(content2, flags, ns = "svg") {
    var has_start = !content2.startsWith("<!>");
    var wrapped = `<${ns}>${has_start ? content2 : "<!>" + content2}</${ns}>`;
    var node;
    return () => {
      if (!node) {
        var fragment = (
          /** @type {DocumentFragment} */
          create_fragment_from_html(wrapped)
        );
        var root2 = (
          /** @type {Element} */
          /* @__PURE__ */ get_first_child(fragment)
        );
        {
          node = /** @type {Element} */
          /* @__PURE__ */ get_first_child(root2);
        }
      }
      var clone2 = (
        /** @type {TemplateNode} */
        node.cloneNode(true)
      );
      {
        assign_nodes(clone2, clone2);
      }
      return clone2;
    };
  }
  // @__NO_SIDE_EFFECTS__
  function from_svg(content2, flags) {
    return /* @__PURE__ */ from_namespace(content2, flags, "svg");
  }
  function comment() {
    var frag = document.createDocumentFragment();
    var start = document.createComment("");
    var anchor = create_text();
    frag.append(start, anchor);
    assign_nodes(start, anchor);
    return frag;
  }
  function append(anchor, dom) {
    if (anchor === null) {
      return;
    }
    anchor.before(
      /** @type {Node} */
      dom
    );
  }
  function is_capture_event(name) {
    return name.endsWith("capture") && name !== "gotpointercapture" && name !== "lostpointercapture";
  }
  const DELEGATED_EVENTS = [
    "beforeinput",
    "click",
    "change",
    "dblclick",
    "contextmenu",
    "focusin",
    "focusout",
    "input",
    "keydown",
    "keyup",
    "mousedown",
    "mousemove",
    "mouseout",
    "mouseover",
    "mouseup",
    "pointerdown",
    "pointermove",
    "pointerout",
    "pointerover",
    "pointerup",
    "touchend",
    "touchmove",
    "touchstart"
  ];
  function can_delegate_event(event_name) {
    return DELEGATED_EVENTS.includes(event_name);
  }
  const ATTRIBUTE_ALIASES = {
    // no `class: 'className'` because we handle that separately
    formnovalidate: "formNoValidate",
    ismap: "isMap",
    nomodule: "noModule",
    playsinline: "playsInline",
    readonly: "readOnly",
    defaultvalue: "defaultValue",
    defaultchecked: "defaultChecked",
    srcobject: "srcObject",
    novalidate: "noValidate",
    allowfullscreen: "allowFullscreen",
    disablepictureinpicture: "disablePictureInPicture",
    disableremoteplayback: "disableRemotePlayback"
  };
  function normalize_attribute(name) {
    name = name.toLowerCase();
    return ATTRIBUTE_ALIASES[name] ?? name;
  }
  function set_text(text, value) {
    var str = value == null ? "" : typeof value === "object" ? value + "" : value;
    if (str !== (text.__t ??= text.nodeValue)) {
      text.__t = str;
      text.nodeValue = str + "";
    }
  }
  function validate_dynamic_element_tag(tag_fn) {
    const tag2 = tag_fn();
    const is_string = typeof tag2 === "string";
    if (tag2 && !is_string) {
      svelte_element_invalid_this_value();
    }
  }
  function prevent_snippet_stringification(fn) {
    fn.toString = () => {
      snippet_without_render_tag();
      return "";
    };
    return fn;
  }
  class BranchManager {
    /** @type {TemplateNode} */
    anchor;
    /** @type {Map<Batch, Key>} */
    #batches = /* @__PURE__ */ new Map();
    /**
     * Map of keys to effects that are currently rendered in the DOM.
     * These effects are visible and actively part of the document tree.
     * Example:
     * ```
     * {#if condition}
     * 	foo
     * {:else}
     * 	bar
     * {/if}
     * ```
     * Can result in the entries `true->Effect` and `false->Effect`
     * @type {Map<Key, Effect>}
     */
    #onscreen = /* @__PURE__ */ new Map();
    /**
     * Similar to #onscreen with respect to the keys, but contains branches that are not yet
     * in the DOM, because their insertion is deferred.
     * @type {Map<Key, Branch>}
     */
    #offscreen = /* @__PURE__ */ new Map();
    /**
     * Keys of effects that are currently outroing
     * @type {Set<Key>}
     */
    #outroing = /* @__PURE__ */ new Set();
    /**
     * Whether to pause (i.e. outro) on change, or destroy immediately.
     * This is necessary for `<svelte:element>`
     */
    #transition = true;
    /**
     * @param {TemplateNode} anchor
     * @param {boolean} transition
     */
    constructor(anchor, transition = true) {
      this.anchor = anchor;
      this.#transition = transition;
    }
    #commit = () => {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      if (!this.#batches.has(batch)) return;
      var key = (
        /** @type {Key} */
        this.#batches.get(batch)
      );
      var onscreen = this.#onscreen.get(key);
      if (onscreen) {
        resume_effect(onscreen);
        this.#outroing.delete(key);
      } else {
        var offscreen = this.#offscreen.get(key);
        if (offscreen) {
          this.#onscreen.set(key, offscreen.effect);
          this.#offscreen.delete(key);
          offscreen.fragment.lastChild.remove();
          this.anchor.before(offscreen.fragment);
          onscreen = offscreen.effect;
        }
      }
      for (const [b, k] of this.#batches) {
        this.#batches.delete(b);
        if (b === batch) {
          break;
        }
        const offscreen2 = this.#offscreen.get(k);
        if (offscreen2) {
          destroy_effect(offscreen2.effect);
          this.#offscreen.delete(k);
        }
      }
      for (const [k, effect2] of this.#onscreen) {
        if (k === key || this.#outroing.has(k)) continue;
        const on_destroy = () => {
          const keys = Array.from(this.#batches.values());
          if (keys.includes(k)) {
            var fragment = document.createDocumentFragment();
            move_effect(effect2, fragment);
            fragment.append(create_text());
            this.#offscreen.set(k, { effect: effect2, fragment });
          } else {
            destroy_effect(effect2);
          }
          this.#outroing.delete(k);
          this.#onscreen.delete(k);
        };
        if (this.#transition || !onscreen) {
          this.#outroing.add(k);
          pause_effect(effect2, on_destroy, false);
        } else {
          on_destroy();
        }
      }
    };
    /**
     * @param {Batch} batch
     */
    #discard = (batch) => {
      this.#batches.delete(batch);
      const keys = Array.from(this.#batches.values());
      for (const [k, branch2] of this.#offscreen) {
        if (!keys.includes(k)) {
          destroy_effect(branch2.effect);
          this.#offscreen.delete(k);
        }
      }
    };
    /**
     *
     * @param {any} key
     * @param {null | ((target: TemplateNode) => void)} fn
     */
    ensure(key, fn) {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var defer = should_defer_append();
      if (fn && !this.#onscreen.has(key) && !this.#offscreen.has(key)) {
        if (defer) {
          var fragment = document.createDocumentFragment();
          var target = create_text();
          fragment.append(target);
          this.#offscreen.set(key, {
            effect: branch(() => fn(target)),
            fragment
          });
        } else {
          this.#onscreen.set(
            key,
            branch(() => fn(this.anchor))
          );
        }
      }
      this.#batches.set(batch, key);
      if (defer) {
        for (const [k, effect2] of this.#onscreen) {
          if (k === key) {
            batch.skipped_effects.delete(effect2);
          } else {
            batch.skipped_effects.add(effect2);
          }
        }
        for (const [k, branch2] of this.#offscreen) {
          if (k === key) {
            batch.skipped_effects.delete(branch2.effect);
          } else {
            batch.skipped_effects.add(branch2.effect);
          }
        }
        batch.oncommit(this.#commit);
        batch.ondiscard(this.#discard);
      } else {
        this.#commit();
      }
    }
  }
  function wrap_snippet(component, fn) {
    const snippet = (node, ...args) => {
      var previous_component_function = dev_current_component_function;
      set_dev_current_component_function(component);
      try {
        return fn(node, ...args);
      } finally {
        set_dev_current_component_function(previous_component_function);
      }
    };
    prevent_snippet_stringification(snippet);
    return snippet;
  }
  {
    let throw_rune_error = function(rune) {
      if (!(rune in globalThis)) {
        let value;
        Object.defineProperty(globalThis, rune, {
          configurable: true,
          // eslint-disable-next-line getter-return
          get: () => {
            if (value !== void 0) {
              return value;
            }
            rune_outside_svelte(rune);
          },
          set: (v) => {
            value = v;
          }
        });
      }
    };
    throw_rune_error("$state");
    throw_rune_error("$effect");
    throw_rune_error("$derived");
    throw_rune_error("$inspect");
    throw_rune_error("$props");
    throw_rune_error("$bindable");
  }
  function add_locations(fn, filename, locations) {
    return (...args) => {
      const dom = fn(...args);
      var node = dom.nodeType === DOCUMENT_FRAGMENT_NODE ? dom.firstChild : dom;
      assign_locations(node, filename, locations);
      return dom;
    };
  }
  function assign_location(element2, filename, location2) {
    element2.__svelte_meta = {
      parent: dev_stack,
      loc: { file: filename, line: location2[0], column: location2[1] }
    };
    if (location2[2]) {
      assign_locations(element2.firstChild, filename, location2[2]);
    }
  }
  function assign_locations(node, filename, locations) {
    var i = 0;
    while (node && i < locations.length) {
      if (node.nodeType === ELEMENT_NODE) {
        assign_location(
          /** @type {Element} */
          node,
          filename,
          locations[i++]
        );
      }
      node = node.nextSibling;
    }
  }
  function check_target(target) {
    if (target) {
      component_api_invalid_new(target[FILENAME] ?? "a component", target.name);
    }
  }
  function legacy_api() {
    const component = component_context?.function;
    function error(method) {
      component_api_changed(method, component[FILENAME]);
    }
    return {
      $destroy: () => error("$destroy()"),
      $on: () => error("$on(...)"),
      $set: () => error("$set(...)")
    };
  }
  function if_block(node, fn, elseif = false) {
    var branches = new BranchManager(node);
    var flags = elseif ? EFFECT_TRANSPARENT : 0;
    function update_branch(condition, fn2) {
      branches.ensure(condition, fn2);
    }
    block(() => {
      var has_branch = false;
      fn((fn2, flag = true) => {
        has_branch = true;
        update_branch(flag, fn2);
      });
      if (!has_branch) {
        update_branch(false, null);
      }
    }, flags);
  }
  function slot(anchor, $$props, name, slot_props, fallback_fn) {
    var slot_fn = $$props.$$slots?.[name];
    var is_interop = false;
    if (slot_fn === true) {
      slot_fn = $$props["children"];
      is_interop = true;
    }
    if (slot_fn === void 0) ;
    else {
      slot_fn(anchor, is_interop ? () => slot_props : slot_props);
    }
  }
  function element(node, get_tag, is_svg, render_fn, get_namespace, location2) {
    var filename = location2 && component_context?.function[FILENAME];
    var element2 = null;
    var anchor = (
      /** @type {TemplateNode} */
      node
    );
    var branches = new BranchManager(anchor, false);
    block(() => {
      const next_tag = get_tag() || null;
      var ns = NAMESPACE_SVG;
      if (next_tag === null) {
        branches.ensure(null, null);
        return;
      }
      branches.ensure(next_tag, (anchor2) => {
        if (next_tag) {
          element2 = document.createElementNS(ns, next_tag);
          if (location2) {
            element2.__svelte_meta = {
              parent: dev_stack,
              loc: {
                file: filename,
                line: location2[0],
                column: location2[1]
              }
            };
          }
          assign_nodes(element2, element2);
          if (render_fn) {
            var child_anchor = (
              /** @type {TemplateNode} */
              element2.appendChild(create_text())
            );
            render_fn(element2, child_anchor);
          }
          active_effect.nodes_end = element2;
          anchor2.before(element2);
        }
      });
      return () => {
      };
    }, EFFECT_TRANSPARENT);
    teardown(() => {
    });
  }
  function attach(node, get_fn) {
    var fn = void 0;
    var e;
    managed(() => {
      if (fn !== (fn = get_fn())) {
        if (e) {
          destroy_effect(e);
          e = null;
        }
        if (fn) {
          e = branch(() => {
            effect(() => (
              /** @type {(node: Element) => void} */
              fn(node)
            ));
          });
        }
      }
    });
  }
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx$1() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }
  function clsx(value) {
    if (typeof value === "object") {
      return clsx$1(value);
    } else {
      return value ?? "";
    }
  }
  const whitespace = [..." 	\n\r\f \v\uFEFF"];
  function to_class(value, hash, directives) {
    var classname = value == null ? "" : "" + value;
    if (directives) {
      for (var key in directives) {
        if (directives[key]) {
          classname = classname ? classname + " " + key : key;
        } else if (classname.length) {
          var len = key.length;
          var a = 0;
          while ((a = classname.indexOf(key, a)) >= 0) {
            var b = a + len;
            if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) {
              classname = (a === 0 ? "" : classname.substring(0, a)) + classname.substring(b + 1);
            } else {
              a = b;
            }
          }
        }
      }
    }
    return classname === "" ? null : classname;
  }
  function append_styles(styles, important = false) {
    var separator = important ? " !important;" : ";";
    var css = "";
    for (var key in styles) {
      var value = styles[key];
      if (value != null && value !== "") {
        css += " " + key + ": " + value + separator;
      }
    }
    return css;
  }
  function to_css_name(name) {
    if (name[0] !== "-" || name[1] !== "-") {
      return name.toLowerCase();
    }
    return name;
  }
  function to_style(value, styles) {
    if (styles) {
      var new_style = "";
      var normal_styles;
      var important_styles;
      if (Array.isArray(styles)) {
        normal_styles = styles[0];
        important_styles = styles[1];
      } else {
        normal_styles = styles;
      }
      if (value) {
        value = String(value).replaceAll(/\s*\/\*.*?\*\/\s*/g, "").trim();
        var in_str = false;
        var in_apo = 0;
        var in_comment = false;
        var reserved_names = [];
        if (normal_styles) {
          reserved_names.push(...Object.keys(normal_styles).map(to_css_name));
        }
        if (important_styles) {
          reserved_names.push(...Object.keys(important_styles).map(to_css_name));
        }
        var start_index = 0;
        var name_index = -1;
        const len = value.length;
        for (var i = 0; i < len; i++) {
          var c = value[i];
          if (in_comment) {
            if (c === "/" && value[i - 1] === "*") {
              in_comment = false;
            }
          } else if (in_str) {
            if (in_str === c) {
              in_str = false;
            }
          } else if (c === "/" && value[i + 1] === "*") {
            in_comment = true;
          } else if (c === '"' || c === "'") {
            in_str = c;
          } else if (c === "(") {
            in_apo++;
          } else if (c === ")") {
            in_apo--;
          }
          if (!in_comment && in_str === false && in_apo === 0) {
            if (c === ":" && name_index === -1) {
              name_index = i;
            } else if (c === ";" || i === len - 1) {
              if (name_index !== -1) {
                var name = to_css_name(value.substring(start_index, name_index).trim());
                if (!reserved_names.includes(name)) {
                  if (c !== ";") {
                    i++;
                  }
                  var property = value.substring(start_index, i).trim();
                  new_style += " " + property + ";";
                }
              }
              start_index = i + 1;
              name_index = -1;
            }
          }
        }
      }
      if (normal_styles) {
        new_style += append_styles(normal_styles);
      }
      if (important_styles) {
        new_style += append_styles(important_styles, true);
      }
      new_style = new_style.trim();
      return new_style === "" ? null : new_style;
    }
    return value == null ? null : String(value);
  }
  function set_class(dom, is_html, value, hash, prev_classes, next_classes) {
    var prev = dom.__className;
    if (prev !== value || prev === void 0) {
      var next_class_name = to_class(value, hash, next_classes);
      {
        if (next_class_name == null) {
          dom.removeAttribute("class");
        } else if (is_html) {
          dom.className = next_class_name;
        } else {
          dom.setAttribute("class", next_class_name);
        }
      }
      dom.__className = value;
    } else if (next_classes && prev_classes !== next_classes) {
      for (var key in next_classes) {
        var is_present = !!next_classes[key];
        if (prev_classes == null || is_present !== !!prev_classes[key]) {
          dom.classList.toggle(key, is_present);
        }
      }
    }
    return next_classes;
  }
  function update_styles(dom, prev = {}, next, priority) {
    for (var key in next) {
      var value = next[key];
      if (prev[key] !== value) {
        if (next[key] == null) {
          dom.style.removeProperty(key);
        } else {
          dom.style.setProperty(key, value, priority);
        }
      }
    }
  }
  function set_style(dom, value, prev_styles, next_styles) {
    var prev = dom.__style;
    if (prev !== value) {
      var next_style_attr = to_style(value, next_styles);
      {
        if (next_style_attr == null) {
          dom.removeAttribute("style");
        } else {
          dom.style.cssText = next_style_attr;
        }
      }
      dom.__style = value;
    } else if (next_styles) {
      if (Array.isArray(next_styles)) {
        update_styles(dom, prev_styles?.[0], next_styles[0]);
        update_styles(dom, prev_styles?.[1], next_styles[1], "important");
      } else {
        update_styles(dom, prev_styles, next_styles);
      }
    }
    return next_styles;
  }
  function select_option(select, value, mounting = false) {
    if (select.multiple) {
      if (value == void 0) {
        return;
      }
      if (!is_array(value)) {
        return select_multiple_invalid_value();
      }
      for (var option of select.options) {
        option.selected = value.includes(get_option_value(option));
      }
      return;
    }
    for (option of select.options) {
      var option_value = get_option_value(option);
      if (is(option_value, value)) {
        option.selected = true;
        return;
      }
    }
    if (!mounting || value !== void 0) {
      select.selectedIndex = -1;
    }
  }
  function init_select(select) {
    var observer = new MutationObserver(() => {
      select_option(select, select.__value);
    });
    observer.observe(select, {
      // Listen to option element changes
      childList: true,
      subtree: true,
      // because of <optgroup>
      // Listen to option element value attribute changes
      // (doesn't get notified of select value changes,
      // because that property is not reflected as an attribute)
      attributes: true,
      attributeFilter: ["value"]
    });
    teardown(() => {
      observer.disconnect();
    });
  }
  function get_option_value(option) {
    if ("__value" in option) {
      return option.__value;
    } else {
      return option.value;
    }
  }
  const CLASS = Symbol("class");
  const STYLE = Symbol("style");
  const IS_CUSTOM_ELEMENT = Symbol("is custom element");
  const IS_HTML = Symbol("is html");
  function set_selected(element2, selected) {
    if (selected) {
      if (!element2.hasAttribute("selected")) {
        element2.setAttribute("selected", "");
      }
    } else {
      element2.removeAttribute("selected");
    }
  }
  function set_attribute(element2, attribute, value, skip_warning) {
    var attributes = get_attributes(element2);
    if (attributes[attribute] === (attributes[attribute] = value)) return;
    if (attribute === "loading") {
      element2[LOADING_ATTR_SYMBOL] = value;
    }
    if (value == null) {
      element2.removeAttribute(attribute);
    } else if (typeof value !== "string" && get_setters(element2).includes(attribute)) {
      element2[attribute] = value;
    } else {
      element2.setAttribute(attribute, value);
    }
  }
  function set_attributes(element2, prev, next, css_hash, should_remove_defaults = false, skip_warning = false) {
    var attributes = get_attributes(element2);
    var is_custom_element = attributes[IS_CUSTOM_ELEMENT];
    var preserve_attribute_case = !attributes[IS_HTML];
    var current = prev || {};
    var is_option_element = element2.tagName === "OPTION";
    for (var key in prev) {
      if (!(key in next)) {
        next[key] = null;
      }
    }
    if (next.class) {
      next.class = clsx(next.class);
    } else if (next[CLASS]) {
      next.class = null;
    }
    if (next[STYLE]) {
      next.style ??= null;
    }
    var setters = get_setters(element2);
    for (const key2 in next) {
      let value = next[key2];
      if (is_option_element && key2 === "value" && value == null) {
        element2.value = element2.__value = "";
        current[key2] = value;
        continue;
      }
      if (key2 === "class") {
        var is_html = element2.namespaceURI === "http://www.w3.org/1999/xhtml";
        set_class(element2, is_html, value, css_hash, prev?.[CLASS], next[CLASS]);
        current[key2] = value;
        current[CLASS] = next[CLASS];
        continue;
      }
      if (key2 === "style") {
        set_style(element2, value, prev?.[STYLE], next[STYLE]);
        current[key2] = value;
        current[STYLE] = next[STYLE];
        continue;
      }
      var prev_value = current[key2];
      if (value === prev_value && !(value === void 0 && element2.hasAttribute(key2))) {
        continue;
      }
      current[key2] = value;
      var prefix = key2[0] + key2[1];
      if (prefix === "$$") continue;
      if (prefix === "on") {
        const opts = {};
        const event_handle_key = "$$" + key2;
        let event_name = key2.slice(2);
        var delegated = can_delegate_event(event_name);
        if (is_capture_event(event_name)) {
          event_name = event_name.slice(0, -7);
          opts.capture = true;
        }
        if (!delegated && prev_value) {
          if (value != null) continue;
          element2.removeEventListener(event_name, current[event_handle_key], opts);
          current[event_handle_key] = null;
        }
        if (value != null) {
          if (!delegated) {
            let handle = function(evt) {
              current[key2].call(this, evt);
            };
            current[event_handle_key] = create_event(event_name, element2, handle, opts);
          } else {
            element2[`__${event_name}`] = value;
            delegate([event_name]);
          }
        } else if (delegated) {
          element2[`__${event_name}`] = void 0;
        }
      } else if (key2 === "style") {
        set_attribute(element2, key2, value);
      } else if (key2 === "autofocus") {
        autofocus(
          /** @type {HTMLElement} */
          element2,
          Boolean(value)
        );
      } else if (!is_custom_element && (key2 === "__value" || key2 === "value" && value != null)) {
        element2.value = element2.__value = value;
      } else if (key2 === "selected" && is_option_element) {
        set_selected(
          /** @type {HTMLOptionElement} */
          element2,
          value
        );
      } else {
        var name = key2;
        if (!preserve_attribute_case) {
          name = normalize_attribute(name);
        }
        var is_default = name === "defaultValue" || name === "defaultChecked";
        if (value == null && !is_custom_element && !is_default) {
          attributes[key2] = null;
          if (name === "value" || name === "checked") {
            let input2 = (
              /** @type {HTMLInputElement} */
              element2
            );
            const use_default = prev === void 0;
            if (name === "value") {
              let previous = input2.defaultValue;
              input2.removeAttribute(name);
              input2.defaultValue = previous;
              input2.value = input2.__value = use_default ? previous : null;
            } else {
              let previous = input2.defaultChecked;
              input2.removeAttribute(name);
              input2.defaultChecked = previous;
              input2.checked = use_default ? previous : false;
            }
          } else {
            element2.removeAttribute(key2);
          }
        } else if (is_default || setters.includes(name) && (is_custom_element || typeof value !== "string")) {
          element2[name] = value;
          if (name in attributes) attributes[name] = UNINITIALIZED;
        } else if (typeof value !== "function") {
          set_attribute(element2, name, value);
        }
      }
    }
    return current;
  }
  function attribute_effect(element2, fn, sync = [], async = [], blockers = [], css_hash, should_remove_defaults = false, skip_warning = false) {
    flatten(blockers, sync, async, (values) => {
      var prev = void 0;
      var effects = {};
      var is_select = element2.nodeName === "SELECT";
      var inited = false;
      managed(() => {
        var next = fn(...values.map(get));
        var current = set_attributes(
          element2,
          prev,
          next,
          css_hash,
          should_remove_defaults,
          skip_warning
        );
        if (inited && is_select && "value" in next) {
          select_option(
            /** @type {HTMLSelectElement} */
            element2,
            next.value
          );
        }
        for (let symbol of Object.getOwnPropertySymbols(effects)) {
          if (!next[symbol]) destroy_effect(effects[symbol]);
        }
        for (let symbol of Object.getOwnPropertySymbols(next)) {
          var n = next[symbol];
          if (symbol.description === ATTACHMENT_KEY && (!prev || n !== prev[symbol])) {
            if (effects[symbol]) destroy_effect(effects[symbol]);
            effects[symbol] = branch(() => attach(element2, () => n));
          }
          current[symbol] = n;
        }
        prev = current;
      });
      if (is_select) {
        var select = (
          /** @type {HTMLSelectElement} */
          element2
        );
        effect(() => {
          select_option(
            select,
            /** @type {Record<string | symbol, any>} */
            prev.value,
            true
          );
          init_select(select);
        });
      }
      inited = true;
    });
  }
  function get_attributes(element2) {
    return (
      /** @type {Record<string | symbol, unknown>} **/
      // @ts-expect-error
      element2.__attributes ??= {
        [IS_CUSTOM_ELEMENT]: element2.nodeName.includes("-"),
        [IS_HTML]: element2.namespaceURI === NAMESPACE_HTML
      }
    );
  }
  var setters_cache = /* @__PURE__ */ new Map();
  function get_setters(element2) {
    var cache_key = element2.getAttribute("is") || element2.nodeName;
    var setters = setters_cache.get(cache_key);
    if (setters) return setters;
    setters_cache.set(cache_key, setters = []);
    var descriptors;
    var proto = element2;
    var element_proto = Element.prototype;
    while (element_proto !== proto) {
      descriptors = get_descriptors(proto);
      for (var key in descriptors) {
        if (descriptors[key].set) {
          setters.push(key);
        }
      }
      proto = get_prototype_of(proto);
    }
    return setters;
  }
  function bind_value(input, get2, set2 = get2) {
    var batches2 = /* @__PURE__ */ new WeakSet();
    listen_to_event_and_reset_event(input, "input", async (is_reset) => {
      if (input.type === "checkbox") {
        bind_invalid_checkbox_value();
      }
      var value = is_reset ? input.defaultValue : input.value;
      value = is_numberlike_input(input) ? to_number(value) : value;
      set2(value);
      if (current_batch !== null) {
        batches2.add(current_batch);
      }
      await tick();
      if (value !== (value = get2())) {
        var start = input.selectionStart;
        var end = input.selectionEnd;
        var length = input.value.length;
        input.value = value ?? "";
        if (end !== null) {
          var new_length = input.value.length;
          if (start === end && end === length && new_length > length) {
            input.selectionStart = new_length;
            input.selectionEnd = new_length;
          } else {
            input.selectionStart = start;
            input.selectionEnd = Math.min(end, new_length);
          }
        }
      }
    });
    if (
      // If we are hydrating and the value has since changed,
      // then use the updated value from the input instead.
      // If defaultValue is set, then value == defaultValue
      // TODO Svelte 6: remove input.value check and set to empty string?
      untrack(get2) == null && input.value
    ) {
      set2(is_numberlike_input(input) ? to_number(input.value) : input.value);
      if (current_batch !== null) {
        batches2.add(current_batch);
      }
    }
    render_effect(() => {
      if (input.type === "checkbox") {
        bind_invalid_checkbox_value();
      }
      var value = get2();
      if (input === document.activeElement) {
        var batch = (
          /** @type {Batch} */
          previous_batch ?? current_batch
        );
        if (batches2.has(batch)) {
          return;
        }
      }
      if (is_numberlike_input(input) && value === to_number(input.value)) {
        return;
      }
      if (input.type === "date" && !value && !input.value) {
        return;
      }
      if (value !== input.value) {
        input.value = value ?? "";
      }
    });
  }
  function is_numberlike_input(input) {
    var type = input.type;
    return type === "number" || type === "range";
  }
  function to_number(value) {
    return value === "" ? null : +value;
  }
  function stopPropagation(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      event2.stopPropagation();
      return fn?.apply(this, args);
    };
  }
  function init(immutable = false) {
    const context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    const callbacks = context.l.u;
    if (!callbacks) return;
    let props = () => deep_read_state(context.s);
    if (immutable) {
      let version = 0;
      let prev = (
        /** @type {Record<string, any>} */
        {}
      );
      const d = /* @__PURE__ */ derived(() => {
        let changed = false;
        const props2 = context.s;
        for (const key in props2) {
          if (props2[key] !== prev[key]) {
            prev[key] = props2[key];
            changed = true;
          }
        }
        if (changed) version++;
        return version;
      });
      props = () => get(d);
    }
    if (callbacks.b.length) {
      user_pre_effect(() => {
        observe_all(context, props);
        run_all(callbacks.b);
      });
    }
    user_effect(() => {
      const fns = untrack(() => callbacks.m.map(run));
      return () => {
        for (const fn of fns) {
          if (typeof fn === "function") {
            fn();
          }
        }
      };
    });
    if (callbacks.a.length) {
      user_effect(() => {
        observe_all(context, props);
        run_all(callbacks.a);
      });
    }
  }
  function observe_all(context, props) {
    if (context.l.s) {
      for (const signal of context.l.s) get(signal);
    }
    props();
  }
  let is_store_binding = false;
  function capture_store_binding(fn) {
    var previous_is_store_binding = is_store_binding;
    try {
      is_store_binding = false;
      return [fn(), is_store_binding];
    } finally {
      is_store_binding = previous_is_store_binding;
    }
  }
  const legacy_rest_props_handler = {
    get(target, key) {
      if (target.exclude.includes(key)) return;
      get(target.version);
      return key in target.special ? target.special[key]() : target.props[key];
    },
    set(target, key, value) {
      if (!(key in target.special)) {
        var previous_effect = active_effect;
        try {
          set_active_effect(target.parent_effect);
          target.special[key] = prop(
            {
              get [key]() {
                return target.props[key];
              }
            },
            /** @type {string} */
            key,
            PROPS_IS_UPDATED
          );
        } finally {
          set_active_effect(previous_effect);
        }
      }
      target.special[key](value);
      update(target.version);
      return true;
    },
    getOwnPropertyDescriptor(target, key) {
      if (target.exclude.includes(key)) return;
      if (key in target.props) {
        return {
          enumerable: true,
          configurable: true,
          value: target.props[key]
        };
      }
    },
    deleteProperty(target, key) {
      if (target.exclude.includes(key)) return true;
      target.exclude.push(key);
      update(target.version);
      return true;
    },
    has(target, key) {
      if (target.exclude.includes(key)) return false;
      return key in target.props;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target.props).filter((key) => !target.exclude.includes(key));
    }
  };
  function legacy_rest_props(props, exclude) {
    return new Proxy(
      {
        props,
        exclude,
        special: {},
        version: source(0),
        // TODO this is only necessary because we need to track component
        // destruction inside `prop`, because of `bind:this`, but it
        // seems likely that we can simplify `bind:this` instead
        parent_effect: (
          /** @type {Effect} */
          active_effect
        )
      },
      legacy_rest_props_handler
    );
  }
  const spread_props_handler = {
    get(target, key) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        if (typeof p === "object" && p !== null && key in p) return p[key];
      }
    },
    set(target, key, value) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        const desc = get_descriptor(p, key);
        if (desc && desc.set) {
          desc.set(value);
          return true;
        }
      }
      return false;
    },
    getOwnPropertyDescriptor(target, key) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        if (typeof p === "object" && p !== null && key in p) {
          const descriptor = get_descriptor(p, key);
          if (descriptor && !descriptor.configurable) {
            descriptor.configurable = true;
          }
          return descriptor;
        }
      }
    },
    has(target, key) {
      if (key === STATE_SYMBOL || key === LEGACY_PROPS) return false;
      for (let p of target.props) {
        if (is_function(p)) p = p();
        if (p != null && key in p) return true;
      }
      return false;
    },
    ownKeys(target) {
      const keys = [];
      for (let p of target.props) {
        if (is_function(p)) p = p();
        if (!p) continue;
        for (const key in p) {
          if (!keys.includes(key)) keys.push(key);
        }
        for (const key of Object.getOwnPropertySymbols(p)) {
          if (!keys.includes(key)) keys.push(key);
        }
      }
      return keys;
    }
  };
  function spread_props(...props) {
    return new Proxy({ props }, spread_props_handler);
  }
  function prop(props, key, flags, fallback) {
    var runes = !legacy_mode_flag || (flags & PROPS_IS_RUNES) !== 0;
    var bindable = (flags & PROPS_IS_BINDABLE) !== 0;
    var lazy = (flags & PROPS_IS_LAZY_INITIAL) !== 0;
    var fallback_value = (
      /** @type {V} */
      fallback
    );
    var fallback_dirty = true;
    var get_fallback = () => {
      if (fallback_dirty) {
        fallback_dirty = false;
        fallback_value = lazy ? untrack(
          /** @type {() => V} */
          fallback
        ) : (
          /** @type {V} */
          fallback
        );
      }
      return fallback_value;
    };
    var setter;
    if (bindable) {
      var is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;
      setter = get_descriptor(props, key)?.set ?? (is_entry_props && key in props ? (v) => props[key] = v : void 0);
    }
    var initial_value;
    var is_store_sub = false;
    if (bindable) {
      [initial_value, is_store_sub] = capture_store_binding(() => (
        /** @type {V} */
        props[key]
      ));
    } else {
      initial_value = /** @type {V} */
      props[key];
    }
    if (initial_value === void 0 && fallback !== void 0) {
      initial_value = get_fallback();
      if (setter) {
        if (runes) props_invalid_value(key);
        setter(initial_value);
      }
    }
    var getter;
    if (runes) {
      getter = () => {
        var value = (
          /** @type {V} */
          props[key]
        );
        if (value === void 0) return get_fallback();
        fallback_dirty = true;
        return value;
      };
    } else {
      getter = () => {
        var value = (
          /** @type {V} */
          props[key]
        );
        if (value !== void 0) {
          fallback_value = /** @type {V} */
          void 0;
        }
        return value === void 0 ? fallback_value : value;
      };
    }
    if (runes && (flags & PROPS_IS_UPDATED) === 0) {
      return getter;
    }
    if (setter) {
      var legacy_parent = props.$$legacy;
      return (
        /** @type {() => V} */
        (function(value, mutation) {
          if (arguments.length > 0) {
            if (!runes || !mutation || legacy_parent || is_store_sub) {
              setter(mutation ? getter() : value);
            }
            return value;
          }
          return getter();
        })
      );
    }
    var overridden = false;
    var d = ((flags & PROPS_IS_IMMUTABLE) !== 0 ? derived : derived_safe_equal)(() => {
      overridden = false;
      return getter();
    });
    {
      d.label = key;
    }
    if (bindable) get(d);
    var parent_effect = (
      /** @type {Effect} */
      active_effect
    );
    return (
      /** @type {() => V} */
      (function(value, mutation) {
        if (arguments.length > 0) {
          const new_value = mutation ? get(d) : runes && bindable ? proxy(value) : value;
          set(d, new_value);
          overridden = true;
          if (fallback_value !== void 0) {
            fallback_value = new_value;
          }
          return value;
        }
        if (is_destroying_effect && overridden || (parent_effect.f & DESTROYED) !== 0) {
          return d.v;
        }
        return get(d);
      })
    );
  }
  function log_if_contains_state(method, ...objects) {
    untrack(() => {
      try {
        let has_state = false;
        const transformed = [];
        for (const obj of objects) {
          if (obj && typeof obj === "object" && STATE_SYMBOL in obj) {
            transformed.push(snapshot(obj, true));
            has_state = true;
          } else {
            transformed.push(obj);
          }
        }
        if (has_state) {
          console_log_state(method);
          console.log("%c[snapshot]", "color: grey", ...transformed);
        }
      } catch {
      }
    });
    return objects;
  }
  const defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  };
  Icon[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/Icon.svelte";
  var root$1 = add_locations(/* @__PURE__ */ from_svg(`<svg><!><!></svg>`), Icon[FILENAME], [[14, 0]]);
  function Icon($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    const $$restProps = legacy_rest_props($$sanitized_props, [
      "name",
      "color",
      "size",
      "strokeWidth",
      "absoluteStrokeWidth",
      "iconNode"
    ]);
    push($$props, false, Icon);
    let name = prop($$props, "name", 8, void 0);
    let color = prop($$props, "color", 8, "currentColor");
    let size = prop($$props, "size", 8, 24);
    let strokeWidth = prop($$props, "strokeWidth", 8, 2);
    let absoluteStrokeWidth = prop($$props, "absoluteStrokeWidth", 8, false);
    let iconNode = prop($$props, "iconNode", 24, () => []);
    const mergeClasses = (...classes) => classes.filter((className, index2, array) => {
      return Boolean(className) && strict_equals(array.indexOf(className), index2);
    }).join(" ");
    var $$exports = { ...legacy_api() };
    init();
    var svg = root$1();
    attribute_effect(
      svg,
      ($0, $1) => ({
        ...defaultAttributes,
        ...$$restProps,
        width: size(),
        height: size(),
        stroke: color(),
        "stroke-width": $0,
        class: $1
      }),
      [
        () => (deep_read_state(absoluteStrokeWidth()), deep_read_state(strokeWidth()), deep_read_state(size()), untrack(() => absoluteStrokeWidth() ? Number(strokeWidth()) * 24 / Number(size()) : strokeWidth())),
        () => (deep_read_state(name()), deep_read_state($$sanitized_props), untrack(() => mergeClasses("lucide-icon", "lucide", name() ? `lucide-${name()}` : "", $$sanitized_props.class)))
      ]
    );
    var node = child(svg);
    add_svelte_meta(
      () => each(node, 1, iconNode, index, ($$anchor2, $$item) => {
        var $$array = /* @__PURE__ */ user_derived(() => to_array(get($$item), 2));
        let tag2 = () => get($$array)[0];
        tag2();
        let attrs = () => get($$array)[1];
        attrs();
        var fragment = comment();
        var node_1 = first_child(fragment);
        {
          validate_dynamic_element_tag(tag2);
          element(
            node_1,
            tag2,
            true,
            ($$element, $$anchor3) => {
              attribute_effect($$element, () => ({ ...attrs() }));
            },
            void 0,
            [35, 4]
          );
        }
        append($$anchor2, fragment);
      }),
      "each",
      Icon,
      34,
      2
    );
    var node_2 = sibling(node);
    slot(node_2, $$props, "default", {});
    append($$anchor, svg);
    return pop($$exports);
  }
  Download[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/download.svelte";
  function Download($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Download);
    const iconNode = [
      ["path", { "d": "M12 15V3" }],
      ["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
      ["path", { "d": "m7 10 5 5 5-5" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name Download
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgMTVWMyIgLz4KICA8cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCIgLz4KICA8cGF0aCBkPSJtNyAxMCA1IDUgNS01IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/download
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "download" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Download, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Download,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  Grid_3x3[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/grid-3x3.svelte";
  function Grid_3x3($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Grid_3x3);
    const iconNode = [
      [
        "rect",
        { "width": "18", "height": "18", "x": "3", "y": "3", "rx": "2" }
      ],
      ["path", { "d": "M3 9h18" }],
      ["path", { "d": "M3 15h18" }],
      ["path", { "d": "M9 3v18" }],
      ["path", { "d": "M15 3v18" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name Grid3x3
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiAvPgogIDxwYXRoIGQ9Ik0zIDloMTgiIC8+CiAgPHBhdGggZD0iTTMgMTVoMTgiIC8+CiAgPHBhdGggZD0iTTkgM3YxOCIgLz4KICA8cGF0aCBkPSJNMTUgM3YxOCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/grid-3x3
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "grid-3x3" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Grid_3x3, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Grid_3x3,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  Image$1[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/image.svelte";
  function Image$1($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Image$1);
    const iconNode = [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2",
          "ry": "2"
        }
      ],
      ["circle", { "cx": "9", "cy": "9", "r": "2" }],
      ["path", { "d": "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name Image
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIgLz4KICA8Y2lyY2xlIGN4PSI5IiBjeT0iOSIgcj0iMiIgLz4KICA8cGF0aCBkPSJtMjEgMTUtMy4wODYtMy4wODZhMiAyIDAgMCAwLTIuODI4IDBMNiAyMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/image
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "image" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Image$1, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Image$1,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  List[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/list.svelte";
  function List($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, List);
    const iconNode = [
      ["path", { "d": "M3 5h.01" }],
      ["path", { "d": "M3 12h.01" }],
      ["path", { "d": "M3 19h.01" }],
      ["path", { "d": "M8 5h13" }],
      ["path", { "d": "M8 12h13" }],
      ["path", { "d": "M8 19h13" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name List
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMyA1aC4wMSIgLz4KICA8cGF0aCBkPSJNMyAxMmguMDEiIC8+CiAgPHBhdGggZD0iTTMgMTloLjAxIiAvPgogIDxwYXRoIGQ9Ik04IDVoMTMiIC8+CiAgPHBhdGggZD0iTTggMTJoMTMiIC8+CiAgPHBhdGggZD0iTTggMTloMTMiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/list
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "list" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(List, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      List,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  Search[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/search.svelte";
  function Search($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Search);
    const iconNode = [
      ["path", { "d": "m21 21-4.34-4.34" }],
      ["circle", { "cx": "11", "cy": "11", "r": "8" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name Search
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMjEgMjEtNC4zNC00LjM0IiAvPgogIDxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/search
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "search" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Search, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Search,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  Square_check_big[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/square-check-big.svelte";
  function Square_check_big($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Square_check_big);
    const iconNode = [
      [
        "path",
        {
          "d": "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344"
        }
      ],
      ["path", { "d": "m9 11 3 3L22 4" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name SquareCheckBig
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjEgMTAuNjU2VjE5YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmgxMi4zNDQiIC8+CiAgPHBhdGggZD0ibTkgMTEgMyAzTDIyIDQiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/square-check-big
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "square-check-big" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Square_check_big, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Square_check_big,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  Square[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/square.svelte";
  function Square($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, Square);
    const iconNode = [
      [
        "rect",
        { "width": "18", "height": "18", "x": "3", "y": "3", "rx": "2" }
      ]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name Square
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/square
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "square" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(Square, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      Square,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  X[FILENAME] = "node_modules/.pnpm/lucide-svelte@0.555.0_svelte@5.45.3/node_modules/lucide-svelte/dist/icons/x.svelte";
  function X($$anchor, $$props) {
    check_target(new.target);
    const $$sanitized_props = legacy_rest_props($$props, ["children", "$$slots", "$$events", "$$legacy"]);
    push($$props, false, X);
    const iconNode = [
      ["path", { "d": "M18 6 6 18" }],
      ["path", { "d": "m6 6 12 12" }]
    ];
    var $$exports = { ...legacy_api() };
    add_svelte_meta(
      () => (
        /**
        * @component @name X
        * @description Lucide SVG icon component, renders SVG Element with children.
        *
        * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTggNiA2IDE4IiAvPgogIDxwYXRoIGQ9Im02IDYgMTIgMTIiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/x
        * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
        *
        * @param {Object} props - Lucide icons props and any valid SVG attribute
        * @returns {FunctionalComponent} Svelte component
        *
        */
        Icon($$anchor, spread_props({ name: "x" }, () => $$sanitized_props, {
          get iconNode() {
            return iconNode;
          },
          children: wrap_snippet(X, ($$anchor2, $$slotProps) => {
            var fragment_1 = comment();
            var node = first_child(fragment_1);
            slot(node, $$props, "default", {}, null);
            append($$anchor2, fragment_1);
          }),
          $$slots: { default: true }
        }))
      ),
      "component",
      X,
      60,
      0,
      { componentTag: "Icon" }
    );
    return pop($$exports);
  }
  ImagePanel[FILENAME] = "src/components/ImagePanel.svelte";
  var root_1$1 = add_locations(/* @__PURE__ */ from_html(`<button> </button>`), ImagePanel[FILENAME], [[136, 8]]);
  var root_2$1 = add_locations(/* @__PURE__ */ from_html(`<!> <span>取消全选</span>`, 1), ImagePanel[FILENAME], [[159, 12]]);
  var root_3 = add_locations(/* @__PURE__ */ from_html(`<!> <span>全选</span>`, 1), ImagePanel[FILENAME], [[162, 12]]);
  var root_4$1 = add_locations(/* @__PURE__ */ from_html(`<button class="flex items-center space-x-1 bg-green-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-600 transition-colors"><!> <span>下载选中</span></button>`), ImagePanel[FILENAME], [[190, 10, [[195, 12]]]]);
  var root_5 = add_locations(/* @__PURE__ */ from_html(`<div class="text-center py-8 text-gray-500"><!> <p>暂无图片</p></div>`), ImagePanel[FILENAME], [[205, 6, [[207, 8]]]]);
  var root_11 = add_locations(/* @__PURE__ */ from_html(`<div class="mt-2 flex items-center space-x-2"><button class="text-xs bg-primary-500 text-white px-2 py-1 rounded hover:bg-primary-600 transition-colors">下载</button></div>`), ImagePanel[FILENAME], [[255, 20, [[256, 22]]]]);
  var root_12 = add_locations(/* @__PURE__ */ from_html(`<div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><button class="bg-primary-500 text-white p-1.5 rounded-lg hover:bg-primary-600 transition-colors"><!></button></div>`), ImagePanel[FILENAME], [[268, 18, [[269, 20]]]]);
  var root_8 = add_locations(/* @__PURE__ */ from_html(`<div><button class="absolute top-2 left-2 z-10 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><!></button> <div><img class="w-full h-full object-cover" loading="lazy"/></div> <div class="p-3 flex-1 min-w-0"><p class="text-sm font-medium text-gray-900 truncate"> </p> <p class="text-xs text-gray-500 mt-1"> </p> <!></div> <!></div>`), ImagePanel[FILENAME], [
    [
      219,
      14,
      [
        [224, 16],
        [236, 16, [[237, 18]]],
        [246, 16, [[247, 18], [250, 18]]]
      ]
    ]
  ]);
  var root_7 = add_locations(/* @__PURE__ */ from_html(`<div class="mb-6"><h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between"><span> </span> <span class="text-xs text-gray-500"> </span></h3> <div></div></div>`), ImagePanel[FILENAME], [[211, 8, [[212, 10, [[213, 12], [214, 12]]], [217, 10]]]]);
  var root = add_locations(/* @__PURE__ */ from_html(`<div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-panel-backdrop animate-fade-in"></div> <div class="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-panel-main animate-slide-in-right overflow-hidden flex flex-col"><div class="gradient-primary text-white p-4 flex items-center justify-between"><div class="flex items-center space-x-2"><!> <h2 class="text-lg font-semibold">图片管理器</h2> <span class="bg-white/20 px-2 py-1 rounded-full text-xs"> </span></div> <button class="hover:bg-white/20 p-1 rounded-lg transition-colors"><!></button></div> <div class="p-4 border-b border-gray-200 space-y-3"><div class="relative"><!> <input type="text" placeholder="搜索图片..." class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"/></div> <div class="flex items-center space-x-2 overflow-x-auto"></div></div> <div class="p-4 border-b border-gray-200 bg-gray-50"><div class="flex items-center justify-between"><div class="flex items-center space-x-2"><button class="flex items-center space-x-1 text-sm text-gray-600 hover:text-primary-600 transition-colors"><!></button> <span class="text-sm text-gray-500"> </span></div> <div class="flex items-center space-x-2"><div class="flex items-center bg-gray-200 rounded-lg p-1"><button><!></button> <button><!></button></div> <!></div></div></div> <div class="flex-1 overflow-y-auto p-4"><!></div> <div class="p-4 border-t border-gray-200 bg-gray-50"><div class="flex items-center justify-between"><button class="text-sm text-gray-600 hover:text-primary-600 transition-colors">复制所有链接</button> <span class="text-xs text-gray-500"> </span></div></div></div>`, 1), ImagePanel[FILENAME], [
    [99, 0],
    [
      102,
      0,
      [
        [104, 2, [[105, 4, [[107, 6], [108, 6]]], [112, 4]]],
        [121, 2, [[123, 4, [[125, 6]]], [134, 4]]],
        [
          150,
          2,
          [
            [
              151,
              4,
              [
                [152, 6, [[153, 8], [166, 8]]],
                [171, 6, [[173, 8, [[174, 10], [180, 10]]]]]
              ]
            ]
          ]
        ],
        [203, 2],
        [286, 2, [[287, 4, [[288, 6], [295, 6]]]]]
      ]
    ]
  ]);
  function ImagePanel($$anchor, $$props) {
    check_target(new.target);
    push($$props, false, ImagePanel);
    const categories = /* @__PURE__ */ mutable_source();
    const filteredImages = /* @__PURE__ */ mutable_source();
    const groupedImages = /* @__PURE__ */ mutable_source();
    let images = prop($$props, "images", 24, () => []);
    let onClose = prop($$props, "onClose", 8);
    let searchTerm = /* @__PURE__ */ mutable_source("");
    let selectedCategory = /* @__PURE__ */ mutable_source("全部");
    let viewMode = /* @__PURE__ */ mutable_source(
      "grid"
      // grid or list
    );
    let selectedImages = /* @__PURE__ */ mutable_source(/* @__PURE__ */ new Set());
    function toggleImageSelection(imageIndex) {
      if (get(selectedImages).has(imageIndex)) {
        get(selectedImages).delete(imageIndex);
      } else {
        get(selectedImages).add(imageIndex);
      }
      set(
        selectedImages,
        // 触发响应式更新
        get(selectedImages)
      );
    }
    function toggleSelectAll() {
      if (strict_equals(get(selectedImages).size, get(filteredImages).length)) {
        get(selectedImages).clear();
      } else {
        get(filteredImages).forEach((img, index2) => {
          get(selectedImages).add(img.index);
        });
      }
      set(selectedImages, get(selectedImages));
    }
    async function downloadImage(image) {
      try {
        const link2 = document.createElement("a");
        link2.href = image.src;
        link2.download = `${image.alt || "image"}_${image.index}.jpg`;
        link2.target = "_blank";
        document.body.appendChild(link2);
        link2.click();
        document.body.removeChild(link2);
      } catch (error) {
        console.error(...log_if_contains_state("error", "下载失败:", error));
        navigator.clipboard.writeText(image.src).then(() => {
          alert("图片链接已复制到剪贴板");
        });
      }
    }
    async function downloadSelectedImages() {
      const selectedImagesData = images().filter((img) => get(selectedImages).has(img.index));
      if (strict_equals(selectedImagesData.length, 0)) {
        alert("请先选择要下载的图片");
        return;
      }
      for (const image of selectedImagesData) {
        (await track_reactivity_loss(downloadImage(image)))();
        (await track_reactivity_loss(new Promise((resolve) => setTimeout(resolve, 500))))();
      }
    }
    function copyAllLinks() {
      const links = get(filteredImages).map((img) => img.src).join("\n");
      navigator.clipboard.writeText(links).then(() => {
        alert(`已复制 ${get(filteredImages).length} 个图片链接到剪贴板`);
      });
    }
    legacy_pre_effect(() => deep_read_state(images()), () => {
      set(categories, ["全部", ...new Set(images().map((img) => img.category))]);
    });
    legacy_pre_effect(
      () => (deep_read_state(images()), get(searchTerm), get(selectedCategory)),
      () => {
        set(filteredImages, images().filter((img) => {
          const matchesSearch = img.alt.toLowerCase().includes(get(searchTerm).toLowerCase()) || img.src.toLowerCase().includes(get(searchTerm).toLowerCase());
          const matchesCategory = strict_equals(get(selectedCategory), "全部") || strict_equals(img.category, get(selectedCategory));
          return matchesSearch && matchesCategory;
        }));
      }
    );
    legacy_pre_effect(() => get(filteredImages), () => {
      set(groupedImages, get(filteredImages).reduce(
        (acc, img) => {
          if (!acc[img.category]) {
            acc[img.category] = [];
          }
          acc[img.category].push(img);
          return acc;
        },
        {}
      ));
    });
    legacy_pre_effect_reset();
    var $$exports = { ...legacy_api() };
    init();
    var fragment = root();
    var div = first_child(fragment);
    var div_1 = sibling(div, 2);
    var div_2 = child(div_1);
    var div_3 = child(div_2);
    var node = child(div_3);
    add_svelte_meta(() => Image(node, { class: "w-5 h-5" }), "component", ImagePanel, 106, 6, { componentTag: "Image" });
    var span = sibling(node, 4);
    var text = child(span);
    var button = sibling(div_3, 2);
    var node_1 = child(button);
    add_svelte_meta(() => X(node_1, { class: "w-5 h-5" }), "component", ImagePanel, 116, 6, { componentTag: "X" });
    var div_4 = sibling(div_2, 2);
    var div_5 = child(div_4);
    var node_2 = child(div_5);
    add_svelte_meta(
      () => Search(node_2, {
        class: "absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4"
      }),
      "component",
      ImagePanel,
      124,
      6,
      { componentTag: "Search" }
    );
    var input = sibling(node_2, 2);
    var div_6 = sibling(div_5, 2);
    add_svelte_meta(
      () => each(div_6, 5, () => get(categories), index, ($$anchor2, category) => {
        var button_1 = root_1$1();
        var text_1 = child(button_1, true);
        reset(button_1);
        template_effect(() => {
          set_class(button_1, 1, `px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors
                 ${strict_equals(get(selectedCategory), get(category)) ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`);
          set_text(text_1, get(category));
        });
        event("click", button_1, () => set(selectedCategory, get(category)));
        append($$anchor2, button_1);
      }),
      "each",
      ImagePanel,
      135,
      6
    );
    var div_7 = sibling(div_4, 2);
    var div_8 = child(div_7);
    var div_9 = child(div_8);
    var button_2 = child(div_9);
    var node_3 = child(button_2);
    {
      var consequent = ($$anchor2) => {
        var fragment_1 = root_2$1();
        var node_4 = first_child(fragment_1);
        add_svelte_meta(() => Square_check_big(node_4, { class: "w-4 h-4" }), "component", ImagePanel, 158, 12, { componentTag: "CheckSquare" });
        append($$anchor2, fragment_1);
      };
      var alternate = ($$anchor2) => {
        var fragment_2 = root_3();
        var node_5 = first_child(fragment_2);
        add_svelte_meta(() => Square(node_5, { class: "w-4 h-4" }), "component", ImagePanel, 161, 12, { componentTag: "Square" });
        append($$anchor2, fragment_2);
      };
      add_svelte_meta(
        () => if_block(node_3, ($$render) => {
          if (get(selectedImages), get(filteredImages), untrack(() => strict_equals(get(selectedImages).size, get(filteredImages).length) && get(filteredImages).length > 0)) $$render(consequent);
          else $$render(alternate, false);
        }),
        "if",
        ImagePanel,
        157,
        10
      );
    }
    var span_1 = sibling(button_2, 2);
    var text_2 = child(span_1);
    var div_10 = sibling(div_9, 2);
    var div_11 = child(div_10);
    var button_3 = child(div_11);
    var node_6 = child(button_3);
    add_svelte_meta(() => Grid_3x3(node_6, { class: "w-4 h-4" }), "component", ImagePanel, 178, 12, { componentTag: "Grid" });
    var button_4 = sibling(button_3, 2);
    var node_7 = child(button_4);
    add_svelte_meta(() => List(node_7, { class: "w-4 h-4" }), "component", ImagePanel, 184, 12, { componentTag: "List" });
    var node_8 = sibling(div_11, 2);
    {
      var consequent_1 = ($$anchor2) => {
        var button_5 = root_4$1();
        var node_9 = child(button_5);
        add_svelte_meta(() => Download(node_9, { class: "w-4 h-4" }), "component", ImagePanel, 194, 12, { componentTag: "Download" });
        event("click", button_5, downloadSelectedImages);
        append($$anchor2, button_5);
      };
      add_svelte_meta(
        () => if_block(node_8, ($$render) => {
          if (get(selectedImages), untrack(() => get(selectedImages).size > 0)) $$render(consequent_1);
        }),
        "if",
        ImagePanel,
        189,
        8
      );
    }
    var div_12 = sibling(div_7, 2);
    var node_10 = child(div_12);
    {
      var consequent_2 = ($$anchor2) => {
        var div_13 = root_5();
        var node_11 = child(div_13);
        add_svelte_meta(() => Image$1(node_11, { class: "w-12 h-12 mx-auto mb-3 opacity-50" }), "component", ImagePanel, 206, 8, { componentTag: "ImageIcon" });
        append($$anchor2, div_13);
      };
      var alternate_2 = ($$anchor2) => {
        var fragment_3 = comment();
        var node_12 = first_child(fragment_3);
        add_svelte_meta(
          () => each(
            node_12,
            1,
            () => (get(groupedImages), untrack(() => Object.entries(get(groupedImages)))),
            index,
            ($$anchor3, $$item) => {
              var $$array = /* @__PURE__ */ user_derived(() => to_array(get($$item), 2));
              let category = () => get($$array)[0];
              category();
              let categoryImages = () => get($$array)[1];
              categoryImages();
              var div_14 = root_7();
              var h3 = child(div_14);
              var span_2 = child(h3);
              var text_3 = child(span_2, true);
              reset(span_2);
              var span_3 = sibling(span_2, 2);
              var text_4 = child(span_3);
              reset(span_3);
              reset(h3);
              var div_15 = sibling(h3, 2);
              add_svelte_meta(
                () => each(div_15, 5, categoryImages, index, ($$anchor4, image) => {
                  var div_16 = root_8();
                  var button_6 = child(div_16);
                  var node_13 = child(button_6);
                  {
                    var consequent_3 = ($$anchor5) => {
                      add_svelte_meta(() => Square_check_big($$anchor5, { class: "w-4 h-4 text-primary-500" }), "component", ImagePanel, 229, 20, { componentTag: "CheckSquare" });
                    };
                    var alternate_1 = ($$anchor5) => {
                      add_svelte_meta(() => Square($$anchor5, { class: "w-4 h-4 text-gray-400" }), "component", ImagePanel, 231, 20, { componentTag: "Square" });
                    };
                    add_svelte_meta(
                      () => if_block(node_13, ($$render) => {
                        if (get(selectedImages), get(image), untrack(() => get(selectedImages).has(get(image).index))) $$render(consequent_3);
                        else $$render(alternate_1, false);
                      }),
                      "if",
                      ImagePanel,
                      228,
                      18
                    );
                  }
                  reset(button_6);
                  var div_17 = sibling(button_6, 2);
                  var img_1 = child(div_17);
                  reset(div_17);
                  var div_18 = sibling(div_17, 2);
                  var p = child(div_18);
                  var text_5 = child(p, true);
                  reset(p);
                  var p_1 = sibling(p, 2);
                  var text_6 = child(p_1);
                  reset(p_1);
                  var node_14 = sibling(p_1, 2);
                  {
                    var consequent_4 = ($$anchor5) => {
                      var div_19 = root_11();
                      var button_7 = child(div_19);
                      reset(div_19);
                      event("click", button_7, () => downloadImage(get(image)));
                      append($$anchor5, div_19);
                    };
                    add_svelte_meta(
                      () => if_block(node_14, ($$render) => {
                        if (strict_equals(get(viewMode), "list")) $$render(consequent_4);
                      }),
                      "if",
                      ImagePanel,
                      254,
                      18
                    );
                  }
                  reset(div_18);
                  var node_15 = sibling(div_18, 2);
                  {
                    var consequent_5 = ($$anchor5) => {
                      var div_20 = root_12();
                      var button_8 = child(div_20);
                      var node_16 = child(button_8);
                      add_svelte_meta(() => Download(node_16, { class: "w-4 h-4" }), "component", ImagePanel, 273, 22, { componentTag: "Download" });
                      reset(button_8);
                      reset(div_20);
                      event("click", button_8, () => downloadImage(get(image)));
                      append($$anchor5, div_20);
                    };
                    add_svelte_meta(
                      () => if_block(node_15, ($$render) => {
                        if (strict_equals(get(viewMode), "grid")) $$render(consequent_5);
                      }),
                      "if",
                      ImagePanel,
                      267,
                      16
                    );
                  }
                  reset(div_16);
                  template_effect(() => {
                    set_class(div_16, 1, `group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200
                       ${strict_equals(get(viewMode), "list") ? "flex items-center space-x-3" : ""}`);
                    set_class(div_17, 1, `${strict_equals(get(viewMode), "list") ? "w-16 h-16 flex-shrink-0" : "aspect-square"} bg-gray-100`);
                    set_attribute(img_1, "src", (get(image), untrack(() => get(image).src)));
                    set_attribute(img_1, "alt", (get(image), untrack(() => get(image).alt)));
                    set_text(text_5, (get(image), untrack(() => get(image).alt)));
                    set_text(text_6, `${(get(image), untrack(() => get(image).width)) ?? ""} × ${(get(image), untrack(() => get(image).height)) ?? ""}`);
                  });
                  event("click", button_6, stopPropagation(() => toggleImageSelection(get(image).index)));
                  append($$anchor4, div_16);
                }),
                "each",
                ImagePanel,
                218,
                12
              );
              reset(div_15);
              reset(div_14);
              template_effect(() => {
                set_text(text_3, category());
                set_text(text_4, `(${(categoryImages(), untrack(() => categoryImages().length)) ?? ""}张)`);
                set_class(div_15, 1, `space-y-2 ${strict_equals(get(viewMode), "grid") ? "grid grid-cols-2 gap-2" : ""}`);
              });
              append($$anchor3, div_14);
            }
          ),
          "each",
          ImagePanel,
          210,
          6
        );
        append($$anchor2, fragment_3);
      };
      add_svelte_meta(
        () => if_block(node_10, ($$render) => {
          if (get(groupedImages), untrack(() => strict_equals(Object.keys(get(groupedImages)).length, 0))) $$render(consequent_2);
          else $$render(alternate_2, false);
        }),
        "if",
        ImagePanel,
        204,
        4
      );
    }
    var div_21 = sibling(div_12, 2);
    var div_22 = child(div_21);
    var button_9 = child(div_22);
    var span_4 = sibling(button_9, 2);
    var text_7 = child(span_4);
    template_effect(() => {
      set_text(text, `${(get(filteredImages), untrack(() => get(filteredImages).length)) ?? ""} 张`);
      set_text(text_2, `已选 ${(get(selectedImages), untrack(() => get(selectedImages).size)) ?? ""} 张`);
      set_class(button_3, 1, `p-1 rounded ${strict_equals(get(viewMode), "grid") ? "bg-white shadow-sm" : ""}`);
      set_class(button_4, 1, `p-1 rounded ${strict_equals(get(viewMode), "list") ? "bg-white shadow-sm" : ""}`);
      set_text(text_7, `共 ${(deep_read_state(images()), untrack(() => images().length)) ?? ""} 张图片`);
    });
    event("click", div, function(...$$args) {
      apply(onClose, this, $$args, ImagePanel, [99, 99]);
    });
    event("click", button, function(...$$args) {
      apply(onClose, this, $$args, ImagePanel, [113, 16]);
    });
    bind_value(
      input,
      function get$1() {
        return get(searchTerm);
      },
      function set$1($$value) {
        set(searchTerm, $$value);
      }
    );
    event("click", button_2, toggleSelectAll);
    event("click", button_3, () => set(viewMode, "grid"));
    event("click", button_4, () => set(viewMode, "list"));
    event("click", button_9, copyAllLinks);
    append($$anchor, fragment);
    return pop($$exports);
  }
  Toolbar[FILENAME] = "src/components/Toolbar.svelte";
  var root_2 = add_locations(/* @__PURE__ */ from_html(`<div class="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>`), Toolbar[FILENAME], [[118, 10]]);
  var root_4 = add_locations(/* @__PURE__ */ from_html(`<button class="relative bg-green-500 text-white p-3 rounded-xl hover:bg-green-600 hover:shadow-lg transition-all duration-300 hover:scale-105" title="查看抓取的图片"><div class="relative"><!> <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center"> </span></div></button>`), Toolbar[FILENAME], [[130, 8, [[135, 10, [[137, 12]]]]]]);
  var root_1 = add_locations(/* @__PURE__ */ from_html(`<div class="fixed top-1/2 right-4 transform -translate-y-1/2 z-high animate-fade-in"><div class="glass-effect rounded-2xl shadow-soft p-2 space-y-2"><button class="group relative gradient-primary text-white p-3 rounded-xl hover:shadow-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" title="抓取页面图片"><!> <div class="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-1 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"> </div></button> <!></div></div> <!>`, 1), Toolbar[FILENAME], [[109, 2, [[110, 4, [[111, 6, [[124, 8]]]]]]]]);
  function Toolbar($$anchor, $$props) {
    check_target(new.target);
    push($$props, false, Toolbar);
    let showImagePanel = /* @__PURE__ */ mutable_source(false);
    let extractedImages = /* @__PURE__ */ mutable_source([]);
    let isExtracting = /* @__PURE__ */ mutable_source(false);
    async function extractImages() {
      set(isExtracting, true);
      try {
        const allImages = document.querySelectorAll("img");
        const images = [];
        allImages.forEach((img, index2) => {
          const src = img.src || img.getAttribute("data-src") || "";
          const alt = img.alt || `图片 ${index2 + 1}`;
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (src && !src.includes("data:image")) {
            let category = "其他图片";
            if (width > 400 && height > 400) {
              category = "商品主图";
            } else if (img.closest(".detail-content, .product-detail, .description")) {
              category = "商品详情";
            } else if (img.closest(".review, .comment, .rating")) {
              category = "买家评价";
            } else if (width < 150 && height < 150) {
              category = "缩略图";
            }
            images.push({ src, alt, width, height, category, index: index2 });
          }
        });
        set(extractedImages, images);
        set(showImagePanel, true);
        window.postMessage({ type: "IMAGES_EXTRACTED", images }, "*");
      } catch (error) {
        console.error(...log_if_contains_state("error", "提取图片失败:", error));
      } finally {
        set(isExtracting, false);
      }
    }
    function closeImagePanel() {
      set(showImagePanel, false);
    }
    function isEcommerceSite() {
      const hostname = window.location.hostname;
      const ecommerceDomains = [
        "taobao.com",
        "tmall.com",
        "jd.com",
        "amazon.",
        "suning.com",
        "pinduoduo.com",
        "vip.com",
        "dangdang.com",
        "yhd.com"
      ];
      return ecommerceDomains.some((domain) => hostname.includes(domain));
    }
    function isProductPage2() {
      const url = window.location.href;
      const productKeywords = ["item", "product", "goods", "detail"];
      const hasProductKeyword = productKeywords.some((keyword) => url.toLowerCase().includes(keyword));
      const hasProductElements = document.querySelector(".price, .product-price, .goods-price, .product-name, .product-title");
      return hasProductKeyword || hasProductElements;
    }
    var $$exports = { ...legacy_api() };
    init();
    var fragment = comment();
    var node = first_child(fragment);
    {
      var consequent_3 = ($$anchor2) => {
        var fragment_1 = root_1();
        var div = first_child(fragment_1);
        var div_1 = child(div);
        var button = child(div_1);
        var node_1 = child(button);
        {
          var consequent = ($$anchor3) => {
            var div_2 = root_2();
            append($$anchor3, div_2);
          };
          var alternate = ($$anchor3) => {
            add_svelte_meta(() => Image$1($$anchor3, { class: "w-5 h-5" }), "component", Toolbar, 120, 10, { componentTag: "Image" });
          };
          add_svelte_meta(
            () => if_block(node_1, ($$render) => {
              if (get(isExtracting)) $$render(consequent);
              else $$render(alternate, false);
            }),
            "if",
            Toolbar,
            117,
            8
          );
        }
        var div_3 = sibling(node_1, 2);
        var text = child(div_3);
        var node_2 = sibling(button, 2);
        {
          var consequent_1 = ($$anchor3) => {
            var button_1 = root_4();
            var div_4 = child(button_1);
            var node_3 = child(div_4);
            add_svelte_meta(() => Image$1(node_3, { class: "w-5 h-5" }), "component", Toolbar, 136, 12, { componentTag: "Image" });
            var span = sibling(node_3, 2);
            var text_1 = child(span);
            template_effect(() => set_text(text_1, get(extractedImages).length));
            event("click", button_1, () => set(showImagePanel, true));
            append($$anchor3, button_1);
          };
          add_svelte_meta(
            () => if_block(node_2, ($$render) => {
              if (get(extractedImages).length > 0) $$render(consequent_1);
            }),
            "if",
            Toolbar,
            129,
            6
          );
        }
        var node_4 = sibling(div, 2);
        {
          var consequent_2 = ($$anchor3) => {
            add_svelte_meta(
              () => ImagePanel($$anchor3, {
                get images() {
                  return get(extractedImages);
                },
                onClose: closeImagePanel
              }),
              "component",
              Toolbar,
              148,
              4,
              { componentTag: "ImagePanel" }
            );
          };
          add_svelte_meta(
            () => if_block(node_4, ($$render) => {
              if (get(showImagePanel)) $$render(consequent_2);
            }),
            "if",
            Toolbar,
            147,
            2
          );
        }
        template_effect(() => {
          button.disabled = get(isExtracting);
          set_text(text, get(isExtracting) ? "正在抓取..." : "抓取图片");
        });
        event("click", button, extractImages);
        append($$anchor2, fragment_1);
      };
      add_svelte_meta(
        () => if_block(node, ($$render) => {
          if (isEcommerceSite() && isProductPage2()) $$render(consequent_3);
        }),
        "if",
        Toolbar,
        107,
        0
      );
    }
    append($$anchor, fragment);
    return pop($$exports);
  }
  const Toolbar$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    default: Toolbar
  }, Symbol.toStringTag, { value: "Module" }));
  return result;
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjIwLjExX0B0eXBlcytub2RlQDI0Ll80ODU4NDUxYWVlMjA2NjNmZWU1MGVjNzAxZjE3ZWVlNi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvZGVmaW5lLWNvbnRlbnQtc2NyaXB0Lm1qcyIsIi4uLy4uLy4uL3NyYy9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0B3eHQtZGV2K2Jyb3dzZXJAMC4xLjQvbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4yMC4xMV9AdHlwZXMrbm9kZUAyNC5fNDg1ODQ1MWFlZTIwNjYzZmVlNTBlYzcwMWYxN2VlZTYvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjIwLjExX0B0eXBlcytub2RlQDI0Ll80ODU4NDUxYWVlMjA2NjNmZWU1MGVjNzAxZjE3ZWVlNi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4yMC4xMV9AdHlwZXMrbm9kZUAyNC5fNDg1ODQ1MWFlZTIwNjYzZmVlNTBlYzcwMWYxN2VlZTYvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjIwLjExX0B0eXBlcytub2RlQDI0Ll80ODU4NDUxYWVlMjA2NjNmZWU1MGVjNzAxZjE3ZWVlNi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMjAuMTFfQHR5cGVzK25vZGVAMjQuXzQ4NTg0NTFhZWUyMDY2M2ZlZTUwZWM3MDFmMTdlZWU2L25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL3ZlcnNpb24uanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9kaXNjbG9zZS12ZXJzaW9uLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvZmxhZ3MvaW5kZXguanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9mbGFncy9sZWdhY3kuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9jb25zdGFudHMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vZXNtLWVudkAxLjIuMi9ub2RlX21vZHVsZXMvZXNtLWVudi90cnVlLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvc2hhcmVkL3V0aWxzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2NvbnN0YW50cy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL3NoYXJlZC9lcnJvcnMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZXJyb3JzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L3dhcm5pbmdzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9oeWRyYXRpb24uanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvcmVhY3Rpdml0eS9lcXVhbGl0eS5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL3NoYXJlZC93YXJuaW5ncy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL3NoYXJlZC9jbG9uZS5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kZXYvdHJhY2luZy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL3NoYXJlZC9kZXYuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvY29udGV4dC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vdGFzay5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9lcnJvci1oYW5kbGluZy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9yZWFjdGl2aXR5L2JhdGNoLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9ibG9ja3MvZWFjaC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9yZWFjdGl2aXR5L2FzeW5jLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L3JlYWN0aXZpdHkvZGVyaXZlZHMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvcmVhY3Rpdml0eS9zb3VyY2VzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L3Byb3h5LmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2Rldi9lcXVhbGl0eS5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vb3BlcmF0aW9ucy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vZWxlbWVudHMvbWlzYy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vZWxlbWVudHMvYmluZGluZ3Mvc2hhcmVkLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L3JlYWN0aXZpdHkvZWZmZWN0cy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9ydW50aW1lLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9lbGVtZW50cy9ldmVudHMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL3JlY29uY2lsZXIuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL3RlbXBsYXRlLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvdXRpbHMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvcmVuZGVyLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvc2hhcmVkL3ZhbGlkYXRlLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9ibG9ja3MvYnJhbmNoZXMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2Jsb2Nrcy9zbmlwcGV0LmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW5kZXgtY2xpZW50LmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2Rldi9lbGVtZW50cy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kZXYvbGVnYWN5LmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9ibG9ja3MvaWYuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2Jsb2Nrcy9zbG90LmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9ibG9ja3Mvc3ZlbHRlLWVsZW1lbnQuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2VsZW1lbnRzL2F0dGFjaG1lbnRzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL2Nsc3hAMi4xLjEvbm9kZV9tb2R1bGVzL2Nsc3gvZGlzdC9jbHN4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL3NoYXJlZC9hdHRyaWJ1dGVzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2RvbS9lbGVtZW50cy9jbGFzcy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vZWxlbWVudHMvc3R5bGUuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2VsZW1lbnRzL2JpbmRpbmdzL3NlbGVjdC5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vZWxlbWVudHMvYXR0cmlidXRlcy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9kb20vZWxlbWVudHMvYmluZGluZ3MvaW5wdXQuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2xlZ2FjeS9ldmVudC1tb2RpZmllcnMuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvZG9tL2xlZ2FjeS9saWZlY3ljbGUuanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvc3ZlbHRlL3NyYy9pbnRlcm5hbC9jbGllbnQvcmVhY3Rpdml0eS9zdG9yZS5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL2ludGVybmFsL2NsaWVudC9yZWFjdGl2aXR5L3Byb3BzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvaW50ZXJuYWwvY2xpZW50L2Rldi9jb25zb2xlLWxvZy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9sdWNpZGUtc3ZlbHRlQDAuNTU1LjBfc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvbHVjaWRlLXN2ZWx0ZS9kaXN0L2RlZmF1bHRBdHRyaWJ1dGVzLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL2x1Y2lkZS1zdmVsdGVAMC41NTUuMF9zdmVsdGVANS40NS4zL25vZGVfbW9kdWxlcy9sdWNpZGUtc3ZlbHRlL2Rpc3QvSWNvbi5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy9kb3dubG9hZC5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy9ncmlkLTN4My5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy9pbWFnZS5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy9saXN0LnN2ZWx0ZSIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9sdWNpZGUtc3ZlbHRlQDAuNTU1LjBfc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvbHVjaWRlLXN2ZWx0ZS9kaXN0L2ljb25zL3NlYXJjaC5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy9zcXVhcmUtY2hlY2stYmlnLnN2ZWx0ZSIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9sdWNpZGUtc3ZlbHRlQDAuNTU1LjBfc3ZlbHRlQDUuNDUuMy9ub2RlX21vZHVsZXMvbHVjaWRlLXN2ZWx0ZS9kaXN0L2ljb25zL3NxdWFyZS5zdmVsdGUiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vbHVjaWRlLXN2ZWx0ZUAwLjU1NS4wX3N2ZWx0ZUA1LjQ1LjMvbm9kZV9tb2R1bGVzL2x1Y2lkZS1zdmVsdGUvZGlzdC9pY29ucy94LnN2ZWx0ZSIsIi4uLy4uLy4uL3NyYy9jb21wb25lbnRzL0ltYWdlUGFuZWwuc3ZlbHRlIiwiLi4vLi4vLi4vc3JjL2NvbXBvbmVudHMvVG9vbGJhci5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsImltcG9ydCAnLi4vc3R5bGVzL2dsb2JhbC5jc3MnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcbiAgbWF0Y2hlczogW1xuICAgICcqOi8vKi50YW9iYW8uY29tLyonLFxuICAgICcqOi8vKi50bWFsbC5jb20vKicsXG4gICAgJyo6Ly8qLmpkLmNvbS8qJyxcbiAgICAnKjovLyouYW1hem9uLmNvbS8qJyxcbiAgICAnKjovLyouYW1hem9uLmNuLyonLFxuICAgICcqOi8vKi5zdW5pbmcuY29tLyonLFxuICAgICcqOi8vKi5waW5kdW9kdW8uY29tLyonLFxuICAgICcqOi8vKi52aXAuY29tLyonLFxuICAgICcqOi8vKi5kYW5nZGFuZy5jb20vKicsXG4gICAgJyo6Ly8qLnloZC5jb20vKidcbiAgXSxcbiAgbWFpbigpIHtcbiAgICBjb25zb2xlLmxvZygn5Zu+54mH5oqT5Y+W5omp5bGV5bey5Yqg6L29Jyk7XG5cbiAgICAvLyDnrYnlvoXpobXpnaLliqDovb3lrozmiJBcbiAgICBmdW5jdGlvbiB3YWl0Rm9yUGFnZUxvYWQoKSB7XG4gICAgICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICBpbmplY3RUb29sYmFyKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGluamVjdFRvb2xiYXIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIOazqOWFpeW3peWFt+agj1xuICAgIGZ1bmN0aW9uIGluamVjdFRvb2xiYXIoKSB7XG4gICAgICAvLyDmo4Dmn6XmmK/lkKblt7Lnu4/ms6jlhaXov4dcbiAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW1hZ2UtZXh0cmFjdG9yLXJvb3QnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIOWIm+W7uuagueWuueWZqFxuICAgICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgcm9vdC5pZCA9ICdpbWFnZS1leHRyYWN0b3Itcm9vdCc7XG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHJvb3QpO1xuXG4gICAgICAvLyDliqjmgIHlr7zlhaXlubbmjILovb1TdmVsdGXnu4Tku7ZcbiAgICAgIGltcG9ydCgnLi4vY29tcG9uZW50cy9Ub29sYmFyLnN2ZWx0ZScpLnRoZW4oKHsgZGVmYXVsdDogVG9vbGJhciB9KSA9PiB7XG4gICAgICAgIG5ldyBUb29sYmFyKHtcbiAgICAgICAgICB0YXJnZXQ6IHJvb3RcbiAgICAgICAgfSk7XG4gICAgICB9KS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veW3peWFt+agj+Wksei0pTonLCBlcnJvcik7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyDnm5HlkKzmnaXoh6rlt6XlhbfmoI/nmoTmtojmga9cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93IHx8ICFldmVudC5kYXRhLnR5cGUpIHJldHVybjtcblxuICAgICAgc3dpdGNoIChldmVudC5kYXRhLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnSU1BR0VTX0VYVFJBQ1RFRCc6XG4gICAgICAgICAgY29uc29sZS5sb2coJ+WbvueJh+aPkOWPluWujOaIkDonLCBldmVudC5kYXRhLmltYWdlcyk7XG4gICAgICAgICAgLy8g5Y+v5Lul5Zyo6L+Z6YeM5re75Yqg6aKd5aSW55qE5aSE55CG6YC76L6RXG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyDpobXpnaLlj5jljJbml7bph43mlrDmo4Dmn6VcbiAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChtdXRhdGlvbnMpID0+IHtcbiAgICAgIG11dGF0aW9ucy5mb3JFYWNoKChtdXRhdGlvbikgPT4ge1xuICAgICAgICBpZiAobXV0YXRpb24udHlwZSA9PT0gJ2NoaWxkTGlzdCcpIHtcbiAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbpnIDopoHph43mlrDms6jlhaXlt6XlhbfmoI/vvIhTUEHpobXpnaLliIfmjaLvvIlcbiAgICAgICAgICBjb25zdCBoYXNSb290ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ltYWdlLWV4dHJhY3Rvci1yb290Jyk7XG4gICAgICAgICAgaWYgKCFoYXNSb290ICYmIGlzUHJvZHVjdFBhZ2UoKSkge1xuICAgICAgICAgICAgc2V0VGltZW91dChpbmplY3RUb29sYmFyLCAxMDAwKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7XG4gICAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyDlkK/liqhcbiAgICB3YWl0Rm9yUGFnZUxvYWQoKTtcbiAgfSxcbn0pO1xuXG4vLyDovoXliqnlh73mlbDvvJrmo4Dmn6XmmK/lkKblnKjllYblk4Hor6bmg4XpobVcbmZ1bmN0aW9uIGlzUHJvZHVjdFBhZ2UoKTogYm9vbGVhbiB7XG4gIGNvbnN0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xuICBjb25zdCBwcm9kdWN0S2V5d29yZHMgPSBbJ2l0ZW0nLCAncHJvZHVjdCcsICdnb29kcycsICdkZXRhaWwnXTtcbiAgY29uc3QgaGFzUHJvZHVjdEtleXdvcmQgPSBwcm9kdWN0S2V5d29yZHMuc29tZShrZXl3b3JkID0+XG4gICAgdXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoa2V5d29yZClcbiAgKTtcblxuICAvLyDmo4Dmn6XpobXpnaLmmK/lkKbljIXlkKvllYblk4Hnm7jlhbPlhYPntKBcbiAgY29uc3QgaGFzUHJvZHVjdEVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcbiAgICAnLnByaWNlLCAucHJvZHVjdC1wcmljZSwgLmdvb2RzLXByaWNlLCAucHJvZHVjdC1uYW1lLCAucHJvZHVjdC10aXRsZSwgJyArXG4gICAgJ1tjbGFzcyo9XCJwcmljZVwiXSwgW2NsYXNzKj1cInByb2R1Y3RcIl0sIFtkYXRhLXNrdV0nXG4gICk7XG5cbiAgcmV0dXJuIGhhc1Byb2R1Y3RLZXl3b3JkIHx8IGhhc1Byb2R1Y3RFbGVtZW50cztcbn1cbiIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsImZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCk7XG4gICAgbWV0aG9kKGBbd3h0XSAke21lc3NhZ2V9YCwgLi4uYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG4gIGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcbiAgd2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG4gIGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5leHBvcnQgY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgY29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcbiAgICBzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcbiAgICB0aGlzLm5ld1VybCA9IG5ld1VybDtcbiAgICB0aGlzLm9sZFVybCA9IG9sZFVybDtcbiAgfVxuICBzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbiIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcbiAgbGV0IGludGVydmFsO1xuICBsZXQgb2xkVXJsO1xuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIEVuc3VyZSB0aGUgbG9jYXRpb24gd2F0Y2hlciBpcyBhY3RpdmVseSBsb29raW5nIGZvciBVUkwgY2hhbmdlcy4gSWYgaXQncyBhbHJlYWR5IHdhdGNoaW5nLFxuICAgICAqIHRoaXMgaXMgYSBub29wLlxuICAgICAqL1xuICAgIHJ1bigpIHtcbiAgICAgIGlmIChpbnRlcnZhbCAhPSBudWxsKSByZXR1cm47XG4gICAgICBvbGRVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgaW50ZXJ2YWwgPSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBsZXQgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgaWYgKG5ld1VybC5ocmVmICE9PSBvbGRVcmwuaHJlZikge1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgb2xkVXJsKSk7XG4gICAgICAgICAgb2xkVXJsID0gbmV3VXJsO1xuICAgICAgICB9XG4gICAgICB9LCAxZTMpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzXCI7XG5pbXBvcnQge1xuICBnZXRVbmlxdWVFdmVudE5hbWVcbn0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5leHBvcnQgY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuICBjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuICAgIHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgIHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGlmICh0aGlzLmlzVG9wRnJhbWUpIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKHsgaWdub3JlRmlyc3RFdmVudDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcbiAgICB9XG4gIH1cbiAgc3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcbiAgICBcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCJcbiAgKTtcbiAgaXNUb3BGcmFtZSA9IHdpbmRvdy5zZWxmID09PSB3aW5kb3cudG9wO1xuICBhYm9ydENvbnRyb2xsZXI7XG4gIGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcbiAgcmVjZWl2ZWRNZXNzYWdlSWRzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgZ2V0IHNpZ25hbCgpIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuICB9XG4gIGFib3J0KHJlYXNvbikge1xuICAgIHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuICB9XG4gIGdldCBpc0ludmFsaWQoKSB7XG4gICAgaWYgKGJyb3dzZXIucnVudGltZS5pZCA9PSBudWxsKSB7XG4gICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuICB9XG4gIGdldCBpc1ZhbGlkKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG4gIH1cbiAgLyoqXG4gICAqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGNiKTtcbiAgICogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcbiAgICogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcbiAgICogfSlcbiAgICogLy8gLi4uXG4gICAqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcbiAgICovXG4gIG9uSW52YWxpZGF0ZWQoY2IpIHtcbiAgICB0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICAgIHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICB9XG4gIC8qKlxuICAgKiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cbiAgICogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcbiAgICogICBpZiAoY3R4LmlzSW52YWxpZCkgcmV0dXJuIGN0eC5ibG9jaygpO1xuICAgKlxuICAgKiAgIC8vIC4uLlxuICAgKiB9XG4gICAqL1xuICBibG9jaygpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge1xuICAgIH0pO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKlxuICAgKiBJbnRlcnZhbHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjbGVhckludGVydmFsYCBmdW5jdGlvbi5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKlxuICAgKiBUaW1lb3V0cyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYHNldFRpbWVvdXRgIGZ1bmN0aW9uLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYCBmdW5jdGlvbi5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbElkbGVDYWxsYmFja2AgZnVuY3Rpb24uXG4gICAqL1xuICByZXF1ZXN0SWRsZUNhbGxiYWNrKGNhbGxiYWNrLCBvcHRpb25zKSB7XG4gICAgY29uc3QgaWQgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuc2lnbmFsLmFib3J0ZWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0sIG9wdGlvbnMpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxJZGxlQ2FsbGJhY2soaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgYWRkRXZlbnRMaXN0ZW5lcih0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZSA9PT0gXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIikge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgdGhpcy5sb2NhdGlvbldhdGNoZXIucnVuKCk7XG4gICAgfVxuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyPy4oXG4gICAgICB0eXBlLnN0YXJ0c1dpdGgoXCJ3eHQ6XCIpID8gZ2V0VW5pcXVlRXZlbnROYW1lKHR5cGUpIDogdHlwZSxcbiAgICAgIGhhbmRsZXIsXG4gICAgICB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHNpZ25hbDogdGhpcy5zaWduYWxcbiAgICAgIH1cbiAgICApO1xuICB9XG4gIC8qKlxuICAgKiBAaW50ZXJuYWxcbiAgICogQWJvcnQgdGhlIGFib3J0IGNvbnRyb2xsZXIgYW5kIGV4ZWN1dGUgYWxsIGBvbkludmFsaWRhdGVkYCBsaXN0ZW5lcnMuXG4gICAqL1xuICBub3RpZnlJbnZhbGlkYXRlZCgpIHtcbiAgICB0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgQ29udGVudCBzY3JpcHQgXCIke3RoaXMuY29udGVudFNjcmlwdE5hbWV9XCIgY29udGV4dCBpbnZhbGlkYXRlZGBcbiAgICApO1xuICB9XG4gIHN0b3BPbGRTY3JpcHRzKCkge1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShcbiAgICAgIHtcbiAgICAgICAgdHlwZTogQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLFxuICAgICAgICBjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcbiAgICAgICAgbWVzc2FnZUlkOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKVxuICAgICAgfSxcbiAgICAgIFwiKlwiXG4gICAgKTtcbiAgfVxuICB2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcbiAgICBjb25zdCBpc1NjcmlwdFN0YXJ0ZWRFdmVudCA9IGV2ZW50LmRhdGE/LnR5cGUgPT09IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRTtcbiAgICBjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGF0YT8uY29udGVudFNjcmlwdE5hbWUgPT09IHRoaXMuY29udGVudFNjcmlwdE5hbWU7XG4gICAgY29uc3QgaXNOb3REdXBsaWNhdGUgPSAhdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuaGFzKGV2ZW50LmRhdGE/Lm1lc3NhZ2VJZCk7XG4gICAgcmV0dXJuIGlzU2NyaXB0U3RhcnRlZEV2ZW50ICYmIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgaXNOb3REdXBsaWNhdGU7XG4gIH1cbiAgbGlzdGVuRm9yTmV3ZXJTY3JpcHRzKG9wdGlvbnMpIHtcbiAgICBsZXQgaXNGaXJzdCA9IHRydWU7XG4gICAgY29uc3QgY2IgPSAoZXZlbnQpID0+IHtcbiAgICAgIGlmICh0aGlzLnZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkpIHtcbiAgICAgICAgdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuYWRkKGV2ZW50LmRhdGEubWVzc2FnZUlkKTtcbiAgICAgICAgY29uc3Qgd2FzRmlyc3QgPSBpc0ZpcnN0O1xuICAgICAgICBpc0ZpcnN0ID0gZmFsc2U7XG4gICAgICAgIGlmICh3YXNGaXJzdCAmJiBvcHRpb25zPy5pZ25vcmVGaXJzdEV2ZW50KSByZXR1cm47XG4gICAgICAgIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gcmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpKTtcbiAgfVxufVxuIiwiLy8gZ2VuZXJhdGVkIGR1cmluZyByZWxlYXNlLCBkbyBub3QgbW9kaWZ5XG5cbi8qKlxuICogVGhlIGN1cnJlbnQgdmVyc2lvbiwgYXMgc2V0IGluIHBhY2thZ2UuanNvbi5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKi9cbmV4cG9ydCBjb25zdCBWRVJTSU9OID0gJzUuNDUuMyc7XG5leHBvcnQgY29uc3QgUFVCTElDX1ZFUlNJT04gPSAnNSc7XG4iLCJpbXBvcnQgeyBQVUJMSUNfVkVSU0lPTiB9IGZyb20gJy4uL3ZlcnNpb24uanMnO1xuXG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHQoKHdpbmRvdy5fX3N2ZWx0ZSA/Pz0ge30pLnYgPz89IG5ldyBTZXQoKSkuYWRkKFBVQkxJQ19WRVJTSU9OKTtcbn1cbiIsIi8qKiBUcnVlIGlmIGV4cGVyaW1lbnRhbC5hc3luYz10cnVlICovXG5leHBvcnQgbGV0IGFzeW5jX21vZGVfZmxhZyA9IGZhbHNlO1xuLyoqIFRydWUgaWYgd2UncmUgbm90IGNlcnRhaW4gdGhhdCB3ZSBvbmx5IGhhdmUgU3ZlbHRlIDUgY29kZSBpbiB0aGUgY29tcGlsYXRpb24gKi9cbmV4cG9ydCBsZXQgbGVnYWN5X21vZGVfZmxhZyA9IGZhbHNlO1xuLyoqIFRydWUgaWYgJGluc3BlY3QudHJhY2UgaXMgdXNlZCAqL1xuZXhwb3J0IGxldCB0cmFjaW5nX21vZGVfZmxhZyA9IGZhbHNlO1xuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlX2FzeW5jX21vZGVfZmxhZygpIHtcblx0YXN5bmNfbW9kZV9mbGFnID0gdHJ1ZTtcbn1cblxuLyoqIE9OTFkgVVNFIFRISVMgRFVSSU5HIFRFU1RJTkcgKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNhYmxlX2FzeW5jX21vZGVfZmxhZygpIHtcblx0YXN5bmNfbW9kZV9mbGFnID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVfbGVnYWN5X21vZGVfZmxhZygpIHtcblx0bGVnYWN5X21vZGVfZmxhZyA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVfdHJhY2luZ19tb2RlX2ZsYWcoKSB7XG5cdHRyYWNpbmdfbW9kZV9mbGFnID0gdHJ1ZTtcbn1cbiIsImltcG9ydCB7IGVuYWJsZV9sZWdhY3lfbW9kZV9mbGFnIH0gZnJvbSAnLi9pbmRleC5qcyc7XG5cbmVuYWJsZV9sZWdhY3lfbW9kZV9mbGFnKCk7XG4iLCJleHBvcnQgY29uc3QgRUFDSF9JVEVNX1JFQUNUSVZFID0gMTtcbmV4cG9ydCBjb25zdCBFQUNIX0lOREVYX1JFQUNUSVZFID0gMSA8PCAxO1xuLyoqIFNlZSBFYWNoQmxvY2sgaW50ZXJmYWNlIG1ldGFkYXRhLmlzX2NvbnRyb2xsZWQgZm9yIGFuIGV4cGxhbmF0aW9uIHdoYXQgdGhpcyBpcyAqL1xuZXhwb3J0IGNvbnN0IEVBQ0hfSVNfQ09OVFJPTExFRCA9IDEgPDwgMjtcbmV4cG9ydCBjb25zdCBFQUNIX0lTX0FOSU1BVEVEID0gMSA8PCAzO1xuZXhwb3J0IGNvbnN0IEVBQ0hfSVRFTV9JTU1VVEFCTEUgPSAxIDw8IDQ7XG5cbmV4cG9ydCBjb25zdCBQUk9QU19JU19JTU1VVEFCTEUgPSAxO1xuZXhwb3J0IGNvbnN0IFBST1BTX0lTX1JVTkVTID0gMSA8PCAxO1xuZXhwb3J0IGNvbnN0IFBST1BTX0lTX1VQREFURUQgPSAxIDw8IDI7XG5leHBvcnQgY29uc3QgUFJPUFNfSVNfQklOREFCTEUgPSAxIDw8IDM7XG5leHBvcnQgY29uc3QgUFJPUFNfSVNfTEFaWV9JTklUSUFMID0gMSA8PCA0O1xuXG5leHBvcnQgY29uc3QgVFJBTlNJVElPTl9JTiA9IDE7XG5leHBvcnQgY29uc3QgVFJBTlNJVElPTl9PVVQgPSAxIDw8IDE7XG5leHBvcnQgY29uc3QgVFJBTlNJVElPTl9HTE9CQUwgPSAxIDw8IDI7XG5cbmV4cG9ydCBjb25zdCBURU1QTEFURV9GUkFHTUVOVCA9IDE7XG5leHBvcnQgY29uc3QgVEVNUExBVEVfVVNFX0lNUE9SVF9OT0RFID0gMSA8PCAxO1xuZXhwb3J0IGNvbnN0IFRFTVBMQVRFX1VTRV9TVkcgPSAxIDw8IDI7XG5leHBvcnQgY29uc3QgVEVNUExBVEVfVVNFX01BVEhNTCA9IDEgPDwgMztcblxuZXhwb3J0IGNvbnN0IEhZRFJBVElPTl9TVEFSVCA9ICdbJztcbi8qKiB1c2VkIHRvIGluZGljYXRlIHRoYXQgYW4gYHs6ZWxzZX0uLi5gIGJsb2NrIHdhcyByZW5kZXJlZCAqL1xuZXhwb3J0IGNvbnN0IEhZRFJBVElPTl9TVEFSVF9FTFNFID0gJ1shJztcbmV4cG9ydCBjb25zdCBIWURSQVRJT05fRU5EID0gJ10nO1xuZXhwb3J0IGNvbnN0IEhZRFJBVElPTl9FUlJPUiA9IHt9O1xuXG5leHBvcnQgY29uc3QgRUxFTUVOVF9JU19OQU1FU1BBQ0VEID0gMTtcbmV4cG9ydCBjb25zdCBFTEVNRU5UX1BSRVNFUlZFX0FUVFJJQlVURV9DQVNFID0gMSA8PCAxO1xuZXhwb3J0IGNvbnN0IEVMRU1FTlRfSVNfSU5QVVQgPSAxIDw8IDI7XG5cbmV4cG9ydCBjb25zdCBVTklOSVRJQUxJWkVEID0gU3ltYm9sKCk7XG5cbi8vIERldi10aW1lIGNvbXBvbmVudCBwcm9wZXJ0aWVzXG5leHBvcnQgY29uc3QgRklMRU5BTUUgPSBTeW1ib2woJ2ZpbGVuYW1lJyk7XG5leHBvcnQgY29uc3QgSE1SID0gU3ltYm9sKCdobXInKTtcblxuZXhwb3J0IGNvbnN0IE5BTUVTUEFDRV9IVE1MID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwnO1xuZXhwb3J0IGNvbnN0IE5BTUVTUEFDRV9TVkcgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuZXhwb3J0IGNvbnN0IE5BTUVTUEFDRV9NQVRITUwgPSAnaHR0cDovL3d3dy53My5vcmcvMTk5OC9NYXRoL01hdGhNTCc7XG5cbi8vIHdlIHVzZSBhIGxpc3Qgb2YgaWdub3JhYmxlIHJ1bnRpbWUgd2FybmluZ3MgYmVjYXVzZSBub3QgZXZlcnkgcnVudGltZSB3YXJuaW5nXG4vLyBjYW4gYmUgaWdub3JlZCBhbmQgd2Ugd2FudCB0byBrZWVwIHRoZSB2YWxpZGF0aW9uIGZvciBzdmVsdGUtaWdub3JlIGluIHBsYWNlXG5leHBvcnQgY29uc3QgSUdOT1JBQkxFX1JVTlRJTUVfV0FSTklOR1MgPSAvKiogQHR5cGUge2NvbnN0fSAqLyAoW1xuXHQnYXdhaXRfd2F0ZXJmYWxsJyxcblx0J2F3YWl0X3JlYWN0aXZpdHlfbG9zcycsXG5cdCdzdGF0ZV9zbmFwc2hvdF91bmNsb25lYWJsZScsXG5cdCdiaW5kaW5nX3Byb3BlcnR5X25vbl9yZWFjdGl2ZScsXG5cdCdoeWRyYXRpb25fYXR0cmlidXRlX2NoYW5nZWQnLFxuXHQnaHlkcmF0aW9uX2h0bWxfY2hhbmdlZCcsXG5cdCdvd25lcnNoaXBfaW52YWxpZF9iaW5kaW5nJyxcblx0J293bmVyc2hpcF9pbnZhbGlkX211dGF0aW9uJ1xuXSk7XG5cbi8qKlxuICogV2hpdGVzcGFjZSBpbnNpZGUgb25lIG9mIHRoZXNlIGVsZW1lbnRzIHdpbGwgbm90IHJlc3VsdCBpblxuICogYSB3aGl0ZXNwYWNlIG5vZGUgYmVpbmcgY3JlYXRlZCBpbiBhbnkgY2lyY3Vtc3RhbmNlcy4gKFRoaXNcbiAqIGxpc3QgaXMgYWxtb3N0IGNlcnRhaW5seSB2ZXJ5IGluY29tcGxldGUpXG4gKiBUT0RPIHRoaXMgaXMgY3VycmVudGx5IHVudXNlZFxuICovXG5leHBvcnQgY29uc3QgRUxFTUVOVFNfV0lUSE9VVF9URVhUID0gWydhdWRpbycsICdkYXRhbGlzdCcsICdkbCcsICdvcHRncm91cCcsICdzZWxlY3QnLCAndmlkZW8nXTtcblxuZXhwb3J0IGNvbnN0IEFUVEFDSE1FTlRfS0VZID0gJ0BhdHRhY2gnO1xuIiwiZXhwb3J0IGRlZmF1bHQgdHJ1ZTtcbiIsIi8vIFN0b3JlIHRoZSByZWZlcmVuY2VzIHRvIGdsb2JhbHMgaW4gY2FzZSBzb21lb25lIHRyaWVzIHRvIG1vbmtleSBwYXRjaCB0aGVzZSwgY2F1c2luZyB0aGUgYmVsb3dcbi8vIHRvIGRlLW9wdCAodGhpcyBvY2N1cnMgb2Z0ZW4gd2hlbiB1c2luZyBwb3B1bGFyIGV4dGVuc2lvbnMpLlxuZXhwb3J0IHZhciBpc19hcnJheSA9IEFycmF5LmlzQXJyYXk7XG5leHBvcnQgdmFyIGluZGV4X29mID0gQXJyYXkucHJvdG90eXBlLmluZGV4T2Y7XG5leHBvcnQgdmFyIGFycmF5X2Zyb20gPSBBcnJheS5mcm9tO1xuZXhwb3J0IHZhciBvYmplY3Rfa2V5cyA9IE9iamVjdC5rZXlzO1xuZXhwb3J0IHZhciBkZWZpbmVfcHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG5leHBvcnQgdmFyIGdldF9kZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbmV4cG9ydCB2YXIgZ2V0X2Rlc2NyaXB0b3JzID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcnM7XG5leHBvcnQgdmFyIG9iamVjdF9wcm90b3R5cGUgPSBPYmplY3QucHJvdG90eXBlO1xuZXhwb3J0IHZhciBhcnJheV9wcm90b3R5cGUgPSBBcnJheS5wcm90b3R5cGU7XG5leHBvcnQgdmFyIGdldF9wcm90b3R5cGVfb2YgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2Y7XG5leHBvcnQgdmFyIGlzX2V4dGVuc2libGUgPSBPYmplY3QuaXNFeHRlbnNpYmxlO1xuXG4vKipcbiAqIEBwYXJhbSB7YW55fSB0aGluZ1xuICogQHJldHVybnMge3RoaW5nIGlzIEZ1bmN0aW9ufVxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNfZnVuY3Rpb24odGhpbmcpIHtcblx0cmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZXhwb3J0IGNvbnN0IG5vb3AgPSAoKSA9PiB7fTtcblxuLy8gQWRhcHRlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS90aGVuL2lzLXByb21pc2UvYmxvYi9tYXN0ZXIvaW5kZXguanNcbi8vIERpc3RyaWJ1dGVkIHVuZGVyIE1JVCBMaWNlbnNlIGh0dHBzOi8vZ2l0aHViLmNvbS90aGVuL2lzLXByb21pc2UvYmxvYi9tYXN0ZXIvTElDRU5TRVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBbVD1hbnldXG4gKiBAcGFyYW0ge2FueX0gdmFsdWVcbiAqIEByZXR1cm5zIHt2YWx1ZSBpcyBQcm9taXNlTGlrZTxUPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzX3Byb21pc2UodmFsdWUpIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZT8udGhlbiA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuLyoqIEBwYXJhbSB7RnVuY3Rpb259IGZuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuKGZuKSB7XG5cdHJldHVybiBmbigpO1xufVxuXG4vKiogQHBhcmFtIHtBcnJheTwoKSA9PiB2b2lkPn0gYXJyICovXG5leHBvcnQgZnVuY3Rpb24gcnVuX2FsbChhcnIpIHtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcblx0XHRhcnJbaV0oKTtcblx0fVxufVxuXG4vKipcbiAqIFRPRE8gcmVwbGFjZSB3aXRoIFByb21pc2Uud2l0aFJlc29sdmVycyBvbmNlIHN1cHBvcnRlZCB3aWRlbHkgZW5vdWdoXG4gKiBAdGVtcGxhdGUgW1Q9dm9pZF1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmVycmVkKCkge1xuXHQvKiogQHR5cGUgeyh2YWx1ZTogVCkgPT4gdm9pZH0gKi9cblx0dmFyIHJlc29sdmU7XG5cblx0LyoqIEB0eXBlIHsocmVhc29uOiBhbnkpID0+IHZvaWR9ICovXG5cdHZhciByZWplY3Q7XG5cblx0LyoqIEB0eXBlIHtQcm9taXNlPFQ+fSAqL1xuXHR2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuXHRcdHJlc29sdmUgPSByZXM7XG5cdFx0cmVqZWN0ID0gcmVqO1xuXHR9KTtcblxuXHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdHJldHVybiB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9O1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge1Z9IHZhbHVlXG4gKiBAcGFyYW0ge1YgfCAoKCkgPT4gVil9IGZhbGxiYWNrXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtsYXp5XVxuICogQHJldHVybnMge1Z9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmYWxsYmFjayh2YWx1ZSwgZmFsbGJhY2ssIGxhenkgPSBmYWxzZSkge1xuXHRyZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZFxuXHRcdD8gbGF6eVxuXHRcdFx0PyAvKiogQHR5cGUgeygpID0+IFZ9ICovIChmYWxsYmFjaykoKVxuXHRcdFx0OiAvKiogQHR5cGUge1Z9ICovIChmYWxsYmFjaylcblx0XHQ6IHZhbHVlO1xufVxuXG4vKipcbiAqIFdoZW4gZW5jb3VudGVyaW5nIGEgc2l0dWF0aW9uIGxpa2UgYGxldCBbYSwgYiwgY10gPSAkZGVyaXZlZChibGFoKCkpYCxcbiAqIHdlIG5lZWQgdG8gc3Rhc2ggYW4gaW50ZXJtZWRpYXRlIHZhbHVlIHRoYXQgYGFgLCBgYmAsIGFuZCBgY2AgZGVyaXZlXG4gKiBmcm9tLCBpbiBjYXNlIGl0J3MgYW4gaXRlcmFibGVcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0ge0FycmF5TGlrZTxUPiB8IEl0ZXJhYmxlPFQ+fSB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IFtuXVxuICogQHJldHVybnMge0FycmF5PFQ+fVxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9fYXJyYXkodmFsdWUsIG4pIHtcblx0Ly8gcmV0dXJuIGFycmF5cyB1bmNoYW5nZWRcblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Ly8gaWYgdmFsdWUgaXMgbm90IGl0ZXJhYmxlLCBvciBgbmAgaXMgdW5zcGVjaWZpZWQgKGluZGljYXRlcyBhIHJlc3Rcblx0Ly8gZWxlbWVudCwgd2hpY2ggbWVhbnMgd2UncmUgbm90IGNvbmNlcm5lZCBhYm91dCB1bmJvdW5kZWQgaXRlcmFibGVzKVxuXHQvLyBjb252ZXJ0IHRvIGFuIGFycmF5IHdpdGggYEFycmF5LmZyb21gXG5cdGlmIChuID09PSB1bmRlZmluZWQgfHwgIShTeW1ib2wuaXRlcmF0b3IgaW4gdmFsdWUpKSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odmFsdWUpO1xuXHR9XG5cblx0Ly8gb3RoZXJ3aXNlLCBwb3B1bGF0ZSBhbiBhcnJheSB3aXRoIGBuYCB2YWx1ZXNcblxuXHQvKiogQHR5cGUge1RbXX0gKi9cblx0Y29uc3QgYXJyYXkgPSBbXTtcblxuXHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdmFsdWUpIHtcblx0XHRhcnJheS5wdXNoKGVsZW1lbnQpO1xuXHRcdGlmIChhcnJheS5sZW5ndGggPT09IG4pIGJyZWFrO1xuXHR9XG5cblx0cmV0dXJuIGFycmF5O1xufVxuIiwiLy8gR2VuZXJhbCBmbGFnc1xuZXhwb3J0IGNvbnN0IERFUklWRUQgPSAxIDw8IDE7XG5leHBvcnQgY29uc3QgRUZGRUNUID0gMSA8PCAyO1xuZXhwb3J0IGNvbnN0IFJFTkRFUl9FRkZFQ1QgPSAxIDw8IDM7XG4vKipcbiAqIEFuIGVmZmVjdCB0aGF0IGRvZXMgbm90IGRlc3Ryb3kgaXRzIGNoaWxkIGVmZmVjdHMgd2hlbiBpdCByZXJ1bnMuXG4gKiBSdW5zIGFzIHBhcnQgb2YgcmVuZGVyIGVmZmVjdHMsIGkuZS4gbm90IGVhZ2VybHkgYXMgcGFydCBvZiB0cmVlIHRyYXZlcnNhbCBvciBlZmZlY3QgZmx1c2hpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBNQU5BR0VEX0VGRkVDVCA9IDEgPDwgMjQ7XG4vKipcbiAqIEFuIGVmZmVjdCB0aGF0IGRvZXMgbm90IGRlc3Ryb3kgaXRzIGNoaWxkIGVmZmVjdHMgd2hlbiBpdCByZXJ1bnMgKGxpa2UgTUFOQUdFRF9FRkZFQ1QpLlxuICogUnVucyBlYWdlcmx5IGFzIHBhcnQgb2YgdHJlZSB0cmF2ZXJzYWwgb3IgZWZmZWN0IGZsdXNoaW5nLlxuICovXG5leHBvcnQgY29uc3QgQkxPQ0tfRUZGRUNUID0gMSA8PCA0O1xuZXhwb3J0IGNvbnN0IEJSQU5DSF9FRkZFQ1QgPSAxIDw8IDU7XG5leHBvcnQgY29uc3QgUk9PVF9FRkZFQ1QgPSAxIDw8IDY7XG5leHBvcnQgY29uc3QgQk9VTkRBUllfRUZGRUNUID0gMSA8PCA3O1xuLyoqXG4gKiBJbmRpY2F0ZXMgdGhhdCBhIHJlYWN0aW9uIGlzIGNvbm5lY3RlZCB0byBhbiBlZmZlY3Qgcm9vdCDigJQgZWl0aGVyIGl0IGlzIGFuIGVmZmVjdCxcbiAqIG9yIGl0IGlzIGEgZGVyaXZlZCB0aGF0IGlzIGRlcGVuZGVkIG9uIGJ5IGF0IGxlYXN0IG9uZSBlZmZlY3QuIElmIGEgZGVyaXZlZCBoYXNcbiAqIG5vIGRlcGVuZGVudHMsIHdlIGNhbiBkaXNjb25uZWN0IGl0IGZyb20gdGhlIGdyYXBoLCBhbGxvd2luZyBpdCB0byBlaXRoZXIgYmVcbiAqIEdDJ2Qgb3IgcmVjb25uZWN0ZWQgbGF0ZXIgaWYgYW4gZWZmZWN0IGNvbWVzIHRvIGRlcGVuZCBvbiBpdCBhZ2FpblxuICovXG5leHBvcnQgY29uc3QgQ09OTkVDVEVEID0gMSA8PCA5O1xuZXhwb3J0IGNvbnN0IENMRUFOID0gMSA8PCAxMDtcbmV4cG9ydCBjb25zdCBESVJUWSA9IDEgPDwgMTE7XG5leHBvcnQgY29uc3QgTUFZQkVfRElSVFkgPSAxIDw8IDEyO1xuZXhwb3J0IGNvbnN0IElORVJUID0gMSA8PCAxMztcbmV4cG9ydCBjb25zdCBERVNUUk9ZRUQgPSAxIDw8IDE0O1xuXG4vLyBGbGFncyBleGNsdXNpdmUgdG8gZWZmZWN0c1xuLyoqIFNldCBvbmNlIGFuIGVmZmVjdCB0aGF0IHNob3VsZCBydW4gc3luY2hyb25vdXNseSBoYXMgcnVuICovXG5leHBvcnQgY29uc3QgRUZGRUNUX1JBTiA9IDEgPDwgMTU7XG4vKipcbiAqICdUcmFuc3BhcmVudCcgZWZmZWN0cyBkbyBub3QgY3JlYXRlIGEgdHJhbnNpdGlvbiBib3VuZGFyeS5cbiAqIFRoaXMgaXMgb24gYSBibG9jayBlZmZlY3QgOTklIG9mIHRoZSB0aW1lIGJ1dCBtYXkgYWxzbyBiZSBvbiBhIGJyYW5jaCBlZmZlY3QgaWYgaXRzIHBhcmVudCBibG9jayBlZmZlY3Qgd2FzIHBydW5lZFxuICovXG5leHBvcnQgY29uc3QgRUZGRUNUX1RSQU5TUEFSRU5UID0gMSA8PCAxNjtcbmV4cG9ydCBjb25zdCBFQUdFUl9FRkZFQ1QgPSAxIDw8IDE3O1xuZXhwb3J0IGNvbnN0IEhFQURfRUZGRUNUID0gMSA8PCAxODtcbmV4cG9ydCBjb25zdCBFRkZFQ1RfUFJFU0VSVkVEID0gMSA8PCAxOTtcbmV4cG9ydCBjb25zdCBVU0VSX0VGRkVDVCA9IDEgPDwgMjA7XG5cbi8vIEZsYWdzIGV4Y2x1c2l2ZSB0byBkZXJpdmVkc1xuLyoqXG4gKiBUZWxscyB0aGF0IHdlIG1hcmtlZCB0aGlzIGRlcml2ZWQgYW5kIGl0cyByZWFjdGlvbnMgYXMgdmlzaXRlZCBkdXJpbmcgdGhlIFwibWFyayBhcyAobWF5YmUpIGRpcnR5XCItcGhhc2UuXG4gKiBXaWxsIGJlIGxpZnRlZCBkdXJpbmcgZXhlY3V0aW9uIG9mIHRoZSBkZXJpdmVkIGFuZCBkdXJpbmcgY2hlY2tpbmcgaXRzIGRpcnR5IHN0YXRlIChib3RoIGFyZSBuZWNlc3NhcnlcbiAqIGJlY2F1c2UgYSBkZXJpdmVkIG1pZ2h0IGJlIGNoZWNrZWQgYnV0IG5vdCBleGVjdXRlZCkuXG4gKi9cbmV4cG9ydCBjb25zdCBXQVNfTUFSS0VEID0gMSA8PCAxNTtcblxuLy8gRmxhZ3MgdXNlZCBmb3IgYXN5bmNcbmV4cG9ydCBjb25zdCBSRUFDVElPTl9JU19VUERBVElORyA9IDEgPDwgMjE7XG5leHBvcnQgY29uc3QgQVNZTkMgPSAxIDw8IDIyO1xuXG5leHBvcnQgY29uc3QgRVJST1JfVkFMVUUgPSAxIDw8IDIzO1xuXG5leHBvcnQgY29uc3QgU1RBVEVfU1lNQk9MID0gU3ltYm9sKCckc3RhdGUnKTtcbmV4cG9ydCBjb25zdCBMRUdBQ1lfUFJPUFMgPSBTeW1ib2woJ2xlZ2FjeSBwcm9wcycpO1xuZXhwb3J0IGNvbnN0IExPQURJTkdfQVRUUl9TWU1CT0wgPSBTeW1ib2woJycpO1xuZXhwb3J0IGNvbnN0IFBST1hZX1BBVEhfU1lNQk9MID0gU3ltYm9sKCdwcm94eSBwYXRoJyk7XG5cbi8qKiBhbGxvdyB1c2VycyB0byBpZ25vcmUgYWJvcnRlZCBzaWduYWwgZXJyb3JzIGlmIGByZWFzb24ubmFtZSA9PT0gJ1N0YWxlUmVhY3Rpb25FcnJvcmAgKi9cbmV4cG9ydCBjb25zdCBTVEFMRV9SRUFDVElPTiA9IG5ldyAoY2xhc3MgU3RhbGVSZWFjdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRuYW1lID0gJ1N0YWxlUmVhY3Rpb25FcnJvcic7XG5cdG1lc3NhZ2UgPSAnVGhlIHJlYWN0aW9uIHRoYXQgY2FsbGVkIGBnZXRBYm9ydFNpZ25hbCgpYCB3YXMgcmUtcnVuIG9yIGRlc3Ryb3llZCc7XG59KSgpO1xuXG5leHBvcnQgY29uc3QgRUxFTUVOVF9OT0RFID0gMTtcbmV4cG9ydCBjb25zdCBURVhUX05PREUgPSAzO1xuZXhwb3J0IGNvbnN0IENPTU1FTlRfTk9ERSA9IDg7XG5leHBvcnQgY29uc3QgRE9DVU1FTlRfRlJBR01FTlRfTk9ERSA9IDExO1xuIiwiLyogVGhpcyBmaWxlIGlzIGdlbmVyYXRlZCBieSBzY3JpcHRzL3Byb2Nlc3MtbWVzc2FnZXMvaW5kZXguanMuIERvIG5vdCBlZGl0ISAqL1xuXG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcblxuLyoqXG4gKiBDYW5ub3QgdXNlIGAlbmFtZSUoLi4uKWAgdW5sZXNzIHRoZSBgZXhwZXJpbWVudGFsLmFzeW5jYCBjb21waWxlciBvcHRpb24gaXMgYHRydWVgXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhwZXJpbWVudGFsX2FzeW5jX3JlcXVpcmVkKG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBleHBlcmltZW50YWxfYXN5bmNfcmVxdWlyZWRcXG5DYW5ub3QgdXNlIFxcYCR7bmFtZX0oLi4uKVxcYCB1bmxlc3MgdGhlIFxcYGV4cGVyaW1lbnRhbC5hc3luY1xcYCBjb21waWxlciBvcHRpb24gaXMgXFxgdHJ1ZVxcYFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2V4cGVyaW1lbnRhbF9hc3luY19yZXF1aXJlZGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9leHBlcmltZW50YWxfYXN5bmNfcmVxdWlyZWRgKTtcblx0fVxufVxuXG4vKipcbiAqIENhbm5vdCB1c2UgYHtAcmVuZGVyIGNoaWxkcmVuKC4uLil9YCBpZiB0aGUgcGFyZW50IGNvbXBvbmVudCB1c2VzIGBsZXQ6YCBkaXJlY3RpdmVzLiBDb25zaWRlciB1c2luZyBhIG5hbWVkIHNuaXBwZXQgaW5zdGVhZFxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW52YWxpZF9kZWZhdWx0X3NuaXBwZXQoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgaW52YWxpZF9kZWZhdWx0X3NuaXBwZXRcXG5DYW5ub3QgdXNlIFxcYHtAcmVuZGVyIGNoaWxkcmVuKC4uLil9XFxgIGlmIHRoZSBwYXJlbnQgY29tcG9uZW50IHVzZXMgXFxgbGV0OlxcYCBkaXJlY3RpdmVzLiBDb25zaWRlciB1c2luZyBhIG5hbWVkIHNuaXBwZXQgaW5zdGVhZFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2ludmFsaWRfZGVmYXVsdF9zbmlwcGV0YCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2ludmFsaWRfZGVmYXVsdF9zbmlwcGV0YCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNuaXBwZXQgZnVuY3Rpb24gd2FzIHBhc3NlZCBpbnZhbGlkIGFyZ3VtZW50cy4gU25pcHBldHMgc2hvdWxkIG9ubHkgYmUgaW5zdGFudGlhdGVkIHZpYSBge0ByZW5kZXIgLi4ufWBcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludmFsaWRfc25pcHBldF9hcmd1bWVudHMoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgaW52YWxpZF9zbmlwcGV0X2FyZ3VtZW50c1xcbkEgc25pcHBldCBmdW5jdGlvbiB3YXMgcGFzc2VkIGludmFsaWQgYXJndW1lbnRzLiBTbmlwcGV0cyBzaG91bGQgb25seSBiZSBpbnN0YW50aWF0ZWQgdmlhIFxcYHtAcmVuZGVyIC4uLn1cXGBcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9pbnZhbGlkX3NuaXBwZXRfYXJndW1lbnRzYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2ludmFsaWRfc25pcHBldF9hcmd1bWVudHNgKTtcblx0fVxufVxuXG4vKipcbiAqIGAlbmFtZSUoLi4uKWAgY2FuIG9ubHkgYmUgdXNlZCBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gbGlmZWN5Y2xlX291dHNpZGVfY29tcG9uZW50KG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBsaWZlY3ljbGVfb3V0c2lkZV9jb21wb25lbnRcXG5cXGAke25hbWV9KC4uLilcXGAgY2FuIG9ubHkgYmUgdXNlZCBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvbGlmZWN5Y2xlX291dHNpZGVfY29tcG9uZW50YCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2xpZmVjeWNsZV9vdXRzaWRlX2NvbXBvbmVudGApO1xuXHR9XG59XG5cbi8qKlxuICogQ29udGV4dCB3YXMgbm90IHNldCBpbiBhIHBhcmVudCBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbmdfY29udGV4dCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBtaXNzaW5nX2NvbnRleHRcXG5Db250ZXh0IHdhcyBub3Qgc2V0IGluIGEgcGFyZW50IGNvbXBvbmVudFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL21pc3NpbmdfY29udGV4dGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9taXNzaW5nX2NvbnRleHRgKTtcblx0fVxufVxuXG4vKipcbiAqIEF0dGVtcHRlZCB0byByZW5kZXIgYSBzbmlwcGV0IHdpdGhvdXQgYSBge0ByZW5kZXJ9YCBibG9jay4gVGhpcyB3b3VsZCBjYXVzZSB0aGUgc25pcHBldCBjb2RlIHRvIGJlIHN0cmluZ2lmaWVkIGluc3RlYWQgb2YgaXRzIGNvbnRlbnQgYmVpbmcgcmVuZGVyZWQgdG8gdGhlIERPTS4gVG8gZml4IHRoaXMsIGNoYW5nZSBge3NuaXBwZXR9YCB0byBge0ByZW5kZXIgc25pcHBldCgpfWAuXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbmlwcGV0X3dpdGhvdXRfcmVuZGVyX3RhZygpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBzbmlwcGV0X3dpdGhvdXRfcmVuZGVyX3RhZ1xcbkF0dGVtcHRlZCB0byByZW5kZXIgYSBzbmlwcGV0IHdpdGhvdXQgYSBcXGB7QHJlbmRlcn1cXGAgYmxvY2suIFRoaXMgd291bGQgY2F1c2UgdGhlIHNuaXBwZXQgY29kZSB0byBiZSBzdHJpbmdpZmllZCBpbnN0ZWFkIG9mIGl0cyBjb250ZW50IGJlaW5nIHJlbmRlcmVkIHRvIHRoZSBET00uIFRvIGZpeCB0aGlzLCBjaGFuZ2UgXFxge3NuaXBwZXR9XFxgIHRvIFxcYHtAcmVuZGVyIHNuaXBwZXQoKX1cXGAuXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc25pcHBldF93aXRob3V0X3JlbmRlcl90YWdgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc25pcHBldF93aXRob3V0X3JlbmRlcl90YWdgKTtcblx0fVxufVxuXG4vKipcbiAqIGAlbmFtZSVgIGlzIG5vdCBhIHN0b3JlIHdpdGggYSBgc3Vic2NyaWJlYCBtZXRob2RcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdG9yZV9pbnZhbGlkX3NoYXBlKG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBzdG9yZV9pbnZhbGlkX3NoYXBlXFxuXFxgJHtuYW1lfVxcYCBpcyBub3QgYSBzdG9yZSB3aXRoIGEgXFxgc3Vic2NyaWJlXFxgIG1ldGhvZFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL3N0b3JlX2ludmFsaWRfc2hhcGVgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3RvcmVfaW52YWxpZF9zaGFwZWApO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIGB0aGlzYCBwcm9wIG9uIGA8c3ZlbHRlOmVsZW1lbnQ+YCBtdXN0IGJlIGEgc3RyaW5nLCBpZiBkZWZpbmVkXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdmVsdGVfZWxlbWVudF9pbnZhbGlkX3RoaXNfdmFsdWUoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgc3ZlbHRlX2VsZW1lbnRfaW52YWxpZF90aGlzX3ZhbHVlXFxuVGhlIFxcYHRoaXNcXGAgcHJvcCBvbiBcXGA8c3ZlbHRlOmVsZW1lbnQ+XFxgIG11c3QgYmUgYSBzdHJpbmcsIGlmIGRlZmluZWRcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdmVsdGVfZWxlbWVudF9pbnZhbGlkX3RoaXNfdmFsdWVgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3ZlbHRlX2VsZW1lbnRfaW52YWxpZF90aGlzX3ZhbHVlYCk7XG5cdH1cbn0iLCIvKiBUaGlzIGZpbGUgaXMgZ2VuZXJhdGVkIGJ5IHNjcmlwdHMvcHJvY2Vzcy1tZXNzYWdlcy9pbmRleC5qcy4gRG8gbm90IGVkaXQhICovXG5cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuXG5leHBvcnQgKiAgZnJvbSAnLi4vc2hhcmVkL2Vycm9ycy5qcyc7XG5cbi8qKlxuICogQ2Fubm90IGNyZWF0ZSBhIGAkZGVyaXZlZCguLi4pYCB3aXRoIGFuIGBhd2FpdGAgZXhwcmVzc2lvbiBvdXRzaWRlIG9mIGFuIGVmZmVjdCB0cmVlXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3luY19kZXJpdmVkX29ycGhhbigpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBhc3luY19kZXJpdmVkX29ycGhhblxcbkNhbm5vdCBjcmVhdGUgYSBcXGAkZGVyaXZlZCguLi4pXFxgIHdpdGggYW4gXFxgYXdhaXRcXGAgZXhwcmVzc2lvbiBvdXRzaWRlIG9mIGFuIGVmZmVjdCB0cmVlXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYXN5bmNfZGVyaXZlZF9vcnBoYW5gKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYXN5bmNfZGVyaXZlZF9vcnBoYW5gKTtcblx0fVxufVxuXG4vKipcbiAqIFVzaW5nIGBiaW5kOnZhbHVlYCB0b2dldGhlciB3aXRoIGEgY2hlY2tib3ggaW5wdXQgaXMgbm90IGFsbG93ZWQuIFVzZSBgYmluZDpjaGVja2VkYCBpbnN0ZWFkXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kX2ludmFsaWRfY2hlY2tib3hfdmFsdWUoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgYmluZF9pbnZhbGlkX2NoZWNrYm94X3ZhbHVlXFxuVXNpbmcgXFxgYmluZDp2YWx1ZVxcYCB0b2dldGhlciB3aXRoIGEgY2hlY2tib3ggaW5wdXQgaXMgbm90IGFsbG93ZWQuIFVzZSBcXGBiaW5kOmNoZWNrZWRcXGAgaW5zdGVhZFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2JpbmRfaW52YWxpZF9jaGVja2JveF92YWx1ZWApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9iaW5kX2ludmFsaWRfY2hlY2tib3hfdmFsdWVgKTtcblx0fVxufVxuXG4vKipcbiAqIENvbXBvbmVudCAlY29tcG9uZW50JSBoYXMgYW4gZXhwb3J0IG5hbWVkIGAla2V5JWAgdGhhdCBhIGNvbnN1bWVyIGNvbXBvbmVudCBpcyB0cnlpbmcgdG8gYWNjZXNzIHVzaW5nIGBiaW5kOiVrZXklYCwgd2hpY2ggaXMgZGlzYWxsb3dlZC4gSW5zdGVhZCwgdXNlIGBiaW5kOnRoaXNgIChlLmcuIGA8JW5hbWUlIGJpbmQ6dGhpcz17Y29tcG9uZW50fSAvPmApIGFuZCB0aGVuIGFjY2VzcyB0aGUgcHJvcGVydHkgb24gdGhlIGJvdW5kIGNvbXBvbmVudCBpbnN0YW5jZSAoZS5nLiBgY29tcG9uZW50LiVrZXklYClcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb21wb25lbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kX2ludmFsaWRfZXhwb3J0KGNvbXBvbmVudCwga2V5LCBuYW1lKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgYmluZF9pbnZhbGlkX2V4cG9ydFxcbkNvbXBvbmVudCAke2NvbXBvbmVudH0gaGFzIGFuIGV4cG9ydCBuYW1lZCBcXGAke2tleX1cXGAgdGhhdCBhIGNvbnN1bWVyIGNvbXBvbmVudCBpcyB0cnlpbmcgdG8gYWNjZXNzIHVzaW5nIFxcYGJpbmQ6JHtrZXl9XFxgLCB3aGljaCBpcyBkaXNhbGxvd2VkLiBJbnN0ZWFkLCB1c2UgXFxgYmluZDp0aGlzXFxgIChlLmcuIFxcYDwke25hbWV9IGJpbmQ6dGhpcz17Y29tcG9uZW50fSAvPlxcYCkgYW5kIHRoZW4gYWNjZXNzIHRoZSBwcm9wZXJ0eSBvbiB0aGUgYm91bmQgY29tcG9uZW50IGluc3RhbmNlIChlLmcuIFxcYGNvbXBvbmVudC4ke2tleX1cXGApXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYmluZF9pbnZhbGlkX2V4cG9ydGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9iaW5kX2ludmFsaWRfZXhwb3J0YCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGNvbXBvbmVudCBpcyBhdHRlbXB0aW5nIHRvIGJpbmQgdG8gYSBub24tYmluZGFibGUgcHJvcGVydHkgYCVrZXklYCBiZWxvbmdpbmcgdG8gJWNvbXBvbmVudCUgKGkuZS4gYDwlbmFtZSUgYmluZDola2V5JT17Li4ufT5gKS4gVG8gbWFyayBhIHByb3BlcnR5IGFzIGJpbmRhYmxlOiBgbGV0IHsgJWtleSUgPSAkYmluZGFibGUoKSB9ID0gJHByb3BzKClgXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5XG4gKiBAcGFyYW0ge3N0cmluZ30gY29tcG9uZW50XG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmluZF9ub3RfYmluZGFibGUoa2V5LCBjb21wb25lbnQsIG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBiaW5kX25vdF9iaW5kYWJsZVxcbkEgY29tcG9uZW50IGlzIGF0dGVtcHRpbmcgdG8gYmluZCB0byBhIG5vbi1iaW5kYWJsZSBwcm9wZXJ0eSBcXGAke2tleX1cXGAgYmVsb25naW5nIHRvICR7Y29tcG9uZW50fSAoaS5lLiBcXGA8JHtuYW1lfSBiaW5kOiR7a2V5fT17Li4ufT5cXGApLiBUbyBtYXJrIGEgcHJvcGVydHkgYXMgYmluZGFibGU6IFxcYGxldCB7ICR7a2V5fSA9ICRiaW5kYWJsZSgpIH0gPSAkcHJvcHMoKVxcYFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2JpbmRfbm90X2JpbmRhYmxlYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2JpbmRfbm90X2JpbmRhYmxlYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDYWxsaW5nIGAlbWV0aG9kJWAgb24gYSBjb21wb25lbnQgaW5zdGFuY2UgKG9mICVjb21wb25lbnQlKSBpcyBubyBsb25nZXIgdmFsaWQgaW4gU3ZlbHRlIDVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2RcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvbmVudF9hcGlfY2hhbmdlZChtZXRob2QsIGNvbXBvbmVudCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGNvbXBvbmVudF9hcGlfY2hhbmdlZFxcbkNhbGxpbmcgXFxgJHttZXRob2R9XFxgIG9uIGEgY29tcG9uZW50IGluc3RhbmNlIChvZiAke2NvbXBvbmVudH0pIGlzIG5vIGxvbmdlciB2YWxpZCBpbiBTdmVsdGUgNVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2NvbXBvbmVudF9hcGlfY2hhbmdlZGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9jb21wb25lbnRfYXBpX2NoYW5nZWRgKTtcblx0fVxufVxuXG4vKipcbiAqIEF0dGVtcHRlZCB0byBpbnN0YW50aWF0ZSAlY29tcG9uZW50JSB3aXRoIGBuZXcgJW5hbWUlYCwgd2hpY2ggaXMgbm8gbG9uZ2VyIHZhbGlkIGluIFN2ZWx0ZSA1LiBJZiB0aGlzIGNvbXBvbmVudCBpcyBub3QgdW5kZXIgeW91ciBjb250cm9sLCBzZXQgdGhlIGBjb21wYXRpYmlsaXR5LmNvbXBvbmVudEFwaWAgY29tcGlsZXIgb3B0aW9uIHRvIGA0YCB0byBrZWVwIGl0IHdvcmtpbmcuXG4gKiBAcGFyYW0ge3N0cmluZ30gY29tcG9uZW50XG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcG9uZW50X2FwaV9pbnZhbGlkX25ldyhjb21wb25lbnQsIG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBjb21wb25lbnRfYXBpX2ludmFsaWRfbmV3XFxuQXR0ZW1wdGVkIHRvIGluc3RhbnRpYXRlICR7Y29tcG9uZW50fSB3aXRoIFxcYG5ldyAke25hbWV9XFxgLCB3aGljaCBpcyBubyBsb25nZXIgdmFsaWQgaW4gU3ZlbHRlIDUuIElmIHRoaXMgY29tcG9uZW50IGlzIG5vdCB1bmRlciB5b3VyIGNvbnRyb2wsIHNldCB0aGUgXFxgY29tcGF0aWJpbGl0eS5jb21wb25lbnRBcGlcXGAgY29tcGlsZXIgb3B0aW9uIHRvIFxcYDRcXGAgdG8ga2VlcCBpdCB3b3JraW5nLlxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2NvbXBvbmVudF9hcGlfaW52YWxpZF9uZXdgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvY29tcG9uZW50X2FwaV9pbnZhbGlkX25ld2ApO1xuXHR9XG59XG5cbi8qKlxuICogQSBkZXJpdmVkIHZhbHVlIGNhbm5vdCByZWZlcmVuY2UgaXRzZWxmIHJlY3Vyc2l2ZWx5XG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVkX3JlZmVyZW5jZXNfc2VsZigpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBkZXJpdmVkX3JlZmVyZW5jZXNfc2VsZlxcbkEgZGVyaXZlZCB2YWx1ZSBjYW5ub3QgcmVmZXJlbmNlIGl0c2VsZiByZWN1cnNpdmVseVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2Rlcml2ZWRfcmVmZXJlbmNlc19zZWxmYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2Rlcml2ZWRfcmVmZXJlbmNlc19zZWxmYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBLZXllZCBlYWNoIGJsb2NrIGhhcyBkdXBsaWNhdGUga2V5IGAldmFsdWUlYCBhdCBpbmRleGVzICVhJSBhbmQgJWIlXG4gKiBAcGFyYW0ge3N0cmluZ30gYVxuICogQHBhcmFtIHtzdHJpbmd9IGJcbiAqIEBwYXJhbSB7c3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbH0gW3ZhbHVlXVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZWFjaF9rZXlfZHVwbGljYXRlKGEsIGIsIHZhbHVlKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgZWFjaF9rZXlfZHVwbGljYXRlXFxuJHt2YWx1ZVxuXHRcdFx0PyBgS2V5ZWQgZWFjaCBibG9jayBoYXMgZHVwbGljYXRlIGtleSBcXGAke3ZhbHVlfVxcYCBhdCBpbmRleGVzICR7YX0gYW5kICR7Yn1gXG5cdFx0XHQ6IGBLZXllZCBlYWNoIGJsb2NrIGhhcyBkdXBsaWNhdGUga2V5IGF0IGluZGV4ZXMgJHthfSBhbmQgJHtifWB9XFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZWFjaF9rZXlfZHVwbGljYXRlYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2VhY2hfa2V5X2R1cGxpY2F0ZWApO1xuXHR9XG59XG5cbi8qKlxuICogYCVydW5lJWAgY2Fubm90IGJlIHVzZWQgaW5zaWRlIGFuIGVmZmVjdCBjbGVhbnVwIGZ1bmN0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gcnVuZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0X2luX3RlYXJkb3duKHJ1bmUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBlZmZlY3RfaW5fdGVhcmRvd25cXG5cXGAke3J1bmV9XFxgIGNhbm5vdCBiZSB1c2VkIGluc2lkZSBhbiBlZmZlY3QgY2xlYW51cCBmdW5jdGlvblxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2VmZmVjdF9pbl90ZWFyZG93bmApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9lZmZlY3RfaW5fdGVhcmRvd25gKTtcblx0fVxufVxuXG4vKipcbiAqIEVmZmVjdCBjYW5ub3QgYmUgY3JlYXRlZCBpbnNpZGUgYSBgJGRlcml2ZWRgIHZhbHVlIHRoYXQgd2FzIG5vdCBpdHNlbGYgY3JlYXRlZCBpbnNpZGUgYW4gZWZmZWN0XG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RfaW5fdW5vd25lZF9kZXJpdmVkKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGVmZmVjdF9pbl91bm93bmVkX2Rlcml2ZWRcXG5FZmZlY3QgY2Fubm90IGJlIGNyZWF0ZWQgaW5zaWRlIGEgXFxgJGRlcml2ZWRcXGAgdmFsdWUgdGhhdCB3YXMgbm90IGl0c2VsZiBjcmVhdGVkIGluc2lkZSBhbiBlZmZlY3RcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9lZmZlY3RfaW5fdW5vd25lZF9kZXJpdmVkYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2VmZmVjdF9pbl91bm93bmVkX2Rlcml2ZWRgKTtcblx0fVxufVxuXG4vKipcbiAqIGAlcnVuZSVgIGNhbiBvbmx5IGJlIHVzZWQgaW5zaWRlIGFuIGVmZmVjdCAoZS5nLiBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uKVxuICogQHBhcmFtIHtzdHJpbmd9IHJ1bmVcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdF9vcnBoYW4ocnVuZSkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGVmZmVjdF9vcnBoYW5cXG5cXGAke3J1bmV9XFxgIGNhbiBvbmx5IGJlIHVzZWQgaW5zaWRlIGFuIGVmZmVjdCAoZS5nLiBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uKVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2VmZmVjdF9vcnBoYW5gKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZWZmZWN0X29ycGhhbmApO1xuXHR9XG59XG5cbi8qKlxuICogYCRlZmZlY3QucGVuZGluZygpYCBjYW4gb25seSBiZSBjYWxsZWQgaW5zaWRlIGFuIGVmZmVjdCBvciBkZXJpdmVkXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RfcGVuZGluZ19vdXRzaWRlX3JlYWN0aW9uKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGVmZmVjdF9wZW5kaW5nX291dHNpZGVfcmVhY3Rpb25cXG5cXGAkZWZmZWN0LnBlbmRpbmcoKVxcYCBjYW4gb25seSBiZSBjYWxsZWQgaW5zaWRlIGFuIGVmZmVjdCBvciBkZXJpdmVkXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZWZmZWN0X3BlbmRpbmdfb3V0c2lkZV9yZWFjdGlvbmApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9lZmZlY3RfcGVuZGluZ19vdXRzaWRlX3JlYWN0aW9uYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBNYXhpbXVtIHVwZGF0ZSBkZXB0aCBleGNlZWRlZC4gVGhpcyB0eXBpY2FsbHkgaW5kaWNhdGVzIHRoYXQgYW4gZWZmZWN0IHJlYWRzIGFuZCB3cml0ZXMgdGhlIHNhbWUgcGllY2Ugb2Ygc3RhdGVcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdF91cGRhdGVfZGVwdGhfZXhjZWVkZWQoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgZWZmZWN0X3VwZGF0ZV9kZXB0aF9leGNlZWRlZFxcbk1heGltdW0gdXBkYXRlIGRlcHRoIGV4Y2VlZGVkLiBUaGlzIHR5cGljYWxseSBpbmRpY2F0ZXMgdGhhdCBhbiBlZmZlY3QgcmVhZHMgYW5kIHdyaXRlcyB0aGUgc2FtZSBwaWVjZSBvZiBzdGF0ZVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2VmZmVjdF91cGRhdGVfZGVwdGhfZXhjZWVkZWRgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZWZmZWN0X3VwZGF0ZV9kZXB0aF9leGNlZWRlZGApO1xuXHR9XG59XG5cbi8qKlxuICogQ2Fubm90IHVzZSBgZmx1c2hTeW5jYCBpbnNpZGUgYW4gZWZmZWN0XG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmbHVzaF9zeW5jX2luX2VmZmVjdCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBmbHVzaF9zeW5jX2luX2VmZmVjdFxcbkNhbm5vdCB1c2UgXFxgZmx1c2hTeW5jXFxgIGluc2lkZSBhbiBlZmZlY3RcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9mbHVzaF9zeW5jX2luX2VmZmVjdGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9mbHVzaF9zeW5jX2luX2VmZmVjdGApO1xuXHR9XG59XG5cbi8qKlxuICogQ2Fubm90IGNvbW1pdCBhIGZvcmsgdGhhdCB3YXMgYWxyZWFkeSBkaXNjYXJkZWRcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmtfZGlzY2FyZGVkKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGZvcmtfZGlzY2FyZGVkXFxuQ2Fubm90IGNvbW1pdCBhIGZvcmsgdGhhdCB3YXMgYWxyZWFkeSBkaXNjYXJkZWRcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9mb3JrX2Rpc2NhcmRlZGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9mb3JrX2Rpc2NhcmRlZGApO1xuXHR9XG59XG5cbi8qKlxuICogQ2Fubm90IGNyZWF0ZSBhIGZvcmsgaW5zaWRlIGFuIGVmZmVjdCBvciB3aGVuIHN0YXRlIGNoYW5nZXMgYXJlIHBlbmRpbmdcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmtfdGltaW5nKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGZvcmtfdGltaW5nXFxuQ2Fubm90IGNyZWF0ZSBhIGZvcmsgaW5zaWRlIGFuIGVmZmVjdCBvciB3aGVuIHN0YXRlIGNoYW5nZXMgYXJlIHBlbmRpbmdcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9mb3JrX3RpbWluZ2ApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9mb3JrX3RpbWluZ2ApO1xuXHR9XG59XG5cbi8qKlxuICogYGdldEFib3J0U2lnbmFsKClgIGNhbiBvbmx5IGJlIGNhbGxlZCBpbnNpZGUgYW4gZWZmZWN0IG9yIGRlcml2ZWRcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldF9hYm9ydF9zaWduYWxfb3V0c2lkZV9yZWFjdGlvbigpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBnZXRfYWJvcnRfc2lnbmFsX291dHNpZGVfcmVhY3Rpb25cXG5cXGBnZXRBYm9ydFNpZ25hbCgpXFxgIGNhbiBvbmx5IGJlIGNhbGxlZCBpbnNpZGUgYW4gZWZmZWN0IG9yIGRlcml2ZWRcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9nZXRfYWJvcnRfc2lnbmFsX291dHNpZGVfcmVhY3Rpb25gKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZ2V0X2Fib3J0X3NpZ25hbF9vdXRzaWRlX3JlYWN0aW9uYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBFeHBlY3RlZCB0byBmaW5kIGEgaHlkcmF0YWJsZSB3aXRoIGtleSBgJWtleSVgIGR1cmluZyBoeWRyYXRpb24sIGJ1dCBkaWQgbm90LlxuICogQHBhcmFtIHtzdHJpbmd9IGtleVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0YWJsZV9taXNzaW5nX2J1dF9yZXF1aXJlZChrZXkpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBoeWRyYXRhYmxlX21pc3NpbmdfYnV0X3JlcXVpcmVkXFxuRXhwZWN0ZWQgdG8gZmluZCBhIGh5ZHJhdGFibGUgd2l0aCBrZXkgXFxgJHtrZXl9XFxgIGR1cmluZyBoeWRyYXRpb24sIGJ1dCBkaWQgbm90Llxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2h5ZHJhdGFibGVfbWlzc2luZ19idXRfcmVxdWlyZWRgKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaHlkcmF0YWJsZV9taXNzaW5nX2J1dF9yZXF1aXJlZGApO1xuXHR9XG59XG5cbi8qKlxuICogRmFpbGVkIHRvIGh5ZHJhdGUgdGhlIGFwcGxpY2F0aW9uXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyYXRpb25fZmFpbGVkKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYGh5ZHJhdGlvbl9mYWlsZWRcXG5GYWlsZWQgdG8gaHlkcmF0ZSB0aGUgYXBwbGljYXRpb25cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9oeWRyYXRpb25fZmFpbGVkYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2h5ZHJhdGlvbl9mYWlsZWRgKTtcblx0fVxufVxuXG4vKipcbiAqIENvdWxkIG5vdCBge0ByZW5kZXJ9YCBzbmlwcGV0IGR1ZSB0byB0aGUgZXhwcmVzc2lvbiBiZWluZyBgbnVsbGAgb3IgYHVuZGVmaW5lZGAuIENvbnNpZGVyIHVzaW5nIG9wdGlvbmFsIGNoYWluaW5nIGB7QHJlbmRlciBzbmlwcGV0Py4oKX1gXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnZhbGlkX3NuaXBwZXQoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgaW52YWxpZF9zbmlwcGV0XFxuQ291bGQgbm90IFxcYHtAcmVuZGVyfVxcYCBzbmlwcGV0IGR1ZSB0byB0aGUgZXhwcmVzc2lvbiBiZWluZyBcXGBudWxsXFxgIG9yIFxcYHVuZGVmaW5lZFxcYC4gQ29uc2lkZXIgdXNpbmcgb3B0aW9uYWwgY2hhaW5pbmcgXFxge0ByZW5kZXIgc25pcHBldD8uKCl9XFxgXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaW52YWxpZF9zbmlwcGV0YCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2ludmFsaWRfc25pcHBldGApO1xuXHR9XG59XG5cbi8qKlxuICogYCVuYW1lJSguLi4pYCBjYW5ub3QgYmUgdXNlZCBpbiBydW5lcyBtb2RlXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25ldmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gbGlmZWN5Y2xlX2xlZ2FjeV9vbmx5KG5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBsaWZlY3ljbGVfbGVnYWN5X29ubHlcXG5cXGAke25hbWV9KC4uLilcXGAgY2Fubm90IGJlIHVzZWQgaW4gcnVuZXMgbW9kZVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2xpZmVjeWNsZV9sZWdhY3lfb25seWApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9saWZlY3ljbGVfbGVnYWN5X29ubHlgKTtcblx0fVxufVxuXG4vKipcbiAqIENhbm5vdCBkbyBgYmluZDola2V5JT17dW5kZWZpbmVkfWAgd2hlbiBgJWtleSVgIGhhcyBhIGZhbGxiYWNrIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5XG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9wc19pbnZhbGlkX3ZhbHVlKGtleSkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYHByb3BzX2ludmFsaWRfdmFsdWVcXG5DYW5ub3QgZG8gXFxgYmluZDoke2tleX09e3VuZGVmaW5lZH1cXGAgd2hlbiBcXGAke2tleX1cXGAgaGFzIGEgZmFsbGJhY2sgdmFsdWVcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9wcm9wc19pbnZhbGlkX3ZhbHVlYCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL3Byb3BzX2ludmFsaWRfdmFsdWVgKTtcblx0fVxufVxuXG4vKipcbiAqIFJlc3QgZWxlbWVudCBwcm9wZXJ0aWVzIG9mIGAkcHJvcHMoKWAgc3VjaCBhcyBgJXByb3BlcnR5JWAgYXJlIHJlYWRvbmx5XG4gKiBAcGFyYW0ge3N0cmluZ30gcHJvcGVydHlcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb3BzX3Jlc3RfcmVhZG9ubHkocHJvcGVydHkpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBwcm9wc19yZXN0X3JlYWRvbmx5XFxuUmVzdCBlbGVtZW50IHByb3BlcnRpZXMgb2YgXFxgJHByb3BzKClcXGAgc3VjaCBhcyBcXGAke3Byb3BlcnR5fVxcYCBhcmUgcmVhZG9ubHlcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9wcm9wc19yZXN0X3JlYWRvbmx5YCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL3Byb3BzX3Jlc3RfcmVhZG9ubHlgKTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBgJXJ1bmUlYCBydW5lIGlzIG9ubHkgYXZhaWxhYmxlIGluc2lkZSBgLnN2ZWx0ZWAgYW5kIGAuc3ZlbHRlLmpzL3RzYCBmaWxlc1xuICogQHBhcmFtIHtzdHJpbmd9IHJ1bmVcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bmVfb3V0c2lkZV9zdmVsdGUocnVuZSkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYHJ1bmVfb3V0c2lkZV9zdmVsdGVcXG5UaGUgXFxgJHtydW5lfVxcYCBydW5lIGlzIG9ubHkgYXZhaWxhYmxlIGluc2lkZSBcXGAuc3ZlbHRlXFxgIGFuZCBcXGAuc3ZlbHRlLmpzL3RzXFxgIGZpbGVzXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvcnVuZV9vdXRzaWRlX3N2ZWx0ZWApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9ydW5lX291dHNpZGVfc3ZlbHRlYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBgc2V0Q29udGV4dGAgbXVzdCBiZSBjYWxsZWQgd2hlbiBhIGNvbXBvbmVudCBmaXJzdCBpbml0aWFsaXplcywgbm90IGluIGEgc3Vic2VxdWVudCBlZmZlY3Qgb3IgYWZ0ZXIgYW4gYGF3YWl0YCBleHByZXNzaW9uXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfY29udGV4dF9hZnRlcl9pbml0KCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYHNldF9jb250ZXh0X2FmdGVyX2luaXRcXG5cXGBzZXRDb250ZXh0XFxgIG11c3QgYmUgY2FsbGVkIHdoZW4gYSBjb21wb25lbnQgZmlyc3QgaW5pdGlhbGl6ZXMsIG5vdCBpbiBhIHN1YnNlcXVlbnQgZWZmZWN0IG9yIGFmdGVyIGFuIFxcYGF3YWl0XFxgIGV4cHJlc3Npb25cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zZXRfY29udGV4dF9hZnRlcl9pbml0YCk7XG5cblx0XHRlcnJvci5uYW1lID0gJ1N2ZWx0ZSBlcnJvcic7XG5cblx0XHR0aHJvdyBlcnJvcjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGh0dHBzOi8vc3ZlbHRlLmRldi9lL3NldF9jb250ZXh0X2FmdGVyX2luaXRgKTtcblx0fVxufVxuXG4vKipcbiAqIFByb3BlcnR5IGRlc2NyaXB0b3JzIGRlZmluZWQgb24gYCRzdGF0ZWAgb2JqZWN0cyBtdXN0IGNvbnRhaW4gYHZhbHVlYCBhbmQgYWx3YXlzIGJlIGBlbnVtZXJhYmxlYCwgYGNvbmZpZ3VyYWJsZWAgYW5kIGB3cml0YWJsZWAuXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZV9kZXNjcmlwdG9yc19maXhlZCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBzdGF0ZV9kZXNjcmlwdG9yc19maXhlZFxcblByb3BlcnR5IGRlc2NyaXB0b3JzIGRlZmluZWQgb24gXFxgJHN0YXRlXFxgIG9iamVjdHMgbXVzdCBjb250YWluIFxcYHZhbHVlXFxgIGFuZCBhbHdheXMgYmUgXFxgZW51bWVyYWJsZVxcYCwgXFxgY29uZmlndXJhYmxlXFxgIGFuZCBcXGB3cml0YWJsZVxcYC5cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9kZXNjcmlwdG9yc19maXhlZGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9kZXNjcmlwdG9yc19maXhlZGApO1xuXHR9XG59XG5cbi8qKlxuICogQ2Fubm90IHNldCBwcm90b3R5cGUgb2YgYCRzdGF0ZWAgb2JqZWN0XG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZV9wcm90b3R5cGVfZml4ZWQoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgc3RhdGVfcHJvdG90eXBlX2ZpeGVkXFxuQ2Fubm90IHNldCBwcm90b3R5cGUgb2YgXFxgJHN0YXRlXFxgIG9iamVjdFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL3N0YXRlX3Byb3RvdHlwZV9maXhlZGApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9wcm90b3R5cGVfZml4ZWRgKTtcblx0fVxufVxuXG4vKipcbiAqIFVwZGF0aW5nIHN0YXRlIGluc2lkZSBgJGRlcml2ZWQoLi4uKWAsIGAkaW5zcGVjdCguLi4pYCBvciBhIHRlbXBsYXRlIGV4cHJlc3Npb24gaXMgZm9yYmlkZGVuLiBJZiB0aGUgdmFsdWUgc2hvdWxkIG5vdCBiZSByZWFjdGl2ZSwgZGVjbGFyZSBpdCB3aXRob3V0IGAkc3RhdGVgXG4gKiBAcmV0dXJucyB7bmV2ZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZV91bnNhZmVfbXV0YXRpb24oKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgc3RhdGVfdW5zYWZlX211dGF0aW9uXFxuVXBkYXRpbmcgc3RhdGUgaW5zaWRlIFxcYCRkZXJpdmVkKC4uLilcXGAsIFxcYCRpbnNwZWN0KC4uLilcXGAgb3IgYSB0ZW1wbGF0ZSBleHByZXNzaW9uIGlzIGZvcmJpZGRlbi4gSWYgdGhlIHZhbHVlIHNob3VsZCBub3QgYmUgcmVhY3RpdmUsIGRlY2xhcmUgaXQgd2l0aG91dCBcXGAkc3RhdGVcXGBcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV91bnNhZmVfbXV0YXRpb25gKTtcblxuXHRcdGVycm9yLm5hbWUgPSAnU3ZlbHRlIGVycm9yJztcblxuXHRcdHRocm93IGVycm9yO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3RhdGVfdW5zYWZlX211dGF0aW9uYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGA8c3ZlbHRlOmJvdW5kYXJ5PmAgYHJlc2V0YCBmdW5jdGlvbiBjYW5ub3QgYmUgY2FsbGVkIHdoaWxlIGFuIGVycm9yIGlzIHN0aWxsIGJlaW5nIGhhbmRsZWRcbiAqIEByZXR1cm5zIHtuZXZlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN2ZWx0ZV9ib3VuZGFyeV9yZXNldF9vbmVycm9yKCkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYHN2ZWx0ZV9ib3VuZGFyeV9yZXNldF9vbmVycm9yXFxuQSBcXGA8c3ZlbHRlOmJvdW5kYXJ5PlxcYCBcXGByZXNldFxcYCBmdW5jdGlvbiBjYW5ub3QgYmUgY2FsbGVkIHdoaWxlIGFuIGVycm9yIGlzIHN0aWxsIGJlaW5nIGhhbmRsZWRcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdmVsdGVfYm91bmRhcnlfcmVzZXRfb25lcnJvcmApO1xuXG5cdFx0ZXJyb3IubmFtZSA9ICdTdmVsdGUgZXJyb3InO1xuXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9zdmVsdGVfYm91bmRhcnlfcmVzZXRfb25lcnJvcmApO1xuXHR9XG59IiwiLyogVGhpcyBmaWxlIGlzIGdlbmVyYXRlZCBieSBzY3JpcHRzL3Byb2Nlc3MtbWVzc2FnZXMvaW5kZXguanMuIERvIG5vdCBlZGl0ISAqL1xuXG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcblxudmFyIGJvbGQgPSAnZm9udC13ZWlnaHQ6IGJvbGQnO1xudmFyIG5vcm1hbCA9ICdmb250LXdlaWdodDogbm9ybWFsJztcblxuLyoqXG4gKiBBc3NpZ25tZW50IHRvIGAlcHJvcGVydHklYCBwcm9wZXJ0eSAoJWxvY2F0aW9uJSkgd2lsbCBldmFsdWF0ZSB0byB0aGUgcmlnaHQtaGFuZCBzaWRlLCBub3QgdGhlIHZhbHVlIG9mIGAlcHJvcGVydHklYCBmb2xsb3dpbmcgdGhlIGFzc2lnbm1lbnQuIFRoaXMgbWF5IHJlc3VsdCBpbiB1bmV4cGVjdGVkIGJlaGF2aW91ci5cbiAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wZXJ0eVxuICogQHBhcmFtIHtzdHJpbmd9IGxvY2F0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NpZ25tZW50X3ZhbHVlX3N0YWxlKHByb3BlcnR5LCBsb2NhdGlvbikge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKGAlY1tzdmVsdGVdIGFzc2lnbm1lbnRfdmFsdWVfc3RhbGVcXG4lY0Fzc2lnbm1lbnQgdG8gXFxgJHtwcm9wZXJ0eX1cXGAgcHJvcGVydHkgKCR7bG9jYXRpb259KSB3aWxsIGV2YWx1YXRlIHRvIHRoZSByaWdodC1oYW5kIHNpZGUsIG5vdCB0aGUgdmFsdWUgb2YgXFxgJHtwcm9wZXJ0eX1cXGAgZm9sbG93aW5nIHRoZSBhc3NpZ25tZW50LiBUaGlzIG1heSByZXN1bHQgaW4gdW5leHBlY3RlZCBiZWhhdmlvdXIuXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYXNzaWdubWVudF92YWx1ZV9zdGFsZWAsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9hc3NpZ25tZW50X3ZhbHVlX3N0YWxlYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXRlY3RlZCByZWFjdGl2aXR5IGxvc3Mgd2hlbiByZWFkaW5nIGAlbmFtZSVgLiBUaGlzIGhhcHBlbnMgd2hlbiBzdGF0ZSBpcyByZWFkIGluIGFuIGFzeW5jIGZ1bmN0aW9uIGFmdGVyIGFuIGVhcmxpZXIgYGF3YWl0YFxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF3YWl0X3JlYWN0aXZpdHlfbG9zcyhuYW1lKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zb2xlLndhcm4oYCVjW3N2ZWx0ZV0gYXdhaXRfcmVhY3Rpdml0eV9sb3NzXFxuJWNEZXRlY3RlZCByZWFjdGl2aXR5IGxvc3Mgd2hlbiByZWFkaW5nIFxcYCR7bmFtZX1cXGAuIFRoaXMgaGFwcGVucyB3aGVuIHN0YXRlIGlzIHJlYWQgaW4gYW4gYXN5bmMgZnVuY3Rpb24gYWZ0ZXIgYW4gZWFybGllciBcXGBhd2FpdFxcYFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2F3YWl0X3JlYWN0aXZpdHlfbG9zc2AsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9hd2FpdF9yZWFjdGl2aXR5X2xvc3NgKTtcblx0fVxufVxuXG4vKipcbiAqIEFuIGFzeW5jIGRlcml2ZWQsIGAlbmFtZSVgICglbG9jYXRpb24lKSB3YXMgbm90IHJlYWQgaW1tZWRpYXRlbHkgYWZ0ZXIgaXQgcmVzb2x2ZWQuIFRoaXMgb2Z0ZW4gaW5kaWNhdGVzIGFuIHVubmVjZXNzYXJ5IHdhdGVyZmFsbCwgd2hpY2ggY2FuIHNsb3cgZG93biB5b3VyIGFwcFxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBsb2NhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gYXdhaXRfd2F0ZXJmYWxsKG5hbWUsIGxvY2F0aW9uKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zb2xlLndhcm4oYCVjW3N2ZWx0ZV0gYXdhaXRfd2F0ZXJmYWxsXFxuJWNBbiBhc3luYyBkZXJpdmVkLCBcXGAke25hbWV9XFxgICgke2xvY2F0aW9ufSkgd2FzIG5vdCByZWFkIGltbWVkaWF0ZWx5IGFmdGVyIGl0IHJlc29sdmVkLiBUaGlzIG9mdGVuIGluZGljYXRlcyBhbiB1bm5lY2Vzc2FyeSB3YXRlcmZhbGwsIHdoaWNoIGNhbiBzbG93IGRvd24geW91ciBhcHBcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9hd2FpdF93YXRlcmZhbGxgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYXdhaXRfd2F0ZXJmYWxsYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBgJWJpbmRpbmclYCAoJWxvY2F0aW9uJSkgaXMgYmluZGluZyB0byBhIG5vbi1yZWFjdGl2ZSBwcm9wZXJ0eVxuICogQHBhcmFtIHtzdHJpbmd9IGJpbmRpbmdcbiAqIEBwYXJhbSB7c3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbH0gW2xvY2F0aW9uXVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmluZGluZ19wcm9wZXJ0eV9ub25fcmVhY3RpdmUoYmluZGluZywgbG9jYXRpb24pIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2Fybihcblx0XHRcdGAlY1tzdmVsdGVdIGJpbmRpbmdfcHJvcGVydHlfbm9uX3JlYWN0aXZlXFxuJWMke2xvY2F0aW9uXG5cdFx0XHRcdD8gYFxcYCR7YmluZGluZ31cXGAgKCR7bG9jYXRpb259KSBpcyBiaW5kaW5nIHRvIGEgbm9uLXJlYWN0aXZlIHByb3BlcnR5YFxuXHRcdFx0XHQ6IGBcXGAke2JpbmRpbmd9XFxgIGlzIGJpbmRpbmcgdG8gYSBub24tcmVhY3RpdmUgcHJvcGVydHlgfVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2JpbmRpbmdfcHJvcGVydHlfbm9uX3JlYWN0aXZlYCxcblx0XHRcdGJvbGQsXG5cdFx0XHRub3JtYWxcblx0XHQpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvYmluZGluZ19wcm9wZXJ0eV9ub25fcmVhY3RpdmVgKTtcblx0fVxufVxuXG4vKipcbiAqIFlvdXIgYGNvbnNvbGUuJW1ldGhvZCVgIGNvbnRhaW5lZCBgJHN0YXRlYCBwcm94aWVzLiBDb25zaWRlciB1c2luZyBgJGluc3BlY3QoLi4uKWAgb3IgYCRzdGF0ZS5zbmFwc2hvdCguLi4pYCBpbnN0ZWFkXG4gKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb25zb2xlX2xvZ19zdGF0ZShtZXRob2QpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBjb25zb2xlX2xvZ19zdGF0ZVxcbiVjWW91ciBcXGBjb25zb2xlLiR7bWV0aG9kfVxcYCBjb250YWluZWQgXFxgJHN0YXRlXFxgIHByb3hpZXMuIENvbnNpZGVyIHVzaW5nIFxcYCRpbnNwZWN0KC4uLilcXGAgb3IgXFxgJHN0YXRlLnNuYXBzaG90KC4uLilcXGAgaW5zdGVhZFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2NvbnNvbGVfbG9nX3N0YXRlYCwgYm9sZCwgbm9ybWFsKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLndhcm4oYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2NvbnNvbGVfbG9nX3N0YXRlYCk7XG5cdH1cbn1cblxuLyoqXG4gKiAlaGFuZGxlciUgc2hvdWxkIGJlIGEgZnVuY3Rpb24uIERpZCB5b3UgbWVhbiB0byAlc3VnZ2VzdGlvbiU/XG4gKiBAcGFyYW0ge3N0cmluZ30gaGFuZGxlclxuICogQHBhcmFtIHtzdHJpbmd9IHN1Z2dlc3Rpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV2ZW50X2hhbmRsZXJfaW52YWxpZChoYW5kbGVyLCBzdWdnZXN0aW9uKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zb2xlLndhcm4oYCVjW3N2ZWx0ZV0gZXZlbnRfaGFuZGxlcl9pbnZhbGlkXFxuJWMke2hhbmRsZXJ9IHNob3VsZCBiZSBhIGZ1bmN0aW9uLiBEaWQgeW91IG1lYW4gdG8gJHtzdWdnZXN0aW9ufT9cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9ldmVudF9oYW5kbGVyX2ludmFsaWRgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZXZlbnRfaGFuZGxlcl9pbnZhbGlkYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBFeHBlY3RlZCB0byBmaW5kIGEgaHlkcmF0YWJsZSB3aXRoIGtleSBgJWtleSVgIGR1cmluZyBoeWRyYXRpb24sIGJ1dCBkaWQgbm90LlxuICogQHBhcmFtIHtzdHJpbmd9IGtleVxuICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0YWJsZV9taXNzaW5nX2J1dF9leHBlY3RlZChrZXkpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBoeWRyYXRhYmxlX21pc3NpbmdfYnV0X2V4cGVjdGVkXFxuJWNFeHBlY3RlZCB0byBmaW5kIGEgaHlkcmF0YWJsZSB3aXRoIGtleSBcXGAke2tleX1cXGAgZHVyaW5nIGh5ZHJhdGlvbiwgYnV0IGRpZCBub3QuXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaHlkcmF0YWJsZV9taXNzaW5nX2J1dF9leHBlY3RlZGAsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9oeWRyYXRhYmxlX21pc3NpbmdfYnV0X2V4cGVjdGVkYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgYCVhdHRyaWJ1dGUlYCBhdHRyaWJ1dGUgb24gYCVodG1sJWAgY2hhbmdlZCBpdHMgdmFsdWUgYmV0d2VlbiBzZXJ2ZXIgYW5kIGNsaWVudCByZW5kZXJzLiBUaGUgY2xpZW50IHZhbHVlLCBgJXZhbHVlJWAsIHdpbGwgYmUgaWdub3JlZCBpbiBmYXZvdXIgb2YgdGhlIHNlcnZlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IGF0dHJpYnV0ZVxuICogQHBhcmFtIHtzdHJpbmd9IGh0bWxcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0aW9uX2F0dHJpYnV0ZV9jaGFuZ2VkKGF0dHJpYnV0ZSwgaHRtbCwgdmFsdWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBoeWRyYXRpb25fYXR0cmlidXRlX2NoYW5nZWRcXG4lY1RoZSBcXGAke2F0dHJpYnV0ZX1cXGAgYXR0cmlidXRlIG9uIFxcYCR7aHRtbH1cXGAgY2hhbmdlZCBpdHMgdmFsdWUgYmV0d2VlbiBzZXJ2ZXIgYW5kIGNsaWVudCByZW5kZXJzLiBUaGUgY2xpZW50IHZhbHVlLCBcXGAke3ZhbHVlfVxcYCwgd2lsbCBiZSBpZ25vcmVkIGluIGZhdm91ciBvZiB0aGUgc2VydmVyIHZhbHVlXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaHlkcmF0aW9uX2F0dHJpYnV0ZV9jaGFuZ2VkYCwgYm9sZCwgbm9ybWFsKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLndhcm4oYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2h5ZHJhdGlvbl9hdHRyaWJ1dGVfY2hhbmdlZGApO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIHZhbHVlIG9mIGFuIGB7QGh0bWwgLi4ufWAgYmxvY2sgJWxvY2F0aW9uJSBjaGFuZ2VkIGJldHdlZW4gc2VydmVyIGFuZCBjbGllbnQgcmVuZGVycy4gVGhlIGNsaWVudCB2YWx1ZSB3aWxsIGJlIGlnbm9yZWQgaW4gZmF2b3VyIG9mIHRoZSBzZXJ2ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbH0gW2xvY2F0aW9uXVxuICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0aW9uX2h0bWxfY2hhbmdlZChsb2NhdGlvbikge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKFxuXHRcdFx0YCVjW3N2ZWx0ZV0gaHlkcmF0aW9uX2h0bWxfY2hhbmdlZFxcbiVjJHtsb2NhdGlvblxuXHRcdFx0XHQ/IGBUaGUgdmFsdWUgb2YgYW4gXFxge0BodG1sIC4uLn1cXGAgYmxvY2sgJHtsb2NhdGlvbn0gY2hhbmdlZCBiZXR3ZWVuIHNlcnZlciBhbmQgY2xpZW50IHJlbmRlcnMuIFRoZSBjbGllbnQgdmFsdWUgd2lsbCBiZSBpZ25vcmVkIGluIGZhdm91ciBvZiB0aGUgc2VydmVyIHZhbHVlYFxuXHRcdFx0XHQ6ICdUaGUgdmFsdWUgb2YgYW4gYHtAaHRtbCAuLi59YCBibG9jayBjaGFuZ2VkIGJldHdlZW4gc2VydmVyIGFuZCBjbGllbnQgcmVuZGVycy4gVGhlIGNsaWVudCB2YWx1ZSB3aWxsIGJlIGlnbm9yZWQgaW4gZmF2b3VyIG9mIHRoZSBzZXJ2ZXIgdmFsdWUnfVxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL2h5ZHJhdGlvbl9odG1sX2NoYW5nZWRgLFxuXHRcdFx0Ym9sZCxcblx0XHRcdG5vcm1hbFxuXHRcdCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9oeWRyYXRpb25faHRtbF9jaGFuZ2VkYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBIeWRyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGluaXRpYWwgVUkgZG9lcyBub3QgbWF0Y2ggd2hhdCB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci4gVGhlIGVycm9yIG9jY3VycmVkIG5lYXIgJWxvY2F0aW9uJVxuICogQHBhcmFtIHtzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsfSBbbG9jYXRpb25dXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyYXRpb25fbWlzbWF0Y2gobG9jYXRpb24pIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2Fybihcblx0XHRcdGAlY1tzdmVsdGVdIGh5ZHJhdGlvbl9taXNtYXRjaFxcbiVjJHtsb2NhdGlvblxuXHRcdFx0XHQ/IGBIeWRyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGluaXRpYWwgVUkgZG9lcyBub3QgbWF0Y2ggd2hhdCB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci4gVGhlIGVycm9yIG9jY3VycmVkIG5lYXIgJHtsb2NhdGlvbn1gXG5cdFx0XHRcdDogJ0h5ZHJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgaW5pdGlhbCBVSSBkb2VzIG5vdCBtYXRjaCB3aGF0IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyJ31cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9oeWRyYXRpb25fbWlzbWF0Y2hgLFxuXHRcdFx0Ym9sZCxcblx0XHRcdG5vcm1hbFxuXHRcdCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9oeWRyYXRpb25fbWlzbWF0Y2hgKTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBgcmVuZGVyYCBmdW5jdGlvbiBwYXNzZWQgdG8gYGNyZWF0ZVJhd1NuaXBwZXRgIHNob3VsZCByZXR1cm4gSFRNTCBmb3IgYSBzaW5nbGUgZWxlbWVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gaW52YWxpZF9yYXdfc25pcHBldF9yZW5kZXIoKSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zb2xlLndhcm4oYCVjW3N2ZWx0ZV0gaW52YWxpZF9yYXdfc25pcHBldF9yZW5kZXJcXG4lY1RoZSBcXGByZW5kZXJcXGAgZnVuY3Rpb24gcGFzc2VkIHRvIFxcYGNyZWF0ZVJhd1NuaXBwZXRcXGAgc2hvdWxkIHJldHVybiBIVE1MIGZvciBhIHNpbmdsZSBlbGVtZW50XFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaW52YWxpZF9yYXdfc25pcHBldF9yZW5kZXJgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvaW52YWxpZF9yYXdfc25pcHBldF9yZW5kZXJgKTtcblx0fVxufVxuXG4vKipcbiAqIERldGVjdGVkIGEgbWlncmF0ZWQgYCQ6YCByZWFjdGl2ZSBibG9jayBpbiBgJWZpbGVuYW1lJWAgdGhhdCBib3RoIGFjY2Vzc2VzIGFuZCB1cGRhdGVzIHRoZSBzYW1lIHJlYWN0aXZlIHZhbHVlLiBUaGlzIG1heSBjYXVzZSByZWN1cnNpdmUgdXBkYXRlcyB3aGVuIGNvbnZlcnRlZCB0byBhbiBgJGVmZmVjdGAuXG4gKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeV9yZWN1cnNpdmVfcmVhY3RpdmVfYmxvY2soZmlsZW5hbWUpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBsZWdhY3lfcmVjdXJzaXZlX3JlYWN0aXZlX2Jsb2NrXFxuJWNEZXRlY3RlZCBhIG1pZ3JhdGVkIFxcYCQ6XFxgIHJlYWN0aXZlIGJsb2NrIGluIFxcYCR7ZmlsZW5hbWV9XFxgIHRoYXQgYm90aCBhY2Nlc3NlcyBhbmQgdXBkYXRlcyB0aGUgc2FtZSByZWFjdGl2ZSB2YWx1ZS4gVGhpcyBtYXkgY2F1c2UgcmVjdXJzaXZlIHVwZGF0ZXMgd2hlbiBjb252ZXJ0ZWQgdG8gYW4gXFxgJGVmZmVjdFxcYC5cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9sZWdhY3lfcmVjdXJzaXZlX3JlYWN0aXZlX2Jsb2NrYCwgYm9sZCwgbm9ybWFsKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLndhcm4oYGh0dHBzOi8vc3ZlbHRlLmRldi9lL2xlZ2FjeV9yZWN1cnNpdmVfcmVhY3RpdmVfYmxvY2tgKTtcblx0fVxufVxuXG4vKipcbiAqIFRyaWVkIHRvIHVubW91bnQgYSBjb21wb25lbnQgdGhhdCB3YXMgbm90IG1vdW50ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpZmVjeWNsZV9kb3VibGVfdW5tb3VudCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBsaWZlY3ljbGVfZG91YmxlX3VubW91bnRcXG4lY1RyaWVkIHRvIHVubW91bnQgYSBjb21wb25lbnQgdGhhdCB3YXMgbm90IG1vdW50ZWRcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9saWZlY3ljbGVfZG91YmxlX3VubW91bnRgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvbGlmZWN5Y2xlX2RvdWJsZV91bm1vdW50YCk7XG5cdH1cbn1cblxuLyoqXG4gKiAlcGFyZW50JSBwYXNzZWQgcHJvcGVydHkgYCVwcm9wJWAgdG8gJWNoaWxkJSB3aXRoIGBiaW5kOmAsIGJ1dCBpdHMgcGFyZW50IGNvbXBvbmVudCAlb3duZXIlIGRpZCBub3QgZGVjbGFyZSBgJXByb3AlYCBhcyBhIGJpbmRpbmcuIENvbnNpZGVyIGNyZWF0aW5nIGEgYmluZGluZyBiZXR3ZWVuICVvd25lciUgYW5kICVwYXJlbnQlIChlLmcuIGBiaW5kOiVwcm9wJT17Li4ufWAgaW5zdGVhZCBvZiBgJXByb3AlPXsuLi59YClcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXJlbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wXG4gKiBAcGFyYW0ge3N0cmluZ30gY2hpbGRcbiAqIEBwYXJhbSB7c3RyaW5nfSBvd25lclxuICovXG5leHBvcnQgZnVuY3Rpb24gb3duZXJzaGlwX2ludmFsaWRfYmluZGluZyhwYXJlbnQsIHByb3AsIGNoaWxkLCBvd25lcikge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKGAlY1tzdmVsdGVdIG93bmVyc2hpcF9pbnZhbGlkX2JpbmRpbmdcXG4lYyR7cGFyZW50fSBwYXNzZWQgcHJvcGVydHkgXFxgJHtwcm9wfVxcYCB0byAke2NoaWxkfSB3aXRoIFxcYGJpbmQ6XFxgLCBidXQgaXRzIHBhcmVudCBjb21wb25lbnQgJHtvd25lcn0gZGlkIG5vdCBkZWNsYXJlIFxcYCR7cHJvcH1cXGAgYXMgYSBiaW5kaW5nLiBDb25zaWRlciBjcmVhdGluZyBhIGJpbmRpbmcgYmV0d2VlbiAke293bmVyfSBhbmQgJHtwYXJlbnR9IChlLmcuIFxcYGJpbmQ6JHtwcm9wfT17Li4ufVxcYCBpbnN0ZWFkIG9mIFxcYCR7cHJvcH09ey4uLn1cXGApXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvb3duZXJzaGlwX2ludmFsaWRfYmluZGluZ2AsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9vd25lcnNoaXBfaW52YWxpZF9iaW5kaW5nYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBNdXRhdGluZyB1bmJvdW5kIHByb3BzIChgJW5hbWUlYCwgYXQgJWxvY2F0aW9uJSkgaXMgc3Ryb25nbHkgZGlzY291cmFnZWQuIENvbnNpZGVyIHVzaW5nIGBiaW5kOiVwcm9wJT17Li4ufWAgaW4gJXBhcmVudCUgKG9yIHVzaW5nIGEgY2FsbGJhY2spIGluc3RlYWRcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb25cbiAqIEBwYXJhbSB7c3RyaW5nfSBwcm9wXG4gKiBAcGFyYW0ge3N0cmluZ30gcGFyZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvd25lcnNoaXBfaW52YWxpZF9tdXRhdGlvbihuYW1lLCBsb2NhdGlvbiwgcHJvcCwgcGFyZW50KSB7XG5cdGlmIChERVYpIHtcblx0XHRjb25zb2xlLndhcm4oYCVjW3N2ZWx0ZV0gb3duZXJzaGlwX2ludmFsaWRfbXV0YXRpb25cXG4lY011dGF0aW5nIHVuYm91bmQgcHJvcHMgKFxcYCR7bmFtZX1cXGAsIGF0ICR7bG9jYXRpb259KSBpcyBzdHJvbmdseSBkaXNjb3VyYWdlZC4gQ29uc2lkZXIgdXNpbmcgXFxgYmluZDoke3Byb3B9PXsuLi59XFxgIGluICR7cGFyZW50fSAob3IgdXNpbmcgYSBjYWxsYmFjaykgaW5zdGVhZFxcbmh0dHBzOi8vc3ZlbHRlLmRldi9lL293bmVyc2hpcF9pbnZhbGlkX211dGF0aW9uYCwgYm9sZCwgbm9ybWFsKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLndhcm4oYGh0dHBzOi8vc3ZlbHRlLmRldi9lL293bmVyc2hpcF9pbnZhbGlkX211dGF0aW9uYCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgYHZhbHVlYCBwcm9wZXJ0eSBvZiBhIGA8c2VsZWN0IG11bHRpcGxlPmAgZWxlbWVudCBzaG91bGQgYmUgYW4gYXJyYXksIGJ1dCBpdCByZWNlaXZlZCBhIG5vbi1hcnJheSB2YWx1ZS4gVGhlIHNlbGVjdGlvbiB3aWxsIGJlIGtlcHQgYXMgaXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWxlY3RfbXVsdGlwbGVfaW52YWxpZF92YWx1ZSgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBzZWxlY3RfbXVsdGlwbGVfaW52YWxpZF92YWx1ZVxcbiVjVGhlIFxcYHZhbHVlXFxgIHByb3BlcnR5IG9mIGEgXFxgPHNlbGVjdCBtdWx0aXBsZT5cXGAgZWxlbWVudCBzaG91bGQgYmUgYW4gYXJyYXksIGJ1dCBpdCByZWNlaXZlZCBhIG5vbi1hcnJheSB2YWx1ZS4gVGhlIHNlbGVjdGlvbiB3aWxsIGJlIGtlcHQgYXMgaXMuXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc2VsZWN0X211bHRpcGxlX2ludmFsaWRfdmFsdWVgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc2VsZWN0X211bHRpcGxlX2ludmFsaWRfdmFsdWVgKTtcblx0fVxufVxuXG4vKipcbiAqIFJlYWN0aXZlIGAkc3RhdGUoLi4uKWAgcHJveGllcyBhbmQgdGhlIHZhbHVlcyB0aGV5IHByb3h5IGhhdmUgZGlmZmVyZW50IGlkZW50aXRpZXMuIEJlY2F1c2Ugb2YgdGhpcywgY29tcGFyaXNvbnMgd2l0aCBgJW9wZXJhdG9yJWAgd2lsbCBwcm9kdWNlIHVuZXhwZWN0ZWQgcmVzdWx0c1xuICogQHBhcmFtIHtzdHJpbmd9IG9wZXJhdG9yXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZV9wcm94eV9lcXVhbGl0eV9taXNtYXRjaChvcGVyYXRvcikge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKGAlY1tzdmVsdGVdIHN0YXRlX3Byb3h5X2VxdWFsaXR5X21pc21hdGNoXFxuJWNSZWFjdGl2ZSBcXGAkc3RhdGUoLi4uKVxcYCBwcm94aWVzIGFuZCB0aGUgdmFsdWVzIHRoZXkgcHJveHkgaGF2ZSBkaWZmZXJlbnQgaWRlbnRpdGllcy4gQmVjYXVzZSBvZiB0aGlzLCBjb21wYXJpc29ucyB3aXRoIFxcYCR7b3BlcmF0b3J9XFxgIHdpbGwgcHJvZHVjZSB1bmV4cGVjdGVkIHJlc3VsdHNcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9wcm94eV9lcXVhbGl0eV9taXNtYXRjaGAsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9wcm94eV9lcXVhbGl0eV9taXNtYXRjaGApO1xuXHR9XG59XG5cbi8qKlxuICogVHJpZWQgdG8gdW5tb3VudCBhIHN0YXRlIHByb3h5LCByYXRoZXIgdGhhbiBhIGNvbXBvbmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhdGVfcHJveHlfdW5tb3VudCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBzdGF0ZV9wcm94eV91bm1vdW50XFxuJWNUcmllZCB0byB1bm1vdW50IGEgc3RhdGUgcHJveHksIHJhdGhlciB0aGFuIGEgY29tcG9uZW50XFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3RhdGVfcHJveHlfdW5tb3VudGAsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9wcm94eV91bm1vdW50YCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGA8c3ZlbHRlOmJvdW5kYXJ5PmAgYHJlc2V0YCBmdW5jdGlvbiBvbmx5IHJlc2V0cyB0aGUgYm91bmRhcnkgdGhlIGZpcnN0IHRpbWUgaXQgaXMgY2FsbGVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdmVsdGVfYm91bmRhcnlfcmVzZXRfbm9vcCgpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2FybihgJWNbc3ZlbHRlXSBzdmVsdGVfYm91bmRhcnlfcmVzZXRfbm9vcFxcbiVjQSBcXGA8c3ZlbHRlOmJvdW5kYXJ5PlxcYCBcXGByZXNldFxcYCBmdW5jdGlvbiBvbmx5IHJlc2V0cyB0aGUgYm91bmRhcnkgdGhlIGZpcnN0IHRpbWUgaXQgaXMgY2FsbGVkXFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3ZlbHRlX2JvdW5kYXJ5X3Jlc2V0X25vb3BgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2Uvc3ZlbHRlX2JvdW5kYXJ5X3Jlc2V0X25vb3BgKTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBgc2xpZGVgIHRyYW5zaXRpb24gZG9lcyBub3Qgd29yayBjb3JyZWN0bHkgZm9yIGVsZW1lbnRzIHdpdGggYGRpc3BsYXk6ICV2YWx1ZSVgXG4gKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zaXRpb25fc2xpZGVfZGlzcGxheSh2YWx1ZSkge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKGAlY1tzdmVsdGVdIHRyYW5zaXRpb25fc2xpZGVfZGlzcGxheVxcbiVjVGhlIFxcYHNsaWRlXFxgIHRyYW5zaXRpb24gZG9lcyBub3Qgd29yayBjb3JyZWN0bHkgZm9yIGVsZW1lbnRzIHdpdGggXFxgZGlzcGxheTogJHt2YWx1ZX1cXGBcXG5odHRwczovL3N2ZWx0ZS5kZXYvZS90cmFuc2l0aW9uX3NsaWRlX2Rpc3BsYXlgLCBib2xkLCBub3JtYWwpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGUud2FybihgaHR0cHM6Ly9zdmVsdGUuZGV2L2UvdHJhbnNpdGlvbl9zbGlkZV9kaXNwbGF5YCk7XG5cdH1cbn0iLCIvKiogQGltcG9ydCB7IFRlbXBsYXRlTm9kZSB9IGZyb20gJyNjbGllbnQnICovXG5cbmltcG9ydCB7IENPTU1FTlRfTk9ERSB9IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7XG5cdEhZRFJBVElPTl9FTkQsXG5cdEhZRFJBVElPTl9FUlJPUixcblx0SFlEUkFUSU9OX1NUQVJULFxuXHRIWURSQVRJT05fU1RBUlRfRUxTRVxufSBmcm9tICcuLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0ICogYXMgdyBmcm9tICcuLi93YXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBnZXRfbmV4dF9zaWJsaW5nIH0gZnJvbSAnLi9vcGVyYXRpb25zLmpzJztcblxuLyoqXG4gKiBVc2UgdGhpcyB2YXJpYWJsZSB0byBndWFyZCBldmVyeXRoaW5nIHJlbGF0ZWQgdG8gaHlkcmF0aW9uIGNvZGUgc28gaXQgY2FuIGJlIHRyZWVzaGFrZW4gb3V0XG4gKiBpZiB0aGUgdXNlciBkb2Vzbid0IHVzZSB0aGUgYGh5ZHJhdGVgIG1ldGhvZCBhbmQgdGhlc2UgY29kZSBwYXRocyBhcmUgdGhlcmVmb3JlIG5vdCBuZWVkZWQuXG4gKi9cbmV4cG9ydCBsZXQgaHlkcmF0aW5nID0gZmFsc2U7XG5cbi8qKiBAcGFyYW0ge2Jvb2xlYW59IHZhbHVlICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2h5ZHJhdGluZyh2YWx1ZSkge1xuXHRoeWRyYXRpbmcgPSB2YWx1ZTtcbn1cblxuLyoqXG4gKiBUaGUgbm9kZSB0aGF0IGlzIGN1cnJlbnRseSBiZWluZyBoeWRyYXRlZC4gVGhpcyBzdGFydHMgb3V0IGFzIHRoZSBmaXJzdCBub2RlIGluc2lkZSB0aGUgb3BlbmluZ1xuICogPCEtLVstLT4gY29tbWVudCwgYW5kIHVwZGF0ZXMgZWFjaCB0aW1lIGEgY29tcG9uZW50IGNhbGxzIGAkLmNoaWxkKC4uLilgIG9yIGAkLnNpYmxpbmcoLi4uKWAuXG4gKiBXaGVuIGVudGVyaW5nIGEgYmxvY2sgKGUuZy4gYHsjaWYgLi4ufWApLCBgaHlkcmF0ZV9ub2RlYCBpcyB0aGUgYmxvY2sgb3BlbmluZyBjb21tZW50OyBieSB0aGVcbiAqIHRpbWUgd2UgbGVhdmUgdGhlIGJsb2NrIGl0IGlzIHRoZSBjbG9zaW5nIGNvbW1lbnQsIHdoaWNoIHNlcnZlcyBhcyB0aGUgYmxvY2sncyBhbmNob3IuXG4gKiBAdHlwZSB7VGVtcGxhdGVOb2RlfVxuICovXG5leHBvcnQgbGV0IGh5ZHJhdGVfbm9kZTtcblxuLyoqIEBwYXJhbSB7VGVtcGxhdGVOb2RlfSBub2RlICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2h5ZHJhdGVfbm9kZShub2RlKSB7XG5cdGlmIChub2RlID09PSBudWxsKSB7XG5cdFx0dy5oeWRyYXRpb25fbWlzbWF0Y2goKTtcblx0XHR0aHJvdyBIWURSQVRJT05fRVJST1I7XG5cdH1cblxuXHRyZXR1cm4gKGh5ZHJhdGVfbm9kZSA9IG5vZGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0ZV9uZXh0KCkge1xuXHRyZXR1cm4gc2V0X2h5ZHJhdGVfbm9kZSgvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9uZXh0X3NpYmxpbmcoaHlkcmF0ZV9ub2RlKSkpO1xufVxuXG4vKiogQHBhcmFtIHtUZW1wbGF0ZU5vZGV9IG5vZGUgKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNldChub2RlKSB7XG5cdGlmICghaHlkcmF0aW5nKSByZXR1cm47XG5cblx0Ly8gSWYgdGhlIG5vZGUgaGFzIHJlbWFpbmluZyBzaWJsaW5ncywgc29tZXRoaW5nIGhhcyBnb25lIHdyb25nXG5cdGlmIChnZXRfbmV4dF9zaWJsaW5nKGh5ZHJhdGVfbm9kZSkgIT09IG51bGwpIHtcblx0XHR3Lmh5ZHJhdGlvbl9taXNtYXRjaCgpO1xuXHRcdHRocm93IEhZRFJBVElPTl9FUlJPUjtcblx0fVxuXG5cdGh5ZHJhdGVfbm9kZSA9IG5vZGU7XG59XG5cbi8qKlxuICogQHBhcmFtIHtIVE1MVGVtcGxhdGVFbGVtZW50fSB0ZW1wbGF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcmF0ZV90ZW1wbGF0ZSh0ZW1wbGF0ZSkge1xuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciBUZW1wbGF0ZU5vZGUgZG9lc24ndCBpbmNsdWRlIERvY3VtZW50RnJhZ21lbnQsIGJ1dCBpdCdzIGFjdHVhbGx5IGZpbmVcblx0XHRoeWRyYXRlX25vZGUgPSB0ZW1wbGF0ZS5jb250ZW50O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZXh0KGNvdW50ID0gMSkge1xuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0dmFyIGkgPSBjb3VudDtcblx0XHR2YXIgbm9kZSA9IGh5ZHJhdGVfbm9kZTtcblxuXHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdG5vZGUgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9uZXh0X3NpYmxpbmcobm9kZSkpO1xuXHRcdH1cblxuXHRcdGh5ZHJhdGVfbm9kZSA9IG5vZGU7XG5cdH1cbn1cblxuLyoqXG4gKiBTa2lwcyBvciByZW1vdmVzIChkZXBlbmRpbmcgb24ge0BsaW5rIHJlbW92ZX0pIGFsbCBub2RlcyBzdGFydGluZyBhdCBgaHlkcmF0ZV9ub2RlYCB1cCB1bnRpbCB0aGUgbmV4dCBoeWRyYXRpb24gZW5kIGNvbW1lbnRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gcmVtb3ZlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBza2lwX25vZGVzKHJlbW92ZSA9IHRydWUpIHtcblx0dmFyIGRlcHRoID0gMDtcblx0dmFyIG5vZGUgPSBoeWRyYXRlX25vZGU7XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gQ09NTUVOVF9OT0RFKSB7XG5cdFx0XHR2YXIgZGF0YSA9IC8qKiBAdHlwZSB7Q29tbWVudH0gKi8gKG5vZGUpLmRhdGE7XG5cblx0XHRcdGlmIChkYXRhID09PSBIWURSQVRJT05fRU5EKSB7XG5cdFx0XHRcdGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuIG5vZGU7XG5cdFx0XHRcdGRlcHRoIC09IDE7XG5cdFx0XHR9IGVsc2UgaWYgKGRhdGEgPT09IEhZRFJBVElPTl9TVEFSVCB8fCBkYXRhID09PSBIWURSQVRJT05fU1RBUlRfRUxTRSkge1xuXHRcdFx0XHRkZXB0aCArPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHZhciBuZXh0ID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChnZXRfbmV4dF9zaWJsaW5nKG5vZGUpKTtcblx0XHRpZiAocmVtb3ZlKSBub2RlLnJlbW92ZSgpO1xuXHRcdG5vZGUgPSBuZXh0O1xuXHR9XG59XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB7VGVtcGxhdGVOb2RlfSBub2RlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkX2h5ZHJhdGlvbl9pbnN0cnVjdGlvbihub2RlKSB7XG5cdGlmICghbm9kZSB8fCBub2RlLm5vZGVUeXBlICE9PSBDT01NRU5UX05PREUpIHtcblx0XHR3Lmh5ZHJhdGlvbl9taXNtYXRjaCgpO1xuXHRcdHRocm93IEhZRFJBVElPTl9FUlJPUjtcblx0fVxuXG5cdHJldHVybiAvKiogQHR5cGUge0NvbW1lbnR9ICovIChub2RlKS5kYXRhO1xufVxuIiwiLyoqIEBpbXBvcnQgeyBFcXVhbHMgfSBmcm9tICcjY2xpZW50JyAqL1xuXG4vKiogQHR5cGUge0VxdWFsc30gKi9cbmV4cG9ydCBmdW5jdGlvbiBlcXVhbHModmFsdWUpIHtcblx0cmV0dXJuIHZhbHVlID09PSB0aGlzLnY7XG59XG5cbi8qKlxuICogQHBhcmFtIHt1bmtub3dufSBhXG4gKiBAcGFyYW0ge3Vua25vd259IGJcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2FmZV9ub3RfZXF1YWwoYSwgYikge1xuXHRyZXR1cm4gYSAhPSBhXG5cdFx0PyBiID09IGJcblx0XHQ6IGEgIT09IGIgfHwgKGEgIT09IG51bGwgJiYgdHlwZW9mIGEgPT09ICdvYmplY3QnKSB8fCB0eXBlb2YgYSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3Vua25vd259IGFcbiAqIEBwYXJhbSB7dW5rbm93bn0gYlxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3RfZXF1YWwoYSwgYikge1xuXHRyZXR1cm4gYSAhPT0gYjtcbn1cblxuLyoqIEB0eXBlIHtFcXVhbHN9ICovXG5leHBvcnQgZnVuY3Rpb24gc2FmZV9lcXVhbHModmFsdWUpIHtcblx0cmV0dXJuICFzYWZlX25vdF9lcXVhbCh2YWx1ZSwgdGhpcy52KTtcbn1cbiIsIi8qIFRoaXMgZmlsZSBpcyBnZW5lcmF0ZWQgYnkgc2NyaXB0cy9wcm9jZXNzLW1lc3NhZ2VzL2luZGV4LmpzLiBEbyBub3QgZWRpdCEgKi9cblxuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5cbnZhciBib2xkID0gJ2ZvbnQtd2VpZ2h0OiBib2xkJztcbnZhciBub3JtYWwgPSAnZm9udC13ZWlnaHQ6IG5vcm1hbCc7XG5cbi8qKlxuICogYDxzdmVsdGU6ZWxlbWVudCB0aGlzPVwiJXRhZyVcIj5gIGlzIGEgdm9pZCBlbGVtZW50IOKAlCBpdCBjYW5ub3QgaGF2ZSBjb250ZW50XG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkeW5hbWljX3ZvaWRfZWxlbWVudF9jb250ZW50KHRhZykge1xuXHRpZiAoREVWKSB7XG5cdFx0Y29uc29sZS53YXJuKGAlY1tzdmVsdGVdIGR5bmFtaWNfdm9pZF9lbGVtZW50X2NvbnRlbnRcXG4lY1xcYDxzdmVsdGU6ZWxlbWVudCB0aGlzPVwiJHt0YWd9XCI+XFxgIGlzIGEgdm9pZCBlbGVtZW50IOKAlCBpdCBjYW5ub3QgaGF2ZSBjb250ZW50XFxuaHR0cHM6Ly9zdmVsdGUuZGV2L2UvZHluYW1pY192b2lkX2VsZW1lbnRfY29udGVudGAsIGJvbGQsIG5vcm1hbCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS53YXJuKGBodHRwczovL3N2ZWx0ZS5kZXYvZS9keW5hbWljX3ZvaWRfZWxlbWVudF9jb250ZW50YCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgZm9sbG93aW5nIHByb3BlcnRpZXMgY2Fubm90IGJlIGNsb25lZCB3aXRoIGAkc3RhdGUuc25hcHNob3RgIOKAlCB0aGUgcmV0dXJuIHZhbHVlIGNvbnRhaW5zIHRoZSBvcmlnaW5hbHM6XG4gKiBcbiAqICVwcm9wZXJ0aWVzJVxuICogQHBhcmFtIHtzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsfSBbcHJvcGVydGllc11cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXRlX3NuYXBzaG90X3VuY2xvbmVhYmxlKHByb3BlcnRpZXMpIHtcblx0aWYgKERFVikge1xuXHRcdGNvbnNvbGUud2Fybihcblx0XHRcdGAlY1tzdmVsdGVdIHN0YXRlX3NuYXBzaG90X3VuY2xvbmVhYmxlXFxuJWMke3Byb3BlcnRpZXNcblx0XHRcdFx0PyBgVGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzIGNhbm5vdCBiZSBjbG9uZWQgd2l0aCBcXGAkc3RhdGUuc25hcHNob3RcXGAg4oCUIHRoZSByZXR1cm4gdmFsdWUgY29udGFpbnMgdGhlIG9yaWdpbmFsczpcblxuJHtwcm9wZXJ0aWVzfWBcblx0XHRcdFx0OiAnVmFsdWUgY2Fubm90IGJlIGNsb25lZCB3aXRoIGAkc3RhdGUuc25hcHNob3RgIOKAlCB0aGUgb3JpZ2luYWwgdmFsdWUgd2FzIHJldHVybmVkJ31cXG5odHRwczovL3N2ZWx0ZS5kZXYvZS9zdGF0ZV9zbmFwc2hvdF91bmNsb25lYWJsZWAsXG5cdFx0XHRib2xkLFxuXHRcdFx0bm9ybWFsXG5cdFx0KTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLndhcm4oYGh0dHBzOi8vc3ZlbHRlLmRldi9lL3N0YXRlX3NuYXBzaG90X3VuY2xvbmVhYmxlYCk7XG5cdH1cbn0iLCIvKiogQGltcG9ydCB7IFNuYXBzaG90IH0gZnJvbSAnLi90eXBlcycgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0ICogYXMgdyBmcm9tICcuL3dhcm5pbmdzLmpzJztcbmltcG9ydCB7IGdldF9wcm90b3R5cGVfb2YsIGlzX2FycmF5LCBvYmplY3RfcHJvdG90eXBlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbi8qKlxuICogSW4gZGV2LCB3ZSBrZWVwIHRyYWNrIG9mIHdoaWNoIHByb3BlcnRpZXMgY291bGQgbm90IGJlIGNsb25lZC4gSW4gcHJvZFxuICogd2UgZG9uJ3QgYm90aGVyLCBidXQgd2Uga2VlcCBhIGR1bW15IGFycmF5IGFyb3VuZCBzbyB0aGF0IHRoZVxuICogc2lnbmF0dXJlIHN0YXlzIHRoZSBzYW1lXG4gKiBAdHlwZSB7c3RyaW5nW119XG4gKi9cbmNvbnN0IGVtcHR5ID0gW107XG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEBwYXJhbSB7VH0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBfd2FybmluZ11cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW25vX3RvanNvbl1cbiAqIEByZXR1cm5zIHtTbmFwc2hvdDxUPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNuYXBzaG90KHZhbHVlLCBza2lwX3dhcm5pbmcgPSBmYWxzZSwgbm9fdG9qc29uID0gZmFsc2UpIHtcblx0aWYgKERFViAmJiAhc2tpcF93YXJuaW5nKSB7XG5cdFx0LyoqIEB0eXBlIHtzdHJpbmdbXX0gKi9cblx0XHRjb25zdCBwYXRocyA9IFtdO1xuXG5cdFx0Y29uc3QgY29weSA9IGNsb25lKHZhbHVlLCBuZXcgTWFwKCksICcnLCBwYXRocywgbnVsbCwgbm9fdG9qc29uKTtcblx0XHRpZiAocGF0aHMubGVuZ3RoID09PSAxICYmIHBhdGhzWzBdID09PSAnJykge1xuXHRcdFx0Ly8gdmFsdWUgY291bGQgbm90IGJlIGNsb25lZFxuXHRcdFx0dy5zdGF0ZV9zbmFwc2hvdF91bmNsb25lYWJsZSgpO1xuXHRcdH0gZWxzZSBpZiAocGF0aHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gc29tZSBwcm9wZXJ0aWVzIGNvdWxkIG5vdCBiZSBjbG9uZWRcblx0XHRcdGNvbnN0IHNsaWNlID0gcGF0aHMubGVuZ3RoID4gMTAgPyBwYXRocy5zbGljZSgwLCA3KSA6IHBhdGhzLnNsaWNlKDAsIDEwKTtcblx0XHRcdGNvbnN0IGV4Y2VzcyA9IHBhdGhzLmxlbmd0aCAtIHNsaWNlLmxlbmd0aDtcblxuXHRcdFx0bGV0IHVuY2xvbmVkID0gc2xpY2UubWFwKChwYXRoKSA9PiBgLSA8dmFsdWU+JHtwYXRofWApLmpvaW4oJ1xcbicpO1xuXHRcdFx0aWYgKGV4Y2VzcyA+IDApIHVuY2xvbmVkICs9IGBcXG4tIC4uLmFuZCAke2V4Y2Vzc30gbW9yZWA7XG5cblx0XHRcdHcuc3RhdGVfc25hcHNob3RfdW5jbG9uZWFibGUodW5jbG9uZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb3B5O1xuXHR9XG5cblx0cmV0dXJuIGNsb25lKHZhbHVlLCBuZXcgTWFwKCksICcnLCBlbXB0eSwgbnVsbCwgbm9fdG9qc29uKTtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHtUfSB2YWx1ZVxuICogQHBhcmFtIHtNYXA8VCwgU25hcHNob3Q8VD4+fSBjbG9uZWRcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBwYXRoc1xuICogQHBhcmFtIHtudWxsIHwgVH0gW29yaWdpbmFsXSBUaGUgb3JpZ2luYWwgdmFsdWUsIGlmIGB2YWx1ZWAgd2FzIHByb2R1Y2VkIGZyb20gYSBgdG9KU09OYCBjYWxsXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtub190b2pzb25dXG4gKiBAcmV0dXJucyB7U25hcHNob3Q8VD59XG4gKi9cbmZ1bmN0aW9uIGNsb25lKHZhbHVlLCBjbG9uZWQsIHBhdGgsIHBhdGhzLCBvcmlnaW5hbCA9IG51bGwsIG5vX3RvanNvbiA9IGZhbHNlKSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0dmFyIHVud3JhcHBlZCA9IGNsb25lZC5nZXQodmFsdWUpO1xuXHRcdGlmICh1bndyYXBwZWQgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHVud3JhcHBlZDtcblxuXHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkgcmV0dXJuIC8qKiBAdHlwZSB7U25hcHNob3Q8VD59ICovIChuZXcgTWFwKHZhbHVlKSk7XG5cdFx0aWYgKHZhbHVlIGluc3RhbmNlb2YgU2V0KSByZXR1cm4gLyoqIEB0eXBlIHtTbmFwc2hvdDxUPn0gKi8gKG5ldyBTZXQodmFsdWUpKTtcblxuXHRcdGlmIChpc19hcnJheSh2YWx1ZSkpIHtcblx0XHRcdHZhciBjb3B5ID0gLyoqIEB0eXBlIHtTbmFwc2hvdDxhbnk+fSAqLyAoQXJyYXkodmFsdWUubGVuZ3RoKSk7XG5cdFx0XHRjbG9uZWQuc2V0KHZhbHVlLCBjb3B5KTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsICE9PSBudWxsKSB7XG5cdFx0XHRcdGNsb25lZC5zZXQob3JpZ2luYWwsIGNvcHkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG5cdFx0XHRcdHZhciBlbGVtZW50ID0gdmFsdWVbaV07XG5cdFx0XHRcdGlmIChpIGluIHZhbHVlKSB7XG5cdFx0XHRcdFx0Y29weVtpXSA9IGNsb25lKGVsZW1lbnQsIGNsb25lZCwgREVWID8gYCR7cGF0aH1bJHtpfV1gIDogcGF0aCwgcGF0aHMsIG51bGwsIG5vX3RvanNvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNvcHk7XG5cdFx0fVxuXG5cdFx0aWYgKGdldF9wcm90b3R5cGVfb2YodmFsdWUpID09PSBvYmplY3RfcHJvdG90eXBlKSB7XG5cdFx0XHQvKiogQHR5cGUge1NuYXBzaG90PGFueT59ICovXG5cdFx0XHRjb3B5ID0ge307XG5cdFx0XHRjbG9uZWQuc2V0KHZhbHVlLCBjb3B5KTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsICE9PSBudWxsKSB7XG5cdFx0XHRcdGNsb25lZC5zZXQob3JpZ2luYWwsIGNvcHkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gdmFsdWUpIHtcblx0XHRcdFx0Y29weVtrZXldID0gY2xvbmUoXG5cdFx0XHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0XHRcdHZhbHVlW2tleV0sXG5cdFx0XHRcdFx0Y2xvbmVkLFxuXHRcdFx0XHRcdERFViA/IGAke3BhdGh9LiR7a2V5fWAgOiBwYXRoLFxuXHRcdFx0XHRcdHBhdGhzLFxuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0bm9fdG9qc29uXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb3B5O1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcblx0XHRcdHJldHVybiAvKiogQHR5cGUge1NuYXBzaG90PFQ+fSAqLyAoc3RydWN0dXJlZENsb25lKHZhbHVlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiAoLyoqIEB0eXBlIHtUICYgeyB0b0pTT04/OiBhbnkgfSB9ICovICh2YWx1ZSkudG9KU09OKSA9PT0gJ2Z1bmN0aW9uJyAmJiAhbm9fdG9qc29uKSB7XG5cdFx0XHRyZXR1cm4gY2xvbmUoXG5cdFx0XHRcdC8qKiBAdHlwZSB7VCAmIHsgdG9KU09OKCk6IGFueSB9IH0gKi8gKHZhbHVlKS50b0pTT04oKSxcblx0XHRcdFx0Y2xvbmVkLFxuXHRcdFx0XHRERVYgPyBgJHtwYXRofS50b0pTT04oKWAgOiBwYXRoLFxuXHRcdFx0XHRwYXRocyxcblx0XHRcdFx0Ly8gQXNzb2NpYXRlIHRoZSBpbnN0YW5jZSB3aXRoIHRoZSB0b0pTT04gY2xvbmVcblx0XHRcdFx0dmFsdWVcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgRXZlbnRUYXJnZXQpIHtcblx0XHQvLyBjYW4ndCBiZSBjbG9uZWRcblx0XHRyZXR1cm4gLyoqIEB0eXBlIHtTbmFwc2hvdDxUPn0gKi8gKHZhbHVlKTtcblx0fVxuXG5cdHRyeSB7XG5cdFx0cmV0dXJuIC8qKiBAdHlwZSB7U25hcHNob3Q8VD59ICovIChzdHJ1Y3R1cmVkQ2xvbmUodmFsdWUpKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGlmIChERVYpIHtcblx0XHRcdHBhdGhzLnB1c2gocGF0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC8qKiBAdHlwZSB7U25hcHNob3Q8VD59ICovICh2YWx1ZSk7XG5cdH1cbn1cbiIsIi8qKiBAaW1wb3J0IHsgRGVyaXZlZCwgUmVhY3Rpb24sIFZhbHVlIH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IFVOSU5JVElBTElaRUQgfSBmcm9tICcuLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgc25hcHNob3QgfSBmcm9tICcuLi8uLi9zaGFyZWQvY2xvbmUuanMnO1xuaW1wb3J0IHsgREVSSVZFRCwgQVNZTkMsIFBST1hZX1BBVEhfU1lNQk9MLCBTVEFURV9TWU1CT0wgfSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5pbXBvcnQgeyBlZmZlY3RfdHJhY2tpbmcgfSBmcm9tICcuLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHsgYWN0aXZlX3JlYWN0aW9uLCB1bnRyYWNrIH0gZnJvbSAnLi4vcnVudGltZS5qcyc7XG5cbi8qKlxuICogQHR5cGVkZWYge3tcbiAqICAgdHJhY2VzOiBFcnJvcltdO1xuICogfX0gVHJhY2VFbnRyeVxuICovXG5cbi8qKiBAdHlwZSB7eyByZWFjdGlvbjogUmVhY3Rpb24gfCBudWxsLCBlbnRyaWVzOiBNYXA8VmFsdWUsIFRyYWNlRW50cnk+IH0gfCBudWxsfSAqL1xuZXhwb3J0IGxldCB0cmFjaW5nX2V4cHJlc3Npb25zID0gbnVsbDtcblxuLyoqXG4gKiBAcGFyYW0ge1ZhbHVlfSBzaWduYWxcbiAqIEBwYXJhbSB7VHJhY2VFbnRyeX0gW2VudHJ5XVxuICovXG5mdW5jdGlvbiBsb2dfZW50cnkoc2lnbmFsLCBlbnRyeSkge1xuXHRjb25zdCB2YWx1ZSA9IHNpZ25hbC52O1xuXG5cdGlmICh2YWx1ZSA9PT0gVU5JTklUSUFMSVpFRCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHR5cGUgPSBnZXRfdHlwZShzaWduYWwpO1xuXHRjb25zdCBjdXJyZW50X3JlYWN0aW9uID0gLyoqIEB0eXBlIHtSZWFjdGlvbn0gKi8gKGFjdGl2ZV9yZWFjdGlvbik7XG5cdGNvbnN0IGRpcnR5ID0gc2lnbmFsLnd2ID4gY3VycmVudF9yZWFjdGlvbi53diB8fCBjdXJyZW50X3JlYWN0aW9uLnd2ID09PSAwO1xuXHRjb25zdCBzdHlsZSA9IGRpcnR5XG5cdFx0PyAnY29sb3I6IENvcm5mbG93ZXJCbHVlOyBmb250LXdlaWdodDogYm9sZCdcblx0XHQ6ICdjb2xvcjogZ3JleTsgZm9udC13ZWlnaHQ6IG5vcm1hbCc7XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcblx0Y29uc29sZS5ncm91cENvbGxhcHNlZChcblx0XHRzaWduYWwubGFiZWwgPyBgJWMke3R5cGV9JWMgJHtzaWduYWwubGFiZWx9YCA6IGAlYyR7dHlwZX0lY2AsXG5cdFx0c3R5bGUsXG5cdFx0ZGlydHkgPyAnZm9udC13ZWlnaHQ6IG5vcm1hbCcgOiBzdHlsZSxcblx0XHR0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIFNUQVRFX1NZTUJPTCBpbiB2YWx1ZVxuXHRcdFx0PyBzbmFwc2hvdCh2YWx1ZSwgdHJ1ZSlcblx0XHRcdDogdmFsdWVcblx0KTtcblxuXHRpZiAodHlwZSA9PT0gJyRkZXJpdmVkJykge1xuXHRcdGNvbnN0IGRlcHMgPSBuZXcgU2V0KC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKHNpZ25hbCkuZGVwcyk7XG5cdFx0Zm9yIChjb25zdCBkZXAgb2YgZGVwcykge1xuXHRcdFx0bG9nX2VudHJ5KGRlcCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNpZ25hbC5jcmVhdGVkKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcblx0XHRjb25zb2xlLmxvZyhzaWduYWwuY3JlYXRlZCk7XG5cdH1cblxuXHRpZiAoZGlydHkgJiYgc2lnbmFsLnVwZGF0ZWQpIHtcblx0XHRmb3IgKGNvbnN0IHVwZGF0ZWQgb2Ygc2lnbmFsLnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRcdGlmICh1cGRhdGVkLmVycm9yKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG5cdFx0XHRcdGNvbnNvbGUubG9nKHVwZGF0ZWQuZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChlbnRyeSkge1xuXHRcdGZvciAodmFyIHRyYWNlIG9mIGVudHJ5LnRyYWNlcykge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcblx0XHRcdGNvbnNvbGUubG9nKHRyYWNlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuXHRjb25zb2xlLmdyb3VwRW5kKCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtWYWx1ZX0gc2lnbmFsXG4gKiBAcmV0dXJucyB7JyRzdGF0ZScgfCAnJGRlcml2ZWQnIHwgJ3N0b3JlJ31cbiAqL1xuZnVuY3Rpb24gZ2V0X3R5cGUoc2lnbmFsKSB7XG5cdGlmICgoc2lnbmFsLmYgJiAoREVSSVZFRCB8IEFTWU5DKSkgIT09IDApIHJldHVybiAnJGRlcml2ZWQnO1xuXHRyZXR1cm4gc2lnbmFsLmxhYmVsPy5zdGFydHNXaXRoKCckJykgPyAnc3RvcmUnIDogJyRzdGF0ZSc7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEBwYXJhbSB7KCkgPT4gc3RyaW5nfSBsYWJlbFxuICogQHBhcmFtIHsoKSA9PiBUfSBmblxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJhY2UobGFiZWwsIGZuKSB7XG5cdHZhciBwcmV2aW91c2x5X3RyYWNpbmdfZXhwcmVzc2lvbnMgPSB0cmFjaW5nX2V4cHJlc3Npb25zO1xuXG5cdHRyeSB7XG5cdFx0dHJhY2luZ19leHByZXNzaW9ucyA9IHsgZW50cmllczogbmV3IE1hcCgpLCByZWFjdGlvbjogYWN0aXZlX3JlYWN0aW9uIH07XG5cblx0XHR2YXIgc3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHR2YXIgdmFsdWUgPSBmbigpO1xuXHRcdHZhciB0aW1lID0gKHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnQpLnRvRml4ZWQoMik7XG5cblx0XHR2YXIgcHJlZml4ID0gdW50cmFjayhsYWJlbCk7XG5cblx0XHRpZiAoIWVmZmVjdF90cmFja2luZygpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuXHRcdFx0Y29uc29sZS5sb2coYCR7cHJlZml4fSAlY3JhbiBvdXRzaWRlIG9mIGFuIGVmZmVjdCAoJHt0aW1lfW1zKWAsICdjb2xvcjogZ3JleScpO1xuXHRcdH0gZWxzZSBpZiAodHJhY2luZ19leHByZXNzaW9ucy5lbnRyaWVzLnNpemUgPT09IDApIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG5cdFx0XHRjb25zb2xlLmxvZyhgJHtwcmVmaXh9ICVjbm8gcmVhY3RpdmUgZGVwZW5kZW5jaWVzICgke3RpbWV9bXMpYCwgJ2NvbG9yOiBncmV5Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG5cdFx0XHRjb25zb2xlLmdyb3VwKGAke3ByZWZpeH0gJWMoJHt0aW1lfW1zKWAsICdjb2xvcjogZ3JleScpO1xuXG5cdFx0XHR2YXIgZW50cmllcyA9IHRyYWNpbmdfZXhwcmVzc2lvbnMuZW50cmllcztcblxuXHRcdFx0dW50cmFjaygoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW3NpZ25hbCwgdHJhY2VzXSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0bG9nX2VudHJ5KHNpZ25hbCwgdHJhY2VzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRyYWNpbmdfZXhwcmVzc2lvbnMgPSBudWxsO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuXHRcdFx0Y29uc29sZS5ncm91cEVuZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB2YWx1ZTtcblx0fSBmaW5hbGx5IHtcblx0XHR0cmFjaW5nX2V4cHJlc3Npb25zID0gcHJldmlvdXNseV90cmFjaW5nX2V4cHJlc3Npb25zO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtWYWx1ZX0gc291cmNlXG4gKiBAcGFyYW0ge3N0cmluZ30gbGFiZWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRhZyhzb3VyY2UsIGxhYmVsKSB7XG5cdHNvdXJjZS5sYWJlbCA9IGxhYmVsO1xuXHR0YWdfcHJveHkoc291cmNlLnYsIGxhYmVsKTtcblxuXHRyZXR1cm4gc291cmNlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7dW5rbm93bn0gdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBsYWJlbFxuICovXG5leHBvcnQgZnVuY3Rpb24gdGFnX3Byb3h5KHZhbHVlLCBsYWJlbCkge1xuXHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdHZhbHVlPy5bUFJPWFlfUEFUSF9TWU1CT0xdPy4obGFiZWwpO1xuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQHBhcmFtIHt1bmtub3dufSB2YWx1ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gbGFiZWwodmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N5bWJvbCcpIHJldHVybiBgU3ltYm9sKCR7dmFsdWUuZGVzY3JpcHRpb259KWA7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHJldHVybiAnPGZ1bmN0aW9uPic7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlKSByZXR1cm4gJzxvYmplY3Q+Jztcblx0cmV0dXJuIFN0cmluZyh2YWx1ZSk7XG59XG4iLCJpbXBvcnQgeyBkZWZpbmVfcHJvcGVydHkgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gbGFiZWxcbiAqIEByZXR1cm5zIHtFcnJvciAmIHsgc3RhY2s6IHN0cmluZyB9IHwgbnVsbH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldF9lcnJvcihsYWJlbCkge1xuXHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuXHRjb25zdCBzdGFjayA9IGdldF9zdGFjaygpO1xuXG5cdGlmIChzdGFjay5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHN0YWNrLnVuc2hpZnQoJ1xcbicpO1xuXG5cdGRlZmluZV9wcm9wZXJ0eShlcnJvciwgJ3N0YWNrJywge1xuXHRcdHZhbHVlOiBzdGFjay5qb2luKCdcXG4nKVxuXHR9KTtcblxuXHRkZWZpbmVfcHJvcGVydHkoZXJyb3IsICduYW1lJywge1xuXHRcdHZhbHVlOiBsYWJlbFxuXHR9KTtcblxuXHRyZXR1cm4gLyoqIEB0eXBlIHtFcnJvciAmIHsgc3RhY2s6IHN0cmluZyB9fSAqLyAoZXJyb3IpO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIHtzdHJpbmdbXX1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldF9zdGFjaygpIHtcblx0Ly8gQHRzLWlnbm9yZSAtIGRvZXNuJ3QgZXhpc3QgZXZlcnl3aGVyZVxuXHRjb25zdCBsaW1pdCA9IEVycm9yLnN0YWNrVHJhY2VMaW1pdDtcblx0Ly8gQHRzLWlnbm9yZSAtIGRvZXNuJ3QgZXhpc3QgZXZlcnl3aGVyZVxuXHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBJbmZpbml0eTtcblx0Y29uc3Qgc3RhY2sgPSBuZXcgRXJyb3IoKS5zdGFjaztcblx0Ly8gQHRzLWlnbm9yZSAtIGRvZXNuJ3QgZXhpc3QgZXZlcnl3aGVyZVxuXHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBsaW1pdDtcblxuXHRpZiAoIXN0YWNrKSByZXR1cm4gW107XG5cblx0Y29uc3QgbGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IG5ld19saW5lcyA9IFtdO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0Y29uc3QgcG9zaXhpZmllZCA9IGxpbmUucmVwbGFjZUFsbCgnXFxcXCcsICcvJyk7XG5cblx0XHRpZiAobGluZS50cmltKCkgPT09ICdFcnJvcicpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lLmluY2x1ZGVzKCd2YWxpZGF0ZV9lYWNoX2tleXMnKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChwb3NpeGlmaWVkLmluY2x1ZGVzKCdzdmVsdGUvc3JjL2ludGVybmFsJykgfHwgcG9zaXhpZmllZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzLy52aXRlJykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdG5ld19saW5lcy5wdXNoKGxpbmUpO1xuXHR9XG5cblx0cmV0dXJuIG5ld19saW5lcztcbn1cbiIsIi8qKiBAaW1wb3J0IHsgQ29tcG9uZW50Q29udGV4dCwgRGV2U3RhY2tFbnRyeSwgRWZmZWN0IH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0ICogYXMgZSBmcm9tICcuL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBhY3RpdmVfZWZmZWN0LCBhY3RpdmVfcmVhY3Rpb24gfSBmcm9tICcuL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgY3JlYXRlX3VzZXJfZWZmZWN0IH0gZnJvbSAnLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHsgYXN5bmNfbW9kZV9mbGFnLCBsZWdhY3lfbW9kZV9mbGFnIH0gZnJvbSAnLi4vZmxhZ3MvaW5kZXguanMnO1xuaW1wb3J0IHsgRklMRU5BTUUgfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQlJBTkNIX0VGRkVDVCwgRUZGRUNUX1JBTiB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcblxuLyoqIEB0eXBlIHtDb21wb25lbnRDb250ZXh0IHwgbnVsbH0gKi9cbmV4cG9ydCBsZXQgY29tcG9uZW50X2NvbnRleHQgPSBudWxsO1xuXG4vKiogQHBhcmFtIHtDb21wb25lbnRDb250ZXh0IHwgbnVsbH0gY29udGV4dCAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9jb21wb25lbnRfY29udGV4dChjb250ZXh0KSB7XG5cdGNvbXBvbmVudF9jb250ZXh0ID0gY29udGV4dDtcbn1cblxuLyoqIEB0eXBlIHtEZXZTdGFja0VudHJ5IHwgbnVsbH0gKi9cbmV4cG9ydCBsZXQgZGV2X3N0YWNrID0gbnVsbDtcblxuLyoqIEBwYXJhbSB7RGV2U3RhY2tFbnRyeSB8IG51bGx9IHN0YWNrICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2Rldl9zdGFjayhzdGFjaykge1xuXHRkZXZfc3RhY2sgPSBzdGFjaztcbn1cblxuLyoqXG4gKiBFeGVjdXRlIGEgY2FsbGJhY2sgd2l0aCBhIG5ldyBkZXYgc3RhY2sgZW50cnlcbiAqIEBwYXJhbSB7KCkgPT4gYW55fSBjYWxsYmFjayAtIEZ1bmN0aW9uIHRvIGV4ZWN1dGVcbiAqIEBwYXJhbSB7RGV2U3RhY2tFbnRyeVsndHlwZSddfSB0eXBlIC0gVHlwZSBvZiBibG9jay9jb21wb25lbnRcbiAqIEBwYXJhbSB7YW55fSBjb21wb25lbnQgLSBDb21wb25lbnQgZnVuY3Rpb25cbiAqIEBwYXJhbSB7bnVtYmVyfSBsaW5lIC0gTGluZSBudW1iZXJcbiAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gbnVtYmVyXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IFthZGRpdGlvbmFsXSAtIEFueSBhZGRpdGlvbmFsIHByb3BlcnRpZXMgdG8gYWRkIHRvIHRoZSBkZXYgc3RhY2sgZW50cnlcbiAqIEByZXR1cm5zIHthbnl9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRfc3ZlbHRlX21ldGEoY2FsbGJhY2ssIHR5cGUsIGNvbXBvbmVudCwgbGluZSwgY29sdW1uLCBhZGRpdGlvbmFsKSB7XG5cdGNvbnN0IHBhcmVudCA9IGRldl9zdGFjaztcblxuXHRkZXZfc3RhY2sgPSB7XG5cdFx0dHlwZSxcblx0XHRmaWxlOiBjb21wb25lbnRbRklMRU5BTUVdLFxuXHRcdGxpbmUsXG5cdFx0Y29sdW1uLFxuXHRcdHBhcmVudCxcblx0XHQuLi5hZGRpdGlvbmFsXG5cdH07XG5cblx0dHJ5IHtcblx0XHRyZXR1cm4gY2FsbGJhY2soKTtcblx0fSBmaW5hbGx5IHtcblx0XHRkZXZfc3RhY2sgPSBwYXJlbnQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgY3VycmVudCBjb21wb25lbnQgZnVuY3Rpb24uIERpZmZlcmVudCBmcm9tIGN1cnJlbnQgY29tcG9uZW50IGNvbnRleHQ6XG4gKiBgYGBodG1sXG4gKiA8IS0tIEFwcC5zdmVsdGUgLS0+XG4gKiA8Rm9vPlxuICogICA8QmFyIC8+IDwhLS0gY29udGV4dCA9PSBGb28uc3ZlbHRlLCBmdW5jdGlvbiA9PSBBcHAuc3ZlbHRlIC0tPlxuICogPC9Gb28+XG4gKiBgYGBcbiAqIEB0eXBlIHtDb21wb25lbnRDb250ZXh0WydmdW5jdGlvbiddfVxuICovXG5leHBvcnQgbGV0IGRldl9jdXJyZW50X2NvbXBvbmVudF9mdW5jdGlvbiA9IG51bGw7XG5cbi8qKiBAcGFyYW0ge0NvbXBvbmVudENvbnRleHRbJ2Z1bmN0aW9uJ119IGZuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2Rldl9jdXJyZW50X2NvbXBvbmVudF9mdW5jdGlvbihmbikge1xuXHRkZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb24gPSBmbjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgYFtnZXQsIHNldF1gIHBhaXIgb2YgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggY29udGV4dCBpbiBhIHR5cGUtc2FmZSB3YXkuXG4gKlxuICogYGdldGAgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiBubyBwYXJlbnQgY29tcG9uZW50IGNhbGxlZCBgc2V0YC5cbiAqXG4gKiBAdGVtcGxhdGUgVFxuICogQHJldHVybnMge1soKSA9PiBULCAoY29udGV4dDogVCkgPT4gVF19XG4gKiBAc2luY2UgNS40MC4wXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb250ZXh0KCkge1xuXHRjb25zdCBrZXkgPSB7fTtcblxuXHRyZXR1cm4gW1xuXHRcdCgpID0+IHtcblx0XHRcdGlmICghaGFzQ29udGV4dChrZXkpKSB7XG5cdFx0XHRcdGUubWlzc2luZ19jb250ZXh0KCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBnZXRDb250ZXh0KGtleSk7XG5cdFx0fSxcblx0XHQoY29udGV4dCkgPT4gc2V0Q29udGV4dChrZXksIGNvbnRleHQpXG5cdF07XG59XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSBjb250ZXh0IHRoYXQgYmVsb25ncyB0byB0aGUgY2xvc2VzdCBwYXJlbnQgY29tcG9uZW50IHdpdGggdGhlIHNwZWNpZmllZCBga2V5YC5cbiAqIE11c3QgYmUgY2FsbGVkIGR1cmluZyBjb21wb25lbnQgaW5pdGlhbGlzYXRpb24uXG4gKlxuICogW2BjcmVhdGVDb250ZXh0YF0oaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlL3N2ZWx0ZSNjcmVhdGVDb250ZXh0KSBpcyBhIHR5cGUtc2FmZSBhbHRlcm5hdGl2ZS5cbiAqXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHthbnl9IGtleVxuICogQHJldHVybnMge1R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250ZXh0KGtleSkge1xuXHRjb25zdCBjb250ZXh0X21hcCA9IGdldF9vcl9pbml0X2NvbnRleHRfbWFwKCdnZXRDb250ZXh0Jyk7XG5cdGNvbnN0IHJlc3VsdCA9IC8qKiBAdHlwZSB7VH0gKi8gKGNvbnRleHRfbWFwLmdldChrZXkpKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBBc3NvY2lhdGVzIGFuIGFyYml0cmFyeSBgY29udGV4dGAgb2JqZWN0IHdpdGggdGhlIGN1cnJlbnQgY29tcG9uZW50IGFuZCB0aGUgc3BlY2lmaWVkIGBrZXlgXG4gKiBhbmQgcmV0dXJucyB0aGF0IG9iamVjdC4gVGhlIGNvbnRleHQgaXMgdGhlbiBhdmFpbGFibGUgdG8gY2hpbGRyZW4gb2YgdGhlIGNvbXBvbmVudFxuICogKGluY2x1ZGluZyBzbG90dGVkIGNvbnRlbnQpIHdpdGggYGdldENvbnRleHRgLlxuICpcbiAqIExpa2UgbGlmZWN5Y2xlIGZ1bmN0aW9ucywgdGhpcyBtdXN0IGJlIGNhbGxlZCBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uLlxuICpcbiAqIFtgY3JlYXRlQ29udGV4dGBdKGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS9zdmVsdGUjY3JlYXRlQ29udGV4dCkgaXMgYSB0eXBlLXNhZmUgYWx0ZXJuYXRpdmUuXG4gKlxuICogQHRlbXBsYXRlIFRcbiAqIEBwYXJhbSB7YW55fSBrZXlcbiAqIEBwYXJhbSB7VH0gY29udGV4dFxuICogQHJldHVybnMge1R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250ZXh0KGtleSwgY29udGV4dCkge1xuXHRjb25zdCBjb250ZXh0X21hcCA9IGdldF9vcl9pbml0X2NvbnRleHRfbWFwKCdzZXRDb250ZXh0Jyk7XG5cblx0aWYgKGFzeW5jX21vZGVfZmxhZykge1xuXHRcdHZhciBmbGFncyA9IC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCkuZjtcblx0XHR2YXIgdmFsaWQgPVxuXHRcdFx0IWFjdGl2ZV9yZWFjdGlvbiAmJlxuXHRcdFx0KGZsYWdzICYgQlJBTkNIX0VGRkVDVCkgIT09IDAgJiZcblx0XHRcdC8vIHBvcCgpIHJ1bnMgc3luY2hyb25vdXNseSwgc28gdGhpcyBpbmRpY2F0ZXMgd2UncmUgc2V0dGluZyBjb250ZXh0IGFmdGVyIGFuIGF3YWl0XG5cdFx0XHQhKC8qKiBAdHlwZSB7Q29tcG9uZW50Q29udGV4dH0gKi8gKGNvbXBvbmVudF9jb250ZXh0KS5pKTtcblxuXHRcdGlmICghdmFsaWQpIHtcblx0XHRcdGUuc2V0X2NvbnRleHRfYWZ0ZXJfaW5pdCgpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnRleHRfbWFwLnNldChrZXksIGNvbnRleHQpO1xuXHRyZXR1cm4gY29udGV4dDtcbn1cblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBhIGdpdmVuIGBrZXlgIGhhcyBiZWVuIHNldCBpbiB0aGUgY29udGV4dCBvZiBhIHBhcmVudCBjb21wb25lbnQuXG4gKiBNdXN0IGJlIGNhbGxlZCBkdXJpbmcgY29tcG9uZW50IGluaXRpYWxpc2F0aW9uLlxuICpcbiAqIEBwYXJhbSB7YW55fSBrZXlcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzQ29udGV4dChrZXkpIHtcblx0Y29uc3QgY29udGV4dF9tYXAgPSBnZXRfb3JfaW5pdF9jb250ZXh0X21hcCgnaGFzQ29udGV4dCcpO1xuXHRyZXR1cm4gY29udGV4dF9tYXAuaGFzKGtleSk7XG59XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSB3aG9sZSBjb250ZXh0IG1hcCB0aGF0IGJlbG9uZ3MgdG8gdGhlIGNsb3Nlc3QgcGFyZW50IGNvbXBvbmVudC5cbiAqIE11c3QgYmUgY2FsbGVkIGR1cmluZyBjb21wb25lbnQgaW5pdGlhbGlzYXRpb24uIFVzZWZ1bCwgZm9yIGV4YW1wbGUsIGlmIHlvdVxuICogcHJvZ3JhbW1hdGljYWxseSBjcmVhdGUgYSBjb21wb25lbnQgYW5kIHdhbnQgdG8gcGFzcyB0aGUgZXhpc3RpbmcgY29udGV4dCB0byBpdC5cbiAqXG4gKiBAdGVtcGxhdGUge01hcDxhbnksIGFueT59IFtUPU1hcDxhbnksIGFueT5dXG4gKiBAcmV0dXJucyB7VH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFsbENvbnRleHRzKCkge1xuXHRjb25zdCBjb250ZXh0X21hcCA9IGdldF9vcl9pbml0X2NvbnRleHRfbWFwKCdnZXRBbGxDb250ZXh0cycpO1xuXHRyZXR1cm4gLyoqIEB0eXBlIHtUfSAqLyAoY29udGV4dF9tYXApO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7UmVjb3JkPHN0cmluZywgdW5rbm93bj59IHByb3BzXG4gKiBAcGFyYW0ge2FueX0gcnVuZXNcbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtmbl1cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcHVzaChwcm9wcywgcnVuZXMgPSBmYWxzZSwgZm4pIHtcblx0Y29tcG9uZW50X2NvbnRleHQgPSB7XG5cdFx0cDogY29tcG9uZW50X2NvbnRleHQsXG5cdFx0aTogZmFsc2UsXG5cdFx0YzogbnVsbCxcblx0XHRlOiBudWxsLFxuXHRcdHM6IHByb3BzLFxuXHRcdHg6IG51bGwsXG5cdFx0bDogbGVnYWN5X21vZGVfZmxhZyAmJiAhcnVuZXMgPyB7IHM6IG51bGwsIHU6IG51bGwsICQ6IFtdIH0gOiBudWxsXG5cdH07XG5cblx0aWYgKERFVikge1xuXHRcdC8vIGNvbXBvbmVudCBmdW5jdGlvblxuXHRcdGNvbXBvbmVudF9jb250ZXh0LmZ1bmN0aW9uID0gZm47XG5cdFx0ZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uID0gZm47XG5cdH1cbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUge1JlY29yZDxzdHJpbmcsIGFueT59IFRcbiAqIEBwYXJhbSB7VH0gW2NvbXBvbmVudF1cbiAqIEByZXR1cm5zIHtUfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9wKGNvbXBvbmVudCkge1xuXHR2YXIgY29udGV4dCA9IC8qKiBAdHlwZSB7Q29tcG9uZW50Q29udGV4dH0gKi8gKGNvbXBvbmVudF9jb250ZXh0KTtcblx0dmFyIGVmZmVjdHMgPSBjb250ZXh0LmU7XG5cblx0aWYgKGVmZmVjdHMgIT09IG51bGwpIHtcblx0XHRjb250ZXh0LmUgPSBudWxsO1xuXG5cdFx0Zm9yICh2YXIgZm4gb2YgZWZmZWN0cykge1xuXHRcdFx0Y3JlYXRlX3VzZXJfZWZmZWN0KGZuKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoY29tcG9uZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb250ZXh0LnggPSBjb21wb25lbnQ7XG5cdH1cblxuXHRjb250ZXh0LmkgPSB0cnVlO1xuXG5cdGNvbXBvbmVudF9jb250ZXh0ID0gY29udGV4dC5wO1xuXG5cdGlmIChERVYpIHtcblx0XHRkZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb24gPSBjb21wb25lbnRfY29udGV4dD8uZnVuY3Rpb24gPz8gbnVsbDtcblx0fVxuXG5cdHJldHVybiBjb21wb25lbnQgPz8gLyoqIEB0eXBlIHtUfSAqLyAoe30pO1xufVxuXG4vKiogQHJldHVybnMge2Jvb2xlYW59ICovXG5leHBvcnQgZnVuY3Rpb24gaXNfcnVuZXMoKSB7XG5cdHJldHVybiAhbGVnYWN5X21vZGVfZmxhZyB8fCAoY29tcG9uZW50X2NvbnRleHQgIT09IG51bGwgJiYgY29tcG9uZW50X2NvbnRleHQubCA9PT0gbnVsbCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqIEByZXR1cm5zIHtNYXA8dW5rbm93biwgdW5rbm93bj59XG4gKi9cbmZ1bmN0aW9uIGdldF9vcl9pbml0X2NvbnRleHRfbWFwKG5hbWUpIHtcblx0aWYgKGNvbXBvbmVudF9jb250ZXh0ID09PSBudWxsKSB7XG5cdFx0ZS5saWZlY3ljbGVfb3V0c2lkZV9jb21wb25lbnQobmFtZSk7XG5cdH1cblxuXHRyZXR1cm4gKGNvbXBvbmVudF9jb250ZXh0LmMgPz89IG5ldyBNYXAoZ2V0X3BhcmVudF9jb250ZXh0KGNvbXBvbmVudF9jb250ZXh0KSB8fCB1bmRlZmluZWQpKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0NvbXBvbmVudENvbnRleHR9IGNvbXBvbmVudF9jb250ZXh0XG4gKiBAcmV0dXJucyB7TWFwPHVua25vd24sIHVua25vd24+IHwgbnVsbH1cbiAqL1xuZnVuY3Rpb24gZ2V0X3BhcmVudF9jb250ZXh0KGNvbXBvbmVudF9jb250ZXh0KSB7XG5cdGxldCBwYXJlbnQgPSBjb21wb25lbnRfY29udGV4dC5wO1xuXHR3aGlsZSAocGFyZW50ICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgY29udGV4dF9tYXAgPSBwYXJlbnQuYztcblx0XHRpZiAoY29udGV4dF9tYXAgIT09IG51bGwpIHtcblx0XHRcdHJldHVybiBjb250ZXh0X21hcDtcblx0XHR9XG5cdFx0cGFyZW50ID0gcGFyZW50LnA7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG4iLCJpbXBvcnQgeyBydW5fYWxsIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzX2ZsdXNoaW5nX3N5bmMgfSBmcm9tICcuLi9yZWFjdGl2aXR5L2JhdGNoLmpzJztcblxuLyoqIEB0eXBlIHtBcnJheTwoKSA9PiB2b2lkPn0gKi9cbmxldCBtaWNyb190YXNrcyA9IFtdO1xuXG5mdW5jdGlvbiBydW5fbWljcm9fdGFza3MoKSB7XG5cdHZhciB0YXNrcyA9IG1pY3JvX3Rhc2tzO1xuXHRtaWNyb190YXNrcyA9IFtdO1xuXHRydW5fYWxsKHRhc2tzKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygpID0+IHZvaWR9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWV1ZV9taWNyb190YXNrKGZuKSB7XG5cdGlmIChtaWNyb190YXNrcy5sZW5ndGggPT09IDAgJiYgIWlzX2ZsdXNoaW5nX3N5bmMpIHtcblx0XHR2YXIgdGFza3MgPSBtaWNyb190YXNrcztcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHQvLyBJZiB0aGlzIGlzIGZhbHNlLCBhIGZsdXNoU3luYyBoYXBwZW5lZCBpbiB0aGUgbWVhbnRpbWUuIERvIF9ub3RfIHJ1biBuZXcgc2NoZWR1bGVkIG1pY3JvdGFza3MgaW4gdGhhdCBjYXNlXG5cdFx0XHQvLyBhcyB0aGUgb3JkZXJpbmcgb2YgbWljcm90YXNrcyB3b3VsZCBiZSBicm9rZW4gYXQgdGhhdCBwb2ludCAtIGNvbnNpZGVyIHRoaXMgY2FzZTpcblx0XHRcdC8vIC0gcXVldWVfbWljcm9fdGFzayBzY2hlZHVsZXMgbWljcm90YXNrIEEgdG8gZmx1c2ggdGFzayBYXG5cdFx0XHQvLyAtIHN5bmNocm9ub3VzbHkgYWZ0ZXIsIGZsdXNoU3luYyBydW5zLCBwcm9jZXNzaW5nIHRhc2sgWFxuXHRcdFx0Ly8gLSBzeW5jaHJvbm91c2x5IGFmdGVyLCBzb21lIG90aGVyIG1pY3JvdGFzayBCIGlzIHNjaGVkdWxlZCwgYnV0IG5vdCB0aHJvdWdoIHF1ZXVlX21pY3JvX3Rhc2sgYnV0IGZvciBleGFtcGxlIGEgUHJvbWlzZS5yZXNvbHZlKCkgaW4gdXNlciBjb2RlXG5cdFx0XHQvLyAtIHN5bmNocm9ub3VzbHkgYWZ0ZXIsIHF1ZXVlX21pY3JvX3Rhc2sgc2NoZWR1bGVzIG1pY3JvdGFzayBDIHRvIGZsdXNoIHRhc2sgWVxuXHRcdFx0Ly8gLSBvbmUgdGljayBsYXRlciwgbWljcm90YXNrIEEgbm93IHJlc29sdmVzLCBmbHVzaGluZyB0YXNrIFkgYmVmb3JlIG1pY3JvdGFzayBCLCB3aGljaCBpcyBpbmNvcnJlY3Rcblx0XHRcdC8vIFRoaXMgaWYgY2hlY2sgcHJldmVudHMgdGhhdCByYWNlIGNvbmRpdGlvbiAodGhhdCByZWFsaXN0aWNhbGx5IHdpbGwgb25seSBoYXBwZW4gaW4gdGVzdHMpXG5cdFx0XHRpZiAodGFza3MgPT09IG1pY3JvX3Rhc2tzKSBydW5fbWljcm9fdGFza3MoKTtcblx0XHR9KTtcblx0fVxuXG5cdG1pY3JvX3Rhc2tzLnB1c2goZm4pO1xufVxuXG4vKipcbiAqIFN5bmNocm9ub3VzbHkgcnVuIGFueSBxdWV1ZWQgdGFza3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmbHVzaF90YXNrcygpIHtcblx0d2hpbGUgKG1pY3JvX3Rhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRydW5fbWljcm9fdGFza3MoKTtcblx0fVxufVxuIiwiLyoqIEBpbXBvcnQgeyBEZXJpdmVkLCBFZmZlY3QgfSBmcm9tICcjY2xpZW50JyAqL1xuLyoqIEBpbXBvcnQgeyBCb3VuZGFyeSB9IGZyb20gJy4vZG9tL2Jsb2Nrcy9ib3VuZGFyeS5qcycgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0IHsgRklMRU5BTUUgfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNfZmlyZWZveCB9IGZyb20gJy4vZG9tL29wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgRVJST1JfVkFMVUUsIEJPVU5EQVJZX0VGRkVDVCwgRUZGRUNUX1JBTiB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGRlZmluZV9wcm9wZXJ0eSwgZ2V0X2Rlc2NyaXB0b3IgfSBmcm9tICcuLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHsgYWN0aXZlX2VmZmVjdCwgYWN0aXZlX3JlYWN0aW9uIH0gZnJvbSAnLi9ydW50aW1lLmpzJztcblxuY29uc3QgYWRqdXN0bWVudHMgPSBuZXcgV2Vha01hcCgpO1xuXG4vKipcbiAqIEBwYXJhbSB7dW5rbm93bn0gZXJyb3JcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZV9lcnJvcihlcnJvcikge1xuXHR2YXIgZWZmZWN0ID0gYWN0aXZlX2VmZmVjdDtcblxuXHQvLyBmb3IgdW5vd25lZCBkZXJpdmVkcywgZG9uJ3QgdGhyb3cgdW50aWwgd2UgcmVhZCB0aGUgdmFsdWVcblx0aWYgKGVmZmVjdCA9PT0gbnVsbCkge1xuXHRcdC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGFjdGl2ZV9yZWFjdGlvbikuZiB8PSBFUlJPUl9WQUxVRTtcblx0XHRyZXR1cm4gZXJyb3I7XG5cdH1cblxuXHRpZiAoREVWICYmIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgIWFkanVzdG1lbnRzLmhhcyhlcnJvcikpIHtcblx0XHRhZGp1c3RtZW50cy5zZXQoZXJyb3IsIGdldF9hZGp1c3RtZW50cyhlcnJvciwgZWZmZWN0KSk7XG5cdH1cblxuXHRpZiAoKGVmZmVjdC5mICYgRUZGRUNUX1JBTikgPT09IDApIHtcblx0XHQvLyBpZiB0aGUgZXJyb3Igb2NjdXJyZWQgd2hpbGUgY3JlYXRpbmcgdGhpcyBzdWJ0cmVlLCB3ZSBsZXQgaXRcblx0XHQvLyBidWJibGUgdXAgdW50aWwgaXQgaGl0cyBhIGJvdW5kYXJ5IHRoYXQgY2FuIGhhbmRsZSBpdFxuXHRcdGlmICgoZWZmZWN0LmYgJiBCT1VOREFSWV9FRkZFQ1QpID09PSAwKSB7XG5cdFx0XHRpZiAoREVWICYmICFlZmZlY3QucGFyZW50ICYmIGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0YXBwbHlfYWRqdXN0bWVudHMoZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHQvKiogQHR5cGUge0JvdW5kYXJ5fSAqLyAoZWZmZWN0LmIpLmVycm9yKGVycm9yKTtcblx0fSBlbHNlIHtcblx0XHQvLyBvdGhlcndpc2Ugd2UgYnViYmxlIHVwIHRoZSBlZmZlY3QgdHJlZSBvdXJzZWx2ZXNcblx0XHRpbnZva2VfZXJyb3JfYm91bmRhcnkoZXJyb3IsIGVmZmVjdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge3Vua25vd259IGVycm9yXG4gKiBAcGFyYW0ge0VmZmVjdCB8IG51bGx9IGVmZmVjdFxuICovXG5leHBvcnQgZnVuY3Rpb24gaW52b2tlX2Vycm9yX2JvdW5kYXJ5KGVycm9yLCBlZmZlY3QpIHtcblx0d2hpbGUgKGVmZmVjdCAhPT0gbnVsbCkge1xuXHRcdGlmICgoZWZmZWN0LmYgJiBCT1VOREFSWV9FRkZFQ1QpICE9PSAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvKiogQHR5cGUge0JvdW5kYXJ5fSAqLyAoZWZmZWN0LmIpLmVycm9yKGVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWZmZWN0ID0gZWZmZWN0LnBhcmVudDtcblx0fVxuXG5cdGlmIChERVYgJiYgZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdGFwcGx5X2FkanVzdG1lbnRzKGVycm9yKTtcblx0fVxuXG5cdHRocm93IGVycm9yO1xufVxuXG4vKipcbiAqIEFkZCB1c2VmdWwgaW5mb3JtYXRpb24gdG8gdGhlIGVycm9yIG1lc3NhZ2Uvc3RhY2sgaW4gZGV2ZWxvcG1lbnRcbiAqIEBwYXJhbSB7RXJyb3J9IGVycm9yXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKi9cbmZ1bmN0aW9uIGdldF9hZGp1c3RtZW50cyhlcnJvciwgZWZmZWN0KSB7XG5cdGNvbnN0IG1lc3NhZ2VfZGVzY3JpcHRvciA9IGdldF9kZXNjcmlwdG9yKGVycm9yLCAnbWVzc2FnZScpO1xuXG5cdC8vIGlmIHRoZSBtZXNzYWdlIHdhcyBhbHJlYWR5IGNoYW5nZWQgYW5kIGl0J3Mgbm90IGNvbmZpZ3VyYWJsZSB3ZSBjYW4ndCBjaGFuZ2UgaXRcblx0Ly8gb3IgaXQgd2lsbCB0aHJvdyBhIGRpZmZlcmVudCBlcnJvciBzd2FsbG93aW5nIHRoZSBvcmlnaW5hbCBlcnJvclxuXHRpZiAobWVzc2FnZV9kZXNjcmlwdG9yICYmICFtZXNzYWdlX2Rlc2NyaXB0b3IuY29uZmlndXJhYmxlKSByZXR1cm47XG5cblx0dmFyIGluZGVudCA9IGlzX2ZpcmVmb3ggPyAnICAnIDogJ1xcdCc7XG5cdHZhciBjb21wb25lbnRfc3RhY2sgPSBgXFxuJHtpbmRlbnR9aW4gJHtlZmZlY3QuZm4/Lm5hbWUgfHwgJzx1bmtub3duPid9YDtcblx0dmFyIGNvbnRleHQgPSBlZmZlY3QuY3R4O1xuXG5cdHdoaWxlIChjb250ZXh0ICE9PSBudWxsKSB7XG5cdFx0Y29tcG9uZW50X3N0YWNrICs9IGBcXG4ke2luZGVudH1pbiAke2NvbnRleHQuZnVuY3Rpb24/LltGSUxFTkFNRV0uc3BsaXQoJy8nKS5wb3AoKX1gO1xuXHRcdGNvbnRleHQgPSBjb250ZXh0LnA7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgKyBgXFxuJHtjb21wb25lbnRfc3RhY2t9XFxuYCxcblx0XHRzdGFjazogZXJyb3Iuc3RhY2tcblx0XHRcdD8uc3BsaXQoJ1xcbicpXG5cdFx0XHQuZmlsdGVyKChsaW5lKSA9PiAhbGluZS5pbmNsdWRlcygnc3ZlbHRlL3NyYy9pbnRlcm5hbCcpKVxuXHRcdFx0LmpvaW4oJ1xcbicpXG5cdH07XG59XG5cbi8qKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyb3JcbiAqL1xuZnVuY3Rpb24gYXBwbHlfYWRqdXN0bWVudHMoZXJyb3IpIHtcblx0Y29uc3QgYWRqdXN0ZWQgPSBhZGp1c3RtZW50cy5nZXQoZXJyb3IpO1xuXG5cdGlmIChhZGp1c3RlZCkge1xuXHRcdGRlZmluZV9wcm9wZXJ0eShlcnJvciwgJ21lc3NhZ2UnLCB7XG5cdFx0XHR2YWx1ZTogYWRqdXN0ZWQubWVzc2FnZVxuXHRcdH0pO1xuXG5cdFx0ZGVmaW5lX3Byb3BlcnR5KGVycm9yLCAnc3RhY2snLCB7XG5cdFx0XHR2YWx1ZTogYWRqdXN0ZWQuc3RhY2tcblx0XHR9KTtcblx0fVxufVxuIiwiLyoqIEBpbXBvcnQgeyBGb3JrIH0gZnJvbSAnc3ZlbHRlJyAqL1xuLyoqIEBpbXBvcnQgeyBEZXJpdmVkLCBFZmZlY3QsIFJlYWN0aW9uLCBTb3VyY2UsIFZhbHVlIH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7XG5cdEJMT0NLX0VGRkVDVCxcblx0QlJBTkNIX0VGRkVDVCxcblx0Q0xFQU4sXG5cdERFU1RST1lFRCxcblx0RElSVFksXG5cdEVGRkVDVCxcblx0QVNZTkMsXG5cdElORVJULFxuXHRSRU5ERVJfRUZGRUNULFxuXHRST09UX0VGRkVDVCxcblx0TUFZQkVfRElSVFksXG5cdERFUklWRUQsXG5cdEJPVU5EQVJZX0VGRkVDVCxcblx0RUFHRVJfRUZGRUNULFxuXHRIRUFEX0VGRkVDVCxcblx0RVJST1JfVkFMVUUsXG5cdFdBU19NQVJLRUQsXG5cdE1BTkFHRURfRUZGRUNUXG59IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7IGFzeW5jX21vZGVfZmxhZyB9IGZyb20gJy4uLy4uL2ZsYWdzL2luZGV4LmpzJztcbmltcG9ydCB7IGRlZmVycmVkLCBkZWZpbmVfcHJvcGVydHkgfSBmcm9tICcuLi8uLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0YWN0aXZlX2VmZmVjdCxcblx0Z2V0LFxuXHRpc19kaXJ0eSxcblx0aXNfdXBkYXRpbmdfZWZmZWN0LFxuXHRzZXRfaXNfdXBkYXRpbmdfZWZmZWN0LFxuXHRzZXRfc2lnbmFsX3N0YXR1cyxcblx0dXBkYXRlX2VmZmVjdFxufSBmcm9tICcuLi9ydW50aW1lLmpzJztcbmltcG9ydCAqIGFzIGUgZnJvbSAnLi4vZXJyb3JzLmpzJztcbmltcG9ydCB7IGZsdXNoX3Rhc2tzLCBxdWV1ZV9taWNyb190YXNrIH0gZnJvbSAnLi4vZG9tL3Rhc2suanMnO1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQgeyBpbnZva2VfZXJyb3JfYm91bmRhcnkgfSBmcm9tICcuLi9lcnJvci1oYW5kbGluZy5qcyc7XG5pbXBvcnQgeyBmbHVzaF9lYWdlcl9lZmZlY3RzLCBvbGRfdmFsdWVzLCBzZXRfZWFnZXJfZWZmZWN0cywgc291cmNlLCB1cGRhdGUgfSBmcm9tICcuL3NvdXJjZXMuanMnO1xuaW1wb3J0IHsgZWFnZXJfZWZmZWN0LCB1bmxpbmtfZWZmZWN0IH0gZnJvbSAnLi9lZmZlY3RzLmpzJztcblxuLyoqXG4gKiBAdHlwZWRlZiB7e1xuICogICBwYXJlbnQ6IEVmZmVjdFRhcmdldCB8IG51bGw7XG4gKiAgIGVmZmVjdDogRWZmZWN0IHwgbnVsbDtcbiAqICAgZWZmZWN0czogRWZmZWN0W107XG4gKiAgIHJlbmRlcl9lZmZlY3RzOiBFZmZlY3RbXTtcbiAqICAgYmxvY2tfZWZmZWN0czogRWZmZWN0W107XG4gKiB9fSBFZmZlY3RUYXJnZXRcbiAqL1xuXG4vKiogQHR5cGUge1NldDxCYXRjaD59ICovXG5jb25zdCBiYXRjaGVzID0gbmV3IFNldCgpO1xuXG4vKiogQHR5cGUge0JhdGNoIHwgbnVsbH0gKi9cbmV4cG9ydCBsZXQgY3VycmVudF9iYXRjaCA9IG51bGw7XG5cbi8qKlxuICogVGhpcyBpcyBuZWVkZWQgdG8gYXZvaWQgb3ZlcndyaXRpbmcgaW5wdXRzIGluIG5vbi1hc3luYyBtb2RlXG4gKiBUT0RPIDYuMCByZW1vdmUgdGhpcywgYXMgbm9uLWFzeW5jIG1vZGUgd2lsbCBnbyBhd2F5XG4gKiBAdHlwZSB7QmF0Y2ggfCBudWxsfVxuICovXG5leHBvcnQgbGV0IHByZXZpb3VzX2JhdGNoID0gbnVsbDtcblxuLyoqXG4gKiBXaGVuIHRpbWUgdHJhdmVsbGluZyAoaS5lLiB3b3JraW5nIGluIG9uZSBiYXRjaCwgd2hpbGUgb3RoZXIgYmF0Y2hlc1xuICogc3RpbGwgaGF2ZSBvbmdvaW5nIHdvcmspLCB3ZSBpZ25vcmUgdGhlIHJlYWwgdmFsdWVzIG9mIGFmZmVjdGVkXG4gKiBzaWduYWxzIGluIGZhdm91ciBvZiB0aGVpciB2YWx1ZXMgd2l0aGluIHRoZSBiYXRjaFxuICogQHR5cGUge01hcDxWYWx1ZSwgYW55PiB8IG51bGx9XG4gKi9cbmV4cG9ydCBsZXQgYmF0Y2hfdmFsdWVzID0gbnVsbDtcblxuLy8gVE9ETyB0aGlzIHNob3VsZCByZWFsbHkgYmUgYSBwcm9wZXJ0eSBvZiBgYmF0Y2hgXG4vKiogQHR5cGUge0VmZmVjdFtdfSAqL1xubGV0IHF1ZXVlZF9yb290X2VmZmVjdHMgPSBbXTtcblxuLyoqIEB0eXBlIHtFZmZlY3QgfCBudWxsfSAqL1xubGV0IGxhc3Rfc2NoZWR1bGVkX2VmZmVjdCA9IG51bGw7XG5cbmxldCBpc19mbHVzaGluZyA9IGZhbHNlO1xuZXhwb3J0IGxldCBpc19mbHVzaGluZ19zeW5jID0gZmFsc2U7XG5cbmV4cG9ydCBjbGFzcyBCYXRjaCB7XG5cdGNvbW1pdHRlZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudCB2YWx1ZXMgb2YgYW55IHNvdXJjZXMgdGhhdCBhcmUgdXBkYXRlZCBpbiB0aGlzIGJhdGNoXG5cdCAqIFRoZXkga2V5cyBvZiB0aGlzIG1hcCBhcmUgaWRlbnRpY2FsIHRvIGB0aGlzLiNwcmV2aW91c2Bcblx0ICogQHR5cGUge01hcDxTb3VyY2UsIGFueT59XG5cdCAqL1xuXHRjdXJyZW50ID0gbmV3IE1hcCgpO1xuXG5cdC8qKlxuXHQgKiBUaGUgdmFsdWVzIG9mIGFueSBzb3VyY2VzIHRoYXQgYXJlIHVwZGF0ZWQgaW4gdGhpcyBiYXRjaCBfYmVmb3JlXyB0aG9zZSB1cGRhdGVzIHRvb2sgcGxhY2UuXG5cdCAqIFRoZXkga2V5cyBvZiB0aGlzIG1hcCBhcmUgaWRlbnRpY2FsIHRvIGB0aGlzLiNjdXJyZW50YFxuXHQgKiBAdHlwZSB7TWFwPFNvdXJjZSwgYW55Pn1cblx0ICovXG5cdHByZXZpb3VzID0gbmV3IE1hcCgpO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRoZSBiYXRjaCBpcyBjb21taXR0ZWQgKGFuZCB0aGUgRE9NIGlzIHVwZGF0ZWQpLCB3ZSBuZWVkIHRvIHJlbW92ZSBvbGQgYnJhbmNoZXNcblx0ICogYW5kIGFwcGVuZCBuZXcgb25lcyBieSBjYWxsaW5nIHRoZSBmdW5jdGlvbnMgYWRkZWQgaW5zaWRlIChpZi9lYWNoL2tleS9ldGMpIGJsb2Nrc1xuXHQgKiBAdHlwZSB7U2V0PCgpID0+IHZvaWQ+fVxuXHQgKi9cblx0I2NvbW1pdF9jYWxsYmFja3MgPSBuZXcgU2V0KCk7XG5cblx0LyoqXG5cdCAqIElmIGEgZm9yayBpcyBkaXNjYXJkZWQsIHdlIG5lZWQgdG8gZGVzdHJveSBhbnkgZWZmZWN0cyB0aGF0IGFyZSBubyBsb25nZXIgbmVlZGVkXG5cdCAqIEB0eXBlIHtTZXQ8KGJhdGNoOiBCYXRjaCkgPT4gdm9pZD59XG5cdCAqL1xuXHQjZGlzY2FyZF9jYWxsYmFja3MgPSBuZXcgU2V0KCk7XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgYXN5bmMgZWZmZWN0cyB0aGF0IGFyZSBjdXJyZW50bHkgaW4gZmxpZ2h0XG5cdCAqL1xuXHQjcGVuZGluZyA9IDA7XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgYXN5bmMgZWZmZWN0cyB0aGF0IGFyZSBjdXJyZW50bHkgaW4gZmxpZ2h0LCBfbm90XyBpbnNpZGUgYSBwZW5kaW5nIGJvdW5kYXJ5XG5cdCAqL1xuXHQjYmxvY2tpbmdfcGVuZGluZyA9IDA7XG5cblx0LyoqXG5cdCAqIEEgZGVmZXJyZWQgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBiYXRjaCBpcyBjb21taXR0ZWQsIHVzZWQgd2l0aCBgc2V0dGxlZCgpYFxuXHQgKiBUT0RPIHJlcGxhY2Ugd2l0aCBQcm9taXNlLndpdGhSZXNvbHZlcnMgb25jZSBzdXBwb3J0ZWQgd2lkZWx5IGVub3VnaFxuXHQgKiBAdHlwZSB7eyBwcm9taXNlOiBQcm9taXNlPHZvaWQ+LCByZXNvbHZlOiAodmFsdWU/OiBhbnkpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbjogdW5rbm93bikgPT4gdm9pZCB9IHwgbnVsbH1cblx0ICovXG5cdCNkZWZlcnJlZCA9IG51bGw7XG5cblx0LyoqXG5cdCAqIERlZmVycmVkIGVmZmVjdHMgKHdoaWNoIHJ1biBhZnRlciBhc3luYyB3b3JrIGhhcyBjb21wbGV0ZWQpIHRoYXQgYXJlIERJUlRZXG5cdCAqIEB0eXBlIHtFZmZlY3RbXX1cblx0ICovXG5cdCNkaXJ0eV9lZmZlY3RzID0gW107XG5cblx0LyoqXG5cdCAqIERlZmVycmVkIGVmZmVjdHMgdGhhdCBhcmUgTUFZQkVfRElSVFlcblx0ICogQHR5cGUge0VmZmVjdFtdfVxuXHQgKi9cblx0I21heWJlX2RpcnR5X2VmZmVjdHMgPSBbXTtcblxuXHQvKipcblx0ICogQSBzZXQgb2YgYnJhbmNoZXMgdGhhdCBzdGlsbCBleGlzdCwgYnV0IHdpbGwgYmUgZGVzdHJveWVkIHdoZW4gdGhpcyBiYXRjaFxuXHQgKiBpcyBjb21taXR0ZWQg4oCUIHdlIHNraXAgb3ZlciB0aGVzZSBkdXJpbmcgYHByb2Nlc3NgXG5cdCAqIEB0eXBlIHtTZXQ8RWZmZWN0Pn1cblx0ICovXG5cdHNraXBwZWRfZWZmZWN0cyA9IG5ldyBTZXQoKTtcblxuXHRpc19mb3JrID0gZmFsc2U7XG5cblx0aXNfZGVmZXJyZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXNfZm9yayB8fCB0aGlzLiNibG9ja2luZ19wZW5kaW5nID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBAcGFyYW0ge0VmZmVjdFtdfSByb290X2VmZmVjdHNcblx0ICovXG5cdHByb2Nlc3Mocm9vdF9lZmZlY3RzKSB7XG5cdFx0cXVldWVkX3Jvb3RfZWZmZWN0cyA9IFtdO1xuXG5cdFx0cHJldmlvdXNfYmF0Y2ggPSBudWxsO1xuXG5cdFx0dGhpcy5hcHBseSgpO1xuXG5cdFx0LyoqIEB0eXBlIHtFZmZlY3RUYXJnZXR9ICovXG5cdFx0dmFyIHRhcmdldCA9IHtcblx0XHRcdHBhcmVudDogbnVsbCxcblx0XHRcdGVmZmVjdDogbnVsbCxcblx0XHRcdGVmZmVjdHM6IFtdLFxuXHRcdFx0cmVuZGVyX2VmZmVjdHM6IFtdLFxuXHRcdFx0YmxvY2tfZWZmZWN0czogW11cblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCByb290IG9mIHJvb3RfZWZmZWN0cykge1xuXHRcdFx0dGhpcy4jdHJhdmVyc2VfZWZmZWN0X3RyZWUocm9vdCwgdGFyZ2V0KTtcblx0XHRcdC8vIE5vdGU6ICN0cmF2ZXJzZV9lZmZlY3RfdHJlZSBydW5zIGJsb2NrIGVmZmVjdHMgZWFnZXJseSwgd2hpY2ggY2FuIHNjaGVkdWxlIGVmZmVjdHMsXG5cdFx0XHQvLyB3aGljaCBtZWFucyBxdWV1ZWRfcm9vdF9lZmZlY3RzIG5vdyBtYXkgYmUgZmlsbGVkIGFnYWluLlxuXG5cdFx0XHQvLyBIZWxwZnVsIGZvciBkZWJ1Z2dpbmcgcmVhY3Rpdml0eSBsb3NzIHRoYXQgaGFzIHRvIGRvIHdpdGggYnJhbmNoZXMgYmVpbmcgc2tpcHBlZDpcblx0XHRcdC8vIGxvZ19pbmNvbnNpc3RlbnRfYnJhbmNoZXMocm9vdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzX2ZvcmspIHtcblx0XHRcdHRoaXMuI3Jlc29sdmUoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc19kZWZlcnJlZCgpKSB7XG5cdFx0XHR0aGlzLiNkZWZlcl9lZmZlY3RzKHRhcmdldC5lZmZlY3RzKTtcblx0XHRcdHRoaXMuI2RlZmVyX2VmZmVjdHModGFyZ2V0LnJlbmRlcl9lZmZlY3RzKTtcblx0XHRcdHRoaXMuI2RlZmVyX2VmZmVjdHModGFyZ2V0LmJsb2NrX2VmZmVjdHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJZiBzb3VyY2VzIGFyZSB3cml0dGVuIHRvLCB0aGVuIHdvcmsgbmVlZHMgdG8gaGFwcGVuIGluIGEgc2VwYXJhdGUgYmF0Y2gsIGVsc2UgcHJpb3Igc291cmNlcyB3b3VsZCBiZSBtaXhlZCB3aXRoXG5cdFx0XHQvLyBuZXdseSB1cGRhdGVkIHNvdXJjZXMsIHdoaWNoIGNvdWxkIGxlYWQgdG8gaW5maW5pdGUgbG9vcHMgd2hlbiBlZmZlY3RzIHJ1biBvdmVyIGFuZCBvdmVyIGFnYWluLlxuXHRcdFx0cHJldmlvdXNfYmF0Y2ggPSB0aGlzO1xuXHRcdFx0Y3VycmVudF9iYXRjaCA9IG51bGw7XG5cblx0XHRcdGZsdXNoX3F1ZXVlZF9lZmZlY3RzKHRhcmdldC5yZW5kZXJfZWZmZWN0cyk7XG5cdFx0XHRmbHVzaF9xdWV1ZWRfZWZmZWN0cyh0YXJnZXQuZWZmZWN0cyk7XG5cblx0XHRcdHByZXZpb3VzX2JhdGNoID0gbnVsbDtcblxuXHRcdFx0dGhpcy4jZGVmZXJyZWQ/LnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRiYXRjaF92YWx1ZXMgPSBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYXZlcnNlIHRoZSBlZmZlY3QgdHJlZSwgZXhlY3V0aW5nIGVmZmVjdHMgb3Igc3Rhc2hpbmdcblx0ICogdGhlbSBmb3IgbGF0ZXIgZXhlY3V0aW9uIGFzIGFwcHJvcHJpYXRlXG5cdCAqIEBwYXJhbSB7RWZmZWN0fSByb290XG5cdCAqIEBwYXJhbSB7RWZmZWN0VGFyZ2V0fSB0YXJnZXRcblx0ICovXG5cdCN0cmF2ZXJzZV9lZmZlY3RfdHJlZShyb290LCB0YXJnZXQpIHtcblx0XHRyb290LmYgXj0gQ0xFQU47XG5cblx0XHR2YXIgZWZmZWN0ID0gcm9vdC5maXJzdDtcblxuXHRcdHdoaWxlIChlZmZlY3QgIT09IG51bGwpIHtcblx0XHRcdHZhciBmbGFncyA9IGVmZmVjdC5mO1xuXHRcdFx0dmFyIGlzX2JyYW5jaCA9IChmbGFncyAmIChCUkFOQ0hfRUZGRUNUIHwgUk9PVF9FRkZFQ1QpKSAhPT0gMDtcblx0XHRcdHZhciBpc19za2lwcGFibGVfYnJhbmNoID0gaXNfYnJhbmNoICYmIChmbGFncyAmIENMRUFOKSAhPT0gMDtcblxuXHRcdFx0dmFyIHNraXAgPSBpc19za2lwcGFibGVfYnJhbmNoIHx8IChmbGFncyAmIElORVJUKSAhPT0gMCB8fCB0aGlzLnNraXBwZWRfZWZmZWN0cy5oYXMoZWZmZWN0KTtcblxuXHRcdFx0aWYgKChlZmZlY3QuZiAmIEJPVU5EQVJZX0VGRkVDVCkgIT09IDAgJiYgZWZmZWN0LmI/LmlzX3BlbmRpbmcoKSkge1xuXHRcdFx0XHR0YXJnZXQgPSB7XG5cdFx0XHRcdFx0cGFyZW50OiB0YXJnZXQsXG5cdFx0XHRcdFx0ZWZmZWN0LFxuXHRcdFx0XHRcdGVmZmVjdHM6IFtdLFxuXHRcdFx0XHRcdHJlbmRlcl9lZmZlY3RzOiBbXSxcblx0XHRcdFx0XHRibG9ja19lZmZlY3RzOiBbXVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXNraXAgJiYgZWZmZWN0LmZuICE9PSBudWxsKSB7XG5cdFx0XHRcdGlmIChpc19icmFuY2gpIHtcblx0XHRcdFx0XHRlZmZlY3QuZiBePSBDTEVBTjtcblx0XHRcdFx0fSBlbHNlIGlmICgoZmxhZ3MgJiBFRkZFQ1QpICE9PSAwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0LmVmZmVjdHMucHVzaChlZmZlY3QpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFzeW5jX21vZGVfZmxhZyAmJiAoZmxhZ3MgJiAoUkVOREVSX0VGRkVDVCB8IE1BTkFHRURfRUZGRUNUKSkgIT09IDApIHtcblx0XHRcdFx0XHR0YXJnZXQucmVuZGVyX2VmZmVjdHMucHVzaChlZmZlY3QpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzX2RpcnR5KGVmZmVjdCkpIHtcblx0XHRcdFx0XHRpZiAoKGVmZmVjdC5mICYgQkxPQ0tfRUZGRUNUKSAhPT0gMCkgdGFyZ2V0LmJsb2NrX2VmZmVjdHMucHVzaChlZmZlY3QpO1xuXHRcdFx0XHRcdHVwZGF0ZV9lZmZlY3QoZWZmZWN0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZhciBjaGlsZCA9IGVmZmVjdC5maXJzdDtcblxuXHRcdFx0XHRpZiAoY2hpbGQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRlZmZlY3QgPSBjaGlsZDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR2YXIgcGFyZW50ID0gZWZmZWN0LnBhcmVudDtcblx0XHRcdGVmZmVjdCA9IGVmZmVjdC5uZXh0O1xuXG5cdFx0XHR3aGlsZSAoZWZmZWN0ID09PSBudWxsICYmIHBhcmVudCAhPT0gbnVsbCkge1xuXHRcdFx0XHRpZiAocGFyZW50ID09PSB0YXJnZXQuZWZmZWN0KSB7XG5cdFx0XHRcdFx0Ly8gVE9ETyByYXRoZXIgdGhhbiB0cmF2ZXJzaW5nIGludG8gcGVuZGluZyBib3VuZGFyaWVzIGFuZCBkZWZlcnJpbmcgdGhlIGVmZmVjdHMsXG5cdFx0XHRcdFx0Ly8gY291bGQgd2UganVzdCBhdHRhY2ggdGhlIGVmZmVjdHMgX3RvXyB0aGUgcGVuZGluZyBib3VuZGFyeSBhbmQgc2NoZWR1bGUgdGhlbVxuXHRcdFx0XHRcdC8vIG9uY2UgdGhlIGJvdW5kYXJ5IGlzIHJlYWR5P1xuXHRcdFx0XHRcdHRoaXMuI2RlZmVyX2VmZmVjdHModGFyZ2V0LmVmZmVjdHMpO1xuXHRcdFx0XHRcdHRoaXMuI2RlZmVyX2VmZmVjdHModGFyZ2V0LnJlbmRlcl9lZmZlY3RzKTtcblx0XHRcdFx0XHR0aGlzLiNkZWZlcl9lZmZlY3RzKHRhcmdldC5ibG9ja19lZmZlY3RzKTtcblxuXHRcdFx0XHRcdHRhcmdldCA9IC8qKiBAdHlwZSB7RWZmZWN0VGFyZ2V0fSAqLyAodGFyZ2V0LnBhcmVudCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZmZlY3QgPSBwYXJlbnQubmV4dDtcblx0XHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtFZmZlY3RbXX0gZWZmZWN0c1xuXHQgKi9cblx0I2RlZmVyX2VmZmVjdHMoZWZmZWN0cykge1xuXHRcdGZvciAoY29uc3QgZSBvZiBlZmZlY3RzKSB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSAoZS5mICYgRElSVFkpICE9PSAwID8gdGhpcy4jZGlydHlfZWZmZWN0cyA6IHRoaXMuI21heWJlX2RpcnR5X2VmZmVjdHM7XG5cdFx0XHR0YXJnZXQucHVzaChlKTtcblxuXHRcdFx0Ly8gU2luY2Ugd2UncmUgbm90IGV4ZWN1dGluZyB0aGVzZSBlZmZlY3RzIG5vdywgd2UgbmVlZCB0byBjbGVhciBhbnkgV0FTX01BUktFRCBmbGFnc1xuXHRcdFx0Ly8gc28gdGhhdCBvdGhlciBiYXRjaGVzIGNhbiBjb3JyZWN0bHkgcmVhY2ggdGhlc2UgZWZmZWN0cyBkdXJpbmcgdGhlaXIgb3duIHRyYXZlcnNhbFxuXHRcdFx0dGhpcy4jY2xlYXJfbWFya2VkKGUuZGVwcyk7XG5cblx0XHRcdC8vIG1hcmsgYXMgY2xlYW4gc28gdGhleSBnZXQgc2NoZWR1bGVkIGlmIHRoZXkgZGVwZW5kIG9uIHBlbmRpbmcgYXN5bmMgc3RhdGVcblx0XHRcdHNldF9zaWduYWxfc3RhdHVzKGUsIENMRUFOKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtWYWx1ZVtdIHwgbnVsbH0gZGVwc1xuXHQgKi9cblx0I2NsZWFyX21hcmtlZChkZXBzKSB7XG5cdFx0aWYgKGRlcHMgPT09IG51bGwpIHJldHVybjtcblxuXHRcdGZvciAoY29uc3QgZGVwIG9mIGRlcHMpIHtcblx0XHRcdGlmICgoZGVwLmYgJiBERVJJVkVEKSA9PT0gMCB8fCAoZGVwLmYgJiBXQVNfTUFSS0VEKSA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0ZGVwLmYgXj0gV0FTX01BUktFRDtcblxuXHRcdFx0dGhpcy4jY2xlYXJfbWFya2VkKC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGRlcCkuZGVwcyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFzc29jaWF0ZSBhIGNoYW5nZSB0byBhIGdpdmVuIHNvdXJjZSB3aXRoIHRoZSBjdXJyZW50XG5cdCAqIGJhdGNoLCBub3RpbmcgaXRzIHByZXZpb3VzIGFuZCBjdXJyZW50IHZhbHVlc1xuXHQgKiBAcGFyYW0ge1NvdXJjZX0gc291cmNlXG5cdCAqIEBwYXJhbSB7YW55fSB2YWx1ZVxuXHQgKi9cblx0Y2FwdHVyZShzb3VyY2UsIHZhbHVlKSB7XG5cdFx0aWYgKCF0aGlzLnByZXZpb3VzLmhhcyhzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLnByZXZpb3VzLnNldChzb3VyY2UsIHZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBzYXZlIGVycm9ycyBpbiBgYmF0Y2hfdmFsdWVzYCwgb3IgdGhleSB3b24ndCBiZSB0aHJvd24gaW4gYHJ1bnRpbWUuanMjZ2V0YFxuXHRcdGlmICgoc291cmNlLmYgJiBFUlJPUl9WQUxVRSkgPT09IDApIHtcblx0XHRcdHRoaXMuY3VycmVudC5zZXQoc291cmNlLCBzb3VyY2Uudik7XG5cdFx0XHRiYXRjaF92YWx1ZXM/LnNldChzb3VyY2UsIHNvdXJjZS52KTtcblx0XHR9XG5cdH1cblxuXHRhY3RpdmF0ZSgpIHtcblx0XHRjdXJyZW50X2JhdGNoID0gdGhpcztcblx0XHR0aGlzLmFwcGx5KCk7XG5cdH1cblxuXHRkZWFjdGl2YXRlKCkge1xuXHRcdC8vIElmIHdlJ3JlIG5vdCB0aGUgY3VycmVudCBiYXRjaCwgZG9uJ3QgZGVhY3RpdmF0ZSxcblx0XHQvLyBlbHNlIHdlIGNvdWxkIGNyZWF0ZSB6b21iaWUgYmF0Y2hlcyB0aGF0IGFyZSBuZXZlciBmbHVzaGVkXG5cdFx0aWYgKGN1cnJlbnRfYmF0Y2ggIT09IHRoaXMpIHJldHVybjtcblxuXHRcdGN1cnJlbnRfYmF0Y2ggPSBudWxsO1xuXHRcdGJhdGNoX3ZhbHVlcyA9IG51bGw7XG5cdH1cblxuXHRmbHVzaCgpIHtcblx0XHR0aGlzLmFjdGl2YXRlKCk7XG5cblx0XHRpZiAocXVldWVkX3Jvb3RfZWZmZWN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmbHVzaF9lZmZlY3RzKCk7XG5cblx0XHRcdGlmIChjdXJyZW50X2JhdGNoICE9PSBudWxsICYmIGN1cnJlbnRfYmF0Y2ggIT09IHRoaXMpIHtcblx0XHRcdFx0Ly8gdGhpcyBjYW4gaGFwcGVuIGlmIGEgbmV3IGJhdGNoIHdhcyBjcmVhdGVkIGR1cmluZyBgZmx1c2hfZWZmZWN0cygpYFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLiNwZW5kaW5nID09PSAwKSB7XG5cdFx0XHR0aGlzLnByb2Nlc3MoW10pOyAvLyBUT0RPIHRoaXMgZmVlbHMgYXdrd2FyZFxuXHRcdH1cblxuXHRcdHRoaXMuZGVhY3RpdmF0ZSgpO1xuXHR9XG5cblx0ZGlzY2FyZCgpIHtcblx0XHRmb3IgKGNvbnN0IGZuIG9mIHRoaXMuI2Rpc2NhcmRfY2FsbGJhY2tzKSBmbih0aGlzKTtcblx0XHR0aGlzLiNkaXNjYXJkX2NhbGxiYWNrcy5jbGVhcigpO1xuXHR9XG5cblx0I3Jlc29sdmUoKSB7XG5cdFx0aWYgKHRoaXMuI2Jsb2NraW5nX3BlbmRpbmcgPT09IDApIHtcblx0XHRcdC8vIGFwcGVuZC9yZW1vdmUgYnJhbmNoZXNcblx0XHRcdGZvciAoY29uc3QgZm4gb2YgdGhpcy4jY29tbWl0X2NhbGxiYWNrcykgZm4oKTtcblx0XHRcdHRoaXMuI2NvbW1pdF9jYWxsYmFja3MuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy4jcGVuZGluZyA9PT0gMCkge1xuXHRcdFx0dGhpcy4jY29tbWl0KCk7XG5cdFx0fVxuXHR9XG5cblx0I2NvbW1pdCgpIHtcblx0XHQvLyBJZiB0aGVyZSBhcmUgb3RoZXIgcGVuZGluZyBiYXRjaGVzLCB0aGV5IG5vdyBuZWVkIHRvIGJlICdyZWJhc2VkJyDigJRcblx0XHQvLyBpbiBvdGhlciB3b3Jkcywgd2UgcmUtcnVuIGJsb2NrL2FzeW5jIGVmZmVjdHMgd2l0aCB0aGUgbmV3bHlcblx0XHQvLyBjb21taXR0ZWQgc3RhdGUsIHVubGVzcyB0aGUgYmF0Y2ggaW4gcXVlc3Rpb24gaGFzIGEgbW9yZVxuXHRcdC8vIHJlY2VudCB2YWx1ZSBmb3IgYSBnaXZlbiBzb3VyY2Vcblx0XHRpZiAoYmF0Y2hlcy5zaXplID4gMSkge1xuXHRcdFx0dGhpcy5wcmV2aW91cy5jbGVhcigpO1xuXG5cdFx0XHR2YXIgcHJldmlvdXNfYmF0Y2hfdmFsdWVzID0gYmF0Y2hfdmFsdWVzO1xuXHRcdFx0dmFyIGlzX2VhcmxpZXIgPSB0cnVlO1xuXG5cdFx0XHQvKiogQHR5cGUge0VmZmVjdFRhcmdldH0gKi9cblx0XHRcdHZhciBkdW1teV90YXJnZXQgPSB7XG5cdFx0XHRcdHBhcmVudDogbnVsbCxcblx0XHRcdFx0ZWZmZWN0OiBudWxsLFxuXHRcdFx0XHRlZmZlY3RzOiBbXSxcblx0XHRcdFx0cmVuZGVyX2VmZmVjdHM6IFtdLFxuXHRcdFx0XHRibG9ja19lZmZlY3RzOiBbXVxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIChjb25zdCBiYXRjaCBvZiBiYXRjaGVzKSB7XG5cdFx0XHRcdGlmIChiYXRjaCA9PT0gdGhpcykge1xuXHRcdFx0XHRcdGlzX2VhcmxpZXIgPSBmYWxzZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8qKiBAdHlwZSB7U291cmNlW119ICovXG5cdFx0XHRcdGNvbnN0IHNvdXJjZXMgPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtzb3VyY2UsIHZhbHVlXSBvZiB0aGlzLmN1cnJlbnQpIHtcblx0XHRcdFx0XHRpZiAoYmF0Y2guY3VycmVudC5oYXMoc291cmNlKSkge1xuXHRcdFx0XHRcdFx0aWYgKGlzX2VhcmxpZXIgJiYgdmFsdWUgIT09IGJhdGNoLmN1cnJlbnQuZ2V0KHNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gYnJpbmcgdGhlIHZhbHVlIHVwIHRvIGRhdGVcblx0XHRcdFx0XHRcdFx0YmF0Y2guY3VycmVudC5zZXQoc291cmNlLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBzYW1lIHZhbHVlIG9yIGxhdGVyIGJhdGNoIGhhcyBtb3JlIHJlY2VudCB2YWx1ZSxcblx0XHRcdFx0XHRcdFx0Ly8gbm8gbmVlZCB0byByZS1ydW4gdGhlc2UgZWZmZWN0c1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzb3VyY2VzLnB1c2goc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmUtcnVuIGFzeW5jL2Jsb2NrIGVmZmVjdHMgdGhhdCBkZXBlbmQgb24gZGlzdGluY3QgdmFsdWVzIGNoYW5nZWQgaW4gYm90aCBiYXRjaGVzXG5cdFx0XHRcdGNvbnN0IG90aGVycyA9IFsuLi5iYXRjaC5jdXJyZW50LmtleXMoKV0uZmlsdGVyKChzKSA9PiAhdGhpcy5jdXJyZW50LmhhcyhzKSk7XG5cdFx0XHRcdGlmIChvdGhlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdC8vIEF2b2lkIHJ1bm5pbmcgcXVldWVkIHJvb3QgZWZmZWN0cyBvbiB0aGUgd3JvbmcgYnJhbmNoXG5cdFx0XHRcdFx0dmFyIHByZXZfcXVldWVkX3Jvb3RfZWZmZWN0cyA9IHF1ZXVlZF9yb290X2VmZmVjdHM7XG5cdFx0XHRcdFx0cXVldWVkX3Jvb3RfZWZmZWN0cyA9IFtdO1xuXG5cdFx0XHRcdFx0LyoqIEB0eXBlIHtTZXQ8VmFsdWU+fSAqL1xuXHRcdFx0XHRcdGNvbnN0IG1hcmtlZCA9IG5ldyBTZXQoKTtcblx0XHRcdFx0XHQvKiogQHR5cGUge01hcDxSZWFjdGlvbiwgYm9vbGVhbj59ICovXG5cdFx0XHRcdFx0Y29uc3QgY2hlY2tlZCA9IG5ldyBNYXAoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBzb3VyY2VzKSB7XG5cdFx0XHRcdFx0XHRtYXJrX2VmZmVjdHMoc291cmNlLCBvdGhlcnMsIG1hcmtlZCwgY2hlY2tlZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHF1ZXVlZF9yb290X2VmZmVjdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y3VycmVudF9iYXRjaCA9IGJhdGNoO1xuXHRcdFx0XHRcdFx0YmF0Y2guYXBwbHkoKTtcblxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCByb290IG9mIHF1ZXVlZF9yb290X2VmZmVjdHMpIHtcblx0XHRcdFx0XHRcdFx0YmF0Y2guI3RyYXZlcnNlX2VmZmVjdF90cmVlKHJvb3QsIGR1bW15X3RhcmdldCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFRPRE8gZG8gd2UgbmVlZCB0byBkbyBhbnl0aGluZyB3aXRoIGB0YXJnZXRgPyBkZWZlciBibG9jayBlZmZlY3RzP1xuXG5cdFx0XHRcdFx0XHRiYXRjaC5kZWFjdGl2YXRlKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cXVldWVkX3Jvb3RfZWZmZWN0cyA9IHByZXZfcXVldWVkX3Jvb3RfZWZmZWN0cztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50X2JhdGNoID0gbnVsbDtcblx0XHRcdGJhdGNoX3ZhbHVlcyA9IHByZXZpb3VzX2JhdGNoX3ZhbHVlcztcblx0XHR9XG5cblx0XHR0aGlzLmNvbW1pdHRlZCA9IHRydWU7XG5cdFx0YmF0Y2hlcy5kZWxldGUodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogQHBhcmFtIHtib29sZWFufSBibG9ja2luZ1xuXHQgKi9cblx0aW5jcmVtZW50KGJsb2NraW5nKSB7XG5cdFx0dGhpcy4jcGVuZGluZyArPSAxO1xuXHRcdGlmIChibG9ja2luZykgdGhpcy4jYmxvY2tpbmdfcGVuZGluZyArPSAxO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gYmxvY2tpbmdcblx0ICovXG5cdGRlY3JlbWVudChibG9ja2luZykge1xuXHRcdHRoaXMuI3BlbmRpbmcgLT0gMTtcblx0XHRpZiAoYmxvY2tpbmcpIHRoaXMuI2Jsb2NraW5nX3BlbmRpbmcgLT0gMTtcblxuXHRcdHRoaXMucmV2aXZlKCk7XG5cdH1cblxuXHRyZXZpdmUoKSB7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMuI2RpcnR5X2VmZmVjdHMpIHtcblx0XHRcdHNldF9zaWduYWxfc3RhdHVzKGUsIERJUlRZKTtcblx0XHRcdHNjaGVkdWxlX2VmZmVjdChlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy4jbWF5YmVfZGlydHlfZWZmZWN0cykge1xuXHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMoZSwgTUFZQkVfRElSVFkpO1xuXHRcdFx0c2NoZWR1bGVfZWZmZWN0KGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuI2RpcnR5X2VmZmVjdHMgPSBbXTtcblx0XHR0aGlzLiNtYXliZV9kaXJ0eV9lZmZlY3RzID0gW107XG5cblx0XHR0aGlzLmZsdXNoKCk7XG5cdH1cblxuXHQvKiogQHBhcmFtIHsoKSA9PiB2b2lkfSBmbiAqL1xuXHRvbmNvbW1pdChmbikge1xuXHRcdHRoaXMuI2NvbW1pdF9jYWxsYmFja3MuYWRkKGZuKTtcblx0fVxuXG5cdC8qKiBAcGFyYW0geyhiYXRjaDogQmF0Y2gpID0+IHZvaWR9IGZuICovXG5cdG9uZGlzY2FyZChmbikge1xuXHRcdHRoaXMuI2Rpc2NhcmRfY2FsbGJhY2tzLmFkZChmbik7XG5cdH1cblxuXHRzZXR0bGVkKCkge1xuXHRcdHJldHVybiAodGhpcy4jZGVmZXJyZWQgPz89IGRlZmVycmVkKCkpLnByb21pc2U7XG5cdH1cblxuXHRzdGF0aWMgZW5zdXJlKCkge1xuXHRcdGlmIChjdXJyZW50X2JhdGNoID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBiYXRjaCA9IChjdXJyZW50X2JhdGNoID0gbmV3IEJhdGNoKCkpO1xuXHRcdFx0YmF0Y2hlcy5hZGQoY3VycmVudF9iYXRjaCk7XG5cblx0XHRcdGlmICghaXNfZmx1c2hpbmdfc3luYykge1xuXHRcdFx0XHRCYXRjaC5lbnF1ZXVlKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoY3VycmVudF9iYXRjaCAhPT0gYmF0Y2gpIHtcblx0XHRcdFx0XHRcdC8vIGEgZmx1c2hTeW5jIGhhcHBlbmVkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJhdGNoLmZsdXNoKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyZW50X2JhdGNoO1xuXHR9XG5cblx0LyoqIEBwYXJhbSB7KCkgPT4gdm9pZH0gdGFzayAqL1xuXHRzdGF0aWMgZW5xdWV1ZSh0YXNrKSB7XG5cdFx0cXVldWVfbWljcm9fdGFzayh0YXNrKTtcblx0fVxuXG5cdGFwcGx5KCkge1xuXHRcdGlmICghYXN5bmNfbW9kZV9mbGFnIHx8ICghdGhpcy5pc19mb3JrICYmIGJhdGNoZXMuc2l6ZSA9PT0gMSkpIHJldHVybjtcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBiYXRjaGVzLCB3ZSBhcmUgJ3RpbWUgdHJhdmVsbGluZycg4oCUXG5cdFx0Ly8gd2UgbmVlZCB0byBvdmVycmlkZSB2YWx1ZXMgd2l0aCB0aGUgb25lcyBpbiB0aGlzIGJhdGNoLi4uXG5cdFx0YmF0Y2hfdmFsdWVzID0gbmV3IE1hcCh0aGlzLmN1cnJlbnQpO1xuXG5cdFx0Ly8gLi4uYW5kIHVuZG8gY2hhbmdlcyBiZWxvbmdpbmcgdG8gb3RoZXIgYmF0Y2hlc1xuXHRcdGZvciAoY29uc3QgYmF0Y2ggb2YgYmF0Y2hlcykge1xuXHRcdFx0aWYgKGJhdGNoID09PSB0aGlzKSBjb250aW51ZTtcblxuXHRcdFx0Zm9yIChjb25zdCBbc291cmNlLCBwcmV2aW91c10gb2YgYmF0Y2gucHJldmlvdXMpIHtcblx0XHRcdFx0aWYgKCFiYXRjaF92YWx1ZXMuaGFzKHNvdXJjZSkpIHtcblx0XHRcdFx0XHRiYXRjaF92YWx1ZXMuc2V0KHNvdXJjZSwgcHJldmlvdXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogU3luY2hyb25vdXNseSBmbHVzaCBhbnkgcGVuZGluZyB1cGRhdGVzLlxuICogUmV0dXJucyB2b2lkIGlmIG5vIGNhbGxiYWNrIGlzIHByb3ZpZGVkLCBvdGhlcndpc2UgcmV0dXJucyB0aGUgcmVzdWx0IG9mIGNhbGxpbmcgdGhlIGNhbGxiYWNrLlxuICogQHRlbXBsYXRlIFtUPXZvaWRdXG4gKiBAcGFyYW0geygoKSA9PiBUKSB8IHVuZGVmaW5lZH0gW2ZuXVxuICogQHJldHVybnMge1R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmbHVzaFN5bmMoZm4pIHtcblx0dmFyIHdhc19mbHVzaGluZ19zeW5jID0gaXNfZmx1c2hpbmdfc3luYztcblx0aXNfZmx1c2hpbmdfc3luYyA9IHRydWU7XG5cblx0dHJ5IHtcblx0XHR2YXIgcmVzdWx0O1xuXG5cdFx0aWYgKGZuKSB7XG5cdFx0XHRpZiAoY3VycmVudF9iYXRjaCAhPT0gbnVsbCkge1xuXHRcdFx0XHRmbHVzaF9lZmZlY3RzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdCA9IGZuKCk7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGZsdXNoX3Rhc2tzKCk7XG5cblx0XHRcdGlmIChxdWV1ZWRfcm9vdF9lZmZlY3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjdXJyZW50X2JhdGNoPy5mbHVzaCgpO1xuXG5cdFx0XHRcdC8vIHdlIG5lZWQgdG8gY2hlY2sgYWdhaW4sIGluIGNhc2Ugd2UganVzdCB1cGRhdGVkIGFuIGAkZWZmZWN0LnBlbmRpbmcoKWBcblx0XHRcdFx0aWYgKHF1ZXVlZF9yb290X2VmZmVjdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB3b3VsZCBiZSByZXNldCBpbiBgZmx1c2hfZWZmZWN0cygpYCBidXQgc2luY2Ugd2UgYXJlIGVhcmx5IHJldHVybmluZyBoZXJlLFxuXHRcdFx0XHRcdC8vIHdlIG5lZWQgdG8gcmVzZXQgaXQgaGVyZSBhcyB3ZWxsIGluIGNhc2UgdGhlIGZpcnN0IHRpbWUgdGhlcmUncyAwIHF1ZXVlZCByb290IGVmZmVjdHNcblx0XHRcdFx0XHRsYXN0X3NjaGVkdWxlZF9lZmZlY3QgPSBudWxsO1xuXG5cdFx0XHRcdFx0cmV0dXJuIC8qKiBAdHlwZSB7VH0gKi8gKHJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zmx1c2hfZWZmZWN0cygpO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRpc19mbHVzaGluZ19zeW5jID0gd2FzX2ZsdXNoaW5nX3N5bmM7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmx1c2hfZWZmZWN0cygpIHtcblx0dmFyIHdhc191cGRhdGluZ19lZmZlY3QgPSBpc191cGRhdGluZ19lZmZlY3Q7XG5cdGlzX2ZsdXNoaW5nID0gdHJ1ZTtcblxuXHR2YXIgc291cmNlX3N0YWNrcyA9IERFViA/IG5ldyBTZXQoKSA6IG51bGw7XG5cblx0dHJ5IHtcblx0XHR2YXIgZmx1c2hfY291bnQgPSAwO1xuXHRcdHNldF9pc191cGRhdGluZ19lZmZlY3QodHJ1ZSk7XG5cblx0XHR3aGlsZSAocXVldWVkX3Jvb3RfZWZmZWN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR2YXIgYmF0Y2ggPSBCYXRjaC5lbnN1cmUoKTtcblxuXHRcdFx0aWYgKGZsdXNoX2NvdW50KysgPiAxMDAwKSB7XG5cdFx0XHRcdGlmIChERVYpIHtcblx0XHRcdFx0XHR2YXIgdXBkYXRlcyA9IG5ldyBNYXAoKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc291cmNlIG9mIGJhdGNoLmN1cnJlbnQua2V5cygpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IFtzdGFjaywgdXBkYXRlXSBvZiBzb3VyY2UudXBkYXRlZCA/PyBbXSkge1xuXHRcdFx0XHRcdFx0XHR2YXIgZW50cnkgPSB1cGRhdGVzLmdldChzdGFjayk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRcdFx0XHRcdGVudHJ5ID0geyBlcnJvcjogdXBkYXRlLmVycm9yLCBjb3VudDogMCB9O1xuXHRcdFx0XHRcdFx0XHRcdHVwZGF0ZXMuc2V0KHN0YWNrLCBlbnRyeSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRlbnRyeS5jb3VudCArPSB1cGRhdGUuY291bnQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCB1cGRhdGUgb2YgdXBkYXRlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0aWYgKHVwZGF0ZS5lcnJvcikge1xuXHRcdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKHVwZGF0ZS5lcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aW5maW5pdGVfbG9vcF9ndWFyZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRiYXRjaC5wcm9jZXNzKHF1ZXVlZF9yb290X2VmZmVjdHMpO1xuXHRcdFx0b2xkX3ZhbHVlcy5jbGVhcigpO1xuXG5cdFx0XHRpZiAoREVWKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc291cmNlIG9mIGJhdGNoLmN1cnJlbnQua2V5cygpKSB7XG5cdFx0XHRcdFx0LyoqIEB0eXBlIHtTZXQ8U291cmNlPn0gKi8gKHNvdXJjZV9zdGFja3MpLmFkZChzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdGlzX2ZsdXNoaW5nID0gZmFsc2U7XG5cdFx0c2V0X2lzX3VwZGF0aW5nX2VmZmVjdCh3YXNfdXBkYXRpbmdfZWZmZWN0KTtcblxuXHRcdGxhc3Rfc2NoZWR1bGVkX2VmZmVjdCA9IG51bGw7XG5cblx0XHRpZiAoREVWKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiAvKiogQHR5cGUge1NldDxTb3VyY2U+fSAqLyAoc291cmNlX3N0YWNrcykpIHtcblx0XHRcdFx0c291cmNlLnVwZGF0ZWQgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBpbmZpbml0ZV9sb29wX2d1YXJkKCkge1xuXHR0cnkge1xuXHRcdGUuZWZmZWN0X3VwZGF0ZV9kZXB0aF9leGNlZWRlZCgpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChERVYpIHtcblx0XHRcdC8vIHN0YWNrIGNvbnRhaW5zIG5vIHVzZWZ1bCBpbmZvcm1hdGlvbiwgcmVwbGFjZSBpdFxuXHRcdFx0ZGVmaW5lX3Byb3BlcnR5KGVycm9yLCAnc3RhY2snLCB7IHZhbHVlOiAnJyB9KTtcblx0XHR9XG5cblx0XHQvLyBCZXN0IGVmZm9ydDogaW52b2tlIHRoZSBib3VuZGFyeSBuZWFyZXN0IHRoZSBtb3N0IHJlY2VudFxuXHRcdC8vIGVmZmVjdCBhbmQgaG9wZSB0aGF0IGl0J3MgcmVsZXZhbnQgdG8gdGhlIGluZmluaXRlIGxvb3Bcblx0XHRpbnZva2VfZXJyb3JfYm91bmRhcnkoZXJyb3IsIGxhc3Rfc2NoZWR1bGVkX2VmZmVjdCk7XG5cdH1cbn1cblxuLyoqIEB0eXBlIHtTZXQ8RWZmZWN0PiB8IG51bGx9ICovXG5leHBvcnQgbGV0IGVhZ2VyX2Jsb2NrX2VmZmVjdHMgPSBudWxsO1xuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXk8RWZmZWN0Pn0gZWZmZWN0c1xuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmZ1bmN0aW9uIGZsdXNoX3F1ZXVlZF9lZmZlY3RzKGVmZmVjdHMpIHtcblx0dmFyIGxlbmd0aCA9IGVmZmVjdHMubGVuZ3RoO1xuXHRpZiAobGVuZ3RoID09PSAwKSByZXR1cm47XG5cblx0dmFyIGkgPSAwO1xuXG5cdHdoaWxlIChpIDwgbGVuZ3RoKSB7XG5cdFx0dmFyIGVmZmVjdCA9IGVmZmVjdHNbaSsrXTtcblxuXHRcdGlmICgoZWZmZWN0LmYgJiAoREVTVFJPWUVEIHwgSU5FUlQpKSA9PT0gMCAmJiBpc19kaXJ0eShlZmZlY3QpKSB7XG5cdFx0XHRlYWdlcl9ibG9ja19lZmZlY3RzID0gbmV3IFNldCgpO1xuXG5cdFx0XHR1cGRhdGVfZWZmZWN0KGVmZmVjdCk7XG5cblx0XHRcdC8vIEVmZmVjdHMgd2l0aCBubyBkZXBlbmRlbmNpZXMgb3IgdGVhcmRvd24gZG8gbm90IGdldCBhZGRlZCB0byB0aGUgZWZmZWN0IHRyZWUuXG5cdFx0XHQvLyBEZWZlcnJlZCBlZmZlY3RzIChlLmcuIGAkZWZmZWN0KC4uLilgKSBfYXJlXyBhZGRlZCB0byB0aGUgdHJlZSBiZWNhdXNlIHdlXG5cdFx0XHQvLyBkb24ndCBrbm93IGlmIHdlIG5lZWQgdG8ga2VlcCB0aGVtIHVudGlsIHRoZXkgYXJlIGV4ZWN1dGVkLiBEb2luZyB0aGUgY2hlY2tcblx0XHRcdC8vIGhlcmUgKHJhdGhlciB0aGFuIGluIGB1cGRhdGVfZWZmZWN0YCkgYWxsb3dzIHVzIHRvIHNraXAgdGhlIHdvcmsgZm9yXG5cdFx0XHQvLyBpbW1lZGlhdGUgZWZmZWN0cy5cblx0XHRcdGlmIChlZmZlY3QuZGVwcyA9PT0gbnVsbCAmJiBlZmZlY3QuZmlyc3QgPT09IG51bGwgJiYgZWZmZWN0Lm5vZGVzX3N0YXJ0ID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIGlmIHRoZXJlJ3Mgbm8gdGVhcmRvd24gb3IgYWJvcnQgY29udHJvbGxlciB3ZSBjb21wbGV0ZWx5IHVubGlua1xuXHRcdFx0XHQvLyB0aGUgZWZmZWN0IGZyb20gdGhlIGdyYXBoXG5cdFx0XHRcdGlmIChlZmZlY3QudGVhcmRvd24gPT09IG51bGwgJiYgZWZmZWN0LmFjID09PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gcmVtb3ZlIHRoaXMgZWZmZWN0IGZyb20gdGhlIGdyYXBoXG5cdFx0XHRcdFx0dW5saW5rX2VmZmVjdChlZmZlY3QpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGtlZXAgdGhlIGVmZmVjdCBpbiB0aGUgZ3JhcGgsIGJ1dCBmcmVlIHVwIHNvbWUgbWVtb3J5XG5cdFx0XHRcdFx0ZWZmZWN0LmZuID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB1cGRhdGVfZWZmZWN0KCkgaGFzIGEgZmx1c2hTeW5jKCkgaW4gaXQsIHdlIG1heSBoYXZlIGZsdXNoZWQgYW5vdGhlciBmbHVzaF9xdWV1ZWRfZWZmZWN0cygpLFxuXHRcdFx0Ly8gd2hpY2ggYWxyZWFkeSBoYW5kbGVkIHRoaXMgbG9naWMgYW5kIGRpZCBzZXQgZWFnZXJfYmxvY2tfZWZmZWN0cyB0byBudWxsLlxuXHRcdFx0aWYgKGVhZ2VyX2Jsb2NrX2VmZmVjdHM/LnNpemUgPiAwKSB7XG5cdFx0XHRcdG9sZF92YWx1ZXMuY2xlYXIoKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2YgZWFnZXJfYmxvY2tfZWZmZWN0cykge1xuXHRcdFx0XHRcdC8vIFNraXAgZWFnZXIgZWZmZWN0cyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIHVubW91bnRlZFxuXHRcdFx0XHRcdGlmICgoZS5mICYgKERFU1RST1lFRCB8IElORVJUKSkgIT09IDApIGNvbnRpbnVlO1xuXG5cdFx0XHRcdFx0Ly8gUnVuIGVmZmVjdHMgaW4gb3JkZXIgZnJvbSBhbmNlc3RvciB0byBkZXNjZW5kYW50LCBlbHNlIHdlIGNvdWxkIHJ1biBpbnRvIG51bGxwb2ludGVyc1xuXHRcdFx0XHRcdC8qKiBAdHlwZSB7RWZmZWN0W119ICovXG5cdFx0XHRcdFx0Y29uc3Qgb3JkZXJlZF9lZmZlY3RzID0gW2VdO1xuXHRcdFx0XHRcdGxldCBhbmNlc3RvciA9IGUucGFyZW50O1xuXHRcdFx0XHRcdHdoaWxlIChhbmNlc3RvciAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0aWYgKGVhZ2VyX2Jsb2NrX2VmZmVjdHMuaGFzKGFuY2VzdG9yKSkge1xuXHRcdFx0XHRcdFx0XHRlYWdlcl9ibG9ja19lZmZlY3RzLmRlbGV0ZShhbmNlc3Rvcik7XG5cdFx0XHRcdFx0XHRcdG9yZGVyZWRfZWZmZWN0cy5wdXNoKGFuY2VzdG9yKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFuY2VzdG9yID0gYW5jZXN0b3IucGFyZW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAobGV0IGogPSBvcmRlcmVkX2VmZmVjdHMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGUgPSBvcmRlcmVkX2VmZmVjdHNbal07XG5cdFx0XHRcdFx0XHQvLyBTa2lwIGVhZ2VyIGVmZmVjdHMgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiB1bm1vdW50ZWRcblx0XHRcdFx0XHRcdGlmICgoZS5mICYgKERFU1RST1lFRCB8IElORVJUKSkgIT09IDApIGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0dXBkYXRlX2VmZmVjdChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlYWdlcl9ibG9ja19lZmZlY3RzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZWFnZXJfYmxvY2tfZWZmZWN0cyA9IG51bGw7XG59XG5cbi8qKlxuICogVGhpcyBpcyBzaW1pbGFyIHRvIGBtYXJrX3JlYWN0aW9uc2AsIGJ1dCBpdCBvbmx5IG1hcmtzIGFzeW5jL2Jsb2NrIGVmZmVjdHNcbiAqIGRlcGVuZGluZyBvbiBgdmFsdWVgIGFuZCBhdCBsZWFzdCBvbmUgb2YgdGhlIG90aGVyIGBzb3VyY2VzYCwgc28gdGhhdFxuICogdGhlc2UgZWZmZWN0cyBjYW4gcmUtcnVuIGFmdGVyIGFub3RoZXIgYmF0Y2ggaGFzIGJlZW4gY29tbWl0dGVkXG4gKiBAcGFyYW0ge1ZhbHVlfSB2YWx1ZVxuICogQHBhcmFtIHtTb3VyY2VbXX0gc291cmNlc1xuICogQHBhcmFtIHtTZXQ8VmFsdWU+fSBtYXJrZWRcbiAqIEBwYXJhbSB7TWFwPFJlYWN0aW9uLCBib29sZWFuPn0gY2hlY2tlZFxuICovXG5mdW5jdGlvbiBtYXJrX2VmZmVjdHModmFsdWUsIHNvdXJjZXMsIG1hcmtlZCwgY2hlY2tlZCkge1xuXHRpZiAobWFya2VkLmhhcyh2YWx1ZSkpIHJldHVybjtcblx0bWFya2VkLmFkZCh2YWx1ZSk7XG5cblx0aWYgKHZhbHVlLnJlYWN0aW9ucyAhPT0gbnVsbCkge1xuXHRcdGZvciAoY29uc3QgcmVhY3Rpb24gb2YgdmFsdWUucmVhY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBmbGFncyA9IHJlYWN0aW9uLmY7XG5cblx0XHRcdGlmICgoZmxhZ3MgJiBERVJJVkVEKSAhPT0gMCkge1xuXHRcdFx0XHRtYXJrX2VmZmVjdHMoLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAocmVhY3Rpb24pLCBzb3VyY2VzLCBtYXJrZWQsIGNoZWNrZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChcblx0XHRcdFx0KGZsYWdzICYgKEFTWU5DIHwgQkxPQ0tfRUZGRUNUKSkgIT09IDAgJiZcblx0XHRcdFx0KGZsYWdzICYgRElSVFkpID09PSAwICYmXG5cdFx0XHRcdGRlcGVuZHNfb24ocmVhY3Rpb24sIHNvdXJjZXMsIGNoZWNrZWQpXG5cdFx0XHQpIHtcblx0XHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMocmVhY3Rpb24sIERJUlRZKTtcblx0XHRcdFx0c2NoZWR1bGVfZWZmZWN0KC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAocmVhY3Rpb24pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBXaGVuIGNvbW1pdHRpbmcgYSBmb3JrLCB3ZSBuZWVkIHRvIHRyaWdnZXIgZWFnZXIgZWZmZWN0cyBzbyB0aGF0XG4gKiBhbnkgYCRzdGF0ZS5lYWdlciguLi4pYCBleHByZXNzaW9ucyB1cGRhdGUgaW1tZWRpYXRlbHkuIFRoaXNcbiAqIGZ1bmN0aW9uIGFsbG93cyB1cyB0byBkaXNjb3ZlciB0aGVtXG4gKiBAcGFyYW0ge1ZhbHVlfSB2YWx1ZVxuICogQHBhcmFtIHtTZXQ8RWZmZWN0Pn0gZWZmZWN0c1xuICovXG5mdW5jdGlvbiBtYXJrX2VhZ2VyX2VmZmVjdHModmFsdWUsIGVmZmVjdHMpIHtcblx0aWYgKHZhbHVlLnJlYWN0aW9ucyA9PT0gbnVsbCkgcmV0dXJuO1xuXG5cdGZvciAoY29uc3QgcmVhY3Rpb24gb2YgdmFsdWUucmVhY3Rpb25zKSB7XG5cdFx0Y29uc3QgZmxhZ3MgPSByZWFjdGlvbi5mO1xuXG5cdFx0aWYgKChmbGFncyAmIERFUklWRUQpICE9PSAwKSB7XG5cdFx0XHRtYXJrX2VhZ2VyX2VmZmVjdHMoLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAocmVhY3Rpb24pLCBlZmZlY3RzKTtcblx0XHR9IGVsc2UgaWYgKChmbGFncyAmIEVBR0VSX0VGRkVDVCkgIT09IDApIHtcblx0XHRcdHNldF9zaWduYWxfc3RhdHVzKHJlYWN0aW9uLCBESVJUWSk7XG5cdFx0XHRlZmZlY3RzLmFkZCgvKiogQHR5cGUge0VmZmVjdH0gKi8gKHJlYWN0aW9uKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtSZWFjdGlvbn0gcmVhY3Rpb25cbiAqIEBwYXJhbSB7U291cmNlW119IHNvdXJjZXNcbiAqIEBwYXJhbSB7TWFwPFJlYWN0aW9uLCBib29sZWFuPn0gY2hlY2tlZFxuICovXG5mdW5jdGlvbiBkZXBlbmRzX29uKHJlYWN0aW9uLCBzb3VyY2VzLCBjaGVja2VkKSB7XG5cdGNvbnN0IGRlcGVuZHMgPSBjaGVja2VkLmdldChyZWFjdGlvbik7XG5cdGlmIChkZXBlbmRzICE9PSB1bmRlZmluZWQpIHJldHVybiBkZXBlbmRzO1xuXG5cdGlmIChyZWFjdGlvbi5kZXBzICE9PSBudWxsKSB7XG5cdFx0Zm9yIChjb25zdCBkZXAgb2YgcmVhY3Rpb24uZGVwcykge1xuXHRcdFx0aWYgKHNvdXJjZXMuaW5jbHVkZXMoZGVwKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChkZXAuZiAmIERFUklWRUQpICE9PSAwICYmIGRlcGVuZHNfb24oLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAoZGVwKSwgc291cmNlcywgY2hlY2tlZCkpIHtcblx0XHRcdFx0Y2hlY2tlZC5zZXQoLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAoZGVwKSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNoZWNrZWQuc2V0KHJlYWN0aW9uLCBmYWxzZSk7XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWZmZWN0fSBzaWduYWxcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NoZWR1bGVfZWZmZWN0KHNpZ25hbCkge1xuXHR2YXIgZWZmZWN0ID0gKGxhc3Rfc2NoZWR1bGVkX2VmZmVjdCA9IHNpZ25hbCk7XG5cblx0d2hpbGUgKGVmZmVjdC5wYXJlbnQgIT09IG51bGwpIHtcblx0XHRlZmZlY3QgPSBlZmZlY3QucGFyZW50O1xuXHRcdHZhciBmbGFncyA9IGVmZmVjdC5mO1xuXG5cdFx0Ly8gaWYgdGhlIGVmZmVjdCBpcyBiZWluZyBzY2hlZHVsZWQgYmVjYXVzZSBhIHBhcmVudCAoZWFjaC9hd2FpdC9ldGMpIGJsb2NrXG5cdFx0Ly8gdXBkYXRlZCBhbiBpbnRlcm5hbCBzb3VyY2UsIGJhaWwgb3V0IG9yIHdlJ2xsIGNhdXNlIGEgc2Vjb25kIGZsdXNoXG5cdFx0aWYgKFxuXHRcdFx0aXNfZmx1c2hpbmcgJiZcblx0XHRcdGVmZmVjdCA9PT0gYWN0aXZlX2VmZmVjdCAmJlxuXHRcdFx0KGZsYWdzICYgQkxPQ0tfRUZGRUNUKSAhPT0gMCAmJlxuXHRcdFx0KGZsYWdzICYgSEVBRF9FRkZFQ1QpID09PSAwXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKChmbGFncyAmIChST09UX0VGRkVDVCB8IEJSQU5DSF9FRkZFQ1QpKSAhPT0gMCkge1xuXHRcdFx0aWYgKChmbGFncyAmIENMRUFOKSA9PT0gMCkgcmV0dXJuO1xuXHRcdFx0ZWZmZWN0LmYgXj0gQ0xFQU47XG5cdFx0fVxuXHR9XG5cblx0cXVldWVkX3Jvb3RfZWZmZWN0cy5wdXNoKGVmZmVjdCk7XG59XG5cbi8qKiBAdHlwZSB7U291cmNlPG51bWJlcj5bXX0gKi9cbmxldCBlYWdlcl92ZXJzaW9ucyA9IFtdO1xuXG5mdW5jdGlvbiBlYWdlcl9mbHVzaCgpIHtcblx0dHJ5IHtcblx0XHRmbHVzaFN5bmMoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB2ZXJzaW9uIG9mIGVhZ2VyX3ZlcnNpb25zKSB7XG5cdFx0XHRcdHVwZGF0ZSh2ZXJzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBmaW5hbGx5IHtcblx0XHRlYWdlcl92ZXJzaW9ucyA9IFtdO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYCRzdGF0ZS5lYWdlcihmbigpKWBcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0geygpID0+IFR9IGZuXG4gKiBAcmV0dXJucyB7VH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVhZ2VyKGZuKSB7XG5cdHZhciB2ZXJzaW9uID0gc291cmNlKDApO1xuXHR2YXIgaW5pdGlhbCA9IHRydWU7XG5cdHZhciB2YWx1ZSA9IC8qKiBAdHlwZSB7VH0gKi8gKHVuZGVmaW5lZCk7XG5cblx0Z2V0KHZlcnNpb24pO1xuXG5cdGVhZ2VyX2VmZmVjdCgoKSA9PiB7XG5cdFx0aWYgKGluaXRpYWwpIHtcblx0XHRcdC8vIHRoZSBmaXJzdCB0aW1lIHRoaXMgcnVucywgd2UgY3JlYXRlIGFuIGVhZ2VyIGVmZmVjdFxuXHRcdFx0Ly8gdGhhdCB3aWxsIHJ1biBlYWdlcmx5IHdoZW5ldmVyIHRoZSBleHByZXNzaW9uIGNoYW5nZXNcblx0XHRcdHZhciBwcmV2aW91c19iYXRjaF92YWx1ZXMgPSBiYXRjaF92YWx1ZXM7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGJhdGNoX3ZhbHVlcyA9IG51bGw7XG5cdFx0XHRcdHZhbHVlID0gZm4oKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGJhdGNoX3ZhbHVlcyA9IHByZXZpb3VzX2JhdGNoX3ZhbHVlcztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHRoZSBzZWNvbmQgdGltZSB0aGlzIGVmZmVjdCBydW5zLCBpdCdzIHRvIHNjaGVkdWxlIGFcblx0XHQvLyBgdmVyc2lvbmAgdXBkYXRlLiBzaW5jZSB0aGlzIHdpbGwgcmVjcmVhdGUgdGhlIGVmZmVjdCxcblx0XHQvLyB3ZSBkb24ndCBuZWVkIHRvIGV2YWx1YXRlIHRoZSBleHByZXNzaW9uIGhlcmVcblx0XHRpZiAoZWFnZXJfdmVyc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRxdWV1ZV9taWNyb190YXNrKGVhZ2VyX2ZsdXNoKTtcblx0XHR9XG5cblx0XHRlYWdlcl92ZXJzaW9ucy5wdXNoKHZlcnNpb24pO1xuXHR9KTtcblxuXHRpbml0aWFsID0gZmFsc2U7XG5cblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSAnZm9yaycsIGluIHdoaWNoIHN0YXRlIGNoYW5nZXMgYXJlIGV2YWx1YXRlZCBidXQgbm90IGFwcGxpZWQgdG8gdGhlIERPTS5cbiAqIFRoaXMgaXMgdXNlZnVsIGZvciBzcGVjdWxhdGl2ZWx5IGxvYWRpbmcgZGF0YSAoZm9yIGV4YW1wbGUpIHdoZW4geW91IHN1c3BlY3QgdGhhdFxuICogdGhlIHVzZXIgaXMgYWJvdXQgdG8gdGFrZSBzb21lIGFjdGlvbi5cbiAqXG4gKiBGcmFtZXdvcmtzIGxpa2UgU3ZlbHRlS2l0IGNhbiB1c2UgdGhpcyB0byBwcmVsb2FkIGRhdGEgd2hlbiB0aGUgdXNlciB0b3VjaGVzIG9yXG4gKiBob3ZlcnMgb3ZlciBhIGxpbmssIG1ha2luZyBhbnkgc3Vic2VxdWVudCBuYXZpZ2F0aW9uIGZlZWwgaW5zdGFudGFuZW91cy5cbiAqXG4gKiBUaGUgYGZuYCBwYXJhbWV0ZXIgaXMgYSBzeW5jaHJvbm91cyBmdW5jdGlvbiB0aGF0IG1vZGlmaWVzIHNvbWUgc3RhdGUuIFRoZVxuICogc3RhdGUgY2hhbmdlcyB3aWxsIGJlIHJldmVydGVkIGFmdGVyIHRoZSBmb3JrIGlzIGluaXRpYWxpc2VkLCB0aGVuIHJlYXBwbGllZFxuICogaWYgYW5kIHdoZW4gdGhlIGZvcmsgaXMgZXZlbnR1YWxseSBjb21taXR0ZWQuXG4gKlxuICogV2hlbiBpdCBiZWNvbWVzIGNsZWFyIHRoYXQgYSBmb3JrIHdpbGwgX25vdF8gYmUgY29tbWl0dGVkIChlLmcuIGJlY2F1c2UgdGhlXG4gKiB1c2VyIG5hdmlnYXRlZCBlbHNld2hlcmUpLCBpdCBtdXN0IGJlIGRpc2NhcmRlZCB0byBhdm9pZCBsZWFraW5nIG1lbW9yeS5cbiAqXG4gKiBAcGFyYW0geygpID0+IHZvaWR9IGZuXG4gKiBAcmV0dXJucyB7Rm9ya31cbiAqIEBzaW5jZSA1LjQyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JrKGZuKSB7XG5cdGlmICghYXN5bmNfbW9kZV9mbGFnKSB7XG5cdFx0ZS5leHBlcmltZW50YWxfYXN5bmNfcmVxdWlyZWQoJ2ZvcmsnKTtcblx0fVxuXG5cdGlmIChjdXJyZW50X2JhdGNoICE9PSBudWxsKSB7XG5cdFx0ZS5mb3JrX3RpbWluZygpO1xuXHR9XG5cblx0dmFyIGJhdGNoID0gQmF0Y2guZW5zdXJlKCk7XG5cdGJhdGNoLmlzX2ZvcmsgPSB0cnVlO1xuXHRiYXRjaF92YWx1ZXMgPSBuZXcgTWFwKCk7XG5cblx0dmFyIGNvbW1pdHRlZCA9IGZhbHNlO1xuXHR2YXIgc2V0dGxlZCA9IGJhdGNoLnNldHRsZWQoKTtcblxuXHRmbHVzaFN5bmMoZm4pO1xuXG5cdGJhdGNoX3ZhbHVlcyA9IG51bGw7XG5cblx0Ly8gcmV2ZXJ0IHN0YXRlIGNoYW5nZXNcblx0Zm9yICh2YXIgW3NvdXJjZSwgdmFsdWVdIG9mIGJhdGNoLnByZXZpb3VzKSB7XG5cdFx0c291cmNlLnYgPSB2YWx1ZTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0Y29tbWl0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoY29tbWl0dGVkKSB7XG5cdFx0XHRcdGF3YWl0IHNldHRsZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFiYXRjaGVzLmhhcyhiYXRjaCkpIHtcblx0XHRcdFx0ZS5mb3JrX2Rpc2NhcmRlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb21taXR0ZWQgPSB0cnVlO1xuXG5cdFx0XHRiYXRjaC5pc19mb3JrID0gZmFsc2U7XG5cblx0XHRcdC8vIGFwcGx5IGNoYW5nZXNcblx0XHRcdGZvciAodmFyIFtzb3VyY2UsIHZhbHVlXSBvZiBiYXRjaC5jdXJyZW50KSB7XG5cdFx0XHRcdHNvdXJjZS52ID0gdmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHRyaWdnZXIgYW55IGAkc3RhdGUuZWFnZXIoLi4uKWAgZXhwcmVzc2lvbnMgd2l0aCB0aGUgbmV3IHN0YXRlLlxuXHRcdFx0Ly8gZWFnZXIgZWZmZWN0cyBkb24ndCBnZXQgc2NoZWR1bGVkIGxpa2Ugb3RoZXIgZWZmZWN0cywgc28gd2Vcblx0XHRcdC8vIGNhbid0IGp1c3QgZW5jb3VudGVyIHRoZW0gZHVyaW5nIHRyYXZlcnNhbCwgd2UgbmVlZCB0b1xuXHRcdFx0Ly8gcHJvYWN0aXZlbHkgZmx1c2ggdGhlbVxuXHRcdFx0Ly8gVE9ETyBtYXliZSB0aGVyZSdzIGEgYmV0dGVyIGltcGxlbWVudGF0aW9uP1xuXHRcdFx0Zmx1c2hTeW5jKCgpID0+IHtcblx0XHRcdFx0LyoqIEB0eXBlIHtTZXQ8RWZmZWN0Pn0gKi9cblx0XHRcdFx0dmFyIGVhZ2VyX2VmZmVjdHMgPSBuZXcgU2V0KCk7XG5cblx0XHRcdFx0Zm9yICh2YXIgc291cmNlIG9mIGJhdGNoLmN1cnJlbnQua2V5cygpKSB7XG5cdFx0XHRcdFx0bWFya19lYWdlcl9lZmZlY3RzKHNvdXJjZSwgZWFnZXJfZWZmZWN0cyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXRfZWFnZXJfZWZmZWN0cyhlYWdlcl9lZmZlY3RzKTtcblx0XHRcdFx0Zmx1c2hfZWFnZXJfZWZmZWN0cygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGJhdGNoLnJldml2ZSgpO1xuXHRcdFx0YXdhaXQgc2V0dGxlZDtcblx0XHR9LFxuXHRcdGRpc2NhcmQ6ICgpID0+IHtcblx0XHRcdGlmICghY29tbWl0dGVkICYmIGJhdGNoZXMuaGFzKGJhdGNoKSkge1xuXHRcdFx0XHRiYXRjaGVzLmRlbGV0ZShiYXRjaCk7XG5cdFx0XHRcdGJhdGNoLmRpc2NhcmQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogRm9yY2libHkgcmVtb3ZlIGFsbCBjdXJyZW50IGJhdGNoZXMsIHRvIHByZXZlbnQgY3Jvc3MtdGFsayBiZXR3ZWVuIHRlc3RzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcigpIHtcblx0YmF0Y2hlcy5jbGVhcigpO1xufVxuIiwiLyoqIEBpbXBvcnQgeyBFYWNoSXRlbSwgRWFjaFN0YXRlLCBFZmZlY3QsIE1heWJlU291cmNlLCBTb3VyY2UsIFRlbXBsYXRlTm9kZSwgVHJhbnNpdGlvbk1hbmFnZXIsIFZhbHVlIH0gZnJvbSAnI2NsaWVudCcgKi9cbi8qKiBAaW1wb3J0IHsgQmF0Y2ggfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2JhdGNoLmpzJzsgKi9cbmltcG9ydCB7XG5cdEVBQ0hfSU5ERVhfUkVBQ1RJVkUsXG5cdEVBQ0hfSVNfQU5JTUFURUQsXG5cdEVBQ0hfSVNfQ09OVFJPTExFRCxcblx0RUFDSF9JVEVNX0lNTVVUQUJMRSxcblx0RUFDSF9JVEVNX1JFQUNUSVZFLFxuXHRIWURSQVRJT05fRU5ELFxuXHRIWURSQVRJT05fU1RBUlRfRUxTRVxufSBmcm9tICcuLi8uLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHtcblx0aHlkcmF0ZV9uZXh0LFxuXHRoeWRyYXRlX25vZGUsXG5cdGh5ZHJhdGluZyxcblx0cmVhZF9oeWRyYXRpb25faW5zdHJ1Y3Rpb24sXG5cdHNraXBfbm9kZXMsXG5cdHNldF9oeWRyYXRlX25vZGUsXG5cdHNldF9oeWRyYXRpbmdcbn0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7XG5cdGNsZWFyX3RleHRfY29udGVudCxcblx0Y3JlYXRlX3RleHQsXG5cdGdldF9maXJzdF9jaGlsZCxcblx0Z2V0X25leHRfc2libGluZyxcblx0c2hvdWxkX2RlZmVyX2FwcGVuZFxufSBmcm9tICcuLi9vcGVyYXRpb25zLmpzJztcbmltcG9ydCB7XG5cdGJsb2NrLFxuXHRicmFuY2gsXG5cdGRlc3Ryb3lfZWZmZWN0LFxuXHRydW5fb3V0X3RyYW5zaXRpb25zLFxuXHRwYXVzZV9jaGlsZHJlbixcblx0cGF1c2VfZWZmZWN0LFxuXHRyZXN1bWVfZWZmZWN0XG59IGZyb20gJy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBzb3VyY2UsIG11dGFibGVfc291cmNlLCBpbnRlcm5hbF9zZXQgfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L3NvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXJyYXlfZnJvbSwgaXNfYXJyYXkgfSBmcm9tICcuLi8uLi8uLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHsgQ09NTUVOVF9OT0RFLCBJTkVSVCB9IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7IHF1ZXVlX21pY3JvX3Rhc2sgfSBmcm9tICcuLi90YXNrLmpzJztcbmltcG9ydCB7IGdldCB9IGZyb20gJy4uLy4uL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQgeyBkZXJpdmVkX3NhZmVfZXF1YWwgfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2Rlcml2ZWRzLmpzJztcbmltcG9ydCB7IGN1cnJlbnRfYmF0Y2ggfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2JhdGNoLmpzJztcblxuLyoqXG4gKiBUaGUgcm93IG9mIGEga2V5ZWQgZWFjaCBibG9jayB0aGF0IGlzIGN1cnJlbnRseSB1cGRhdGluZy4gV2UgdHJhY2sgdGhpc1xuICogc28gdGhhdCBgYW5pbWF0ZTpgIGRpcmVjdGl2ZXMgaGF2ZSBzb21ldGhpbmcgdG8gYXR0YWNoIHRoZW1zZWx2ZXMgdG9cbiAqIEB0eXBlIHtFYWNoSXRlbSB8IG51bGx9XG4gKi9cbmV4cG9ydCBsZXQgY3VycmVudF9lYWNoX2l0ZW0gPSBudWxsO1xuXG4vKiogQHBhcmFtIHtFYWNoSXRlbSB8IG51bGx9IGl0ZW0gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfY3VycmVudF9lYWNoX2l0ZW0oaXRlbSkge1xuXHRjdXJyZW50X2VhY2hfaXRlbSA9IGl0ZW07XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IF9cbiAqIEBwYXJhbSB7bnVtYmVyfSBpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbmRleChfLCBpKSB7XG5cdHJldHVybiBpO1xufVxuXG4vKipcbiAqIFBhdXNlIG11bHRpcGxlIGVmZmVjdHMgc2ltdWx0YW5lb3VzbHksIGFuZCBjb29yZGluYXRlIHRoZWlyXG4gKiBzdWJzZXF1ZW50IGRlc3RydWN0aW9uLiBVc2VkIGluIGVhY2ggYmxvY2tzXG4gKiBAcGFyYW0ge0VhY2hTdGF0ZX0gc3RhdGVcbiAqIEBwYXJhbSB7RWFjaEl0ZW1bXX0gdG9fZGVzdHJveVxuICogQHBhcmFtIHtudWxsIHwgTm9kZX0gY29udHJvbGxlZF9hbmNob3JcbiAqL1xuZnVuY3Rpb24gcGF1c2VfZWZmZWN0cyhzdGF0ZSwgdG9fZGVzdHJveSwgY29udHJvbGxlZF9hbmNob3IpIHtcblx0LyoqIEB0eXBlIHtUcmFuc2l0aW9uTWFuYWdlcltdfSAqL1xuXHR2YXIgdHJhbnNpdGlvbnMgPSBbXTtcblx0dmFyIGxlbmd0aCA9IHRvX2Rlc3Ryb3kubGVuZ3RoO1xuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRwYXVzZV9jaGlsZHJlbih0b19kZXN0cm95W2ldLmUsIHRyYW5zaXRpb25zLCB0cnVlKTtcblx0fVxuXG5cdHJ1bl9vdXRfdHJhbnNpdGlvbnModHJhbnNpdGlvbnMsICgpID0+IHtcblx0XHQvLyBJZiB3ZSdyZSBpbiBhIGNvbnRyb2xsZWQgZWFjaCBibG9jayAoaS5lLiB0aGUgYmxvY2sgaXMgdGhlIG9ubHkgY2hpbGQgb2YgYW5cblx0XHQvLyBlbGVtZW50KSwgYW5kIHdlIGFyZSByZW1vdmluZyBhbGwgaXRlbXMsIF9hbmRfIHRoZXJlIGFyZSBubyBvdXQgdHJhbnNpdGlvbnMsXG5cdFx0Ly8gd2UgY2FuIHVzZSB0aGUgZmFzdCBwYXRoIOKAlCBlbXB0eWluZyB0aGUgZWxlbWVudCBhbmQgcmVwbGFjaW5nIHRoZSBhbmNob3Jcblx0XHR2YXIgZmFzdF9wYXRoID0gdHJhbnNpdGlvbnMubGVuZ3RoID09PSAwICYmIGNvbnRyb2xsZWRfYW5jaG9yICE9PSBudWxsO1xuXG5cdFx0Ly8gVE9ETyBvbmx5IGRlc3Ryb3kgZWZmZWN0cyBpZiBubyBwZW5kaW5nIGJhdGNoIG5lZWRzIHRoZW0uIG90aGVyd2lzZSxcblx0XHQvLyBqdXN0IHNldCBgaXRlbS5vYCBiYWNrIHRvIGBmYWxzZWBcblxuXHRcdGlmIChmYXN0X3BhdGgpIHtcblx0XHRcdHZhciBhbmNob3IgPSAvKiogQHR5cGUge0VsZW1lbnR9ICovIChjb250cm9sbGVkX2FuY2hvcik7XG5cdFx0XHR2YXIgcGFyZW50X25vZGUgPSAvKiogQHR5cGUge0VsZW1lbnR9ICovIChhbmNob3IucGFyZW50Tm9kZSk7XG5cblx0XHRcdGNsZWFyX3RleHRfY29udGVudChwYXJlbnRfbm9kZSk7XG5cdFx0XHRwYXJlbnRfbm9kZS5hcHBlbmQoYW5jaG9yKTtcblxuXHRcdFx0c3RhdGUuaXRlbXMuY2xlYXIoKTtcblx0XHRcdGxpbmsoc3RhdGUsIHRvX2Rlc3Ryb3lbMF0ucHJldiwgdG9fZGVzdHJveVtsZW5ndGggLSAxXS5uZXh0KTtcblx0XHR9XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgaXRlbSA9IHRvX2Rlc3Ryb3lbaV07XG5cblx0XHRcdGlmICghZmFzdF9wYXRoKSB7XG5cdFx0XHRcdHN0YXRlLml0ZW1zLmRlbGV0ZShpdGVtLmspO1xuXHRcdFx0XHRsaW5rKHN0YXRlLCBpdGVtLnByZXYsIGl0ZW0ubmV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdGRlc3Ryb3lfZWZmZWN0KGl0ZW0uZSwgIWZhc3RfcGF0aCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlLmZpcnN0ID09PSB0b19kZXN0cm95WzBdKSB7XG5cdFx0XHRzdGF0ZS5maXJzdCA9IHRvX2Rlc3Ryb3lbMF0ucHJldjtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge0VsZW1lbnQgfCBDb21tZW50fSBub2RlIFRoZSBuZXh0IHNpYmxpbmcgbm9kZSwgb3IgdGhlIHBhcmVudCBub2RlIGlmIHRoaXMgaXMgYSAnY29udHJvbGxlZCcgYmxvY2tcbiAqIEBwYXJhbSB7bnVtYmVyfSBmbGFnc1xuICogQHBhcmFtIHsoKSA9PiBWW119IGdldF9jb2xsZWN0aW9uXG4gKiBAcGFyYW0geyh2YWx1ZTogViwgaW5kZXg6IG51bWJlcikgPT4gYW55fSBnZXRfa2V5XG4gKiBAcGFyYW0geyhhbmNob3I6IE5vZGUsIGl0ZW06IE1heWJlU291cmNlPFY+LCBpbmRleDogTWF5YmVTb3VyY2U8bnVtYmVyPikgPT4gdm9pZH0gcmVuZGVyX2ZuXG4gKiBAcGFyYW0ge251bGwgfCAoKGFuY2hvcjogTm9kZSkgPT4gdm9pZCl9IGZhbGxiYWNrX2ZuXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVhY2gobm9kZSwgZmxhZ3MsIGdldF9jb2xsZWN0aW9uLCBnZXRfa2V5LCByZW5kZXJfZm4sIGZhbGxiYWNrX2ZuID0gbnVsbCkge1xuXHR2YXIgYW5jaG9yID0gbm9kZTtcblxuXHQvKiogQHR5cGUge01hcDxhbnksIEVhY2hJdGVtPn0gKi9cblx0dmFyIGl0ZW1zID0gbmV3IE1hcCgpO1xuXG5cdC8qKiBAdHlwZSB7RWFjaEl0ZW0gfCBudWxsfSAqL1xuXHR2YXIgZmlyc3QgPSBudWxsO1xuXG5cdHZhciBpc19jb250cm9sbGVkID0gKGZsYWdzICYgRUFDSF9JU19DT05UUk9MTEVEKSAhPT0gMDtcblx0dmFyIGlzX3JlYWN0aXZlX3ZhbHVlID0gKGZsYWdzICYgRUFDSF9JVEVNX1JFQUNUSVZFKSAhPT0gMDtcblx0dmFyIGlzX3JlYWN0aXZlX2luZGV4ID0gKGZsYWdzICYgRUFDSF9JTkRFWF9SRUFDVElWRSkgIT09IDA7XG5cblx0aWYgKGlzX2NvbnRyb2xsZWQpIHtcblx0XHR2YXIgcGFyZW50X25vZGUgPSAvKiogQHR5cGUge0VsZW1lbnR9ICovIChub2RlKTtcblxuXHRcdGFuY2hvciA9IGh5ZHJhdGluZ1xuXHRcdFx0PyBzZXRfaHlkcmF0ZV9ub2RlKC8qKiBAdHlwZSB7Q29tbWVudCB8IFRleHR9ICovIChnZXRfZmlyc3RfY2hpbGQocGFyZW50X25vZGUpKSlcblx0XHRcdDogcGFyZW50X25vZGUuYXBwZW5kQ2hpbGQoY3JlYXRlX3RleHQoKSk7XG5cdH1cblxuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0aHlkcmF0ZV9uZXh0KCk7XG5cdH1cblxuXHQvKiogQHR5cGUge3sgZnJhZ21lbnQ6IERvY3VtZW50RnJhZ21lbnQgfCBudWxsLCBlZmZlY3Q6IEVmZmVjdCB9IHwgbnVsbH0gKi9cblx0dmFyIGZhbGxiYWNrID0gbnVsbDtcblxuXHQvLyBUT0RPOiBpZGVhbGx5IHdlIGNvdWxkIHVzZSBkZXJpdmVkIGZvciBydW5lcyBtb2RlIGJ1dCBiZWNhdXNlIG9mIHRoZSBhYmlsaXR5XG5cdC8vIHRvIHVzZSBhIHN0b3JlIHdoaWNoIGNhbiBiZSBtdXRhdGVkLCB3ZSBjYW4ndCBkbyB0aGF0IGhlcmUgYXMgbXV0YXRpbmcgYSBzdG9yZVxuXHQvLyB3aWxsIHN0aWxsIHJlc3VsdCBpbiB0aGUgY29sbGVjdGlvbiBhcnJheSBiZWluZyB0aGUgc2FtZSBmcm9tIHRoZSBzdG9yZVxuXHR2YXIgZWFjaF9hcnJheSA9IGRlcml2ZWRfc2FmZV9lcXVhbCgoKSA9PiB7XG5cdFx0dmFyIGNvbGxlY3Rpb24gPSBnZXRfY29sbGVjdGlvbigpO1xuXG5cdFx0cmV0dXJuIGlzX2FycmF5KGNvbGxlY3Rpb24pID8gY29sbGVjdGlvbiA6IGNvbGxlY3Rpb24gPT0gbnVsbCA/IFtdIDogYXJyYXlfZnJvbShjb2xsZWN0aW9uKTtcblx0fSk7XG5cblx0LyoqIEB0eXBlIHtWW119ICovXG5cdHZhciBhcnJheTtcblxuXHR2YXIgZmlyc3RfcnVuID0gdHJ1ZTtcblxuXHRmdW5jdGlvbiBjb21taXQoKSB7XG5cdFx0cmVjb25jaWxlKHN0YXRlLCBhcnJheSwgYW5jaG9yLCBmbGFncywgZ2V0X2tleSk7XG5cblx0XHRpZiAoZmFsbGJhY2sgIT09IG51bGwpIHtcblx0XHRcdGlmIChhcnJheS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0aWYgKGZhbGxiYWNrLmZyYWdtZW50KSB7XG5cdFx0XHRcdFx0YW5jaG9yLmJlZm9yZShmYWxsYmFjay5mcmFnbWVudCk7XG5cdFx0XHRcdFx0ZmFsbGJhY2suZnJhZ21lbnQgPSBudWxsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VtZV9lZmZlY3QoZmFsbGJhY2suZWZmZWN0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVmZmVjdC5maXJzdCA9IGZhbGxiYWNrLmVmZmVjdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhdXNlX2VmZmVjdChmYWxsYmFjay5lZmZlY3QsICgpID0+IHtcblx0XHRcdFx0XHQvLyBUT0RPIG9ubHkgbnVsbCBvdXQgaWYgbm8gcGVuZGluZyBiYXRjaCBuZWVkcyBpdCxcblx0XHRcdFx0XHQvLyBvdGhlcndpc2UgcmUtYWRkIGBmYWxsYmFjay5mcmFnbWVudGAgYW5kIG1vdmUgdGhlXG5cdFx0XHRcdFx0Ly8gZWZmZWN0IGludG8gaXRcblx0XHRcdFx0XHRmYWxsYmFjayA9IG51bGw7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhciBlZmZlY3QgPSBibG9jaygoKSA9PiB7XG5cdFx0YXJyYXkgPSAvKiogQHR5cGUge1ZbXX0gKi8gKGdldChlYWNoX2FycmF5KSk7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuXHRcdC8qKiBgdHJ1ZWAgaWYgdGhlcmUgd2FzIGEgaHlkcmF0aW9uIG1pc21hdGNoLiBOZWVkcyB0byBiZSBhIGBsZXRgIG9yIGVsc2UgaXQgaXNuJ3QgdHJlZXNoYWtlbiBvdXQgKi9cblx0XHRsZXQgbWlzbWF0Y2ggPSBmYWxzZTtcblxuXHRcdGlmIChoeWRyYXRpbmcpIHtcblx0XHRcdHZhciBpc19lbHNlID0gcmVhZF9oeWRyYXRpb25faW5zdHJ1Y3Rpb24oYW5jaG9yKSA9PT0gSFlEUkFUSU9OX1NUQVJUX0VMU0U7XG5cblx0XHRcdGlmIChpc19lbHNlICE9PSAobGVuZ3RoID09PSAwKSkge1xuXHRcdFx0XHQvLyBoeWRyYXRpb24gbWlzbWF0Y2gg4oCUIHJlbW92ZSB0aGUgc2VydmVyLXJlbmRlcmVkIERPTSBhbmQgc3RhcnQgb3ZlclxuXHRcdFx0XHRhbmNob3IgPSBza2lwX25vZGVzKCk7XG5cblx0XHRcdFx0c2V0X2h5ZHJhdGVfbm9kZShhbmNob3IpO1xuXHRcdFx0XHRzZXRfaHlkcmF0aW5nKGZhbHNlKTtcblx0XHRcdFx0bWlzbWF0Y2ggPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHZhciBrZXlzID0gbmV3IFNldCgpO1xuXHRcdHZhciBiYXRjaCA9IC8qKiBAdHlwZSB7QmF0Y2h9ICovIChjdXJyZW50X2JhdGNoKTtcblx0XHR2YXIgcHJldiA9IG51bGw7XG5cdFx0dmFyIGRlZmVyID0gc2hvdWxkX2RlZmVyX2FwcGVuZCgpO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRoeWRyYXRpbmcgJiZcblx0XHRcdFx0aHlkcmF0ZV9ub2RlLm5vZGVUeXBlID09PSBDT01NRU5UX05PREUgJiZcblx0XHRcdFx0LyoqIEB0eXBlIHtDb21tZW50fSAqLyAoaHlkcmF0ZV9ub2RlKS5kYXRhID09PSBIWURSQVRJT05fRU5EXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gVGhlIHNlcnZlciByZW5kZXJlZCBmZXdlciBpdGVtcyB0aGFuIGV4cGVjdGVkLFxuXHRcdFx0XHQvLyBzbyBicmVhayBvdXQgYW5kIGNvbnRpbnVlIGFwcGVuZGluZyBub24taHlkcmF0ZWQgaXRlbXNcblx0XHRcdFx0YW5jaG9yID0gLyoqIEB0eXBlIHtDb21tZW50fSAqLyAoaHlkcmF0ZV9ub2RlKTtcblx0XHRcdFx0bWlzbWF0Y2ggPSB0cnVlO1xuXHRcdFx0XHRzZXRfaHlkcmF0aW5nKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0dmFyIHZhbHVlID0gYXJyYXlbaV07XG5cdFx0XHR2YXIga2V5ID0gZ2V0X2tleSh2YWx1ZSwgaSk7XG5cblx0XHRcdHZhciBpdGVtID0gZmlyc3RfcnVuID8gbnVsbCA6IGl0ZW1zLmdldChrZXkpO1xuXG5cdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHQvLyB1cGRhdGUgYmVmb3JlIHJlY29uY2lsaWF0aW9uLCB0byB0cmlnZ2VyIGFueSBhc3luYyB1cGRhdGVzXG5cdFx0XHRcdGlmIChpc19yZWFjdGl2ZV92YWx1ZSkge1xuXHRcdFx0XHRcdGludGVybmFsX3NldChpdGVtLnYsIHZhbHVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc19yZWFjdGl2ZV9pbmRleCkge1xuXHRcdFx0XHRcdGludGVybmFsX3NldCgvKiogQHR5cGUge1ZhbHVlPG51bWJlcj59ICovIChpdGVtLmkpLCBpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpdGVtLmkgPSBpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRlZmVyKSB7XG5cdFx0XHRcdFx0YmF0Y2guc2tpcHBlZF9lZmZlY3RzLmRlbGV0ZShpdGVtLmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpdGVtID0gY3JlYXRlX2l0ZW0oXG5cdFx0XHRcdFx0Zmlyc3RfcnVuID8gYW5jaG9yIDogbnVsbCxcblx0XHRcdFx0XHRwcmV2LFxuXHRcdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRpLFxuXHRcdFx0XHRcdHJlbmRlcl9mbixcblx0XHRcdFx0XHRmbGFncyxcblx0XHRcdFx0XHRnZXRfY29sbGVjdGlvblxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGlmIChmaXJzdF9ydW4pIHtcblx0XHRcdFx0XHRpdGVtLm8gPSB0cnVlO1xuXG5cdFx0XHRcdFx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGZpcnN0ID0gaXRlbTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cHJldi5uZXh0ID0gaXRlbTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRwcmV2ID0gaXRlbTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW1zLnNldChrZXksIGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzLmFkZChrZXkpO1xuXHRcdH1cblxuXHRcdGlmIChsZW5ndGggPT09IDAgJiYgZmFsbGJhY2tfZm4gJiYgIWZhbGxiYWNrKSB7XG5cdFx0XHRpZiAoZmlyc3RfcnVuKSB7XG5cdFx0XHRcdGZhbGxiYWNrID0ge1xuXHRcdFx0XHRcdGZyYWdtZW50OiBudWxsLFxuXHRcdFx0XHRcdGVmZmVjdDogYnJhbmNoKCgpID0+IGZhbGxiYWNrX2ZuKGFuY2hvcikpXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0XHRcdHZhciB0YXJnZXQgPSBjcmVhdGVfdGV4dCgpO1xuXHRcdFx0XHRmcmFnbWVudC5hcHBlbmQodGFyZ2V0KTtcblxuXHRcdFx0XHRmYWxsYmFjayA9IHtcblx0XHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0XHRlZmZlY3Q6IGJyYW5jaCgoKSA9PiBmYWxsYmFja19mbih0YXJnZXQpKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHJlbW92ZSBleGNlc3Mgbm9kZXNcblx0XHRpZiAoaHlkcmF0aW5nICYmIGxlbmd0aCA+IDApIHtcblx0XHRcdHNldF9oeWRyYXRlX25vZGUoc2tpcF9ub2RlcygpKTtcblx0XHR9XG5cblx0XHRpZiAoIWZpcnN0X3J1bikge1xuXHRcdFx0aWYgKGRlZmVyKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgaXRlbV0gb2YgaXRlbXMpIHtcblx0XHRcdFx0XHRpZiAoIWtleXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdGJhdGNoLnNraXBwZWRfZWZmZWN0cy5hZGQoaXRlbS5lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXRjaC5vbmNvbW1pdChjb21taXQpO1xuXHRcdFx0XHRiYXRjaC5vbmRpc2NhcmQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIFRPRE8gcHJlc3VtYWJseSB3ZSBuZWVkIHRvIGRvIHNvbWV0aGluZyBoZXJlP1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbW1pdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtaXNtYXRjaCkge1xuXHRcdFx0Ly8gY29udGludWUgaW4gaHlkcmF0aW9uIG1vZGVcblx0XHRcdHNldF9oeWRyYXRpbmcodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB3ZSBtb3VudCB0aGUgZWFjaCBibG9jayBmb3IgdGhlIGZpcnN0IHRpbWUsIHRoZSBjb2xsZWN0aW9uIHdvbid0IGJlXG5cdFx0Ly8gY29ubmVjdGVkIHRvIHRoaXMgZWZmZWN0IGFzIHRoZSBlZmZlY3QgaGFzbid0IGZpbmlzaGVkIHJ1bm5pbmcgeWV0IGFuZCBpdHMgZGVwc1xuXHRcdC8vIHdvbid0IGJlIGFzc2lnbmVkLiBIb3dldmVyLCBpdCdzIHBvc3NpYmxlIHRoYXQgd2hlbiByZWNvbmNpbGluZyB0aGUgZWFjaCBibG9ja1xuXHRcdC8vIHRoYXQgYSBtdXRhdGlvbiBvY2N1cnJlZCBhbmQgaXQncyBtYWRlIHRoZSBjb2xsZWN0aW9uIE1BWUJFX0RJUlRZLCBzbyByZWFkaW5nIHRoZVxuXHRcdC8vIGNvbGxlY3Rpb24gYWdhaW4gY2FuIHByb3ZpZGUgY29uc2lzdGVuY3kgdG8gdGhlIHJlYWN0aXZlIGdyYXBoIGFnYWluIGFzIHRoZSBkZXJpdmVkc1xuXHRcdC8vIHdpbGwgbm93IGJlIGBDTEVBTmAuXG5cdFx0Z2V0KGVhY2hfYXJyYXkpO1xuXHR9KTtcblxuXHQvKiogQHR5cGUge0VhY2hTdGF0ZX0gKi9cblx0dmFyIHN0YXRlID0geyBlZmZlY3QsIGZsYWdzLCBpdGVtcywgZmlyc3QgfTtcblxuXHRmaXJzdF9ydW4gPSBmYWxzZTtcblxuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0YW5jaG9yID0gaHlkcmF0ZV9ub2RlO1xuXHR9XG59XG5cbi8qKlxuICogQWRkLCByZW1vdmUsIG9yIHJlb3JkZXIgaXRlbXMgb3V0cHV0IGJ5IGFuIGVhY2ggYmxvY2sgYXMgaXRzIGlucHV0IGNoYW5nZXNcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge0VhY2hTdGF0ZX0gc3RhdGVcbiAqIEBwYXJhbSB7QXJyYXk8Vj59IGFycmF5XG4gKiBAcGFyYW0ge0VsZW1lbnQgfCBDb21tZW50IHwgVGV4dH0gYW5jaG9yXG4gKiBAcGFyYW0ge251bWJlcn0gZmxhZ3NcbiAqIEBwYXJhbSB7KHZhbHVlOiBWLCBpbmRleDogbnVtYmVyKSA9PiBhbnl9IGdldF9rZXlcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5mdW5jdGlvbiByZWNvbmNpbGUoc3RhdGUsIGFycmF5LCBhbmNob3IsIGZsYWdzLCBnZXRfa2V5KSB7XG5cdHZhciBpc19hbmltYXRlZCA9IChmbGFncyAmIEVBQ0hfSVNfQU5JTUFURUQpICE9PSAwO1xuXG5cdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdHZhciBpdGVtcyA9IHN0YXRlLml0ZW1zO1xuXHR2YXIgY3VycmVudCA9IHN0YXRlLmZpcnN0O1xuXG5cdC8qKiBAdHlwZSB7dW5kZWZpbmVkIHwgU2V0PEVhY2hJdGVtPn0gKi9cblx0dmFyIHNlZW47XG5cblx0LyoqIEB0eXBlIHtFYWNoSXRlbSB8IG51bGx9ICovXG5cdHZhciBwcmV2ID0gbnVsbDtcblxuXHQvKiogQHR5cGUge3VuZGVmaW5lZCB8IFNldDxFYWNoSXRlbT59ICovXG5cdHZhciB0b19hbmltYXRlO1xuXG5cdC8qKiBAdHlwZSB7RWFjaEl0ZW1bXX0gKi9cblx0dmFyIG1hdGNoZWQgPSBbXTtcblxuXHQvKiogQHR5cGUge0VhY2hJdGVtW119ICovXG5cdHZhciBzdGFzaGVkID0gW107XG5cblx0LyoqIEB0eXBlIHtWfSAqL1xuXHR2YXIgdmFsdWU7XG5cblx0LyoqIEB0eXBlIHthbnl9ICovXG5cdHZhciBrZXk7XG5cblx0LyoqIEB0eXBlIHtFYWNoSXRlbSB8IHVuZGVmaW5lZH0gKi9cblx0dmFyIGl0ZW07XG5cblx0LyoqIEB0eXBlIHtudW1iZXJ9ICovXG5cdHZhciBpO1xuXG5cdGlmIChpc19hbmltYXRlZCkge1xuXHRcdGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0dmFsdWUgPSBhcnJheVtpXTtcblx0XHRcdGtleSA9IGdldF9rZXkodmFsdWUsIGkpO1xuXHRcdFx0aXRlbSA9IC8qKiBAdHlwZSB7RWFjaEl0ZW19ICovIChpdGVtcy5nZXQoa2V5KSk7XG5cblx0XHRcdC8vIG9mZnNjcmVlbiA9PSBjb21pbmcgaW4gbm93LCBubyBhbmltYXRpb24gaW4gdGhhdCBjYXNlLFxuXHRcdFx0Ly8gZWxzZSB0aGlzIHdvdWxkIGhhcHBlbiBodHRwczovL2dpdGh1Yi5jb20vc3ZlbHRlanMvc3ZlbHRlL2lzc3Vlcy8xNzE4MVxuXHRcdFx0aWYgKGl0ZW0ubykge1xuXHRcdFx0XHRpdGVtLmE/Lm1lYXN1cmUoKTtcblx0XHRcdFx0KHRvX2FuaW1hdGUgPz89IG5ldyBTZXQoKSkuYWRkKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuXHRcdHZhbHVlID0gYXJyYXlbaV07XG5cdFx0a2V5ID0gZ2V0X2tleSh2YWx1ZSwgaSk7XG5cblx0XHRpdGVtID0gLyoqIEB0eXBlIHtFYWNoSXRlbX0gKi8gKGl0ZW1zLmdldChrZXkpKTtcblxuXHRcdHN0YXRlLmZpcnN0ID8/PSBpdGVtO1xuXG5cdFx0aWYgKCFpdGVtLm8pIHtcblx0XHRcdGl0ZW0ubyA9IHRydWU7XG5cblx0XHRcdHZhciBuZXh0ID0gcHJldiA/IHByZXYubmV4dCA6IGN1cnJlbnQ7XG5cblx0XHRcdGxpbmsoc3RhdGUsIHByZXYsIGl0ZW0pO1xuXHRcdFx0bGluayhzdGF0ZSwgaXRlbSwgbmV4dCk7XG5cblx0XHRcdG1vdmUoaXRlbSwgbmV4dCwgYW5jaG9yKTtcblx0XHRcdHByZXYgPSBpdGVtO1xuXG5cdFx0XHRtYXRjaGVkID0gW107XG5cdFx0XHRzdGFzaGVkID0gW107XG5cblx0XHRcdGN1cnJlbnQgPSBwcmV2Lm5leHQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoKGl0ZW0uZS5mICYgSU5FUlQpICE9PSAwKSB7XG5cdFx0XHRyZXN1bWVfZWZmZWN0KGl0ZW0uZSk7XG5cdFx0XHRpZiAoaXNfYW5pbWF0ZWQpIHtcblx0XHRcdFx0aXRlbS5hPy51bmZpeCgpO1xuXHRcdFx0XHQodG9fYW5pbWF0ZSA/Pz0gbmV3IFNldCgpKS5kZWxldGUoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0gIT09IGN1cnJlbnQpIHtcblx0XHRcdGlmIChzZWVuICE9PSB1bmRlZmluZWQgJiYgc2Vlbi5oYXMoaXRlbSkpIHtcblx0XHRcdFx0aWYgKG1hdGNoZWQubGVuZ3RoIDwgc3Rhc2hlZC5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBtb3JlIGVmZmljaWVudCB0byBtb3ZlIGxhdGVyIGl0ZW1zIHRvIHRoZSBmcm9udFxuXHRcdFx0XHRcdHZhciBzdGFydCA9IHN0YXNoZWRbMF07XG5cdFx0XHRcdFx0dmFyIGo7XG5cblx0XHRcdFx0XHRwcmV2ID0gc3RhcnQucHJldjtcblxuXHRcdFx0XHRcdHZhciBhID0gbWF0Y2hlZFswXTtcblx0XHRcdFx0XHR2YXIgYiA9IG1hdGNoZWRbbWF0Y2hlZC5sZW5ndGggLSAxXTtcblxuXHRcdFx0XHRcdGZvciAoaiA9IDA7IGogPCBtYXRjaGVkLmxlbmd0aDsgaiArPSAxKSB7XG5cdFx0XHRcdFx0XHRtb3ZlKG1hdGNoZWRbal0sIHN0YXJ0LCBhbmNob3IpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoaiA9IDA7IGogPCBzdGFzaGVkLmxlbmd0aDsgaiArPSAxKSB7XG5cdFx0XHRcdFx0XHRzZWVuLmRlbGV0ZShzdGFzaGVkW2pdKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsaW5rKHN0YXRlLCBhLnByZXYsIGIubmV4dCk7XG5cdFx0XHRcdFx0bGluayhzdGF0ZSwgcHJldiwgYSk7XG5cdFx0XHRcdFx0bGluayhzdGF0ZSwgYiwgc3RhcnQpO1xuXG5cdFx0XHRcdFx0Y3VycmVudCA9IHN0YXJ0O1xuXHRcdFx0XHRcdHByZXYgPSBiO1xuXHRcdFx0XHRcdGkgLT0gMTtcblxuXHRcdFx0XHRcdG1hdGNoZWQgPSBbXTtcblx0XHRcdFx0XHRzdGFzaGVkID0gW107XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbW9yZSBlZmZpY2llbnQgdG8gbW92ZSBlYXJsaWVyIGl0ZW1zIHRvIHRoZSBiYWNrXG5cdFx0XHRcdFx0c2Vlbi5kZWxldGUoaXRlbSk7XG5cdFx0XHRcdFx0bW92ZShpdGVtLCBjdXJyZW50LCBhbmNob3IpO1xuXG5cdFx0XHRcdFx0bGluayhzdGF0ZSwgaXRlbS5wcmV2LCBpdGVtLm5leHQpO1xuXHRcdFx0XHRcdGxpbmsoc3RhdGUsIGl0ZW0sIHByZXYgPT09IG51bGwgPyBzdGF0ZS5maXJzdCA6IHByZXYubmV4dCk7XG5cdFx0XHRcdFx0bGluayhzdGF0ZSwgcHJldiwgaXRlbSk7XG5cblx0XHRcdFx0XHRwcmV2ID0gaXRlbTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXRjaGVkID0gW107XG5cdFx0XHRzdGFzaGVkID0gW107XG5cblx0XHRcdHdoaWxlIChjdXJyZW50ICE9PSBudWxsICYmIGN1cnJlbnQuayAhPT0ga2V5KSB7XG5cdFx0XHRcdC8vIElmIHRoZSBlYWNoIGJsb2NrIGlzbid0IGluZXJ0IGFuZCBhbiBpdGVtIGhhcyBhbiBlZmZlY3QgdGhhdCBpcyBhbHJlYWR5IGluZXJ0LFxuXHRcdFx0XHQvLyBza2lwIG92ZXIgYWRkaW5nIGl0IHRvIG91ciBzZWVuIFNldCBhcyB0aGUgaXRlbSBpcyBhbHJlYWR5IGJlaW5nIGhhbmRsZWRcblx0XHRcdFx0aWYgKChjdXJyZW50LmUuZiAmIElORVJUKSA9PT0gMCkge1xuXHRcdFx0XHRcdChzZWVuID8/PSBuZXcgU2V0KCkpLmFkZChjdXJyZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFzaGVkLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXJyZW50ID09PSBudWxsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtID0gY3VycmVudDtcblx0XHR9XG5cblx0XHRtYXRjaGVkLnB1c2goaXRlbSk7XG5cdFx0cHJldiA9IGl0ZW07XG5cdFx0Y3VycmVudCA9IGl0ZW0ubmV4dDtcblx0fVxuXG5cdGxldCBoYXNfb2Zmc2NyZWVuX2l0ZW1zID0gaXRlbXMuc2l6ZSA+IGxlbmd0aDtcblxuXHRpZiAoY3VycmVudCAhPT0gbnVsbCB8fCBzZWVuICE9PSB1bmRlZmluZWQpIHtcblx0XHR2YXIgdG9fZGVzdHJveSA9IHNlZW4gPT09IHVuZGVmaW5lZCA/IFtdIDogYXJyYXlfZnJvbShzZWVuKTtcblxuXHRcdHdoaWxlIChjdXJyZW50ICE9PSBudWxsKSB7XG5cdFx0XHQvLyBJZiB0aGUgZWFjaCBibG9jayBpc24ndCBpbmVydCwgdGhlbiBpbmVydCBlZmZlY3RzIGFyZSBjdXJyZW50bHkgb3V0cm9pbmcgYW5kIHdpbGwgYmUgcmVtb3ZlZCBvbmNlIHRoZSB0cmFuc2l0aW9uIGlzIGZpbmlzaGVkXG5cdFx0XHRpZiAoKGN1cnJlbnQuZS5mICYgSU5FUlQpID09PSAwKSB7XG5cdFx0XHRcdHRvX2Rlc3Ryb3kucHVzaChjdXJyZW50KTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0fVxuXG5cdFx0dmFyIGRlc3Ryb3lfbGVuZ3RoID0gdG9fZGVzdHJveS5sZW5ndGg7XG5cblx0XHRoYXNfb2Zmc2NyZWVuX2l0ZW1zID0gaXRlbXMuc2l6ZSAtIGRlc3Ryb3lfbGVuZ3RoID4gbGVuZ3RoO1xuXG5cdFx0aWYgKGRlc3Ryb3lfbGVuZ3RoID4gMCkge1xuXHRcdFx0dmFyIGNvbnRyb2xsZWRfYW5jaG9yID0gKGZsYWdzICYgRUFDSF9JU19DT05UUk9MTEVEKSAhPT0gMCAmJiBsZW5ndGggPT09IDAgPyBhbmNob3IgOiBudWxsO1xuXG5cdFx0XHRpZiAoaXNfYW5pbWF0ZWQpIHtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGRlc3Ryb3lfbGVuZ3RoOyBpICs9IDEpIHtcblx0XHRcdFx0XHR0b19kZXN0cm95W2ldLmE/Lm1lYXN1cmUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoaSA9IDA7IGkgPCBkZXN0cm95X2xlbmd0aDsgaSArPSAxKSB7XG5cdFx0XHRcdFx0dG9fZGVzdHJveVtpXS5hPy5maXgoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRwYXVzZV9lZmZlY3RzKHN0YXRlLCB0b19kZXN0cm95LCBjb250cm9sbGVkX2FuY2hvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQXBwZW5kIG9mZnNjcmVlbiBpdGVtcyBhdCB0aGUgZW5kXG5cdGlmIChoYXNfb2Zmc2NyZWVuX2l0ZW1zKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoIWl0ZW0ubykge1xuXHRcdFx0XHRsaW5rKHN0YXRlLCBwcmV2LCBpdGVtKTtcblx0XHRcdFx0cHJldiA9IGl0ZW07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c3RhdGUuZWZmZWN0Lmxhc3QgPSBwcmV2ICYmIHByZXYuZTtcblxuXHRpZiAoaXNfYW5pbWF0ZWQpIHtcblx0XHRxdWV1ZV9taWNyb190YXNrKCgpID0+IHtcblx0XHRcdGlmICh0b19hbmltYXRlID09PSB1bmRlZmluZWQpIHJldHVybjtcblx0XHRcdGZvciAoaXRlbSBvZiB0b19hbmltYXRlKSB7XG5cdFx0XHRcdGl0ZW0uYT8uYXBwbHkoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge05vZGUgfCBudWxsfSBhbmNob3JcbiAqIEBwYXJhbSB7RWFjaEl0ZW0gfCBudWxsfSBwcmV2XG4gKiBAcGFyYW0ge1Z9IHZhbHVlXG4gKiBAcGFyYW0ge3Vua25vd259IGtleVxuICogQHBhcmFtIHtudW1iZXJ9IGluZGV4XG4gKiBAcGFyYW0geyhhbmNob3I6IE5vZGUsIGl0ZW06IFYgfCBTb3VyY2U8Vj4sIGluZGV4OiBudW1iZXIgfCBWYWx1ZTxudW1iZXI+LCBjb2xsZWN0aW9uOiAoKSA9PiBWW10pID0+IHZvaWR9IHJlbmRlcl9mblxuICogQHBhcmFtIHtudW1iZXJ9IGZsYWdzXG4gKiBAcGFyYW0geygpID0+IFZbXX0gZ2V0X2NvbGxlY3Rpb25cbiAqIEByZXR1cm5zIHtFYWNoSXRlbX1cbiAqL1xuZnVuY3Rpb24gY3JlYXRlX2l0ZW0oYW5jaG9yLCBwcmV2LCB2YWx1ZSwga2V5LCBpbmRleCwgcmVuZGVyX2ZuLCBmbGFncywgZ2V0X2NvbGxlY3Rpb24pIHtcblx0dmFyIHByZXZpb3VzX2VhY2hfaXRlbSA9IGN1cnJlbnRfZWFjaF9pdGVtO1xuXHR2YXIgcmVhY3RpdmUgPSAoZmxhZ3MgJiBFQUNIX0lURU1fUkVBQ1RJVkUpICE9PSAwO1xuXHR2YXIgbXV0YWJsZSA9IChmbGFncyAmIEVBQ0hfSVRFTV9JTU1VVEFCTEUpID09PSAwO1xuXG5cdHZhciB2ID0gcmVhY3RpdmUgPyAobXV0YWJsZSA/IG11dGFibGVfc291cmNlKHZhbHVlLCBmYWxzZSwgZmFsc2UpIDogc291cmNlKHZhbHVlKSkgOiB2YWx1ZTtcblx0dmFyIGkgPSAoZmxhZ3MgJiBFQUNIX0lOREVYX1JFQUNUSVZFKSA9PT0gMCA/IGluZGV4IDogc291cmNlKGluZGV4KTtcblxuXHRpZiAoREVWICYmIHJlYWN0aXZlKSB7XG5cdFx0Ly8gRm9yIHRyYWNpbmcgcHVycG9zZXMsIHdlIG5lZWQgdG8gbGluayB0aGUgc291cmNlIHNpZ25hbCB3ZSBjcmVhdGUgd2l0aCB0aGVcblx0XHQvLyBjb2xsZWN0aW9uICsgaW5kZXggc28gdGhhdCB0cmFjaW5nIHdvcmtzIGFzIGludGVuZGVkXG5cdFx0LyoqIEB0eXBlIHtWYWx1ZX0gKi8gKHYpLnRyYWNlID0gKCkgPT4ge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25faW5kZXggPSB0eXBlb2YgaSA9PT0gJ251bWJlcicgPyBpbmRleCA6IGkudjtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLWV4cHJlc3Npb25zXG5cdFx0XHRnZXRfY29sbGVjdGlvbigpW2NvbGxlY3Rpb25faW5kZXhdO1xuXHRcdH07XG5cdH1cblxuXHQvKiogQHR5cGUge0VhY2hJdGVtfSAqL1xuXHR2YXIgaXRlbSA9IHtcblx0XHRpLFxuXHRcdHYsXG5cdFx0azoga2V5LFxuXHRcdGE6IG51bGwsXG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGU6IG51bGwsXG5cdFx0bzogZmFsc2UsXG5cdFx0cHJldixcblx0XHRuZXh0OiBudWxsXG5cdH07XG5cblx0Y3VycmVudF9lYWNoX2l0ZW0gPSBpdGVtO1xuXG5cdHRyeSB7XG5cdFx0aWYgKGFuY2hvciA9PT0gbnVsbCkge1xuXHRcdFx0dmFyIGZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdFx0ZnJhZ21lbnQuYXBwZW5kKChhbmNob3IgPSBjcmVhdGVfdGV4dCgpKSk7XG5cdFx0fVxuXG5cdFx0aXRlbS5lID0gYnJhbmNoKCgpID0+IHJlbmRlcl9mbigvKiogQHR5cGUge05vZGV9ICovIChhbmNob3IpLCB2LCBpLCBnZXRfY29sbGVjdGlvbikpO1xuXG5cdFx0aWYgKHByZXYgIT09IG51bGwpIHtcblx0XHRcdC8vIHdlIG9ubHkgbmVlZCB0byBzZXQgYHByZXYubmV4dCA9IGl0ZW1gLCBiZWNhdXNlXG5cdFx0XHQvLyBgaXRlbS5wcmV2ID0gcHJldmAgd2FzIHNldCBvbiBpbml0aWFsaXphdGlvbi5cblx0XHRcdC8vIHRoZSBlZmZlY3RzIHRoZW1zZWx2ZXMgYXJlIGFscmVhZHkgbGlua2VkXG5cdFx0XHRwcmV2Lm5leHQgPSBpdGVtO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtO1xuXHR9IGZpbmFsbHkge1xuXHRcdGN1cnJlbnRfZWFjaF9pdGVtID0gcHJldmlvdXNfZWFjaF9pdGVtO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtFYWNoSXRlbX0gaXRlbVxuICogQHBhcmFtIHtFYWNoSXRlbSB8IG51bGx9IG5leHRcbiAqIEBwYXJhbSB7VGV4dCB8IEVsZW1lbnQgfCBDb21tZW50fSBhbmNob3JcbiAqL1xuZnVuY3Rpb24gbW92ZShpdGVtLCBuZXh0LCBhbmNob3IpIHtcblx0dmFyIGVuZCA9IGl0ZW0ubmV4dCA/IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoaXRlbS5uZXh0LmUubm9kZXNfc3RhcnQpIDogYW5jaG9yO1xuXG5cdHZhciBkZXN0ID0gbmV4dCA/IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAobmV4dC5lLm5vZGVzX3N0YXJ0KSA6IGFuY2hvcjtcblx0dmFyIG5vZGUgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGl0ZW0uZS5ub2Rlc19zdGFydCk7XG5cblx0d2hpbGUgKG5vZGUgIT09IG51bGwgJiYgbm9kZSAhPT0gZW5kKSB7XG5cdFx0dmFyIG5leHRfbm9kZSA9IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoZ2V0X25leHRfc2libGluZyhub2RlKSk7XG5cdFx0ZGVzdC5iZWZvcmUobm9kZSk7XG5cdFx0bm9kZSA9IG5leHRfbm9kZTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7RWFjaFN0YXRlfSBzdGF0ZVxuICogQHBhcmFtIHtFYWNoSXRlbSB8IG51bGx9IHByZXZcbiAqIEBwYXJhbSB7RWFjaEl0ZW0gfCBudWxsfSBuZXh0XG4gKi9cbmZ1bmN0aW9uIGxpbmsoc3RhdGUsIHByZXYsIG5leHQpIHtcblx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRzdGF0ZS5maXJzdCA9IG5leHQ7XG5cdFx0c3RhdGUuZWZmZWN0LmZpcnN0ID0gbmV4dCAmJiBuZXh0LmU7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKHByZXYuZS5uZXh0KSB7XG5cdFx0XHRwcmV2LmUubmV4dC5wcmV2ID0gbnVsbDtcblx0XHR9XG5cblx0XHRwcmV2Lm5leHQgPSBuZXh0O1xuXHRcdHByZXYuZS5uZXh0ID0gbmV4dCAmJiBuZXh0LmU7XG5cdH1cblxuXHRpZiAobmV4dCAhPT0gbnVsbCkge1xuXHRcdGlmIChuZXh0LmUucHJldikge1xuXHRcdFx0bmV4dC5lLnByZXYubmV4dCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0bmV4dC5wcmV2ID0gcHJldjtcblx0XHRuZXh0LmUucHJldiA9IHByZXYgJiYgcHJldi5lO1xuXHR9XG59XG4iLCIvKiogQGltcG9ydCB7IEVmZmVjdCwgVGVtcGxhdGVOb2RlLCBWYWx1ZSB9IGZyb20gJyNjbGllbnQnICovXG5pbXBvcnQgeyBERVNUUk9ZRUQsIFNUQUxFX1JFQUNUSU9OIH0gZnJvbSAnI2NsaWVudC9jb25zdGFudHMnO1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQge1xuXHRjb21wb25lbnRfY29udGV4dCxcblx0ZGV2X3N0YWNrLFxuXHRpc19ydW5lcyxcblx0c2V0X2NvbXBvbmVudF9jb250ZXh0LFxuXHRzZXRfZGV2X3N0YWNrXG59IGZyb20gJy4uL2NvbnRleHQuanMnO1xuaW1wb3J0IHsgZ2V0X2JvdW5kYXJ5IH0gZnJvbSAnLi4vZG9tL2Jsb2Nrcy9ib3VuZGFyeS5qcyc7XG5pbXBvcnQgeyBpbnZva2VfZXJyb3JfYm91bmRhcnkgfSBmcm9tICcuLi9lcnJvci1oYW5kbGluZy5qcyc7XG5pbXBvcnQge1xuXHRhY3RpdmVfZWZmZWN0LFxuXHRhY3RpdmVfcmVhY3Rpb24sXG5cdHNldF9hY3RpdmVfZWZmZWN0LFxuXHRzZXRfYWN0aXZlX3JlYWN0aW9uXG59IGZyb20gJy4uL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgQmF0Y2gsIGN1cnJlbnRfYmF0Y2ggfSBmcm9tICcuL2JhdGNoLmpzJztcbmltcG9ydCB7XG5cdGFzeW5jX2Rlcml2ZWQsXG5cdGN1cnJlbnRfYXN5bmNfZWZmZWN0LFxuXHRkZXJpdmVkLFxuXHRkZXJpdmVkX3NhZmVfZXF1YWwsXG5cdHNldF9mcm9tX2FzeW5jX2Rlcml2ZWRcbn0gZnJvbSAnLi9kZXJpdmVkcy5qcyc7XG5pbXBvcnQgeyBhYm9ydGVkIH0gZnJvbSAnLi9lZmZlY3RzLmpzJztcbmltcG9ydCB7IGh5ZHJhdGVfbmV4dCwgaHlkcmF0aW5nLCBzZXRfaHlkcmF0ZV9ub2RlLCBza2lwX25vZGVzIH0gZnJvbSAnLi4vZG9tL2h5ZHJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjdXJyZW50X2VhY2hfaXRlbSwgc2V0X2N1cnJlbnRfZWFjaF9pdGVtIH0gZnJvbSAnLi4vZG9tL2Jsb2Nrcy9lYWNoLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5PFByb21pc2U8dm9pZD4+fSBibG9ja2Vyc1xuICogQHBhcmFtIHtBcnJheTwoKSA9PiBhbnk+fSBzeW5jXG4gKiBAcGFyYW0ge0FycmF5PCgpID0+IFByb21pc2U8YW55Pj59IGFzeW5jXG4gKiBAcGFyYW0geyh2YWx1ZXM6IFZhbHVlW10pID0+IGFueX0gZm5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW4oYmxvY2tlcnMsIHN5bmMsIGFzeW5jLCBmbikge1xuXHRjb25zdCBkID0gaXNfcnVuZXMoKSA/IGRlcml2ZWQgOiBkZXJpdmVkX3NhZmVfZXF1YWw7XG5cblx0aWYgKGFzeW5jLmxlbmd0aCA9PT0gMCAmJiBibG9ja2Vycy5sZW5ndGggPT09IDApIHtcblx0XHRmbihzeW5jLm1hcChkKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0dmFyIGJhdGNoID0gY3VycmVudF9iYXRjaDtcblx0dmFyIHBhcmVudCA9IC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCk7XG5cblx0dmFyIHJlc3RvcmUgPSBjYXB0dXJlKCk7XG5cblx0ZnVuY3Rpb24gcnVuKCkge1xuXHRcdFByb21pc2UuYWxsKGFzeW5jLm1hcCgoZXhwcmVzc2lvbikgPT4gYXN5bmNfZGVyaXZlZChleHByZXNzaW9uKSkpXG5cdFx0XHQudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRcdHJlc3RvcmUoKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGZuKFsuLi5zeW5jLm1hcChkKSwgLi4ucmVzdWx0XSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlIGVycm9ycyBpbiBibG9ja3MgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiBkZXN0cm95ZWRcblx0XHRcdFx0XHRpZiAoKHBhcmVudC5mICYgREVTVFJPWUVEKSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0aW52b2tlX2Vycm9yX2JvdW5kYXJ5KGVycm9yLCBwYXJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhdGNoPy5kZWFjdGl2YXRlKCk7XG5cdFx0XHRcdHVuc2V0X2NvbnRleHQoKTtcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goKGVycm9yKSA9PiB7XG5cdFx0XHRcdGludm9rZV9lcnJvcl9ib3VuZGFyeShlcnJvciwgcGFyZW50KTtcblx0XHRcdH0pO1xuXHR9XG5cblx0aWYgKGJsb2NrZXJzLmxlbmd0aCA+IDApIHtcblx0XHRQcm9taXNlLmFsbChibG9ja2VycykudGhlbigoKSA9PiB7XG5cdFx0XHRyZXN0b3JlKCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBydW4oKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGJhdGNoPy5kZWFjdGl2YXRlKCk7XG5cdFx0XHRcdHVuc2V0X2NvbnRleHQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRydW4oKTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXk8UHJvbWlzZTx2b2lkPj59IGJsb2NrZXJzXG4gKiBAcGFyYW0geyh2YWx1ZXM6IFZhbHVlW10pID0+IGFueX0gZm5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bl9hZnRlcl9ibG9ja2VycyhibG9ja2VycywgZm4pIHtcblx0dmFyIGVhY2hfaXRlbSA9IGN1cnJlbnRfZWFjaF9pdGVtOyAvLyBUT0RPIHNob3VsZCB0aGlzIGJlIHBhcnQgb2YgY2FwdHVyZT9cblx0ZmxhdHRlbihibG9ja2VycywgW10sIFtdLCAodikgPT4ge1xuXHRcdHNldF9jdXJyZW50X2VhY2hfaXRlbShlYWNoX2l0ZW0pO1xuXHRcdGZuKHYpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDYXB0dXJlcyB0aGUgY3VycmVudCBlZmZlY3QgY29udGV4dCBzbyB0aGF0IHdlIGNhbiByZXN0b3JlIGl0IGFmdGVyXG4gKiBzb21lIGFzeW5jaHJvbm91cyB3b3JrIGhhcyBoYXBwZW5lZCAoc28gdGhhdCBlLmcuIGBhd2FpdCBhICsgYmBcbiAqIGNhdXNlcyBgYmAgdG8gYmUgcmVnaXN0ZXJlZCBhcyBhIGRlcGVuZGVuY3kpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2FwdHVyZSgpIHtcblx0dmFyIHByZXZpb3VzX2VmZmVjdCA9IGFjdGl2ZV9lZmZlY3Q7XG5cdHZhciBwcmV2aW91c19yZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0dmFyIHByZXZpb3VzX2NvbXBvbmVudF9jb250ZXh0ID0gY29tcG9uZW50X2NvbnRleHQ7XG5cdHZhciBwcmV2aW91c19iYXRjaCA9IGN1cnJlbnRfYmF0Y2g7XG5cblx0aWYgKERFVikge1xuXHRcdHZhciBwcmV2aW91c19kZXZfc3RhY2sgPSBkZXZfc3RhY2s7XG5cdH1cblxuXHRyZXR1cm4gZnVuY3Rpb24gcmVzdG9yZShhY3RpdmF0ZV9iYXRjaCA9IHRydWUpIHtcblx0XHRzZXRfYWN0aXZlX2VmZmVjdChwcmV2aW91c19lZmZlY3QpO1xuXHRcdHNldF9hY3RpdmVfcmVhY3Rpb24ocHJldmlvdXNfcmVhY3Rpb24pO1xuXHRcdHNldF9jb21wb25lbnRfY29udGV4dChwcmV2aW91c19jb21wb25lbnRfY29udGV4dCk7XG5cdFx0aWYgKGFjdGl2YXRlX2JhdGNoKSBwcmV2aW91c19iYXRjaD8uYWN0aXZhdGUoKTtcblxuXHRcdGlmIChERVYpIHtcblx0XHRcdHNldF9mcm9tX2FzeW5jX2Rlcml2ZWQobnVsbCk7XG5cdFx0XHRzZXRfZGV2X3N0YWNrKHByZXZpb3VzX2Rldl9zdGFjayk7XG5cdFx0fVxuXHR9O1xufVxuXG4vKipcbiAqIFdyYXBzIGFuIGBhd2FpdGAgZXhwcmVzc2lvbiBpbiBzdWNoIGEgd2F5IHRoYXQgdGhlIGVmZmVjdCBjb250ZXh0IHRoYXQgd2FzXG4gKiBhY3RpdmUgYmVmb3JlIHRoZSBleHByZXNzaW9uIGV2YWx1YXRlZCBjYW4gYmUgcmVhcHBsaWVkIGFmdGVyd2FyZHMg4oCUXG4gKiBgYXdhaXQgYSArIGJgIGJlY29tZXMgYChhd2FpdCAkLnNhdmUoYSkpKCkgKyBiYFxuICogQHRlbXBsYXRlIFRcbiAqIEBwYXJhbSB7UHJvbWlzZTxUPn0gcHJvbWlzZVxuICogQHJldHVybnMge1Byb21pc2U8KCkgPT4gVD59XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlKHByb21pc2UpIHtcblx0dmFyIHJlc3RvcmUgPSBjYXB0dXJlKCk7XG5cdHZhciB2YWx1ZSA9IGF3YWl0IHByb21pc2U7XG5cblx0cmV0dXJuICgpID0+IHtcblx0XHRyZXN0b3JlKCk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9O1xufVxuXG4vKipcbiAqIFJlc2V0IGBjdXJyZW50X2FzeW5jX2VmZmVjdGAgYWZ0ZXIgdGhlIGBwcm9taXNlYCByZXNvbHZlcywgc29cbiAqIHRoYXQgd2UgY2FuIGVtaXQgYGF3YWl0X3JlYWN0aXZpdHlfbG9zc2Agd2FybmluZ3NcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0ge1Byb21pc2U8VD59IHByb21pc2VcbiAqIEByZXR1cm5zIHtQcm9taXNlPCgpID0+IFQ+fVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJhY2tfcmVhY3Rpdml0eV9sb3NzKHByb21pc2UpIHtcblx0dmFyIHByZXZpb3VzX2FzeW5jX2VmZmVjdCA9IGN1cnJlbnRfYXN5bmNfZWZmZWN0O1xuXHR2YXIgdmFsdWUgPSBhd2FpdCBwcm9taXNlO1xuXG5cdHJldHVybiAoKSA9PiB7XG5cdFx0c2V0X2Zyb21fYXN5bmNfZGVyaXZlZChwcmV2aW91c19hc3luY19lZmZlY3QpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fTtcbn1cblxuLyoqXG4gKiBVc2VkIGluIGBmb3IgYXdhaXRgIGxvb3BzIGluIERFViwgc29cbiAqIHRoYXQgd2UgY2FuIGVtaXQgYGF3YWl0X3JlYWN0aXZpdHlfbG9zc2Agd2FybmluZ3NcbiAqIGFmdGVyIGVhY2ggYGFzeW5jX2l0ZXJhdG9yYCByZXN1bHQgcmVzb2x2ZXMgYW5kXG4gKiBhZnRlciB0aGUgYGFzeW5jX2l0ZXJhdG9yYCByZXR1cm4gcmVzb2x2ZXMgKGlmIGl0IHJ1bnMpXG4gKiBAdGVtcGxhdGUgVFxuICogQHRlbXBsYXRlIFRSZXR1cm5cbiAqIEBwYXJhbSB7SXRlcmFibGU8VD4gfCBBc3luY0l0ZXJhYmxlPFQ+fSBpdGVyYWJsZVxuICogQHJldHVybnMge0FzeW5jR2VuZXJhdG9yPFQsIFRSZXR1cm4gfCB1bmRlZmluZWQ+fVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24qIGZvcl9hd2FpdF90cmFja19yZWFjdGl2aXR5X2xvc3MoaXRlcmFibGUpIHtcblx0Ly8gVGhpcyBpcyBiYXNlZCBvbiB0aGUgYWxnb3JpdGhtcyBkZXNjcmliZWQgaW4gRUNNQS0yNjI6XG5cdC8vIEZvckluL09mQm9keUV2YWx1YXRpb25cblx0Ly8gaHR0cHM6Ly90YzM5LmVzL2VjbWEyNjIvbXVsdGlwYWdlL2VjbWFzY3JpcHQtbGFuZ3VhZ2Utc3RhdGVtZW50cy1hbmQtZGVjbGFyYXRpb25zLmh0bWwjc2VjLXJ1bnRpbWUtc2VtYW50aWNzLWZvcmluLWRpdi1vZmJvZHlldmFsdWF0aW9uLWxocy1zdG10LWl0ZXJhdG9yLWxoc2tpbmQtbGFiZWxzZXRcblx0Ly8gQXN5bmNJdGVyYXRvckNsb3NlXG5cdC8vIGh0dHBzOi8vdGMzOS5lcy9lY21hMjYyL211bHRpcGFnZS9hYnN0cmFjdC1vcGVyYXRpb25zLmh0bWwjc2VjLWFzeW5jaXRlcmF0b3JjbG9zZVxuXG5cdC8qKiBAdHlwZSB7QXN5bmNJdGVyYXRvcjxULCBUUmV0dXJuPn0gKi9cblx0Ly8gQHRzLWlnbm9yZVxuXHRjb25zdCBpdGVyYXRvciA9IGl0ZXJhYmxlW1N5bWJvbC5hc3luY0l0ZXJhdG9yXT8uKCkgPz8gaXRlcmFibGVbU3ltYm9sLml0ZXJhdG9yXT8uKCk7XG5cblx0aWYgKGl0ZXJhdG9yID09PSB1bmRlZmluZWQpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBub3QgYXN5bmMgaXRlcmFibGUnKTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRoZSBjb21wbGV0aW9uIG9mIHRoZSBpdGVyYXRvciB3YXMgXCJub3JtYWxcIiwgbWVhbmluZyBpdCB3YXNuJ3QgZW5kZWQgdmlhIGBicmVha2Agb3IgYSBzaW1pbGFyIG1ldGhvZCAqL1xuXHRsZXQgbm9ybWFsX2NvbXBsZXRpb24gPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gKGF3YWl0IHRyYWNrX3JlYWN0aXZpdHlfbG9zcyhpdGVyYXRvci5uZXh0KCkpKSgpO1xuXHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0bm9ybWFsX2NvbXBsZXRpb24gPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHlpZWxkIHZhbHVlO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHQvLyBJZiB0aGUgaXRlcmF0b3IgaGFkIGEgbm9ybWFsIGNvbXBsZXRpb24gYW5kIGByZXR1cm5gIGlzIGRlZmluZWQgb24gdGhlIGl0ZXJhdG9yLCBjYWxsIGl0IGFuZCByZXR1cm4gdGhlIHZhbHVlXG5cdFx0aWYgKG5vcm1hbF9jb21wbGV0aW9uICYmIGl0ZXJhdG9yLnJldHVybiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW5zYWZlLWZpbmFsbHlcblx0XHRcdHJldHVybiAvKiogQHR5cGUge1RSZXR1cm59ICovICgoYXdhaXQgdHJhY2tfcmVhY3Rpdml0eV9sb3NzKGl0ZXJhdG9yLnJldHVybigpKSkoKS52YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bnNldF9jb250ZXh0KCkge1xuXHRzZXRfYWN0aXZlX2VmZmVjdChudWxsKTtcblx0c2V0X2FjdGl2ZV9yZWFjdGlvbihudWxsKTtcblx0c2V0X2NvbXBvbmVudF9jb250ZXh0KG51bGwpO1xuXG5cdGlmIChERVYpIHtcblx0XHRzZXRfZnJvbV9hc3luY19kZXJpdmVkKG51bGwpO1xuXHRcdHNldF9kZXZfc3RhY2sobnVsbCk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge1RlbXBsYXRlTm9kZX0gYW5jaG9yXG4gKiBAcGFyYW0geyh0YXJnZXQ6IFRlbXBsYXRlTm9kZSkgPT4gUHJvbWlzZTx2b2lkPn0gZm5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzeW5jX2JvZHkoYW5jaG9yLCBmbikge1xuXHR2YXIgYm91bmRhcnkgPSBnZXRfYm91bmRhcnkoKTtcblx0dmFyIGJhdGNoID0gLyoqIEB0eXBlIHtCYXRjaH0gKi8gKGN1cnJlbnRfYmF0Y2gpO1xuXHR2YXIgYmxvY2tpbmcgPSAhYm91bmRhcnkuaXNfcGVuZGluZygpO1xuXG5cdGJvdW5kYXJ5LnVwZGF0ZV9wZW5kaW5nX2NvdW50KDEpO1xuXHRiYXRjaC5pbmNyZW1lbnQoYmxvY2tpbmcpO1xuXG5cdHZhciBhY3RpdmUgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpO1xuXG5cdHZhciB3YXNfaHlkcmF0aW5nID0gaHlkcmF0aW5nO1xuXHR2YXIgbmV4dF9oeWRyYXRlX25vZGUgPSB1bmRlZmluZWQ7XG5cblx0aWYgKHdhc19oeWRyYXRpbmcpIHtcblx0XHRoeWRyYXRlX25leHQoKTtcblx0XHRuZXh0X2h5ZHJhdGVfbm9kZSA9IHNraXBfbm9kZXMoZmFsc2UpO1xuXHR9XG5cblx0dHJ5IHtcblx0XHR2YXIgcHJvbWlzZSA9IGZuKGFuY2hvcik7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKG5leHRfaHlkcmF0ZV9ub2RlKSB7XG5cdFx0XHRzZXRfaHlkcmF0ZV9ub2RlKG5leHRfaHlkcmF0ZV9ub2RlKTtcblx0XHRcdGh5ZHJhdGVfbmV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHRyeSB7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRpZiAoIWFib3J0ZWQoYWN0aXZlKSkge1xuXHRcdFx0aW52b2tlX2Vycm9yX2JvdW5kYXJ5KGVycm9yLCBhY3RpdmUpO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRib3VuZGFyeS51cGRhdGVfcGVuZGluZ19jb3VudCgtMSk7XG5cdFx0YmF0Y2guZGVjcmVtZW50KGJsb2NraW5nKTtcblxuXHRcdHVuc2V0X2NvbnRleHQoKTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXk8KCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4+fSB0aHVua3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bih0aHVua3MpIHtcblx0Y29uc3QgcmVzdG9yZSA9IGNhcHR1cmUoKTtcblxuXHR2YXIgYm91bmRhcnkgPSBnZXRfYm91bmRhcnkoKTtcblx0dmFyIGJhdGNoID0gLyoqIEB0eXBlIHtCYXRjaH0gKi8gKGN1cnJlbnRfYmF0Y2gpO1xuXHR2YXIgYmxvY2tpbmcgPSAhYm91bmRhcnkuaXNfcGVuZGluZygpO1xuXG5cdGJvdW5kYXJ5LnVwZGF0ZV9wZW5kaW5nX2NvdW50KDEpO1xuXHRiYXRjaC5pbmNyZW1lbnQoYmxvY2tpbmcpO1xuXG5cdHZhciBhY3RpdmUgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpO1xuXG5cdC8qKiBAdHlwZSB7bnVsbCB8IHsgZXJyb3I6IGFueSB9fSAqL1xuXHR2YXIgZXJyb3JlZCA9IG51bGw7XG5cblx0LyoqIEBwYXJhbSB7YW55fSBlcnJvciAqL1xuXHRjb25zdCBoYW5kbGVfZXJyb3IgPSAoZXJyb3IpID0+IHtcblx0XHRlcnJvcmVkID0geyBlcnJvciB9OyAvLyB3cmFwIGluIG9iamVjdCBpbiBjYXNlIGEgcHJvbWlzZSByZWplY3RzIHdpdGggYSBmYWxzeSB2YWx1ZVxuXG5cdFx0aWYgKCFhYm9ydGVkKGFjdGl2ZSkpIHtcblx0XHRcdGludm9rZV9lcnJvcl9ib3VuZGFyeShlcnJvciwgYWN0aXZlKTtcblx0XHR9XG5cdH07XG5cblx0dmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUodGh1bmtzWzBdKCkpLmNhdGNoKGhhbmRsZV9lcnJvcik7XG5cblx0dmFyIHByb21pc2VzID0gW3Byb21pc2VdO1xuXG5cdGZvciAoY29uc3QgZm4gb2YgdGh1bmtzLnNsaWNlKDEpKSB7XG5cdFx0cHJvbWlzZSA9IHByb21pc2Vcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcmVkLmVycm9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFib3J0ZWQoYWN0aXZlKSkge1xuXHRcdFx0XHRcdHRocm93IFNUQUxFX1JFQUNUSU9OO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXN0b3JlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIGZuKCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Ly8gVE9ETyBkbyB3ZSBuZWVkIGl0IGhlcmUgYXMgd2VsbCBhcyBiZWxvdz9cblx0XHRcdFx0XHR1bnNldF9jb250ZXh0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goaGFuZGxlX2Vycm9yKVxuXHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR1bnNldF9jb250ZXh0KCk7XG5cdFx0XHR9KTtcblxuXHRcdHByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdH1cblxuXHRwcm9taXNlXG5cdFx0Ly8gd2FpdCBvbmUgbW9yZSB0aWNrLCBzbyB0aGF0IHRlbXBsYXRlIGVmZmVjdHMgYXJlXG5cdFx0Ly8gZ3VhcmFudGVlZCB0byBydW4gYmVmb3JlIGAkZWZmZWN0KC4uLilgXG5cdFx0LnRoZW4oKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCkpXG5cdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Ym91bmRhcnkudXBkYXRlX3BlbmRpbmdfY291bnQoLTEpO1xuXHRcdFx0YmF0Y2guZGVjcmVtZW50KGJsb2NraW5nKTtcblx0XHR9KTtcblxuXHRyZXR1cm4gcHJvbWlzZXM7XG59XG4iLCIvKiogQGltcG9ydCB7IERlcml2ZWQsIEVmZmVjdCwgU291cmNlIH0gZnJvbSAnI2NsaWVudCcgKi9cbi8qKiBAaW1wb3J0IHsgQmF0Y2ggfSBmcm9tICcuL2JhdGNoLmpzJzsgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0IHtcblx0RVJST1JfVkFMVUUsXG5cdENMRUFOLFxuXHRERVJJVkVELFxuXHRESVJUWSxcblx0RUZGRUNUX1BSRVNFUlZFRCxcblx0TUFZQkVfRElSVFksXG5cdFNUQUxFX1JFQUNUSU9OLFxuXHRBU1lOQyxcblx0V0FTX01BUktFRCxcblx0Q09OTkVDVEVELFxuXHRERVNUUk9ZRURcbn0gZnJvbSAnI2NsaWVudC9jb25zdGFudHMnO1xuaW1wb3J0IHtcblx0YWN0aXZlX3JlYWN0aW9uLFxuXHRhY3RpdmVfZWZmZWN0LFxuXHRzZXRfc2lnbmFsX3N0YXR1cyxcblx0dXBkYXRlX3JlYWN0aW9uLFxuXHRpbmNyZW1lbnRfd3JpdGVfdmVyc2lvbixcblx0c2V0X2FjdGl2ZV9lZmZlY3QsXG5cdHB1c2hfcmVhY3Rpb25fdmFsdWUsXG5cdGlzX2Rlc3Ryb3lpbmdfZWZmZWN0XG59IGZyb20gJy4uL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBzYWZlX2VxdWFscyB9IGZyb20gJy4vZXF1YWxpdHkuanMnO1xuaW1wb3J0ICogYXMgZSBmcm9tICcuLi9lcnJvcnMuanMnO1xuaW1wb3J0ICogYXMgdyBmcm9tICcuLi93YXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3luY19lZmZlY3QsIGRlc3Ryb3lfZWZmZWN0LCBlZmZlY3RfdHJhY2tpbmcsIHRlYXJkb3duIH0gZnJvbSAnLi9lZmZlY3RzLmpzJztcbmltcG9ydCB7IGVhZ2VyX2VmZmVjdHMsIGludGVybmFsX3NldCwgc2V0X2VhZ2VyX2VmZmVjdHMsIHNvdXJjZSB9IGZyb20gJy4vc291cmNlcy5qcyc7XG5pbXBvcnQgeyBnZXRfZXJyb3IgfSBmcm9tICcuLi8uLi9zaGFyZWQvZGV2LmpzJztcbmltcG9ydCB7IGFzeW5jX21vZGVfZmxhZywgdHJhY2luZ19tb2RlX2ZsYWcgfSBmcm9tICcuLi8uLi9mbGFncy9pbmRleC5qcyc7XG5pbXBvcnQgeyBCb3VuZGFyeSB9IGZyb20gJy4uL2RvbS9ibG9ja3MvYm91bmRhcnkuanMnO1xuaW1wb3J0IHsgY29tcG9uZW50X2NvbnRleHQgfSBmcm9tICcuLi9jb250ZXh0LmpzJztcbmltcG9ydCB7IFVOSU5JVElBTElaRUQgfSBmcm9tICcuLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgYmF0Y2hfdmFsdWVzLCBjdXJyZW50X2JhdGNoIH0gZnJvbSAnLi9iYXRjaC5qcyc7XG5pbXBvcnQgeyB1bnNldF9jb250ZXh0IH0gZnJvbSAnLi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWZlcnJlZCB9IGZyb20gJy4uLy4uL3NoYXJlZC91dGlscy5qcyc7XG5cbi8qKiBAdHlwZSB7RWZmZWN0IHwgbnVsbH0gKi9cbmV4cG9ydCBsZXQgY3VycmVudF9hc3luY19lZmZlY3QgPSBudWxsO1xuXG4vKiogQHBhcmFtIHtFZmZlY3QgfCBudWxsfSB2ICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2Zyb21fYXN5bmNfZGVyaXZlZCh2KSB7XG5cdGN1cnJlbnRfYXN5bmNfZWZmZWN0ID0gdjtcbn1cblxuZXhwb3J0IGNvbnN0IHJlY2VudF9hc3luY19kZXJpdmVkcyA9IG5ldyBTZXQoKTtcblxuLyoqXG4gKiBAdGVtcGxhdGUgVlxuICogQHBhcmFtIHsoKSA9PiBWfSBmblxuICogQHJldHVybnMge0Rlcml2ZWQ8Vj59XG4gKi9cbi8qI19fTk9fU0lERV9FRkZFQ1RTX18qL1xuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWQoZm4pIHtcblx0dmFyIGZsYWdzID0gREVSSVZFRCB8IERJUlRZO1xuXHR2YXIgcGFyZW50X2Rlcml2ZWQgPVxuXHRcdGFjdGl2ZV9yZWFjdGlvbiAhPT0gbnVsbCAmJiAoYWN0aXZlX3JlYWN0aW9uLmYgJiBERVJJVkVEKSAhPT0gMFxuXHRcdFx0PyAvKiogQHR5cGUge0Rlcml2ZWR9ICovIChhY3RpdmVfcmVhY3Rpb24pXG5cdFx0XHQ6IG51bGw7XG5cblx0aWYgKGFjdGl2ZV9lZmZlY3QgIT09IG51bGwpIHtcblx0XHQvLyBTaW5jZSBkZXJpdmVkcyBhcmUgZXZhbHVhdGVkIGxhemlseSwgYW55IGVmZmVjdHMgY3JlYXRlZCBpbnNpZGUgdGhlbSBhcmVcblx0XHQvLyBjcmVhdGVkIHRvbyBsYXRlIHRvIGVuc3VyZSB0aGF0IHRoZSBwYXJlbnQgZWZmZWN0IGlzIGFkZGVkIHRvIHRoZSB0cmVlXG5cdFx0YWN0aXZlX2VmZmVjdC5mIHw9IEVGRkVDVF9QUkVTRVJWRUQ7XG5cdH1cblxuXHQvKiogQHR5cGUge0Rlcml2ZWQ8Vj59ICovXG5cdGNvbnN0IHNpZ25hbCA9IHtcblx0XHRjdHg6IGNvbXBvbmVudF9jb250ZXh0LFxuXHRcdGRlcHM6IG51bGwsXG5cdFx0ZWZmZWN0czogbnVsbCxcblx0XHRlcXVhbHMsXG5cdFx0ZjogZmxhZ3MsXG5cdFx0Zm4sXG5cdFx0cmVhY3Rpb25zOiBudWxsLFxuXHRcdHJ2OiAwLFxuXHRcdHY6IC8qKiBAdHlwZSB7Vn0gKi8gKFVOSU5JVElBTElaRUQpLFxuXHRcdHd2OiAwLFxuXHRcdHBhcmVudDogcGFyZW50X2Rlcml2ZWQgPz8gYWN0aXZlX2VmZmVjdCxcblx0XHRhYzogbnVsbFxuXHR9O1xuXG5cdGlmIChERVYgJiYgdHJhY2luZ19tb2RlX2ZsYWcpIHtcblx0XHRzaWduYWwuY3JlYXRlZCA9IGdldF9lcnJvcignY3JlYXRlZCBhdCcpO1xuXHR9XG5cblx0cmV0dXJuIHNpZ25hbDtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUgVlxuICogQHBhcmFtIHsoKSA9PiBWIHwgUHJvbWlzZTxWPn0gZm5cbiAqIEBwYXJhbSB7c3RyaW5nfSBbbG9jYXRpb25dIElmIHByb3ZpZGVkLCBwcmludCBhIHdhcm5pbmcgaWYgdGhlIHZhbHVlIGlzIG5vdCByZWFkIGltbWVkaWF0ZWx5IGFmdGVyIHVwZGF0ZVxuICogQHJldHVybnMge1Byb21pc2U8U291cmNlPFY+Pn1cbiAqL1xuLyojX19OT19TSURFX0VGRkVDVFNfXyovXG5leHBvcnQgZnVuY3Rpb24gYXN5bmNfZGVyaXZlZChmbiwgbG9jYXRpb24pIHtcblx0bGV0IHBhcmVudCA9IC8qKiBAdHlwZSB7RWZmZWN0IHwgbnVsbH0gKi8gKGFjdGl2ZV9lZmZlY3QpO1xuXG5cdGlmIChwYXJlbnQgPT09IG51bGwpIHtcblx0XHRlLmFzeW5jX2Rlcml2ZWRfb3JwaGFuKCk7XG5cdH1cblxuXHR2YXIgYm91bmRhcnkgPSAvKiogQHR5cGUge0JvdW5kYXJ5fSAqLyAocGFyZW50LmIpO1xuXG5cdHZhciBwcm9taXNlID0gLyoqIEB0eXBlIHtQcm9taXNlPFY+fSAqLyAoLyoqIEB0eXBlIHt1bmtub3dufSAqLyAodW5kZWZpbmVkKSk7XG5cdHZhciBzaWduYWwgPSBzb3VyY2UoLyoqIEB0eXBlIHtWfSAqLyAoVU5JTklUSUFMSVpFRCkpO1xuXG5cdC8vIG9ubHkgc3VzcGVuZCBpbiBhc3luYyBkZXJpdmVkcyBjcmVhdGVkIG9uIGluaXRpYWxpc2F0aW9uXG5cdHZhciBzaG91bGRfc3VzcGVuZCA9ICFhY3RpdmVfcmVhY3Rpb247XG5cblx0LyoqIEB0eXBlIHtNYXA8QmF0Y2gsIFJldHVyblR5cGU8dHlwZW9mIGRlZmVycmVkPFY+Pj59ICovXG5cdHZhciBkZWZlcnJlZHMgPSBuZXcgTWFwKCk7XG5cblx0YXN5bmNfZWZmZWN0KCgpID0+IHtcblx0XHRpZiAoREVWKSBjdXJyZW50X2FzeW5jX2VmZmVjdCA9IGFjdGl2ZV9lZmZlY3Q7XG5cblx0XHQvKiogQHR5cGUge1JldHVyblR5cGU8dHlwZW9mIGRlZmVycmVkPFY+Pn0gKi9cblx0XHR2YXIgZCA9IGRlZmVycmVkKCk7XG5cdFx0cHJvbWlzZSA9IGQucHJvbWlzZTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBJZiB0aGlzIGNvZGUgaXMgY2hhbmdlZCBhdCBzb21lIHBvaW50LCBtYWtlIHN1cmUgdG8gc3RpbGwgYWNjZXNzIHRoZSB0aGVuIHByb3BlcnR5XG5cdFx0XHQvLyBvZiBmbigpIHRvIHJlYWQgYW55IHNpZ25hbHMgaXQgbWlnaHQgYWNjZXNzLCBzbyB0aGF0IHdlIHRyYWNrIHRoZW0gYXMgZGVwZW5kZW5jaWVzLlxuXHRcdFx0Ly8gV2UgY2FsbCBgdW5zZXRfY29udGV4dGAgdG8gdW5kbyBhbnkgYHNhdmVgIGNhbGxzIHRoYXQgaGFwcGVuIGluc2lkZSBgZm4oKWBcblx0XHRcdFByb21pc2UucmVzb2x2ZShmbigpKVxuXHRcdFx0XHQudGhlbihkLnJlc29sdmUsIGQucmVqZWN0KVxuXHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGJhdGNoID09PSBjdXJyZW50X2JhdGNoICYmIGJhdGNoLmNvbW1pdHRlZCkge1xuXHRcdFx0XHRcdFx0Ly8gaWYgdGhlIGJhdGNoIHdhcyByZWplY3RlZCBhcyBzdGFsZSwgd2UgbmVlZCB0byBjbGVhbnVwXG5cdFx0XHRcdFx0XHQvLyBhZnRlciBhbnkgYCQuc2F2ZSguLi4pYCBjYWxscyBpbnNpZGUgYGZuKClgXG5cdFx0XHRcdFx0XHRiYXRjaC5kZWFjdGl2YXRlKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dW5zZXRfY29udGV4dCgpO1xuXHRcdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZC5yZWplY3QoZXJyb3IpO1xuXHRcdFx0dW5zZXRfY29udGV4dCgpO1xuXHRcdH1cblxuXHRcdGlmIChERVYpIGN1cnJlbnRfYXN5bmNfZWZmZWN0ID0gbnVsbDtcblxuXHRcdHZhciBiYXRjaCA9IC8qKiBAdHlwZSB7QmF0Y2h9ICovIChjdXJyZW50X2JhdGNoKTtcblxuXHRcdGlmIChzaG91bGRfc3VzcGVuZCkge1xuXHRcdFx0dmFyIGJsb2NraW5nID0gIWJvdW5kYXJ5LmlzX3BlbmRpbmcoKTtcblxuXHRcdFx0Ym91bmRhcnkudXBkYXRlX3BlbmRpbmdfY291bnQoMSk7XG5cdFx0XHRiYXRjaC5pbmNyZW1lbnQoYmxvY2tpbmcpO1xuXG5cdFx0XHRkZWZlcnJlZHMuZ2V0KGJhdGNoKT8ucmVqZWN0KFNUQUxFX1JFQUNUSU9OKTtcblx0XHRcdGRlZmVycmVkcy5kZWxldGUoYmF0Y2gpOyAvLyBkZWxldGUgdG8gZW5zdXJlIGNvcnJlY3Qgb3JkZXIgaW4gTWFwIGl0ZXJhdGlvbiBiZWxvd1xuXHRcdFx0ZGVmZXJyZWRzLnNldChiYXRjaCwgZCk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHthbnl9IHZhbHVlXG5cdFx0ICogQHBhcmFtIHt1bmtub3dufSBlcnJvclxuXHRcdCAqL1xuXHRcdGNvbnN0IGhhbmRsZXIgPSAodmFsdWUsIGVycm9yID0gdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjdXJyZW50X2FzeW5jX2VmZmVjdCA9IG51bGw7XG5cblx0XHRcdGJhdGNoLmFjdGl2YXRlKCk7XG5cblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgIT09IFNUQUxFX1JFQUNUSU9OKSB7XG5cdFx0XHRcdFx0c2lnbmFsLmYgfD0gRVJST1JfVkFMVUU7XG5cblx0XHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIHRoZSBlcnJvciBpcyB0aGUgd3JvbmcgdHlwZSwgYnV0IHdlIGRvbid0IGNhcmVcblx0XHRcdFx0XHRpbnRlcm5hbF9zZXQoc2lnbmFsLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICgoc2lnbmFsLmYgJiBFUlJPUl9WQUxVRSkgIT09IDApIHtcblx0XHRcdFx0XHRzaWduYWwuZiBePSBFUlJPUl9WQUxVRTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGludGVybmFsX3NldChzaWduYWwsIHZhbHVlKTtcblxuXHRcdFx0XHQvLyBBbGwgcHJpb3IgYXN5bmMgZGVyaXZlZCBydW5zIGFyZSBub3cgc3RhbGVcblx0XHRcdFx0Zm9yIChjb25zdCBbYiwgZF0gb2YgZGVmZXJyZWRzKSB7XG5cdFx0XHRcdFx0ZGVmZXJyZWRzLmRlbGV0ZShiKTtcblx0XHRcdFx0XHRpZiAoYiA9PT0gYmF0Y2gpIGJyZWFrO1xuXHRcdFx0XHRcdGQucmVqZWN0KFNUQUxFX1JFQUNUSU9OKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChERVYgJiYgbG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJlY2VudF9hc3luY19kZXJpdmVkcy5hZGQoc2lnbmFsKTtcblxuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlY2VudF9hc3luY19kZXJpdmVkcy5oYXMoc2lnbmFsKSkge1xuXHRcdFx0XHRcdFx0XHR3LmF3YWl0X3dhdGVyZmFsbCgvKiogQHR5cGUge3N0cmluZ30gKi8gKHNpZ25hbC5sYWJlbCksIGxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdFx0cmVjZW50X2FzeW5jX2Rlcml2ZWRzLmRlbGV0ZShzaWduYWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG91bGRfc3VzcGVuZCkge1xuXHRcdFx0XHRib3VuZGFyeS51cGRhdGVfcGVuZGluZ19jb3VudCgtMSk7XG5cdFx0XHRcdGJhdGNoLmRlY3JlbWVudChibG9ja2luZyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGQucHJvbWlzZS50aGVuKGhhbmRsZXIsIChlKSA9PiBoYW5kbGVyKG51bGwsIGUgfHwgJ3Vua25vd24nKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGQgb2YgZGVmZXJyZWRzLnZhbHVlcygpKSB7XG5cdFx0XHRkLnJlamVjdChTVEFMRV9SRUFDVElPTik7XG5cdFx0fVxuXHR9KTtcblxuXHRpZiAoREVWKSB7XG5cdFx0Ly8gYWRkIGEgZmxhZyB0aGF0IGxldHMgdGhpcyBiZSBwcmludGVkIGFzIGEgZGVyaXZlZFxuXHRcdC8vIHdoZW4gdXNpbmcgYCRpbnNwZWN0LnRyYWNlKClgXG5cdFx0c2lnbmFsLmYgfD0gQVNZTkM7XG5cdH1cblxuXHRyZXR1cm4gbmV3IFByb21pc2UoKGZ1bGZpbCkgPT4ge1xuXHRcdC8qKiBAcGFyYW0ge1Byb21pc2U8Vj59IHAgKi9cblx0XHRmdW5jdGlvbiBuZXh0KHApIHtcblx0XHRcdGZ1bmN0aW9uIGdvKCkge1xuXHRcdFx0XHRpZiAocCA9PT0gcHJvbWlzZSkge1xuXHRcdFx0XHRcdGZ1bGZpbChzaWduYWwpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGlmIHRoZSBlZmZlY3QgcmUtcnVucyBiZWZvcmUgdGhlIGluaXRpYWwgcHJvbWlzZVxuXHRcdFx0XHRcdC8vIHJlc29sdmVzLCBkZWxheSByZXNvbHV0aW9uIHVudGlsIHdlIGhhdmUgYSB2YWx1ZVxuXHRcdFx0XHRcdG5leHQocHJvbWlzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cC50aGVuKGdvLCBnbyk7XG5cdFx0fVxuXG5cdFx0bmV4dChwcm9taXNlKTtcblx0fSk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7KCkgPT4gVn0gZm5cbiAqIEByZXR1cm5zIHtEZXJpdmVkPFY+fVxuICovXG4vKiNfX05PX1NJREVfRUZGRUNUU19fKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2VyX2Rlcml2ZWQoZm4pIHtcblx0Y29uc3QgZCA9IGRlcml2ZWQoZm4pO1xuXG5cdGlmICghYXN5bmNfbW9kZV9mbGFnKSBwdXNoX3JlYWN0aW9uX3ZhbHVlKGQpO1xuXG5cdHJldHVybiBkO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0geygpID0+IFZ9IGZuXG4gKiBAcmV0dXJucyB7RGVyaXZlZDxWPn1cbiAqL1xuLyojX19OT19TSURFX0VGRkVDVFNfXyovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZF9zYWZlX2VxdWFsKGZuKSB7XG5cdGNvbnN0IHNpZ25hbCA9IGRlcml2ZWQoZm4pO1xuXHRzaWduYWwuZXF1YWxzID0gc2FmZV9lcXVhbHM7XG5cdHJldHVybiBzaWduYWw7XG59XG5cbi8qKlxuICogQHBhcmFtIHtEZXJpdmVkfSBkZXJpdmVkXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlc3Ryb3lfZGVyaXZlZF9lZmZlY3RzKGRlcml2ZWQpIHtcblx0dmFyIGVmZmVjdHMgPSBkZXJpdmVkLmVmZmVjdHM7XG5cblx0aWYgKGVmZmVjdHMgIT09IG51bGwpIHtcblx0XHRkZXJpdmVkLmVmZmVjdHMgPSBudWxsO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBlZmZlY3RzLmxlbmd0aDsgaSArPSAxKSB7XG5cdFx0XHRkZXN0cm95X2VmZmVjdCgvKiogQHR5cGUge0VmZmVjdH0gKi8gKGVmZmVjdHNbaV0pKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgY3VycmVudGx5IHVwZGF0aW5nIGRlcml2ZWRzLCB1c2VkIHRvIGRldGVjdCBpbmZpbml0ZSByZWN1cnNpb25cbiAqIGluIGRldiBtb2RlIGFuZCBwcm92aWRlIGEgbmljZXIgZXJyb3IgdGhhbiAndG9vIG11Y2ggcmVjdXJzaW9uJ1xuICogQHR5cGUge0Rlcml2ZWRbXX1cbiAqL1xubGV0IHN0YWNrID0gW107XG5cbi8qKlxuICogQHBhcmFtIHtEZXJpdmVkfSBkZXJpdmVkXG4gKiBAcmV0dXJucyB7RWZmZWN0IHwgbnVsbH1cbiAqL1xuZnVuY3Rpb24gZ2V0X2Rlcml2ZWRfcGFyZW50X2VmZmVjdChkZXJpdmVkKSB7XG5cdHZhciBwYXJlbnQgPSBkZXJpdmVkLnBhcmVudDtcblx0d2hpbGUgKHBhcmVudCAhPT0gbnVsbCkge1xuXHRcdGlmICgocGFyZW50LmYgJiBERVJJVkVEKSA9PT0gMCkge1xuXHRcdFx0Ly8gVGhlIG9yaWdpbmFsIHBhcmVudCBlZmZlY3QgbWlnaHQndmUgYmVlbiBkZXN0cm95ZWQgYnV0IHRoZSBkZXJpdmVkXG5cdFx0XHQvLyBpcyB1c2VkIGVsc2V3aGVyZSBub3cgLSBkbyBub3QgcmV0dXJuIHRoZSBkZXN0cm95ZWQgZWZmZWN0IGluIHRoYXQgY2FzZVxuXHRcdFx0cmV0dXJuIChwYXJlbnQuZiAmIERFU1RST1lFRCkgPT09IDAgPyAvKiogQHR5cGUge0VmZmVjdH0gKi8gKHBhcmVudCkgOiBudWxsO1xuXHRcdH1cblx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0ge0Rlcml2ZWR9IGRlcml2ZWRcbiAqIEByZXR1cm5zIHtUfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZV9kZXJpdmVkKGRlcml2ZWQpIHtcblx0dmFyIHZhbHVlO1xuXHR2YXIgcHJldl9hY3RpdmVfZWZmZWN0ID0gYWN0aXZlX2VmZmVjdDtcblxuXHRzZXRfYWN0aXZlX2VmZmVjdChnZXRfZGVyaXZlZF9wYXJlbnRfZWZmZWN0KGRlcml2ZWQpKTtcblxuXHRpZiAoREVWKSB7XG5cdFx0bGV0IHByZXZfZWFnZXJfZWZmZWN0cyA9IGVhZ2VyX2VmZmVjdHM7XG5cdFx0c2V0X2VhZ2VyX2VmZmVjdHMobmV3IFNldCgpKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHN0YWNrLmluY2x1ZGVzKGRlcml2ZWQpKSB7XG5cdFx0XHRcdGUuZGVyaXZlZF9yZWZlcmVuY2VzX3NlbGYoKTtcblx0XHRcdH1cblxuXHRcdFx0c3RhY2sucHVzaChkZXJpdmVkKTtcblxuXHRcdFx0ZGVyaXZlZC5mICY9IH5XQVNfTUFSS0VEO1xuXHRcdFx0ZGVzdHJveV9kZXJpdmVkX2VmZmVjdHMoZGVyaXZlZCk7XG5cdFx0XHR2YWx1ZSA9IHVwZGF0ZV9yZWFjdGlvbihkZXJpdmVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2V0X2FjdGl2ZV9lZmZlY3QocHJldl9hY3RpdmVfZWZmZWN0KTtcblx0XHRcdHNldF9lYWdlcl9lZmZlY3RzKHByZXZfZWFnZXJfZWZmZWN0cyk7XG5cdFx0XHRzdGFjay5wb3AoKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0dHJ5IHtcblx0XHRcdGRlcml2ZWQuZiAmPSB+V0FTX01BUktFRDtcblx0XHRcdGRlc3Ryb3lfZGVyaXZlZF9lZmZlY3RzKGRlcml2ZWQpO1xuXHRcdFx0dmFsdWUgPSB1cGRhdGVfcmVhY3Rpb24oZGVyaXZlZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNldF9hY3RpdmVfZWZmZWN0KHByZXZfYWN0aXZlX2VmZmVjdCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RGVyaXZlZH0gZGVyaXZlZFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVfZGVyaXZlZChkZXJpdmVkKSB7XG5cdHZhciB2YWx1ZSA9IGV4ZWN1dGVfZGVyaXZlZChkZXJpdmVkKTtcblxuXHRpZiAoIWRlcml2ZWQuZXF1YWxzKHZhbHVlKSkge1xuXHRcdC8vIGluIGEgZm9yaywgd2UgZG9uJ3QgdXBkYXRlIHRoZSB1bmRlcmx5aW5nIHZhbHVlLCBqdXN0IGBiYXRjaF92YWx1ZXNgLlxuXHRcdC8vIHRoZSB1bmRlcmx5aW5nIHZhbHVlIHdpbGwgYmUgdXBkYXRlZCB3aGVuIHRoZSBmb3JrIGlzIGNvbW1pdHRlZC5cblx0XHQvLyBvdGhlcndpc2UsIHRoZSBuZXh0IHRpbWUgd2UgZ2V0IGhlcmUgYWZ0ZXIgYSAncmVhbCB3b3JsZCcgc3RhdGVcblx0XHQvLyBjaGFuZ2UsIGBkZXJpdmVkLmVxdWFsc2AgbWF5IGluY29ycmVjdGx5IHJldHVybiBgdHJ1ZWBcblx0XHRpZiAoIWN1cnJlbnRfYmF0Y2g/LmlzX2ZvcmspIHtcblx0XHRcdGRlcml2ZWQudiA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdGRlcml2ZWQud3YgPSBpbmNyZW1lbnRfd3JpdGVfdmVyc2lvbigpO1xuXHR9XG5cblx0Ly8gZG9uJ3QgbWFyayBkZXJpdmVkIGNsZWFuIGlmIHdlJ3JlIHJlYWRpbmcgaXQgaW5zaWRlIGFcblx0Ly8gY2xlYW51cCBmdW5jdGlvbiwgb3IgaXQgd2lsbCBjYWNoZSBhIHN0YWxlIHZhbHVlXG5cdGlmIChpc19kZXN0cm95aW5nX2VmZmVjdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIER1cmluZyB0aW1lIHRyYXZlbGluZyB3ZSBkb24ndCB3YW50IHRvIHJlc2V0IHRoZSBzdGF0dXMgc28gdGhhdFxuXHQvLyB0cmF2ZXJzYWwgb2YgdGhlIGdyYXBoIGluIHRoZSBvdGhlciBiYXRjaGVzIHN0aWxsIGhhcHBlbnNcblx0aWYgKGJhdGNoX3ZhbHVlcyAhPT0gbnVsbCkge1xuXHRcdC8vIG9ubHkgY2FjaGUgdGhlIHZhbHVlIGlmIHdlJ3JlIGluIGEgdHJhY2tpbmcgY29udGV4dCwgb3RoZXJ3aXNlIHdlIHdvbid0XG5cdFx0Ly8gY2xlYXIgdGhlIGNhY2hlIGluIGBtYXJrX3JlYWN0aW9uc2Agd2hlbiBkZXBlbmRlbmNpZXMgYXJlIHVwZGF0ZWRcblx0XHRpZiAoZWZmZWN0X3RyYWNraW5nKCkgfHwgY3VycmVudF9iYXRjaD8uaXNfZm9yaykge1xuXHRcdFx0YmF0Y2hfdmFsdWVzLnNldChkZXJpdmVkLCB2YWx1ZSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHZhciBzdGF0dXMgPSAoZGVyaXZlZC5mICYgQ09OTkVDVEVEKSA9PT0gMCA/IE1BWUJFX0RJUlRZIDogQ0xFQU47XG5cdFx0c2V0X3NpZ25hbF9zdGF0dXMoZGVyaXZlZCwgc3RhdHVzKTtcblx0fVxufVxuIiwiLyoqIEBpbXBvcnQgeyBEZXJpdmVkLCBFZmZlY3QsIFNvdXJjZSwgVmFsdWUgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQge1xuXHRhY3RpdmVfcmVhY3Rpb24sXG5cdGFjdGl2ZV9lZmZlY3QsXG5cdHVudHJhY2tlZF93cml0ZXMsXG5cdGdldCxcblx0c2V0X3VudHJhY2tlZF93cml0ZXMsXG5cdHNldF9zaWduYWxfc3RhdHVzLFxuXHR1bnRyYWNrLFxuXHRpbmNyZW1lbnRfd3JpdGVfdmVyc2lvbixcblx0dXBkYXRlX2VmZmVjdCxcblx0Y3VycmVudF9zb3VyY2VzLFxuXHRpc19kaXJ0eSxcblx0dW50cmFja2luZyxcblx0aXNfZGVzdHJveWluZ19lZmZlY3QsXG5cdHB1c2hfcmVhY3Rpb25fdmFsdWUsXG5cdHNldF9pc191cGRhdGluZ19lZmZlY3QsXG5cdGlzX3VwZGF0aW5nX2VmZmVjdFxufSBmcm9tICcuLi9ydW50aW1lLmpzJztcbmltcG9ydCB7IGVxdWFscywgc2FmZV9lcXVhbHMgfSBmcm9tICcuL2VxdWFsaXR5LmpzJztcbmltcG9ydCB7XG5cdENMRUFOLFxuXHRERVJJVkVELFxuXHRESVJUWSxcblx0QlJBTkNIX0VGRkVDVCxcblx0RUFHRVJfRUZGRUNULFxuXHRNQVlCRV9ESVJUWSxcblx0QkxPQ0tfRUZGRUNULFxuXHRST09UX0VGRkVDVCxcblx0QVNZTkMsXG5cdFdBU19NQVJLRUQsXG5cdENPTk5FQ1RFRFxufSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5pbXBvcnQgKiBhcyBlIGZyb20gJy4uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBsZWdhY3lfbW9kZV9mbGFnLCB0cmFjaW5nX21vZGVfZmxhZyB9IGZyb20gJy4uLy4uL2ZsYWdzL2luZGV4LmpzJztcbmltcG9ydCB7IHRhZ19wcm94eSB9IGZyb20gJy4uL2Rldi90cmFjaW5nLmpzJztcbmltcG9ydCB7IGdldF9lcnJvciB9IGZyb20gJy4uLy4uL3NoYXJlZC9kZXYuanMnO1xuaW1wb3J0IHsgY29tcG9uZW50X2NvbnRleHQsIGlzX3J1bmVzIH0gZnJvbSAnLi4vY29udGV4dC5qcyc7XG5pbXBvcnQgeyBCYXRjaCwgYmF0Y2hfdmFsdWVzLCBlYWdlcl9ibG9ja19lZmZlY3RzLCBzY2hlZHVsZV9lZmZlY3QgfSBmcm9tICcuL2JhdGNoLmpzJztcbmltcG9ydCB7IHByb3h5IH0gZnJvbSAnLi4vcHJveHkuanMnO1xuaW1wb3J0IHsgZXhlY3V0ZV9kZXJpdmVkIH0gZnJvbSAnLi9kZXJpdmVkcy5qcyc7XG5cbi8qKiBAdHlwZSB7U2V0PGFueT59ICovXG5leHBvcnQgbGV0IGVhZ2VyX2VmZmVjdHMgPSBuZXcgU2V0KCk7XG5cbi8qKiBAdHlwZSB7TWFwPFNvdXJjZSwgYW55Pn0gKi9cbmV4cG9ydCBjb25zdCBvbGRfdmFsdWVzID0gbmV3IE1hcCgpO1xuXG4vKipcbiAqIEBwYXJhbSB7U2V0PGFueT59IHZcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9lYWdlcl9lZmZlY3RzKHYpIHtcblx0ZWFnZXJfZWZmZWN0cyA9IHY7XG59XG5cbmxldCBlYWdlcl9lZmZlY3RzX2RlZmVycmVkID0gZmFsc2U7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRfZWFnZXJfZWZmZWN0c19kZWZlcnJlZCgpIHtcblx0ZWFnZXJfZWZmZWN0c19kZWZlcnJlZCA9IHRydWU7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7Vn0gdlxuICogQHBhcmFtIHtFcnJvciB8IG51bGx9IFtzdGFja11cbiAqIEByZXR1cm5zIHtTb3VyY2U8Vj59XG4gKi9cbi8vIFRPRE8gcmVuYW1lIHRoaXMgdG8gYHN0YXRlYCB0aHJvdWdob3V0IHRoZSBjb2RlYmFzZVxuZXhwb3J0IGZ1bmN0aW9uIHNvdXJjZSh2LCBzdGFjaykge1xuXHQvKiogQHR5cGUge1ZhbHVlfSAqL1xuXHR2YXIgc2lnbmFsID0ge1xuXHRcdGY6IDAsIC8vIFRPRE8gaWRlYWxseSB3ZSBjb3VsZCBza2lwIHRoaXMgYWx0b2dldGhlciwgYnV0IGl0IGNhdXNlcyB0eXBlIGVycm9yc1xuXHRcdHYsXG5cdFx0cmVhY3Rpb25zOiBudWxsLFxuXHRcdGVxdWFscyxcblx0XHRydjogMCxcblx0XHR3djogMFxuXHR9O1xuXG5cdGlmIChERVYgJiYgdHJhY2luZ19tb2RlX2ZsYWcpIHtcblx0XHRzaWduYWwuY3JlYXRlZCA9IHN0YWNrID8/IGdldF9lcnJvcignY3JlYXRlZCBhdCcpO1xuXHRcdHNpZ25hbC51cGRhdGVkID0gbnVsbDtcblx0XHRzaWduYWwuc2V0X2R1cmluZ19lZmZlY3QgPSBmYWxzZTtcblx0XHRzaWduYWwudHJhY2UgPSBudWxsO1xuXHR9XG5cblx0cmV0dXJuIHNpZ25hbDtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUgVlxuICogQHBhcmFtIHtWfSB2XG4gKiBAcGFyYW0ge0Vycm9yIHwgbnVsbH0gW3N0YWNrXVxuICovXG4vKiNfX05PX1NJREVfRUZGRUNUU19fKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZSh2LCBzdGFjaykge1xuXHRjb25zdCBzID0gc291cmNlKHYsIHN0YWNrKTtcblxuXHRwdXNoX3JlYWN0aW9uX3ZhbHVlKHMpO1xuXG5cdHJldHVybiBzO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge1Z9IGluaXRpYWxfdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2ltbXV0YWJsZV1cbiAqIEByZXR1cm5zIHtTb3VyY2U8Vj59XG4gKi9cbi8qI19fTk9fU0lERV9FRkZFQ1RTX18qL1xuZXhwb3J0IGZ1bmN0aW9uIG11dGFibGVfc291cmNlKGluaXRpYWxfdmFsdWUsIGltbXV0YWJsZSA9IGZhbHNlLCB0cmFja2FibGUgPSB0cnVlKSB7XG5cdGNvbnN0IHMgPSBzb3VyY2UoaW5pdGlhbF92YWx1ZSk7XG5cdGlmICghaW1tdXRhYmxlKSB7XG5cdFx0cy5lcXVhbHMgPSBzYWZlX2VxdWFscztcblx0fVxuXG5cdC8vIGJpbmQgdGhlIHNpZ25hbCB0byB0aGUgY29tcG9uZW50IGNvbnRleHQsIGluIGNhc2Ugd2UgbmVlZCB0b1xuXHQvLyB0cmFjayB1cGRhdGVzIHRvIHRyaWdnZXIgYmVmb3JlVXBkYXRlL2FmdGVyVXBkYXRlIGNhbGxiYWNrc1xuXHRpZiAobGVnYWN5X21vZGVfZmxhZyAmJiB0cmFja2FibGUgJiYgY29tcG9uZW50X2NvbnRleHQgIT09IG51bGwgJiYgY29tcG9uZW50X2NvbnRleHQubCAhPT0gbnVsbCkge1xuXHRcdChjb21wb25lbnRfY29udGV4dC5sLnMgPz89IFtdKS5wdXNoKHMpO1xuXHR9XG5cblx0cmV0dXJuIHM7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7VmFsdWU8Vj59IHNvdXJjZVxuICogQHBhcmFtIHtWfSB2YWx1ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gbXV0YXRlKHNvdXJjZSwgdmFsdWUpIHtcblx0c2V0KFxuXHRcdHNvdXJjZSxcblx0XHR1bnRyYWNrKCgpID0+IGdldChzb3VyY2UpKVxuXHQpO1xuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7U291cmNlPFY+fSBzb3VyY2VcbiAqIEBwYXJhbSB7Vn0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3Nob3VsZF9wcm94eV1cbiAqIEByZXR1cm5zIHtWfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0KHNvdXJjZSwgdmFsdWUsIHNob3VsZF9wcm94eSA9IGZhbHNlKSB7XG5cdGlmIChcblx0XHRhY3RpdmVfcmVhY3Rpb24gIT09IG51bGwgJiZcblx0XHQvLyBzaW5jZSB3ZSBhcmUgdW50cmFja2luZyB0aGUgZnVuY3Rpb24gaW5zaWRlIGAkaW5zcGVjdC53aXRoYCB3ZSBuZWVkIHRvIGFkZCB0aGlzIGNoZWNrXG5cdFx0Ly8gdG8gZW5zdXJlIHdlIGVycm9yIGlmIHN0YXRlIGlzIHNldCBpbnNpZGUgYW4gaW5zcGVjdCBlZmZlY3Rcblx0XHQoIXVudHJhY2tpbmcgfHwgKGFjdGl2ZV9yZWFjdGlvbi5mICYgRUFHRVJfRUZGRUNUKSAhPT0gMCkgJiZcblx0XHRpc19ydW5lcygpICYmXG5cdFx0KGFjdGl2ZV9yZWFjdGlvbi5mICYgKERFUklWRUQgfCBCTE9DS19FRkZFQ1QgfCBBU1lOQyB8IEVBR0VSX0VGRkVDVCkpICE9PSAwICYmXG5cdFx0IWN1cnJlbnRfc291cmNlcz8uaW5jbHVkZXMoc291cmNlKVxuXHQpIHtcblx0XHRlLnN0YXRlX3Vuc2FmZV9tdXRhdGlvbigpO1xuXHR9XG5cblx0bGV0IG5ld192YWx1ZSA9IHNob3VsZF9wcm94eSA/IHByb3h5KHZhbHVlKSA6IHZhbHVlO1xuXG5cdGlmIChERVYpIHtcblx0XHR0YWdfcHJveHkobmV3X3ZhbHVlLCAvKiogQHR5cGUge3N0cmluZ30gKi8gKHNvdXJjZS5sYWJlbCkpO1xuXHR9XG5cblx0cmV0dXJuIGludGVybmFsX3NldChzb3VyY2UsIG5ld192YWx1ZSk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7U291cmNlPFY+fSBzb3VyY2VcbiAqIEBwYXJhbSB7Vn0gdmFsdWVcbiAqIEByZXR1cm5zIHtWfVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJuYWxfc2V0KHNvdXJjZSwgdmFsdWUpIHtcblx0aWYgKCFzb3VyY2UuZXF1YWxzKHZhbHVlKSkge1xuXHRcdHZhciBvbGRfdmFsdWUgPSBzb3VyY2UudjtcblxuXHRcdGlmIChpc19kZXN0cm95aW5nX2VmZmVjdCkge1xuXHRcdFx0b2xkX3ZhbHVlcy5zZXQoc291cmNlLCB2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9sZF92YWx1ZXMuc2V0KHNvdXJjZSwgb2xkX3ZhbHVlKTtcblx0XHR9XG5cblx0XHRzb3VyY2UudiA9IHZhbHVlO1xuXG5cdFx0dmFyIGJhdGNoID0gQmF0Y2guZW5zdXJlKCk7XG5cdFx0YmF0Y2guY2FwdHVyZShzb3VyY2UsIG9sZF92YWx1ZSk7XG5cblx0XHRpZiAoREVWKSB7XG5cdFx0XHRpZiAodHJhY2luZ19tb2RlX2ZsYWcgfHwgYWN0aXZlX2VmZmVjdCAhPT0gbnVsbCkge1xuXHRcdFx0XHRzb3VyY2UudXBkYXRlZCA/Pz0gbmV3IE1hcCgpO1xuXG5cdFx0XHRcdC8vIEZvciBwZXJmb3JtYW5jZSByZWFzb25zLCB3aGVuIG5vdCB1c2luZyAkaW5zcGVjdC50cmFjZSwgd2Ugb25seSBzdGFydCBjb2xsZWN0aW5nIHN0YWNrIHRyYWNlc1xuXHRcdFx0XHQvLyBhZnRlciB0aGUgc2FtZSBzb3VyY2UgaGFzIGJlZW4gdXBkYXRlZCBtb3JlIHRoYW4gNSB0aW1lcyBpbiB0aGUgc2FtZSBmbHVzaCBjeWNsZS5cblx0XHRcdFx0Y29uc3QgY291bnQgPSAoc291cmNlLnVwZGF0ZWQuZ2V0KCcnKT8uY291bnQgPz8gMCkgKyAxO1xuXHRcdFx0XHRzb3VyY2UudXBkYXRlZC5zZXQoJycsIHsgZXJyb3I6IC8qKiBAdHlwZSB7YW55fSAqLyAobnVsbCksIGNvdW50IH0pO1xuXG5cdFx0XHRcdGlmICh0cmFjaW5nX21vZGVfZmxhZyB8fCBjb3VudCA+IDUpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IGdldF9lcnJvcigndXBkYXRlZCBhdCcpO1xuXG5cdFx0XHRcdFx0aWYgKGVycm9yICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRsZXQgZW50cnkgPSBzb3VyY2UudXBkYXRlZC5nZXQoZXJyb3Iuc3RhY2spO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdFx0XHRcdGVudHJ5ID0geyBlcnJvciwgY291bnQ6IDAgfTtcblx0XHRcdFx0XHRcdFx0c291cmNlLnVwZGF0ZWQuc2V0KGVycm9yLnN0YWNrLCBlbnRyeSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGVudHJ5LmNvdW50Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhY3RpdmVfZWZmZWN0ICE9PSBudWxsKSB7XG5cdFx0XHRcdHNvdXJjZS5zZXRfZHVyaW5nX2VmZmVjdCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKChzb3VyY2UuZiAmIERFUklWRUQpICE9PSAwKSB7XG5cdFx0XHQvLyBpZiB3ZSBhcmUgYXNzaWduaW5nIHRvIGEgZGlydHkgZGVyaXZlZCB3ZSBzZXQgaXQgdG8gY2xlYW4vbWF5YmUgZGlydHkgYnV0IHdlIGFsc28gZWFnZXJseSBleGVjdXRlIGl0IHRvIHRyYWNrIHRoZSBkZXBlbmRlbmNpZXNcblx0XHRcdGlmICgoc291cmNlLmYgJiBESVJUWSkgIT09IDApIHtcblx0XHRcdFx0ZXhlY3V0ZV9kZXJpdmVkKC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKHNvdXJjZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRfc2lnbmFsX3N0YXR1cyhzb3VyY2UsIChzb3VyY2UuZiAmIENPTk5FQ1RFRCkgIT09IDAgPyBDTEVBTiA6IE1BWUJFX0RJUlRZKTtcblx0XHR9XG5cblx0XHRzb3VyY2Uud3YgPSBpbmNyZW1lbnRfd3JpdGVfdmVyc2lvbigpO1xuXG5cdFx0Ly8gRm9yIGRlYnVnZ2luZywgaW4gY2FzZSB5b3Ugd2FudCB0byBrbm93IHdoaWNoIHJlYWN0aW9ucyBhcmUgYmVpbmcgc2NoZWR1bGVkOlxuXHRcdC8vIGxvZ19yZWFjdGlvbnMoc291cmNlKTtcblx0XHRtYXJrX3JlYWN0aW9ucyhzb3VyY2UsIERJUlRZKTtcblxuXHRcdC8vIEl0J3MgcG9zc2libGUgdGhhdCB0aGUgY3VycmVudCByZWFjdGlvbiBtaWdodCBub3QgaGF2ZSB1cC10by1kYXRlIGRlcGVuZGVuY2llc1xuXHRcdC8vIHdoaWxzdCBpdCdzIGFjdGl2ZWx5IHJ1bm5pbmcuIFNvIGluIHRoZSBjYXNlIG9mIGVuc3VyaW5nIGl0IHJlZ2lzdGVycyB0aGUgcmVhY3Rpb25cblx0XHQvLyBwcm9wZXJseSBmb3IgaXRzZWxmLCB3ZSBuZWVkIHRvIGVuc3VyZSB0aGUgY3VycmVudCBlZmZlY3QgYWN0dWFsbHkgZ2V0c1xuXHRcdC8vIHNjaGVkdWxlZC4gaS5lOiBgJGVmZmVjdCgoKSA9PiB4KyspYFxuXHRcdGlmIChcblx0XHRcdGlzX3J1bmVzKCkgJiZcblx0XHRcdGFjdGl2ZV9lZmZlY3QgIT09IG51bGwgJiZcblx0XHRcdChhY3RpdmVfZWZmZWN0LmYgJiBDTEVBTikgIT09IDAgJiZcblx0XHRcdChhY3RpdmVfZWZmZWN0LmYgJiAoQlJBTkNIX0VGRkVDVCB8IFJPT1RfRUZGRUNUKSkgPT09IDBcblx0XHQpIHtcblx0XHRcdGlmICh1bnRyYWNrZWRfd3JpdGVzID09PSBudWxsKSB7XG5cdFx0XHRcdHNldF91bnRyYWNrZWRfd3JpdGVzKFtzb3VyY2VdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVudHJhY2tlZF93cml0ZXMucHVzaChzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghYmF0Y2guaXNfZm9yayAmJiBlYWdlcl9lZmZlY3RzLnNpemUgPiAwICYmICFlYWdlcl9lZmZlY3RzX2RlZmVycmVkKSB7XG5cdFx0XHRmbHVzaF9lYWdlcl9lZmZlY3RzKCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmx1c2hfZWFnZXJfZWZmZWN0cygpIHtcblx0ZWFnZXJfZWZmZWN0c19kZWZlcnJlZCA9IGZhbHNlO1xuXHR2YXIgcHJldl9pc191cGRhdGluZ19lZmZlY3QgPSBpc191cGRhdGluZ19lZmZlY3Q7XG5cdHNldF9pc191cGRhdGluZ19lZmZlY3QodHJ1ZSk7XG5cblx0Y29uc3QgaW5zcGVjdHMgPSBBcnJheS5mcm9tKGVhZ2VyX2VmZmVjdHMpO1xuXG5cdHRyeSB7XG5cdFx0Zm9yIChjb25zdCBlZmZlY3Qgb2YgaW5zcGVjdHMpIHtcblx0XHRcdC8vIE1hcmsgY2xlYW4gaW5zcGVjdC1lZmZlY3RzIGFzIG1heWJlIGRpcnR5IGFuZCB0aGVuIGNoZWNrIHRoZWlyIGRpcnRpbmVzc1xuXHRcdFx0Ly8gaW5zdGVhZCBvZiBqdXN0IHVwZGF0aW5nIHRoZSBlZmZlY3RzIC0gdGhpcyB3YXkgd2UgYXZvaWQgb3ZlcmZpcmluZy5cblx0XHRcdGlmICgoZWZmZWN0LmYgJiBDTEVBTikgIT09IDApIHtcblx0XHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMoZWZmZWN0LCBNQVlCRV9ESVJUWSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc19kaXJ0eShlZmZlY3QpKSB7XG5cdFx0XHRcdHVwZGF0ZV9lZmZlY3QoZWZmZWN0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0X2lzX3VwZGF0aW5nX2VmZmVjdChwcmV2X2lzX3VwZGF0aW5nX2VmZmVjdCk7XG5cdH1cblxuXHRlYWdlcl9lZmZlY3RzLmNsZWFyKCk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIHtudW1iZXIgfCBiaWdpbnR9IFRcbiAqIEBwYXJhbSB7U291cmNlPFQ+fSBzb3VyY2VcbiAqIEBwYXJhbSB7MSB8IC0xfSBbZF1cbiAqIEByZXR1cm5zIHtUfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlKHNvdXJjZSwgZCA9IDEpIHtcblx0dmFyIHZhbHVlID0gZ2V0KHNvdXJjZSk7XG5cdHZhciByZXN1bHQgPSBkID09PSAxID8gdmFsdWUrKyA6IHZhbHVlLS07XG5cblx0c2V0KHNvdXJjZSwgdmFsdWUpO1xuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUge251bWJlciB8IGJpZ2ludH0gVFxuICogQHBhcmFtIHtTb3VyY2U8VD59IHNvdXJjZVxuICogQHBhcmFtIHsxIHwgLTF9IFtkXVxuICogQHJldHVybnMge1R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVfcHJlKHNvdXJjZSwgZCA9IDEpIHtcblx0dmFyIHZhbHVlID0gZ2V0KHNvdXJjZSk7XG5cblx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRyZXR1cm4gc2V0KHNvdXJjZSwgZCA9PT0gMSA/ICsrdmFsdWUgOiAtLXZhbHVlKTtcbn1cblxuLyoqXG4gKiBTaWxlbnRseSAod2l0aG91dCB1c2luZyBgZ2V0YCkgaW5jcmVtZW50IGEgc291cmNlXG4gKiBAcGFyYW0ge1NvdXJjZTxudW1iZXI+fSBzb3VyY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluY3JlbWVudChzb3VyY2UpIHtcblx0c2V0KHNvdXJjZSwgc291cmNlLnYgKyAxKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge1ZhbHVlfSBzaWduYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGF0dXMgc2hvdWxkIGJlIERJUlRZIG9yIE1BWUJFX0RJUlRZXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZnVuY3Rpb24gbWFya19yZWFjdGlvbnMoc2lnbmFsLCBzdGF0dXMpIHtcblx0dmFyIHJlYWN0aW9ucyA9IHNpZ25hbC5yZWFjdGlvbnM7XG5cdGlmIChyZWFjdGlvbnMgPT09IG51bGwpIHJldHVybjtcblxuXHR2YXIgcnVuZXMgPSBpc19ydW5lcygpO1xuXHR2YXIgbGVuZ3RoID0gcmVhY3Rpb25zLmxlbmd0aDtcblxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0dmFyIHJlYWN0aW9uID0gcmVhY3Rpb25zW2ldO1xuXHRcdHZhciBmbGFncyA9IHJlYWN0aW9uLmY7XG5cblx0XHQvLyBJbiBsZWdhY3kgbW9kZSwgc2tpcCB0aGUgY3VycmVudCBlZmZlY3QgdG8gcHJldmVudCBpbmZpbml0ZSBsb29wc1xuXHRcdGlmICghcnVuZXMgJiYgcmVhY3Rpb24gPT09IGFjdGl2ZV9lZmZlY3QpIGNvbnRpbnVlO1xuXG5cdFx0Ly8gSW5zcGVjdCBlZmZlY3RzIG5lZWQgdG8gcnVuIGltbWVkaWF0ZWx5LCBzbyB0aGF0IHRoZSBzdGFjayB0cmFjZSBtYWtlcyBzZW5zZVxuXHRcdGlmIChERVYgJiYgKGZsYWdzICYgRUFHRVJfRUZGRUNUKSAhPT0gMCkge1xuXHRcdFx0ZWFnZXJfZWZmZWN0cy5hZGQocmVhY3Rpb24pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0dmFyIG5vdF9kaXJ0eSA9IChmbGFncyAmIERJUlRZKSA9PT0gMDtcblxuXHRcdC8vIGRvbid0IHNldCBhIERJUlRZIHJlYWN0aW9uIHRvIE1BWUJFX0RJUlRZXG5cdFx0aWYgKG5vdF9kaXJ0eSkge1xuXHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMocmVhY3Rpb24sIHN0YXR1cyk7XG5cdFx0fVxuXG5cdFx0aWYgKChmbGFncyAmIERFUklWRUQpICE9PSAwKSB7XG5cdFx0XHR2YXIgZGVyaXZlZCA9IC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKHJlYWN0aW9uKTtcblxuXHRcdFx0YmF0Y2hfdmFsdWVzPy5kZWxldGUoZGVyaXZlZCk7XG5cblx0XHRcdGlmICgoZmxhZ3MgJiBXQVNfTUFSS0VEKSA9PT0gMCkge1xuXHRcdFx0XHQvLyBPbmx5IGNvbm5lY3RlZCBkZXJpdmVkcyBjYW4gYmUgcmVsaWFibHkgdW5tYXJrZWQgcmlnaHQgYXdheVxuXHRcdFx0XHRpZiAoZmxhZ3MgJiBDT05ORUNURUQpIHtcblx0XHRcdFx0XHRyZWFjdGlvbi5mIHw9IFdBU19NQVJLRUQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtYXJrX3JlYWN0aW9ucyhkZXJpdmVkLCBNQVlCRV9ESVJUWSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChub3RfZGlydHkpIHtcblx0XHRcdGlmICgoZmxhZ3MgJiBCTE9DS19FRkZFQ1QpICE9PSAwICYmIGVhZ2VyX2Jsb2NrX2VmZmVjdHMgIT09IG51bGwpIHtcblx0XHRcdFx0ZWFnZXJfYmxvY2tfZWZmZWN0cy5hZGQoLyoqIEB0eXBlIHtFZmZlY3R9ICovIChyZWFjdGlvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRzY2hlZHVsZV9lZmZlY3QoLyoqIEB0eXBlIHtFZmZlY3R9ICovIChyZWFjdGlvbikpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqIEBpbXBvcnQgeyBTb3VyY2UgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQge1xuXHRnZXQsXG5cdGFjdGl2ZV9lZmZlY3QsXG5cdHVwZGF0ZV92ZXJzaW9uLFxuXHRhY3RpdmVfcmVhY3Rpb24sXG5cdHNldF91cGRhdGVfdmVyc2lvbixcblx0c2V0X2FjdGl2ZV9yZWFjdGlvblxufSBmcm9tICcuL3J1bnRpbWUuanMnO1xuaW1wb3J0IHtcblx0YXJyYXlfcHJvdG90eXBlLFxuXHRnZXRfZGVzY3JpcHRvcixcblx0Z2V0X3Byb3RvdHlwZV9vZixcblx0aXNfYXJyYXksXG5cdG9iamVjdF9wcm90b3R5cGVcbn0gZnJvbSAnLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdHN0YXRlIGFzIHNvdXJjZSxcblx0c2V0LFxuXHRpbmNyZW1lbnQsXG5cdGZsdXNoX2VhZ2VyX2VmZmVjdHMsXG5cdHNldF9lYWdlcl9lZmZlY3RzX2RlZmVycmVkXG59IGZyb20gJy4vcmVhY3Rpdml0eS9zb3VyY2VzLmpzJztcbmltcG9ydCB7IFBST1hZX1BBVEhfU1lNQk9MLCBTVEFURV9TWU1CT0wgfSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5pbXBvcnQgeyBVTklOSVRJQUxJWkVEIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCAqIGFzIGUgZnJvbSAnLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgdGFnIH0gZnJvbSAnLi9kZXYvdHJhY2luZy5qcyc7XG5pbXBvcnQgeyBnZXRfZXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZGV2LmpzJztcbmltcG9ydCB7IHRyYWNpbmdfbW9kZV9mbGFnIH0gZnJvbSAnLi4vZmxhZ3MvaW5kZXguanMnO1xuXG4vLyBUT0RPIG1vdmUgYWxsIHJlZ2V4ZXMgaW50byBzaGFyZWQgbW9kdWxlP1xuY29uc3QgcmVnZXhfaXNfdmFsaWRfaWRlbnRpZmllciA9IC9eW2EtekEtWl8kXVthLXpBLVpfJDAtOV0qJC87XG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEBwYXJhbSB7VH0gdmFsdWVcbiAqIEByZXR1cm5zIHtUfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJveHkodmFsdWUpIHtcblx0Ly8gaWYgbm9uLXByb3h5YWJsZSwgb3IgaXMgYWxyZWFkeSBhIHByb3h5LCByZXR1cm4gYHZhbHVlYFxuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB2YWx1ZSA9PT0gbnVsbCB8fCBTVEFURV9TWU1CT0wgaW4gdmFsdWUpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRjb25zdCBwcm90b3R5cGUgPSBnZXRfcHJvdG90eXBlX29mKHZhbHVlKTtcblxuXHRpZiAocHJvdG90eXBlICE9PSBvYmplY3RfcHJvdG90eXBlICYmIHByb3RvdHlwZSAhPT0gYXJyYXlfcHJvdG90eXBlKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0LyoqIEB0eXBlIHtNYXA8YW55LCBTb3VyY2U8YW55Pj59ICovXG5cdHZhciBzb3VyY2VzID0gbmV3IE1hcCgpO1xuXHR2YXIgaXNfcHJveGllZF9hcnJheSA9IGlzX2FycmF5KHZhbHVlKTtcblx0dmFyIHZlcnNpb24gPSBzb3VyY2UoMCk7XG5cblx0dmFyIHN0YWNrID0gREVWICYmIHRyYWNpbmdfbW9kZV9mbGFnID8gZ2V0X2Vycm9yKCdjcmVhdGVkIGF0JykgOiBudWxsO1xuXHR2YXIgcGFyZW50X3ZlcnNpb24gPSB1cGRhdGVfdmVyc2lvbjtcblxuXHQvKipcblx0ICogRXhlY3V0ZXMgdGhlIHByb3h5IGluIHRoZSBjb250ZXh0IG9mIHRoZSByZWFjdGlvbiBpdCB3YXMgb3JpZ2luYWxseSBjcmVhdGVkIGluLCBpZiBhbnlcblx0ICogQHRlbXBsYXRlIFRcblx0ICogQHBhcmFtIHsoKSA9PiBUfSBmblxuXHQgKi9cblx0dmFyIHdpdGhfcGFyZW50ID0gKGZuKSA9PiB7XG5cdFx0aWYgKHVwZGF0ZV92ZXJzaW9uID09PSBwYXJlbnRfdmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIGZuKCk7XG5cdFx0fVxuXG5cdFx0Ly8gY2hpbGQgc291cmNlIGlzIGJlaW5nIGNyZWF0ZWQgYWZ0ZXIgdGhlIGluaXRpYWwgcHJveHkg4oCUXG5cdFx0Ly8gcHJldmVudCBpdCBmcm9tIGJlaW5nIGFzc29jaWF0ZWQgd2l0aCB0aGUgY3VycmVudCByZWFjdGlvblxuXHRcdHZhciByZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0XHR2YXIgdmVyc2lvbiA9IHVwZGF0ZV92ZXJzaW9uO1xuXG5cdFx0c2V0X2FjdGl2ZV9yZWFjdGlvbihudWxsKTtcblx0XHRzZXRfdXBkYXRlX3ZlcnNpb24ocGFyZW50X3ZlcnNpb24pO1xuXG5cdFx0dmFyIHJlc3VsdCA9IGZuKCk7XG5cblx0XHRzZXRfYWN0aXZlX3JlYWN0aW9uKHJlYWN0aW9uKTtcblx0XHRzZXRfdXBkYXRlX3ZlcnNpb24odmVyc2lvbik7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9O1xuXG5cdGlmIChpc19wcm94aWVkX2FycmF5KSB7XG5cdFx0Ly8gV2UgbmVlZCB0byBjcmVhdGUgdGhlIGxlbmd0aCBzb3VyY2UgZWFnZXJseSB0byBlbnN1cmUgdGhhdFxuXHRcdC8vIG11dGF0aW9ucyB0byB0aGUgYXJyYXkgYXJlIHByb3Blcmx5IHN5bmNlZCB3aXRoIG91ciBwcm94eVxuXHRcdHNvdXJjZXMuc2V0KCdsZW5ndGgnLCBzb3VyY2UoLyoqIEB0eXBlIHthbnlbXX0gKi8gKHZhbHVlKS5sZW5ndGgsIHN0YWNrKSk7XG5cdFx0aWYgKERFVikge1xuXHRcdFx0dmFsdWUgPSAvKiogQHR5cGUge2FueX0gKi8gKGluc3BlY3RhYmxlX2FycmF5KC8qKiBAdHlwZSB7YW55W119ICovICh2YWx1ZSkpKTtcblx0XHR9XG5cdH1cblxuXHQvKiogVXNlZCBpbiBkZXYgZm9yICRpbnNwZWN0LnRyYWNlKCkgKi9cblx0dmFyIHBhdGggPSAnJztcblx0bGV0IHVwZGF0aW5nID0gZmFsc2U7XG5cdC8qKiBAcGFyYW0ge3N0cmluZ30gbmV3X3BhdGggKi9cblx0ZnVuY3Rpb24gdXBkYXRlX3BhdGgobmV3X3BhdGgpIHtcblx0XHRpZiAodXBkYXRpbmcpIHJldHVybjtcblx0XHR1cGRhdGluZyA9IHRydWU7XG5cdFx0cGF0aCA9IG5ld19wYXRoO1xuXG5cdFx0dGFnKHZlcnNpb24sIGAke3BhdGh9IHZlcnNpb25gKTtcblxuXHRcdC8vIHJlbmFtZSBhbGwgY2hpbGQgc291cmNlcyBhbmQgY2hpbGQgcHJveGllc1xuXHRcdGZvciAoY29uc3QgW3Byb3AsIHNvdXJjZV0gb2Ygc291cmNlcykge1xuXHRcdFx0dGFnKHNvdXJjZSwgZ2V0X2xhYmVsKHBhdGgsIHByb3ApKTtcblx0XHR9XG5cdFx0dXBkYXRpbmcgPSBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBuZXcgUHJveHkoLyoqIEB0eXBlIHthbnl9ICovICh2YWx1ZSksIHtcblx0XHRkZWZpbmVQcm9wZXJ0eShfLCBwcm9wLCBkZXNjcmlwdG9yKSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCEoJ3ZhbHVlJyBpbiBkZXNjcmlwdG9yKSB8fFxuXHRcdFx0XHRkZXNjcmlwdG9yLmNvbmZpZ3VyYWJsZSA9PT0gZmFsc2UgfHxcblx0XHRcdFx0ZGVzY3JpcHRvci5lbnVtZXJhYmxlID09PSBmYWxzZSB8fFxuXHRcdFx0XHRkZXNjcmlwdG9yLndyaXRhYmxlID09PSBmYWxzZVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIHdlIGRpc2FsbG93IG5vbi1iYXNpYyBkZXNjcmlwdG9ycywgYmVjYXVzZSB1bmxlc3MgdGhleSBhcmUgYXBwbGllZCB0byB0aGVcblx0XHRcdFx0Ly8gdGFyZ2V0IG9iamVjdCDigJQgd2hpY2ggd2UgYXZvaWQsIHNvIHRoYXQgc3RhdGUgY2FuIGJlIGZvcmtlZCDigJQgd2Ugd2lsbCBydW5cblx0XHRcdFx0Ly8gYWZvdWwgb2YgdGhlIHZhcmlvdXMgaW52YXJpYW50c1xuXHRcdFx0XHQvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9Qcm94eS9Qcm94eS9nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IjaW52YXJpYW50c1xuXHRcdFx0XHRlLnN0YXRlX2Rlc2NyaXB0b3JzX2ZpeGVkKCk7XG5cdFx0XHR9XG5cdFx0XHR2YXIgcyA9IHNvdXJjZXMuZ2V0KHByb3ApO1xuXHRcdFx0aWYgKHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzID0gd2l0aF9wYXJlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdHZhciBzID0gc291cmNlKGRlc2NyaXB0b3IudmFsdWUsIHN0YWNrKTtcblx0XHRcdFx0XHRzb3VyY2VzLnNldChwcm9wLCBzKTtcblx0XHRcdFx0XHRpZiAoREVWICYmIHR5cGVvZiBwcm9wID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0dGFnKHMsIGdldF9sYWJlbChwYXRoLCBwcm9wKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNldChzLCBkZXNjcmlwdG9yLnZhbHVlLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSxcblxuXHRcdGRlbGV0ZVByb3BlcnR5KHRhcmdldCwgcHJvcCkge1xuXHRcdFx0dmFyIHMgPSBzb3VyY2VzLmdldChwcm9wKTtcblxuXHRcdFx0aWYgKHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAocHJvcCBpbiB0YXJnZXQpIHtcblx0XHRcdFx0XHRjb25zdCBzID0gd2l0aF9wYXJlbnQoKCkgPT4gc291cmNlKFVOSU5JVElBTElaRUQsIHN0YWNrKSk7XG5cdFx0XHRcdFx0c291cmNlcy5zZXQocHJvcCwgcyk7XG5cdFx0XHRcdFx0aW5jcmVtZW50KHZlcnNpb24pO1xuXG5cdFx0XHRcdFx0aWYgKERFVikge1xuXHRcdFx0XHRcdFx0dGFnKHMsIGdldF9sYWJlbChwYXRoLCBwcm9wKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXQocywgVU5JTklUSUFMSVpFRCk7XG5cdFx0XHRcdGluY3JlbWVudCh2ZXJzaW9uKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSxcblxuXHRcdGdldCh0YXJnZXQsIHByb3AsIHJlY2VpdmVyKSB7XG5cdFx0XHRpZiAocHJvcCA9PT0gU1RBVEVfU1lNQk9MKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKERFViAmJiBwcm9wID09PSBQUk9YWV9QQVRIX1NZTUJPTCkge1xuXHRcdFx0XHRyZXR1cm4gdXBkYXRlX3BhdGg7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBzID0gc291cmNlcy5nZXQocHJvcCk7XG5cdFx0XHR2YXIgZXhpc3RzID0gcHJvcCBpbiB0YXJnZXQ7XG5cblx0XHRcdC8vIGNyZWF0ZSBhIHNvdXJjZSwgYnV0IG9ubHkgaWYgaXQncyBhbiBvd24gcHJvcGVydHkgYW5kIG5vdCBhIHByb3RvdHlwZSBwcm9wZXJ0eVxuXHRcdFx0aWYgKHMgPT09IHVuZGVmaW5lZCAmJiAoIWV4aXN0cyB8fCBnZXRfZGVzY3JpcHRvcih0YXJnZXQsIHByb3ApPy53cml0YWJsZSkpIHtcblx0XHRcdFx0cyA9IHdpdGhfcGFyZW50KCgpID0+IHtcblx0XHRcdFx0XHR2YXIgcCA9IHByb3h5KGV4aXN0cyA/IHRhcmdldFtwcm9wXSA6IFVOSU5JVElBTElaRUQpO1xuXHRcdFx0XHRcdHZhciBzID0gc291cmNlKHAsIHN0YWNrKTtcblxuXHRcdFx0XHRcdGlmIChERVYpIHtcblx0XHRcdFx0XHRcdHRhZyhzLCBnZXRfbGFiZWwocGF0aCwgcHJvcCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRzb3VyY2VzLnNldChwcm9wLCBzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR2YXIgdiA9IGdldChzKTtcblx0XHRcdFx0cmV0dXJuIHYgPT09IFVOSU5JVElBTElaRUQgPyB1bmRlZmluZWQgOiB2O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gUmVmbGVjdC5nZXQodGFyZ2V0LCBwcm9wLCByZWNlaXZlcik7XG5cdFx0fSxcblxuXHRcdGdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIHByb3ApIHtcblx0XHRcdHZhciBkZXNjcmlwdG9yID0gUmVmbGVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wKTtcblxuXHRcdFx0aWYgKGRlc2NyaXB0b3IgJiYgJ3ZhbHVlJyBpbiBkZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHZhciBzID0gc291cmNlcy5nZXQocHJvcCk7XG5cdFx0XHRcdGlmIChzKSBkZXNjcmlwdG9yLnZhbHVlID0gZ2V0KHMpO1xuXHRcdFx0fSBlbHNlIGlmIChkZXNjcmlwdG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dmFyIHNvdXJjZSA9IHNvdXJjZXMuZ2V0KHByb3ApO1xuXHRcdFx0XHR2YXIgdmFsdWUgPSBzb3VyY2U/LnY7XG5cblx0XHRcdFx0aWYgKHNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBVTklOSVRJQUxJWkVEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0XHRcdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRcdFx0XHR2YWx1ZSxcblx0XHRcdFx0XHRcdHdyaXRhYmxlOiB0cnVlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0XHR9LFxuXG5cdFx0aGFzKHRhcmdldCwgcHJvcCkge1xuXHRcdFx0aWYgKHByb3AgPT09IFNUQVRFX1NZTUJPTCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0dmFyIHMgPSBzb3VyY2VzLmdldChwcm9wKTtcblx0XHRcdHZhciBoYXMgPSAocyAhPT0gdW5kZWZpbmVkICYmIHMudiAhPT0gVU5JTklUSUFMSVpFRCkgfHwgUmVmbGVjdC5oYXModGFyZ2V0LCBwcm9wKTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRzICE9PSB1bmRlZmluZWQgfHxcblx0XHRcdFx0KGFjdGl2ZV9lZmZlY3QgIT09IG51bGwgJiYgKCFoYXMgfHwgZ2V0X2Rlc2NyaXB0b3IodGFyZ2V0LCBwcm9wKT8ud3JpdGFibGUpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGlmIChzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzID0gd2l0aF9wYXJlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dmFyIHAgPSBoYXMgPyBwcm94eSh0YXJnZXRbcHJvcF0pIDogVU5JTklUSUFMSVpFRDtcblx0XHRcdFx0XHRcdHZhciBzID0gc291cmNlKHAsIHN0YWNrKTtcblxuXHRcdFx0XHRcdFx0aWYgKERFVikge1xuXHRcdFx0XHRcdFx0XHR0YWcocywgZ2V0X2xhYmVsKHBhdGgsIHByb3ApKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHM7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRzb3VyY2VzLnNldChwcm9wLCBzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZhciB2YWx1ZSA9IGdldChzKTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSBVTklOSVRJQUxJWkVEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBoYXM7XG5cdFx0fSxcblxuXHRcdHNldCh0YXJnZXQsIHByb3AsIHZhbHVlLCByZWNlaXZlcikge1xuXHRcdFx0dmFyIHMgPSBzb3VyY2VzLmdldChwcm9wKTtcblx0XHRcdHZhciBoYXMgPSBwcm9wIGluIHRhcmdldDtcblxuXHRcdFx0Ly8gdmFyaWFibGUubGVuZ3RoID0gdmFsdWUgLT4gY2xlYXIgYWxsIHNpZ25hbHMgd2l0aCBpbmRleCA+PSB2YWx1ZVxuXHRcdFx0aWYgKGlzX3Byb3hpZWRfYXJyYXkgJiYgcHJvcCA9PT0gJ2xlbmd0aCcpIHtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IHZhbHVlOyBpIDwgLyoqIEB0eXBlIHtTb3VyY2U8bnVtYmVyPn0gKi8gKHMpLnY7IGkgKz0gMSkge1xuXHRcdFx0XHRcdHZhciBvdGhlcl9zID0gc291cmNlcy5nZXQoaSArICcnKTtcblx0XHRcdFx0XHRpZiAob3RoZXJfcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRzZXQob3RoZXJfcywgVU5JTklUSUFMSVpFRCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpIGluIHRhcmdldCkge1xuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIGl0ZW0gZXhpc3RzIGluIHRoZSBvcmlnaW5hbCwgd2UgbmVlZCB0byBjcmVhdGUgYW4gdW5pbml0aWFsaXplZCBzb3VyY2UsXG5cdFx0XHRcdFx0XHQvLyBlbHNlIGEgbGF0ZXIgcmVhZCBvZiB0aGUgcHJvcGVydHkgd291bGQgcmVzdWx0IGluIGEgc291cmNlIGJlaW5nIGNyZWF0ZWQgd2l0aFxuXHRcdFx0XHRcdFx0Ly8gdGhlIHZhbHVlIG9mIHRoZSBvcmlnaW5hbCBpdGVtIGF0IHRoYXQgaW5kZXguXG5cdFx0XHRcdFx0XHRvdGhlcl9zID0gd2l0aF9wYXJlbnQoKCkgPT4gc291cmNlKFVOSU5JVElBTElaRUQsIHN0YWNrKSk7XG5cdFx0XHRcdFx0XHRzb3VyY2VzLnNldChpICsgJycsIG90aGVyX3MpO1xuXG5cdFx0XHRcdFx0XHRpZiAoREVWKSB7XG5cdFx0XHRcdFx0XHRcdHRhZyhvdGhlcl9zLCBnZXRfbGFiZWwocGF0aCwgaSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBoYXZlbid0IHlldCBjcmVhdGVkIGEgc291cmNlIGZvciB0aGlzIHByb3BlcnR5LCB3ZSBuZWVkIHRvIGVuc3VyZVxuXHRcdFx0Ly8gd2UgZG8gc28gb3RoZXJ3aXNlIGlmIHdlIHJlYWQgaXQgbGF0ZXIsIHRoZW4gdGhlIHdyaXRlIHdvbid0IGJlIHRyYWNrZWQgYW5kXG5cdFx0XHQvLyB0aGUgaGV1cmlzdGljcyBvZiBlZmZlY3RzIHdpbGwgYmUgZGlmZmVyZW50IHZzIGlmIHdlIGhhZCByZWFkIHRoZSBwcm94aWVkXG5cdFx0XHQvLyBvYmplY3QgcHJvcGVydHkgYmVmb3JlIHdyaXRpbmcgdG8gdGhhdCBwcm9wZXJ0eS5cblx0XHRcdGlmIChzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKCFoYXMgfHwgZ2V0X2Rlc2NyaXB0b3IodGFyZ2V0LCBwcm9wKT8ud3JpdGFibGUpIHtcblx0XHRcdFx0XHRzID0gd2l0aF9wYXJlbnQoKCkgPT4gc291cmNlKHVuZGVmaW5lZCwgc3RhY2spKTtcblxuXHRcdFx0XHRcdGlmIChERVYpIHtcblx0XHRcdFx0XHRcdHRhZyhzLCBnZXRfbGFiZWwocGF0aCwgcHJvcCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZXQocywgcHJveHkodmFsdWUpKTtcblxuXHRcdFx0XHRcdHNvdXJjZXMuc2V0KHByb3AsIHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXMgPSBzLnYgIT09IFVOSU5JVElBTElaRUQ7XG5cblx0XHRcdFx0dmFyIHAgPSB3aXRoX3BhcmVudCgoKSA9PiBwcm94eSh2YWx1ZSkpO1xuXHRcdFx0XHRzZXQocywgcCk7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBkZXNjcmlwdG9yID0gUmVmbGVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wKTtcblxuXHRcdFx0Ly8gU2V0IHRoZSBuZXcgdmFsdWUgYmVmb3JlIHVwZGF0aW5nIGFueSBzaWduYWxzIHNvIHRoYXQgYW55IGxpc3RlbmVycyBnZXQgdGhlIG5ldyB2YWx1ZVxuXHRcdFx0aWYgKGRlc2NyaXB0b3I/LnNldCkge1xuXHRcdFx0XHRkZXNjcmlwdG9yLnNldC5jYWxsKHJlY2VpdmVyLCB2YWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaGFzKSB7XG5cdFx0XHRcdC8vIElmIHdlIGhhdmUgbXV0YXRlZCBhbiBhcnJheSBkaXJlY3RseSwgd2UgbWlnaHQgbmVlZCB0b1xuXHRcdFx0XHQvLyBzaWduYWwgdGhhdCBsZW5ndGggaGFzIGFsc28gY2hhbmdlZC4gRG8gaXQgYmVmb3JlIHVwZGF0aW5nIG1ldGFkYXRhXG5cdFx0XHRcdC8vIHRvIGVuc3VyZSB0aGF0IGl0ZXJhdGluZyBvdmVyIHRoZSBhcnJheSBhcyBhIHJlc3VsdCBvZiBhIG1ldGFkYXRhIHVwZGF0ZVxuXHRcdFx0XHQvLyB3aWxsIG5vdCBjYXVzZSB0aGUgbGVuZ3RoIHRvIGJlIG91dCBvZiBzeW5jLlxuXHRcdFx0XHRpZiAoaXNfcHJveGllZF9hcnJheSAmJiB0eXBlb2YgcHJvcCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR2YXIgbHMgPSAvKiogQHR5cGUge1NvdXJjZTxudW1iZXI+fSAqLyAoc291cmNlcy5nZXQoJ2xlbmd0aCcpKTtcblx0XHRcdFx0XHR2YXIgbiA9IE51bWJlcihwcm9wKTtcblxuXHRcdFx0XHRcdGlmIChOdW1iZXIuaXNJbnRlZ2VyKG4pICYmIG4gPj0gbHMudikge1xuXHRcdFx0XHRcdFx0c2V0KGxzLCBuICsgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aW5jcmVtZW50KHZlcnNpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9LFxuXG5cdFx0b3duS2V5cyh0YXJnZXQpIHtcblx0XHRcdGdldCh2ZXJzaW9uKTtcblxuXHRcdFx0dmFyIG93bl9rZXlzID0gUmVmbGVjdC5vd25LZXlzKHRhcmdldCkuZmlsdGVyKChrZXkpID0+IHtcblx0XHRcdFx0dmFyIHNvdXJjZSA9IHNvdXJjZXMuZ2V0KGtleSk7XG5cdFx0XHRcdHJldHVybiBzb3VyY2UgPT09IHVuZGVmaW5lZCB8fCBzb3VyY2UudiAhPT0gVU5JTklUSUFMSVpFRDtcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKHZhciBba2V5LCBzb3VyY2VdIG9mIHNvdXJjZXMpIHtcblx0XHRcdFx0aWYgKHNvdXJjZS52ICE9PSBVTklOSVRJQUxJWkVEICYmICEoa2V5IGluIHRhcmdldCkpIHtcblx0XHRcdFx0XHRvd25fa2V5cy5wdXNoKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG93bl9rZXlzO1xuXHRcdH0sXG5cblx0XHRzZXRQcm90b3R5cGVPZigpIHtcblx0XHRcdGUuc3RhdGVfcHJvdG90eXBlX2ZpeGVkKCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0aFxuICogQHBhcmFtIHtzdHJpbmcgfCBzeW1ib2x9IHByb3BcbiAqL1xuZnVuY3Rpb24gZ2V0X2xhYmVsKHBhdGgsIHByb3ApIHtcblx0aWYgKHR5cGVvZiBwcm9wID09PSAnc3ltYm9sJykgcmV0dXJuIGAke3BhdGh9W1N5bWJvbCgke3Byb3AuZGVzY3JpcHRpb24gPz8gJyd9KV1gO1xuXHRpZiAocmVnZXhfaXNfdmFsaWRfaWRlbnRpZmllci50ZXN0KHByb3ApKSByZXR1cm4gYCR7cGF0aH0uJHtwcm9wfWA7XG5cdHJldHVybiAvXlxcZCskLy50ZXN0KHByb3ApID8gYCR7cGF0aH1bJHtwcm9wfV1gIDogYCR7cGF0aH1bJyR7cHJvcH0nXWA7XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IHZhbHVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRfcHJveGllZF92YWx1ZSh2YWx1ZSkge1xuXHR0cnkge1xuXHRcdGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIFNUQVRFX1NZTUJPTCBpbiB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlW1NUQVRFX1NZTUJPTF07XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHQvLyB0aGUgYWJvdmUgaWYgY2hlY2sgY2FuIHRocm93IGFuIGVycm9yIGlmIHRoZSB2YWx1ZSBpbiBxdWVzdGlvblxuXHRcdC8vIGlzIHRoZSBjb250ZW50V2luZG93IG9mIGFuIGlmcmFtZSBvbiBhbm90aGVyIGRvbWFpbiwgaW4gd2hpY2hcblx0XHQvLyBjYXNlIHdlIHdhbnQgdG8ganVzdCByZXR1cm4gdGhlIHZhbHVlIChiZWNhdXNlIGl0J3MgZGVmaW5pdGVseVxuXHRcdC8vIG5vdCBhIHByb3hpZWQgdmFsdWUpIHNvIHdlIGRvbid0IGJyZWFrIGFueSBKYXZhU2NyaXB0IGludGVyYWN0aW5nXG5cdFx0Ly8gd2l0aCB0aGF0IGlmcmFtZSAoc3VjaCBhcyB2YXJpb3VzIHBheW1lbnQgY29tcGFuaWVzIGNsaWVudCBzaWRlXG5cdFx0Ly8gSmF2YVNjcmlwdCBsaWJyYXJpZXMgaW50ZXJhY3Rpbmcgd2l0aCB0aGVpciBpZnJhbWVzIG9uIHRoZSBzYW1lXG5cdFx0Ly8gZG9tYWluKVxuXHR9XG5cblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7YW55fSBhXG4gKiBAcGFyYW0ge2FueX0gYlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXMoYSwgYikge1xuXHRyZXR1cm4gT2JqZWN0LmlzKGdldF9wcm94aWVkX3ZhbHVlKGEpLCBnZXRfcHJveGllZF92YWx1ZShiKSk7XG59XG5cbmNvbnN0IEFSUkFZX01VVEFUSU5HX01FVEhPRFMgPSBuZXcgU2V0KFtcblx0J2NvcHlXaXRoaW4nLFxuXHQnZmlsbCcsXG5cdCdwb3AnLFxuXHQncHVzaCcsXG5cdCdyZXZlcnNlJyxcblx0J3NoaWZ0Jyxcblx0J3NvcnQnLFxuXHQnc3BsaWNlJyxcblx0J3Vuc2hpZnQnXG5dKTtcblxuLyoqXG4gKiBXcmFwIGFycmF5IG11dGF0aW5nIG1ldGhvZHMgc28gJGluc3BlY3QgaXMgdHJpZ2dlcmVkIG9ubHkgb25jZSBhbmRcbiAqIHRvIHByZXZlbnQgbG9nZ2luZyBhbiBhcnJheSBpbiBpbnRlcm1lZGlhdGUgc3RhdGUgKGUuZy4gd2l0aCBhbiBlbXB0eSBzbG90KVxuICogQHBhcmFtIHthbnlbXX0gYXJyYXlcbiAqL1xuZnVuY3Rpb24gaW5zcGVjdGFibGVfYXJyYXkoYXJyYXkpIHtcblx0cmV0dXJuIG5ldyBQcm94eShhcnJheSwge1xuXHRcdGdldCh0YXJnZXQsIHByb3AsIHJlY2VpdmVyKSB7XG5cdFx0XHR2YXIgdmFsdWUgPSBSZWZsZWN0LmdldCh0YXJnZXQsIHByb3AsIHJlY2VpdmVyKTtcblx0XHRcdGlmICghQVJSQVlfTVVUQVRJTkdfTUVUSE9EUy5oYXMoLyoqIEB0eXBlIHtzdHJpbmd9ICovIChwcm9wKSkpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvKipcblx0XHRcdCAqIEB0aGlzIHthbnlbXX1cblx0XHRcdCAqIEBwYXJhbSB7YW55W119IGFyZ3Ncblx0XHRcdCAqL1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG5cdFx0XHRcdHNldF9lYWdlcl9lZmZlY3RzX2RlZmVycmVkKCk7XG5cdFx0XHRcdHZhciByZXN1bHQgPSB2YWx1ZS5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdFx0Zmx1c2hfZWFnZXJfZWZmZWN0cygpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fTtcblx0XHR9XG5cdH0pO1xufVxuIiwiaW1wb3J0ICogYXMgdyBmcm9tICcuLi93YXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBnZXRfcHJveGllZF92YWx1ZSB9IGZyb20gJy4uL3Byb3h5LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRfYXJyYXlfcHJvdG90eXBlX3dhcm5pbmdzKCkge1xuXHRjb25zdCBhcnJheV9wcm90b3R5cGUgPSBBcnJheS5wcm90b3R5cGU7XG5cdC8vIFRoZSBSRVBMIGVuZHMgdXAgaGVyZSBvdmVyIGFuZCBvdmVyLCBhbmQgdGhpcyBwcmV2ZW50cyBpdCBmcm9tIGFkZGluZyBtb3JlIGFuZCBtb3JlIHBhdGNoZXNcblx0Ly8gb2YgdGhlIHNhbWUga2luZCB0byB0aGUgcHJvdG90eXBlLCB3aGljaCB3b3VsZCBzbG93IGRvd24gZXZlcnl0aGluZyBvdmVyIHRpbWUuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0Y29uc3QgY2xlYW51cCA9IEFycmF5Ll9fc3ZlbHRlX2NsZWFudXA7XG5cdGlmIChjbGVhbnVwKSB7XG5cdFx0Y2xlYW51cCgpO1xuXHR9XG5cblx0Y29uc3QgeyBpbmRleE9mLCBsYXN0SW5kZXhPZiwgaW5jbHVkZXMgfSA9IGFycmF5X3Byb3RvdHlwZTtcblxuXHRhcnJheV9wcm90b3R5cGUuaW5kZXhPZiA9IGZ1bmN0aW9uIChpdGVtLCBmcm9tX2luZGV4KSB7XG5cdFx0Y29uc3QgaW5kZXggPSBpbmRleE9mLmNhbGwodGhpcywgaXRlbSwgZnJvbV9pbmRleCk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gZnJvbV9pbmRleCA/PyAwOyBpIDwgdGhpcy5sZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0XHRpZiAoZ2V0X3Byb3hpZWRfdmFsdWUodGhpc1tpXSkgPT09IGl0ZW0pIHtcblx0XHRcdFx0XHR3LnN0YXRlX3Byb3h5X2VxdWFsaXR5X21pc21hdGNoKCdhcnJheS5pbmRleE9mKC4uLiknKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpbmRleDtcblx0fTtcblxuXHRhcnJheV9wcm90b3R5cGUubGFzdEluZGV4T2YgPSBmdW5jdGlvbiAoaXRlbSwgZnJvbV9pbmRleCkge1xuXHRcdC8vIHdlIG5lZWQgdG8gc3BlY2lmeSB0aGlzLmxlbmd0aCAtIDEgYmVjYXVzZSBpdCdzIHByb2JhYmx5IHVzaW5nIHNvbWV0aGluZyBsaWtlXG5cdFx0Ly8gYGFyZ3VtZW50c2AgaW5zaWRlIHNvIHBhc3NpbmcgdW5kZWZpbmVkIGlzIGRpZmZlcmVudCBmcm9tIG5vdCBwYXNzaW5nIGFueXRoaW5nXG5cdFx0Y29uc3QgaW5kZXggPSBsYXN0SW5kZXhPZi5jYWxsKHRoaXMsIGl0ZW0sIGZyb21faW5kZXggPz8gdGhpcy5sZW5ndGggLSAxKTtcblxuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDw9IChmcm9tX2luZGV4ID8/IHRoaXMubGVuZ3RoIC0gMSk7IGkgKz0gMSkge1xuXHRcdFx0XHRpZiAoZ2V0X3Byb3hpZWRfdmFsdWUodGhpc1tpXSkgPT09IGl0ZW0pIHtcblx0XHRcdFx0XHR3LnN0YXRlX3Byb3h5X2VxdWFsaXR5X21pc21hdGNoKCdhcnJheS5sYXN0SW5kZXhPZiguLi4pJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH07XG5cblx0YXJyYXlfcHJvdG90eXBlLmluY2x1ZGVzID0gZnVuY3Rpb24gKGl0ZW0sIGZyb21faW5kZXgpIHtcblx0XHRjb25zdCBoYXMgPSBpbmNsdWRlcy5jYWxsKHRoaXMsIGl0ZW0sIGZyb21faW5kZXgpO1xuXG5cdFx0aWYgKCFoYXMpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0XHRpZiAoZ2V0X3Byb3hpZWRfdmFsdWUodGhpc1tpXSkgPT09IGl0ZW0pIHtcblx0XHRcdFx0XHR3LnN0YXRlX3Byb3h5X2VxdWFsaXR5X21pc21hdGNoKCdhcnJheS5pbmNsdWRlcyguLi4pJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaGFzO1xuXHR9O1xuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0QXJyYXkuX19zdmVsdGVfY2xlYW51cCA9ICgpID0+IHtcblx0XHRhcnJheV9wcm90b3R5cGUuaW5kZXhPZiA9IGluZGV4T2Y7XG5cdFx0YXJyYXlfcHJvdG90eXBlLmxhc3RJbmRleE9mID0gbGFzdEluZGV4T2Y7XG5cdFx0YXJyYXlfcHJvdG90eXBlLmluY2x1ZGVzID0gaW5jbHVkZXM7XG5cdH07XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IGFcbiAqIEBwYXJhbSB7YW55fSBiXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGVxdWFsXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0cmljdF9lcXVhbHMoYSwgYiwgZXF1YWwgPSB0cnVlKSB7XG5cdC8vIHRyeS1jYXRjaCBuZWVkZWQgYmVjYXVzZSB0aGlzIHRyaWVzIHRvIHJlYWQgcHJvcGVydGllcyBvZiBgYWAgYW5kIGBiYCxcblx0Ly8gd2hpY2ggY291bGQgYmUgZGlzYWxsb3dlZCBmb3IgZXhhbXBsZSBpbiBhIHNlY3VyZSBjb250ZXh0XG5cdHRyeSB7XG5cdFx0aWYgKChhID09PSBiKSAhPT0gKGdldF9wcm94aWVkX3ZhbHVlKGEpID09PSBnZXRfcHJveGllZF92YWx1ZShiKSkpIHtcblx0XHRcdHcuc3RhdGVfcHJveHlfZXF1YWxpdHlfbWlzbWF0Y2goZXF1YWwgPyAnPT09JyA6ICchPT0nKTtcblx0XHR9XG5cdH0gY2F0Y2gge31cblxuXHRyZXR1cm4gKGEgPT09IGIpID09PSBlcXVhbDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge2FueX0gYVxuICogQHBhcmFtIHthbnl9IGJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gZXF1YWxcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXF1YWxzKGEsIGIsIGVxdWFsID0gdHJ1ZSkge1xuXHRpZiAoKGEgPT0gYikgIT09IChnZXRfcHJveGllZF92YWx1ZShhKSA9PSBnZXRfcHJveGllZF92YWx1ZShiKSkpIHtcblx0XHR3LnN0YXRlX3Byb3h5X2VxdWFsaXR5X21pc21hdGNoKGVxdWFsID8gJz09JyA6ICchPScpO1xuXHR9XG5cblx0cmV0dXJuIChhID09IGIpID09PSBlcXVhbDtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0LCBUZW1wbGF0ZU5vZGUgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHsgaHlkcmF0ZV9ub2RlLCBoeWRyYXRpbmcsIHNldF9oeWRyYXRlX25vZGUgfSBmcm9tICcuL2h5ZHJhdGlvbi5qcyc7XG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcbmltcG9ydCB7IGluaXRfYXJyYXlfcHJvdG90eXBlX3dhcm5pbmdzIH0gZnJvbSAnLi4vZGV2L2VxdWFsaXR5LmpzJztcbmltcG9ydCB7IGdldF9kZXNjcmlwdG9yLCBpc19leHRlbnNpYmxlIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7IGFjdGl2ZV9lZmZlY3QgfSBmcm9tICcuLi9ydW50aW1lLmpzJztcbmltcG9ydCB7IGFzeW5jX21vZGVfZmxhZyB9IGZyb20gJy4uLy4uL2ZsYWdzL2luZGV4LmpzJztcbmltcG9ydCB7IFRFWFRfTk9ERSwgRUZGRUNUX1JBTiB9IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7IGVhZ2VyX2Jsb2NrX2VmZmVjdHMgfSBmcm9tICcuLi9yZWFjdGl2aXR5L2JhdGNoLmpzJztcblxuLy8gZXhwb3J0IHRoZXNlIGZvciByZWZlcmVuY2UgaW4gdGhlIGNvbXBpbGVkIGNvZGUsIG1ha2luZyBnbG9iYWwgbmFtZSBkZWR1cGxpY2F0aW9uIHVubmVjZXNzYXJ5XG4vKiogQHR5cGUge1dpbmRvd30gKi9cbmV4cG9ydCB2YXIgJHdpbmRvdztcblxuLyoqIEB0eXBlIHtEb2N1bWVudH0gKi9cbmV4cG9ydCB2YXIgJGRvY3VtZW50O1xuXG4vKiogQHR5cGUge2Jvb2xlYW59ICovXG5leHBvcnQgdmFyIGlzX2ZpcmVmb3g7XG5cbi8qKiBAdHlwZSB7KCkgPT4gTm9kZSB8IG51bGx9ICovXG52YXIgZmlyc3RfY2hpbGRfZ2V0dGVyO1xuLyoqIEB0eXBlIHsoKSA9PiBOb2RlIHwgbnVsbH0gKi9cbnZhciBuZXh0X3NpYmxpbmdfZ2V0dGVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgdGhlc2UgbGF6aWx5IHRvIGF2b2lkIGlzc3VlcyB3aGVuIHVzaW5nIHRoZSBydW50aW1lIGluIGEgc2VydmVyIGNvbnRleHRcbiAqIHdoZXJlIHRoZXNlIGdsb2JhbHMgYXJlIG5vdCBhdmFpbGFibGUgd2hpbGUgYXZvaWRpbmcgYSBzZXBhcmF0ZSBzZXJ2ZXIgZW50cnkgcG9pbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXRfb3BlcmF0aW9ucygpIHtcblx0aWYgKCR3aW5kb3cgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdCR3aW5kb3cgPSB3aW5kb3c7XG5cdCRkb2N1bWVudCA9IGRvY3VtZW50O1xuXHRpc19maXJlZm94ID0gL0ZpcmVmb3gvLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cblx0dmFyIGVsZW1lbnRfcHJvdG90eXBlID0gRWxlbWVudC5wcm90b3R5cGU7XG5cdHZhciBub2RlX3Byb3RvdHlwZSA9IE5vZGUucHJvdG90eXBlO1xuXHR2YXIgdGV4dF9wcm90b3R5cGUgPSBUZXh0LnByb3RvdHlwZTtcblxuXHQvLyBAdHMtaWdub3JlXG5cdGZpcnN0X2NoaWxkX2dldHRlciA9IGdldF9kZXNjcmlwdG9yKG5vZGVfcHJvdG90eXBlLCAnZmlyc3RDaGlsZCcpLmdldDtcblx0Ly8gQHRzLWlnbm9yZVxuXHRuZXh0X3NpYmxpbmdfZ2V0dGVyID0gZ2V0X2Rlc2NyaXB0b3Iobm9kZV9wcm90b3R5cGUsICduZXh0U2libGluZycpLmdldDtcblxuXHRpZiAoaXNfZXh0ZW5zaWJsZShlbGVtZW50X3Byb3RvdHlwZSkpIHtcblx0XHQvLyB0aGUgZm9sbG93aW5nIGFzc2lnbm1lbnRzIGltcHJvdmUgcGVyZiBvZiBsb29rdXBzIG9uIERPTSBub2Rlc1xuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRlbGVtZW50X3Byb3RvdHlwZS5fX2NsaWNrID0gdW5kZWZpbmVkO1xuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRlbGVtZW50X3Byb3RvdHlwZS5fX2NsYXNzTmFtZSA9IHVuZGVmaW5lZDtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0ZWxlbWVudF9wcm90b3R5cGUuX19hdHRyaWJ1dGVzID0gbnVsbDtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0ZWxlbWVudF9wcm90b3R5cGUuX19zdHlsZSA9IHVuZGVmaW5lZDtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0ZWxlbWVudF9wcm90b3R5cGUuX19lID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKGlzX2V4dGVuc2libGUodGV4dF9wcm90b3R5cGUpKSB7XG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdHRleHRfcHJvdG90eXBlLl9fdCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChERVYpIHtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0ZWxlbWVudF9wcm90b3R5cGUuX19zdmVsdGVfbWV0YSA9IG51bGw7XG5cblx0XHRpbml0X2FycmF5X3Byb3RvdHlwZV93YXJuaW5ncygpO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlXG4gKiBAcmV0dXJucyB7VGV4dH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZV90ZXh0KHZhbHVlID0gJycpIHtcblx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHZhbHVlKTtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUge05vZGV9IE5cbiAqIEBwYXJhbSB7Tn0gbm9kZVxuICogQHJldHVybnMge05vZGUgfCBudWxsfVxuICovXG4vKkBfX05PX1NJREVfRUZGRUNUU19fKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRfZmlyc3RfY2hpbGQobm9kZSkge1xuXHRyZXR1cm4gZmlyc3RfY2hpbGRfZ2V0dGVyLmNhbGwobm9kZSk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIHtOb2RlfSBOXG4gKiBAcGFyYW0ge059IG5vZGVcbiAqIEByZXR1cm5zIHtOb2RlIHwgbnVsbH1cbiAqL1xuLypAX19OT19TSURFX0VGRkVDVFNfXyovXG5leHBvcnQgZnVuY3Rpb24gZ2V0X25leHRfc2libGluZyhub2RlKSB7XG5cdHJldHVybiBuZXh0X3NpYmxpbmdfZ2V0dGVyLmNhbGwobm9kZSk7XG59XG5cbi8qKlxuICogRG9uJ3QgbWFyayB0aGlzIGFzIHNpZGUtZWZmZWN0LWZyZWUsIGh5ZHJhdGlvbiBuZWVkcyB0byB3YWxrIGFsbCBub2Rlc1xuICogQHRlbXBsYXRlIHtOb2RlfSBOXG4gKiBAcGFyYW0ge059IG5vZGVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNfdGV4dFxuICogQHJldHVybnMge05vZGUgfCBudWxsfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hpbGQobm9kZSwgaXNfdGV4dCkge1xuXHRpZiAoIWh5ZHJhdGluZykge1xuXHRcdHJldHVybiBnZXRfZmlyc3RfY2hpbGQobm9kZSk7XG5cdH1cblxuXHR2YXIgY2hpbGQgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9maXJzdF9jaGlsZChoeWRyYXRlX25vZGUpKTtcblxuXHQvLyBDaGlsZCBjYW4gYmUgbnVsbCBpZiB3ZSBoYXZlIGFuIGVsZW1lbnQgd2l0aCBhIHNpbmdsZSBjaGlsZCwgbGlrZSBgPHA+e3RleHR9PC9wPmAsIHdoZXJlIGB0ZXh0YCBpcyBlbXB0eVxuXHRpZiAoY2hpbGQgPT09IG51bGwpIHtcblx0XHRjaGlsZCA9IGh5ZHJhdGVfbm9kZS5hcHBlbmRDaGlsZChjcmVhdGVfdGV4dCgpKTtcblx0fSBlbHNlIGlmIChpc190ZXh0ICYmIGNoaWxkLm5vZGVUeXBlICE9PSBURVhUX05PREUpIHtcblx0XHR2YXIgdGV4dCA9IGNyZWF0ZV90ZXh0KCk7XG5cdFx0Y2hpbGQ/LmJlZm9yZSh0ZXh0KTtcblx0XHRzZXRfaHlkcmF0ZV9ub2RlKHRleHQpO1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0c2V0X2h5ZHJhdGVfbm9kZShjaGlsZCk7XG5cdHJldHVybiBjaGlsZDtcbn1cblxuLyoqXG4gKiBEb24ndCBtYXJrIHRoaXMgYXMgc2lkZS1lZmZlY3QtZnJlZSwgaHlkcmF0aW9uIG5lZWRzIHRvIHdhbGsgYWxsIG5vZGVzXG4gKiBAcGFyYW0ge0RvY3VtZW50RnJhZ21lbnQgfCBUZW1wbGF0ZU5vZGUgfCBUZW1wbGF0ZU5vZGVbXX0gZnJhZ21lbnRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzX3RleHRdXG4gKiBAcmV0dXJucyB7Tm9kZSB8IG51bGx9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaXJzdF9jaGlsZChmcmFnbWVudCwgaXNfdGV4dCA9IGZhbHNlKSB7XG5cdGlmICghaHlkcmF0aW5nKSB7XG5cdFx0Ly8gd2hlbiBub3QgaHlkcmF0aW5nLCBgZnJhZ21lbnRgIGlzIGEgYERvY3VtZW50RnJhZ21lbnRgICh0aGUgcmVzdWx0IG9mIGNhbGxpbmcgYG9wZW5fZnJhZ2ApXG5cdFx0dmFyIGZpcnN0ID0gLyoqIEB0eXBlIHtEb2N1bWVudEZyYWdtZW50fSAqLyAoZ2V0X2ZpcnN0X2NoaWxkKC8qKiBAdHlwZSB7Tm9kZX0gKi8gKGZyYWdtZW50KSkpO1xuXG5cdFx0Ly8gVE9ETyBwcmV2ZW50IHVzZXIgY29tbWVudHMgd2l0aCB0aGUgZW1wdHkgc3RyaW5nIHdoZW4gcHJlc2VydmVDb21tZW50cyBpcyB0cnVlXG5cdFx0aWYgKGZpcnN0IGluc3RhbmNlb2YgQ29tbWVudCAmJiBmaXJzdC5kYXRhID09PSAnJykgcmV0dXJuIGdldF9uZXh0X3NpYmxpbmcoZmlyc3QpO1xuXG5cdFx0cmV0dXJuIGZpcnN0O1xuXHR9XG5cblx0Ly8gaWYgYW4ge2V4cHJlc3Npb259IGlzIGVtcHR5IGR1cmluZyBTU1IsIHRoZXJlIG1pZ2h0IGJlIG5vXG5cdC8vIHRleHQgbm9kZSB0byBoeWRyYXRlIOKAlCB3ZSBtdXN0IHRoZXJlZm9yZSBjcmVhdGUgb25lXG5cdGlmIChpc190ZXh0ICYmIGh5ZHJhdGVfbm9kZT8ubm9kZVR5cGUgIT09IFRFWFRfTk9ERSkge1xuXHRcdHZhciB0ZXh0ID0gY3JlYXRlX3RleHQoKTtcblxuXHRcdGh5ZHJhdGVfbm9kZT8uYmVmb3JlKHRleHQpO1xuXHRcdHNldF9oeWRyYXRlX25vZGUodGV4dCk7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRyZXR1cm4gaHlkcmF0ZV9ub2RlO1xufVxuXG4vKipcbiAqIERvbid0IG1hcmsgdGhpcyBhcyBzaWRlLWVmZmVjdC1mcmVlLCBoeWRyYXRpb24gbmVlZHMgdG8gd2FsayBhbGwgbm9kZXNcbiAqIEBwYXJhbSB7VGVtcGxhdGVOb2RlfSBub2RlXG4gKiBAcGFyYW0ge251bWJlcn0gY291bnRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNfdGV4dFxuICogQHJldHVybnMge05vZGUgfCBudWxsfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2libGluZyhub2RlLCBjb3VudCA9IDEsIGlzX3RleHQgPSBmYWxzZSkge1xuXHRsZXQgbmV4dF9zaWJsaW5nID0gaHlkcmF0aW5nID8gaHlkcmF0ZV9ub2RlIDogbm9kZTtcblx0dmFyIGxhc3Rfc2libGluZztcblxuXHR3aGlsZSAoY291bnQtLSkge1xuXHRcdGxhc3Rfc2libGluZyA9IG5leHRfc2libGluZztcblx0XHRuZXh0X3NpYmxpbmcgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9uZXh0X3NpYmxpbmcobmV4dF9zaWJsaW5nKSk7XG5cdH1cblxuXHRpZiAoIWh5ZHJhdGluZykge1xuXHRcdHJldHVybiBuZXh0X3NpYmxpbmc7XG5cdH1cblxuXHQvLyBpZiBhIHNpYmxpbmcge2V4cHJlc3Npb259IGlzIGVtcHR5IGR1cmluZyBTU1IsIHRoZXJlIG1pZ2h0IGJlIG5vXG5cdC8vIHRleHQgbm9kZSB0byBoeWRyYXRlIOKAlCB3ZSBtdXN0IHRoZXJlZm9yZSBjcmVhdGUgb25lXG5cdGlmIChpc190ZXh0ICYmIG5leHRfc2libGluZz8ubm9kZVR5cGUgIT09IFRFWFRfTk9ERSkge1xuXHRcdHZhciB0ZXh0ID0gY3JlYXRlX3RleHQoKTtcblx0XHQvLyBJZiB0aGUgbmV4dCBzaWJsaW5nIGlzIGBudWxsYCBhbmQgd2UncmUgaGFuZGxpbmcgdGV4dCB0aGVuIGl0J3MgYmVjYXVzZVxuXHRcdC8vIHRoZSBTU1IgY29udGVudCB3YXMgZW1wdHkgZm9yIHRoZSB0ZXh0LCBzbyB3ZSBuZWVkIHRvIGdlbmVyYXRlIGEgbmV3IHRleHRcblx0XHQvLyBub2RlIGFuZCBpbnNlcnQgaXQgYWZ0ZXIgdGhlIGxhc3Qgc2libGluZ1xuXHRcdGlmIChuZXh0X3NpYmxpbmcgPT09IG51bGwpIHtcblx0XHRcdGxhc3Rfc2libGluZz8uYWZ0ZXIodGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHRfc2libGluZy5iZWZvcmUodGV4dCk7XG5cdFx0fVxuXHRcdHNldF9oeWRyYXRlX25vZGUodGV4dCk7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRzZXRfaHlkcmF0ZV9ub2RlKG5leHRfc2libGluZyk7XG5cdHJldHVybiAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKG5leHRfc2libGluZyk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIHtOb2RlfSBOXG4gKiBAcGFyYW0ge059IG5vZGVcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJfdGV4dF9jb250ZW50KG5vZGUpIHtcblx0bm9kZS50ZXh0Q29udGVudCA9ICcnO1xufVxuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIGlmIHdlJ3JlIHVwZGF0aW5nIHRoZSBjdXJyZW50IGJsb2NrLCBmb3IgZXhhbXBsZSBgY29uZGl0aW9uYCBpblxuICogYW4gYHsjaWYgY29uZGl0aW9ufWAgYmxvY2sganVzdCBjaGFuZ2VkLiBJbiB0aGlzIGNhc2UsIHRoZSBicmFuY2ggc2hvdWxkIGJlXG4gKiBhcHBlbmRlZCAob3IgcmVtb3ZlZCkgYXQgdGhlIHNhbWUgdGltZSBhcyBvdGhlciB1cGRhdGVzIHdpdGhpbiB0aGVcbiAqIGN1cnJlbnQgYDxzdmVsdGU6Ym91bmRhcnk+YFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkX2RlZmVyX2FwcGVuZCgpIHtcblx0aWYgKCFhc3luY19tb2RlX2ZsYWcpIHJldHVybiBmYWxzZTtcblx0aWYgKGVhZ2VyX2Jsb2NrX2VmZmVjdHMgIT09IG51bGwpIHJldHVybiBmYWxzZTtcblxuXHR2YXIgZmxhZ3MgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpLmY7XG5cdHJldHVybiAoZmxhZ3MgJiBFRkZFQ1RfUkFOKSAhPT0gMDtcbn1cblxuLyoqXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZ1xuICogQHBhcmFtIHtzdHJpbmd9IFtuYW1lc3BhY2VdXG4gKiBAcGFyYW0ge3N0cmluZ30gW2lzXVxuICogQHJldHVybnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZV9lbGVtZW50KHRhZywgbmFtZXNwYWNlLCBpcykge1xuXHRsZXQgb3B0aW9ucyA9IGlzID8geyBpcyB9IDogdW5kZWZpbmVkO1xuXHRpZiAobmFtZXNwYWNlKSB7XG5cdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2UsIHRhZywgb3B0aW9ucyk7XG5cdH1cblx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZV9mcmFnbWVudCgpIHtcblx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gZGF0YVxuICogQHJldHVybnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZV9jb21tZW50KGRhdGEgPSAnJykge1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudChkYXRhKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGVsZW1lbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICogQHJldHVybnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9hdHRyaWJ1dGUoZWxlbWVudCwga2V5LCB2YWx1ZSA9ICcnKSB7XG5cdGlmIChrZXkuc3RhcnRzV2l0aCgneGxpbms6JykpIHtcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZU5TKCdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJywga2V5LCB2YWx1ZSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHJldHVybiBlbGVtZW50LnNldEF0dHJpYnV0ZShrZXksIHZhbHVlKTtcbn1cbiIsImltcG9ydCB7IGh5ZHJhdGluZyB9IGZyb20gJy4uL2h5ZHJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjbGVhcl90ZXh0X2NvbnRlbnQsIGdldF9maXJzdF9jaGlsZCB9IGZyb20gJy4uL29wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgcXVldWVfbWljcm9fdGFzayB9IGZyb20gJy4uL3Rhc2suanMnO1xuXG4vKipcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGRvbVxuICogQHBhcmFtIHtib29sZWFufSB2YWx1ZVxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhdXRvZm9jdXMoZG9tLCB2YWx1ZSkge1xuXHRpZiAodmFsdWUpIHtcblx0XHRjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcblx0XHRkb20uYXV0b2ZvY3VzID0gdHJ1ZTtcblxuXHRcdHF1ZXVlX21pY3JvX3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGJvZHkpIHtcblx0XHRcdFx0ZG9tLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgY2hpbGQgb2YgYSB0ZXh0YXJlYSBhY3R1YWxseSBjb3JyZXNwb25kcyB0byB0aGUgZGVmYXVsdFZhbHVlIHByb3BlcnR5LCBzbyB3ZSBuZWVkXG4gKiB0byByZW1vdmUgaXQgdXBvbiBoeWRyYXRpb24gdG8gYXZvaWQgYSBidWcgd2hlbiBzb21lb25lIHJlc2V0cyB0aGUgZm9ybSB2YWx1ZS5cbiAqIEBwYXJhbSB7SFRNTFRleHRBcmVhRWxlbWVudH0gZG9tXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZV90ZXh0YXJlYV9jaGlsZChkb20pIHtcblx0aWYgKGh5ZHJhdGluZyAmJiBnZXRfZmlyc3RfY2hpbGQoZG9tKSAhPT0gbnVsbCkge1xuXHRcdGNsZWFyX3RleHRfY29udGVudChkb20pO1xuXHR9XG59XG5cbmxldCBsaXN0ZW5pbmdfdG9fZm9ybV9yZXNldCA9IGZhbHNlO1xuXG5leHBvcnQgZnVuY3Rpb24gYWRkX2Zvcm1fcmVzZXRfbGlzdGVuZXIoKSB7XG5cdGlmICghbGlzdGVuaW5nX3RvX2Zvcm1fcmVzZXQpIHtcblx0XHRsaXN0ZW5pbmdfdG9fZm9ybV9yZXNldCA9IHRydWU7XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcblx0XHRcdCdyZXNldCcsXG5cdFx0XHQoZXZ0KSA9PiB7XG5cdFx0XHRcdC8vIE5lZWRzIHRvIGhhcHBlbiBvbmUgdGljayBsYXRlciBvciBlbHNlIHRoZSBkb20gcHJvcGVydGllcyBvZiB0aGUgZm9ybVxuXHRcdFx0XHQvLyBlbGVtZW50cyBoYXZlIG5vdCB1cGRhdGVkIHRvIHRoZWlyIHJlc2V0IHZhbHVlcyB5ZXRcblx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFldnQuZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlIG9mIC8qKkB0eXBlIHtIVE1MRm9ybUVsZW1lbnR9ICovIChldnQudGFyZ2V0KS5lbGVtZW50cykge1xuXHRcdFx0XHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdFx0XHRcdGUuX19vbl9yPy4oKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdC8vIEluIHRoZSBjYXB0dXJlIHBoYXNlIHRvIGd1YXJhbnRlZSB3ZSBnZXQgbm90aWNlZCBvZiBpdCAobm8gcG9zc2liaWxpdHkgb2Ygc3RvcFByb3BhZ2F0aW9uKVxuXHRcdFx0eyBjYXB0dXJlOiB0cnVlIH1cblx0XHQpO1xuXHR9XG59XG4iLCJpbXBvcnQgeyB0ZWFyZG93biB9IGZyb20gJy4uLy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQge1xuXHRhY3RpdmVfZWZmZWN0LFxuXHRhY3RpdmVfcmVhY3Rpb24sXG5cdHNldF9hY3RpdmVfZWZmZWN0LFxuXHRzZXRfYWN0aXZlX3JlYWN0aW9uXG59IGZyb20gJy4uLy4uLy4uL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgYWRkX2Zvcm1fcmVzZXRfbGlzdGVuZXIgfSBmcm9tICcuLi9taXNjLmpzJztcblxuLyoqXG4gKiBGaXJlcyB0aGUgaGFuZGxlciBvbmNlIGltbWVkaWF0ZWx5ICh1bmxlc3MgY29ycmVzcG9uZGluZyBhcmcgaXMgc2V0IHRvIGBmYWxzZWApLFxuICogdGhlbiBsaXN0ZW5zIHRvIHRoZSBnaXZlbiBldmVudHMgdW50aWwgdGhlIHJlbmRlciBlZmZlY3QgY29udGV4dCBpcyBkZXN0cm95ZWRcbiAqIEBwYXJhbSB7RXZlbnRUYXJnZXR9IHRhcmdldFxuICogQHBhcmFtIHtBcnJheTxzdHJpbmc+fSBldmVudHNcbiAqIEBwYXJhbSB7KGV2ZW50PzogRXZlbnQpID0+IHZvaWR9IGhhbmRsZXJcbiAqIEBwYXJhbSB7YW55fSBjYWxsX2hhbmRsZXJfaW1tZWRpYXRlbHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpc3Rlbih0YXJnZXQsIGV2ZW50cywgaGFuZGxlciwgY2FsbF9oYW5kbGVyX2ltbWVkaWF0ZWx5ID0gdHJ1ZSkge1xuXHRpZiAoY2FsbF9oYW5kbGVyX2ltbWVkaWF0ZWx5KSB7XG5cdFx0aGFuZGxlcigpO1xuXHR9XG5cblx0Zm9yICh2YXIgbmFtZSBvZiBldmVudHMpIHtcblx0XHR0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCBoYW5kbGVyKTtcblx0fVxuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRmb3IgKHZhciBuYW1lIG9mIGV2ZW50cykge1xuXHRcdFx0dGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIobmFtZSwgaGFuZGxlcik7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHsoKSA9PiBUfSBmblxuICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aG91dF9yZWFjdGl2ZV9jb250ZXh0KGZuKSB7XG5cdHZhciBwcmV2aW91c19yZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0dmFyIHByZXZpb3VzX2VmZmVjdCA9IGFjdGl2ZV9lZmZlY3Q7XG5cdHNldF9hY3RpdmVfcmVhY3Rpb24obnVsbCk7XG5cdHNldF9hY3RpdmVfZWZmZWN0KG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmbigpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldF9hY3RpdmVfcmVhY3Rpb24ocHJldmlvdXNfcmVhY3Rpb24pO1xuXHRcdHNldF9hY3RpdmVfZWZmZWN0KHByZXZpb3VzX2VmZmVjdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBMaXN0ZW4gdG8gdGhlIGdpdmVuIGV2ZW50LCBhbmQgdGhlbiBpbnN0YW50aWF0ZSBhIGdsb2JhbCBmb3JtIHJlc2V0IGxpc3RlbmVyIGlmIG5vdCBhbHJlYWR5IGRvbmUsXG4gKiB0byBub3RpZnkgYWxsIGJpbmRpbmdzIHdoZW4gdGhlIGZvcm0gaXMgcmVzZXRcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsZW1lbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudFxuICogQHBhcmFtIHsoaXNfcmVzZXQ/OiB0cnVlKSA9PiB2b2lkfSBoYW5kbGVyXG4gKiBAcGFyYW0geyhpc19yZXNldD86IHRydWUpID0+IHZvaWR9IFtvbl9yZXNldF1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpc3Rlbl90b19ldmVudF9hbmRfcmVzZXRfZXZlbnQoZWxlbWVudCwgZXZlbnQsIGhhbmRsZXIsIG9uX3Jlc2V0ID0gaGFuZGxlcikge1xuXHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsICgpID0+IHdpdGhvdXRfcmVhY3RpdmVfY29udGV4dChoYW5kbGVyKSk7XG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0Y29uc3QgcHJldiA9IGVsZW1lbnQuX19vbl9yO1xuXHRpZiAocHJldikge1xuXHRcdC8vIHNwZWNpYWwgY2FzZSBmb3IgY2hlY2tib3ggdGhhdCBjYW4gaGF2ZSBtdWx0aXBsZSBiaW5kcyAoZ3JvdXAgJiBjaGVja2VkKVxuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRlbGVtZW50Ll9fb25fciA9ICgpID0+IHtcblx0XHRcdHByZXYoKTtcblx0XHRcdG9uX3Jlc2V0KHRydWUpO1xuXHRcdH07XG5cdH0gZWxzZSB7XG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGVsZW1lbnQuX19vbl9yID0gKCkgPT4gb25fcmVzZXQodHJ1ZSk7XG5cdH1cblxuXHRhZGRfZm9ybV9yZXNldF9saXN0ZW5lcigpO1xufVxuIiwiLyoqIEBpbXBvcnQgeyBDb21wb25lbnRDb250ZXh0LCBDb21wb25lbnRDb250ZXh0TGVnYWN5LCBEZXJpdmVkLCBFZmZlY3QsIFRlbXBsYXRlTm9kZSwgVHJhbnNpdGlvbk1hbmFnZXIgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHtcblx0aXNfZGlydHksXG5cdGFjdGl2ZV9lZmZlY3QsXG5cdGFjdGl2ZV9yZWFjdGlvbixcblx0dXBkYXRlX2VmZmVjdCxcblx0Z2V0LFxuXHRpc19kZXN0cm95aW5nX2VmZmVjdCxcblx0cmVtb3ZlX3JlYWN0aW9ucyxcblx0c2V0X2FjdGl2ZV9yZWFjdGlvbixcblx0c2V0X2lzX2Rlc3Ryb3lpbmdfZWZmZWN0LFxuXHRzZXRfc2lnbmFsX3N0YXR1cyxcblx0dW50cmFjayxcblx0dW50cmFja2luZ1xufSBmcm9tICcuLi9ydW50aW1lLmpzJztcbmltcG9ydCB7XG5cdERJUlRZLFxuXHRCUkFOQ0hfRUZGRUNULFxuXHRSRU5ERVJfRUZGRUNULFxuXHRFRkZFQ1QsXG5cdERFU1RST1lFRCxcblx0SU5FUlQsXG5cdEVGRkVDVF9SQU4sXG5cdEJMT0NLX0VGRkVDVCxcblx0Uk9PVF9FRkZFQ1QsXG5cdEVGRkVDVF9UUkFOU1BBUkVOVCxcblx0REVSSVZFRCxcblx0Q0xFQU4sXG5cdEVBR0VSX0VGRkVDVCxcblx0SEVBRF9FRkZFQ1QsXG5cdE1BWUJFX0RJUlRZLFxuXHRFRkZFQ1RfUFJFU0VSVkVELFxuXHRTVEFMRV9SRUFDVElPTixcblx0VVNFUl9FRkZFQ1QsXG5cdEFTWU5DLFxuXHRDT05ORUNURUQsXG5cdE1BTkFHRURfRUZGRUNUXG59IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCAqIGFzIGUgZnJvbSAnLi4vZXJyb3JzLmpzJztcbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0IHsgZGVmaW5lX3Byb3BlcnR5IH0gZnJvbSAnLi4vLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldF9uZXh0X3NpYmxpbmcgfSBmcm9tICcuLi9kb20vb3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb21wb25lbnRfY29udGV4dCwgZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uLCBkZXZfc3RhY2sgfSBmcm9tICcuLi9jb250ZXh0LmpzJztcbmltcG9ydCB7IEJhdGNoLCBjdXJyZW50X2JhdGNoLCBzY2hlZHVsZV9lZmZlY3QgfSBmcm9tICcuL2JhdGNoLmpzJztcbmltcG9ydCB7IGZsYXR0ZW4gfSBmcm9tICcuL2FzeW5jLmpzJztcbmltcG9ydCB7IHdpdGhvdXRfcmVhY3RpdmVfY29udGV4dCB9IGZyb20gJy4uL2RvbS9lbGVtZW50cy9iaW5kaW5ncy9zaGFyZWQuanMnO1xuXG4vKipcbiAqIEBwYXJhbSB7JyRlZmZlY3QnIHwgJyRlZmZlY3QucHJlJyB8ICckaW5zcGVjdCd9IHJ1bmVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlX2VmZmVjdChydW5lKSB7XG5cdGlmIChhY3RpdmVfZWZmZWN0ID09PSBudWxsKSB7XG5cdFx0aWYgKGFjdGl2ZV9yZWFjdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0ZS5lZmZlY3Rfb3JwaGFuKHJ1bmUpO1xuXHRcdH1cblxuXHRcdGUuZWZmZWN0X2luX3Vub3duZWRfZGVyaXZlZCgpO1xuXHR9XG5cblx0aWYgKGlzX2Rlc3Ryb3lpbmdfZWZmZWN0KSB7XG5cdFx0ZS5lZmZlY3RfaW5fdGVhcmRvd24ocnVuZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKiBAcGFyYW0ge0VmZmVjdH0gcGFyZW50X2VmZmVjdFxuICovXG5mdW5jdGlvbiBwdXNoX2VmZmVjdChlZmZlY3QsIHBhcmVudF9lZmZlY3QpIHtcblx0dmFyIHBhcmVudF9sYXN0ID0gcGFyZW50X2VmZmVjdC5sYXN0O1xuXHRpZiAocGFyZW50X2xhc3QgPT09IG51bGwpIHtcblx0XHRwYXJlbnRfZWZmZWN0Lmxhc3QgPSBwYXJlbnRfZWZmZWN0LmZpcnN0ID0gZWZmZWN0O1xuXHR9IGVsc2Uge1xuXHRcdHBhcmVudF9sYXN0Lm5leHQgPSBlZmZlY3Q7XG5cdFx0ZWZmZWN0LnByZXYgPSBwYXJlbnRfbGFzdDtcblx0XHRwYXJlbnRfZWZmZWN0Lmxhc3QgPSBlZmZlY3Q7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge251bWJlcn0gdHlwZVxuICogQHBhcmFtIHtudWxsIHwgKCgpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCkpfSBmblxuICogQHBhcmFtIHtib29sZWFufSBzeW5jXG4gKiBAcmV0dXJucyB7RWZmZWN0fVxuICovXG5mdW5jdGlvbiBjcmVhdGVfZWZmZWN0KHR5cGUsIGZuLCBzeW5jKSB7XG5cdHZhciBwYXJlbnQgPSBhY3RpdmVfZWZmZWN0O1xuXG5cdGlmIChERVYpIHtcblx0XHQvLyBFbnN1cmUgdGhlIHBhcmVudCBpcyBuZXZlciBhbiBpbnNwZWN0IGVmZmVjdFxuXHRcdHdoaWxlIChwYXJlbnQgIT09IG51bGwgJiYgKHBhcmVudC5mICYgRUFHRVJfRUZGRUNUKSAhPT0gMCkge1xuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudDtcblx0XHR9XG5cdH1cblxuXHRpZiAocGFyZW50ICE9PSBudWxsICYmIChwYXJlbnQuZiAmIElORVJUKSAhPT0gMCkge1xuXHRcdHR5cGUgfD0gSU5FUlQ7XG5cdH1cblxuXHQvKiogQHR5cGUge0VmZmVjdH0gKi9cblx0dmFyIGVmZmVjdCA9IHtcblx0XHRjdHg6IGNvbXBvbmVudF9jb250ZXh0LFxuXHRcdGRlcHM6IG51bGwsXG5cdFx0bm9kZXNfc3RhcnQ6IG51bGwsXG5cdFx0bm9kZXNfZW5kOiBudWxsLFxuXHRcdGY6IHR5cGUgfCBESVJUWSB8IENPTk5FQ1RFRCxcblx0XHRmaXJzdDogbnVsbCxcblx0XHRmbixcblx0XHRsYXN0OiBudWxsLFxuXHRcdG5leHQ6IG51bGwsXG5cdFx0cGFyZW50LFxuXHRcdGI6IHBhcmVudCAmJiBwYXJlbnQuYixcblx0XHRwcmV2OiBudWxsLFxuXHRcdHRlYXJkb3duOiBudWxsLFxuXHRcdHRyYW5zaXRpb25zOiBudWxsLFxuXHRcdHd2OiAwLFxuXHRcdGFjOiBudWxsXG5cdH07XG5cblx0aWYgKERFVikge1xuXHRcdGVmZmVjdC5jb21wb25lbnRfZnVuY3Rpb24gPSBkZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb247XG5cdH1cblxuXHRpZiAoc3luYykge1xuXHRcdHRyeSB7XG5cdFx0XHR1cGRhdGVfZWZmZWN0KGVmZmVjdCk7XG5cdFx0XHRlZmZlY3QuZiB8PSBFRkZFQ1RfUkFOO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGRlc3Ryb3lfZWZmZWN0KGVmZmVjdCk7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fSBlbHNlIGlmIChmbiAhPT0gbnVsbCkge1xuXHRcdHNjaGVkdWxlX2VmZmVjdChlZmZlY3QpO1xuXHR9XG5cblx0LyoqIEB0eXBlIHtFZmZlY3QgfCBudWxsfSAqL1xuXHR2YXIgZSA9IGVmZmVjdDtcblxuXHQvLyBpZiBhbiBlZmZlY3QgaGFzIGFscmVhZHkgcmFuIGFuZCBkb2Vzbid0IG5lZWQgdG8gYmUga2VwdCBpbiB0aGUgdHJlZVxuXHQvLyAoYmVjYXVzZSBpdCB3b24ndCByZS1ydW4sIGhhcyBubyBET00sIGFuZCBoYXMgbm8gdGVhcmRvd24gZXRjKVxuXHQvLyB0aGVuIHdlIHNraXAgaXQgYW5kIGdvIHRvIGl0cyBjaGlsZCAoaWYgYW55KVxuXHRpZiAoXG5cdFx0c3luYyAmJlxuXHRcdGUuZGVwcyA9PT0gbnVsbCAmJlxuXHRcdGUudGVhcmRvd24gPT09IG51bGwgJiZcblx0XHRlLm5vZGVzX3N0YXJ0ID09PSBudWxsICYmXG5cdFx0ZS5maXJzdCA9PT0gZS5sYXN0ICYmIC8vIGVpdGhlciBgbnVsbGAsIG9yIGEgc2luZ3VsYXIgY2hpbGRcblx0XHQoZS5mICYgRUZGRUNUX1BSRVNFUlZFRCkgPT09IDBcblx0KSB7XG5cdFx0ZSA9IGUuZmlyc3Q7XG5cdFx0aWYgKCh0eXBlICYgQkxPQ0tfRUZGRUNUKSAhPT0gMCAmJiAodHlwZSAmIEVGRkVDVF9UUkFOU1BBUkVOVCkgIT09IDAgJiYgZSAhPT0gbnVsbCkge1xuXHRcdFx0ZS5mIHw9IEVGRkVDVF9UUkFOU1BBUkVOVDtcblx0XHR9XG5cdH1cblxuXHRpZiAoZSAhPT0gbnVsbCkge1xuXHRcdGUucGFyZW50ID0gcGFyZW50O1xuXG5cdFx0aWYgKHBhcmVudCAhPT0gbnVsbCkge1xuXHRcdFx0cHVzaF9lZmZlY3QoZSwgcGFyZW50KTtcblx0XHR9XG5cblx0XHQvLyBpZiB3ZSdyZSBpbiBhIGRlcml2ZWQsIGFkZCB0aGUgZWZmZWN0IHRoZXJlIHRvb1xuXHRcdGlmIChcblx0XHRcdGFjdGl2ZV9yZWFjdGlvbiAhPT0gbnVsbCAmJlxuXHRcdFx0KGFjdGl2ZV9yZWFjdGlvbi5mICYgREVSSVZFRCkgIT09IDAgJiZcblx0XHRcdCh0eXBlICYgUk9PVF9FRkZFQ1QpID09PSAwXG5cdFx0KSB7XG5cdFx0XHR2YXIgZGVyaXZlZCA9IC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGFjdGl2ZV9yZWFjdGlvbik7XG5cdFx0XHQoZGVyaXZlZC5lZmZlY3RzID8/PSBbXSkucHVzaChlKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZWZmZWN0O1xufVxuXG4vKipcbiAqIEludGVybmFsIHJlcHJlc2VudGF0aW9uIG9mIGAkZWZmZWN0LnRyYWNraW5nKClgXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdF90cmFja2luZygpIHtcblx0cmV0dXJuIGFjdGl2ZV9yZWFjdGlvbiAhPT0gbnVsbCAmJiAhdW50cmFja2luZztcbn1cblxuLyoqXG4gKiBAcGFyYW0geygpID0+IHZvaWR9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZWFyZG93bihmbikge1xuXHRjb25zdCBlZmZlY3QgPSBjcmVhdGVfZWZmZWN0KFJFTkRFUl9FRkZFQ1QsIG51bGwsIGZhbHNlKTtcblx0c2V0X3NpZ25hbF9zdGF0dXMoZWZmZWN0LCBDTEVBTik7XG5cdGVmZmVjdC50ZWFyZG93biA9IGZuO1xuXHRyZXR1cm4gZWZmZWN0O1xufVxuXG4vKipcbiAqIEludGVybmFsIHJlcHJlc2VudGF0aW9uIG9mIGAkZWZmZWN0KC4uLilgXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2VyX2VmZmVjdChmbikge1xuXHR2YWxpZGF0ZV9lZmZlY3QoJyRlZmZlY3QnKTtcblxuXHRpZiAoREVWKSB7XG5cdFx0ZGVmaW5lX3Byb3BlcnR5KGZuLCAnbmFtZScsIHtcblx0XHRcdHZhbHVlOiAnJGVmZmVjdCdcblx0XHR9KTtcblx0fVxuXG5cdC8vIE5vbi1uZXN0ZWQgYCRlZmZlY3QoLi4uKWAgaW4gYSBjb21wb25lbnQgc2hvdWxkIGJlIGRlZmVycmVkXG5cdC8vIHVudGlsIHRoZSBjb21wb25lbnQgaXMgbW91bnRlZFxuXHR2YXIgZmxhZ3MgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpLmY7XG5cdHZhciBkZWZlciA9ICFhY3RpdmVfcmVhY3Rpb24gJiYgKGZsYWdzICYgQlJBTkNIX0VGRkVDVCkgIT09IDAgJiYgKGZsYWdzICYgRUZGRUNUX1JBTikgPT09IDA7XG5cblx0aWYgKGRlZmVyKSB7XG5cdFx0Ly8gVG9wLWxldmVsIGAkZWZmZWN0KC4uLilgIGluIGFuIHVubW91bnRlZCBjb21wb25lbnQg4oCUIGRlZmVyIHVudGlsIG1vdW50XG5cdFx0dmFyIGNvbnRleHQgPSAvKiogQHR5cGUge0NvbXBvbmVudENvbnRleHR9ICovIChjb21wb25lbnRfY29udGV4dCk7XG5cdFx0KGNvbnRleHQuZSA/Pz0gW10pLnB1c2goZm4pO1xuXHR9IGVsc2Uge1xuXHRcdC8vIEV2ZXJ5dGhpbmcgZWxzZSDigJQgY3JlYXRlIGltbWVkaWF0ZWx5XG5cdFx0cmV0dXJuIGNyZWF0ZV91c2VyX2VmZmVjdChmbik7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVfdXNlcl9lZmZlY3QoZm4pIHtcblx0cmV0dXJuIGNyZWF0ZV9lZmZlY3QoRUZGRUNUIHwgVVNFUl9FRkZFQ1QsIGZuLCBmYWxzZSk7XG59XG5cbi8qKlxuICogSW50ZXJuYWwgcmVwcmVzZW50YXRpb24gb2YgYCRlZmZlY3QucHJlKC4uLilgXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcmV0dXJucyB7RWZmZWN0fVxuICovXG5leHBvcnQgZnVuY3Rpb24gdXNlcl9wcmVfZWZmZWN0KGZuKSB7XG5cdHZhbGlkYXRlX2VmZmVjdCgnJGVmZmVjdC5wcmUnKTtcblx0aWYgKERFVikge1xuXHRcdGRlZmluZV9wcm9wZXJ0eShmbiwgJ25hbWUnLCB7XG5cdFx0XHR2YWx1ZTogJyRlZmZlY3QucHJlJ1xuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBjcmVhdGVfZWZmZWN0KFJFTkRFUl9FRkZFQ1QgfCBVU0VSX0VGRkVDVCwgZm4sIHRydWUpO1xufVxuXG4vKiogQHBhcmFtIHsoKSA9PiB2b2lkIHwgKCgpID0+IHZvaWQpfSBmbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVhZ2VyX2VmZmVjdChmbikge1xuXHRyZXR1cm4gY3JlYXRlX2VmZmVjdChFQUdFUl9FRkZFQ1QsIGZuLCB0cnVlKTtcbn1cblxuLyoqXG4gKiBJbnRlcm5hbCByZXByZXNlbnRhdGlvbiBvZiBgJGVmZmVjdC5yb290KC4uLilgXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcmV0dXJucyB7KCkgPT4gdm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdF9yb290KGZuKSB7XG5cdEJhdGNoLmVuc3VyZSgpO1xuXHRjb25zdCBlZmZlY3QgPSBjcmVhdGVfZWZmZWN0KFJPT1RfRUZGRUNUIHwgRUZGRUNUX1BSRVNFUlZFRCwgZm4sIHRydWUpO1xuXG5cdHJldHVybiAoKSA9PiB7XG5cdFx0ZGVzdHJveV9lZmZlY3QoZWZmZWN0KTtcblx0fTtcbn1cblxuLyoqXG4gKiBBbiBlZmZlY3Qgcm9vdCB3aG9zZSBjaGlsZHJlbiBjYW4gdHJhbnNpdGlvbiBvdXRcbiAqIEBwYXJhbSB7KCkgPT4gdm9pZH0gZm5cbiAqIEByZXR1cm5zIHsob3B0aW9ucz86IHsgb3V0cm8/OiBib29sZWFuIH0pID0+IFByb21pc2U8dm9pZD59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wb25lbnRfcm9vdChmbikge1xuXHRCYXRjaC5lbnN1cmUoKTtcblx0Y29uc3QgZWZmZWN0ID0gY3JlYXRlX2VmZmVjdChST09UX0VGRkVDVCB8IEVGRkVDVF9QUkVTRVJWRUQsIGZuLCB0cnVlKTtcblxuXHRyZXR1cm4gKG9wdGlvbnMgPSB7fSkgPT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoZnVsZmlsKSA9PiB7XG5cdFx0XHRpZiAob3B0aW9ucy5vdXRybykge1xuXHRcdFx0XHRwYXVzZV9lZmZlY3QoZWZmZWN0LCAoKSA9PiB7XG5cdFx0XHRcdFx0ZGVzdHJveV9lZmZlY3QoZWZmZWN0KTtcblx0XHRcdFx0XHRmdWxmaWwodW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXN0cm95X2VmZmVjdChlZmZlY3QpO1xuXHRcdFx0XHRmdWxmaWwodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcmV0dXJucyB7RWZmZWN0fVxuICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0KGZuKSB7XG5cdHJldHVybiBjcmVhdGVfZWZmZWN0KEVGRkVDVCwgZm4sIGZhbHNlKTtcbn1cblxuLyoqXG4gKiBJbnRlcm5hbCByZXByZXNlbnRhdGlvbiBvZiBgJDogLi5gXG4gKiBAcGFyYW0geygpID0+IGFueX0gZGVwc1xuICogQHBhcmFtIHsoKSA9PiB2b2lkIHwgKCgpID0+IHZvaWQpfSBmblxuICovXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5X3ByZV9lZmZlY3QoZGVwcywgZm4pIHtcblx0dmFyIGNvbnRleHQgPSAvKiogQHR5cGUge0NvbXBvbmVudENvbnRleHRMZWdhY3l9ICovIChjb21wb25lbnRfY29udGV4dCk7XG5cblx0LyoqIEB0eXBlIHt7IGVmZmVjdDogbnVsbCB8IEVmZmVjdCwgcmFuOiBib29sZWFuLCBkZXBzOiAoKSA9PiBhbnkgfX0gKi9cblx0dmFyIHRva2VuID0geyBlZmZlY3Q6IG51bGwsIHJhbjogZmFsc2UsIGRlcHMgfTtcblxuXHRjb250ZXh0LmwuJC5wdXNoKHRva2VuKTtcblxuXHR0b2tlbi5lZmZlY3QgPSByZW5kZXJfZWZmZWN0KCgpID0+IHtcblx0XHRkZXBzKCk7XG5cblx0XHQvLyBJZiB0aGlzIGxlZ2FjeSBwcmUgZWZmZWN0IGhhcyBhbHJlYWR5IHJ1biBiZWZvcmUgdGhlIGVuZCBvZiB0aGUgcmVzZXQsIHRoZW5cblx0XHQvLyBiYWlsIG91dCB0byBlbXVsYXRlIHRoZSBzYW1lIGJlaGF2aW9yLlxuXHRcdGlmICh0b2tlbi5yYW4pIHJldHVybjtcblxuXHRcdHRva2VuLnJhbiA9IHRydWU7XG5cdFx0dW50cmFjayhmbik7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5X3ByZV9lZmZlY3RfcmVzZXQoKSB7XG5cdHZhciBjb250ZXh0ID0gLyoqIEB0eXBlIHtDb21wb25lbnRDb250ZXh0TGVnYWN5fSAqLyAoY29tcG9uZW50X2NvbnRleHQpO1xuXG5cdHJlbmRlcl9lZmZlY3QoKCkgPT4ge1xuXHRcdC8vIFJ1biBkaXJ0eSBgJDpgIHN0YXRlbWVudHNcblx0XHRmb3IgKHZhciB0b2tlbiBvZiBjb250ZXh0LmwuJCkge1xuXHRcdFx0dG9rZW4uZGVwcygpO1xuXG5cdFx0XHR2YXIgZWZmZWN0ID0gdG9rZW4uZWZmZWN0O1xuXG5cdFx0XHQvLyBJZiB0aGUgZWZmZWN0IGlzIENMRUFOLCB0aGVuIG1ha2UgaXQgTUFZQkVfRElSVFkuIFRoaXMgZW5zdXJlcyB3ZSB0cmF2ZXJzZSB0aHJvdWdoXG5cdFx0XHQvLyB0aGUgZWZmZWN0cyBkZXBlbmRlbmNpZXMgYW5kIGNvcnJlY3RseSBlbnN1cmUgZWFjaCBkZXBlbmRlbmN5IGlzIHVwLXRvLWRhdGUuXG5cdFx0XHRpZiAoKGVmZmVjdC5mICYgQ0xFQU4pICE9PSAwKSB7XG5cdFx0XHRcdHNldF9zaWduYWxfc3RhdHVzKGVmZmVjdCwgTUFZQkVfRElSVFkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNfZGlydHkoZWZmZWN0KSkge1xuXHRcdFx0XHR1cGRhdGVfZWZmZWN0KGVmZmVjdCk7XG5cdFx0XHR9XG5cblx0XHRcdHRva2VuLnJhbiA9IGZhbHNlO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHsoKSA9PiB2b2lkIHwgKCgpID0+IHZvaWQpfSBmblxuICogQHJldHVybnMge0VmZmVjdH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzeW5jX2VmZmVjdChmbikge1xuXHRyZXR1cm4gY3JlYXRlX2VmZmVjdChBU1lOQyB8IEVGRkVDVF9QUkVTRVJWRUQsIGZuLCB0cnVlKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcmV0dXJucyB7RWZmZWN0fVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyX2VmZmVjdChmbiwgZmxhZ3MgPSAwKSB7XG5cdHJldHVybiBjcmVhdGVfZWZmZWN0KFJFTkRFUl9FRkZFQ1QgfCBmbGFncywgZm4sIHRydWUpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7KC4uLmV4cHJlc3Npb25zOiBhbnkpID0+IHZvaWQgfCAoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcGFyYW0ge0FycmF5PCgpID0+IGFueT59IHN5bmNcbiAqIEBwYXJhbSB7QXJyYXk8KCkgPT4gUHJvbWlzZTxhbnk+Pn0gYXN5bmNcbiAqIEBwYXJhbSB7QXJyYXk8UHJvbWlzZTx2b2lkPj59IGJsb2NrZXJzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZW1wbGF0ZV9lZmZlY3QoZm4sIHN5bmMgPSBbXSwgYXN5bmMgPSBbXSwgYmxvY2tlcnMgPSBbXSkge1xuXHRmbGF0dGVuKGJsb2NrZXJzLCBzeW5jLCBhc3luYywgKHZhbHVlcykgPT4ge1xuXHRcdGNyZWF0ZV9lZmZlY3QoUkVOREVSX0VGRkVDVCwgKCkgPT4gZm4oLi4udmFsdWVzLm1hcChnZXQpKSwgdHJ1ZSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIExpa2UgYHRlbXBsYXRlX2VmZmVjdGAsIGJ1dCB3aXRoIGFuIGVmZmVjdCB3aGljaCBpcyBkZWZlcnJlZCB1bnRpbCB0aGUgYmF0Y2ggY29tbWl0c1xuICogQHBhcmFtIHsoLi4uZXhwcmVzc2lvbnM6IGFueSkgPT4gdm9pZCB8ICgoKSA9PiB2b2lkKX0gZm5cbiAqIEBwYXJhbSB7QXJyYXk8KCkgPT4gYW55Pn0gc3luY1xuICogQHBhcmFtIHtBcnJheTwoKSA9PiBQcm9taXNlPGFueT4+fSBhc3luY1xuICogQHBhcmFtIHtBcnJheTxQcm9taXNlPHZvaWQ+Pn0gYmxvY2tlcnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmVycmVkX3RlbXBsYXRlX2VmZmVjdChmbiwgc3luYyA9IFtdLCBhc3luYyA9IFtdLCBibG9ja2VycyA9IFtdKSB7XG5cdHZhciBiYXRjaCA9IC8qKiBAdHlwZSB7QmF0Y2h9ICovIChjdXJyZW50X2JhdGNoKTtcblx0dmFyIGlzX2FzeW5jID0gYXN5bmMubGVuZ3RoID4gMCB8fCBibG9ja2Vycy5sZW5ndGggPiAwO1xuXG5cdGlmIChpc19hc3luYykgYmF0Y2guaW5jcmVtZW50KHRydWUpO1xuXG5cdGZsYXR0ZW4oYmxvY2tlcnMsIHN5bmMsIGFzeW5jLCAodmFsdWVzKSA9PiB7XG5cdFx0Y3JlYXRlX2VmZmVjdChFRkZFQ1QsICgpID0+IGZuKC4uLnZhbHVlcy5tYXAoZ2V0KSksIGZhbHNlKTtcblx0XHRpZiAoaXNfYXN5bmMpIGJhdGNoLmRlY3JlbWVudCh0cnVlKTtcblx0fSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHsoKCkgPT4gdm9pZCl9IGZuXG4gKiBAcGFyYW0ge251bWJlcn0gZmxhZ3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJsb2NrKGZuLCBmbGFncyA9IDApIHtcblx0dmFyIGVmZmVjdCA9IGNyZWF0ZV9lZmZlY3QoQkxPQ0tfRUZGRUNUIHwgZmxhZ3MsIGZuLCB0cnVlKTtcblx0aWYgKERFVikge1xuXHRcdGVmZmVjdC5kZXZfc3RhY2sgPSBkZXZfc3RhY2s7XG5cdH1cblx0cmV0dXJuIGVmZmVjdDtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygoKSA9PiB2b2lkKX0gZm5cbiAqIEBwYXJhbSB7bnVtYmVyfSBmbGFnc1xuICovXG5leHBvcnQgZnVuY3Rpb24gbWFuYWdlZChmbiwgZmxhZ3MgPSAwKSB7XG5cdHZhciBlZmZlY3QgPSBjcmVhdGVfZWZmZWN0KE1BTkFHRURfRUZGRUNUIHwgZmxhZ3MsIGZuLCB0cnVlKTtcblx0aWYgKERFVikge1xuXHRcdGVmZmVjdC5kZXZfc3RhY2sgPSBkZXZfc3RhY2s7XG5cdH1cblx0cmV0dXJuIGVmZmVjdDtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygoKSA9PiB2b2lkKX0gZm5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJyYW5jaChmbikge1xuXHRyZXR1cm4gY3JlYXRlX2VmZmVjdChCUkFOQ0hfRUZGRUNUIHwgRUZGRUNUX1BSRVNFUlZFRCwgZm4sIHRydWUpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWZmZWN0fSBlZmZlY3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVfZWZmZWN0X3RlYXJkb3duKGVmZmVjdCkge1xuXHR2YXIgdGVhcmRvd24gPSBlZmZlY3QudGVhcmRvd247XG5cdGlmICh0ZWFyZG93biAhPT0gbnVsbCkge1xuXHRcdGNvbnN0IHByZXZpb3VzbHlfZGVzdHJveWluZ19lZmZlY3QgPSBpc19kZXN0cm95aW5nX2VmZmVjdDtcblx0XHRjb25zdCBwcmV2aW91c19yZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0XHRzZXRfaXNfZGVzdHJveWluZ19lZmZlY3QodHJ1ZSk7XG5cdFx0c2V0X2FjdGl2ZV9yZWFjdGlvbihudWxsKTtcblx0XHR0cnkge1xuXHRcdFx0dGVhcmRvd24uY2FsbChudWxsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2V0X2lzX2Rlc3Ryb3lpbmdfZWZmZWN0KHByZXZpb3VzbHlfZGVzdHJveWluZ19lZmZlY3QpO1xuXHRcdFx0c2V0X2FjdGl2ZV9yZWFjdGlvbihwcmV2aW91c19yZWFjdGlvbik7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtFZmZlY3R9IHNpZ25hbFxuICogQHBhcmFtIHtib29sZWFufSByZW1vdmVfZG9tXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlc3Ryb3lfZWZmZWN0X2NoaWxkcmVuKHNpZ25hbCwgcmVtb3ZlX2RvbSA9IGZhbHNlKSB7XG5cdHZhciBlZmZlY3QgPSBzaWduYWwuZmlyc3Q7XG5cdHNpZ25hbC5maXJzdCA9IHNpZ25hbC5sYXN0ID0gbnVsbDtcblxuXHR3aGlsZSAoZWZmZWN0ICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVmZmVjdC5hYztcblxuXHRcdGlmIChjb250cm9sbGVyICE9PSBudWxsKSB7XG5cdFx0XHR3aXRob3V0X3JlYWN0aXZlX2NvbnRleHQoKCkgPT4ge1xuXHRcdFx0XHRjb250cm9sbGVyLmFib3J0KFNUQUxFX1JFQUNUSU9OKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHZhciBuZXh0ID0gZWZmZWN0Lm5leHQ7XG5cblx0XHRpZiAoKGVmZmVjdC5mICYgUk9PVF9FRkZFQ1QpICE9PSAwKSB7XG5cdFx0XHQvLyB0aGlzIGlzIG5vdyBhbiBpbmRlcGVuZGVudCByb290XG5cdFx0XHRlZmZlY3QucGFyZW50ID0gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVzdHJveV9lZmZlY3QoZWZmZWN0LCByZW1vdmVfZG9tKTtcblx0XHR9XG5cblx0XHRlZmZlY3QgPSBuZXh0O1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtFZmZlY3R9IHNpZ25hbFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXN0cm95X2Jsb2NrX2VmZmVjdF9jaGlsZHJlbihzaWduYWwpIHtcblx0dmFyIGVmZmVjdCA9IHNpZ25hbC5maXJzdDtcblxuXHR3aGlsZSAoZWZmZWN0ICE9PSBudWxsKSB7XG5cdFx0dmFyIG5leHQgPSBlZmZlY3QubmV4dDtcblx0XHRpZiAoKGVmZmVjdC5mICYgQlJBTkNIX0VGRkVDVCkgPT09IDApIHtcblx0XHRcdGRlc3Ryb3lfZWZmZWN0KGVmZmVjdCk7XG5cdFx0fVxuXHRcdGVmZmVjdCA9IG5leHQ7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtyZW1vdmVfZG9tXVxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXN0cm95X2VmZmVjdChlZmZlY3QsIHJlbW92ZV9kb20gPSB0cnVlKSB7XG5cdHZhciByZW1vdmVkID0gZmFsc2U7XG5cblx0aWYgKFxuXHRcdChyZW1vdmVfZG9tIHx8IChlZmZlY3QuZiAmIEhFQURfRUZGRUNUKSAhPT0gMCkgJiZcblx0XHRlZmZlY3Qubm9kZXNfc3RhcnQgIT09IG51bGwgJiZcblx0XHRlZmZlY3Qubm9kZXNfZW5kICE9PSBudWxsXG5cdCkge1xuXHRcdHJlbW92ZV9lZmZlY3RfZG9tKGVmZmVjdC5ub2Rlc19zdGFydCwgLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChlZmZlY3Qubm9kZXNfZW5kKSk7XG5cdFx0cmVtb3ZlZCA9IHRydWU7XG5cdH1cblxuXHRkZXN0cm95X2VmZmVjdF9jaGlsZHJlbihlZmZlY3QsIHJlbW92ZV9kb20gJiYgIXJlbW92ZWQpO1xuXHRyZW1vdmVfcmVhY3Rpb25zKGVmZmVjdCwgMCk7XG5cdHNldF9zaWduYWxfc3RhdHVzKGVmZmVjdCwgREVTVFJPWUVEKTtcblxuXHR2YXIgdHJhbnNpdGlvbnMgPSBlZmZlY3QudHJhbnNpdGlvbnM7XG5cblx0aWYgKHRyYW5zaXRpb25zICE9PSBudWxsKSB7XG5cdFx0Zm9yIChjb25zdCB0cmFuc2l0aW9uIG9mIHRyYW5zaXRpb25zKSB7XG5cdFx0XHR0cmFuc2l0aW9uLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHRleGVjdXRlX2VmZmVjdF90ZWFyZG93bihlZmZlY3QpO1xuXG5cdHZhciBwYXJlbnQgPSBlZmZlY3QucGFyZW50O1xuXG5cdC8vIElmIHRoZSBwYXJlbnQgZG9lc24ndCBoYXZlIGFueSBjaGlsZHJlbiwgdGhlbiBza2lwIHRoaXMgd29yayBhbHRvZ2V0aGVyXG5cdGlmIChwYXJlbnQgIT09IG51bGwgJiYgcGFyZW50LmZpcnN0ICE9PSBudWxsKSB7XG5cdFx0dW5saW5rX2VmZmVjdChlZmZlY3QpO1xuXHR9XG5cblx0aWYgKERFVikge1xuXHRcdGVmZmVjdC5jb21wb25lbnRfZnVuY3Rpb24gPSBudWxsO1xuXHR9XG5cblx0Ly8gYGZpcnN0YCBhbmQgYGNoaWxkYCBhcmUgbnVsbGVkIG91dCBpbiBkZXN0cm95X2VmZmVjdF9jaGlsZHJlblxuXHQvLyB3ZSBkb24ndCBudWxsIG91dCBgcGFyZW50YCBzbyB0aGF0IGVycm9yIHByb3BhZ2F0aW9uIGNhbiB3b3JrIGNvcnJlY3RseVxuXHRlZmZlY3QubmV4dCA9XG5cdFx0ZWZmZWN0LnByZXYgPVxuXHRcdGVmZmVjdC50ZWFyZG93biA9XG5cdFx0ZWZmZWN0LmN0eCA9XG5cdFx0ZWZmZWN0LmRlcHMgPVxuXHRcdGVmZmVjdC5mbiA9XG5cdFx0ZWZmZWN0Lm5vZGVzX3N0YXJ0ID1cblx0XHRlZmZlY3Qubm9kZXNfZW5kID1cblx0XHRlZmZlY3QuYWMgPVxuXHRcdFx0bnVsbDtcbn1cblxuLyoqXG4gKlxuICogQHBhcmFtIHtUZW1wbGF0ZU5vZGUgfCBudWxsfSBub2RlXG4gKiBAcGFyYW0ge1RlbXBsYXRlTm9kZX0gZW5kXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVfZWZmZWN0X2RvbShub2RlLCBlbmQpIHtcblx0d2hpbGUgKG5vZGUgIT09IG51bGwpIHtcblx0XHQvKiogQHR5cGUge1RlbXBsYXRlTm9kZSB8IG51bGx9ICovXG5cdFx0dmFyIG5leHQgPSBub2RlID09PSBlbmQgPyBudWxsIDogLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChnZXRfbmV4dF9zaWJsaW5nKG5vZGUpKTtcblxuXHRcdG5vZGUucmVtb3ZlKCk7XG5cdFx0bm9kZSA9IG5leHQ7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXRhY2ggYW4gZWZmZWN0IGZyb20gdGhlIGVmZmVjdCB0cmVlLCBmcmVlaW5nIHVwIG1lbW9yeSBhbmRcbiAqIHJlZHVjaW5nIHRoZSBhbW91bnQgb2Ygd29yayB0aGF0IGhhcHBlbnMgb24gc3Vic2VxdWVudCB0cmF2ZXJzYWxzXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bmxpbmtfZWZmZWN0KGVmZmVjdCkge1xuXHR2YXIgcGFyZW50ID0gZWZmZWN0LnBhcmVudDtcblx0dmFyIHByZXYgPSBlZmZlY3QucHJldjtcblx0dmFyIG5leHQgPSBlZmZlY3QubmV4dDtcblxuXHRpZiAocHJldiAhPT0gbnVsbCkgcHJldi5uZXh0ID0gbmV4dDtcblx0aWYgKG5leHQgIT09IG51bGwpIG5leHQucHJldiA9IHByZXY7XG5cblx0aWYgKHBhcmVudCAhPT0gbnVsbCkge1xuXHRcdGlmIChwYXJlbnQuZmlyc3QgPT09IGVmZmVjdCkgcGFyZW50LmZpcnN0ID0gbmV4dDtcblx0XHRpZiAocGFyZW50Lmxhc3QgPT09IGVmZmVjdCkgcGFyZW50Lmxhc3QgPSBwcmV2O1xuXHR9XG59XG5cbi8qKlxuICogV2hlbiBhIGJsb2NrIGVmZmVjdCBpcyByZW1vdmVkLCB3ZSBkb24ndCBpbW1lZGlhdGVseSBkZXN0cm95IGl0IG9yIHlhbmsgaXRcbiAqIG91dCBvZiB0aGUgRE9NLCBiZWNhdXNlIGl0IG1pZ2h0IGhhdmUgdHJhbnNpdGlvbnMuIEluc3RlYWQsIHdlICdwYXVzZScgaXQuXG4gKiBJdCBzdGF5cyBhcm91bmQgKGluIG1lbW9yeSwgYW5kIGluIHRoZSBET00pIHVudGlsIG91dHJvIHRyYW5zaXRpb25zIGhhdmVcbiAqIGNvbXBsZXRlZCwgYW5kIGlmIHRoZSBzdGF0ZSBjaGFuZ2UgaXMgcmV2ZXJzZWQgdGhlbiB3ZSBfcmVzdW1lXyBpdC5cbiAqIEEgcGF1c2VkIGVmZmVjdCBkb2VzIG5vdCB1cGRhdGUsIGFuZCB0aGUgRE9NIHN1YnRyZWUgYmVjb21lcyBpbmVydC5cbiAqIEBwYXJhbSB7RWZmZWN0fSBlZmZlY3RcbiAqIEBwYXJhbSB7KCkgPT4gdm9pZH0gW2NhbGxiYWNrXVxuICogQHBhcmFtIHtib29sZWFufSBbZGVzdHJveV1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdXNlX2VmZmVjdChlZmZlY3QsIGNhbGxiYWNrLCBkZXN0cm95ID0gdHJ1ZSkge1xuXHQvKiogQHR5cGUge1RyYW5zaXRpb25NYW5hZ2VyW119ICovXG5cdHZhciB0cmFuc2l0aW9ucyA9IFtdO1xuXG5cdHBhdXNlX2NoaWxkcmVuKGVmZmVjdCwgdHJhbnNpdGlvbnMsIHRydWUpO1xuXG5cdHJ1bl9vdXRfdHJhbnNpdGlvbnModHJhbnNpdGlvbnMsICgpID0+IHtcblx0XHRpZiAoZGVzdHJveSkgZGVzdHJveV9lZmZlY3QoZWZmZWN0KTtcblx0XHRpZiAoY2FsbGJhY2spIGNhbGxiYWNrKCk7XG5cdH0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7VHJhbnNpdGlvbk1hbmFnZXJbXX0gdHJhbnNpdGlvbnNcbiAqIEBwYXJhbSB7KCkgPT4gdm9pZH0gZm5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bl9vdXRfdHJhbnNpdGlvbnModHJhbnNpdGlvbnMsIGZuKSB7XG5cdHZhciByZW1haW5pbmcgPSB0cmFuc2l0aW9ucy5sZW5ndGg7XG5cdGlmIChyZW1haW5pbmcgPiAwKSB7XG5cdFx0dmFyIGNoZWNrID0gKCkgPT4gLS1yZW1haW5pbmcgfHwgZm4oKTtcblx0XHRmb3IgKHZhciB0cmFuc2l0aW9uIG9mIHRyYW5zaXRpb25zKSB7XG5cdFx0XHR0cmFuc2l0aW9uLm91dChjaGVjayk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGZuKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKiBAcGFyYW0ge1RyYW5zaXRpb25NYW5hZ2VyW119IHRyYW5zaXRpb25zXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGxvY2FsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXVzZV9jaGlsZHJlbihlZmZlY3QsIHRyYW5zaXRpb25zLCBsb2NhbCkge1xuXHRpZiAoKGVmZmVjdC5mICYgSU5FUlQpICE9PSAwKSByZXR1cm47XG5cdGVmZmVjdC5mIF49IElORVJUO1xuXG5cdGlmIChlZmZlY3QudHJhbnNpdGlvbnMgIT09IG51bGwpIHtcblx0XHRmb3IgKGNvbnN0IHRyYW5zaXRpb24gb2YgZWZmZWN0LnRyYW5zaXRpb25zKSB7XG5cdFx0XHRpZiAodHJhbnNpdGlvbi5pc19nbG9iYWwgfHwgbG9jYWwpIHtcblx0XHRcdFx0dHJhbnNpdGlvbnMucHVzaCh0cmFuc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YXIgY2hpbGQgPSBlZmZlY3QuZmlyc3Q7XG5cblx0d2hpbGUgKGNoaWxkICE9PSBudWxsKSB7XG5cdFx0dmFyIHNpYmxpbmcgPSBjaGlsZC5uZXh0O1xuXHRcdHZhciB0cmFuc3BhcmVudCA9XG5cdFx0XHQoY2hpbGQuZiAmIEVGRkVDVF9UUkFOU1BBUkVOVCkgIT09IDAgfHxcblx0XHRcdC8vIElmIHRoaXMgaXMgYSBicmFuY2ggZWZmZWN0IHdpdGhvdXQgYSBibG9jayBlZmZlY3QgcGFyZW50LFxuXHRcdFx0Ly8gaXQgbWVhbnMgdGhlIHBhcmVudCBibG9jayBlZmZlY3Qgd2FzIHBydW5lZC4gSW4gdGhhdCBjYXNlLFxuXHRcdFx0Ly8gdHJhbnNwYXJlbmN5IGluZm9ybWF0aW9uIHdhcyB0cmFuc2ZlcnJlZCB0byB0aGUgYnJhbmNoIGVmZmVjdC5cblx0XHRcdCgoY2hpbGQuZiAmIEJSQU5DSF9FRkZFQ1QpICE9PSAwICYmIChlZmZlY3QuZiAmIEJMT0NLX0VGRkVDVCkgIT09IDApO1xuXHRcdC8vIFRPRE8gd2UgZG9uJ3QgbmVlZCB0byBjYWxsIHBhdXNlX2NoaWxkcmVuIHJlY3Vyc2l2ZWx5IHdpdGggYSBsaW5rZWQgbGlzdCBpbiBwbGFjZVxuXHRcdC8vIGl0J3Mgc2xpZ2h0bHkgbW9yZSBpbnZvbHZlZCB0aG91Z2ggYXMgd2UgaGF2ZSB0byBhY2NvdW50IGZvciBgdHJhbnNwYXJlbnRgIGNoYW5naW5nXG5cdFx0Ly8gdGhyb3VnaCB0aGUgdHJlZS5cblx0XHRwYXVzZV9jaGlsZHJlbihjaGlsZCwgdHJhbnNpdGlvbnMsIHRyYW5zcGFyZW50ID8gbG9jYWwgOiBmYWxzZSk7XG5cdFx0Y2hpbGQgPSBzaWJsaW5nO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIG9wcG9zaXRlIG9mIGBwYXVzZV9lZmZlY3RgLiBXZSBjYWxsIHRoaXMgaWYgKGZvciBleGFtcGxlKVxuICogYHhgIGJlY29tZXMgZmFsc3kgdGhlbiB0cnV0aHk6IGB7I2lmIHh9Li4uey9pZn1gXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN1bWVfZWZmZWN0KGVmZmVjdCkge1xuXHRyZXN1bWVfY2hpbGRyZW4oZWZmZWN0LCB0cnVlKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VmZmVjdH0gZWZmZWN0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IGxvY2FsXG4gKi9cbmZ1bmN0aW9uIHJlc3VtZV9jaGlsZHJlbihlZmZlY3QsIGxvY2FsKSB7XG5cdGlmICgoZWZmZWN0LmYgJiBJTkVSVCkgPT09IDApIHJldHVybjtcblx0ZWZmZWN0LmYgXj0gSU5FUlQ7XG5cblx0Ly8gSWYgYSBkZXBlbmRlbmN5IG9mIHRoaXMgZWZmZWN0IGNoYW5nZWQgd2hpbGUgaXQgd2FzIHBhdXNlZCxcblx0Ly8gc2NoZWR1bGUgdGhlIGVmZmVjdCB0byB1cGRhdGUuIHdlIGRvbid0IHVzZSBgaXNfZGlydHlgXG5cdC8vIGhlcmUgYmVjYXVzZSB3ZSBkb24ndCB3YW50IHRvIGVhZ2VybHkgcmVjb21wdXRlIGEgZGVyaXZlZCBsaWtlXG5cdC8vIGB7I2lmIGZvb317Zm9vLmJhcigpfXsvaWZ9YCBpZiBgZm9vYCBpcyBub3cgYHVuZGVmaW5lZFxuXHRpZiAoKGVmZmVjdC5mICYgQ0xFQU4pID09PSAwKSB7XG5cdFx0c2V0X3NpZ25hbF9zdGF0dXMoZWZmZWN0LCBESVJUWSk7XG5cdFx0c2NoZWR1bGVfZWZmZWN0KGVmZmVjdCk7XG5cdH1cblxuXHR2YXIgY2hpbGQgPSBlZmZlY3QuZmlyc3Q7XG5cblx0d2hpbGUgKGNoaWxkICE9PSBudWxsKSB7XG5cdFx0dmFyIHNpYmxpbmcgPSBjaGlsZC5uZXh0O1xuXHRcdHZhciB0cmFuc3BhcmVudCA9IChjaGlsZC5mICYgRUZGRUNUX1RSQU5TUEFSRU5UKSAhPT0gMCB8fCAoY2hpbGQuZiAmIEJSQU5DSF9FRkZFQ1QpICE9PSAwO1xuXHRcdC8vIFRPRE8gd2UgZG9uJ3QgbmVlZCB0byBjYWxsIHJlc3VtZV9jaGlsZHJlbiByZWN1cnNpdmVseSB3aXRoIGEgbGlua2VkIGxpc3QgaW4gcGxhY2Vcblx0XHQvLyBpdCdzIHNsaWdodGx5IG1vcmUgaW52b2x2ZWQgdGhvdWdoIGFzIHdlIGhhdmUgdG8gYWNjb3VudCBmb3IgYHRyYW5zcGFyZW50YCBjaGFuZ2luZ1xuXHRcdC8vIHRocm91Z2ggdGhlIHRyZWUuXG5cdFx0cmVzdW1lX2NoaWxkcmVuKGNoaWxkLCB0cmFuc3BhcmVudCA/IGxvY2FsIDogZmFsc2UpO1xuXHRcdGNoaWxkID0gc2libGluZztcblx0fVxuXG5cdGlmIChlZmZlY3QudHJhbnNpdGlvbnMgIT09IG51bGwpIHtcblx0XHRmb3IgKGNvbnN0IHRyYW5zaXRpb24gb2YgZWZmZWN0LnRyYW5zaXRpb25zKSB7XG5cdFx0XHRpZiAodHJhbnNpdGlvbi5pc19nbG9iYWwgfHwgbG9jYWwpIHtcblx0XHRcdFx0dHJhbnNpdGlvbi5pbigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYWJvcnRlZChlZmZlY3QgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpKSB7XG5cdHJldHVybiAoZWZmZWN0LmYgJiBERVNUUk9ZRUQpICE9PSAwO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWZmZWN0fSBlZmZlY3RcbiAqIEBwYXJhbSB7RG9jdW1lbnRGcmFnbWVudH0gZnJhZ21lbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1vdmVfZWZmZWN0KGVmZmVjdCwgZnJhZ21lbnQpIHtcblx0dmFyIG5vZGUgPSBlZmZlY3Qubm9kZXNfc3RhcnQ7XG5cdHZhciBlbmQgPSBlZmZlY3Qubm9kZXNfZW5kO1xuXG5cdHdoaWxlIChub2RlICE9PSBudWxsKSB7XG5cdFx0LyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGUgfCBudWxsfSAqL1xuXHRcdHZhciBuZXh0ID0gbm9kZSA9PT0gZW5kID8gbnVsbCA6IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoZ2V0X25leHRfc2libGluZyhub2RlKSk7XG5cblx0XHRmcmFnbWVudC5hcHBlbmQobm9kZSk7XG5cdFx0bm9kZSA9IG5leHQ7XG5cdH1cbn1cbiIsIi8qKiBAaW1wb3J0IHsgRGVyaXZlZCwgRWZmZWN0LCBSZWFjdGlvbiwgU2lnbmFsLCBTb3VyY2UsIFZhbHVlIH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0IHsgZ2V0X2Rlc2NyaXB0b3JzLCBnZXRfcHJvdG90eXBlX29mLCBpbmRleF9vZiB9IGZyb20gJy4uL3NoYXJlZC91dGlscy5qcyc7XG5pbXBvcnQge1xuXHRkZXN0cm95X2Jsb2NrX2VmZmVjdF9jaGlsZHJlbixcblx0ZGVzdHJveV9lZmZlY3RfY2hpbGRyZW4sXG5cdGVmZmVjdF90cmFja2luZyxcblx0ZXhlY3V0ZV9lZmZlY3RfdGVhcmRvd25cbn0gZnJvbSAnLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHtcblx0RElSVFksXG5cdE1BWUJFX0RJUlRZLFxuXHRDTEVBTixcblx0REVSSVZFRCxcblx0REVTVFJPWUVELFxuXHRCUkFOQ0hfRUZGRUNULFxuXHRTVEFURV9TWU1CT0wsXG5cdEJMT0NLX0VGRkVDVCxcblx0Uk9PVF9FRkZFQ1QsXG5cdENPTk5FQ1RFRCxcblx0UkVBQ1RJT05fSVNfVVBEQVRJTkcsXG5cdFNUQUxFX1JFQUNUSU9OLFxuXHRFUlJPUl9WQUxVRSxcblx0V0FTX01BUktFRCxcblx0TUFOQUdFRF9FRkZFQ1Rcbn0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgb2xkX3ZhbHVlcyB9IGZyb20gJy4vcmVhY3Rpdml0eS9zb3VyY2VzLmpzJztcbmltcG9ydCB7XG5cdGRlc3Ryb3lfZGVyaXZlZF9lZmZlY3RzLFxuXHRleGVjdXRlX2Rlcml2ZWQsXG5cdGN1cnJlbnRfYXN5bmNfZWZmZWN0LFxuXHRyZWNlbnRfYXN5bmNfZGVyaXZlZHMsXG5cdHVwZGF0ZV9kZXJpdmVkXG59IGZyb20gJy4vcmVhY3Rpdml0eS9kZXJpdmVkcy5qcyc7XG5pbXBvcnQgeyBhc3luY19tb2RlX2ZsYWcsIHRyYWNpbmdfbW9kZV9mbGFnIH0gZnJvbSAnLi4vZmxhZ3MvaW5kZXguanMnO1xuaW1wb3J0IHsgdHJhY2luZ19leHByZXNzaW9ucyB9IGZyb20gJy4vZGV2L3RyYWNpbmcuanMnO1xuaW1wb3J0IHsgZ2V0X2Vycm9yIH0gZnJvbSAnLi4vc2hhcmVkL2Rldi5qcyc7XG5pbXBvcnQge1xuXHRjb21wb25lbnRfY29udGV4dCxcblx0ZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uLFxuXHRkZXZfc3RhY2ssXG5cdGlzX3J1bmVzLFxuXHRzZXRfY29tcG9uZW50X2NvbnRleHQsXG5cdHNldF9kZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb24sXG5cdHNldF9kZXZfc3RhY2tcbn0gZnJvbSAnLi9jb250ZXh0LmpzJztcbmltcG9ydCAqIGFzIHcgZnJvbSAnLi93YXJuaW5ncy5qcyc7XG5pbXBvcnQge1xuXHRCYXRjaCxcblx0YmF0Y2hfdmFsdWVzLFxuXHRjdXJyZW50X2JhdGNoLFxuXHRmbHVzaFN5bmMsXG5cdHNjaGVkdWxlX2VmZmVjdFxufSBmcm9tICcuL3JlYWN0aXZpdHkvYmF0Y2guanMnO1xuaW1wb3J0IHsgaGFuZGxlX2Vycm9yIH0gZnJvbSAnLi9lcnJvci1oYW5kbGluZy5qcyc7XG5pbXBvcnQgeyBVTklOSVRJQUxJWkVEIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGNhcHR1cmVkX3NpZ25hbHMgfSBmcm9tICcuL2xlZ2FjeS5qcyc7XG5pbXBvcnQgeyB3aXRob3V0X3JlYWN0aXZlX2NvbnRleHQgfSBmcm9tICcuL2RvbS9lbGVtZW50cy9iaW5kaW5ncy9zaGFyZWQuanMnO1xuXG5leHBvcnQgbGV0IGlzX3VwZGF0aW5nX2VmZmVjdCA9IGZhbHNlO1xuXG4vKiogQHBhcmFtIHtib29sZWFufSB2YWx1ZSAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9pc191cGRhdGluZ19lZmZlY3QodmFsdWUpIHtcblx0aXNfdXBkYXRpbmdfZWZmZWN0ID0gdmFsdWU7XG59XG5cbmV4cG9ydCBsZXQgaXNfZGVzdHJveWluZ19lZmZlY3QgPSBmYWxzZTtcblxuLyoqIEBwYXJhbSB7Ym9vbGVhbn0gdmFsdWUgKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfaXNfZGVzdHJveWluZ19lZmZlY3QodmFsdWUpIHtcblx0aXNfZGVzdHJveWluZ19lZmZlY3QgPSB2YWx1ZTtcbn1cblxuLyoqIEB0eXBlIHtudWxsIHwgUmVhY3Rpb259ICovXG5leHBvcnQgbGV0IGFjdGl2ZV9yZWFjdGlvbiA9IG51bGw7XG5cbmV4cG9ydCBsZXQgdW50cmFja2luZyA9IGZhbHNlO1xuXG4vKiogQHBhcmFtIHtudWxsIHwgUmVhY3Rpb259IHJlYWN0aW9uICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2FjdGl2ZV9yZWFjdGlvbihyZWFjdGlvbikge1xuXHRhY3RpdmVfcmVhY3Rpb24gPSByZWFjdGlvbjtcbn1cblxuLyoqIEB0eXBlIHtudWxsIHwgRWZmZWN0fSAqL1xuZXhwb3J0IGxldCBhY3RpdmVfZWZmZWN0ID0gbnVsbDtcblxuLyoqIEBwYXJhbSB7bnVsbCB8IEVmZmVjdH0gZWZmZWN0ICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2FjdGl2ZV9lZmZlY3QoZWZmZWN0KSB7XG5cdGFjdGl2ZV9lZmZlY3QgPSBlZmZlY3Q7XG59XG5cbi8qKlxuICogV2hlbiBzb3VyY2VzIGFyZSBjcmVhdGVkIHdpdGhpbiBhIHJlYWN0aW9uLCByZWFkaW5nIGFuZCB3cml0aW5nXG4gKiB0aGVtIHdpdGhpbiB0aGF0IHJlYWN0aW9uIHNob3VsZCBub3QgY2F1c2UgYSByZS1ydW5cbiAqIEB0eXBlIHtudWxsIHwgU291cmNlW119XG4gKi9cbmV4cG9ydCBsZXQgY3VycmVudF9zb3VyY2VzID0gbnVsbDtcblxuLyoqIEBwYXJhbSB7VmFsdWV9IHZhbHVlICovXG5leHBvcnQgZnVuY3Rpb24gcHVzaF9yZWFjdGlvbl92YWx1ZSh2YWx1ZSkge1xuXHRpZiAoYWN0aXZlX3JlYWN0aW9uICE9PSBudWxsICYmICghYXN5bmNfbW9kZV9mbGFnIHx8IChhY3RpdmVfcmVhY3Rpb24uZiAmIERFUklWRUQpICE9PSAwKSkge1xuXHRcdGlmIChjdXJyZW50X3NvdXJjZXMgPT09IG51bGwpIHtcblx0XHRcdGN1cnJlbnRfc291cmNlcyA9IFt2YWx1ZV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnJlbnRfc291cmNlcy5wdXNoKHZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgZGVwZW5kZW5jaWVzIG9mIHRoZSByZWFjdGlvbiB0aGF0IGlzIGN1cnJlbnRseSBiZWluZyBleGVjdXRlZC4gSW4gbWFueSBjYXNlcyxcbiAqIHRoZSBkZXBlbmRlbmNpZXMgYXJlIHVuY2hhbmdlZCBiZXR3ZWVuIHJ1bnMsIGFuZCBzbyB0aGlzIHdpbGwgYmUgYG51bGxgIHVubGVzc1xuICogYW5kIHVudGlsIGEgbmV3IGRlcGVuZGVuY3kgaXMgYWNjZXNzZWQg4oCUIHdlIHRyYWNrIHRoaXMgdmlhIGBza2lwcGVkX2RlcHNgXG4gKiBAdHlwZSB7bnVsbCB8IFZhbHVlW119XG4gKi9cbmxldCBuZXdfZGVwcyA9IG51bGw7XG5cbmxldCBza2lwcGVkX2RlcHMgPSAwO1xuXG4vKipcbiAqIFRyYWNrcyB3cml0ZXMgdGhhdCB0aGUgZWZmZWN0IGl0J3MgZXhlY3V0ZWQgaW4gZG9lc24ndCBsaXN0ZW4gdG8geWV0LFxuICogc28gdGhhdCB0aGUgZGVwZW5kZW5jeSBjYW4gYmUgYWRkZWQgdG8gdGhlIGVmZmVjdCBsYXRlciBvbiBpZiBpdCB0aGVuIHJlYWRzIGl0XG4gKiBAdHlwZSB7bnVsbCB8IFNvdXJjZVtdfVxuICovXG5leHBvcnQgbGV0IHVudHJhY2tlZF93cml0ZXMgPSBudWxsO1xuXG4vKiogQHBhcmFtIHtudWxsIHwgU291cmNlW119IHZhbHVlICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X3VudHJhY2tlZF93cml0ZXModmFsdWUpIHtcblx0dW50cmFja2VkX3dyaXRlcyA9IHZhbHVlO1xufVxuXG4vKipcbiAqIEB0eXBlIHtudW1iZXJ9IFVzZWQgYnkgc291cmNlcyBhbmQgZGVyaXZlZHMgZm9yIGhhbmRsaW5nIHVwZGF0ZXMuXG4gKiBWZXJzaW9uIHN0YXJ0cyBmcm9tIDEgc28gdGhhdCB1bm93bmVkIGRlcml2ZWRzIGRpZmZlcmVudGlhdGUgYmV0d2VlbiBhIGNyZWF0ZWQgZWZmZWN0IGFuZCBhIHJ1biBvbmUgZm9yIHRyYWNpbmdcbiAqKi9cbmV4cG9ydCBsZXQgd3JpdGVfdmVyc2lvbiA9IDE7XG5cbi8qKiBAdHlwZSB7bnVtYmVyfSBVc2VkIHRvIHZlcnNpb24gZWFjaCByZWFkIG9mIGEgc291cmNlIG9mIGRlcml2ZWQgdG8gYXZvaWQgZHVwbGljYXRpbmcgZGVwZWRlbmNpZXMgaW5zaWRlIGEgcmVhY3Rpb24gKi9cbmxldCByZWFkX3ZlcnNpb24gPSAwO1xuXG5leHBvcnQgbGV0IHVwZGF0ZV92ZXJzaW9uID0gcmVhZF92ZXJzaW9uO1xuXG4vKiogQHBhcmFtIHtudW1iZXJ9IHZhbHVlICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X3VwZGF0ZV92ZXJzaW9uKHZhbHVlKSB7XG5cdHVwZGF0ZV92ZXJzaW9uID0gdmFsdWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbmNyZW1lbnRfd3JpdGVfdmVyc2lvbigpIHtcblx0cmV0dXJuICsrd3JpdGVfdmVyc2lvbjtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgYSBkZXJpdmVkIG9yIGVmZmVjdCBpcyBkaXJ0eS5cbiAqIElmIGl0IGlzIE1BWUJFX0RJUlRZLCB3aWxsIHNldCB0aGUgc3RhdHVzIHRvIENMRUFOXG4gKiBAcGFyYW0ge1JlYWN0aW9ufSByZWFjdGlvblxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19kaXJ0eShyZWFjdGlvbikge1xuXHR2YXIgZmxhZ3MgPSByZWFjdGlvbi5mO1xuXG5cdGlmICgoZmxhZ3MgJiBESVJUWSkgIT09IDApIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChmbGFncyAmIERFUklWRUQpIHtcblx0XHRyZWFjdGlvbi5mICY9IH5XQVNfTUFSS0VEO1xuXHR9XG5cblx0aWYgKChmbGFncyAmIE1BWUJFX0RJUlRZKSAhPT0gMCkge1xuXHRcdHZhciBkZXBlbmRlbmNpZXMgPSByZWFjdGlvbi5kZXBzO1xuXG5cdFx0aWYgKGRlcGVuZGVuY2llcyAhPT0gbnVsbCkge1xuXHRcdFx0dmFyIGxlbmd0aCA9IGRlcGVuZGVuY2llcy5sZW5ndGg7XG5cblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dmFyIGRlcGVuZGVuY3kgPSBkZXBlbmRlbmNpZXNbaV07XG5cblx0XHRcdFx0aWYgKGlzX2RpcnR5KC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGRlcGVuZGVuY3kpKSkge1xuXHRcdFx0XHRcdHVwZGF0ZV9kZXJpdmVkKC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGRlcGVuZGVuY3kpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkZXBlbmRlbmN5Lnd2ID4gcmVhY3Rpb24ud3YpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdChmbGFncyAmIENPTk5FQ1RFRCkgIT09IDAgJiZcblx0XHRcdC8vIER1cmluZyB0aW1lIHRyYXZlbGluZyB3ZSBkb24ndCB3YW50IHRvIHJlc2V0IHRoZSBzdGF0dXMgc28gdGhhdFxuXHRcdFx0Ly8gdHJhdmVyc2FsIG9mIHRoZSBncmFwaCBpbiB0aGUgb3RoZXIgYmF0Y2hlcyBzdGlsbCBoYXBwZW5zXG5cdFx0XHRiYXRjaF92YWx1ZXMgPT09IG51bGxcblx0XHQpIHtcblx0XHRcdHNldF9zaWduYWxfc3RhdHVzKHJlYWN0aW9uLCBDTEVBTik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7VmFsdWV9IHNpZ25hbFxuICogQHBhcmFtIHtFZmZlY3R9IGVmZmVjdFxuICogQHBhcmFtIHtib29sZWFufSBbcm9vdF1cbiAqL1xuZnVuY3Rpb24gc2NoZWR1bGVfcG9zc2libGVfZWZmZWN0X3NlbGZfaW52YWxpZGF0aW9uKHNpZ25hbCwgZWZmZWN0LCByb290ID0gdHJ1ZSkge1xuXHR2YXIgcmVhY3Rpb25zID0gc2lnbmFsLnJlYWN0aW9ucztcblx0aWYgKHJlYWN0aW9ucyA9PT0gbnVsbCkgcmV0dXJuO1xuXG5cdGlmICghYXN5bmNfbW9kZV9mbGFnICYmIGN1cnJlbnRfc291cmNlcz8uaW5jbHVkZXMoc2lnbmFsKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgcmVhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0dmFyIHJlYWN0aW9uID0gcmVhY3Rpb25zW2ldO1xuXG5cdFx0aWYgKChyZWFjdGlvbi5mICYgREVSSVZFRCkgIT09IDApIHtcblx0XHRcdHNjaGVkdWxlX3Bvc3NpYmxlX2VmZmVjdF9zZWxmX2ludmFsaWRhdGlvbigvKiogQHR5cGUge0Rlcml2ZWR9ICovIChyZWFjdGlvbiksIGVmZmVjdCwgZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoZWZmZWN0ID09PSByZWFjdGlvbikge1xuXHRcdFx0aWYgKHJvb3QpIHtcblx0XHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMocmVhY3Rpb24sIERJUlRZKTtcblx0XHRcdH0gZWxzZSBpZiAoKHJlYWN0aW9uLmYgJiBDTEVBTikgIT09IDApIHtcblx0XHRcdFx0c2V0X3NpZ25hbF9zdGF0dXMocmVhY3Rpb24sIE1BWUJFX0RJUlRZKTtcblx0XHRcdH1cblx0XHRcdHNjaGVkdWxlX2VmZmVjdCgvKiogQHR5cGUge0VmZmVjdH0gKi8gKHJlYWN0aW9uKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBAcGFyYW0ge1JlYWN0aW9ufSByZWFjdGlvbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZV9yZWFjdGlvbihyZWFjdGlvbikge1xuXHR2YXIgcHJldmlvdXNfZGVwcyA9IG5ld19kZXBzO1xuXHR2YXIgcHJldmlvdXNfc2tpcHBlZF9kZXBzID0gc2tpcHBlZF9kZXBzO1xuXHR2YXIgcHJldmlvdXNfdW50cmFja2VkX3dyaXRlcyA9IHVudHJhY2tlZF93cml0ZXM7XG5cdHZhciBwcmV2aW91c19yZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0dmFyIHByZXZpb3VzX3NvdXJjZXMgPSBjdXJyZW50X3NvdXJjZXM7XG5cdHZhciBwcmV2aW91c19jb21wb25lbnRfY29udGV4dCA9IGNvbXBvbmVudF9jb250ZXh0O1xuXHR2YXIgcHJldmlvdXNfdW50cmFja2luZyA9IHVudHJhY2tpbmc7XG5cdHZhciBwcmV2aW91c191cGRhdGVfdmVyc2lvbiA9IHVwZGF0ZV92ZXJzaW9uO1xuXG5cdHZhciBmbGFncyA9IHJlYWN0aW9uLmY7XG5cblx0bmV3X2RlcHMgPSAvKiogQHR5cGUge251bGwgfCBWYWx1ZVtdfSAqLyAobnVsbCk7XG5cdHNraXBwZWRfZGVwcyA9IDA7XG5cdHVudHJhY2tlZF93cml0ZXMgPSBudWxsO1xuXHRhY3RpdmVfcmVhY3Rpb24gPSAoZmxhZ3MgJiAoQlJBTkNIX0VGRkVDVCB8IFJPT1RfRUZGRUNUKSkgPT09IDAgPyByZWFjdGlvbiA6IG51bGw7XG5cblx0Y3VycmVudF9zb3VyY2VzID0gbnVsbDtcblx0c2V0X2NvbXBvbmVudF9jb250ZXh0KHJlYWN0aW9uLmN0eCk7XG5cdHVudHJhY2tpbmcgPSBmYWxzZTtcblx0dXBkYXRlX3ZlcnNpb24gPSArK3JlYWRfdmVyc2lvbjtcblxuXHRpZiAocmVhY3Rpb24uYWMgIT09IG51bGwpIHtcblx0XHR3aXRob3V0X3JlYWN0aXZlX2NvbnRleHQoKCkgPT4ge1xuXHRcdFx0LyoqIEB0eXBlIHtBYm9ydENvbnRyb2xsZXJ9ICovIChyZWFjdGlvbi5hYykuYWJvcnQoU1RBTEVfUkVBQ1RJT04pO1xuXHRcdH0pO1xuXG5cdFx0cmVhY3Rpb24uYWMgPSBudWxsO1xuXHR9XG5cblx0dHJ5IHtcblx0XHRyZWFjdGlvbi5mIHw9IFJFQUNUSU9OX0lTX1VQREFUSU5HO1xuXHRcdHZhciBmbiA9IC8qKiBAdHlwZSB7RnVuY3Rpb259ICovIChyZWFjdGlvbi5mbik7XG5cdFx0dmFyIHJlc3VsdCA9IGZuKCk7XG5cdFx0dmFyIGRlcHMgPSByZWFjdGlvbi5kZXBzO1xuXG5cdFx0aWYgKG5ld19kZXBzICE9PSBudWxsKSB7XG5cdFx0XHR2YXIgaTtcblxuXHRcdFx0cmVtb3ZlX3JlYWN0aW9ucyhyZWFjdGlvbiwgc2tpcHBlZF9kZXBzKTtcblxuXHRcdFx0aWYgKGRlcHMgIT09IG51bGwgJiYgc2tpcHBlZF9kZXBzID4gMCkge1xuXHRcdFx0XHRkZXBzLmxlbmd0aCA9IHNraXBwZWRfZGVwcyArIG5ld19kZXBzLmxlbmd0aDtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IG5ld19kZXBzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0ZGVwc1tza2lwcGVkX2RlcHMgKyBpXSA9IG5ld19kZXBzW2ldO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWFjdGlvbi5kZXBzID0gZGVwcyA9IG5ld19kZXBzO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNfdXBkYXRpbmdfZWZmZWN0ICYmIGVmZmVjdF90cmFja2luZygpICYmIChyZWFjdGlvbi5mICYgQ09OTkVDVEVEKSAhPT0gMCkge1xuXHRcdFx0XHRmb3IgKGkgPSBza2lwcGVkX2RlcHM7IGkgPCBkZXBzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0KGRlcHNbaV0ucmVhY3Rpb25zID8/PSBbXSkucHVzaChyZWFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGRlcHMgIT09IG51bGwgJiYgc2tpcHBlZF9kZXBzIDwgZGVwcy5sZW5ndGgpIHtcblx0XHRcdHJlbW92ZV9yZWFjdGlvbnMocmVhY3Rpb24sIHNraXBwZWRfZGVwcyk7XG5cdFx0XHRkZXBzLmxlbmd0aCA9IHNraXBwZWRfZGVwcztcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSdyZSBpbnNpZGUgYW4gZWZmZWN0IGFuZCB3ZSBoYXZlIHVudHJhY2tlZCB3cml0ZXMsIHRoZW4gd2UgbmVlZCB0b1xuXHRcdC8vIGVuc3VyZSB0aGF0IGlmIGFueSBvZiB0aG9zZSB1bnRyYWNrZWQgd3JpdGVzIHJlc3VsdCBpbiByZS1pbnZhbGlkYXRpb25cblx0XHQvLyBvZiB0aGUgY3VycmVudCBlZmZlY3QsIHRoZW4gdGhhdCBoYXBwZW5zIGFjY29yZGluZ2x5XG5cdFx0aWYgKFxuXHRcdFx0aXNfcnVuZXMoKSAmJlxuXHRcdFx0dW50cmFja2VkX3dyaXRlcyAhPT0gbnVsbCAmJlxuXHRcdFx0IXVudHJhY2tpbmcgJiZcblx0XHRcdGRlcHMgIT09IG51bGwgJiZcblx0XHRcdChyZWFjdGlvbi5mICYgKERFUklWRUQgfCBNQVlCRV9ESVJUWSB8IERJUlRZKSkgPT09IDBcblx0XHQpIHtcblx0XHRcdGZvciAoaSA9IDA7IGkgPCAvKiogQHR5cGUge1NvdXJjZVtdfSAqLyAodW50cmFja2VkX3dyaXRlcykubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0c2NoZWR1bGVfcG9zc2libGVfZWZmZWN0X3NlbGZfaW52YWxpZGF0aW9uKFxuXHRcdFx0XHRcdHVudHJhY2tlZF93cml0ZXNbaV0sXG5cdFx0XHRcdFx0LyoqIEB0eXBlIHtFZmZlY3R9ICovIChyZWFjdGlvbilcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhcmUgcmV0dXJuaW5nIHRvIGFuIHByZXZpb3VzIHJlYWN0aW9uIHRoZW5cblx0XHQvLyB3ZSBuZWVkIHRvIGluY3JlbWVudCB0aGUgcmVhZCB2ZXJzaW9uIHRvIGVuc3VyZSB0aGF0XG5cdFx0Ly8gYW55IGRlcGVuZGVuY2llcyBpbiB0aGlzIHJlYWN0aW9uIGFyZW4ndCBtYXJrZWQgd2l0aFxuXHRcdC8vIHRoZSBzYW1lIHZlcnNpb25cblx0XHRpZiAocHJldmlvdXNfcmVhY3Rpb24gIT09IG51bGwgJiYgcHJldmlvdXNfcmVhY3Rpb24gIT09IHJlYWN0aW9uKSB7XG5cdFx0XHRyZWFkX3ZlcnNpb24rKztcblxuXHRcdFx0aWYgKHVudHJhY2tlZF93cml0ZXMgIT09IG51bGwpIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzX3VudHJhY2tlZF93cml0ZXMgPT09IG51bGwpIHtcblx0XHRcdFx0XHRwcmV2aW91c191bnRyYWNrZWRfd3JpdGVzID0gdW50cmFja2VkX3dyaXRlcztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcmV2aW91c191bnRyYWNrZWRfd3JpdGVzLnB1c2goLi4uLyoqIEB0eXBlIHtTb3VyY2VbXX0gKi8gKHVudHJhY2tlZF93cml0ZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICgocmVhY3Rpb24uZiAmIEVSUk9SX1ZBTFVFKSAhPT0gMCkge1xuXHRcdFx0cmVhY3Rpb24uZiBePSBFUlJPUl9WQUxVRTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHJldHVybiBoYW5kbGVfZXJyb3IoZXJyb3IpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHJlYWN0aW9uLmYgXj0gUkVBQ1RJT05fSVNfVVBEQVRJTkc7XG5cdFx0bmV3X2RlcHMgPSBwcmV2aW91c19kZXBzO1xuXHRcdHNraXBwZWRfZGVwcyA9IHByZXZpb3VzX3NraXBwZWRfZGVwcztcblx0XHR1bnRyYWNrZWRfd3JpdGVzID0gcHJldmlvdXNfdW50cmFja2VkX3dyaXRlcztcblx0XHRhY3RpdmVfcmVhY3Rpb24gPSBwcmV2aW91c19yZWFjdGlvbjtcblx0XHRjdXJyZW50X3NvdXJjZXMgPSBwcmV2aW91c19zb3VyY2VzO1xuXHRcdHNldF9jb21wb25lbnRfY29udGV4dChwcmV2aW91c19jb21wb25lbnRfY29udGV4dCk7XG5cdFx0dW50cmFja2luZyA9IHByZXZpb3VzX3VudHJhY2tpbmc7XG5cdFx0dXBkYXRlX3ZlcnNpb24gPSBwcmV2aW91c191cGRhdGVfdmVyc2lvbjtcblx0fVxufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge1JlYWN0aW9ufSBzaWduYWxcbiAqIEBwYXJhbSB7VmFsdWU8Vj59IGRlcGVuZGVuY3lcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5mdW5jdGlvbiByZW1vdmVfcmVhY3Rpb24oc2lnbmFsLCBkZXBlbmRlbmN5KSB7XG5cdGxldCByZWFjdGlvbnMgPSBkZXBlbmRlbmN5LnJlYWN0aW9ucztcblx0aWYgKHJlYWN0aW9ucyAhPT0gbnVsbCkge1xuXHRcdHZhciBpbmRleCA9IGluZGV4X29mLmNhbGwocmVhY3Rpb25zLCBzaWduYWwpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHZhciBuZXdfbGVuZ3RoID0gcmVhY3Rpb25zLmxlbmd0aCAtIDE7XG5cdFx0XHRpZiAobmV3X2xlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZWFjdGlvbnMgPSBkZXBlbmRlbmN5LnJlYWN0aW9ucyA9IG51bGw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTd2FwIHdpdGggbGFzdCBlbGVtZW50IGFuZCB0aGVuIHJlbW92ZS5cblx0XHRcdFx0cmVhY3Rpb25zW2luZGV4XSA9IHJlYWN0aW9uc1tuZXdfbGVuZ3RoXTtcblx0XHRcdFx0cmVhY3Rpb25zLnBvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIElmIHRoZSBkZXJpdmVkIGhhcyBubyByZWFjdGlvbnMsIHRoZW4gd2UgY2FuIGRpc2Nvbm5lY3QgaXQgZnJvbSB0aGUgZ3JhcGgsXG5cdC8vIGFsbG93aW5nIGl0IHRvIGVpdGhlciByZWNvbm5lY3QgaW4gdGhlIGZ1dHVyZSwgb3IgYmUgR0MnZCBieSB0aGUgVk0uXG5cdGlmIChcblx0XHRyZWFjdGlvbnMgPT09IG51bGwgJiZcblx0XHQoZGVwZW5kZW5jeS5mICYgREVSSVZFRCkgIT09IDAgJiZcblx0XHQvLyBEZXN0cm95aW5nIGEgY2hpbGQgZWZmZWN0IHdoaWxlIHVwZGF0aW5nIGEgcGFyZW50IGVmZmVjdCBjYW4gY2F1c2UgYSBkZXBlbmRlbmN5IHRvIGFwcGVhclxuXHRcdC8vIHRvIGJlIHVudXNlZCwgd2hlbiBpbiBmYWN0IGl0IGlzIHVzZWQgYnkgdGhlIGN1cnJlbnRseS11cGRhdGluZyBwYXJlbnQuIENoZWNraW5nIGBuZXdfZGVwc2Bcblx0XHQvLyBhbGxvd3MgdXMgdG8gc2tpcCB0aGUgZXhwZW5zaXZlIHdvcmsgb2YgZGlzY29ubmVjdGluZyBhbmQgaW1tZWRpYXRlbHkgcmVjb25uZWN0aW5nIGl0XG5cdFx0KG5ld19kZXBzID09PSBudWxsIHx8ICFuZXdfZGVwcy5pbmNsdWRlcyhkZXBlbmRlbmN5KSlcblx0KSB7XG5cdFx0c2V0X3NpZ25hbF9zdGF0dXMoZGVwZW5kZW5jeSwgTUFZQkVfRElSVFkpO1xuXHRcdC8vIElmIHdlIGFyZSB3b3JraW5nIHdpdGggYSBkZXJpdmVkIHRoYXQgaXMgb3duZWQgYnkgYW4gZWZmZWN0LCB0aGVuIG1hcmsgaXQgYXMgYmVpbmdcblx0XHQvLyBkaXNjb25uZWN0ZWQgYW5kIHJlbW92ZSB0aGUgbWFyayBmbGFnLCBhcyBpdCBjYW5ub3QgYmUgcmVsaWFibHkgcmVtb3ZlZCBvdGhlcndpc2Vcblx0XHRpZiAoKGRlcGVuZGVuY3kuZiAmIENPTk5FQ1RFRCkgIT09IDApIHtcblx0XHRcdGRlcGVuZGVuY3kuZiBePSBDT05ORUNURUQ7XG5cdFx0XHRkZXBlbmRlbmN5LmYgJj0gfldBU19NQVJLRUQ7XG5cdFx0fVxuXHRcdC8vIERpc2Nvbm5lY3QgYW55IHJlYWN0aW9ucyBvd25lZCBieSB0aGlzIHJlYWN0aW9uXG5cdFx0ZGVzdHJveV9kZXJpdmVkX2VmZmVjdHMoLyoqIEB0eXBlIHtEZXJpdmVkfSAqKi8gKGRlcGVuZGVuY3kpKTtcblx0XHRyZW1vdmVfcmVhY3Rpb25zKC8qKiBAdHlwZSB7RGVyaXZlZH0gKiovIChkZXBlbmRlbmN5KSwgMCk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge1JlYWN0aW9ufSBzaWduYWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydF9pbmRleFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVfcmVhY3Rpb25zKHNpZ25hbCwgc3RhcnRfaW5kZXgpIHtcblx0dmFyIGRlcGVuZGVuY2llcyA9IHNpZ25hbC5kZXBzO1xuXHRpZiAoZGVwZW5kZW5jaWVzID09PSBudWxsKSByZXR1cm47XG5cblx0Zm9yICh2YXIgaSA9IHN0YXJ0X2luZGV4OyBpIDwgZGVwZW5kZW5jaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0cmVtb3ZlX3JlYWN0aW9uKHNpZ25hbCwgZGVwZW5kZW5jaWVzW2ldKTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7RWZmZWN0fSBlZmZlY3RcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlX2VmZmVjdChlZmZlY3QpIHtcblx0dmFyIGZsYWdzID0gZWZmZWN0LmY7XG5cblx0aWYgKChmbGFncyAmIERFU1RST1lFRCkgIT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzZXRfc2lnbmFsX3N0YXR1cyhlZmZlY3QsIENMRUFOKTtcblxuXHR2YXIgcHJldmlvdXNfZWZmZWN0ID0gYWN0aXZlX2VmZmVjdDtcblx0dmFyIHdhc191cGRhdGluZ19lZmZlY3QgPSBpc191cGRhdGluZ19lZmZlY3Q7XG5cblx0YWN0aXZlX2VmZmVjdCA9IGVmZmVjdDtcblx0aXNfdXBkYXRpbmdfZWZmZWN0ID0gdHJ1ZTtcblxuXHRpZiAoREVWKSB7XG5cdFx0dmFyIHByZXZpb3VzX2NvbXBvbmVudF9mbiA9IGRldl9jdXJyZW50X2NvbXBvbmVudF9mdW5jdGlvbjtcblx0XHRzZXRfZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uKGVmZmVjdC5jb21wb25lbnRfZnVuY3Rpb24pO1xuXHRcdHZhciBwcmV2aW91c19zdGFjayA9IC8qKiBAdHlwZSB7YW55fSAqLyAoZGV2X3N0YWNrKTtcblx0XHQvLyBvbmx5IGJsb2NrIGVmZmVjdHMgaGF2ZSBhIGRldiBzdGFjaywga2VlcCB0aGUgY3VycmVudCBvbmUgb3RoZXJ3aXNlXG5cdFx0c2V0X2Rldl9zdGFjayhlZmZlY3QuZGV2X3N0YWNrID8/IGRldl9zdGFjayk7XG5cdH1cblxuXHR0cnkge1xuXHRcdGlmICgoZmxhZ3MgJiAoQkxPQ0tfRUZGRUNUIHwgTUFOQUdFRF9FRkZFQ1QpKSAhPT0gMCkge1xuXHRcdFx0ZGVzdHJveV9ibG9ja19lZmZlY3RfY2hpbGRyZW4oZWZmZWN0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVzdHJveV9lZmZlY3RfY2hpbGRyZW4oZWZmZWN0KTtcblx0XHR9XG5cblx0XHRleGVjdXRlX2VmZmVjdF90ZWFyZG93bihlZmZlY3QpO1xuXHRcdHZhciB0ZWFyZG93biA9IHVwZGF0ZV9yZWFjdGlvbihlZmZlY3QpO1xuXHRcdGVmZmVjdC50ZWFyZG93biA9IHR5cGVvZiB0ZWFyZG93biA9PT0gJ2Z1bmN0aW9uJyA/IHRlYXJkb3duIDogbnVsbDtcblx0XHRlZmZlY3Qud3YgPSB3cml0ZV92ZXJzaW9uO1xuXG5cdFx0Ly8gSW4gREVWLCBpbmNyZW1lbnQgdmVyc2lvbnMgb2YgYW55IHNvdXJjZXMgdGhhdCB3ZXJlIHdyaXR0ZW4gdG8gZHVyaW5nIHRoZSBlZmZlY3QsXG5cdFx0Ly8gc28gdGhhdCB0aGV5IGFyZSBjb3JyZWN0bHkgbWFya2VkIGFzIGRpcnR5IHdoZW4gdGhlIGVmZmVjdCByZS1ydW5zXG5cdFx0aWYgKERFViAmJiB0cmFjaW5nX21vZGVfZmxhZyAmJiAoZWZmZWN0LmYgJiBESVJUWSkgIT09IDAgJiYgZWZmZWN0LmRlcHMgIT09IG51bGwpIHtcblx0XHRcdGZvciAodmFyIGRlcCBvZiBlZmZlY3QuZGVwcykge1xuXHRcdFx0XHRpZiAoZGVwLnNldF9kdXJpbmdfZWZmZWN0KSB7XG5cdFx0XHRcdFx0ZGVwLnd2ID0gaW5jcmVtZW50X3dyaXRlX3ZlcnNpb24oKTtcblx0XHRcdFx0XHRkZXAuc2V0X2R1cmluZ19lZmZlY3QgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRpc191cGRhdGluZ19lZmZlY3QgPSB3YXNfdXBkYXRpbmdfZWZmZWN0O1xuXHRcdGFjdGl2ZV9lZmZlY3QgPSBwcmV2aW91c19lZmZlY3Q7XG5cblx0XHRpZiAoREVWKSB7XG5cdFx0XHRzZXRfZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uKHByZXZpb3VzX2NvbXBvbmVudF9mbik7XG5cdFx0XHRzZXRfZGV2X3N0YWNrKHByZXZpb3VzX3N0YWNrKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgYW55IHBlbmRpbmcgc3RhdGUgY2hhbmdlcyBoYXZlIGJlZW4gYXBwbGllZC5cbiAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdGljaygpIHtcblx0aWYgKGFzeW5jX21vZGVfZmxhZykge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoZikgPT4ge1xuXHRcdFx0Ly8gUmFjZSB0aGVtIGFnYWluc3QgZWFjaCBvdGhlciAtIGluIGFsbW9zdCBhbGwgY2FzZXMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHdpbGwgZmlyZSBmaXJzdCxcblx0XHRcdC8vIGJ1dCBlLmcuIGluIGNhc2UgdGhlIHdpbmRvdyBpcyBub3QgZm9jdXNlZCBvciBhIHZpZXcgdHJhbnNpdGlvbiBoYXBwZW5zLCByZXF1ZXN0QW5pbWF0aW9uRnJhbWVcblx0XHRcdC8vIHdpbGwgYmUgZGVsYXllZCBhbmQgc2V0VGltZW91dCBoZWxwcyB1cyByZXNvbHZlIGZhc3QgZW5vdWdoIGluIHRoYXQgY2FzZVxuXHRcdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IGYoKSk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IGYoKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHQvLyBCeSBjYWxsaW5nIGZsdXNoU3luYyB3ZSBndWFyYW50ZWUgdGhhdCBhbnkgcGVuZGluZyBzdGF0ZSBjaGFuZ2VzIGFyZSBhcHBsaWVkIGFmdGVyIG9uZSB0aWNrLlxuXHQvLyBUT0RPIGxvb2sgaW50byB3aGV0aGVyIHdlIGNhbiBtYWtlIGZsdXNoaW5nIHN1YnNlcXVlbnQgdXBkYXRlcyBzeW5jaHJvbm91c2x5IGluIHRoZSBmdXR1cmUuXG5cdGZsdXNoU3luYygpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgb25jZSBhbnkgc3RhdGUgY2hhbmdlcywgYW5kIGFzeW5jaHJvbm91cyB3b3JrIHJlc3VsdGluZyBmcm9tIHRoZW0sXG4gKiBoYXZlIHJlc29sdmVkIGFuZCB0aGUgRE9NIGhhcyBiZWVuIHVwZGF0ZWRcbiAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICogQHNpbmNlIDUuMzZcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldHRsZWQoKSB7XG5cdHJldHVybiBCYXRjaC5lbnN1cmUoKS5zZXR0bGVkKCk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7VmFsdWU8Vj59IHNpZ25hbFxuICogQHJldHVybnMge1Z9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXQoc2lnbmFsKSB7XG5cdHZhciBmbGFncyA9IHNpZ25hbC5mO1xuXHR2YXIgaXNfZGVyaXZlZCA9IChmbGFncyAmIERFUklWRUQpICE9PSAwO1xuXG5cdGNhcHR1cmVkX3NpZ25hbHM/LmFkZChzaWduYWwpO1xuXG5cdC8vIFJlZ2lzdGVyIHRoZSBkZXBlbmRlbmN5IG9uIHRoZSBjdXJyZW50IHJlYWN0aW9uIHNpZ25hbC5cblx0aWYgKGFjdGl2ZV9yZWFjdGlvbiAhPT0gbnVsbCAmJiAhdW50cmFja2luZykge1xuXHRcdC8vIGlmIHdlJ3JlIGluIGEgZGVyaXZlZCB0aGF0IGlzIGJlaW5nIHJlYWQgaW5zaWRlIGFuIF9hc3luY18gZGVyaXZlZCxcblx0XHQvLyBpdCdzIHBvc3NpYmxlIHRoYXQgdGhlIGVmZmVjdCB3YXMgYWxyZWFkeSBkZXN0cm95ZWQuIEluIHRoaXMgY2FzZSxcblx0XHQvLyB3ZSBkb24ndCBhZGQgdGhlIGRlcGVuZGVuY3ksIGJlY2F1c2UgdGhhdCB3b3VsZCBjcmVhdGUgYSBtZW1vcnkgbGVha1xuXHRcdHZhciBkZXN0cm95ZWQgPSBhY3RpdmVfZWZmZWN0ICE9PSBudWxsICYmIChhY3RpdmVfZWZmZWN0LmYgJiBERVNUUk9ZRUQpICE9PSAwO1xuXG5cdFx0aWYgKCFkZXN0cm95ZWQgJiYgIWN1cnJlbnRfc291cmNlcz8uaW5jbHVkZXMoc2lnbmFsKSkge1xuXHRcdFx0dmFyIGRlcHMgPSBhY3RpdmVfcmVhY3Rpb24uZGVwcztcblxuXHRcdFx0aWYgKChhY3RpdmVfcmVhY3Rpb24uZiAmIFJFQUNUSU9OX0lTX1VQREFUSU5HKSAhPT0gMCkge1xuXHRcdFx0XHQvLyB3ZSdyZSBpbiB0aGUgZWZmZWN0IGluaXQvdXBkYXRlIGN5Y2xlXG5cdFx0XHRcdGlmIChzaWduYWwucnYgPCByZWFkX3ZlcnNpb24pIHtcblx0XHRcdFx0XHRzaWduYWwucnYgPSByZWFkX3ZlcnNpb247XG5cblx0XHRcdFx0XHQvLyBJZiB0aGUgc2lnbmFsIGlzIGFjY2Vzc2luZyB0aGUgc2FtZSBkZXBlbmRlbmNpZXMgaW4gdGhlIHNhbWVcblx0XHRcdFx0XHQvLyBvcmRlciBhcyBpdCBkaWQgbGFzdCB0aW1lLCBpbmNyZW1lbnQgYHNraXBwZWRfZGVwc2Bcblx0XHRcdFx0XHQvLyByYXRoZXIgdGhhbiB1cGRhdGluZyBgbmV3X2RlcHNgLCB3aGljaCBjcmVhdGVzIEdDIGNvc3Rcblx0XHRcdFx0XHRpZiAobmV3X2RlcHMgPT09IG51bGwgJiYgZGVwcyAhPT0gbnVsbCAmJiBkZXBzW3NraXBwZWRfZGVwc10gPT09IHNpZ25hbCkge1xuXHRcdFx0XHRcdFx0c2tpcHBlZF9kZXBzKys7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChuZXdfZGVwcyA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0bmV3X2RlcHMgPSBbc2lnbmFsXTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFuZXdfZGVwcy5pbmNsdWRlcyhzaWduYWwpKSB7XG5cdFx0XHRcdFx0XHRuZXdfZGVwcy5wdXNoKHNpZ25hbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3ZSdyZSBhZGRpbmcgYSBkZXBlbmRlbmN5IG91dHNpZGUgdGhlIGluaXQvdXBkYXRlIGN5Y2xlXG5cdFx0XHRcdC8vIChpLmUuIGFmdGVyIGFuIGBhd2FpdGApXG5cdFx0XHRcdChhY3RpdmVfcmVhY3Rpb24uZGVwcyA/Pz0gW10pLnB1c2goc2lnbmFsKTtcblxuXHRcdFx0XHR2YXIgcmVhY3Rpb25zID0gc2lnbmFsLnJlYWN0aW9ucztcblxuXHRcdFx0XHRpZiAocmVhY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRcdFx0c2lnbmFsLnJlYWN0aW9ucyA9IFthY3RpdmVfcmVhY3Rpb25dO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFyZWFjdGlvbnMuaW5jbHVkZXMoYWN0aXZlX3JlYWN0aW9uKSkge1xuXHRcdFx0XHRcdHJlYWN0aW9ucy5wdXNoKGFjdGl2ZV9yZWFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoREVWKSB7XG5cdFx0Ly8gVE9ETyByZWluc3RhdGUgdGhpcywgYnV0IG1ha2UgaXQgYWN0dWFsbHkgd29ya1xuXHRcdC8vIGlmIChjdXJyZW50X2FzeW5jX2VmZmVjdCkge1xuXHRcdC8vIFx0dmFyIHRyYWNraW5nID0gKGN1cnJlbnRfYXN5bmNfZWZmZWN0LmYgJiBSRUFDVElPTl9JU19VUERBVElORykgIT09IDA7XG5cdFx0Ly8gXHR2YXIgd2FzX3JlYWQgPSBjdXJyZW50X2FzeW5jX2VmZmVjdC5kZXBzPy5pbmNsdWRlcyhzaWduYWwpO1xuXG5cdFx0Ly8gXHRpZiAoIXRyYWNraW5nICYmICF1bnRyYWNraW5nICYmICF3YXNfcmVhZCkge1xuXHRcdC8vIFx0XHR3LmF3YWl0X3JlYWN0aXZpdHlfbG9zcygvKiogQHR5cGUge3N0cmluZ30gKi8gKHNpZ25hbC5sYWJlbCkpO1xuXG5cdFx0Ly8gXHRcdHZhciB0cmFjZSA9IGdldF9lcnJvcigndHJhY2VkIGF0Jyk7XG5cdFx0Ly8gXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG5cdFx0Ly8gXHRcdGlmICh0cmFjZSkgY29uc29sZS53YXJuKHRyYWNlKTtcblx0XHQvLyBcdH1cblx0XHQvLyB9XG5cblx0XHRyZWNlbnRfYXN5bmNfZGVyaXZlZHMuZGVsZXRlKHNpZ25hbCk7XG5cblx0XHRpZiAoXG5cdFx0XHR0cmFjaW5nX21vZGVfZmxhZyAmJlxuXHRcdFx0IXVudHJhY2tpbmcgJiZcblx0XHRcdHRyYWNpbmdfZXhwcmVzc2lvbnMgIT09IG51bGwgJiZcblx0XHRcdGFjdGl2ZV9yZWFjdGlvbiAhPT0gbnVsbCAmJlxuXHRcdFx0dHJhY2luZ19leHByZXNzaW9ucy5yZWFjdGlvbiA9PT0gYWN0aXZlX3JlYWN0aW9uXG5cdFx0KSB7XG5cdFx0XHQvLyBVc2VkIHdoZW4gbWFwcGluZyBzdGF0ZSBiZXR3ZWVuIHNwZWNpYWwgYmxvY2tzIGxpa2UgYGVhY2hgXG5cdFx0XHRpZiAoc2lnbmFsLnRyYWNlKSB7XG5cdFx0XHRcdHNpZ25hbC50cmFjZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHRyYWNlID0gZ2V0X2Vycm9yKCd0cmFjZWQgYXQnKTtcblxuXHRcdFx0XHRpZiAodHJhY2UpIHtcblx0XHRcdFx0XHR2YXIgZW50cnkgPSB0cmFjaW5nX2V4cHJlc3Npb25zLmVudHJpZXMuZ2V0KHNpZ25hbCk7XG5cblx0XHRcdFx0XHRpZiAoZW50cnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZW50cnkgPSB7IHRyYWNlczogW10gfTtcblx0XHRcdFx0XHRcdHRyYWNpbmdfZXhwcmVzc2lvbnMuZW50cmllcy5zZXQoc2lnbmFsLCBlbnRyeSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dmFyIGxhc3QgPSBlbnRyeS50cmFjZXNbZW50cnkudHJhY2VzLmxlbmd0aCAtIDFdO1xuXG5cdFx0XHRcdFx0Ly8gdHJhY2VzIGNhbiBiZSBkdXBsaWNhdGVkLCBlLmcuIGJ5IGBzbmFwc2hvdGAgaW52b2tpbmcgYm90aFxuXHRcdFx0XHRcdC8vIGJvdGggYGdldE93blByb3BlcnR5RGVzY3JpcHRvcmAgYW5kIGBnZXRgIHRyYXBzIGF0IG9uY2Vcblx0XHRcdFx0XHRpZiAodHJhY2Uuc3RhY2sgIT09IGxhc3Q/LnN0YWNrKSB7XG5cdFx0XHRcdFx0XHRlbnRyeS50cmFjZXMucHVzaCh0cmFjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGlzX2Rlc3Ryb3lpbmdfZWZmZWN0KSB7XG5cdFx0aWYgKG9sZF92YWx1ZXMuaGFzKHNpZ25hbCkpIHtcblx0XHRcdHJldHVybiBvbGRfdmFsdWVzLmdldChzaWduYWwpO1xuXHRcdH1cblxuXHRcdGlmIChpc19kZXJpdmVkKSB7XG5cdFx0XHR2YXIgZGVyaXZlZCA9IC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKHNpZ25hbCk7XG5cblx0XHRcdHZhciB2YWx1ZSA9IGRlcml2ZWQudjtcblxuXHRcdFx0Ly8gaWYgdGhlIGRlcml2ZWQgaXMgZGlydHkgYW5kIGhhcyByZWFjdGlvbnMsIG9yIGRlcGVuZHMgb24gdGhlIHZhbHVlcyB0aGF0IGp1c3QgY2hhbmdlZCwgcmUtZXhlY3V0ZVxuXHRcdFx0Ly8gKGEgZGVyaXZlZCBjYW4gYmUgbWF5YmVfZGlydHkgZHVlIHRvIHRoZSBlZmZlY3QgZGVzdHJveSByZW1vdmluZyBpdHMgbGFzdCByZWFjdGlvbilcblx0XHRcdGlmIChcblx0XHRcdFx0KChkZXJpdmVkLmYgJiBDTEVBTikgPT09IDAgJiYgZGVyaXZlZC5yZWFjdGlvbnMgIT09IG51bGwpIHx8XG5cdFx0XHRcdGRlcGVuZHNfb25fb2xkX3ZhbHVlcyhkZXJpdmVkKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHZhbHVlID0gZXhlY3V0ZV9kZXJpdmVkKGRlcml2ZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRvbGRfdmFsdWVzLnNldChkZXJpdmVkLCB2YWx1ZSk7XG5cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH0gZWxzZSBpZiAoXG5cdFx0aXNfZGVyaXZlZCAmJlxuXHRcdCghYmF0Y2hfdmFsdWVzPy5oYXMoc2lnbmFsKSB8fCAoY3VycmVudF9iYXRjaD8uaXNfZm9yayAmJiAhZWZmZWN0X3RyYWNraW5nKCkpKVxuXHQpIHtcblx0XHRkZXJpdmVkID0gLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAoc2lnbmFsKTtcblxuXHRcdGlmIChpc19kaXJ0eShkZXJpdmVkKSkge1xuXHRcdFx0dXBkYXRlX2Rlcml2ZWQoZGVyaXZlZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzX3VwZGF0aW5nX2VmZmVjdCAmJiBlZmZlY3RfdHJhY2tpbmcoKSAmJiAoZGVyaXZlZC5mICYgQ09OTkVDVEVEKSA9PT0gMCkge1xuXHRcdFx0cmVjb25uZWN0KGRlcml2ZWQpO1xuXHRcdH1cblx0fVxuXG5cdGlmIChiYXRjaF92YWx1ZXM/LmhhcyhzaWduYWwpKSB7XG5cdFx0cmV0dXJuIGJhdGNoX3ZhbHVlcy5nZXQoc2lnbmFsKTtcblx0fVxuXG5cdGlmICgoc2lnbmFsLmYgJiBFUlJPUl9WQUxVRSkgIT09IDApIHtcblx0XHR0aHJvdyBzaWduYWwudjtcblx0fVxuXG5cdHJldHVybiBzaWduYWwudjtcbn1cblxuLyoqXG4gKiAoUmUpY29ubmVjdCBhIGRpc2Nvbm5lY3RlZCBkZXJpdmVkLCBzbyB0aGF0IGl0IGlzIG5vdGlmaWVkXG4gKiBvZiBjaGFuZ2VzIGluIGBtYXJrX3JlYWN0aW9uc2BcbiAqIEBwYXJhbSB7RGVyaXZlZH0gZGVyaXZlZFxuICovXG5mdW5jdGlvbiByZWNvbm5lY3QoZGVyaXZlZCkge1xuXHRpZiAoZGVyaXZlZC5kZXBzID09PSBudWxsKSByZXR1cm47XG5cblx0ZGVyaXZlZC5mIF49IENPTk5FQ1RFRDtcblxuXHRmb3IgKGNvbnN0IGRlcCBvZiBkZXJpdmVkLmRlcHMpIHtcblx0XHQoZGVwLnJlYWN0aW9ucyA/Pz0gW10pLnB1c2goZGVyaXZlZCk7XG5cblx0XHRpZiAoKGRlcC5mICYgREVSSVZFRCkgIT09IDAgJiYgKGRlcC5mICYgQ09OTkVDVEVEKSA9PT0gMCkge1xuXHRcdFx0cmVjb25uZWN0KC8qKiBAdHlwZSB7RGVyaXZlZH0gKi8gKGRlcCkpO1xuXHRcdH1cblx0fVxufVxuXG4vKiogQHBhcmFtIHtEZXJpdmVkfSBkZXJpdmVkICovXG5mdW5jdGlvbiBkZXBlbmRzX29uX29sZF92YWx1ZXMoZGVyaXZlZCkge1xuXHRpZiAoZGVyaXZlZC52ID09PSBVTklOSVRJQUxJWkVEKSByZXR1cm4gdHJ1ZTsgLy8gd2UgZG9uJ3Qga25vdywgc28gYXNzdW1lIHRoZSB3b3JzdFxuXHRpZiAoZGVyaXZlZC5kZXBzID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cblx0Zm9yIChjb25zdCBkZXAgb2YgZGVyaXZlZC5kZXBzKSB7XG5cdFx0aWYgKG9sZF92YWx1ZXMuaGFzKGRlcCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICgoZGVwLmYgJiBERVJJVkVEKSAhPT0gMCAmJiBkZXBlbmRzX29uX29sZF92YWx1ZXMoLyoqIEB0eXBlIHtEZXJpdmVkfSAqLyAoZGVwKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBMaWtlIGBnZXRgLCBidXQgY2hlY2tzIGZvciBgdW5kZWZpbmVkYC4gVXNlZCBmb3IgYHZhcmAgZGVjbGFyYXRpb25zIGJlY2F1c2UgdGhleSBjYW4gYmUgYWNjZXNzZWQgYmVmb3JlIGJlaW5nIGRlY2xhcmVkXG4gKiBAdGVtcGxhdGUgVlxuICogQHBhcmFtIHtWYWx1ZTxWPiB8IHVuZGVmaW5lZH0gc2lnbmFsXG4gKiBAcmV0dXJucyB7ViB8IHVuZGVmaW5lZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhZmVfZ2V0KHNpZ25hbCkge1xuXHRyZXR1cm4gc2lnbmFsICYmIGdldChzaWduYWwpO1xufVxuXG4vKipcbiAqIFdoZW4gdXNlZCBpbnNpZGUgYSBbYCRkZXJpdmVkYF0oaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLyRkZXJpdmVkKSBvciBbYCRlZmZlY3RgXShodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUvJGVmZmVjdCksXG4gKiBhbnkgc3RhdGUgcmVhZCBpbnNpZGUgYGZuYCB3aWxsIG5vdCBiZSB0cmVhdGVkIGFzIGEgZGVwZW5kZW5jeS5cbiAqXG4gKiBgYGB0c1xuICogJGVmZmVjdCgoKSA9PiB7XG4gKiAgIC8vIHRoaXMgd2lsbCBydW4gd2hlbiBgZGF0YWAgY2hhbmdlcywgYnV0IG5vdCB3aGVuIGB0aW1lYCBjaGFuZ2VzXG4gKiAgIHNhdmUoZGF0YSwge1xuICogICAgIHRpbWVzdGFtcDogdW50cmFjaygoKSA9PiB0aW1lKVxuICogICB9KTtcbiAqIH0pO1xuICogYGBgXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHsoKSA9PiBUfSBmblxuICogQHJldHVybnMge1R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnRyYWNrKGZuKSB7XG5cdHZhciBwcmV2aW91c191bnRyYWNraW5nID0gdW50cmFja2luZztcblx0dHJ5IHtcblx0XHR1bnRyYWNraW5nID0gdHJ1ZTtcblx0XHRyZXR1cm4gZm4oKTtcblx0fSBmaW5hbGx5IHtcblx0XHR1bnRyYWNraW5nID0gcHJldmlvdXNfdW50cmFja2luZztcblx0fVxufVxuXG5jb25zdCBTVEFUVVNfTUFTSyA9IH4oRElSVFkgfCBNQVlCRV9ESVJUWSB8IENMRUFOKTtcblxuLyoqXG4gKiBAcGFyYW0ge1NpZ25hbH0gc2lnbmFsXG4gKiBAcGFyYW0ge251bWJlcn0gc3RhdHVzXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9zaWduYWxfc3RhdHVzKHNpZ25hbCwgc3RhdHVzKSB7XG5cdHNpZ25hbC5mID0gKHNpZ25hbC5mICYgU1RBVFVTX01BU0spIHwgc3RhdHVzO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7UmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgdW5rbm93bj59IG9ialxuICogQHBhcmFtIHtBcnJheTxzdHJpbmcgfCBzeW1ib2w+fSBrZXlzXG4gKiBAcmV0dXJucyB7UmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgdW5rbm93bj59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGNsdWRlX2Zyb21fb2JqZWN0KG9iaiwga2V5cykge1xuXHQvKiogQHR5cGUge1JlY29yZDxzdHJpbmcgfCBzeW1ib2wsIHVua25vd24+fSAqL1xuXHR2YXIgcmVzdWx0ID0ge307XG5cblx0Zm9yICh2YXIga2V5IGluIG9iaikge1xuXHRcdGlmICgha2V5cy5pbmNsdWRlcyhrZXkpKSB7XG5cdFx0XHRyZXN1bHRba2V5XSA9IG9ialtrZXldO1xuXHRcdH1cblx0fVxuXG5cdGZvciAodmFyIHN5bWJvbCBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKG9iaikpIHtcblx0XHRpZiAoT2JqZWN0LnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqLCBzeW1ib2wpICYmICFrZXlzLmluY2x1ZGVzKHN5bWJvbCkpIHtcblx0XHRcdHJlc3VsdFtzeW1ib2xdID0gb2JqW3N5bWJvbF07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBQb3NzaWJseSB0cmF2ZXJzZSBhbiBvYmplY3QgYW5kIHJlYWQgYWxsIGl0cyBwcm9wZXJ0aWVzIHNvIHRoYXQgdGhleSdyZSBhbGwgcmVhY3RpdmUgaW4gY2FzZSB0aGlzIGlzIGAkc3RhdGVgLlxuICogRG9lcyBvbmx5IGNoZWNrIGZpcnN0IGxldmVsIG9mIGFuIG9iamVjdCBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucyAoaGV1cmlzdGljIHNob3VsZCBiZSBnb29kIGZvciA5OSUgb2YgYWxsIGNhc2VzKS5cbiAqIEBwYXJhbSB7YW55fSB2YWx1ZVxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWVwX3JlYWRfc3RhdGUodmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgIXZhbHVlIHx8IHZhbHVlIGluc3RhbmNlb2YgRXZlbnRUYXJnZXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoU1RBVEVfU1lNQk9MIGluIHZhbHVlKSB7XG5cdFx0ZGVlcF9yZWFkKHZhbHVlKTtcblx0fSBlbHNlIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRmb3IgKGxldCBrZXkgaW4gdmFsdWUpIHtcblx0XHRcdGNvbnN0IHByb3AgPSB2YWx1ZVtrZXldO1xuXHRcdFx0aWYgKHR5cGVvZiBwcm9wID09PSAnb2JqZWN0JyAmJiBwcm9wICYmIFNUQVRFX1NZTUJPTCBpbiBwcm9wKSB7XG5cdFx0XHRcdGRlZXBfcmVhZChwcm9wKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBEZWVwbHkgdHJhdmVyc2UgYW4gb2JqZWN0IGFuZCByZWFkIGFsbCBpdHMgcHJvcGVydGllc1xuICogc28gdGhhdCB0aGV5J3JlIGFsbCByZWFjdGl2ZSBpbiBjYXNlIHRoaXMgaXMgYCRzdGF0ZWBcbiAqIEBwYXJhbSB7YW55fSB2YWx1ZVxuICogQHBhcmFtIHtTZXQ8YW55Pn0gdmlzaXRlZFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWVwX3JlYWQodmFsdWUsIHZpc2l0ZWQgPSBuZXcgU2V0KCkpIHtcblx0aWYgKFxuXHRcdHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcblx0XHR2YWx1ZSAhPT0gbnVsbCAmJlxuXHRcdC8vIFdlIGRvbid0IHdhbnQgdG8gdHJhdmVyc2UgRE9NIGVsZW1lbnRzXG5cdFx0ISh2YWx1ZSBpbnN0YW5jZW9mIEV2ZW50VGFyZ2V0KSAmJlxuXHRcdCF2aXNpdGVkLmhhcyh2YWx1ZSlcblx0KSB7XG5cdFx0dmlzaXRlZC5hZGQodmFsdWUpO1xuXHRcdC8vIFdoZW4gd29ya2luZyB3aXRoIGEgcG9zc2libGUgU3ZlbHRlRGF0ZSwgdGhpc1xuXHRcdC8vIHdpbGwgZW5zdXJlIHdlIGNhcHR1cmUgY2hhbmdlcyB0byBpdC5cblx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG5cdFx0XHR2YWx1ZS5nZXRUaW1lKCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGtleSBpbiB2YWx1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZGVlcF9yZWFkKHZhbHVlW2tleV0sIHZpc2l0ZWQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBjb250aW51ZVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBwcm90byA9IGdldF9wcm90b3R5cGVfb2YodmFsdWUpO1xuXHRcdGlmIChcblx0XHRcdHByb3RvICE9PSBPYmplY3QucHJvdG90eXBlICYmXG5cdFx0XHRwcm90byAhPT0gQXJyYXkucHJvdG90eXBlICYmXG5cdFx0XHRwcm90byAhPT0gTWFwLnByb3RvdHlwZSAmJlxuXHRcdFx0cHJvdG8gIT09IFNldC5wcm90b3R5cGUgJiZcblx0XHRcdHByb3RvICE9PSBEYXRlLnByb3RvdHlwZVxuXHRcdCkge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvcnMgPSBnZXRfZGVzY3JpcHRvcnMocHJvdG8pO1xuXHRcdFx0Zm9yIChsZXQga2V5IGluIGRlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGdldCA9IGRlc2NyaXB0b3JzW2tleV0uZ2V0O1xuXHRcdFx0XHRpZiAoZ2V0KSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGdldC5jYWxsKHZhbHVlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHQvLyBjb250aW51ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIiwiaW1wb3J0IHsgdGVhcmRvd24gfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHsgZGVmaW5lX3Byb3BlcnR5IH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7IGh5ZHJhdGluZyB9IGZyb20gJy4uL2h5ZHJhdGlvbi5qcyc7XG5pbXBvcnQgeyBxdWV1ZV9taWNyb190YXNrIH0gZnJvbSAnLi4vdGFzay5qcyc7XG5pbXBvcnQgeyBGSUxFTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgKiBhcyB3IGZyb20gJy4uLy4uL3dhcm5pbmdzLmpzJztcbmltcG9ydCB7XG5cdGFjdGl2ZV9lZmZlY3QsXG5cdGFjdGl2ZV9yZWFjdGlvbixcblx0c2V0X2FjdGl2ZV9lZmZlY3QsXG5cdHNldF9hY3RpdmVfcmVhY3Rpb25cbn0gZnJvbSAnLi4vLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgeyB3aXRob3V0X3JlYWN0aXZlX2NvbnRleHQgfSBmcm9tICcuL2JpbmRpbmdzL3NoYXJlZC5qcyc7XG5cbi8qKiBAdHlwZSB7U2V0PHN0cmluZz59ICovXG5leHBvcnQgY29uc3QgYWxsX3JlZ2lzdGVyZWRfZXZlbnRzID0gbmV3IFNldCgpO1xuXG4vKiogQHR5cGUge1NldDwoZXZlbnRzOiBBcnJheTxzdHJpbmc+KSA9PiB2b2lkPn0gKi9cbmV4cG9ydCBjb25zdCByb290X2V2ZW50X2hhbmRsZXMgPSBuZXcgU2V0KCk7XG5cbi8qKlxuICogU1NSIGFkZHMgb25sb2FkIGFuZCBvbmVycm9yIGF0dHJpYnV0ZXMgdG8gY2F0Y2ggdGhvc2UgZXZlbnRzIGJlZm9yZSB0aGUgaHlkcmF0aW9uLlxuICogVGhpcyBmdW5jdGlvbiBkZXRlY3RzIHRob3NlIGNhc2VzLCByZW1vdmVzIHRoZSBhdHRyaWJ1dGVzIGFuZCByZXBsYXlzIHRoZSBldmVudHMuXG4gKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBkb21cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheV9ldmVudHMoZG9tKSB7XG5cdGlmICghaHlkcmF0aW5nKSByZXR1cm47XG5cblx0ZG9tLnJlbW92ZUF0dHJpYnV0ZSgnb25sb2FkJyk7XG5cdGRvbS5yZW1vdmVBdHRyaWJ1dGUoJ29uZXJyb3InKTtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRjb25zdCBldmVudCA9IGRvbS5fX2U7XG5cdGlmIChldmVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGRvbS5fX2UgPSB1bmRlZmluZWQ7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKGRvbS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRkb20uZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnRfbmFtZVxuICogQHBhcmFtIHtFdmVudFRhcmdldH0gZG9tXG4gKiBAcGFyYW0ge0V2ZW50TGlzdGVuZXJ9IFtoYW5kbGVyXVxuICogQHBhcmFtIHtBZGRFdmVudExpc3RlbmVyT3B0aW9uc30gW29wdGlvbnNdXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVfZXZlbnQoZXZlbnRfbmFtZSwgZG9tLCBoYW5kbGVyLCBvcHRpb25zID0ge30pIHtcblx0LyoqXG5cdCAqIEB0aGlzIHtFdmVudFRhcmdldH1cblx0ICovXG5cdGZ1bmN0aW9uIHRhcmdldF9oYW5kbGVyKC8qKiBAdHlwZSB7RXZlbnR9ICovIGV2ZW50KSB7XG5cdFx0aWYgKCFvcHRpb25zLmNhcHR1cmUpIHtcblx0XHRcdC8vIE9ubHkgY2FsbCBpbiB0aGUgYnViYmxlIHBoYXNlLCBlbHNlIGRlbGVnYXRlZCBldmVudHMgd291bGQgYmUgY2FsbGVkIGJlZm9yZSB0aGUgY2FwdHVyaW5nIGV2ZW50c1xuXHRcdFx0aGFuZGxlX2V2ZW50X3Byb3BhZ2F0aW9uLmNhbGwoZG9tLCBldmVudCk7XG5cdFx0fVxuXHRcdGlmICghZXZlbnQuY2FuY2VsQnViYmxlKSB7XG5cdFx0XHRyZXR1cm4gd2l0aG91dF9yZWFjdGl2ZV9jb250ZXh0KCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIGhhbmRsZXI/LmNhbGwodGhpcywgZXZlbnQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQ2hyb21lIGhhcyBhIGJ1ZyB3aGVyZSBwb2ludGVyIGV2ZW50cyBkb24ndCB3b3JrIHdoZW4gYXR0YWNoZWQgdG8gYSBET00gZWxlbWVudCB0aGF0IGhhcyBiZWVuIGNsb25lZFxuXHQvLyB3aXRoIGNsb25lTm9kZSgpIGFuZCB0aGUgRE9NIGVsZW1lbnQgaXMgZGlzY29ubmVjdGVkIGZyb20gdGhlIGRvY3VtZW50LiBUbyBlbnN1cmUgdGhlIGV2ZW50IHdvcmtzLCB3ZVxuXHQvLyBkZWZlciB0aGUgYXR0YWNobWVudCB0aWxsIGFmdGVyIGl0J3MgYmVlbiBhcHBlbmRlZCB0byB0aGUgZG9jdW1lbnQuIFRPRE86IHJlbW92ZSB0aGlzIG9uY2UgQ2hyb21lIGZpeGVzXG5cdC8vIHRoaXMgYnVnLiBUaGUgc2FtZSBhcHBsaWVzIHRvIHdoZWVsIGV2ZW50cyBhbmQgdG91Y2ggZXZlbnRzLlxuXHRpZiAoXG5cdFx0ZXZlbnRfbmFtZS5zdGFydHNXaXRoKCdwb2ludGVyJykgfHxcblx0XHRldmVudF9uYW1lLnN0YXJ0c1dpdGgoJ3RvdWNoJykgfHxcblx0XHRldmVudF9uYW1lID09PSAnd2hlZWwnXG5cdCkge1xuXHRcdHF1ZXVlX21pY3JvX3Rhc2soKCkgPT4ge1xuXHRcdFx0ZG9tLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgdGFyZ2V0X2hhbmRsZXIsIG9wdGlvbnMpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdGRvbS5hZGRFdmVudExpc3RlbmVyKGV2ZW50X25hbWUsIHRhcmdldF9oYW5kbGVyLCBvcHRpb25zKTtcblx0fVxuXG5cdHJldHVybiB0YXJnZXRfaGFuZGxlcjtcbn1cblxuLyoqXG4gKiBBdHRhY2hlcyBhbiBldmVudCBoYW5kbGVyIHRvIGFuIGVsZW1lbnQgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHJlbW92ZXMgdGhlIGhhbmRsZXIuIFVzaW5nIHRoaXNcbiAqIHJhdGhlciB0aGFuIGBhZGRFdmVudExpc3RlbmVyYCB3aWxsIHByZXNlcnZlIHRoZSBjb3JyZWN0IG9yZGVyIHJlbGF0aXZlIHRvIGhhbmRsZXJzIGFkZGVkIGRlY2xhcmF0aXZlbHlcbiAqICh3aXRoIGF0dHJpYnV0ZXMgbGlrZSBgb25jbGlja2ApLCB3aGljaCB1c2UgZXZlbnQgZGVsZWdhdGlvbiBmb3IgcGVyZm9ybWFuY2UgcmVhc29uc1xuICpcbiAqIEBwYXJhbSB7RXZlbnRUYXJnZXR9IGVsZW1lbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge0V2ZW50TGlzdGVuZXJ9IGhhbmRsZXJcbiAqIEBwYXJhbSB7QWRkRXZlbnRMaXN0ZW5lck9wdGlvbnN9IFtvcHRpb25zXVxuICovXG5leHBvcnQgZnVuY3Rpb24gb24oZWxlbWVudCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucyA9IHt9KSB7XG5cdHZhciB0YXJnZXRfaGFuZGxlciA9IGNyZWF0ZV9ldmVudCh0eXBlLCBlbGVtZW50LCBoYW5kbGVyLCBvcHRpb25zKTtcblxuXHRyZXR1cm4gKCkgPT4ge1xuXHRcdGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCB0YXJnZXRfaGFuZGxlciwgb3B0aW9ucyk7XG5cdH07XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50X25hbWVcbiAqIEBwYXJhbSB7RWxlbWVudH0gZG9tXG4gKiBAcGFyYW0ge0V2ZW50TGlzdGVuZXJ9IFtoYW5kbGVyXVxuICogQHBhcmFtIHtib29sZWFufSBbY2FwdHVyZV1cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3Bhc3NpdmVdXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV2ZW50KGV2ZW50X25hbWUsIGRvbSwgaGFuZGxlciwgY2FwdHVyZSwgcGFzc2l2ZSkge1xuXHR2YXIgb3B0aW9ucyA9IHsgY2FwdHVyZSwgcGFzc2l2ZSB9O1xuXHR2YXIgdGFyZ2V0X2hhbmRsZXIgPSBjcmVhdGVfZXZlbnQoZXZlbnRfbmFtZSwgZG9tLCBoYW5kbGVyLCBvcHRpb25zKTtcblxuXHRpZiAoXG5cdFx0ZG9tID09PSBkb2N1bWVudC5ib2R5IHx8XG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdGRvbSA9PT0gd2luZG93IHx8XG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdGRvbSA9PT0gZG9jdW1lbnQgfHxcblx0XHQvLyBGaXJlZm94IGhhcyBxdWlya3kgYmVoYXZpb3IsIGl0IGNhbiBoYXBwZW4gdGhhdCB3ZSBzdGlsbCBnZXQgXCJjYW5wbGF5XCIgZXZlbnRzIHdoZW4gdGhlIGVsZW1lbnQgaXMgYWxyZWFkeSByZW1vdmVkXG5cdFx0ZG9tIGluc3RhbmNlb2YgSFRNTE1lZGlhRWxlbWVudFxuXHQpIHtcblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkb20ucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudF9uYW1lLCB0YXJnZXRfaGFuZGxlciwgb3B0aW9ucyk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5PHN0cmluZz59IGV2ZW50c1xuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWxlZ2F0ZShldmVudHMpIHtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRhbGxfcmVnaXN0ZXJlZF9ldmVudHMuYWRkKGV2ZW50c1tpXSk7XG5cdH1cblxuXHRmb3IgKHZhciBmbiBvZiByb290X2V2ZW50X2hhbmRsZXMpIHtcblx0XHRmbihldmVudHMpO1xuXHR9XG59XG5cbi8vIHVzZWQgdG8gc3RvcmUgdGhlIHJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IHByb3BhZ2F0ZWQgZXZlbnRcbi8vIHRvIHByZXZlbnQgZ2FyYmFnZSBjb2xsZWN0aW9uIGJldHdlZW4gbWljcm90YXNrcyBpbiBGaXJlZm94XG4vLyBJZiB0aGUgZXZlbnQgb2JqZWN0IGlzIEdDZWQgdG9vIGVhcmx5LCB0aGUgZXhwYW5kbyBfX3Jvb3QgcHJvcGVydHlcbi8vIHNldCBvbiB0aGUgZXZlbnQgb2JqZWN0IGlzIGxvc3QsIGNhdXNpbmcgdGhlIGV2ZW50IGRlbGVnYXRpb25cbi8vIHRvIHByb2Nlc3MgdGhlIGV2ZW50IHR3aWNlXG5sZXQgbGFzdF9wcm9wYWdhdGVkX2V2ZW50ID0gbnVsbDtcblxuLyoqXG4gKiBAdGhpcyB7RXZlbnRUYXJnZXR9XG4gKiBAcGFyYW0ge0V2ZW50fSBldmVudFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVfZXZlbnRfcHJvcGFnYXRpb24oZXZlbnQpIHtcblx0dmFyIGhhbmRsZXJfZWxlbWVudCA9IHRoaXM7XG5cdHZhciBvd25lcl9kb2N1bWVudCA9IC8qKiBAdHlwZSB7Tm9kZX0gKi8gKGhhbmRsZXJfZWxlbWVudCkub3duZXJEb2N1bWVudDtcblx0dmFyIGV2ZW50X25hbWUgPSBldmVudC50eXBlO1xuXHR2YXIgcGF0aCA9IGV2ZW50LmNvbXBvc2VkUGF0aD8uKCkgfHwgW107XG5cdHZhciBjdXJyZW50X3RhcmdldCA9IC8qKiBAdHlwZSB7bnVsbCB8IEVsZW1lbnR9ICovIChwYXRoWzBdIHx8IGV2ZW50LnRhcmdldCk7XG5cblx0bGFzdF9wcm9wYWdhdGVkX2V2ZW50ID0gZXZlbnQ7XG5cblx0Ly8gY29tcG9zZWRQYXRoIGNvbnRhaW5zIGxpc3Qgb2Ygbm9kZXMgdGhlIGV2ZW50IGhhcyBwcm9wYWdhdGVkIHRocm91Z2guXG5cdC8vIFdlIGNoZWNrIF9fcm9vdCB0byBza2lwIGFsbCBub2RlcyBiZWxvdyBpdCBpbiBjYXNlIHRoaXMgaXMgYVxuXHQvLyBwYXJlbnQgb2YgdGhlIF9fcm9vdCBub2RlLCB3aGljaCBpbmRpY2F0ZXMgdGhhdCB0aGVyZSdzIG5lc3RlZFxuXHQvLyBtb3VudGVkIGFwcHMuIEluIHRoaXMgY2FzZSB3ZSBkb24ndCB3YW50IHRvIHRyaWdnZXIgZXZlbnRzIG11bHRpcGxlIHRpbWVzLlxuXHR2YXIgcGF0aF9pZHggPSAwO1xuXG5cdC8vIHRoZSBgbGFzdF9wcm9wYWdhdGVkX2V2ZW50ID09PSBldmVudGAgY2hlY2sgaXMgcmVkdW5kYW50LCBidXRcblx0Ly8gd2l0aG91dCBpdCB0aGUgdmFyaWFibGUgd2lsbCBiZSBEQ0UnZCBhbmQgdGhpbmdzIHdpbGxcblx0Ly8gZmFpbCBteXN0ZXJpb3VzbHkgaW4gRmlyZWZveFxuXHQvLyBAdHMtZXhwZWN0LWVycm9yIGlzIGFkZGVkIGJlbG93XG5cdHZhciBoYW5kbGVkX2F0ID0gbGFzdF9wcm9wYWdhdGVkX2V2ZW50ID09PSBldmVudCAmJiBldmVudC5fX3Jvb3Q7XG5cblx0aWYgKGhhbmRsZWRfYXQpIHtcblx0XHR2YXIgYXRfaWR4ID0gcGF0aC5pbmRleE9mKGhhbmRsZWRfYXQpO1xuXHRcdGlmIChcblx0XHRcdGF0X2lkeCAhPT0gLTEgJiZcblx0XHRcdChoYW5kbGVyX2VsZW1lbnQgPT09IGRvY3VtZW50IHx8IGhhbmRsZXJfZWxlbWVudCA9PT0gLyoqIEB0eXBlIHthbnl9ICovICh3aW5kb3cpKVxuXHRcdCkge1xuXHRcdFx0Ly8gVGhpcyBpcyB0aGUgZmFsbGJhY2sgZG9jdW1lbnQgbGlzdGVuZXIgb3IgYSB3aW5kb3cgbGlzdGVuZXIsIGJ1dCB0aGUgZXZlbnQgd2FzIGFscmVhZHkgaGFuZGxlZFxuXHRcdFx0Ly8gLT4gaWdub3JlLCBidXQgc2V0IGhhbmRsZV9hdCB0byBkb2N1bWVudC93aW5kb3cgc28gdGhhdCB3ZSdyZSByZXNldHRpbmcgdGhlIGV2ZW50XG5cdFx0XHQvLyBjaGFpbiBpbiBjYXNlIHNvbWVvbmUgbWFudWFsbHkgZGlzcGF0Y2hlcyB0aGUgc2FtZSBldmVudCBvYmplY3QgYWdhaW4uXG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRldmVudC5fX3Jvb3QgPSBoYW5kbGVyX2VsZW1lbnQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2UncmUgZGVsaWJlcmF0ZWx5IG5vdCBza2lwcGluZyBpZiB0aGUgaW5kZXggaXMgaGlnaGVyLCBiZWNhdXNlXG5cdFx0Ly8gc29tZW9uZSBjb3VsZCBjcmVhdGUgYW4gZXZlbnQgcHJvZ3JhbW1hdGljYWxseSBhbmQgZW1pdCBpdCBtdWx0aXBsZSB0aW1lcyxcblx0XHQvLyBpbiB3aGljaCBjYXNlIHdlIHdhbnQgdG8gaGFuZGxlIHRoZSB3aG9sZSBwcm9wYWdhdGlvbiBjaGFpbiBwcm9wZXJseSBlYWNoIHRpbWUuXG5cdFx0Ly8gKHRoaXMgd2lsbCBvbmx5IGJlIGEgZmFsc2UgbmVnYXRpdmUgaWYgdGhlIGV2ZW50IGlzIGRpc3BhdGNoZWQgbXVsdGlwbGUgdGltZXMgYW5kXG5cdFx0Ly8gdGhlIGZhbGxiYWNrIGRvY3VtZW50IGxpc3RlbmVyIGlzbid0IHJlYWNoZWQgaW4gYmV0d2VlbiwgYnV0IHRoYXQncyBzdXBlciByYXJlKVxuXHRcdHZhciBoYW5kbGVyX2lkeCA9IHBhdGguaW5kZXhPZihoYW5kbGVyX2VsZW1lbnQpO1xuXHRcdGlmIChoYW5kbGVyX2lkeCA9PT0gLTEpIHtcblx0XHRcdC8vIGhhbmRsZV9pZHggY2FuIHRoZW9yZXRpY2FsbHkgYmUgLTEgKGhhcHBlbmVkIGluIHNvbWUgSlNET00gdGVzdGluZyBzY2VuYXJpb3Mgd2l0aCBhbiBldmVudCBsaXN0ZW5lciBvbiB0aGUgd2luZG93IG9iamVjdClcblx0XHRcdC8vIHNvIGd1YXJkIGFnYWluc3QgdGhhdCwgdG9vLCBhbmQgYXNzdW1lIHRoYXQgZXZlcnl0aGluZyB3YXMgaGFuZGxlZCBhdCB0aGlzIHBvaW50LlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChhdF9pZHggPD0gaGFuZGxlcl9pZHgpIHtcblx0XHRcdHBhdGhfaWR4ID0gYXRfaWR4O1xuXHRcdH1cblx0fVxuXG5cdGN1cnJlbnRfdGFyZ2V0ID0gLyoqIEB0eXBlIHtFbGVtZW50fSAqLyAocGF0aFtwYXRoX2lkeF0gfHwgZXZlbnQudGFyZ2V0KTtcblx0Ly8gdGhlcmUgY2FuIG9ubHkgYmUgb25lIGRlbGVnYXRlZCBldmVudCBwZXIgZWxlbWVudCwgYW5kIHdlIGVpdGhlciBhbHJlYWR5IGhhbmRsZWQgdGhlIGN1cnJlbnQgdGFyZ2V0LFxuXHQvLyBvciB0aGlzIGlzIHRoZSB2ZXJ5IGZpcnN0IHRhcmdldCBpbiB0aGUgY2hhaW4gd2hpY2ggaGFzIGEgbm9uLWRlbGVnYXRlZCBsaXN0ZW5lciwgaW4gd2hpY2ggY2FzZSBpdCdzIHNhZmVcblx0Ly8gdG8gaGFuZGxlIGEgcG9zc2libGUgZGVsZWdhdGVkIGV2ZW50IG9uIGl0IGxhdGVyICh0aHJvdWdoIHRoZSByb290IGRlbGVnYXRpb24gbGlzdGVuZXIgZm9yIGV4YW1wbGUpLlxuXHRpZiAoY3VycmVudF90YXJnZXQgPT09IGhhbmRsZXJfZWxlbWVudCkgcmV0dXJuO1xuXG5cdC8vIFByb3h5IGN1cnJlbnRUYXJnZXQgdG8gY29ycmVjdCB0YXJnZXRcblx0ZGVmaW5lX3Byb3BlcnR5KGV2ZW50LCAnY3VycmVudFRhcmdldCcsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0Z2V0KCkge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRfdGFyZ2V0IHx8IG93bmVyX2RvY3VtZW50O1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gVGhpcyBzdGFydGVkIGJlY2F1c2Ugb2YgQ2hyb21pdW0gaXNzdWUgaHR0cHM6Ly9jaHJvbWVzdGF0dXMuY29tL2ZlYXR1cmUvNTEyODY5NjgyMzU0NTg1Nixcblx0Ly8gd2hlcmUgcmVtb3ZhbCBvciBtb3Zpbmcgb2Ygb2YgdGhlIERPTSBjYW4gY2F1c2Ugc3luYyBgYmx1cmAgZXZlbnRzIHRvIGZpcmUsIHdoaWNoIGNhbiBjYXVzZSBsb2dpY1xuXHQvLyB0byBydW4gaW5zaWRlIHRoZSBjdXJyZW50IGBhY3RpdmVfcmVhY3Rpb25gLCB3aGljaCBpc24ndCB3aGF0IHdlIHdhbnQgYXQgYWxsLiBIb3dldmVyLCBvbiByZWZsZWN0aW9uLFxuXHQvLyBpdCdzIHByb2JhYmx5IGJlc3QgdGhhdCBhbGwgZXZlbnQgaGFuZGxlZCBieSBTdmVsdGUgaGF2ZSB0aGlzIGJlaGF2aW91ciwgYXMgd2UgZG9uJ3QgcmVhbGx5IHdhbnRcblx0Ly8gYW4gZXZlbnQgaGFuZGxlciB0byBydW4gaW4gdGhlIGNvbnRleHQgb2YgYW5vdGhlciByZWFjdGlvbiBvciBlZmZlY3QuXG5cdHZhciBwcmV2aW91c19yZWFjdGlvbiA9IGFjdGl2ZV9yZWFjdGlvbjtcblx0dmFyIHByZXZpb3VzX2VmZmVjdCA9IGFjdGl2ZV9lZmZlY3Q7XG5cdHNldF9hY3RpdmVfcmVhY3Rpb24obnVsbCk7XG5cdHNldF9hY3RpdmVfZWZmZWN0KG51bGwpO1xuXG5cdHRyeSB7XG5cdFx0LyoqXG5cdFx0ICogQHR5cGUge3Vua25vd259XG5cdFx0ICovXG5cdFx0dmFyIHRocm93X2Vycm9yO1xuXHRcdC8qKlxuXHRcdCAqIEB0eXBlIHt1bmtub3duW119XG5cdFx0ICovXG5cdFx0dmFyIG90aGVyX2Vycm9ycyA9IFtdO1xuXG5cdFx0d2hpbGUgKGN1cnJlbnRfdGFyZ2V0ICE9PSBudWxsKSB7XG5cdFx0XHQvKiogQHR5cGUge251bGwgfCBFbGVtZW50fSAqL1xuXHRcdFx0dmFyIHBhcmVudF9lbGVtZW50ID1cblx0XHRcdFx0Y3VycmVudF90YXJnZXQuYXNzaWduZWRTbG90IHx8XG5cdFx0XHRcdGN1cnJlbnRfdGFyZ2V0LnBhcmVudE5vZGUgfHxcblx0XHRcdFx0LyoqIEB0eXBlIHthbnl9ICovIChjdXJyZW50X3RhcmdldCkuaG9zdCB8fFxuXHRcdFx0XHRudWxsO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdHZhciBkZWxlZ2F0ZWQgPSBjdXJyZW50X3RhcmdldFsnX18nICsgZXZlbnRfbmFtZV07XG5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGRlbGVnYXRlZCAhPSBudWxsICYmXG5cdFx0XHRcdFx0KCEoLyoqIEB0eXBlIHthbnl9ICovIChjdXJyZW50X3RhcmdldCkuZGlzYWJsZWQpIHx8XG5cdFx0XHRcdFx0XHQvLyBET00gY291bGQndmUgYmVlbiB1cGRhdGVkIGFscmVhZHkgYnkgdGhlIHRpbWUgdGhpcyBpcyByZWFjaGVkLCBzbyB3ZSBjaGVjayB0aGlzIGFzIHdlbGxcblx0XHRcdFx0XHRcdC8vIC0+IHRoZSB0YXJnZXQgY291bGQgbm90IGhhdmUgYmVlbiBkaXNhYmxlZCBiZWNhdXNlIGl0IGVtaXRzIHRoZSBldmVudCBpbiB0aGUgZmlyc3QgcGxhY2Vcblx0XHRcdFx0XHRcdGV2ZW50LnRhcmdldCA9PT0gY3VycmVudF90YXJnZXQpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGRlbGVnYXRlZC5jYWxsKGN1cnJlbnRfdGFyZ2V0LCBldmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICh0aHJvd19lcnJvcikge1xuXHRcdFx0XHRcdG90aGVyX2Vycm9ycy5wdXNoKGVycm9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvd19lcnJvciA9IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuY2FuY2VsQnViYmxlIHx8IHBhcmVudF9lbGVtZW50ID09PSBoYW5kbGVyX2VsZW1lbnQgfHwgcGFyZW50X2VsZW1lbnQgPT09IG51bGwpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjdXJyZW50X3RhcmdldCA9IHBhcmVudF9lbGVtZW50O1xuXHRcdH1cblxuXHRcdGlmICh0aHJvd19lcnJvcikge1xuXHRcdFx0Zm9yIChsZXQgZXJyb3Igb2Ygb3RoZXJfZXJyb3JzKSB7XG5cdFx0XHRcdC8vIFRocm93IHRoZSByZXN0IG9mIHRoZSBlcnJvcnMsIG9uZS1ieS1vbmUgb24gYSBtaWNyb3Rhc2tcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IHRocm93X2Vycm9yO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIGlzIHVzZWQgYWJvdmVcblx0XHRldmVudC5fX3Jvb3QgPSBoYW5kbGVyX2VsZW1lbnQ7XG5cdFx0Ly8gQHRzLWlnbm9yZSByZW1vdmUgcHJveHkgb24gY3VycmVudFRhcmdldFxuXHRcdGRlbGV0ZSBldmVudC5jdXJyZW50VGFyZ2V0O1xuXHRcdHNldF9hY3RpdmVfcmVhY3Rpb24ocHJldmlvdXNfcmVhY3Rpb24pO1xuXHRcdHNldF9hY3RpdmVfZWZmZWN0KHByZXZpb3VzX2VmZmVjdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBJbiBkZXYsIHdhcm4gaWYgYW4gZXZlbnQgaGFuZGxlciBpcyBub3QgYSBmdW5jdGlvbiwgYXMgaXQgbWVhbnMgdGhlXG4gKiB1c2VyIHByb2JhYmx5IGNhbGxlZCB0aGUgaGFuZGxlciBvciBmb3Jnb3QgdG8gYWRkIGEgYCgpID0+YFxuICogQHBhcmFtIHsoKSA9PiAoZXZlbnQ6IEV2ZW50LCAuLi5hcmdzOiBhbnkpID0+IHZvaWR9IHRodW5rXG4gKiBAcGFyYW0ge0V2ZW50VGFyZ2V0fSBlbGVtZW50XG4gKiBAcGFyYW0ge1tFdmVudCwgLi4uYW55XX0gYXJnc1xuICogQHBhcmFtIHthbnl9IGNvbXBvbmVudFxuICogQHBhcmFtIHtbbnVtYmVyLCBudW1iZXJdfSBbbG9jXVxuICogQHBhcmFtIHtib29sZWFufSBbcmVtb3ZlX3BhcmVuc11cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5KFxuXHR0aHVuayxcblx0ZWxlbWVudCxcblx0YXJncyxcblx0Y29tcG9uZW50LFxuXHRsb2MsXG5cdGhhc19zaWRlX2VmZmVjdHMgPSBmYWxzZSxcblx0cmVtb3ZlX3BhcmVucyA9IGZhbHNlXG4pIHtcblx0bGV0IGhhbmRsZXI7XG5cdGxldCBlcnJvcjtcblxuXHR0cnkge1xuXHRcdGhhbmRsZXIgPSB0aHVuaygpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0ZXJyb3IgPSBlO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBoYW5kbGVyICE9PSAnZnVuY3Rpb24nICYmIChoYXNfc2lkZV9lZmZlY3RzIHx8IGhhbmRsZXIgIT0gbnVsbCB8fCBlcnJvcikpIHtcblx0XHRjb25zdCBmaWxlbmFtZSA9IGNvbXBvbmVudD8uW0ZJTEVOQU1FXTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGxvYyA/IGAgYXQgJHtmaWxlbmFtZX06JHtsb2NbMF19OiR7bG9jWzFdfWAgOiBgIGluICR7ZmlsZW5hbWV9YDtcblx0XHRjb25zdCBwaGFzZSA9IGFyZ3NbMF0/LmV2ZW50UGhhc2UgPCBFdmVudC5CVUJCTElOR19QSEFTRSA/ICdjYXB0dXJlJyA6ICcnO1xuXHRcdGNvbnN0IGV2ZW50X25hbWUgPSBhcmdzWzBdPy50eXBlICsgcGhhc2U7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBgXFxgJHtldmVudF9uYW1lfVxcYCBoYW5kbGVyJHtsb2NhdGlvbn1gO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb24gPSByZW1vdmVfcGFyZW5zID8gJ3JlbW92ZSB0aGUgdHJhaWxpbmcgYCgpYCcgOiAnYWRkIGEgbGVhZGluZyBgKCkgPT5gJztcblxuXHRcdHcuZXZlbnRfaGFuZGxlcl9pbnZhbGlkKGRlc2NyaXB0aW9uLCBzdWdnZXN0aW9uKTtcblxuXHRcdGlmIChlcnJvcikge1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cdGhhbmRsZXI/LmFwcGx5KGVsZW1lbnQsIGFyZ3MpO1xufVxuIiwiLyoqIEBwYXJhbSB7c3RyaW5nfSBodG1sICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlX2ZyYWdtZW50X2Zyb21faHRtbChodG1sKSB7XG5cdHZhciBlbGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKTtcblx0ZWxlbS5pbm5lckhUTUwgPSBodG1sLnJlcGxhY2VBbGwoJzwhPicsICc8IS0tLS0+Jyk7IC8vIFhIVE1MIGNvbXBsaWFuY2Vcblx0cmV0dXJuIGVsZW0uY29udGVudDtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0LCBUZW1wbGF0ZU5vZGUgfSBmcm9tICcjY2xpZW50JyAqL1xuLyoqIEBpbXBvcnQgeyBUZW1wbGF0ZVN0cnVjdHVyZSB9IGZyb20gJy4vdHlwZXMnICovXG5pbXBvcnQgeyBoeWRyYXRlX25leHQsIGh5ZHJhdGVfbm9kZSwgaHlkcmF0aW5nLCBzZXRfaHlkcmF0ZV9ub2RlIH0gZnJvbSAnLi9oeWRyYXRpb24uanMnO1xuaW1wb3J0IHtcblx0Y3JlYXRlX3RleHQsXG5cdGdldF9maXJzdF9jaGlsZCxcblx0aXNfZmlyZWZveCxcblx0Y3JlYXRlX2VsZW1lbnQsXG5cdGNyZWF0ZV9mcmFnbWVudCxcblx0Y3JlYXRlX2NvbW1lbnQsXG5cdHNldF9hdHRyaWJ1dGVcbn0gZnJvbSAnLi9vcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZV9mcmFnbWVudF9mcm9tX2h0bWwgfSBmcm9tICcuL3JlY29uY2lsZXIuanMnO1xuaW1wb3J0IHsgYWN0aXZlX2VmZmVjdCB9IGZyb20gJy4uL3J1bnRpbWUuanMnO1xuaW1wb3J0IHtcblx0TkFNRVNQQUNFX01BVEhNTCxcblx0TkFNRVNQQUNFX1NWRyxcblx0VEVNUExBVEVfRlJBR01FTlQsXG5cdFRFTVBMQVRFX1VTRV9JTVBPUlRfTk9ERSxcblx0VEVNUExBVEVfVVNFX01BVEhNTCxcblx0VEVNUExBVEVfVVNFX1NWR1xufSBmcm9tICcuLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ09NTUVOVF9OT0RFLCBET0NVTUVOVF9GUkFHTUVOVF9OT0RFLCBFRkZFQ1RfUkFOLCBURVhUX05PREUgfSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5cbi8qKlxuICogQHBhcmFtIHtUZW1wbGF0ZU5vZGV9IHN0YXJ0XG4gKiBAcGFyYW0ge1RlbXBsYXRlTm9kZSB8IG51bGx9IGVuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzaWduX25vZGVzKHN0YXJ0LCBlbmQpIHtcblx0dmFyIGVmZmVjdCA9IC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCk7XG5cdGlmIChlZmZlY3Qubm9kZXNfc3RhcnQgPT09IG51bGwpIHtcblx0XHRlZmZlY3Qubm9kZXNfc3RhcnQgPSBzdGFydDtcblx0XHRlZmZlY3Qubm9kZXNfZW5kID0gZW5kO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGNvbnRlbnRcbiAqIEBwYXJhbSB7bnVtYmVyfSBmbGFnc1xuICogQHJldHVybnMgeygpID0+IE5vZGUgfCBOb2RlW119XG4gKi9cbi8qI19fTk9fU0lERV9FRkZFQ1RTX18qL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21faHRtbChjb250ZW50LCBmbGFncykge1xuXHR2YXIgaXNfZnJhZ21lbnQgPSAoZmxhZ3MgJiBURU1QTEFURV9GUkFHTUVOVCkgIT09IDA7XG5cdHZhciB1c2VfaW1wb3J0X25vZGUgPSAoZmxhZ3MgJiBURU1QTEFURV9VU0VfSU1QT1JUX05PREUpICE9PSAwO1xuXG5cdC8qKiBAdHlwZSB7Tm9kZX0gKi9cblx0dmFyIG5vZGU7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgb3Igbm90IHRoZSBmaXJzdCBpdGVtIGlzIGEgdGV4dC9lbGVtZW50IG5vZGUuIElmIG5vdCwgd2UgbmVlZCB0b1xuXHQgKiBjcmVhdGUgYW4gYWRkaXRpb25hbCBjb21tZW50IG5vZGUgdG8gYWN0IGFzIGBlZmZlY3Qubm9kZXMuc3RhcnRgXG5cdCAqL1xuXHR2YXIgaGFzX3N0YXJ0ID0gIWNvbnRlbnQuc3RhcnRzV2l0aCgnPCE+Jyk7XG5cblx0cmV0dXJuICgpID0+IHtcblx0XHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0XHRhc3NpZ25fbm9kZXMoaHlkcmF0ZV9ub2RlLCBudWxsKTtcblx0XHRcdHJldHVybiBoeWRyYXRlX25vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bm9kZSA9IGNyZWF0ZV9mcmFnbWVudF9mcm9tX2h0bWwoaGFzX3N0YXJ0ID8gY29udGVudCA6ICc8IT4nICsgY29udGVudCk7XG5cdFx0XHRpZiAoIWlzX2ZyYWdtZW50KSBub2RlID0gLyoqIEB0eXBlIHtOb2RlfSAqLyAoZ2V0X2ZpcnN0X2NoaWxkKG5vZGUpKTtcblx0XHR9XG5cblx0XHR2YXIgY2xvbmUgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKFxuXHRcdFx0dXNlX2ltcG9ydF9ub2RlIHx8IGlzX2ZpcmVmb3ggPyBkb2N1bWVudC5pbXBvcnROb2RlKG5vZGUsIHRydWUpIDogbm9kZS5jbG9uZU5vZGUodHJ1ZSlcblx0XHQpO1xuXG5cdFx0aWYgKGlzX2ZyYWdtZW50KSB7XG5cdFx0XHR2YXIgc3RhcnQgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9maXJzdF9jaGlsZChjbG9uZSkpO1xuXHRcdFx0dmFyIGVuZCA9IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoY2xvbmUubGFzdENoaWxkKTtcblxuXHRcdFx0YXNzaWduX25vZGVzKHN0YXJ0LCBlbmQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NpZ25fbm9kZXMoY2xvbmUsIGNsb25lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2xvbmU7XG5cdH07XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGNvbnRlbnRcbiAqIEBwYXJhbSB7bnVtYmVyfSBmbGFnc1xuICogQHBhcmFtIHsnc3ZnJyB8ICdtYXRoJ30gbnNcbiAqIEByZXR1cm5zIHsoKSA9PiBOb2RlIHwgTm9kZVtdfVxuICovXG4vKiNfX05PX1NJREVfRUZGRUNUU19fKi9cbmZ1bmN0aW9uIGZyb21fbmFtZXNwYWNlKGNvbnRlbnQsIGZsYWdzLCBucyA9ICdzdmcnKSB7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIG9yIG5vdCB0aGUgZmlyc3QgaXRlbSBpcyBhIHRleHQvZWxlbWVudCBub2RlLiBJZiBub3QsIHdlIG5lZWQgdG9cblx0ICogY3JlYXRlIGFuIGFkZGl0aW9uYWwgY29tbWVudCBub2RlIHRvIGFjdCBhcyBgZWZmZWN0Lm5vZGVzLnN0YXJ0YFxuXHQgKi9cblx0dmFyIGhhc19zdGFydCA9ICFjb250ZW50LnN0YXJ0c1dpdGgoJzwhPicpO1xuXG5cdHZhciBpc19mcmFnbWVudCA9IChmbGFncyAmIFRFTVBMQVRFX0ZSQUdNRU5UKSAhPT0gMDtcblx0dmFyIHdyYXBwZWQgPSBgPCR7bnN9PiR7aGFzX3N0YXJ0ID8gY29udGVudCA6ICc8IT4nICsgY29udGVudH08LyR7bnN9PmA7XG5cblx0LyoqIEB0eXBlIHtFbGVtZW50IHwgRG9jdW1lbnRGcmFnbWVudH0gKi9cblx0dmFyIG5vZGU7XG5cblx0cmV0dXJuICgpID0+IHtcblx0XHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0XHRhc3NpZ25fbm9kZXMoaHlkcmF0ZV9ub2RlLCBudWxsKTtcblx0XHRcdHJldHVybiBoeWRyYXRlX25vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHR2YXIgZnJhZ21lbnQgPSAvKiogQHR5cGUge0RvY3VtZW50RnJhZ21lbnR9ICovIChjcmVhdGVfZnJhZ21lbnRfZnJvbV9odG1sKHdyYXBwZWQpKTtcblx0XHRcdHZhciByb290ID0gLyoqIEB0eXBlIHtFbGVtZW50fSAqLyAoZ2V0X2ZpcnN0X2NoaWxkKGZyYWdtZW50KSk7XG5cblx0XHRcdGlmIChpc19mcmFnbWVudCkge1xuXHRcdFx0XHRub2RlID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdFx0XHR3aGlsZSAoZ2V0X2ZpcnN0X2NoaWxkKHJvb3QpKSB7XG5cdFx0XHRcdFx0bm9kZS5hcHBlbmRDaGlsZCgvKiogQHR5cGUge05vZGV9ICovIChnZXRfZmlyc3RfY2hpbGQocm9vdCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm9kZSA9IC8qKiBAdHlwZSB7RWxlbWVudH0gKi8gKGdldF9maXJzdF9jaGlsZChyb290KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dmFyIGNsb25lID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChub2RlLmNsb25lTm9kZSh0cnVlKSk7XG5cblx0XHRpZiAoaXNfZnJhZ21lbnQpIHtcblx0XHRcdHZhciBzdGFydCA9IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoZ2V0X2ZpcnN0X2NoaWxkKGNsb25lKSk7XG5cdFx0XHR2YXIgZW5kID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChjbG9uZS5sYXN0Q2hpbGQpO1xuXG5cdFx0XHRhc3NpZ25fbm9kZXMoc3RhcnQsIGVuZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2lnbl9ub2RlcyhjbG9uZSwgY2xvbmUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjbG9uZTtcblx0fTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gY29udGVudFxuICogQHBhcmFtIHtudW1iZXJ9IGZsYWdzXG4gKi9cbi8qI19fTk9fU0lERV9FRkZFQ1RTX18qL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21fc3ZnKGNvbnRlbnQsIGZsYWdzKSB7XG5cdHJldHVybiBmcm9tX25hbWVzcGFjZShjb250ZW50LCBmbGFncywgJ3N2ZycpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50XG4gKiBAcGFyYW0ge251bWJlcn0gZmxhZ3NcbiAqL1xuLyojX19OT19TSURFX0VGRkVDVFNfXyovXG5leHBvcnQgZnVuY3Rpb24gZnJvbV9tYXRobWwoY29udGVudCwgZmxhZ3MpIHtcblx0cmV0dXJuIGZyb21fbmFtZXNwYWNlKGNvbnRlbnQsIGZsYWdzLCAnbWF0aCcpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7VGVtcGxhdGVTdHJ1Y3R1cmVbXX0gc3RydWN0dXJlXG4gKiBAcGFyYW0ge3R5cGVvZiBOQU1FU1BBQ0VfU1ZHIHwgdHlwZW9mIE5BTUVTUEFDRV9NQVRITUwgfCB1bmRlZmluZWR9IFtuc11cbiAqL1xuZnVuY3Rpb24gZnJhZ21lbnRfZnJvbV90cmVlKHN0cnVjdHVyZSwgbnMpIHtcblx0dmFyIGZyYWdtZW50ID0gY3JlYXRlX2ZyYWdtZW50KCk7XG5cblx0Zm9yICh2YXIgaXRlbSBvZiBzdHJ1Y3R1cmUpIHtcblx0XHRpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRmcmFnbWVudC5hcHBlbmQoY3JlYXRlX3RleHQoaXRlbSkpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gaWYgYHByZXNlcnZlQ29tbWVudHMgPT09IHRydWVgLCBjb21tZW50cyBhcmUgcmVwcmVzZW50ZWQgYXMgYFsnLy8gPGRhdGE+J11gXG5cdFx0aWYgKGl0ZW0gPT09IHVuZGVmaW5lZCB8fCBpdGVtWzBdWzBdID09PSAnLycpIHtcblx0XHRcdGZyYWdtZW50LmFwcGVuZChjcmVhdGVfY29tbWVudChpdGVtID8gaXRlbVswXS5zbGljZSgzKSA6ICcnKSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBbbmFtZSwgYXR0cmlidXRlcywgLi4uY2hpbGRyZW5dID0gaXRlbTtcblxuXHRcdGNvbnN0IG5hbWVzcGFjZSA9IG5hbWUgPT09ICdzdmcnID8gTkFNRVNQQUNFX1NWRyA6IG5hbWUgPT09ICdtYXRoJyA/IE5BTUVTUEFDRV9NQVRITUwgOiBucztcblxuXHRcdHZhciBlbGVtZW50ID0gY3JlYXRlX2VsZW1lbnQobmFtZSwgbmFtZXNwYWNlLCBhdHRyaWJ1dGVzPy5pcyk7XG5cblx0XHRmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuXHRcdFx0c2V0X2F0dHJpYnV0ZShlbGVtZW50LCBrZXksIGF0dHJpYnV0ZXNba2V5XSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdHZhciB0YXJnZXQgPVxuXHRcdFx0XHRlbGVtZW50LnRhZ05hbWUgPT09ICdURU1QTEFURSdcblx0XHRcdFx0XHQ/IC8qKiBAdHlwZSB7SFRNTFRlbXBsYXRlRWxlbWVudH0gKi8gKGVsZW1lbnQpLmNvbnRlbnRcblx0XHRcdFx0XHQ6IGVsZW1lbnQ7XG5cblx0XHRcdHRhcmdldC5hcHBlbmQoXG5cdFx0XHRcdGZyYWdtZW50X2Zyb21fdHJlZShjaGlsZHJlbiwgZWxlbWVudC50YWdOYW1lID09PSAnZm9yZWlnbk9iamVjdCcgPyB1bmRlZmluZWQgOiBuYW1lc3BhY2UpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGZyYWdtZW50LmFwcGVuZChlbGVtZW50KTtcblx0fVxuXG5cdHJldHVybiBmcmFnbWVudDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge1RlbXBsYXRlU3RydWN0dXJlW119IHN0cnVjdHVyZVxuICogQHBhcmFtIHtudW1iZXJ9IGZsYWdzXG4gKiBAcmV0dXJucyB7KCkgPT4gTm9kZSB8IE5vZGVbXX1cbiAqL1xuLyojX19OT19TSURFX0VGRkVDVFNfXyovXG5leHBvcnQgZnVuY3Rpb24gZnJvbV90cmVlKHN0cnVjdHVyZSwgZmxhZ3MpIHtcblx0dmFyIGlzX2ZyYWdtZW50ID0gKGZsYWdzICYgVEVNUExBVEVfRlJBR01FTlQpICE9PSAwO1xuXHR2YXIgdXNlX2ltcG9ydF9ub2RlID0gKGZsYWdzICYgVEVNUExBVEVfVVNFX0lNUE9SVF9OT0RFKSAhPT0gMDtcblxuXHQvKiogQHR5cGUge05vZGV9ICovXG5cdHZhciBub2RlO1xuXG5cdHJldHVybiAoKSA9PiB7XG5cdFx0aWYgKGh5ZHJhdGluZykge1xuXHRcdFx0YXNzaWduX25vZGVzKGh5ZHJhdGVfbm9kZSwgbnVsbCk7XG5cdFx0XHRyZXR1cm4gaHlkcmF0ZV9ub2RlO1xuXHRcdH1cblxuXHRcdGlmIChub2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG5zID1cblx0XHRcdFx0KGZsYWdzICYgVEVNUExBVEVfVVNFX1NWRykgIT09IDBcblx0XHRcdFx0XHQ/IE5BTUVTUEFDRV9TVkdcblx0XHRcdFx0XHQ6IChmbGFncyAmIFRFTVBMQVRFX1VTRV9NQVRITUwpICE9PSAwXG5cdFx0XHRcdFx0XHQ/IE5BTUVTUEFDRV9NQVRITUxcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRub2RlID0gZnJhZ21lbnRfZnJvbV90cmVlKHN0cnVjdHVyZSwgbnMpO1xuXHRcdFx0aWYgKCFpc19mcmFnbWVudCkgbm9kZSA9IC8qKiBAdHlwZSB7Tm9kZX0gKi8gKGdldF9maXJzdF9jaGlsZChub2RlKSk7XG5cdFx0fVxuXG5cdFx0dmFyIGNsb25lID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChcblx0XHRcdHVzZV9pbXBvcnRfbm9kZSB8fCBpc19maXJlZm94ID8gZG9jdW1lbnQuaW1wb3J0Tm9kZShub2RlLCB0cnVlKSA6IG5vZGUuY2xvbmVOb2RlKHRydWUpXG5cdFx0KTtcblxuXHRcdGlmIChpc19mcmFnbWVudCkge1xuXHRcdFx0dmFyIHN0YXJ0ID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChnZXRfZmlyc3RfY2hpbGQoY2xvbmUpKTtcblx0XHRcdHZhciBlbmQgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGNsb25lLmxhc3RDaGlsZCk7XG5cblx0XHRcdGFzc2lnbl9ub2RlcyhzdGFydCwgZW5kKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzaWduX25vZGVzKGNsb25lLCBjbG9uZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNsb25lO1xuXHR9O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7KCkgPT4gRWxlbWVudCB8IERvY3VtZW50RnJhZ21lbnR9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoX3NjcmlwdChmbikge1xuXHRyZXR1cm4gKCkgPT4gcnVuX3NjcmlwdHMoZm4oKSk7XG59XG5cbi8qKlxuICogQ3JlYXRpbmcgYSBkb2N1bWVudCBmcmFnbWVudCBmcm9tIEhUTUwgdGhhdCBjb250YWlucyBzY3JpcHQgdGFncyB3aWxsIG5vdCBleGVjdXRlXG4gKiB0aGUgc2NyaXB0cy4gV2UgbmVlZCB0byByZXBsYWNlIHRoZSBzY3JpcHQgdGFncyB3aXRoIG5ldyBvbmVzIHNvIHRoYXQgdGhleSBhcmUgZXhlY3V0ZWQuXG4gKiBAcGFyYW0ge0VsZW1lbnQgfCBEb2N1bWVudEZyYWdtZW50fSBub2RlXG4gKiBAcmV0dXJucyB7Tm9kZSB8IE5vZGVbXX1cbiAqL1xuZnVuY3Rpb24gcnVuX3NjcmlwdHMobm9kZSkge1xuXHQvLyBzY3JpcHRzIHdlcmUgU1NSJ2QsIGluIHdoaWNoIGNhc2UgdGhleSB3aWxsIHJ1blxuXHRpZiAoaHlkcmF0aW5nKSByZXR1cm4gbm9kZTtcblxuXHRjb25zdCBpc19mcmFnbWVudCA9IG5vZGUubm9kZVR5cGUgPT09IERPQ1VNRU5UX0ZSQUdNRU5UX05PREU7XG5cdGNvbnN0IHNjcmlwdHMgPVxuXHRcdC8qKiBAdHlwZSB7SFRNTEVsZW1lbnR9ICovIChub2RlKS50YWdOYW1lID09PSAnU0NSSVBUJ1xuXHRcdFx0PyBbLyoqIEB0eXBlIHtIVE1MU2NyaXB0RWxlbWVudH0gKi8gKG5vZGUpXVxuXHRcdFx0OiBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJ3NjcmlwdCcpO1xuXHRjb25zdCBlZmZlY3QgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpO1xuXG5cdGZvciAoY29uc3Qgc2NyaXB0IG9mIHNjcmlwdHMpIHtcblx0XHRjb25zdCBjbG9uZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXHRcdGZvciAodmFyIGF0dHJpYnV0ZSBvZiBzY3JpcHQuYXR0cmlidXRlcykge1xuXHRcdFx0Y2xvbmUuc2V0QXR0cmlidXRlKGF0dHJpYnV0ZS5uYW1lLCBhdHRyaWJ1dGUudmFsdWUpO1xuXHRcdH1cblxuXHRcdGNsb25lLnRleHRDb250ZW50ID0gc2NyaXB0LnRleHRDb250ZW50O1xuXG5cdFx0Ly8gVGhlIHNjcmlwdCBoYXMgY2hhbmdlZCAtIGlmIGl0J3MgYXQgdGhlIGVkZ2VzLCB0aGUgZWZmZWN0IG5vdyBwb2ludHMgYXQgZGVhZCBub2Rlc1xuXHRcdGlmIChpc19mcmFnbWVudCA/IG5vZGUuZmlyc3RDaGlsZCA9PT0gc2NyaXB0IDogbm9kZSA9PT0gc2NyaXB0KSB7XG5cdFx0XHRlZmZlY3Qubm9kZXNfc3RhcnQgPSBjbG9uZTtcblx0XHR9XG5cdFx0aWYgKGlzX2ZyYWdtZW50ID8gbm9kZS5sYXN0Q2hpbGQgPT09IHNjcmlwdCA6IG5vZGUgPT09IHNjcmlwdCkge1xuXHRcdFx0ZWZmZWN0Lm5vZGVzX2VuZCA9IGNsb25lO1xuXHRcdH1cblxuXHRcdHNjcmlwdC5yZXBsYWNlV2l0aChjbG9uZSk7XG5cdH1cblx0cmV0dXJuIG5vZGU7XG59XG5cbi8qKlxuICogRG9uJ3QgbWFyayB0aGlzIGFzIHNpZGUtZWZmZWN0LWZyZWUsIGh5ZHJhdGlvbiBuZWVkcyB0byB3YWxrIGFsbCBub2Rlc1xuICogQHBhcmFtIHthbnl9IHZhbHVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXh0KHZhbHVlID0gJycpIHtcblx0aWYgKCFoeWRyYXRpbmcpIHtcblx0XHR2YXIgdCA9IGNyZWF0ZV90ZXh0KHZhbHVlICsgJycpO1xuXHRcdGFzc2lnbl9ub2Rlcyh0LCB0KTtcblx0XHRyZXR1cm4gdDtcblx0fVxuXG5cdHZhciBub2RlID0gaHlkcmF0ZV9ub2RlO1xuXG5cdGlmIChub2RlLm5vZGVUeXBlICE9PSBURVhUX05PREUpIHtcblx0XHQvLyBpZiBhbiB7ZXhwcmVzc2lvbn0gaXMgZW1wdHkgZHVyaW5nIFNTUiwgd2UgbmVlZCB0byBpbnNlcnQgYW4gZW1wdHkgdGV4dCBub2RlXG5cdFx0bm9kZS5iZWZvcmUoKG5vZGUgPSBjcmVhdGVfdGV4dCgpKSk7XG5cdFx0c2V0X2h5ZHJhdGVfbm9kZShub2RlKTtcblx0fVxuXG5cdGFzc2lnbl9ub2Rlcyhub2RlLCBub2RlKTtcblx0cmV0dXJuIG5vZGU7XG59XG5cbi8qKlxuICogQHJldHVybnMge1RlbXBsYXRlTm9kZSB8IERvY3VtZW50RnJhZ21lbnR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21tZW50KCkge1xuXHQvLyB3ZSdyZSBub3QgZGVsZWdhdGluZyB0byBgdGVtcGxhdGVgIGhlcmUgZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnNcblx0aWYgKGh5ZHJhdGluZykge1xuXHRcdGFzc2lnbl9ub2RlcyhoeWRyYXRlX25vZGUsIG51bGwpO1xuXHRcdHJldHVybiBoeWRyYXRlX25vZGU7XG5cdH1cblxuXHR2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0dmFyIHN0YXJ0ID0gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCgnJyk7XG5cdHZhciBhbmNob3IgPSBjcmVhdGVfdGV4dCgpO1xuXHRmcmFnLmFwcGVuZChzdGFydCwgYW5jaG9yKTtcblxuXHRhc3NpZ25fbm9kZXMoc3RhcnQsIGFuY2hvcik7XG5cblx0cmV0dXJuIGZyYWc7XG59XG5cbi8qKlxuICogQXNzaWduIHRoZSBjcmVhdGVkIChvciBpbiBoeWRyYXRpb24gbW9kZSwgdHJhdmVyc2VkKSBkb20gZWxlbWVudHMgdG8gdGhlIGN1cnJlbnQgYmxvY2tcbiAqIGFuZCBpbnNlcnQgdGhlIGVsZW1lbnRzIGludG8gdGhlIGRvbSAoaW4gY2xpZW50IG1vZGUpLlxuICogQHBhcmFtIHtUZXh0IHwgQ29tbWVudCB8IEVsZW1lbnR9IGFuY2hvclxuICogQHBhcmFtIHtEb2N1bWVudEZyYWdtZW50IHwgRWxlbWVudH0gZG9tXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBlbmQoYW5jaG9yLCBkb20pIHtcblx0aWYgKGh5ZHJhdGluZykge1xuXHRcdHZhciBlZmZlY3QgPSAvKiogQHR5cGUge0VmZmVjdH0gKi8gKGFjdGl2ZV9lZmZlY3QpO1xuXHRcdC8vIFdoZW4gaHlkcmF0aW5nIGFuZCBvdXRlciBjb21wb25lbnQgYW5kIGFuIGlubmVyIGNvbXBvbmVudCBpcyBhc3luYywgaS5lLiBibG9ja2VkIG9uIGEgcHJvbWlzZSxcblx0XHQvLyB0aGVuIGJ5IHRoZSB0aW1lIHRoZSBpbm5lciByZXNvbHZlcyB3ZSBoYXZlIGFscmVhZHkgYWR2YW5jZWQgdG8gdGhlIGVuZCBvZiB0aGUgaHlkcmF0ZWQgbm9kZXNcblx0XHQvLyBvZiB0aGUgcGFyZW50IGNvbXBvbmVudC4gQ2hlY2sgZm9yIGRlZmluZWQgZm9yIHRoYXQgcmVhc29uIHRvIGF2b2lkIHJld2luZGluZyB0aGUgcGFyZW50J3MgZW5kIG1hcmtlci5cblx0XHRpZiAoKGVmZmVjdC5mICYgRUZGRUNUX1JBTikgPT09IDAgfHwgZWZmZWN0Lm5vZGVzX2VuZCA9PT0gbnVsbCkge1xuXHRcdFx0ZWZmZWN0Lm5vZGVzX2VuZCA9IGh5ZHJhdGVfbm9kZTtcblx0XHR9XG5cdFx0aHlkcmF0ZV9uZXh0KCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGFuY2hvciA9PT0gbnVsbCkge1xuXHRcdC8vIGVkZ2UgY2FzZSDigJQgdm9pZCBgPHN2ZWx0ZTplbGVtZW50PmAgd2l0aCBjb250ZW50XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YW5jaG9yLmJlZm9yZSgvKiogQHR5cGUge05vZGV9ICovIChkb20pKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgKG9yIGh5ZHJhdGUpIGFuIHVuaXF1ZSBVSUQgZm9yIHRoZSBjb21wb25lbnQgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9wc19pZCgpIHtcblx0aWYgKFxuXHRcdGh5ZHJhdGluZyAmJlxuXHRcdGh5ZHJhdGVfbm9kZSAmJlxuXHRcdGh5ZHJhdGVfbm9kZS5ub2RlVHlwZSA9PT0gQ09NTUVOVF9OT0RFICYmXG5cdFx0aHlkcmF0ZV9ub2RlLnRleHRDb250ZW50Py5zdGFydHNXaXRoKGAkYClcblx0KSB7XG5cdFx0Y29uc3QgaWQgPSBoeWRyYXRlX25vZGUudGV4dENvbnRlbnQuc3Vic3RyaW5nKDEpO1xuXHRcdGh5ZHJhdGVfbmV4dCgpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3IgVGhpcyB3YXkgd2UgZW5zdXJlIHRoZSBpZCBpcyB1bmlxdWUgZXZlbiBhY3Jvc3MgU3ZlbHRlIHJ1bnRpbWVzXG5cdCh3aW5kb3cuX19zdmVsdGUgPz89IHt9KS51aWQgPz89IDE7XG5cblx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRyZXR1cm4gYGMke3dpbmRvdy5fX3N2ZWx0ZS51aWQrK31gO1xufVxuIiwiY29uc3QgcmVnZXhfcmV0dXJuX2NoYXJhY3RlcnMgPSAvXFxyL2c7XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHN0clxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc2goc3RyKSB7XG5cdHN0ciA9IHN0ci5yZXBsYWNlKHJlZ2V4X3JldHVybl9jaGFyYWN0ZXJzLCAnJyk7XG5cdGxldCBoYXNoID0gNTM4MTtcblx0bGV0IGkgPSBzdHIubGVuZ3RoO1xuXG5cdHdoaWxlIChpLS0pIGhhc2ggPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSBeIHN0ci5jaGFyQ29kZUF0KGkpO1xuXHRyZXR1cm4gKGhhc2ggPj4+IDApLnRvU3RyaW5nKDM2KTtcbn1cblxuY29uc3QgVk9JRF9FTEVNRU5UX05BTUVTID0gW1xuXHQnYXJlYScsXG5cdCdiYXNlJyxcblx0J2JyJyxcblx0J2NvbCcsXG5cdCdjb21tYW5kJyxcblx0J2VtYmVkJyxcblx0J2hyJyxcblx0J2ltZycsXG5cdCdpbnB1dCcsXG5cdCdrZXlnZW4nLFxuXHQnbGluaycsXG5cdCdtZXRhJyxcblx0J3BhcmFtJyxcblx0J3NvdXJjZScsXG5cdCd0cmFjaycsXG5cdCd3YnInXG5dO1xuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIGlmIGBuYW1lYCBpcyBvZiBhIHZvaWQgZWxlbWVudFxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzX3ZvaWQobmFtZSkge1xuXHRyZXR1cm4gVk9JRF9FTEVNRU5UX05BTUVTLmluY2x1ZGVzKG5hbWUpIHx8IG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJyFkb2N0eXBlJztcbn1cblxuY29uc3QgUkVTRVJWRURfV09SRFMgPSBbXG5cdCdhcmd1bWVudHMnLFxuXHQnYXdhaXQnLFxuXHQnYnJlYWsnLFxuXHQnY2FzZScsXG5cdCdjYXRjaCcsXG5cdCdjbGFzcycsXG5cdCdjb25zdCcsXG5cdCdjb250aW51ZScsXG5cdCdkZWJ1Z2dlcicsXG5cdCdkZWZhdWx0Jyxcblx0J2RlbGV0ZScsXG5cdCdkbycsXG5cdCdlbHNlJyxcblx0J2VudW0nLFxuXHQnZXZhbCcsXG5cdCdleHBvcnQnLFxuXHQnZXh0ZW5kcycsXG5cdCdmYWxzZScsXG5cdCdmaW5hbGx5Jyxcblx0J2ZvcicsXG5cdCdmdW5jdGlvbicsXG5cdCdpZicsXG5cdCdpbXBsZW1lbnRzJyxcblx0J2ltcG9ydCcsXG5cdCdpbicsXG5cdCdpbnN0YW5jZW9mJyxcblx0J2ludGVyZmFjZScsXG5cdCdsZXQnLFxuXHQnbmV3Jyxcblx0J251bGwnLFxuXHQncGFja2FnZScsXG5cdCdwcml2YXRlJyxcblx0J3Byb3RlY3RlZCcsXG5cdCdwdWJsaWMnLFxuXHQncmV0dXJuJyxcblx0J3N0YXRpYycsXG5cdCdzdXBlcicsXG5cdCdzd2l0Y2gnLFxuXHQndGhpcycsXG5cdCd0aHJvdycsXG5cdCd0cnVlJyxcblx0J3RyeScsXG5cdCd0eXBlb2YnLFxuXHQndmFyJyxcblx0J3ZvaWQnLFxuXHQnd2hpbGUnLFxuXHQnd2l0aCcsXG5cdCd5aWVsZCdcbl07XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgaWYgYHdvcmRgIGlzIGEgcmVzZXJ2ZWQgSmF2YVNjcmlwdCBrZXl3b3JkXG4gKiBAcGFyYW0ge3N0cmluZ30gd29yZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNfcmVzZXJ2ZWQod29yZCkge1xuXHRyZXR1cm4gUkVTRVJWRURfV09SRFMuaW5jbHVkZXMod29yZCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzX2NhcHR1cmVfZXZlbnQobmFtZSkge1xuXHRyZXR1cm4gbmFtZS5lbmRzV2l0aCgnY2FwdHVyZScpICYmIG5hbWUgIT09ICdnb3Rwb2ludGVyY2FwdHVyZScgJiYgbmFtZSAhPT0gJ2xvc3Rwb2ludGVyY2FwdHVyZSc7XG59XG5cbi8qKiBMaXN0IG9mIEVsZW1lbnQgZXZlbnRzIHRoYXQgd2lsbCBiZSBkZWxlZ2F0ZWQgKi9cbmNvbnN0IERFTEVHQVRFRF9FVkVOVFMgPSBbXG5cdCdiZWZvcmVpbnB1dCcsXG5cdCdjbGljaycsXG5cdCdjaGFuZ2UnLFxuXHQnZGJsY2xpY2snLFxuXHQnY29udGV4dG1lbnUnLFxuXHQnZm9jdXNpbicsXG5cdCdmb2N1c291dCcsXG5cdCdpbnB1dCcsXG5cdCdrZXlkb3duJyxcblx0J2tleXVwJyxcblx0J21vdXNlZG93bicsXG5cdCdtb3VzZW1vdmUnLFxuXHQnbW91c2VvdXQnLFxuXHQnbW91c2VvdmVyJyxcblx0J21vdXNldXAnLFxuXHQncG9pbnRlcmRvd24nLFxuXHQncG9pbnRlcm1vdmUnLFxuXHQncG9pbnRlcm91dCcsXG5cdCdwb2ludGVyb3ZlcicsXG5cdCdwb2ludGVydXAnLFxuXHQndG91Y2hlbmQnLFxuXHQndG91Y2htb3ZlJyxcblx0J3RvdWNoc3RhcnQnXG5dO1xuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIGlmIGBldmVudF9uYW1lYCBpcyBhIGRlbGVnYXRlZCBldmVudFxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50X25hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbl9kZWxlZ2F0ZV9ldmVudChldmVudF9uYW1lKSB7XG5cdHJldHVybiBERUxFR0FURURfRVZFTlRTLmluY2x1ZGVzKGV2ZW50X25hbWUpO1xufVxuXG4vKipcbiAqIEF0dHJpYnV0ZXMgdGhhdCBhcmUgYm9vbGVhbiwgaS5lLiB0aGV5IGFyZSBwcmVzZW50IG9yIG5vdCBwcmVzZW50LlxuICovXG5jb25zdCBET01fQk9PTEVBTl9BVFRSSUJVVEVTID0gW1xuXHQnYWxsb3dmdWxsc2NyZWVuJyxcblx0J2FzeW5jJyxcblx0J2F1dG9mb2N1cycsXG5cdCdhdXRvcGxheScsXG5cdCdjaGVja2VkJyxcblx0J2NvbnRyb2xzJyxcblx0J2RlZmF1bHQnLFxuXHQnZGlzYWJsZWQnLFxuXHQnZm9ybW5vdmFsaWRhdGUnLFxuXHQnaW5kZXRlcm1pbmF0ZScsXG5cdCdpbmVydCcsXG5cdCdpc21hcCcsXG5cdCdsb29wJyxcblx0J211bHRpcGxlJyxcblx0J211dGVkJyxcblx0J25vbW9kdWxlJyxcblx0J25vdmFsaWRhdGUnLFxuXHQnb3BlbicsXG5cdCdwbGF5c2lubGluZScsXG5cdCdyZWFkb25seScsXG5cdCdyZXF1aXJlZCcsXG5cdCdyZXZlcnNlZCcsXG5cdCdzZWFtbGVzcycsXG5cdCdzZWxlY3RlZCcsXG5cdCd3ZWJraXRkaXJlY3RvcnknLFxuXHQnZGVmZXInLFxuXHQnZGlzYWJsZXBpY3R1cmVpbnBpY3R1cmUnLFxuXHQnZGlzYWJsZXJlbW90ZXBsYXliYWNrJ1xuXTtcblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCBpZiBgbmFtZWAgaXMgYSBib29sZWFuIGF0dHJpYnV0ZVxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzX2Jvb2xlYW5fYXR0cmlidXRlKG5hbWUpIHtcblx0cmV0dXJuIERPTV9CT09MRUFOX0FUVFJJQlVURVMuaW5jbHVkZXMobmFtZSk7XG59XG5cbi8qKlxuICogQHR5cGUge1JlY29yZDxzdHJpbmcsIHN0cmluZz59XG4gKiBMaXN0IG9mIGF0dHJpYnV0ZSBuYW1lcyB0aGF0IHNob3VsZCBiZSBhbGlhc2VkIHRvIHRoZWlyIHByb3BlcnR5IG5hbWVzXG4gKiBiZWNhdXNlIHRoZXkgYmVoYXZlIGRpZmZlcmVudGx5IGJldHdlZW4gc2V0dGluZyB0aGVtIGFzIGFuIGF0dHJpYnV0ZSBhbmRcbiAqIHNldHRpbmcgdGhlbSBhcyBhIHByb3BlcnR5LlxuICovXG5jb25zdCBBVFRSSUJVVEVfQUxJQVNFUyA9IHtcblx0Ly8gbm8gYGNsYXNzOiAnY2xhc3NOYW1lJ2AgYmVjYXVzZSB3ZSBoYW5kbGUgdGhhdCBzZXBhcmF0ZWx5XG5cdGZvcm1ub3ZhbGlkYXRlOiAnZm9ybU5vVmFsaWRhdGUnLFxuXHRpc21hcDogJ2lzTWFwJyxcblx0bm9tb2R1bGU6ICdub01vZHVsZScsXG5cdHBsYXlzaW5saW5lOiAncGxheXNJbmxpbmUnLFxuXHRyZWFkb25seTogJ3JlYWRPbmx5Jyxcblx0ZGVmYXVsdHZhbHVlOiAnZGVmYXVsdFZhbHVlJyxcblx0ZGVmYXVsdGNoZWNrZWQ6ICdkZWZhdWx0Q2hlY2tlZCcsXG5cdHNyY29iamVjdDogJ3NyY09iamVjdCcsXG5cdG5vdmFsaWRhdGU6ICdub1ZhbGlkYXRlJyxcblx0YWxsb3dmdWxsc2NyZWVuOiAnYWxsb3dGdWxsc2NyZWVuJyxcblx0ZGlzYWJsZXBpY3R1cmVpbnBpY3R1cmU6ICdkaXNhYmxlUGljdHVyZUluUGljdHVyZScsXG5cdGRpc2FibGVyZW1vdGVwbGF5YmFjazogJ2Rpc2FibGVSZW1vdGVQbGF5YmFjaydcbn07XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZV9hdHRyaWJ1dGUobmFtZSkge1xuXHRuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRyZXR1cm4gQVRUUklCVVRFX0FMSUFTRVNbbmFtZV0gPz8gbmFtZTtcbn1cblxuY29uc3QgRE9NX1BST1BFUlRJRVMgPSBbXG5cdC4uLkRPTV9CT09MRUFOX0FUVFJJQlVURVMsXG5cdCdmb3JtTm9WYWxpZGF0ZScsXG5cdCdpc01hcCcsXG5cdCdub01vZHVsZScsXG5cdCdwbGF5c0lubGluZScsXG5cdCdyZWFkT25seScsXG5cdCd2YWx1ZScsXG5cdCd2b2x1bWUnLFxuXHQnZGVmYXVsdFZhbHVlJyxcblx0J2RlZmF1bHRDaGVja2VkJyxcblx0J3NyY09iamVjdCcsXG5cdCdub1ZhbGlkYXRlJyxcblx0J2FsbG93RnVsbHNjcmVlbicsXG5cdCdkaXNhYmxlUGljdHVyZUluUGljdHVyZScsXG5cdCdkaXNhYmxlUmVtb3RlUGxheWJhY2snXG5dO1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19kb21fcHJvcGVydHkobmFtZSkge1xuXHRyZXR1cm4gRE9NX1BST1BFUlRJRVMuaW5jbHVkZXMobmFtZSk7XG59XG5cbmNvbnN0IE5PTl9TVEFUSUNfUFJPUEVSVElFUyA9IFsnYXV0b2ZvY3VzJywgJ211dGVkJywgJ2RlZmF1bHRWYWx1ZScsICdkZWZhdWx0Q2hlY2tlZCddO1xuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBnaXZlbiBhdHRyaWJ1dGUgY2Fubm90IGJlIHNldCB0aHJvdWdoIHRoZSB0ZW1wbGF0ZVxuICogc3RyaW5nLCBpLmUuIG5lZWRzIHNvbWUga2luZCBvZiBKYXZhU2NyaXB0IGhhbmRsaW5nIHRvIHdvcmsuXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fubm90X2JlX3NldF9zdGF0aWNhbGx5KG5hbWUpIHtcblx0cmV0dXJuIE5PTl9TVEFUSUNfUFJPUEVSVElFUy5pbmNsdWRlcyhuYW1lKTtcbn1cblxuLyoqXG4gKiBTdWJzZXQgb2YgZGVsZWdhdGVkIGV2ZW50cyB3aGljaCBzaG91bGQgYmUgcGFzc2l2ZSBieSBkZWZhdWx0LlxuICogVGhlc2UgdHdvIGFyZSBhbHJlYWR5IHBhc3NpdmUgdmlhIGJyb3dzZXIgZGVmYXVsdHMgb24gd2luZG93LCBkb2N1bWVudCBhbmQgYm9keS5cbiAqIEJ1dCBzaW5jZVxuICogLSB3ZSdyZSBkZWxlZ2F0aW5nIHRoZW1cbiAqIC0gdGhleSBoYXBwZW4gb2Z0ZW5cbiAqIC0gdGhleSBhcHBseSB0byBtb2JpbGUgd2hpY2ggaXMgZ2VuZXJhbGx5IGxlc3MgcGVyZm9ybWFudFxuICogd2UncmUgbWFya2luZyB0aGVtIGFzIHBhc3NpdmUgYnkgZGVmYXVsdCBmb3Igb3RoZXIgZWxlbWVudHMsIHRvby5cbiAqL1xuY29uc3QgUEFTU0lWRV9FVkVOVFMgPSBbJ3RvdWNoc3RhcnQnLCAndG91Y2htb3ZlJ107XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgaWYgYG5hbWVgIGlzIGEgcGFzc2l2ZSBldmVudFxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzX3Bhc3NpdmVfZXZlbnQobmFtZSkge1xuXHRyZXR1cm4gUEFTU0lWRV9FVkVOVFMuaW5jbHVkZXMobmFtZSk7XG59XG5cbmNvbnN0IENPTlRFTlRfRURJVEFCTEVfQklORElOR1MgPSBbJ3RleHRDb250ZW50JywgJ2lubmVySFRNTCcsICdpbm5lclRleHQnXTtcblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBuYW1lICovXG5leHBvcnQgZnVuY3Rpb24gaXNfY29udGVudF9lZGl0YWJsZV9iaW5kaW5nKG5hbWUpIHtcblx0cmV0dXJuIENPTlRFTlRfRURJVEFCTEVfQklORElOR1MuaW5jbHVkZXMobmFtZSk7XG59XG5cbmNvbnN0IExPQURfRVJST1JfRUxFTUVOVFMgPSBbXG5cdCdib2R5Jyxcblx0J2VtYmVkJyxcblx0J2lmcmFtZScsXG5cdCdpbWcnLFxuXHQnbGluaycsXG5cdCdvYmplY3QnLFxuXHQnc2NyaXB0Jyxcblx0J3N0eWxlJyxcblx0J3RyYWNrJ1xuXTtcblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZWxlbWVudCBlbWl0cyBgbG9hZGAgYW5kIGBlcnJvcmAgZXZlbnRzXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNfbG9hZF9lcnJvcl9lbGVtZW50KG5hbWUpIHtcblx0cmV0dXJuIExPQURfRVJST1JfRUxFTUVOVFMuaW5jbHVkZXMobmFtZSk7XG59XG5cbmNvbnN0IFNWR19FTEVNRU5UUyA9IFtcblx0J2FsdEdseXBoJyxcblx0J2FsdEdseXBoRGVmJyxcblx0J2FsdEdseXBoSXRlbScsXG5cdCdhbmltYXRlJyxcblx0J2FuaW1hdGVDb2xvcicsXG5cdCdhbmltYXRlTW90aW9uJyxcblx0J2FuaW1hdGVUcmFuc2Zvcm0nLFxuXHQnY2lyY2xlJyxcblx0J2NsaXBQYXRoJyxcblx0J2NvbG9yLXByb2ZpbGUnLFxuXHQnY3Vyc29yJyxcblx0J2RlZnMnLFxuXHQnZGVzYycsXG5cdCdkaXNjYXJkJyxcblx0J2VsbGlwc2UnLFxuXHQnZmVCbGVuZCcsXG5cdCdmZUNvbG9yTWF0cml4Jyxcblx0J2ZlQ29tcG9uZW50VHJhbnNmZXInLFxuXHQnZmVDb21wb3NpdGUnLFxuXHQnZmVDb252b2x2ZU1hdHJpeCcsXG5cdCdmZURpZmZ1c2VMaWdodGluZycsXG5cdCdmZURpc3BsYWNlbWVudE1hcCcsXG5cdCdmZURpc3RhbnRMaWdodCcsXG5cdCdmZURyb3BTaGFkb3cnLFxuXHQnZmVGbG9vZCcsXG5cdCdmZUZ1bmNBJyxcblx0J2ZlRnVuY0InLFxuXHQnZmVGdW5jRycsXG5cdCdmZUZ1bmNSJyxcblx0J2ZlR2F1c3NpYW5CbHVyJyxcblx0J2ZlSW1hZ2UnLFxuXHQnZmVNZXJnZScsXG5cdCdmZU1lcmdlTm9kZScsXG5cdCdmZU1vcnBob2xvZ3knLFxuXHQnZmVPZmZzZXQnLFxuXHQnZmVQb2ludExpZ2h0Jyxcblx0J2ZlU3BlY3VsYXJMaWdodGluZycsXG5cdCdmZVNwb3RMaWdodCcsXG5cdCdmZVRpbGUnLFxuXHQnZmVUdXJidWxlbmNlJyxcblx0J2ZpbHRlcicsXG5cdCdmb250Jyxcblx0J2ZvbnQtZmFjZScsXG5cdCdmb250LWZhY2UtZm9ybWF0Jyxcblx0J2ZvbnQtZmFjZS1uYW1lJyxcblx0J2ZvbnQtZmFjZS1zcmMnLFxuXHQnZm9udC1mYWNlLXVyaScsXG5cdCdmb3JlaWduT2JqZWN0Jyxcblx0J2cnLFxuXHQnZ2x5cGgnLFxuXHQnZ2x5cGhSZWYnLFxuXHQnaGF0Y2gnLFxuXHQnaGF0Y2hwYXRoJyxcblx0J2hrZXJuJyxcblx0J2ltYWdlJyxcblx0J2xpbmUnLFxuXHQnbGluZWFyR3JhZGllbnQnLFxuXHQnbWFya2VyJyxcblx0J21hc2snLFxuXHQnbWVzaCcsXG5cdCdtZXNoZ3JhZGllbnQnLFxuXHQnbWVzaHBhdGNoJyxcblx0J21lc2hyb3cnLFxuXHQnbWV0YWRhdGEnLFxuXHQnbWlzc2luZy1nbHlwaCcsXG5cdCdtcGF0aCcsXG5cdCdwYXRoJyxcblx0J3BhdHRlcm4nLFxuXHQncG9seWdvbicsXG5cdCdwb2x5bGluZScsXG5cdCdyYWRpYWxHcmFkaWVudCcsXG5cdCdyZWN0Jyxcblx0J3NldCcsXG5cdCdzb2xpZGNvbG9yJyxcblx0J3N0b3AnLFxuXHQnc3ZnJyxcblx0J3N3aXRjaCcsXG5cdCdzeW1ib2wnLFxuXHQndGV4dCcsXG5cdCd0ZXh0UGF0aCcsXG5cdCd0cmVmJyxcblx0J3RzcGFuJyxcblx0J3Vua25vd24nLFxuXHQndXNlJyxcblx0J3ZpZXcnLFxuXHQndmtlcm4nXG5dO1xuXG4vKiogQHBhcmFtIHtzdHJpbmd9IG5hbWUgKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19zdmcobmFtZSkge1xuXHRyZXR1cm4gU1ZHX0VMRU1FTlRTLmluY2x1ZGVzKG5hbWUpO1xufVxuXG5jb25zdCBNQVRITUxfRUxFTUVOVFMgPSBbXG5cdCdhbm5vdGF0aW9uJyxcblx0J2Fubm90YXRpb24teG1sJyxcblx0J21hY3Rpb24nLFxuXHQnbWF0aCcsXG5cdCdtZXJyb3InLFxuXHQnbWZyYWMnLFxuXHQnbWknLFxuXHQnbW11bHRpc2NyaXB0cycsXG5cdCdtbicsXG5cdCdtbycsXG5cdCdtb3ZlcicsXG5cdCdtcGFkZGVkJyxcblx0J21waGFudG9tJyxcblx0J21wcmVzY3JpcHRzJyxcblx0J21yb290Jyxcblx0J21yb3cnLFxuXHQnbXMnLFxuXHQnbXNwYWNlJyxcblx0J21zcXJ0Jyxcblx0J21zdHlsZScsXG5cdCdtc3ViJyxcblx0J21zdWJzdXAnLFxuXHQnbXN1cCcsXG5cdCdtdGFibGUnLFxuXHQnbXRkJyxcblx0J210ZXh0Jyxcblx0J210cicsXG5cdCdtdW5kZXInLFxuXHQnbXVuZGVyb3ZlcicsXG5cdCdzZW1hbnRpY3MnXG5dO1xuXG4vKiogQHBhcmFtIHtzdHJpbmd9IG5hbWUgKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19tYXRobWwobmFtZSkge1xuXHRyZXR1cm4gTUFUSE1MX0VMRU1FTlRTLmluY2x1ZGVzKG5hbWUpO1xufVxuXG5jb25zdCBTVEFURV9DUkVBVElPTl9SVU5FUyA9IC8qKiBAdHlwZSB7Y29uc3R9ICovIChbXG5cdCckc3RhdGUnLFxuXHQnJHN0YXRlLnJhdycsXG5cdCckZGVyaXZlZCcsXG5cdCckZGVyaXZlZC5ieSdcbl0pO1xuXG5jb25zdCBSVU5FUyA9IC8qKiBAdHlwZSB7Y29uc3R9ICovIChbXG5cdC4uLlNUQVRFX0NSRUFUSU9OX1JVTkVTLFxuXHQnJHN0YXRlLmVhZ2VyJyxcblx0JyRzdGF0ZS5zbmFwc2hvdCcsXG5cdCckcHJvcHMnLFxuXHQnJHByb3BzLmlkJyxcblx0JyRiaW5kYWJsZScsXG5cdCckZWZmZWN0Jyxcblx0JyRlZmZlY3QucHJlJyxcblx0JyRlZmZlY3QudHJhY2tpbmcnLFxuXHQnJGVmZmVjdC5yb290Jyxcblx0JyRlZmZlY3QucGVuZGluZycsXG5cdCckaW5zcGVjdCcsXG5cdCckaW5zcGVjdCgpLndpdGgnLFxuXHQnJGluc3BlY3QudHJhY2UnLFxuXHQnJGhvc3QnXG5dKTtcblxuLyoqIEB0eXBlZGVmIHt0eXBlb2YgUlVORVNbbnVtYmVyXX0gUnVuZU5hbWUgKi9cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge25hbWUgaXMgUnVuZU5hbWV9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19ydW5lKG5hbWUpIHtcblx0cmV0dXJuIFJVTkVTLmluY2x1ZGVzKC8qKiBAdHlwZSB7UnVuZU5hbWV9ICovIChuYW1lKSk7XG59XG5cbi8qKiBAdHlwZWRlZiB7dHlwZW9mIFNUQVRFX0NSRUFUSU9OX1JVTkVTW251bWJlcl19IFN0YXRlQ3JlYXRpb25SdW5lTmFtZSAqL1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJucyB7bmFtZSBpcyBTdGF0ZUNyZWF0aW9uUnVuZU5hbWV9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc19zdGF0ZV9jcmVhdGlvbl9ydW5lKG5hbWUpIHtcblx0cmV0dXJuIFNUQVRFX0NSRUFUSU9OX1JVTkVTLmluY2x1ZGVzKC8qKiBAdHlwZSB7U3RhdGVDcmVhdGlvblJ1bmVOYW1lfSAqLyAobmFtZSkpO1xufVxuXG4vKiogTGlzdCBvZiBlbGVtZW50cyB0aGF0IHJlcXVpcmUgcmF3IGNvbnRlbnRzIGFuZCBzaG91bGQgbm90IGhhdmUgU1NSIGNvbW1lbnRzIHB1dCBpbiB0aGVtICovXG5jb25zdCBSQVdfVEVYVF9FTEVNRU5UUyA9IC8qKiBAdHlwZSB7Y29uc3R9ICovIChbJ3RleHRhcmVhJywgJ3NjcmlwdCcsICdzdHlsZScsICd0aXRsZSddKTtcblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBuYW1lICovXG5leHBvcnQgZnVuY3Rpb24gaXNfcmF3X3RleHRfZWxlbWVudChuYW1lKSB7XG5cdHJldHVybiBSQVdfVEVYVF9FTEVNRU5UUy5pbmNsdWRlcygvKiogQHR5cGUge3R5cGVvZiBSQVdfVEVYVF9FTEVNRU5UU1tudW1iZXJdfSAqLyAobmFtZSkpO1xufVxuXG4vKipcbiAqIFByZXZlbnQgZGV2dG9vbHMgdHJ5aW5nIHRvIG1ha2UgYGxvY2F0aW9uYCBhIGNsaWNrYWJsZSBsaW5rIGJ5IGluc2VydGluZyBhIHplcm8td2lkdGggc3BhY2VcbiAqIEB0ZW1wbGF0ZSB7c3RyaW5nIHwgdW5kZWZpbmVkfSBUXG4gKiBAcGFyYW0ge1R9IGxvY2F0aW9uXG4gKiBAcmV0dXJucyB7VH07XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZV9sb2NhdGlvbihsb2NhdGlvbikge1xuXHRyZXR1cm4gLyoqIEB0eXBlIHtUfSAqLyAobG9jYXRpb24/LnJlcGxhY2UoL1xcLy9nLCAnL1xcdTIwMGInKSk7XG59XG4iLCIvKiogQGltcG9ydCB7IENvbXBvbmVudENvbnRleHQsIEVmZmVjdCwgVGVtcGxhdGVOb2RlIH0gZnJvbSAnI2NsaWVudCcgKi9cbi8qKiBAaW1wb3J0IHsgQ29tcG9uZW50LCBDb21wb25lbnRUeXBlLCBTdmVsdGVDb21wb25lbnQsIE1vdW50T3B0aW9ucyB9IGZyb20gJy4uLy4uL2luZGV4LmpzJyAqL1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQge1xuXHRjbGVhcl90ZXh0X2NvbnRlbnQsXG5cdGNyZWF0ZV90ZXh0LFxuXHRnZXRfZmlyc3RfY2hpbGQsXG5cdGdldF9uZXh0X3NpYmxpbmcsXG5cdGluaXRfb3BlcmF0aW9uc1xufSBmcm9tICcuL2RvbS9vcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IEhZRFJBVElPTl9FTkQsIEhZRFJBVElPTl9FUlJPUiwgSFlEUkFUSU9OX1NUQVJUIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGFjdGl2ZV9lZmZlY3QgfSBmcm9tICcuL3J1bnRpbWUuanMnO1xuaW1wb3J0IHsgcHVzaCwgcG9wLCBjb21wb25lbnRfY29udGV4dCB9IGZyb20gJy4vY29udGV4dC5qcyc7XG5pbXBvcnQgeyBjb21wb25lbnRfcm9vdCB9IGZyb20gJy4vcmVhY3Rpdml0eS9lZmZlY3RzLmpzJztcbmltcG9ydCB7IGh5ZHJhdGVfbm9kZSwgaHlkcmF0aW5nLCBzZXRfaHlkcmF0ZV9ub2RlLCBzZXRfaHlkcmF0aW5nIH0gZnJvbSAnLi9kb20vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7IGFycmF5X2Zyb20gfSBmcm9tICcuLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0YWxsX3JlZ2lzdGVyZWRfZXZlbnRzLFxuXHRoYW5kbGVfZXZlbnRfcHJvcGFnYXRpb24sXG5cdHJvb3RfZXZlbnRfaGFuZGxlc1xufSBmcm9tICcuL2RvbS9lbGVtZW50cy9ldmVudHMuanMnO1xuaW1wb3J0ICogYXMgdyBmcm9tICcuL3dhcm5pbmdzLmpzJztcbmltcG9ydCAqIGFzIGUgZnJvbSAnLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgYXNzaWduX25vZGVzIH0gZnJvbSAnLi9kb20vdGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgaXNfcGFzc2l2ZV9ldmVudCB9IGZyb20gJy4uLy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IENPTU1FTlRfTk9ERSwgU1RBVEVfU1lNQk9MIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgYm91bmRhcnkgfSBmcm9tICcuL2RvbS9ibG9ja3MvYm91bmRhcnkuanMnO1xuXG4vKipcbiAqIFRoaXMgaXMgbm9ybWFsbHkgdHJ1ZSDigJQgYmxvY2sgZWZmZWN0cyBzaG91bGQgcnVuIHRoZWlyIGludHJvIHRyYW5zaXRpb25zIOKAlFxuICogYnV0IGlzIGZhbHNlIGR1cmluZyBoeWRyYXRpb24gKHVubGVzcyBgb3B0aW9ucy5pbnRyb2AgaXMgYHRydWVgKSBhbmRcbiAqIHdoZW4gY3JlYXRpbmcgdGhlIGNoaWxkcmVuIG9mIGEgYDxzdmVsdGU6ZWxlbWVudD5gIHRoYXQganVzdCBjaGFuZ2VkIHRhZ1xuICovXG5leHBvcnQgbGV0IHNob3VsZF9pbnRybyA9IHRydWU7XG5cbi8qKiBAcGFyYW0ge2Jvb2xlYW59IHZhbHVlICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X3Nob3VsZF9pbnRybyh2YWx1ZSkge1xuXHRzaG91bGRfaW50cm8gPSB2YWx1ZTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IHRleHRcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfdGV4dCh0ZXh0LCB2YWx1ZSkge1xuXHQvLyBGb3Igb2JqZWN0cywgd2UgYXBwbHkgc3RyaW5nIGNvZXJjaW9uICh3aGljaCBtaWdodCBtYWtlIHRoaW5ncyBsaWtlICRzdGF0ZSBhcnJheSByZWZlcmVuY2VzIGluIHRoZSB0ZW1wbGF0ZSByZWFjdGl2ZSkgYmVmb3JlIGRpZmZpbmdcblx0dmFyIHN0ciA9IHZhbHVlID09IG51bGwgPyAnJyA6IHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyB2YWx1ZSArICcnIDogdmFsdWU7XG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0aWYgKHN0ciAhPT0gKHRleHQuX190ID8/PSB0ZXh0Lm5vZGVWYWx1ZSkpIHtcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0dGV4dC5fX3QgPSBzdHI7XG5cdFx0dGV4dC5ub2RlVmFsdWUgPSBzdHIgKyAnJztcblx0fVxufVxuXG4vKipcbiAqIE1vdW50cyBhIGNvbXBvbmVudCB0byB0aGUgZ2l2ZW4gdGFyZ2V0IGFuZCByZXR1cm5zIHRoZSBleHBvcnRzIGFuZCBwb3RlbnRpYWxseSB0aGUgcHJvcHMgKGlmIGNvbXBpbGVkIHdpdGggYGFjY2Vzc29yczogdHJ1ZWApIG9mIHRoZSBjb21wb25lbnQuXG4gKiBUcmFuc2l0aW9ucyB3aWxsIHBsYXkgZHVyaW5nIHRoZSBpbml0aWFsIHJlbmRlciB1bmxlc3MgdGhlIGBpbnRyb2Agb3B0aW9uIGlzIHNldCB0byBgZmFsc2VgLlxuICpcbiAqIEB0ZW1wbGF0ZSB7UmVjb3JkPHN0cmluZywgYW55Pn0gUHJvcHNcbiAqIEB0ZW1wbGF0ZSB7UmVjb3JkPHN0cmluZywgYW55Pn0gRXhwb3J0c1xuICogQHBhcmFtIHtDb21wb25lbnRUeXBlPFN2ZWx0ZUNvbXBvbmVudDxQcm9wcz4+IHwgQ29tcG9uZW50PFByb3BzLCBFeHBvcnRzLCBhbnk+fSBjb21wb25lbnRcbiAqIEBwYXJhbSB7TW91bnRPcHRpb25zPFByb3BzPn0gb3B0aW9uc1xuICogQHJldHVybnMge0V4cG9ydHN9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtb3VudChjb21wb25lbnQsIG9wdGlvbnMpIHtcblx0cmV0dXJuIF9tb3VudChjb21wb25lbnQsIG9wdGlvbnMpO1xufVxuXG4vKipcbiAqIEh5ZHJhdGVzIGEgY29tcG9uZW50IG9uIHRoZSBnaXZlbiB0YXJnZXQgYW5kIHJldHVybnMgdGhlIGV4cG9ydHMgYW5kIHBvdGVudGlhbGx5IHRoZSBwcm9wcyAoaWYgY29tcGlsZWQgd2l0aCBgYWNjZXNzb3JzOiB0cnVlYCkgb2YgdGhlIGNvbXBvbmVudFxuICpcbiAqIEB0ZW1wbGF0ZSB7UmVjb3JkPHN0cmluZywgYW55Pn0gUHJvcHNcbiAqIEB0ZW1wbGF0ZSB7UmVjb3JkPHN0cmluZywgYW55Pn0gRXhwb3J0c1xuICogQHBhcmFtIHtDb21wb25lbnRUeXBlPFN2ZWx0ZUNvbXBvbmVudDxQcm9wcz4+IHwgQ29tcG9uZW50PFByb3BzLCBFeHBvcnRzLCBhbnk+fSBjb21wb25lbnRcbiAqIEBwYXJhbSB7e30gZXh0ZW5kcyBQcm9wcyA/IHtcbiAqIFx0XHR0YXJnZXQ6IERvY3VtZW50IHwgRWxlbWVudCB8IFNoYWRvd1Jvb3Q7XG4gKiBcdFx0cHJvcHM/OiBQcm9wcztcbiAqIFx0XHRldmVudHM/OiBSZWNvcmQ8c3RyaW5nLCAoZTogYW55KSA9PiBhbnk+O1xuICogIFx0Y29udGV4dD86IE1hcDxhbnksIGFueT47XG4gKiBcdFx0aW50cm8/OiBib29sZWFuO1xuICogXHRcdHJlY292ZXI/OiBib29sZWFuO1xuICogXHR9IDoge1xuICogXHRcdHRhcmdldDogRG9jdW1lbnQgfCBFbGVtZW50IHwgU2hhZG93Um9vdDtcbiAqIFx0XHRwcm9wczogUHJvcHM7XG4gKiBcdFx0ZXZlbnRzPzogUmVjb3JkPHN0cmluZywgKGU6IGFueSkgPT4gYW55PjtcbiAqICBcdGNvbnRleHQ/OiBNYXA8YW55LCBhbnk+O1xuICogXHRcdGludHJvPzogYm9vbGVhbjtcbiAqIFx0XHRyZWNvdmVyPzogYm9vbGVhbjtcbiAqIFx0fX0gb3B0aW9uc1xuICogQHJldHVybnMge0V4cG9ydHN9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyYXRlKGNvbXBvbmVudCwgb3B0aW9ucykge1xuXHRpbml0X29wZXJhdGlvbnMoKTtcblx0b3B0aW9ucy5pbnRybyA9IG9wdGlvbnMuaW50cm8gPz8gZmFsc2U7XG5cdGNvbnN0IHRhcmdldCA9IG9wdGlvbnMudGFyZ2V0O1xuXHRjb25zdCB3YXNfaHlkcmF0aW5nID0gaHlkcmF0aW5nO1xuXHRjb25zdCBwcmV2aW91c19oeWRyYXRlX25vZGUgPSBoeWRyYXRlX25vZGU7XG5cblx0dHJ5IHtcblx0XHR2YXIgYW5jaG9yID0gLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChnZXRfZmlyc3RfY2hpbGQodGFyZ2V0KSk7XG5cdFx0d2hpbGUgKFxuXHRcdFx0YW5jaG9yICYmXG5cdFx0XHQoYW5jaG9yLm5vZGVUeXBlICE9PSBDT01NRU5UX05PREUgfHwgLyoqIEB0eXBlIHtDb21tZW50fSAqLyAoYW5jaG9yKS5kYXRhICE9PSBIWURSQVRJT05fU1RBUlQpXG5cdFx0KSB7XG5cdFx0XHRhbmNob3IgPSAvKiogQHR5cGUge1RlbXBsYXRlTm9kZX0gKi8gKGdldF9uZXh0X3NpYmxpbmcoYW5jaG9yKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFhbmNob3IpIHtcblx0XHRcdHRocm93IEhZRFJBVElPTl9FUlJPUjtcblx0XHR9XG5cblx0XHRzZXRfaHlkcmF0aW5nKHRydWUpO1xuXHRcdHNldF9oeWRyYXRlX25vZGUoLyoqIEB0eXBlIHtDb21tZW50fSAqLyAoYW5jaG9yKSk7XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IF9tb3VudChjb21wb25lbnQsIHsgLi4ub3B0aW9ucywgYW5jaG9yIH0pO1xuXG5cdFx0c2V0X2h5ZHJhdGluZyhmYWxzZSk7XG5cblx0XHRyZXR1cm4gLyoqICBAdHlwZSB7RXhwb3J0c30gKi8gKGluc3RhbmNlKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyByZS10aHJvdyBTdmVsdGUgZXJyb3JzIC0gdGhleSBhcmUgY2VydGFpbmx5IG5vdCByZWxhdGVkIHRvIGh5ZHJhdGlvblxuXHRcdGlmIChcblx0XHRcdGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiZcblx0XHRcdGVycm9yLm1lc3NhZ2Uuc3BsaXQoJ1xcbicpLnNvbWUoKGxpbmUpID0+IGxpbmUuc3RhcnRzV2l0aCgnaHR0cHM6Ly9zdmVsdGUuZGV2L2UvJykpXG5cdFx0KSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKGVycm9yICE9PSBIWURSQVRJT05fRVJST1IpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG5cdFx0XHRjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBoeWRyYXRlOiAnLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMucmVjb3ZlciA9PT0gZmFsc2UpIHtcblx0XHRcdGUuaHlkcmF0aW9uX2ZhaWxlZCgpO1xuXHRcdH1cblxuXHRcdC8vIElmIGFuIGVycm9yIG9jY3VycmVkIGFib3ZlLCB0aGUgb3BlcmF0aW9ucyBtaWdodCBub3QgeWV0IGhhdmUgYmVlbiBpbml0aWFsaXNlZC5cblx0XHRpbml0X29wZXJhdGlvbnMoKTtcblx0XHRjbGVhcl90ZXh0X2NvbnRlbnQodGFyZ2V0KTtcblxuXHRcdHNldF9oeWRyYXRpbmcoZmFsc2UpO1xuXHRcdHJldHVybiBtb3VudChjb21wb25lbnQsIG9wdGlvbnMpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldF9oeWRyYXRpbmcod2FzX2h5ZHJhdGluZyk7XG5cdFx0c2V0X2h5ZHJhdGVfbm9kZShwcmV2aW91c19oeWRyYXRlX25vZGUpO1xuXHR9XG59XG5cbi8qKiBAdHlwZSB7TWFwPHN0cmluZywgbnVtYmVyPn0gKi9cbmNvbnN0IGRvY3VtZW50X2xpc3RlbmVycyA9IG5ldyBNYXAoKTtcblxuLyoqXG4gKiBAdGVtcGxhdGUge1JlY29yZDxzdHJpbmcsIGFueT59IEV4cG9ydHNcbiAqIEBwYXJhbSB7Q29tcG9uZW50VHlwZTxTdmVsdGVDb21wb25lbnQ8YW55Pj4gfCBDb21wb25lbnQ8YW55Pn0gQ29tcG9uZW50XG4gKiBAcGFyYW0ge01vdW50T3B0aW9uc30gb3B0aW9uc1xuICogQHJldHVybnMge0V4cG9ydHN9XG4gKi9cbmZ1bmN0aW9uIF9tb3VudChDb21wb25lbnQsIHsgdGFyZ2V0LCBhbmNob3IsIHByb3BzID0ge30sIGV2ZW50cywgY29udGV4dCwgaW50cm8gPSB0cnVlIH0pIHtcblx0aW5pdF9vcGVyYXRpb25zKCk7XG5cblx0LyoqIEB0eXBlIHtTZXQ8c3RyaW5nPn0gKi9cblx0dmFyIHJlZ2lzdGVyZWRfZXZlbnRzID0gbmV3IFNldCgpO1xuXG5cdC8qKiBAcGFyYW0ge0FycmF5PHN0cmluZz59IGV2ZW50cyAqL1xuXHR2YXIgZXZlbnRfaGFuZGxlID0gKGV2ZW50cykgPT4ge1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgZXZlbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgZXZlbnRfbmFtZSA9IGV2ZW50c1tpXTtcblxuXHRcdFx0aWYgKHJlZ2lzdGVyZWRfZXZlbnRzLmhhcyhldmVudF9uYW1lKSkgY29udGludWU7XG5cdFx0XHRyZWdpc3RlcmVkX2V2ZW50cy5hZGQoZXZlbnRfbmFtZSk7XG5cblx0XHRcdHZhciBwYXNzaXZlID0gaXNfcGFzc2l2ZV9ldmVudChldmVudF9uYW1lKTtcblxuXHRcdFx0Ly8gQWRkIHRoZSBldmVudCBsaXN0ZW5lciB0byBib3RoIHRoZSBjb250YWluZXIgYW5kIHRoZSBkb2N1bWVudC5cblx0XHRcdC8vIFRoZSBjb250YWluZXIgbGlzdGVuZXIgZW5zdXJlcyB3ZSBjYXRjaCBldmVudHMgZnJvbSB3aXRoaW4gaW4gY2FzZVxuXHRcdFx0Ly8gdGhlIG91dGVyIGNvbnRlbnQgc3RvcHMgcHJvcGFnYXRpb24gb2YgdGhlIGV2ZW50LlxuXHRcdFx0dGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgaGFuZGxlX2V2ZW50X3Byb3BhZ2F0aW9uLCB7IHBhc3NpdmUgfSk7XG5cblx0XHRcdHZhciBuID0gZG9jdW1lbnRfbGlzdGVuZXJzLmdldChldmVudF9uYW1lKTtcblxuXHRcdFx0aWYgKG4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBUaGUgZG9jdW1lbnQgbGlzdGVuZXIgZW5zdXJlcyB3ZSBjYXRjaCBldmVudHMgdGhhdCBvcmlnaW5hdGUgZnJvbSBlbGVtZW50cyB0aGF0IHdlcmVcblx0XHRcdFx0Ly8gbWFudWFsbHkgbW92ZWQgb3V0c2lkZSBvZiB0aGUgY29udGFpbmVyIChlLmcuIHZpYSBtYW51YWwgcG9ydGFscykuXG5cdFx0XHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgaGFuZGxlX2V2ZW50X3Byb3BhZ2F0aW9uLCB7IHBhc3NpdmUgfSk7XG5cdFx0XHRcdGRvY3VtZW50X2xpc3RlbmVycy5zZXQoZXZlbnRfbmFtZSwgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkb2N1bWVudF9saXN0ZW5lcnMuc2V0KGV2ZW50X25hbWUsIG4gKyAxKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXZlbnRfaGFuZGxlKGFycmF5X2Zyb20oYWxsX3JlZ2lzdGVyZWRfZXZlbnRzKSk7XG5cdHJvb3RfZXZlbnRfaGFuZGxlcy5hZGQoZXZlbnRfaGFuZGxlKTtcblxuXHQvKiogQHR5cGUge0V4cG9ydHN9ICovXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Igd2lsbCBiZSBkZWZpbmVkIGJlY2F1c2UgdGhlIHJlbmRlciBlZmZlY3QgcnVucyBzeW5jaHJvbm91c2x5XG5cdHZhciBjb21wb25lbnQgPSB1bmRlZmluZWQ7XG5cblx0dmFyIHVubW91bnQgPSBjb21wb25lbnRfcm9vdCgoKSA9PiB7XG5cdFx0dmFyIGFuY2hvcl9ub2RlID0gYW5jaG9yID8/IHRhcmdldC5hcHBlbmRDaGlsZChjcmVhdGVfdGV4dCgpKTtcblxuXHRcdGJvdW5kYXJ5KFxuXHRcdFx0LyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChhbmNob3Jfbm9kZSksXG5cdFx0XHR7XG5cdFx0XHRcdHBlbmRpbmc6ICgpID0+IHt9XG5cdFx0XHR9LFxuXHRcdFx0KGFuY2hvcl9ub2RlKSA9PiB7XG5cdFx0XHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRcdFx0cHVzaCh7fSk7XG5cdFx0XHRcdFx0dmFyIGN0eCA9IC8qKiBAdHlwZSB7Q29tcG9uZW50Q29udGV4dH0gKi8gKGNvbXBvbmVudF9jb250ZXh0KTtcblx0XHRcdFx0XHRjdHguYyA9IGNvbnRleHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZlbnRzKSB7XG5cdFx0XHRcdFx0Ly8gV2UgY2FuJ3Qgc3ByZWFkIHRoZSBvYmplY3Qgb3IgZWxzZSB3ZSdkIGxvc2UgdGhlIHN0YXRlIHByb3h5IHN0dWZmLCBpZiBpdCBpcyBvbmVcblx0XHRcdFx0XHQvKiogQHR5cGUge2FueX0gKi8gKHByb3BzKS4kJGV2ZW50cyA9IGV2ZW50cztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChoeWRyYXRpbmcpIHtcblx0XHRcdFx0XHRhc3NpZ25fbm9kZXMoLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChhbmNob3Jfbm9kZSksIG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2hvdWxkX2ludHJvID0gaW50cm87XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgdGhlIHB1YmxpYyB0eXBpbmdzIGFyZSBub3Qgd2hhdCB0aGUgYWN0dWFsIGZ1bmN0aW9uIGxvb2tzIGxpa2Vcblx0XHRcdFx0Y29tcG9uZW50ID0gQ29tcG9uZW50KGFuY2hvcl9ub2RlLCBwcm9wcykgfHwge307XG5cdFx0XHRcdHNob3VsZF9pbnRybyA9IHRydWU7XG5cblx0XHRcdFx0aWYgKGh5ZHJhdGluZykge1xuXHRcdFx0XHRcdC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCkubm9kZXNfZW5kID0gaHlkcmF0ZV9ub2RlO1xuXG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0aHlkcmF0ZV9ub2RlID09PSBudWxsIHx8XG5cdFx0XHRcdFx0XHRoeWRyYXRlX25vZGUubm9kZVR5cGUgIT09IENPTU1FTlRfTk9ERSB8fFxuXHRcdFx0XHRcdFx0LyoqIEB0eXBlIHtDb21tZW50fSAqLyAoaHlkcmF0ZV9ub2RlKS5kYXRhICE9PSBIWURSQVRJT05fRU5EXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHR3Lmh5ZHJhdGlvbl9taXNtYXRjaCgpO1xuXHRcdFx0XHRcdFx0dGhyb3cgSFlEUkFUSU9OX0VSUk9SO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRcdFx0cG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGZvciAodmFyIGV2ZW50X25hbWUgb2YgcmVnaXN0ZXJlZF9ldmVudHMpIHtcblx0XHRcdFx0dGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgaGFuZGxlX2V2ZW50X3Byb3BhZ2F0aW9uKTtcblxuXHRcdFx0XHR2YXIgbiA9IC8qKiBAdHlwZSB7bnVtYmVyfSAqLyAoZG9jdW1lbnRfbGlzdGVuZXJzLmdldChldmVudF9uYW1lKSk7XG5cblx0XHRcdFx0aWYgKC0tbiA9PT0gMCkge1xuXHRcdFx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgaGFuZGxlX2V2ZW50X3Byb3BhZ2F0aW9uKTtcblx0XHRcdFx0XHRkb2N1bWVudF9saXN0ZW5lcnMuZGVsZXRlKGV2ZW50X25hbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRvY3VtZW50X2xpc3RlbmVycy5zZXQoZXZlbnRfbmFtZSwgbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cm9vdF9ldmVudF9oYW5kbGVzLmRlbGV0ZShldmVudF9oYW5kbGUpO1xuXG5cdFx0XHRpZiAoYW5jaG9yX25vZGUgIT09IGFuY2hvcikge1xuXHRcdFx0XHRhbmNob3Jfbm9kZS5wYXJlbnROb2RlPy5yZW1vdmVDaGlsZChhbmNob3Jfbm9kZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fSk7XG5cblx0bW91bnRlZF9jb21wb25lbnRzLnNldChjb21wb25lbnQsIHVubW91bnQpO1xuXHRyZXR1cm4gY29tcG9uZW50O1xufVxuXG4vKipcbiAqIFJlZmVyZW5jZXMgb2YgdGhlIGNvbXBvbmVudHMgdGhhdCB3ZXJlIG1vdW50ZWQgb3IgaHlkcmF0ZWQuXG4gKiBVc2VzIGEgYFdlYWtNYXBgIHRvIGF2b2lkIG1lbW9yeSBsZWFrcy5cbiAqL1xubGV0IG1vdW50ZWRfY29tcG9uZW50cyA9IG5ldyBXZWFrTWFwKCk7XG5cbi8qKlxuICogVW5tb3VudHMgYSBjb21wb25lbnQgdGhhdCB3YXMgcHJldmlvdXNseSBtb3VudGVkIHVzaW5nIGBtb3VudGAgb3IgYGh5ZHJhdGVgLlxuICpcbiAqIFNpbmNlIDUuMTMuMCwgaWYgYG9wdGlvbnMub3V0cm9gIGlzIGB0cnVlYCwgW3RyYW5zaXRpb25zXShodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUvdHJhbnNpdGlvbikgd2lsbCBwbGF5IGJlZm9yZSB0aGUgY29tcG9uZW50IGlzIHJlbW92ZWQgZnJvbSB0aGUgRE9NLlxuICpcbiAqIFJldHVybnMgYSBgUHJvbWlzZWAgdGhhdCByZXNvbHZlcyBhZnRlciB0cmFuc2l0aW9ucyBoYXZlIGNvbXBsZXRlZCBpZiBgb3B0aW9ucy5vdXRyb2AgaXMgdHJ1ZSwgb3IgaW1tZWRpYXRlbHkgb3RoZXJ3aXNlIChwcmlvciB0byA1LjEzLjAsIHJldHVybnMgYHZvaWRgKS5cbiAqXG4gKiBgYGBqc1xuICogaW1wb3J0IHsgbW91bnQsIHVubW91bnQgfSBmcm9tICdzdmVsdGUnO1xuICogaW1wb3J0IEFwcCBmcm9tICcuL0FwcC5zdmVsdGUnO1xuICpcbiAqIGNvbnN0IGFwcCA9IG1vdW50KEFwcCwgeyB0YXJnZXQ6IGRvY3VtZW50LmJvZHkgfSk7XG4gKlxuICogLy8gbGF0ZXIuLi5cbiAqIHVubW91bnQoYXBwLCB7IG91dHJvOiB0cnVlIH0pO1xuICogYGBgXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IGNvbXBvbmVudFxuICogQHBhcmFtIHt7IG91dHJvPzogYm9vbGVhbiB9fSBbb3B0aW9uc11cbiAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5tb3VudChjb21wb25lbnQsIG9wdGlvbnMpIHtcblx0Y29uc3QgZm4gPSBtb3VudGVkX2NvbXBvbmVudHMuZ2V0KGNvbXBvbmVudCk7XG5cblx0aWYgKGZuKSB7XG5cdFx0bW91bnRlZF9jb21wb25lbnRzLmRlbGV0ZShjb21wb25lbnQpO1xuXHRcdHJldHVybiBmbihvcHRpb25zKTtcblx0fVxuXG5cdGlmIChERVYpIHtcblx0XHRpZiAoU1RBVEVfU1lNQk9MIGluIGNvbXBvbmVudCkge1xuXHRcdFx0dy5zdGF0ZV9wcm94eV91bm1vdW50KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHcubGlmZWN5Y2xlX2RvdWJsZV91bm1vdW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuIiwiaW1wb3J0IHsgaXNfdm9pZCB9IGZyb20gJy4uLy4uL3V0aWxzLmpzJztcbmltcG9ydCAqIGFzIHcgZnJvbSAnLi93YXJuaW5ncy5qcyc7XG5pbXBvcnQgKiBhcyBlIGZyb20gJy4vZXJyb3JzLmpzJztcblxuZXhwb3J0IHsgaW52YWxpZF9kZWZhdWx0X3NuaXBwZXQgfSBmcm9tICcuL2Vycm9ycy5qcyc7XG5cbi8qKlxuICogQHBhcmFtIHsoKSA9PiBzdHJpbmd9IHRhZ19mblxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZV92b2lkX2R5bmFtaWNfZWxlbWVudCh0YWdfZm4pIHtcblx0Y29uc3QgdGFnID0gdGFnX2ZuKCk7XG5cdGlmICh0YWcgJiYgaXNfdm9pZCh0YWcpKSB7XG5cdFx0dy5keW5hbWljX3ZvaWRfZWxlbWVudF9jb250ZW50KHRhZyk7XG5cdH1cbn1cblxuLyoqIEBwYXJhbSB7KCkgPT4gdW5rbm93bn0gdGFnX2ZuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVfZHluYW1pY19lbGVtZW50X3RhZyh0YWdfZm4pIHtcblx0Y29uc3QgdGFnID0gdGFnX2ZuKCk7XG5cdGNvbnN0IGlzX3N0cmluZyA9IHR5cGVvZiB0YWcgPT09ICdzdHJpbmcnO1xuXHRpZiAodGFnICYmICFpc19zdHJpbmcpIHtcblx0XHRlLnN2ZWx0ZV9lbGVtZW50X2ludmFsaWRfdGhpc192YWx1ZSgpO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IHN0b3JlXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVfc3RvcmUoc3RvcmUsIG5hbWUpIHtcblx0aWYgKHN0b3JlICE9IG51bGwgJiYgdHlwZW9mIHN0b3JlLnN1YnNjcmliZSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdGUuc3RvcmVfaW52YWxpZF9zaGFwZShuYW1lKTtcblx0fVxufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSB7KC4uLmFyZ3M6IGFueVtdKSA9PiB1bmtub3dufSBUXG4gKiBAcGFyYW0ge1R9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2ZW50X3NuaXBwZXRfc3RyaW5naWZpY2F0aW9uKGZuKSB7XG5cdGZuLnRvU3RyaW5nID0gKCkgPT4ge1xuXHRcdGUuc25pcHBldF93aXRob3V0X3JlbmRlcl90YWcoKTtcblx0XHRyZXR1cm4gJyc7XG5cdH07XG5cdHJldHVybiBmbjtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0LCBUZW1wbGF0ZU5vZGUgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHsgQmF0Y2gsIGN1cnJlbnRfYmF0Y2ggfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2JhdGNoLmpzJztcbmltcG9ydCB7XG5cdGJyYW5jaCxcblx0ZGVzdHJveV9lZmZlY3QsXG5cdG1vdmVfZWZmZWN0LFxuXHRwYXVzZV9lZmZlY3QsXG5cdHJlc3VtZV9lZmZlY3Rcbn0gZnJvbSAnLi4vLi4vcmVhY3Rpdml0eS9lZmZlY3RzLmpzJztcbmltcG9ydCB7IGh5ZHJhdGVfbm9kZSwgaHlkcmF0aW5nIH0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZV90ZXh0LCBzaG91bGRfZGVmZXJfYXBwZW5kIH0gZnJvbSAnLi4vb3BlcmF0aW9ucy5qcyc7XG5cbi8qKlxuICogQHR5cGVkZWYge3sgZWZmZWN0OiBFZmZlY3QsIGZyYWdtZW50OiBEb2N1bWVudEZyYWdtZW50IH19IEJyYW5jaFxuICovXG5cbi8qKlxuICogQHRlbXBsYXRlIEtleVxuICovXG5leHBvcnQgY2xhc3MgQnJhbmNoTWFuYWdlciB7XG5cdC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqL1xuXHRhbmNob3I7XG5cblx0LyoqIEB0eXBlIHtNYXA8QmF0Y2gsIEtleT59ICovXG5cdCNiYXRjaGVzID0gbmV3IE1hcCgpO1xuXG5cdC8qKlxuXHQgKiBNYXAgb2Yga2V5cyB0byBlZmZlY3RzIHRoYXQgYXJlIGN1cnJlbnRseSByZW5kZXJlZCBpbiB0aGUgRE9NLlxuXHQgKiBUaGVzZSBlZmZlY3RzIGFyZSB2aXNpYmxlIGFuZCBhY3RpdmVseSBwYXJ0IG9mIHRoZSBkb2N1bWVudCB0cmVlLlxuXHQgKiBFeGFtcGxlOlxuXHQgKiBgYGBcblx0ICogeyNpZiBjb25kaXRpb259XG5cdCAqIFx0Zm9vXG5cdCAqIHs6ZWxzZX1cblx0ICogXHRiYXJcblx0ICogey9pZn1cblx0ICogYGBgXG5cdCAqIENhbiByZXN1bHQgaW4gdGhlIGVudHJpZXMgYHRydWUtPkVmZmVjdGAgYW5kIGBmYWxzZS0+RWZmZWN0YFxuXHQgKiBAdHlwZSB7TWFwPEtleSwgRWZmZWN0Pn1cblx0ICovXG5cdCNvbnNjcmVlbiA9IG5ldyBNYXAoKTtcblxuXHQvKipcblx0ICogU2ltaWxhciB0byAjb25zY3JlZW4gd2l0aCByZXNwZWN0IHRvIHRoZSBrZXlzLCBidXQgY29udGFpbnMgYnJhbmNoZXMgdGhhdCBhcmUgbm90IHlldFxuXHQgKiBpbiB0aGUgRE9NLCBiZWNhdXNlIHRoZWlyIGluc2VydGlvbiBpcyBkZWZlcnJlZC5cblx0ICogQHR5cGUge01hcDxLZXksIEJyYW5jaD59XG5cdCAqL1xuXHQjb2Zmc2NyZWVuID0gbmV3IE1hcCgpO1xuXG5cdC8qKlxuXHQgKiBLZXlzIG9mIGVmZmVjdHMgdGhhdCBhcmUgY3VycmVudGx5IG91dHJvaW5nXG5cdCAqIEB0eXBlIHtTZXQ8S2V5Pn1cblx0ICovXG5cdCNvdXRyb2luZyA9IG5ldyBTZXQoKTtcblxuXHQvKipcblx0ICogV2hldGhlciB0byBwYXVzZSAoaS5lLiBvdXRybykgb24gY2hhbmdlLCBvciBkZXN0cm95IGltbWVkaWF0ZWx5LlxuXHQgKiBUaGlzIGlzIG5lY2Vzc2FyeSBmb3IgYDxzdmVsdGU6ZWxlbWVudD5gXG5cdCAqL1xuXHQjdHJhbnNpdGlvbiA9IHRydWU7XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7VGVtcGxhdGVOb2RlfSBhbmNob3Jcblx0ICogQHBhcmFtIHtib29sZWFufSB0cmFuc2l0aW9uXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihhbmNob3IsIHRyYW5zaXRpb24gPSB0cnVlKSB7XG5cdFx0dGhpcy5hbmNob3IgPSBhbmNob3I7XG5cdFx0dGhpcy4jdHJhbnNpdGlvbiA9IHRyYW5zaXRpb247XG5cdH1cblxuXHQjY29tbWl0ID0gKCkgPT4ge1xuXHRcdHZhciBiYXRjaCA9IC8qKiBAdHlwZSB7QmF0Y2h9ICovIChjdXJyZW50X2JhdGNoKTtcblxuXHRcdC8vIGlmIHRoaXMgYmF0Y2ggd2FzIG1hZGUgb2Jzb2xldGUsIGJhaWxcblx0XHRpZiAoIXRoaXMuI2JhdGNoZXMuaGFzKGJhdGNoKSkgcmV0dXJuO1xuXG5cdFx0dmFyIGtleSA9IC8qKiBAdHlwZSB7S2V5fSAqLyAodGhpcy4jYmF0Y2hlcy5nZXQoYmF0Y2gpKTtcblxuXHRcdHZhciBvbnNjcmVlbiA9IHRoaXMuI29uc2NyZWVuLmdldChrZXkpO1xuXG5cdFx0aWYgKG9uc2NyZWVuKSB7XG5cdFx0XHQvLyBlZmZlY3QgaXMgYWxyZWFkeSBpbiB0aGUgRE9NIOKAlCBhYm9ydCBhbnkgY3VycmVudCBvdXRyb1xuXHRcdFx0cmVzdW1lX2VmZmVjdChvbnNjcmVlbik7XG5cdFx0XHR0aGlzLiNvdXRyb2luZy5kZWxldGUoa2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZWZmZWN0IGlzIGN1cnJlbnRseSBvZmZzY3JlZW4uIHB1dCBpdCBpbiB0aGUgRE9NXG5cdFx0XHR2YXIgb2Zmc2NyZWVuID0gdGhpcy4jb2Zmc2NyZWVuLmdldChrZXkpO1xuXG5cdFx0XHRpZiAob2Zmc2NyZWVuKSB7XG5cdFx0XHRcdHRoaXMuI29uc2NyZWVuLnNldChrZXksIG9mZnNjcmVlbi5lZmZlY3QpO1xuXHRcdFx0XHR0aGlzLiNvZmZzY3JlZW4uZGVsZXRlKGtleSk7XG5cblx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSBhbmNob3IuLi5cblx0XHRcdFx0LyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIChvZmZzY3JlZW4uZnJhZ21lbnQubGFzdENoaWxkKS5yZW1vdmUoKTtcblxuXHRcdFx0XHQvLyAuLi5hbmQgYXBwZW5kIHRoZSBmcmFnbWVudFxuXHRcdFx0XHR0aGlzLmFuY2hvci5iZWZvcmUob2Zmc2NyZWVuLmZyYWdtZW50KTtcblx0XHRcdFx0b25zY3JlZW4gPSBvZmZzY3JlZW4uZWZmZWN0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2IsIGtdIG9mIHRoaXMuI2JhdGNoZXMpIHtcblx0XHRcdHRoaXMuI2JhdGNoZXMuZGVsZXRlKGIpO1xuXG5cdFx0XHRpZiAoYiA9PT0gYmF0Y2gpIHtcblx0XHRcdFx0Ly8ga2VlcCB2YWx1ZXMgZm9yIG5ld2VyIGJhdGNoZXNcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9mZnNjcmVlbiA9IHRoaXMuI29mZnNjcmVlbi5nZXQoayk7XG5cblx0XHRcdGlmIChvZmZzY3JlZW4pIHtcblx0XHRcdFx0Ly8gZm9yIG9sZGVyIGJhdGNoZXMsIGRlc3Ryb3kgb2Zmc2NyZWVuIGVmZmVjdHNcblx0XHRcdFx0Ly8gYXMgdGhleSB3aWxsIG5ldmVyIGJlIGNvbW1pdHRlZFxuXHRcdFx0XHRkZXN0cm95X2VmZmVjdChvZmZzY3JlZW4uZWZmZWN0KTtcblx0XHRcdFx0dGhpcy4jb2Zmc2NyZWVuLmRlbGV0ZShrKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBvdXRyby9kZXN0cm95IGFsbCBvbnNjcmVlbiBlZmZlY3RzLi4uXG5cdFx0Zm9yIChjb25zdCBbaywgZWZmZWN0XSBvZiB0aGlzLiNvbnNjcmVlbikge1xuXHRcdFx0Ly8gLi4uZXhjZXB0IHRoZSBvbmUgdGhhdCB3YXMganVzdCBjb21taXR0ZWRcblx0XHRcdC8vICAgIG9yIHRob3NlIHRoYXQgYXJlIGFscmVhZHkgb3V0cm9pbmcgKGVsc2UgdGhlIHRyYW5zaXRpb24gaXMgYWJvcnRlZCBhbmQgdGhlIGVmZmVjdCBkZXN0cm95ZWQgcmlnaHQgYXdheSlcblx0XHRcdGlmIChrID09PSBrZXkgfHwgdGhpcy4jb3V0cm9pbmcuaGFzKGspKSBjb250aW51ZTtcblxuXHRcdFx0Y29uc3Qgb25fZGVzdHJveSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5cyA9IEFycmF5LmZyb20odGhpcy4jYmF0Y2hlcy52YWx1ZXMoKSk7XG5cblx0XHRcdFx0aWYgKGtleXMuaW5jbHVkZXMoaykpIHtcblx0XHRcdFx0XHQvLyBrZWVwIHRoZSBlZmZlY3Qgb2Zmc2NyZWVuLCBhcyBhbm90aGVyIGJhdGNoIHdpbGwgbmVlZCBpdFxuXHRcdFx0XHRcdHZhciBmcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRcdFx0XHRtb3ZlX2VmZmVjdChlZmZlY3QsIGZyYWdtZW50KTtcblxuXHRcdFx0XHRcdGZyYWdtZW50LmFwcGVuZChjcmVhdGVfdGV4dCgpKTsgLy8gVE9ETyBjYW4gd2UgYXZvaWQgdGhpcz9cblxuXHRcdFx0XHRcdHRoaXMuI29mZnNjcmVlbi5zZXQoaywgeyBlZmZlY3QsIGZyYWdtZW50IH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlc3Ryb3lfZWZmZWN0KGVmZmVjdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLiNvdXRyb2luZy5kZWxldGUoayk7XG5cdFx0XHRcdHRoaXMuI29uc2NyZWVuLmRlbGV0ZShrKTtcblx0XHRcdH07XG5cblx0XHRcdGlmICh0aGlzLiN0cmFuc2l0aW9uIHx8ICFvbnNjcmVlbikge1xuXHRcdFx0XHR0aGlzLiNvdXRyb2luZy5hZGQoayk7XG5cdFx0XHRcdHBhdXNlX2VmZmVjdChlZmZlY3QsIG9uX2Rlc3Ryb3ksIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9uX2Rlc3Ryb3koKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7QmF0Y2h9IGJhdGNoXG5cdCAqL1xuXHQjZGlzY2FyZCA9IChiYXRjaCkgPT4ge1xuXHRcdHRoaXMuI2JhdGNoZXMuZGVsZXRlKGJhdGNoKTtcblxuXHRcdGNvbnN0IGtleXMgPSBBcnJheS5mcm9tKHRoaXMuI2JhdGNoZXMudmFsdWVzKCkpO1xuXG5cdFx0Zm9yIChjb25zdCBbaywgYnJhbmNoXSBvZiB0aGlzLiNvZmZzY3JlZW4pIHtcblx0XHRcdGlmICgha2V5cy5pbmNsdWRlcyhrKSkge1xuXHRcdFx0XHRkZXN0cm95X2VmZmVjdChicmFuY2guZWZmZWN0KTtcblx0XHRcdFx0dGhpcy4jb2Zmc2NyZWVuLmRlbGV0ZShrKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSB7YW55fSBrZXlcblx0ICogQHBhcmFtIHtudWxsIHwgKCh0YXJnZXQ6IFRlbXBsYXRlTm9kZSkgPT4gdm9pZCl9IGZuXG5cdCAqL1xuXHRlbnN1cmUoa2V5LCBmbikge1xuXHRcdHZhciBiYXRjaCA9IC8qKiBAdHlwZSB7QmF0Y2h9ICovIChjdXJyZW50X2JhdGNoKTtcblx0XHR2YXIgZGVmZXIgPSBzaG91bGRfZGVmZXJfYXBwZW5kKCk7XG5cblx0XHRpZiAoZm4gJiYgIXRoaXMuI29uc2NyZWVuLmhhcyhrZXkpICYmICF0aGlzLiNvZmZzY3JlZW4uaGFzKGtleSkpIHtcblx0XHRcdGlmIChkZWZlcikge1xuXHRcdFx0XHR2YXIgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0XHRcdHZhciB0YXJnZXQgPSBjcmVhdGVfdGV4dCgpO1xuXG5cdFx0XHRcdGZyYWdtZW50LmFwcGVuZCh0YXJnZXQpO1xuXG5cdFx0XHRcdHRoaXMuI29mZnNjcmVlbi5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0ZWZmZWN0OiBicmFuY2goKCkgPT4gZm4odGFyZ2V0KSksXG5cdFx0XHRcdFx0ZnJhZ21lbnRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiNvbnNjcmVlbi5zZXQoXG5cdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdGJyYW5jaCgoKSA9PiBmbih0aGlzLmFuY2hvcikpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy4jYmF0Y2hlcy5zZXQoYmF0Y2gsIGtleSk7XG5cblx0XHRpZiAoZGVmZXIpIHtcblx0XHRcdGZvciAoY29uc3QgW2ssIGVmZmVjdF0gb2YgdGhpcy4jb25zY3JlZW4pIHtcblx0XHRcdFx0aWYgKGsgPT09IGtleSkge1xuXHRcdFx0XHRcdGJhdGNoLnNraXBwZWRfZWZmZWN0cy5kZWxldGUoZWZmZWN0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRiYXRjaC5za2lwcGVkX2VmZmVjdHMuYWRkKGVmZmVjdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbaywgYnJhbmNoXSBvZiB0aGlzLiNvZmZzY3JlZW4pIHtcblx0XHRcdFx0aWYgKGsgPT09IGtleSkge1xuXHRcdFx0XHRcdGJhdGNoLnNraXBwZWRfZWZmZWN0cy5kZWxldGUoYnJhbmNoLmVmZmVjdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YmF0Y2guc2tpcHBlZF9lZmZlY3RzLmFkZChicmFuY2guZWZmZWN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRiYXRjaC5vbmNvbW1pdCh0aGlzLiNjb21taXQpO1xuXHRcdFx0YmF0Y2gub25kaXNjYXJkKHRoaXMuI2Rpc2NhcmQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0XHRcdHRoaXMuYW5jaG9yID0gaHlkcmF0ZV9ub2RlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLiNjb21taXQoKTtcblx0XHR9XG5cdH1cbn1cbiIsIi8qKiBAaW1wb3J0IHsgU25pcHBldCB9IGZyb20gJ3N2ZWx0ZScgKi9cbi8qKiBAaW1wb3J0IHsgVGVtcGxhdGVOb2RlIH0gZnJvbSAnI2NsaWVudCcgKi9cbi8qKiBAaW1wb3J0IHsgR2V0dGVycyB9IGZyb20gJyNzaGFyZWQnICovXG5pbXBvcnQgeyBFRkZFQ1RfVFJBTlNQQVJFTlQsIEVMRU1FTlRfTk9ERSB9IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7IGJsb2NrLCB0ZWFyZG93biB9IGZyb20gJy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQge1xuXHRkZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb24sXG5cdHNldF9kZXZfY3VycmVudF9jb21wb25lbnRfZnVuY3Rpb25cbn0gZnJvbSAnLi4vLi4vY29udGV4dC5qcyc7XG5pbXBvcnQgeyBoeWRyYXRlX25leHQsIGh5ZHJhdGVfbm9kZSwgaHlkcmF0aW5nIH0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZV9mcmFnbWVudF9mcm9tX2h0bWwgfSBmcm9tICcuLi9yZWNvbmNpbGVyLmpzJztcbmltcG9ydCB7IGFzc2lnbl9ub2RlcyB9IGZyb20gJy4uL3RlbXBsYXRlLmpzJztcbmltcG9ydCAqIGFzIHcgZnJvbSAnLi4vLi4vd2FybmluZ3MuanMnO1xuaW1wb3J0ICogYXMgZSBmcm9tICcuLi8uLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5pbXBvcnQgeyBnZXRfZmlyc3RfY2hpbGQsIGdldF9uZXh0X3NpYmxpbmcgfSBmcm9tICcuLi9vcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IHByZXZlbnRfc25pcHBldF9zdHJpbmdpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi9zaGFyZWQvdmFsaWRhdGUuanMnO1xuaW1wb3J0IHsgQnJhbmNoTWFuYWdlciB9IGZyb20gJy4vYnJhbmNoZXMuanMnO1xuXG4vKipcbiAqIEB0ZW1wbGF0ZSB7KG5vZGU6IFRlbXBsYXRlTm9kZSwgLi4uYXJnczogYW55W10pID0+IHZvaWR9IFNuaXBwZXRGblxuICogQHBhcmFtIHtUZW1wbGF0ZU5vZGV9IG5vZGVcbiAqIEBwYXJhbSB7KCkgPT4gU25pcHBldEZuIHwgbnVsbCB8IHVuZGVmaW5lZH0gZ2V0X3NuaXBwZXRcbiAqIEBwYXJhbSB7KCgpID0+IGFueSlbXX0gYXJnc1xuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbmlwcGV0KG5vZGUsIGdldF9zbmlwcGV0LCAuLi5hcmdzKSB7XG5cdHZhciBicmFuY2hlcyA9IG5ldyBCcmFuY2hNYW5hZ2VyKG5vZGUpO1xuXG5cdGJsb2NrKCgpID0+IHtcblx0XHRjb25zdCBzbmlwcGV0ID0gZ2V0X3NuaXBwZXQoKSA/PyBudWxsO1xuXG5cdFx0aWYgKERFViAmJiBzbmlwcGV0ID09IG51bGwpIHtcblx0XHRcdGUuaW52YWxpZF9zbmlwcGV0KCk7XG5cdFx0fVxuXG5cdFx0YnJhbmNoZXMuZW5zdXJlKHNuaXBwZXQsIHNuaXBwZXQgJiYgKChhbmNob3IpID0+IHNuaXBwZXQoYW5jaG9yLCAuLi5hcmdzKSkpO1xuXHR9LCBFRkZFQ1RfVFJBTlNQQVJFTlQpO1xufVxuXG4vKipcbiAqIEluIGRldmVsb3BtZW50LCB3cmFwIHRoZSBzbmlwcGV0IGZ1bmN0aW9uIHNvIHRoYXQgaXQgcGFzc2VzIHZhbGlkYXRpb24sIGFuZCBzbyB0aGF0IHRoZVxuICogY29ycmVjdCBjb21wb25lbnQgY29udGV4dCBpcyBzZXQgZm9yIG93bmVyc2hpcCBjaGVja3NcbiAqIEBwYXJhbSB7YW55fSBjb21wb25lbnRcbiAqIEBwYXJhbSB7KG5vZGU6IFRlbXBsYXRlTm9kZSwgLi4uYXJnczogYW55W10pID0+IHZvaWR9IGZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3cmFwX3NuaXBwZXQoY29tcG9uZW50LCBmbikge1xuXHRjb25zdCBzbmlwcGV0ID0gKC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyBub2RlLCAvKiogQHR5cGUge2FueVtdfSAqLyAuLi5hcmdzKSA9PiB7XG5cdFx0dmFyIHByZXZpb3VzX2NvbXBvbmVudF9mdW5jdGlvbiA9IGRldl9jdXJyZW50X2NvbXBvbmVudF9mdW5jdGlvbjtcblx0XHRzZXRfZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uKGNvbXBvbmVudCk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGZuKG5vZGUsIC4uLmFyZ3MpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRfZGV2X2N1cnJlbnRfY29tcG9uZW50X2Z1bmN0aW9uKHByZXZpb3VzX2NvbXBvbmVudF9mdW5jdGlvbik7XG5cdFx0fVxuXHR9O1xuXG5cdHByZXZlbnRfc25pcHBldF9zdHJpbmdpZmljYXRpb24oc25pcHBldCk7XG5cblx0cmV0dXJuIHNuaXBwZXQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgc25pcHBldCBwcm9ncmFtbWF0aWNhbGx5XG4gKiBAdGVtcGxhdGUge3Vua25vd25bXX0gUGFyYW1zXG4gKiBAcGFyYW0geyguLi5wYXJhbXM6IEdldHRlcnM8UGFyYW1zPikgPT4ge1xuICogICByZW5kZXI6ICgpID0+IHN0cmluZ1xuICogICBzZXR1cD86IChlbGVtZW50OiBFbGVtZW50KSA9PiB2b2lkIHwgKCgpID0+IHZvaWQpXG4gKiB9fSBmblxuICogQHJldHVybnMge1NuaXBwZXQ8UGFyYW1zPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJhd1NuaXBwZXQoZm4pIHtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvciB0aGUgdHlwZXMgYXJlIGEgbGllXG5cdHJldHVybiAoLyoqIEB0eXBlIHtUZW1wbGF0ZU5vZGV9ICovIGFuY2hvciwgLyoqIEB0eXBlIHtHZXR0ZXJzPFBhcmFtcz59ICovIC4uLnBhcmFtcykgPT4ge1xuXHRcdHZhciBzbmlwcGV0ID0gZm4oLi4ucGFyYW1zKTtcblxuXHRcdC8qKiBAdHlwZSB7RWxlbWVudH0gKi9cblx0XHR2YXIgZWxlbWVudDtcblxuXHRcdGlmIChoeWRyYXRpbmcpIHtcblx0XHRcdGVsZW1lbnQgPSAvKiogQHR5cGUge0VsZW1lbnR9ICovIChoeWRyYXRlX25vZGUpO1xuXHRcdFx0aHlkcmF0ZV9uZXh0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBodG1sID0gc25pcHBldC5yZW5kZXIoKS50cmltKCk7XG5cdFx0XHR2YXIgZnJhZ21lbnQgPSBjcmVhdGVfZnJhZ21lbnRfZnJvbV9odG1sKGh0bWwpO1xuXHRcdFx0ZWxlbWVudCA9IC8qKiBAdHlwZSB7RWxlbWVudH0gKi8gKGdldF9maXJzdF9jaGlsZChmcmFnbWVudCkpO1xuXG5cdFx0XHRpZiAoREVWICYmIChnZXRfbmV4dF9zaWJsaW5nKGVsZW1lbnQpICE9PSBudWxsIHx8IGVsZW1lbnQubm9kZVR5cGUgIT09IEVMRU1FTlRfTk9ERSkpIHtcblx0XHRcdFx0dy5pbnZhbGlkX3Jhd19zbmlwcGV0X3JlbmRlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRhbmNob3IuYmVmb3JlKGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNuaXBwZXQuc2V0dXA/LihlbGVtZW50KTtcblx0XHRhc3NpZ25fbm9kZXMoZWxlbWVudCwgZWxlbWVudCk7XG5cblx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGVhcmRvd24ocmVzdWx0KTtcblx0XHR9XG5cdH07XG59XG4iLCIvKiogQGltcG9ydCB7IENvbXBvbmVudENvbnRleHQsIENvbXBvbmVudENvbnRleHRMZWdhY3kgfSBmcm9tICcjY2xpZW50JyAqL1xuLyoqIEBpbXBvcnQgeyBFdmVudERpc3BhdGNoZXIgfSBmcm9tICcuL2luZGV4LmpzJyAqL1xuLyoqIEBpbXBvcnQgeyBOb3RGdW5jdGlvbiB9IGZyb20gJy4vaW50ZXJuYWwvdHlwZXMuanMnICovXG5pbXBvcnQgeyBhY3RpdmVfcmVhY3Rpb24sIHVudHJhY2sgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC9ydW50aW1lLmpzJztcbmltcG9ydCB7IGlzX2FycmF5IH0gZnJvbSAnLi9pbnRlcm5hbC9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHsgdXNlcl9lZmZlY3QgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC9pbmRleC5qcyc7XG5pbXBvcnQgKiBhcyBlIGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBsZWdhY3lfbW9kZV9mbGFnIH0gZnJvbSAnLi9pbnRlcm5hbC9mbGFncy9pbmRleC5qcyc7XG5pbXBvcnQgeyBjb21wb25lbnRfY29udGV4dCB9IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L2NvbnRleHQuanMnO1xuaW1wb3J0IHsgREVWIH0gZnJvbSAnZXNtLWVudic7XG5cbmlmIChERVYpIHtcblx0LyoqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBydW5lXG5cdCAqL1xuXHRmdW5jdGlvbiB0aHJvd19ydW5lX2Vycm9yKHJ1bmUpIHtcblx0XHRpZiAoIShydW5lIGluIGdsb2JhbFRoaXMpKSB7XG5cdFx0XHQvLyBUT0RPIGlmIHBlb3BsZSBzdGFydCBhZGp1c3RpbmcgdGhlIFwidGhpcyBjYW4gY29udGFpbiBydW5lc1wiIGNvbmZpZyB0aHJvdWdoIHYtcC1zIG1vcmUsIGFkanVzdCB0aGlzIG1lc3NhZ2Vcblx0XHRcdC8qKiBAdHlwZSB7YW55fSAqL1xuXHRcdFx0bGV0IHZhbHVlOyAvLyBsZXQncyBob3BlIG5vb25lIG1vZGlmaWVzIHRoaXMgZ2xvYmFsLCBidXQgYmVsdHMgYW5kIGJyYWNlc1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbFRoaXMsIHJ1bmUsIHtcblx0XHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgZ2V0dGVyLXJldHVyblxuXHRcdFx0XHRnZXQ6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGUucnVuZV9vdXRzaWRlX3N2ZWx0ZShydW5lKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0OiAodikgPT4ge1xuXHRcdFx0XHRcdHZhbHVlID0gdjtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0dGhyb3dfcnVuZV9lcnJvcignJHN0YXRlJyk7XG5cdHRocm93X3J1bmVfZXJyb3IoJyRlZmZlY3QnKTtcblx0dGhyb3dfcnVuZV9lcnJvcignJGRlcml2ZWQnKTtcblx0dGhyb3dfcnVuZV9lcnJvcignJGluc3BlY3QnKTtcblx0dGhyb3dfcnVuZV9lcnJvcignJHByb3BzJyk7XG5cdHRocm93X3J1bmVfZXJyb3IoJyRiaW5kYWJsZScpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYW4gW2BBYm9ydFNpZ25hbGBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9BYm9ydFNpZ25hbCkgdGhhdCBhYm9ydHMgd2hlbiB0aGUgY3VycmVudCBbZGVyaXZlZF0oaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLyRkZXJpdmVkKSBvciBbZWZmZWN0XShodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUvJGVmZmVjdCkgcmUtcnVucyBvciBpcyBkZXN0cm95ZWQuXG4gKlxuICogTXVzdCBiZSBjYWxsZWQgd2hpbGUgYSBkZXJpdmVkIG9yIGVmZmVjdCBpcyBydW5uaW5nLlxuICpcbiAqIGBgYHN2ZWx0ZVxuICogPHNjcmlwdD5cbiAqIFx0aW1wb3J0IHsgZ2V0QWJvcnRTaWduYWwgfSBmcm9tICdzdmVsdGUnO1xuICpcbiAqIFx0bGV0IHsgaWQgfSA9ICRwcm9wcygpO1xuICpcbiAqIFx0YXN5bmMgZnVuY3Rpb24gZ2V0RGF0YShpZCkge1xuICogXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYC9pdGVtcy8ke2lkfWAsIHtcbiAqIFx0XHRcdHNpZ25hbDogZ2V0QWJvcnRTaWduYWwoKVxuICogXHRcdH0pO1xuICpcbiAqIFx0XHRyZXR1cm4gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICogXHR9XG4gKlxuICogXHRjb25zdCBkYXRhID0gJGRlcml2ZWQoYXdhaXQgZ2V0RGF0YShpZCkpO1xuICogPC9zY3JpcHQ+XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFib3J0U2lnbmFsKCkge1xuXHRpZiAoYWN0aXZlX3JlYWN0aW9uID09PSBudWxsKSB7XG5cdFx0ZS5nZXRfYWJvcnRfc2lnbmFsX291dHNpZGVfcmVhY3Rpb24oKTtcblx0fVxuXG5cdHJldHVybiAoYWN0aXZlX3JlYWN0aW9uLmFjID8/PSBuZXcgQWJvcnRDb250cm9sbGVyKCkpLnNpZ25hbDtcbn1cblxuLyoqXG4gKiBgb25Nb3VudGAsIGxpa2UgW2AkZWZmZWN0YF0oaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLyRlZmZlY3QpLCBzY2hlZHVsZXMgYSBmdW5jdGlvbiB0byBydW4gYXMgc29vbiBhcyB0aGUgY29tcG9uZW50IGhhcyBiZWVuIG1vdW50ZWQgdG8gdGhlIERPTS5cbiAqIFVubGlrZSBgJGVmZmVjdGAsIHRoZSBwcm92aWRlZCBmdW5jdGlvbiBvbmx5IHJ1bnMgb25jZS5cbiAqXG4gKiBJdCBtdXN0IGJlIGNhbGxlZCBkdXJpbmcgdGhlIGNvbXBvbmVudCdzIGluaXRpYWxpc2F0aW9uIChidXQgZG9lc24ndCBuZWVkIHRvIGxpdmUgX2luc2lkZV8gdGhlIGNvbXBvbmVudDtcbiAqIGl0IGNhbiBiZSBjYWxsZWQgZnJvbSBhbiBleHRlcm5hbCBtb2R1bGUpLiBJZiBhIGZ1bmN0aW9uIGlzIHJldHVybmVkIF9zeW5jaHJvbm91c2x5XyBmcm9tIGBvbk1vdW50YCxcbiAqIGl0IHdpbGwgYmUgY2FsbGVkIHdoZW4gdGhlIGNvbXBvbmVudCBpcyB1bm1vdW50ZWQuXG4gKlxuICogYG9uTW91bnRgIGZ1bmN0aW9ucyBkbyBub3QgcnVuIGR1cmluZyBbc2VydmVyLXNpZGUgcmVuZGVyaW5nXShodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUvc3ZlbHRlLXNlcnZlciNyZW5kZXIpLlxuICpcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0geygpID0+IE5vdEZ1bmN0aW9uPFQ+IHwgUHJvbWlzZTxOb3RGdW5jdGlvbjxUPj4gfCAoKCkgPT4gYW55KX0gZm5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gb25Nb3VudChmbikge1xuXHRpZiAoY29tcG9uZW50X2NvbnRleHQgPT09IG51bGwpIHtcblx0XHRlLmxpZmVjeWNsZV9vdXRzaWRlX2NvbXBvbmVudCgnb25Nb3VudCcpO1xuXHR9XG5cblx0aWYgKGxlZ2FjeV9tb2RlX2ZsYWcgJiYgY29tcG9uZW50X2NvbnRleHQubCAhPT0gbnVsbCkge1xuXHRcdGluaXRfdXBkYXRlX2NhbGxiYWNrcyhjb21wb25lbnRfY29udGV4dCkubS5wdXNoKGZuKTtcblx0fSBlbHNlIHtcblx0XHR1c2VyX2VmZmVjdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGVhbnVwID0gdW50cmFjayhmbik7XG5cdFx0XHRpZiAodHlwZW9mIGNsZWFudXAgPT09ICdmdW5jdGlvbicpIHJldHVybiAvKiogQHR5cGUgeygpID0+IHZvaWR9ICovIChjbGVhbnVwKTtcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFNjaGVkdWxlcyBhIGNhbGxiYWNrIHRvIHJ1biBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGNvbXBvbmVudCBpcyB1bm1vdW50ZWQuXG4gKlxuICogT3V0IG9mIGBvbk1vdW50YCwgYGJlZm9yZVVwZGF0ZWAsIGBhZnRlclVwZGF0ZWAgYW5kIGBvbkRlc3Ryb3lgLCB0aGlzIGlzIHRoZVxuICogb25seSBvbmUgdGhhdCBydW5zIGluc2lkZSBhIHNlcnZlci1zaWRlIGNvbXBvbmVudC5cbiAqXG4gKiBAcGFyYW0geygpID0+IGFueX0gZm5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gb25EZXN0cm95KGZuKSB7XG5cdGlmIChjb21wb25lbnRfY29udGV4dCA9PT0gbnVsbCkge1xuXHRcdGUubGlmZWN5Y2xlX291dHNpZGVfY29tcG9uZW50KCdvbkRlc3Ryb3knKTtcblx0fVxuXG5cdG9uTW91bnQoKCkgPT4gKCkgPT4gdW50cmFjayhmbikpO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBbVD1hbnldXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtUfSBbZGV0YWlsXVxuICogQHBhcmFtIHthbnl9cGFyYW1zXzBcbiAqIEByZXR1cm5zIHtDdXN0b21FdmVudDxUPn1cbiAqL1xuZnVuY3Rpb24gY3JlYXRlX2N1c3RvbV9ldmVudCh0eXBlLCBkZXRhaWwsIHsgYnViYmxlcyA9IGZhbHNlLCBjYW5jZWxhYmxlID0gZmFsc2UgfSA9IHt9KSB7XG5cdHJldHVybiBuZXcgQ3VzdG9tRXZlbnQodHlwZSwgeyBkZXRhaWwsIGJ1YmJsZXMsIGNhbmNlbGFibGUgfSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBldmVudCBkaXNwYXRjaGVyIHRoYXQgY2FuIGJlIHVzZWQgdG8gZGlzcGF0Y2ggW2NvbXBvbmVudCBldmVudHNdKGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS9sZWdhY3ktb24jQ29tcG9uZW50LWV2ZW50cykuXG4gKiBFdmVudCBkaXNwYXRjaGVycyBhcmUgZnVuY3Rpb25zIHRoYXQgY2FuIHRha2UgdHdvIGFyZ3VtZW50czogYG5hbWVgIGFuZCBgZGV0YWlsYC5cbiAqXG4gKiBDb21wb25lbnQgZXZlbnRzIGNyZWF0ZWQgd2l0aCBgY3JlYXRlRXZlbnREaXNwYXRjaGVyYCBjcmVhdGUgYVxuICogW0N1c3RvbUV2ZW50XShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQ3VzdG9tRXZlbnQpLlxuICogVGhlc2UgZXZlbnRzIGRvIG5vdCBbYnViYmxlXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL0xlYXJuL0phdmFTY3JpcHQvQnVpbGRpbmdfYmxvY2tzL0V2ZW50cyNFdmVudF9idWJibGluZ19hbmRfY2FwdHVyZSkuXG4gKiBUaGUgYGRldGFpbGAgYXJndW1lbnQgY29ycmVzcG9uZHMgdG8gdGhlIFtDdXN0b21FdmVudC5kZXRhaWxdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9DdXN0b21FdmVudC9kZXRhaWwpXG4gKiBwcm9wZXJ0eSBhbmQgY2FuIGNvbnRhaW4gYW55IHR5cGUgb2YgZGF0YS5cbiAqXG4gKiBUaGUgZXZlbnQgZGlzcGF0Y2hlciBjYW4gYmUgdHlwZWQgdG8gbmFycm93IHRoZSBhbGxvd2VkIGV2ZW50IG5hbWVzIGFuZCB0aGUgdHlwZSBvZiB0aGUgYGRldGFpbGAgYXJndW1lbnQ6XG4gKiBgYGB0c1xuICogY29uc3QgZGlzcGF0Y2ggPSBjcmVhdGVFdmVudERpc3BhdGNoZXI8e1xuICogIGxvYWRlZDogbnVsbDsgLy8gZG9lcyBub3QgdGFrZSBhIGRldGFpbCBhcmd1bWVudFxuICogIGNoYW5nZTogc3RyaW5nOyAvLyB0YWtlcyBhIGRldGFpbCBhcmd1bWVudCBvZiB0eXBlIHN0cmluZywgd2hpY2ggaXMgcmVxdWlyZWRcbiAqICBvcHRpb25hbDogbnVtYmVyIHwgbnVsbDsgLy8gdGFrZXMgYW4gb3B0aW9uYWwgZGV0YWlsIGFyZ3VtZW50IG9mIHR5cGUgbnVtYmVyXG4gKiB9PigpO1xuICogYGBgXG4gKlxuICogQGRlcHJlY2F0ZWQgVXNlIGNhbGxiYWNrIHByb3BzIGFuZC9vciB0aGUgYCRob3N0KClgIHJ1bmUgaW5zdGVhZCDigJQgc2VlIFttaWdyYXRpb24gZ3VpZGVdKGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS92NS1taWdyYXRpb24tZ3VpZGUjRXZlbnQtY2hhbmdlcy1Db21wb25lbnQtZXZlbnRzKVxuICogQHRlbXBsYXRlIHtSZWNvcmQ8c3RyaW5nLCBhbnk+fSBbRXZlbnRNYXAgPSBhbnldXG4gKiBAcmV0dXJucyB7RXZlbnREaXNwYXRjaGVyPEV2ZW50TWFwPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUV2ZW50RGlzcGF0Y2hlcigpIHtcblx0Y29uc3QgYWN0aXZlX2NvbXBvbmVudF9jb250ZXh0ID0gY29tcG9uZW50X2NvbnRleHQ7XG5cdGlmIChhY3RpdmVfY29tcG9uZW50X2NvbnRleHQgPT09IG51bGwpIHtcblx0XHRlLmxpZmVjeWNsZV9vdXRzaWRlX2NvbXBvbmVudCgnY3JlYXRlRXZlbnREaXNwYXRjaGVyJyk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIFtkZXRhaWxdXG5cdCAqIEBwYXJhbSBbb3B0aW9uc11cblx0ICovXG5cdHJldHVybiAodHlwZSwgZGV0YWlsLCBvcHRpb25zKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzID0gLyoqIEB0eXBlIHtSZWNvcmQ8c3RyaW5nLCBGdW5jdGlvbiB8IEZ1bmN0aW9uW10+fSAqLyAoXG5cdFx0XHRhY3RpdmVfY29tcG9uZW50X2NvbnRleHQucy4kJGV2ZW50c1xuXHRcdCk/LlsvKiogQHR5cGUge3N0cmluZ30gKi8gKHR5cGUpXTtcblxuXHRcdGlmIChldmVudHMpIHtcblx0XHRcdGNvbnN0IGNhbGxiYWNrcyA9IGlzX2FycmF5KGV2ZW50cykgPyBldmVudHMuc2xpY2UoKSA6IFtldmVudHNdO1xuXHRcdFx0Ly8gVE9ETyBhcmUgdGhlcmUgc2l0dWF0aW9ucyB3aGVyZSBldmVudHMgY291bGQgYmUgZGlzcGF0Y2hlZFxuXHRcdFx0Ly8gaW4gYSBzZXJ2ZXIgKG5vbi1ET00pIGVudmlyb25tZW50P1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBjcmVhdGVfY3VzdG9tX2V2ZW50KC8qKiBAdHlwZSB7c3RyaW5nfSAqLyAodHlwZSksIGRldGFpbCwgb3B0aW9ucyk7XG5cdFx0XHRmb3IgKGNvbnN0IGZuIG9mIGNhbGxiYWNrcykge1xuXHRcdFx0XHRmbi5jYWxsKGFjdGl2ZV9jb21wb25lbnRfY29udGV4dC54LCBldmVudCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gIWV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH07XG59XG5cbi8vIFRPRE8gbWFyayBiZWZvcmVVcGRhdGUgYW5kIGFmdGVyVXBkYXRlIGFzIGRlcHJlY2F0ZWQgaW4gU3ZlbHRlIDZcblxuLyoqXG4gKiBTY2hlZHVsZXMgYSBjYWxsYmFjayB0byBydW4gaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBjb21wb25lbnQgaXMgdXBkYXRlZCBhZnRlciBhbnkgc3RhdGUgY2hhbmdlLlxuICpcbiAqIFRoZSBmaXJzdCB0aW1lIHRoZSBjYWxsYmFjayBydW5zIHdpbGwgYmUgYmVmb3JlIHRoZSBpbml0aWFsIGBvbk1vdW50YC5cbiAqXG4gKiBJbiBydW5lcyBtb2RlIHVzZSBgJGVmZmVjdC5wcmVgIGluc3RlYWQuXG4gKlxuICogQGRlcHJlY2F0ZWQgVXNlIFtgJGVmZmVjdC5wcmVgXShodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUvJGVmZmVjdCMkZWZmZWN0LnByZSkgaW5zdGVhZFxuICogQHBhcmFtIHsoKSA9PiB2b2lkfSBmblxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiZWZvcmVVcGRhdGUoZm4pIHtcblx0aWYgKGNvbXBvbmVudF9jb250ZXh0ID09PSBudWxsKSB7XG5cdFx0ZS5saWZlY3ljbGVfb3V0c2lkZV9jb21wb25lbnQoJ2JlZm9yZVVwZGF0ZScpO1xuXHR9XG5cblx0aWYgKGNvbXBvbmVudF9jb250ZXh0LmwgPT09IG51bGwpIHtcblx0XHRlLmxpZmVjeWNsZV9sZWdhY3lfb25seSgnYmVmb3JlVXBkYXRlJyk7XG5cdH1cblxuXHRpbml0X3VwZGF0ZV9jYWxsYmFja3MoY29tcG9uZW50X2NvbnRleHQpLmIucHVzaChmbik7XG59XG5cbi8qKlxuICogU2NoZWR1bGVzIGEgY2FsbGJhY2sgdG8gcnVuIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBjb21wb25lbnQgaGFzIGJlZW4gdXBkYXRlZC5cbiAqXG4gKiBUaGUgZmlyc3QgdGltZSB0aGUgY2FsbGJhY2sgcnVucyB3aWxsIGJlIGFmdGVyIHRoZSBpbml0aWFsIGBvbk1vdW50YC5cbiAqXG4gKiBJbiBydW5lcyBtb2RlIHVzZSBgJGVmZmVjdGAgaW5zdGVhZC5cbiAqXG4gKiBAZGVwcmVjYXRlZCBVc2UgW2AkZWZmZWN0YF0oaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLyRlZmZlY3QpIGluc3RlYWRcbiAqIEBwYXJhbSB7KCkgPT4gdm9pZH0gZm5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYWZ0ZXJVcGRhdGUoZm4pIHtcblx0aWYgKGNvbXBvbmVudF9jb250ZXh0ID09PSBudWxsKSB7XG5cdFx0ZS5saWZlY3ljbGVfb3V0c2lkZV9jb21wb25lbnQoJ2FmdGVyVXBkYXRlJyk7XG5cdH1cblxuXHRpZiAoY29tcG9uZW50X2NvbnRleHQubCA9PT0gbnVsbCkge1xuXHRcdGUubGlmZWN5Y2xlX2xlZ2FjeV9vbmx5KCdhZnRlclVwZGF0ZScpO1xuXHR9XG5cblx0aW5pdF91cGRhdGVfY2FsbGJhY2tzKGNvbXBvbmVudF9jb250ZXh0KS5hLnB1c2goZm4pO1xufVxuXG4vKipcbiAqIExlZ2FjeS1tb2RlOiBJbml0IGNhbGxiYWNrcyBvYmplY3QgZm9yIG9uTW91bnQvYmVmb3JlVXBkYXRlL2FmdGVyVXBkYXRlXG4gKiBAcGFyYW0ge0NvbXBvbmVudENvbnRleHR9IGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gaW5pdF91cGRhdGVfY2FsbGJhY2tzKGNvbnRleHQpIHtcblx0dmFyIGwgPSAvKiogQHR5cGUge0NvbXBvbmVudENvbnRleHRMZWdhY3l9ICovIChjb250ZXh0KS5sO1xuXHRyZXR1cm4gKGwudSA/Pz0geyBhOiBbXSwgYjogW10sIG06IFtdIH0pO1xufVxuXG5leHBvcnQgeyBmbHVzaFN5bmMsIGZvcmsgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC9yZWFjdGl2aXR5L2JhdGNoLmpzJztcbmV4cG9ydCB7XG5cdGNyZWF0ZUNvbnRleHQsXG5cdGdldENvbnRleHQsXG5cdGdldEFsbENvbnRleHRzLFxuXHRoYXNDb250ZXh0LFxuXHRzZXRDb250ZXh0XG59IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L2NvbnRleHQuanMnO1xuZXhwb3J0IHsgaHlkcmF0YWJsZSB9IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L2h5ZHJhdGFibGUuanMnO1xuZXhwb3J0IHsgaHlkcmF0ZSwgbW91bnQsIHVubW91bnQgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC9yZW5kZXIuanMnO1xuZXhwb3J0IHsgdGljaywgdW50cmFjaywgc2V0dGxlZCB9IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L3J1bnRpbWUuanMnO1xuZXhwb3J0IHsgY3JlYXRlUmF3U25pcHBldCB9IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50L2RvbS9ibG9ja3Mvc25pcHBldC5qcyc7XG4iLCIvKiogQGltcG9ydCB7IFNvdXJjZUxvY2F0aW9uIH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IENPTU1FTlRfTk9ERSwgRE9DVU1FTlRfRlJBR01FTlRfTk9ERSwgRUxFTUVOVF9OT0RFIH0gZnJvbSAnI2NsaWVudC9jb25zdGFudHMnO1xuaW1wb3J0IHsgSFlEUkFUSU9OX0VORCwgSFlEUkFUSU9OX1NUQVJULCBIWURSQVRJT05fU1RBUlRfRUxTRSB9IGZyb20gJy4uLy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBoeWRyYXRpbmcgfSBmcm9tICcuLi9kb20vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7IGRldl9zdGFjayB9IGZyb20gJy4uL2NvbnRleHQuanMnO1xuXG4vKipcbiAqIEBwYXJhbSB7YW55fSBmblxuICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gKiBAcGFyYW0ge1NvdXJjZUxvY2F0aW9uW119IGxvY2F0aW9uc1xuICogQHJldHVybnMge2FueX1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkZF9sb2NhdGlvbnMoZm4sIGZpbGVuYW1lLCBsb2NhdGlvbnMpIHtcblx0cmV0dXJuICgvKiogQHR5cGUge2FueVtdfSAqLyAuLi5hcmdzKSA9PiB7XG5cdFx0Y29uc3QgZG9tID0gZm4oLi4uYXJncyk7XG5cblx0XHR2YXIgbm9kZSA9IGh5ZHJhdGluZyA/IGRvbSA6IGRvbS5ub2RlVHlwZSA9PT0gRE9DVU1FTlRfRlJBR01FTlRfTk9ERSA/IGRvbS5maXJzdENoaWxkIDogZG9tO1xuXHRcdGFzc2lnbl9sb2NhdGlvbnMobm9kZSwgZmlsZW5hbWUsIGxvY2F0aW9ucyk7XG5cblx0XHRyZXR1cm4gZG9tO1xuXHR9O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gKiBAcGFyYW0ge1NvdXJjZUxvY2F0aW9ufSBsb2NhdGlvblxuICovXG5mdW5jdGlvbiBhc3NpZ25fbG9jYXRpb24oZWxlbWVudCwgZmlsZW5hbWUsIGxvY2F0aW9uKSB7XG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0ZWxlbWVudC5fX3N2ZWx0ZV9tZXRhID0ge1xuXHRcdHBhcmVudDogZGV2X3N0YWNrLFxuXHRcdGxvYzogeyBmaWxlOiBmaWxlbmFtZSwgbGluZTogbG9jYXRpb25bMF0sIGNvbHVtbjogbG9jYXRpb25bMV0gfVxuXHR9O1xuXG5cdGlmIChsb2NhdGlvblsyXSkge1xuXHRcdGFzc2lnbl9sb2NhdGlvbnMoZWxlbWVudC5maXJzdENoaWxkLCBmaWxlbmFtZSwgbG9jYXRpb25bMl0pO1xuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtOb2RlIHwgbnVsbH0gbm9kZVxuICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gKiBAcGFyYW0ge1NvdXJjZUxvY2F0aW9uW119IGxvY2F0aW9uc1xuICovXG5mdW5jdGlvbiBhc3NpZ25fbG9jYXRpb25zKG5vZGUsIGZpbGVuYW1lLCBsb2NhdGlvbnMpIHtcblx0dmFyIGkgPSAwO1xuXHR2YXIgZGVwdGggPSAwO1xuXG5cdHdoaWxlIChub2RlICYmIGkgPCBsb2NhdGlvbnMubGVuZ3RoKSB7XG5cdFx0aWYgKGh5ZHJhdGluZyAmJiBub2RlLm5vZGVUeXBlID09PSBDT01NRU5UX05PREUpIHtcblx0XHRcdHZhciBjb21tZW50ID0gLyoqIEB0eXBlIHtDb21tZW50fSAqLyAobm9kZSk7XG5cdFx0XHRpZiAoY29tbWVudC5kYXRhID09PSBIWURSQVRJT05fU1RBUlQgfHwgY29tbWVudC5kYXRhID09PSBIWURSQVRJT05fU1RBUlRfRUxTRSkgZGVwdGggKz0gMTtcblx0XHRcdGVsc2UgaWYgKGNvbW1lbnQuZGF0YVswXSA9PT0gSFlEUkFUSU9OX0VORCkgZGVwdGggLT0gMTtcblx0XHR9XG5cblx0XHRpZiAoZGVwdGggPT09IDAgJiYgbm9kZS5ub2RlVHlwZSA9PT0gRUxFTUVOVF9OT0RFKSB7XG5cdFx0XHRhc3NpZ25fbG9jYXRpb24oLyoqIEB0eXBlIHtFbGVtZW50fSAqLyAobm9kZSksIGZpbGVuYW1lLCBsb2NhdGlvbnNbaSsrXSk7XG5cdFx0fVxuXG5cdFx0bm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7XG5cdH1cbn1cbiIsImltcG9ydCAqIGFzIGUgZnJvbSAnLi4vZXJyb3JzLmpzJztcbmltcG9ydCB7IGNvbXBvbmVudF9jb250ZXh0IH0gZnJvbSAnLi4vY29udGV4dC5qcyc7XG5pbXBvcnQgeyBGSUxFTkFNRSB9IGZyb20gJy4uLy4uLy4uL2NvbnN0YW50cy5qcyc7XG5cbi8qKiBAcGFyYW0ge0Z1bmN0aW9uICYgeyBbRklMRU5BTUVdOiBzdHJpbmcgfX0gdGFyZ2V0ICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tfdGFyZ2V0KHRhcmdldCkge1xuXHRpZiAodGFyZ2V0KSB7XG5cdFx0ZS5jb21wb25lbnRfYXBpX2ludmFsaWRfbmV3KHRhcmdldFtGSUxFTkFNRV0gPz8gJ2EgY29tcG9uZW50JywgdGFyZ2V0Lm5hbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsZWdhY3lfYXBpKCkge1xuXHRjb25zdCBjb21wb25lbnQgPSBjb21wb25lbnRfY29udGV4dD8uZnVuY3Rpb247XG5cblx0LyoqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2QgKi9cblx0ZnVuY3Rpb24gZXJyb3IobWV0aG9kKSB7XG5cdFx0ZS5jb21wb25lbnRfYXBpX2NoYW5nZWQobWV0aG9kLCBjb21wb25lbnRbRklMRU5BTUVdKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0JGRlc3Ryb3k6ICgpID0+IGVycm9yKCckZGVzdHJveSgpJyksXG5cdFx0JG9uOiAoKSA9PiBlcnJvcignJG9uKC4uLiknKSxcblx0XHQkc2V0OiAoKSA9PiBlcnJvcignJHNldCguLi4pJylcblx0fTtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgVGVtcGxhdGVOb2RlIH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IEVGRkVDVF9UUkFOU1BBUkVOVCB9IGZyb20gJyNjbGllbnQvY29uc3RhbnRzJztcbmltcG9ydCB7XG5cdGh5ZHJhdGVfbmV4dCxcblx0aHlkcmF0aW5nLFxuXHRyZWFkX2h5ZHJhdGlvbl9pbnN0cnVjdGlvbixcblx0c2tpcF9ub2Rlcyxcblx0c2V0X2h5ZHJhdGVfbm9kZSxcblx0c2V0X2h5ZHJhdGluZ1xufSBmcm9tICcuLi9oeWRyYXRpb24uanMnO1xuaW1wb3J0IHsgYmxvY2sgfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHsgSFlEUkFUSU9OX1NUQVJUX0VMU0UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQnJhbmNoTWFuYWdlciB9IGZyb20gJy4vYnJhbmNoZXMuanMnO1xuXG4vLyBUT0RPIHJlaW5zdGF0ZSBodHRwczovL2dpdGh1Yi5jb20vc3ZlbHRlanMvc3ZlbHRlL3B1bGwvMTUyNTBcblxuLyoqXG4gKiBAcGFyYW0ge1RlbXBsYXRlTm9kZX0gbm9kZVxuICogQHBhcmFtIHsoYnJhbmNoOiAoZm46IChhbmNob3I6IE5vZGUpID0+IHZvaWQsIGZsYWc/OiBib29sZWFuKSA9PiB2b2lkKSA9PiB2b2lkfSBmblxuICogQHBhcmFtIHtib29sZWFufSBbZWxzZWlmXSBUcnVlIGlmIHRoaXMgaXMgYW4gYHs6ZWxzZSBpZiAuLi59YCBibG9jayByYXRoZXIgdGhhbiBhbiBgeyNpZiAuLi59YCwgYXMgdGhhdCBhZmZlY3RzIHdoaWNoIHRyYW5zaXRpb25zIGFyZSBjb25zaWRlcmVkICdsb2NhbCdcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gaWZfYmxvY2sobm9kZSwgZm4sIGVsc2VpZiA9IGZhbHNlKSB7XG5cdGlmIChoeWRyYXRpbmcpIHtcblx0XHRoeWRyYXRlX25leHQoKTtcblx0fVxuXG5cdHZhciBicmFuY2hlcyA9IG5ldyBCcmFuY2hNYW5hZ2VyKG5vZGUpO1xuXHR2YXIgZmxhZ3MgPSBlbHNlaWYgPyBFRkZFQ1RfVFJBTlNQQVJFTlQgOiAwO1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGNvbmRpdGlvbixcblx0ICogQHBhcmFtIHtudWxsIHwgKChhbmNob3I6IE5vZGUpID0+IHZvaWQpfSBmblxuXHQgKi9cblx0ZnVuY3Rpb24gdXBkYXRlX2JyYW5jaChjb25kaXRpb24sIGZuKSB7XG5cdFx0aWYgKGh5ZHJhdGluZykge1xuXHRcdFx0Y29uc3QgaXNfZWxzZSA9IHJlYWRfaHlkcmF0aW9uX2luc3RydWN0aW9uKG5vZGUpID09PSBIWURSQVRJT05fU1RBUlRfRUxTRTtcblxuXHRcdFx0aWYgKGNvbmRpdGlvbiA9PT0gaXNfZWxzZSkge1xuXHRcdFx0XHQvLyBIeWRyYXRpb24gbWlzbWF0Y2g6IHJlbW92ZSBldmVyeXRoaW5nIGluc2lkZSB0aGUgYW5jaG9yIGFuZCBzdGFydCBmcmVzaC5cblx0XHRcdFx0Ly8gVGhpcyBjb3VsZCBoYXBwZW4gd2l0aCBgeyNpZiBicm93c2VyfS4uLnsvaWZ9YCwgZm9yIGV4YW1wbGVcblx0XHRcdFx0dmFyIGFuY2hvciA9IHNraXBfbm9kZXMoKTtcblxuXHRcdFx0XHRzZXRfaHlkcmF0ZV9ub2RlKGFuY2hvcik7XG5cdFx0XHRcdGJyYW5jaGVzLmFuY2hvciA9IGFuY2hvcjtcblxuXHRcdFx0XHRzZXRfaHlkcmF0aW5nKGZhbHNlKTtcblx0XHRcdFx0YnJhbmNoZXMuZW5zdXJlKGNvbmRpdGlvbiwgZm4pO1xuXHRcdFx0XHRzZXRfaHlkcmF0aW5nKHRydWUpO1xuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRicmFuY2hlcy5lbnN1cmUoY29uZGl0aW9uLCBmbik7XG5cdH1cblxuXHRibG9jaygoKSA9PiB7XG5cdFx0dmFyIGhhc19icmFuY2ggPSBmYWxzZTtcblxuXHRcdGZuKChmbiwgZmxhZyA9IHRydWUpID0+IHtcblx0XHRcdGhhc19icmFuY2ggPSB0cnVlO1xuXHRcdFx0dXBkYXRlX2JyYW5jaChmbGFnLCBmbik7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWhhc19icmFuY2gpIHtcblx0XHRcdHVwZGF0ZV9icmFuY2goZmFsc2UsIG51bGwpO1xuXHRcdH1cblx0fSwgZmxhZ3MpO1xufVxuIiwiaW1wb3J0IHsgaHlkcmF0ZV9uZXh0LCBoeWRyYXRpbmcgfSBmcm9tICcuLi9oeWRyYXRpb24uanMnO1xuXG4vKipcbiAqIEBwYXJhbSB7Q29tbWVudH0gYW5jaG9yXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59ICQkcHJvcHNcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIHVua25vd24+fSBzbG90X3Byb3BzXG4gKiBAcGFyYW0ge251bGwgfCAoKGFuY2hvcjogQ29tbWVudCkgPT4gdm9pZCl9IGZhbGxiYWNrX2ZuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbG90KGFuY2hvciwgJCRwcm9wcywgbmFtZSwgc2xvdF9wcm9wcywgZmFsbGJhY2tfZm4pIHtcblx0aWYgKGh5ZHJhdGluZykge1xuXHRcdGh5ZHJhdGVfbmV4dCgpO1xuXHR9XG5cblx0dmFyIHNsb3RfZm4gPSAkJHByb3BzLiQkc2xvdHM/LltuYW1lXTtcblx0Ly8gSW50ZXJvcDogQ2FuIHVzZSBzbmlwcGV0cyB0byBmaWxsIHNsb3RzXG5cdHZhciBpc19pbnRlcm9wID0gZmFsc2U7XG5cdGlmIChzbG90X2ZuID09PSB0cnVlKSB7XG5cdFx0c2xvdF9mbiA9ICQkcHJvcHNbbmFtZSA9PT0gJ2RlZmF1bHQnID8gJ2NoaWxkcmVuJyA6IG5hbWVdO1xuXHRcdGlzX2ludGVyb3AgPSB0cnVlO1xuXHR9XG5cblx0aWYgKHNsb3RfZm4gPT09IHVuZGVmaW5lZCkge1xuXHRcdGlmIChmYWxsYmFja19mbiAhPT0gbnVsbCkge1xuXHRcdFx0ZmFsbGJhY2tfZm4oYW5jaG9yKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0c2xvdF9mbihhbmNob3IsIGlzX2ludGVyb3AgPyAoKSA9PiBzbG90X3Byb3BzIDogc2xvdF9wcm9wcyk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IHByb3BzXG4gKiBAcmV0dXJucyB7UmVjb3JkPHN0cmluZywgYm9vbGVhbj59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZV9zbG90cyhwcm9wcykge1xuXHQvKiogQHR5cGUge1JlY29yZDxzdHJpbmcsIGJvb2xlYW4+fSAqL1xuXHRjb25zdCBzYW5pdGl6ZWQgPSB7fTtcblx0aWYgKHByb3BzLmNoaWxkcmVuKSBzYW5pdGl6ZWQuZGVmYXVsdCA9IHRydWU7XG5cdGZvciAoY29uc3Qga2V5IGluIHByb3BzLiQkc2xvdHMpIHtcblx0XHRzYW5pdGl6ZWRba2V5XSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIHNhbml0aXplZDtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0LCBUZW1wbGF0ZU5vZGUgfSBmcm9tICcjY2xpZW50JyAqL1xuaW1wb3J0IHsgRklMRU5BTUUsIE5BTUVTUEFDRV9TVkcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHtcblx0aHlkcmF0ZV9uZXh0LFxuXHRoeWRyYXRlX25vZGUsXG5cdGh5ZHJhdGluZyxcblx0c2V0X2h5ZHJhdGVfbm9kZSxcblx0c2V0X2h5ZHJhdGluZ1xufSBmcm9tICcuLi9oeWRyYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlX3RleHQsIGdldF9maXJzdF9jaGlsZCB9IGZyb20gJy4uL29wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgYmxvY2ssIHRlYXJkb3duIH0gZnJvbSAnLi4vLi4vcmVhY3Rpdml0eS9lZmZlY3RzLmpzJztcbmltcG9ydCB7IHNldF9zaG91bGRfaW50cm8gfSBmcm9tICcuLi8uLi9yZW5kZXIuanMnO1xuaW1wb3J0IHsgY3VycmVudF9lYWNoX2l0ZW0sIHNldF9jdXJyZW50X2VhY2hfaXRlbSB9IGZyb20gJy4vZWFjaC5qcyc7XG5pbXBvcnQgeyBhY3RpdmVfZWZmZWN0IH0gZnJvbSAnLi4vLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgeyBjb21wb25lbnRfY29udGV4dCwgZGV2X3N0YWNrIH0gZnJvbSAnLi4vLi4vY29udGV4dC5qcyc7XG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcbmltcG9ydCB7IEVGRkVDVF9UUkFOU1BBUkVOVCwgRUxFTUVOVF9OT0RFIH0gZnJvbSAnI2NsaWVudC9jb25zdGFudHMnO1xuaW1wb3J0IHsgYXNzaWduX25vZGVzIH0gZnJvbSAnLi4vdGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgaXNfcmF3X3RleHRfZWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IEJyYW5jaE1hbmFnZXIgfSBmcm9tICcuL2JyYW5jaGVzLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge0NvbW1lbnQgfCBFbGVtZW50fSBub2RlXG4gKiBAcGFyYW0geygpID0+IHN0cmluZ30gZ2V0X3RhZ1xuICogQHBhcmFtIHtib29sZWFufSBpc19zdmdcbiAqIEBwYXJhbSB7dW5kZWZpbmVkIHwgKChlbGVtZW50OiBFbGVtZW50LCBhbmNob3I6IE5vZGUgfCBudWxsKSA9PiB2b2lkKX0gcmVuZGVyX2ZuLFxuICogQHBhcmFtIHt1bmRlZmluZWQgfCAoKCkgPT4gc3RyaW5nKX0gZ2V0X25hbWVzcGFjZVxuICogQHBhcmFtIHt1bmRlZmluZWQgfCBbbnVtYmVyLCBudW1iZXJdfSBsb2NhdGlvblxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbGVtZW50KG5vZGUsIGdldF90YWcsIGlzX3N2ZywgcmVuZGVyX2ZuLCBnZXRfbmFtZXNwYWNlLCBsb2NhdGlvbikge1xuXHRsZXQgd2FzX2h5ZHJhdGluZyA9IGh5ZHJhdGluZztcblxuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0aHlkcmF0ZV9uZXh0KCk7XG5cdH1cblxuXHR2YXIgZmlsZW5hbWUgPSBERVYgJiYgbG9jYXRpb24gJiYgY29tcG9uZW50X2NvbnRleHQ/LmZ1bmN0aW9uW0ZJTEVOQU1FXTtcblxuXHQvKiogQHR5cGUge251bGwgfCBFbGVtZW50fSAqL1xuXHR2YXIgZWxlbWVudCA9IG51bGw7XG5cblx0aWYgKGh5ZHJhdGluZyAmJiBoeWRyYXRlX25vZGUubm9kZVR5cGUgPT09IEVMRU1FTlRfTk9ERSkge1xuXHRcdGVsZW1lbnQgPSAvKiogQHR5cGUge0VsZW1lbnR9ICovIChoeWRyYXRlX25vZGUpO1xuXHRcdGh5ZHJhdGVfbmV4dCgpO1xuXHR9XG5cblx0dmFyIGFuY2hvciA9IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoaHlkcmF0aW5nID8gaHlkcmF0ZV9ub2RlIDogbm9kZSk7XG5cblx0LyoqXG5cdCAqIFRoZSBrZXllZCBgeyNlYWNoIC4uLn1gIGl0ZW0gYmxvY2ssIGlmIGFueSwgdGhhdCB0aGlzIGVsZW1lbnQgaXMgaW5zaWRlLlxuXHQgKiBXZSB0cmFjayB0aGlzIHNvIHdlIGNhbiBzZXQgaXQgd2hlbiBjaGFuZ2luZyB0aGUgZWxlbWVudCwgYWxsb3dpbmcgYW55XG5cdCAqIGBhbmltYXRlOmAgZGlyZWN0aXZlIHRvIGJpbmQgaXRzZWxmIHRvIHRoZSBjb3JyZWN0IGJsb2NrXG5cdCAqL1xuXHR2YXIgZWFjaF9pdGVtX2Jsb2NrID0gY3VycmVudF9lYWNoX2l0ZW07XG5cblx0dmFyIGJyYW5jaGVzID0gbmV3IEJyYW5jaE1hbmFnZXIoYW5jaG9yLCBmYWxzZSk7XG5cblx0YmxvY2soKCkgPT4ge1xuXHRcdGNvbnN0IG5leHRfdGFnID0gZ2V0X3RhZygpIHx8IG51bGw7XG5cdFx0dmFyIG5zID0gZ2V0X25hbWVzcGFjZSA/IGdldF9uYW1lc3BhY2UoKSA6IGlzX3N2ZyB8fCBuZXh0X3RhZyA9PT0gJ3N2ZycgPyBOQU1FU1BBQ0VfU1ZHIDogbnVsbDtcblxuXHRcdGlmIChuZXh0X3RhZyA9PT0gbnVsbCkge1xuXHRcdFx0YnJhbmNoZXMuZW5zdXJlKG51bGwsIG51bGwpO1xuXHRcdFx0c2V0X3Nob3VsZF9pbnRybyh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRicmFuY2hlcy5lbnN1cmUobmV4dF90YWcsIChhbmNob3IpID0+IHtcblx0XHRcdC8vIFNlZSBleHBsYW5hdGlvbiBvZiBgZWFjaF9pdGVtX2Jsb2NrYCBhYm92ZVxuXHRcdFx0dmFyIHByZXZpb3VzX2VhY2hfaXRlbSA9IGN1cnJlbnRfZWFjaF9pdGVtO1xuXHRcdFx0c2V0X2N1cnJlbnRfZWFjaF9pdGVtKGVhY2hfaXRlbV9ibG9jayk7XG5cblx0XHRcdGlmIChuZXh0X3RhZykge1xuXHRcdFx0XHRlbGVtZW50ID0gaHlkcmF0aW5nXG5cdFx0XHRcdFx0PyAvKiogQHR5cGUge0VsZW1lbnR9ICovIChlbGVtZW50KVxuXHRcdFx0XHRcdDogbnNcblx0XHRcdFx0XHRcdD8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCBuZXh0X3RhZylcblx0XHRcdFx0XHRcdDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudChuZXh0X3RhZyk7XG5cblx0XHRcdFx0aWYgKERFViAmJiBsb2NhdGlvbikge1xuXHRcdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0XHRlbGVtZW50Ll9fc3ZlbHRlX21ldGEgPSB7XG5cdFx0XHRcdFx0XHRwYXJlbnQ6IGRldl9zdGFjayxcblx0XHRcdFx0XHRcdGxvYzoge1xuXHRcdFx0XHRcdFx0XHRmaWxlOiBmaWxlbmFtZSxcblx0XHRcdFx0XHRcdFx0bGluZTogbG9jYXRpb25bMF0sXG5cdFx0XHRcdFx0XHRcdGNvbHVtbjogbG9jYXRpb25bMV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXNzaWduX25vZGVzKGVsZW1lbnQsIGVsZW1lbnQpO1xuXG5cdFx0XHRcdGlmIChyZW5kZXJfZm4pIHtcblx0XHRcdFx0XHRpZiAoaHlkcmF0aW5nICYmIGlzX3Jhd190ZXh0X2VsZW1lbnQobmV4dF90YWcpKSB7XG5cdFx0XHRcdFx0XHQvLyBwcmV2ZW50IGh5ZHJhdGlvbiBnbGl0Y2hlc1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5hcHBlbmQoZG9jdW1lbnQuY3JlYXRlQ29tbWVudCgnJykpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIElmIGh5ZHJhdGluZywgdXNlIHRoZSBleGlzdGluZyBzc3IgY29tbWVudCBhcyB0aGUgYW5jaG9yIHNvIHRoYXQgdGhlXG5cdFx0XHRcdFx0Ly8gaW5uZXIgb3BlbiBhbmQgY2xvc2UgbWV0aG9kcyBjYW4gcGljayB1cCB0aGUgZXhpc3Rpbmcgbm9kZXMgY29ycmVjdGx5XG5cdFx0XHRcdFx0dmFyIGNoaWxkX2FuY2hvciA9IC8qKiBAdHlwZSB7VGVtcGxhdGVOb2RlfSAqLyAoXG5cdFx0XHRcdFx0XHRoeWRyYXRpbmcgPyBnZXRfZmlyc3RfY2hpbGQoZWxlbWVudCkgOiBlbGVtZW50LmFwcGVuZENoaWxkKGNyZWF0ZV90ZXh0KCkpXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGlmIChoeWRyYXRpbmcpIHtcblx0XHRcdFx0XHRcdGlmIChjaGlsZF9hbmNob3IgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0c2V0X2h5ZHJhdGluZyhmYWxzZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzZXRfaHlkcmF0ZV9ub2RlKGNoaWxkX2FuY2hvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gYGNoaWxkX2FuY2hvcmAgaXMgdW5kZWZpbmVkIGlmIHRoaXMgaXMgYSB2b2lkIGVsZW1lbnQsIGJ1dCB3ZSBzdGlsbFxuXHRcdFx0XHRcdC8vIG5lZWQgdG8gY2FsbCBgcmVuZGVyX2ZuYCBpbiBvcmRlciB0byBydW4gYWN0aW9ucyBldGMuIElmIHRoZSBlbGVtZW50XG5cdFx0XHRcdFx0Ly8gY29udGFpbnMgY2hpbGRyZW4sIGl0J3MgYSB1c2VyIGVycm9yICh3aGljaCBpcyB3YXJuZWQgb24gZWxzZXdoZXJlKVxuXHRcdFx0XHRcdC8vIGFuZCB0aGUgRE9NIHdpbGwgYmUgc2lsZW50bHkgZGlzY2FyZGVkXG5cdFx0XHRcdFx0cmVuZGVyX2ZuKGVsZW1lbnQsIGNoaWxkX2FuY2hvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB3ZSBkbyB0aGlzIGFmdGVyIGNhbGxpbmcgYHJlbmRlcl9mbmAgc28gdGhhdCBjaGlsZCBlZmZlY3RzIGRvbid0IG92ZXJyaWRlIGBub2Rlcy5lbmRgXG5cdFx0XHRcdC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCkubm9kZXNfZW5kID0gZWxlbWVudDtcblxuXHRcdFx0XHRhbmNob3IuYmVmb3JlKGVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRfY3VycmVudF9lYWNoX2l0ZW0ocHJldmlvdXNfZWFjaF9pdGVtKTtcblxuXHRcdFx0aWYgKGh5ZHJhdGluZykge1xuXHRcdFx0XHRzZXRfaHlkcmF0ZV9ub2RlKGFuY2hvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyByZXZlcnQgdG8gdGhlIGRlZmF1bHQgc3RhdGUgYWZ0ZXIgdGhlIGVmZmVjdCBoYXMgYmVlbiBjcmVhdGVkXG5cdFx0c2V0X3Nob3VsZF9pbnRybyh0cnVlKTtcblxuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRpZiAobmV4dF90YWcpIHtcblx0XHRcdFx0Ly8gaWYgd2UncmUgaW4gdGhpcyBjYWxsYmFjayBiZWNhdXNlIHdlJ3JlIHJlLXJ1bm5pbmcgdGhlIGVmZmVjdCxcblx0XHRcdFx0Ly8gZGlzYWJsZSBpbnRyb3MgKHVubGVzcyBubyBlbGVtZW50IGlzIGN1cnJlbnRseSBkaXNwbGF5ZWQpXG5cdFx0XHRcdHNldF9zaG91bGRfaW50cm8oZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH0sIEVGRkVDVF9UUkFOU1BBUkVOVCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHNldF9zaG91bGRfaW50cm8odHJ1ZSk7XG5cdH0pO1xuXG5cdGlmICh3YXNfaHlkcmF0aW5nKSB7XG5cdFx0c2V0X2h5ZHJhdGluZyh0cnVlKTtcblx0XHRzZXRfaHlkcmF0ZV9ub2RlKGFuY2hvcik7XG5cdH1cbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0IH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IGJyYW5jaCwgZWZmZWN0LCBkZXN0cm95X2VmZmVjdCwgbWFuYWdlZCB9IGZyb20gJy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5cbi8vIFRPRE8gaW4gNi4wIG9yIDcuMCwgd2hlbiB3ZSByZW1vdmUgbGVnYWN5IG1vZGUsIHdlIGNhbiBzaW1wbGlmeSB0aGlzIGJ5XG4vLyBnZXR0aW5nIHJpZCBvZiB0aGUgYmxvY2svYnJhbmNoIHN0dWZmIGFuZCBqdXN0IGxldHRpbmcgdGhlIGVmZmVjdCByaXAuXG4vLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3N2ZWx0ZWpzL3N2ZWx0ZS9wdWxsLzE1OTYyXG5cbi8qKlxuICogQHBhcmFtIHtFbGVtZW50fSBub2RlXG4gKiBAcGFyYW0geygpID0+IChub2RlOiBFbGVtZW50KSA9PiB2b2lkfSBnZXRfZm5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF0dGFjaChub2RlLCBnZXRfZm4pIHtcblx0LyoqIEB0eXBlIHtmYWxzZSB8IHVuZGVmaW5lZCB8ICgobm9kZTogRWxlbWVudCkgPT4gdm9pZCl9ICovXG5cdHZhciBmbiA9IHVuZGVmaW5lZDtcblxuXHQvKiogQHR5cGUge0VmZmVjdCB8IG51bGx9ICovXG5cdHZhciBlO1xuXG5cdG1hbmFnZWQoKCkgPT4ge1xuXHRcdGlmIChmbiAhPT0gKGZuID0gZ2V0X2ZuKCkpKSB7XG5cdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRkZXN0cm95X2VmZmVjdChlKTtcblx0XHRcdFx0ZSA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmbikge1xuXHRcdFx0XHRlID0gYnJhbmNoKCgpID0+IHtcblx0XHRcdFx0XHRlZmZlY3QoKCkgPT4gLyoqIEB0eXBlIHsobm9kZTogRWxlbWVudCkgPT4gdm9pZH0gKi8gKGZuKShub2RlKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG4iLCJmdW5jdGlvbiByKGUpe3ZhciB0LGYsbj1cIlwiO2lmKFwic3RyaW5nXCI9PXR5cGVvZiBlfHxcIm51bWJlclwiPT10eXBlb2YgZSluKz1lO2Vsc2UgaWYoXCJvYmplY3RcIj09dHlwZW9mIGUpaWYoQXJyYXkuaXNBcnJheShlKSl7dmFyIG89ZS5sZW5ndGg7Zm9yKHQ9MDt0PG87dCsrKWVbdF0mJihmPXIoZVt0XSkpJiYobiYmKG4rPVwiIFwiKSxuKz1mKX1lbHNlIGZvcihmIGluIGUpZVtmXSYmKG4mJihuKz1cIiBcIiksbis9Zik7cmV0dXJuIG59ZXhwb3J0IGZ1bmN0aW9uIGNsc3goKXtmb3IodmFyIGUsdCxmPTAsbj1cIlwiLG89YXJndW1lbnRzLmxlbmd0aDtmPG87ZisrKShlPWFyZ3VtZW50c1tmXSkmJih0PXIoZSkpJiYobiYmKG4rPVwiIFwiKSxuKz10KTtyZXR1cm4gbn1leHBvcnQgZGVmYXVsdCBjbHN4OyIsImltcG9ydCB7IGVzY2FwZV9odG1sIH0gZnJvbSAnLi4vLi4vZXNjYXBpbmcuanMnO1xuaW1wb3J0IHsgY2xzeCBhcyBfY2xzeCB9IGZyb20gJ2Nsc3gnO1xuXG4vKipcbiAqIGA8ZGl2IHRyYW5zbGF0ZT17ZmFsc2V9PmAgc2hvdWxkIGJlIHJlbmRlcmVkIGFzIGA8ZGl2IHRyYW5zbGF0ZT1cIm5vXCI+YCBhbmQgX25vdF9cbiAqIGA8ZGl2IHRyYW5zbGF0ZT1cImZhbHNlXCI+YCwgd2hpY2ggaXMgZXF1aXZhbGVudCB0byBgPGRpdiB0cmFuc2xhdGU9XCJ5ZXNcIj5gLiBUaGVyZVxuICogbWF5IGJlIG90aGVyIG9kZCBjYXNlcyB0aGF0IG5lZWQgdG8gYmUgYWRkZWQgdG8gdGhpcyBsaXN0IGluIGZ1dHVyZVxuICogQHR5cGUge1JlY29yZDxzdHJpbmcsIE1hcDxhbnksIHN0cmluZz4+fVxuICovXG5jb25zdCByZXBsYWNlbWVudHMgPSB7XG5cdHRyYW5zbGF0ZTogbmV3IE1hcChbXG5cdFx0W3RydWUsICd5ZXMnXSxcblx0XHRbZmFsc2UsICdubyddXG5cdF0pXG59O1xuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtWfSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbaXNfYm9vbGVhbl1cbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhdHRyKG5hbWUsIHZhbHVlLCBpc19ib29sZWFuID0gZmFsc2UpIHtcblx0Ly8gYXR0cmlidXRlIGhpZGRlbiBmb3IgdmFsdWVzIG90aGVyIHRoYW4gXCJ1bnRpbC1mb3VuZFwiIGJlaGF2ZXMgbGlrZSBhIGJvb2xlYW4gYXR0cmlidXRlXG5cdGlmIChuYW1lID09PSAnaGlkZGVuJyAmJiB2YWx1ZSAhPT0gJ3VudGlsLWZvdW5kJykge1xuXHRcdGlzX2Jvb2xlYW4gPSB0cnVlO1xuXHR9XG5cdGlmICh2YWx1ZSA9PSBudWxsIHx8ICghdmFsdWUgJiYgaXNfYm9vbGVhbikpIHJldHVybiAnJztcblx0Y29uc3Qgbm9ybWFsaXplZCA9IChuYW1lIGluIHJlcGxhY2VtZW50cyAmJiByZXBsYWNlbWVudHNbbmFtZV0uZ2V0KHZhbHVlKSkgfHwgdmFsdWU7XG5cdGNvbnN0IGFzc2lnbm1lbnQgPSBpc19ib29sZWFuID8gJycgOiBgPVwiJHtlc2NhcGVfaHRtbChub3JtYWxpemVkLCB0cnVlKX1cImA7XG5cdHJldHVybiBgICR7bmFtZX0ke2Fzc2lnbm1lbnR9YDtcbn1cblxuLyoqXG4gKiBTbWFsbCB3cmFwcGVyIGFyb3VuZCBjbHN4IHRvIHByZXNlcnZlIFN2ZWx0ZSdzICh3ZWlyZCkgaGFuZGxpbmcgb2YgZmFsc3kgdmFsdWVzLlxuICogVE9ETyBTdmVsdGUgNiByZXZpc2l0IHRoaXMsIGFuZCBsaWtlbHkgdHVybiBhbGwgZmFsc3kgdmFsdWVzIGludG8gdGhlIGVtcHR5IHN0cmluZyAod2hhdCBjbHN4IGFsc28gZG9lcylcbiAqIEBwYXJhbSAge2FueX0gdmFsdWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsc3godmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gX2Nsc3godmFsdWUpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB2YWx1ZSA/PyAnJztcblx0fVxufVxuXG5jb25zdCB3aGl0ZXNwYWNlID0gWy4uLicgXFx0XFxuXFxyXFxmXFx1MDBhMFxcdTAwMGJcXHVmZWZmJ107XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZyB8IG51bGx9IFtoYXNoXVxuICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLCBib29sZWFuPn0gW2RpcmVjdGl2ZXNdXG4gKiBAcmV0dXJucyB7c3RyaW5nIHwgbnVsbH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvX2NsYXNzKHZhbHVlLCBoYXNoLCBkaXJlY3RpdmVzKSB7XG5cdHZhciBjbGFzc25hbWUgPSB2YWx1ZSA9PSBudWxsID8gJycgOiAnJyArIHZhbHVlO1xuXG5cdGlmIChoYXNoKSB7XG5cdFx0Y2xhc3NuYW1lID0gY2xhc3NuYW1lID8gY2xhc3NuYW1lICsgJyAnICsgaGFzaCA6IGhhc2g7XG5cdH1cblxuXHRpZiAoZGlyZWN0aXZlcykge1xuXHRcdGZvciAodmFyIGtleSBpbiBkaXJlY3RpdmVzKSB7XG5cdFx0XHRpZiAoZGlyZWN0aXZlc1trZXldKSB7XG5cdFx0XHRcdGNsYXNzbmFtZSA9IGNsYXNzbmFtZSA/IGNsYXNzbmFtZSArICcgJyArIGtleSA6IGtleTtcblx0XHRcdH0gZWxzZSBpZiAoY2xhc3NuYW1lLmxlbmd0aCkge1xuXHRcdFx0XHR2YXIgbGVuID0ga2V5Lmxlbmd0aDtcblx0XHRcdFx0dmFyIGEgPSAwO1xuXG5cdFx0XHRcdHdoaWxlICgoYSA9IGNsYXNzbmFtZS5pbmRleE9mKGtleSwgYSkpID49IDApIHtcblx0XHRcdFx0XHR2YXIgYiA9IGEgKyBsZW47XG5cblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHQoYSA9PT0gMCB8fCB3aGl0ZXNwYWNlLmluY2x1ZGVzKGNsYXNzbmFtZVthIC0gMV0pKSAmJlxuXHRcdFx0XHRcdFx0KGIgPT09IGNsYXNzbmFtZS5sZW5ndGggfHwgd2hpdGVzcGFjZS5pbmNsdWRlcyhjbGFzc25hbWVbYl0pKVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0Y2xhc3NuYW1lID0gKGEgPT09IDAgPyAnJyA6IGNsYXNzbmFtZS5zdWJzdHJpbmcoMCwgYSkpICsgY2xhc3NuYW1lLnN1YnN0cmluZyhiICsgMSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGEgPSBiO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBjbGFzc25hbWUgPT09ICcnID8gbnVsbCA6IGNsYXNzbmFtZTtcbn1cblxuLyoqXG4gKlxuICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLGFueT59IHN0eWxlc1xuICogQHBhcmFtIHtib29sZWFufSBpbXBvcnRhbnRcbiAqL1xuZnVuY3Rpb24gYXBwZW5kX3N0eWxlcyhzdHlsZXMsIGltcG9ydGFudCA9IGZhbHNlKSB7XG5cdHZhciBzZXBhcmF0b3IgPSBpbXBvcnRhbnQgPyAnICFpbXBvcnRhbnQ7JyA6ICc7Jztcblx0dmFyIGNzcyA9ICcnO1xuXG5cdGZvciAodmFyIGtleSBpbiBzdHlsZXMpIHtcblx0XHR2YXIgdmFsdWUgPSBzdHlsZXNba2V5XTtcblx0XHRpZiAodmFsdWUgIT0gbnVsbCAmJiB2YWx1ZSAhPT0gJycpIHtcblx0XHRcdGNzcyArPSAnICcgKyBrZXkgKyAnOiAnICsgdmFsdWUgKyBzZXBhcmF0b3I7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNzcztcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gdG9fY3NzX25hbWUobmFtZSkge1xuXHRpZiAobmFtZVswXSAhPT0gJy0nIHx8IG5hbWVbMV0gIT09ICctJykge1xuXHRcdHJldHVybiBuYW1lLnRvTG93ZXJDYXNlKCk7XG5cdH1cblx0cmV0dXJuIG5hbWU7XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IHZhbHVlXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT4gfCBbUmVjb3JkPHN0cmluZywgYW55PiwgUmVjb3JkPHN0cmluZywgYW55Pl19IFtzdHlsZXNdXG4gKiBAcmV0dXJucyB7c3RyaW5nIHwgbnVsbH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvX3N0eWxlKHZhbHVlLCBzdHlsZXMpIHtcblx0aWYgKHN0eWxlcykge1xuXHRcdHZhciBuZXdfc3R5bGUgPSAnJztcblxuXHRcdC8qKiBAdHlwZSB7UmVjb3JkPHN0cmluZyxhbnk+IHwgdW5kZWZpbmVkfSAqL1xuXHRcdHZhciBub3JtYWxfc3R5bGVzO1xuXG5cdFx0LyoqIEB0eXBlIHtSZWNvcmQ8c3RyaW5nLGFueT4gfCB1bmRlZmluZWR9ICovXG5cdFx0dmFyIGltcG9ydGFudF9zdHlsZXM7XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShzdHlsZXMpKSB7XG5cdFx0XHRub3JtYWxfc3R5bGVzID0gc3R5bGVzWzBdO1xuXHRcdFx0aW1wb3J0YW50X3N0eWxlcyA9IHN0eWxlc1sxXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm9ybWFsX3N0eWxlcyA9IHN0eWxlcztcblx0XHR9XG5cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHZhbHVlID0gU3RyaW5nKHZhbHVlKVxuXHRcdFx0XHQucmVwbGFjZUFsbCgvXFxzKlxcL1xcKi4qP1xcKlxcL1xccyovZywgJycpXG5cdFx0XHRcdC50cmltKCk7XG5cblx0XHRcdC8qKiBAdHlwZSB7Ym9vbGVhbiB8ICdcIicgfCBcIidcIn0gKi9cblx0XHRcdHZhciBpbl9zdHIgPSBmYWxzZTtcblx0XHRcdHZhciBpbl9hcG8gPSAwO1xuXHRcdFx0dmFyIGluX2NvbW1lbnQgPSBmYWxzZTtcblxuXHRcdFx0dmFyIHJlc2VydmVkX25hbWVzID0gW107XG5cblx0XHRcdGlmIChub3JtYWxfc3R5bGVzKSB7XG5cdFx0XHRcdHJlc2VydmVkX25hbWVzLnB1c2goLi4uT2JqZWN0LmtleXMobm9ybWFsX3N0eWxlcykubWFwKHRvX2Nzc19uYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW1wb3J0YW50X3N0eWxlcykge1xuXHRcdFx0XHRyZXNlcnZlZF9uYW1lcy5wdXNoKC4uLk9iamVjdC5rZXlzKGltcG9ydGFudF9zdHlsZXMpLm1hcCh0b19jc3NfbmFtZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgc3RhcnRfaW5kZXggPSAwO1xuXHRcdFx0dmFyIG5hbWVfaW5kZXggPSAtMTtcblxuXHRcdFx0Y29uc3QgbGVuID0gdmFsdWUubGVuZ3RoO1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHR2YXIgYyA9IHZhbHVlW2ldO1xuXG5cdFx0XHRcdGlmIChpbl9jb21tZW50KSB7XG5cdFx0XHRcdFx0aWYgKGMgPT09ICcvJyAmJiB2YWx1ZVtpIC0gMV0gPT09ICcqJykge1xuXHRcdFx0XHRcdFx0aW5fY29tbWVudCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChpbl9zdHIpIHtcblx0XHRcdFx0XHRpZiAoaW5fc3RyID09PSBjKSB7XG5cdFx0XHRcdFx0XHRpbl9zdHIgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoYyA9PT0gJy8nICYmIHZhbHVlW2kgKyAxXSA9PT0gJyonKSB7XG5cdFx0XHRcdFx0aW5fY29tbWVudCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYyA9PT0gJ1wiJyB8fCBjID09PSBcIidcIikge1xuXHRcdFx0XHRcdGluX3N0ciA9IGM7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYyA9PT0gJygnKSB7XG5cdFx0XHRcdFx0aW5fYXBvKys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYyA9PT0gJyknKSB7XG5cdFx0XHRcdFx0aW5fYXBvLS07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWluX2NvbW1lbnQgJiYgaW5fc3RyID09PSBmYWxzZSAmJiBpbl9hcG8gPT09IDApIHtcblx0XHRcdFx0XHRpZiAoYyA9PT0gJzonICYmIG5hbWVfaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRuYW1lX2luZGV4ID0gaTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGMgPT09ICc7JyB8fCBpID09PSBsZW4gLSAxKSB7XG5cdFx0XHRcdFx0XHRpZiAobmFtZV9pbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0dmFyIG5hbWUgPSB0b19jc3NfbmFtZSh2YWx1ZS5zdWJzdHJpbmcoc3RhcnRfaW5kZXgsIG5hbWVfaW5kZXgpLnRyaW0oKSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNlcnZlZF9uYW1lcy5pbmNsdWRlcyhuYW1lKSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjICE9PSAnOycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHR2YXIgcHJvcGVydHkgPSB2YWx1ZS5zdWJzdHJpbmcoc3RhcnRfaW5kZXgsIGkpLnRyaW0oKTtcblx0XHRcdFx0XHRcdFx0XHRuZXdfc3R5bGUgKz0gJyAnICsgcHJvcGVydHkgKyAnOyc7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0c3RhcnRfaW5kZXggPSBpICsgMTtcblx0XHRcdFx0XHRcdG5hbWVfaW5kZXggPSAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobm9ybWFsX3N0eWxlcykge1xuXHRcdFx0bmV3X3N0eWxlICs9IGFwcGVuZF9zdHlsZXMobm9ybWFsX3N0eWxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKGltcG9ydGFudF9zdHlsZXMpIHtcblx0XHRcdG5ld19zdHlsZSArPSBhcHBlbmRfc3R5bGVzKGltcG9ydGFudF9zdHlsZXMsIHRydWUpO1xuXHRcdH1cblxuXHRcdG5ld19zdHlsZSA9IG5ld19zdHlsZS50cmltKCk7XG5cdFx0cmV0dXJuIG5ld19zdHlsZSA9PT0gJycgPyBudWxsIDogbmV3X3N0eWxlO1xuXHR9XG5cblx0cmV0dXJuIHZhbHVlID09IG51bGwgPyBudWxsIDogU3RyaW5nKHZhbHVlKTtcbn1cbiIsImltcG9ydCB7IHRvX2NsYXNzIH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkL2F0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgaHlkcmF0aW5nIH0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGRvbVxuICogQHBhcmFtIHtib29sZWFuIHwgbnVtYmVyfSBpc19odG1sXG4gKiBAcGFyYW0ge3N0cmluZyB8IG51bGx9IHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gW2hhc2hdXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IFtwcmV2X2NsYXNzZXNdXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IFtuZXh0X2NsYXNzZXNdXG4gKiBAcmV0dXJucyB7UmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfCB1bmRlZmluZWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfY2xhc3MoZG9tLCBpc19odG1sLCB2YWx1ZSwgaGFzaCwgcHJldl9jbGFzc2VzLCBuZXh0X2NsYXNzZXMpIHtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvciBuZWVkIHRvIGFkZCBfX2NsYXNzTmFtZSB0byBwYXRjaGVkIHByb3RvdHlwZVxuXHR2YXIgcHJldiA9IGRvbS5fX2NsYXNzTmFtZTtcblxuXHRpZiAoXG5cdFx0aHlkcmF0aW5nIHx8XG5cdFx0cHJldiAhPT0gdmFsdWUgfHxcblx0XHRwcmV2ID09PSB1bmRlZmluZWQgLy8gZm9yIGVkZ2UgY2FzZSBvZiBgY2xhc3M9e3VuZGVmaW5lZH1gXG5cdCkge1xuXHRcdHZhciBuZXh0X2NsYXNzX25hbWUgPSB0b19jbGFzcyh2YWx1ZSwgaGFzaCwgbmV4dF9jbGFzc2VzKTtcblxuXHRcdGlmICghaHlkcmF0aW5nIHx8IG5leHRfY2xhc3NfbmFtZSAhPT0gZG9tLmdldEF0dHJpYnV0ZSgnY2xhc3MnKSkge1xuXHRcdFx0Ly8gUmVtb3ZpbmcgdGhlIGF0dHJpYnV0ZSB3aGVuIHRoZSB2YWx1ZSBpcyBvbmx5IGFuIGVtcHR5IHN0cmluZyBjYXVzZXNcblx0XHRcdC8vIHBlcmZvcm1hbmNlIGlzc3VlcyB2cyBzaW1wbHkgbWFraW5nIHRoZSBjbGFzc05hbWUgYW4gZW1wdHkgc3RyaW5nLiBTb1xuXHRcdFx0Ly8gd2Ugc2hvdWxkIG9ubHkgcmVtb3ZlIHRoZSBjbGFzcyBpZiB0aGUgdmFsdWUgaXMgbnVsbGlzaFxuXHRcdFx0Ly8gYW5kIHRoZXJlIG5vIGhhc2gvZGlyZWN0aXZlcyA6XG5cdFx0XHRpZiAobmV4dF9jbGFzc19uYW1lID09IG51bGwpIHtcblx0XHRcdFx0ZG9tLnJlbW92ZUF0dHJpYnV0ZSgnY2xhc3MnKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNfaHRtbCkge1xuXHRcdFx0XHRkb20uY2xhc3NOYW1lID0gbmV4dF9jbGFzc19uYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBuZXh0X2NsYXNzX25hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgbmVlZCB0byBhZGQgX19jbGFzc05hbWUgdG8gcGF0Y2hlZCBwcm90b3R5cGVcblx0XHRkb20uX19jbGFzc05hbWUgPSB2YWx1ZTtcblx0fSBlbHNlIGlmIChuZXh0X2NsYXNzZXMgJiYgcHJldl9jbGFzc2VzICE9PSBuZXh0X2NsYXNzZXMpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gbmV4dF9jbGFzc2VzKSB7XG5cdFx0XHR2YXIgaXNfcHJlc2VudCA9ICEhbmV4dF9jbGFzc2VzW2tleV07XG5cblx0XHRcdGlmIChwcmV2X2NsYXNzZXMgPT0gbnVsbCB8fCBpc19wcmVzZW50ICE9PSAhIXByZXZfY2xhc3Nlc1trZXldKSB7XG5cdFx0XHRcdGRvbS5jbGFzc0xpc3QudG9nZ2xlKGtleSwgaXNfcHJlc2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5leHRfY2xhc3Nlcztcbn1cbiIsImltcG9ydCB7IHRvX3N0eWxlIH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkL2F0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgaHlkcmF0aW5nIH0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnQgJiBFbGVtZW50Q1NTSW5saW5lU3R5bGV9IGRvbVxuICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLCBhbnk+fSBwcmV2XG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IG5leHRcbiAqIEBwYXJhbSB7c3RyaW5nfSBbcHJpb3JpdHldXG4gKi9cbmZ1bmN0aW9uIHVwZGF0ZV9zdHlsZXMoZG9tLCBwcmV2ID0ge30sIG5leHQsIHByaW9yaXR5KSB7XG5cdGZvciAodmFyIGtleSBpbiBuZXh0KSB7XG5cdFx0dmFyIHZhbHVlID0gbmV4dFtrZXldO1xuXG5cdFx0aWYgKHByZXZba2V5XSAhPT0gdmFsdWUpIHtcblx0XHRcdGlmIChuZXh0W2tleV0gPT0gbnVsbCkge1xuXHRcdFx0XHRkb20uc3R5bGUucmVtb3ZlUHJvcGVydHkoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbS5zdHlsZS5zZXRQcm9wZXJ0eShrZXksIHZhbHVlLCBwcmlvcml0eSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHtFbGVtZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlfSBkb21cbiAqIEBwYXJhbSB7c3RyaW5nIHwgbnVsbH0gdmFsdWVcbiAqIEBwYXJhbSB7UmVjb3JkPHN0cmluZywgYW55PiB8IFtSZWNvcmQ8c3RyaW5nLCBhbnk+LCBSZWNvcmQ8c3RyaW5nLCBhbnk+XX0gW3ByZXZfc3R5bGVzXVxuICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLCBhbnk+IHwgW1JlY29yZDxzdHJpbmcsIGFueT4sIFJlY29yZDxzdHJpbmcsIGFueT5dfSBbbmV4dF9zdHlsZXNdXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfc3R5bGUoZG9tLCB2YWx1ZSwgcHJldl9zdHlsZXMsIG5leHRfc3R5bGVzKSB7XG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0dmFyIHByZXYgPSBkb20uX19zdHlsZTtcblxuXHRpZiAoaHlkcmF0aW5nIHx8IHByZXYgIT09IHZhbHVlKSB7XG5cdFx0dmFyIG5leHRfc3R5bGVfYXR0ciA9IHRvX3N0eWxlKHZhbHVlLCBuZXh0X3N0eWxlcyk7XG5cblx0XHRpZiAoIWh5ZHJhdGluZyB8fCBuZXh0X3N0eWxlX2F0dHIgIT09IGRvbS5nZXRBdHRyaWJ1dGUoJ3N0eWxlJykpIHtcblx0XHRcdGlmIChuZXh0X3N0eWxlX2F0dHIgPT0gbnVsbCkge1xuXHRcdFx0XHRkb20ucmVtb3ZlQXR0cmlidXRlKCdzdHlsZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tLnN0eWxlLmNzc1RleHQgPSBuZXh0X3N0eWxlX2F0dHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGRvbS5fX3N0eWxlID0gdmFsdWU7XG5cdH0gZWxzZSBpZiAobmV4dF9zdHlsZXMpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShuZXh0X3N0eWxlcykpIHtcblx0XHRcdHVwZGF0ZV9zdHlsZXMoZG9tLCBwcmV2X3N0eWxlcz8uWzBdLCBuZXh0X3N0eWxlc1swXSk7XG5cdFx0XHR1cGRhdGVfc3R5bGVzKGRvbSwgcHJldl9zdHlsZXM/LlsxXSwgbmV4dF9zdHlsZXNbMV0sICdpbXBvcnRhbnQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dXBkYXRlX3N0eWxlcyhkb20sIHByZXZfc3R5bGVzLCBuZXh0X3N0eWxlcyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5leHRfc3R5bGVzO1xufVxuIiwiaW1wb3J0IHsgZWZmZWN0LCB0ZWFyZG93biB9IGZyb20gJy4uLy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBsaXN0ZW5fdG9fZXZlbnRfYW5kX3Jlc2V0X2V2ZW50IH0gZnJvbSAnLi9zaGFyZWQuanMnO1xuaW1wb3J0IHsgaXMgfSBmcm9tICcuLi8uLi8uLi9wcm94eS5qcyc7XG5pbXBvcnQgeyBpc19hcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL3NoYXJlZC91dGlscy5qcyc7XG5pbXBvcnQgKiBhcyB3IGZyb20gJy4uLy4uLy4uL3dhcm5pbmdzLmpzJztcbmltcG9ydCB7IEJhdGNoLCBjdXJyZW50X2JhdGNoLCBwcmV2aW91c19iYXRjaCB9IGZyb20gJy4uLy4uLy4uL3JlYWN0aXZpdHkvYmF0Y2guanMnO1xuXG4vKipcbiAqIFNlbGVjdHMgdGhlIGNvcnJlY3Qgb3B0aW9uKHMpIChkZXBlbmRpbmcgb24gd2hldGhlciB0aGlzIGlzIGEgbXVsdGlwbGUgc2VsZWN0KVxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7SFRNTFNlbGVjdEVsZW1lbnR9IHNlbGVjdFxuICogQHBhcmFtIHtWfSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBtb3VudGluZ1xuICovXG5leHBvcnQgZnVuY3Rpb24gc2VsZWN0X29wdGlvbihzZWxlY3QsIHZhbHVlLCBtb3VudGluZyA9IGZhbHNlKSB7XG5cdGlmIChzZWxlY3QubXVsdGlwbGUpIHtcblx0XHQvLyBJZiB2YWx1ZSBpcyBudWxsIG9yIHVuZGVmaW5lZCwga2VlcCB0aGUgc2VsZWN0aW9uIGFzIGlzXG5cdFx0aWYgKHZhbHVlID09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIG5vdCBhbiBhcnJheSwgd2FybiBhbmQga2VlcCB0aGUgc2VsZWN0aW9uIGFzIGlzXG5cdFx0aWYgKCFpc19hcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB3LnNlbGVjdF9tdWx0aXBsZV9pbnZhbGlkX3ZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlLCB1cGRhdGUgdGhlIHNlbGVjdGlvblxuXHRcdGZvciAodmFyIG9wdGlvbiBvZiBzZWxlY3Qub3B0aW9ucykge1xuXHRcdFx0b3B0aW9uLnNlbGVjdGVkID0gdmFsdWUuaW5jbHVkZXMoZ2V0X29wdGlvbl92YWx1ZShvcHRpb24pKTtcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRmb3IgKG9wdGlvbiBvZiBzZWxlY3Qub3B0aW9ucykge1xuXHRcdHZhciBvcHRpb25fdmFsdWUgPSBnZXRfb3B0aW9uX3ZhbHVlKG9wdGlvbik7XG5cdFx0aWYgKGlzKG9wdGlvbl92YWx1ZSwgdmFsdWUpKSB7XG5cdFx0XHRvcHRpb24uc2VsZWN0ZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGlmICghbW91bnRpbmcgfHwgdmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHNlbGVjdC5zZWxlY3RlZEluZGV4ID0gLTE7IC8vIG5vIG9wdGlvbiBzaG91bGQgYmUgc2VsZWN0ZWRcblx0fVxufVxuXG4vKipcbiAqIFNlbGVjdHMgdGhlIGNvcnJlY3Qgb3B0aW9uKHMpIGlmIGB2YWx1ZWAgaXMgZ2l2ZW4sXG4gKiBhbmQgdGhlbiBzZXRzIHVwIGEgbXV0YXRpb24gb2JzZXJ2ZXIgdG8gc3luYyB0aGVcbiAqIGN1cnJlbnQgc2VsZWN0aW9uIHRvIHRoZSBkb20gd2hlbiBpdCBjaGFuZ2VzLiBTdWNoXG4gKiBjaGFuZ2VzIGNvdWxkIGZvciBleGFtcGxlIG9jY3VyIHdoZW4gb3B0aW9ucyBhcmVcbiAqIGluc2lkZSBhbiBgI2VhY2hgIGJsb2NrLlxuICogQHBhcmFtIHtIVE1MU2VsZWN0RWxlbWVudH0gc2VsZWN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbml0X3NlbGVjdChzZWxlY3QpIHtcblx0dmFyIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHRzZWxlY3Rfb3B0aW9uKHNlbGVjdCwgc2VsZWN0Ll9fdmFsdWUpO1xuXHRcdC8vIERlbGliZXJhdGVseSBkb24ndCB1cGRhdGUgdGhlIHBvdGVudGlhbCBiaW5kaW5nIHZhbHVlLFxuXHRcdC8vIHRoZSBtb2RlbCBzaG91bGQgYmUgcHJlc2VydmVkIHVubGVzcyBleHBsaWNpdGx5IGNoYW5nZWRcblx0fSk7XG5cblx0b2JzZXJ2ZXIub2JzZXJ2ZShzZWxlY3QsIHtcblx0XHQvLyBMaXN0ZW4gdG8gb3B0aW9uIGVsZW1lbnQgY2hhbmdlc1xuXHRcdGNoaWxkTGlzdDogdHJ1ZSxcblx0XHRzdWJ0cmVlOiB0cnVlLCAvLyBiZWNhdXNlIG9mIDxvcHRncm91cD5cblx0XHQvLyBMaXN0ZW4gdG8gb3B0aW9uIGVsZW1lbnQgdmFsdWUgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyAoZG9lc24ndCBnZXQgbm90aWZpZWQgb2Ygc2VsZWN0IHZhbHVlIGNoYW5nZXMsXG5cdFx0Ly8gYmVjYXVzZSB0aGF0IHByb3BlcnR5IGlzIG5vdCByZWZsZWN0ZWQgYXMgYW4gYXR0cmlidXRlKVxuXHRcdGF0dHJpYnV0ZXM6IHRydWUsXG5cdFx0YXR0cmlidXRlRmlsdGVyOiBbJ3ZhbHVlJ11cblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblx0fSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtIVE1MU2VsZWN0RWxlbWVudH0gc2VsZWN0XG4gKiBAcGFyYW0geygpID0+IHVua25vd259IGdldFxuICogQHBhcmFtIHsodmFsdWU6IHVua25vd24pID0+IHZvaWR9IHNldFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kX3NlbGVjdF92YWx1ZShzZWxlY3QsIGdldCwgc2V0ID0gZ2V0KSB7XG5cdHZhciBiYXRjaGVzID0gbmV3IFdlYWtTZXQoKTtcblx0dmFyIG1vdW50aW5nID0gdHJ1ZTtcblxuXHRsaXN0ZW5fdG9fZXZlbnRfYW5kX3Jlc2V0X2V2ZW50KHNlbGVjdCwgJ2NoYW5nZScsIChpc19yZXNldCkgPT4ge1xuXHRcdHZhciBxdWVyeSA9IGlzX3Jlc2V0ID8gJ1tzZWxlY3RlZF0nIDogJzpjaGVja2VkJztcblx0XHQvKiogQHR5cGUge3Vua25vd259ICovXG5cdFx0dmFyIHZhbHVlO1xuXG5cdFx0aWYgKHNlbGVjdC5tdWx0aXBsZSkge1xuXHRcdFx0dmFsdWUgPSBbXS5tYXAuY2FsbChzZWxlY3QucXVlcnlTZWxlY3RvckFsbChxdWVyeSksIGdldF9vcHRpb25fdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvKiogQHR5cGUge0hUTUxPcHRpb25FbGVtZW50IHwgbnVsbH0gKi9cblx0XHRcdHZhciBzZWxlY3RlZF9vcHRpb24gPVxuXHRcdFx0XHRzZWxlY3QucXVlcnlTZWxlY3RvcihxdWVyeSkgPz9cblx0XHRcdFx0Ly8gd2lsbCBmYWxsIGJhY2sgdG8gZmlyc3Qgbm9uLWRpc2FibGVkIG9wdGlvbiBpZiBubyBvcHRpb24gaXMgc2VsZWN0ZWRcblx0XHRcdFx0c2VsZWN0LnF1ZXJ5U2VsZWN0b3IoJ29wdGlvbjpub3QoW2Rpc2FibGVkXSknKTtcblx0XHRcdHZhbHVlID0gc2VsZWN0ZWRfb3B0aW9uICYmIGdldF9vcHRpb25fdmFsdWUoc2VsZWN0ZWRfb3B0aW9uKTtcblx0XHR9XG5cblx0XHRzZXQodmFsdWUpO1xuXG5cdFx0aWYgKGN1cnJlbnRfYmF0Y2ggIT09IG51bGwpIHtcblx0XHRcdGJhdGNoZXMuYWRkKGN1cnJlbnRfYmF0Y2gpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gTmVlZHMgdG8gYmUgYW4gZWZmZWN0LCBub3QgYSByZW5kZXJfZWZmZWN0LCBzbyB0aGF0IGluIGNhc2Ugb2YgZWFjaCBsb29wcyB0aGUgbG9naWMgcnVucyBhZnRlciB0aGUgZWFjaCBibG9jayBoYXMgdXBkYXRlZFxuXHRlZmZlY3QoKCkgPT4ge1xuXHRcdHZhciB2YWx1ZSA9IGdldCgpO1xuXG5cdFx0aWYgKHNlbGVjdCA9PT0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Ly8gd2UgbmVlZCBib3RoLCBiZWNhdXNlIGluIG5vbi1hc3luYyBtb2RlLCByZW5kZXIgZWZmZWN0cyBydW4gYmVmb3JlIHByZXZpb3VzX2JhdGNoIGlzIHNldFxuXHRcdFx0dmFyIGJhdGNoID0gLyoqIEB0eXBlIHtCYXRjaH0gKi8gKHByZXZpb3VzX2JhdGNoID8/IGN1cnJlbnRfYmF0Y2gpO1xuXG5cdFx0XHQvLyBEb24ndCB1cGRhdGUgdGhlIDxzZWxlY3Q+IGlmIGl0IGlzIGZvY3VzZWQuIFdlIGNhbiBnZXQgaGVyZSBpZiwgZm9yIGV4YW1wbGUsXG5cdFx0XHQvLyBhbiB1cGRhdGUgaXMgZGVmZXJyZWQgYmVjYXVzZSBvZiBhc3luYyB3b3JrIGRlcGVuZGluZyBvbiB0aGUgc2VsZWN0OlxuXHRcdFx0Ly9cblx0XHRcdC8vIDxzZWxlY3QgYmluZDp2YWx1ZT17c2VsZWN0ZWR9Pi4uLjwvc2VsZWN0PlxuXHRcdFx0Ly8gPHA+e2F3YWl0IGZpbmQoc2VsZWN0ZWQpfTwvcD5cblx0XHRcdGlmIChiYXRjaGVzLmhhcyhiYXRjaCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNlbGVjdF9vcHRpb24oc2VsZWN0LCB2YWx1ZSwgbW91bnRpbmcpO1xuXG5cdFx0Ly8gTW91bnRpbmcgYW5kIHZhbHVlIHVuZGVmaW5lZCAtPiB0YWtlIHNlbGVjdGlvbiBmcm9tIGRvbVxuXHRcdGlmIChtb3VudGluZyAmJiB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvKiogQHR5cGUge0hUTUxPcHRpb25FbGVtZW50IHwgbnVsbH0gKi9cblx0XHRcdHZhciBzZWxlY3RlZF9vcHRpb24gPSBzZWxlY3QucXVlcnlTZWxlY3RvcignOmNoZWNrZWQnKTtcblx0XHRcdGlmIChzZWxlY3RlZF9vcHRpb24gIT09IG51bGwpIHtcblx0XHRcdFx0dmFsdWUgPSBnZXRfb3B0aW9uX3ZhbHVlKHNlbGVjdGVkX29wdGlvbik7XG5cdFx0XHRcdHNldCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdHNlbGVjdC5fX3ZhbHVlID0gdmFsdWU7XG5cdFx0bW91bnRpbmcgPSBmYWxzZTtcblx0fSk7XG5cblx0aW5pdF9zZWxlY3Qoc2VsZWN0KTtcbn1cblxuLyoqIEBwYXJhbSB7SFRNTE9wdGlvbkVsZW1lbnR9IG9wdGlvbiAqL1xuZnVuY3Rpb24gZ2V0X29wdGlvbl92YWx1ZShvcHRpb24pIHtcblx0Ly8gX192YWx1ZSBvbmx5IGV4aXN0cyBpZiB0aGUgPG9wdGlvbj4gaGFzIGEgdmFsdWUgYXR0cmlidXRlXG5cdGlmICgnX192YWx1ZScgaW4gb3B0aW9uKSB7XG5cdFx0cmV0dXJuIG9wdGlvbi5fX3ZhbHVlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBvcHRpb24udmFsdWU7XG5cdH1cbn1cbiIsIi8qKiBAaW1wb3J0IHsgRWZmZWN0IH0gZnJvbSAnI2NsaWVudCcgKi9cbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuaW1wb3J0IHsgaHlkcmF0aW5nLCBzZXRfaHlkcmF0aW5nIH0gZnJvbSAnLi4vaHlkcmF0aW9uLmpzJztcbmltcG9ydCB7IGdldF9kZXNjcmlwdG9ycywgZ2V0X3Byb3RvdHlwZV9vZiB9IGZyb20gJy4uLy4uLy4uL3NoYXJlZC91dGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVfZXZlbnQsIGRlbGVnYXRlIH0gZnJvbSAnLi9ldmVudHMuanMnO1xuaW1wb3J0IHsgYWRkX2Zvcm1fcmVzZXRfbGlzdGVuZXIsIGF1dG9mb2N1cyB9IGZyb20gJy4vbWlzYy5qcyc7XG5pbXBvcnQgKiBhcyB3IGZyb20gJy4uLy4uL3dhcm5pbmdzLmpzJztcbmltcG9ydCB7IExPQURJTkdfQVRUUl9TWU1CT0wgfSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5pbXBvcnQgeyBxdWV1ZV9taWNyb190YXNrIH0gZnJvbSAnLi4vdGFzay5qcyc7XG5pbXBvcnQgeyBpc19jYXB0dXJlX2V2ZW50LCBjYW5fZGVsZWdhdGVfZXZlbnQsIG5vcm1hbGl6ZV9hdHRyaWJ1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy5qcyc7XG5pbXBvcnQge1xuXHRhY3RpdmVfZWZmZWN0LFxuXHRhY3RpdmVfcmVhY3Rpb24sXG5cdGdldCxcblx0c2V0X2FjdGl2ZV9lZmZlY3QsXG5cdHNldF9hY3RpdmVfcmVhY3Rpb25cbn0gZnJvbSAnLi4vLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgeyBhdHRhY2ggfSBmcm9tICcuL2F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IGNsc3ggfSBmcm9tICcuLi8uLi8uLi9zaGFyZWQvYXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBzZXRfY2xhc3MgfSBmcm9tICcuL2NsYXNzLmpzJztcbmltcG9ydCB7IHNldF9zdHlsZSB9IGZyb20gJy4vc3R5bGUuanMnO1xuaW1wb3J0IHsgQVRUQUNITUVOVF9LRVksIE5BTUVTUEFDRV9IVE1MLCBVTklOSVRJQUxJWkVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGJyYW5jaCwgZGVzdHJveV9lZmZlY3QsIGVmZmVjdCwgbWFuYWdlZCB9IGZyb20gJy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBpbml0X3NlbGVjdCwgc2VsZWN0X29wdGlvbiB9IGZyb20gJy4vYmluZGluZ3Mvc2VsZWN0LmpzJztcbmltcG9ydCB7IGZsYXR0ZW4gfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2FzeW5jLmpzJztcblxuZXhwb3J0IGNvbnN0IENMQVNTID0gU3ltYm9sKCdjbGFzcycpO1xuZXhwb3J0IGNvbnN0IFNUWUxFID0gU3ltYm9sKCdzdHlsZScpO1xuXG5jb25zdCBJU19DVVNUT01fRUxFTUVOVCA9IFN5bWJvbCgnaXMgY3VzdG9tIGVsZW1lbnQnKTtcbmNvbnN0IElTX0hUTUwgPSBTeW1ib2woJ2lzIGh0bWwnKTtcblxuLyoqXG4gKiBUaGUgdmFsdWUvY2hlY2tlZCBhdHRyaWJ1dGUgaW4gdGhlIHRlbXBsYXRlIGFjdHVhbGx5IGNvcnJlc3BvbmRzIHRvIHRoZSBkZWZhdWx0VmFsdWUgcHJvcGVydHksIHNvIHdlIG5lZWRcbiAqIHRvIHJlbW92ZSBpdCB1cG9uIGh5ZHJhdGlvbiB0byBhdm9pZCBhIGJ1ZyB3aGVuIHNvbWVvbmUgcmVzZXRzIHRoZSBmb3JtIHZhbHVlLlxuICogQHBhcmFtIHtIVE1MSW5wdXRFbGVtZW50fSBpbnB1dFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVfaW5wdXRfZGVmYXVsdHMoaW5wdXQpIHtcblx0aWYgKCFoeWRyYXRpbmcpIHJldHVybjtcblxuXHR2YXIgYWxyZWFkeV9yZW1vdmVkID0gZmFsc2U7XG5cblx0Ly8gV2UgdHJ5IGFuZCByZW1vdmUgdGhlIGRlZmF1bHQgYXR0cmlidXRlcyBsYXRlciwgcmF0aGVyIHRoYW4gc3luYyBkdXJpbmcgaHlkcmF0aW9uLlxuXHQvLyBEb2luZyBpdCBzeW5jIGR1cmluZyBoeWRyYXRpb24gaGFzIGEgbmVnYXRpdmUgaW1wYWN0IG9uIHBlcmZvcm1hbmNlLCBidXQgZGVmZXJyaW5nIHRoZVxuXHQvLyB3b3JrIGluIGFuIGlkbGUgdGFzayBhbGxldmlhdGVzIHRoaXMgZ3JlYXRseS4gSWYgYSBmb3JtIHJlc2V0IGV2ZW50IGNvbWVzIGluIGJlZm9yZVxuXHQvLyB0aGUgaWRsZSBjYWxsYmFjaywgdGhlbiB3ZSBlbnN1cmUgdGhlIGlucHV0IGRlZmF1bHRzIGFyZSBjbGVhcmVkIGp1c3QgYmVmb3JlLlxuXHR2YXIgcmVtb3ZlX2RlZmF1bHRzID0gKCkgPT4ge1xuXHRcdGlmIChhbHJlYWR5X3JlbW92ZWQpIHJldHVybjtcblx0XHRhbHJlYWR5X3JlbW92ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBhdHRyaWJ1dGVzIGJ1dCBwcmVzZXJ2ZSB0aGUgdmFsdWVzXG5cdFx0aWYgKGlucHV0Lmhhc0F0dHJpYnV0ZSgndmFsdWUnKSkge1xuXHRcdFx0dmFyIHZhbHVlID0gaW5wdXQudmFsdWU7XG5cdFx0XHRzZXRfYXR0cmlidXRlKGlucHV0LCAndmFsdWUnLCBudWxsKTtcblx0XHRcdGlucHV0LnZhbHVlID0gdmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0Lmhhc0F0dHJpYnV0ZSgnY2hlY2tlZCcpKSB7XG5cdFx0XHR2YXIgY2hlY2tlZCA9IGlucHV0LmNoZWNrZWQ7XG5cdFx0XHRzZXRfYXR0cmlidXRlKGlucHV0LCAnY2hlY2tlZCcsIG51bGwpO1xuXHRcdFx0aW5wdXQuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0aW5wdXQuX19vbl9yID0gcmVtb3ZlX2RlZmF1bHRzO1xuXHRxdWV1ZV9taWNyb190YXNrKHJlbW92ZV9kZWZhdWx0cyk7XG5cdGFkZF9mb3JtX3Jlc2V0X2xpc3RlbmVyKCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50XG4gKiBAcGFyYW0ge2FueX0gdmFsdWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF92YWx1ZShlbGVtZW50LCB2YWx1ZSkge1xuXHR2YXIgYXR0cmlidXRlcyA9IGdldF9hdHRyaWJ1dGVzKGVsZW1lbnQpO1xuXG5cdGlmIChcblx0XHRhdHRyaWJ1dGVzLnZhbHVlID09PVxuXHRcdFx0KGF0dHJpYnV0ZXMudmFsdWUgPVxuXHRcdFx0XHQvLyB0cmVhdCBudWxsIGFuZCB1bmRlZmluZWQgdGhlIHNhbWUgZm9yIHRoZSBpbml0aWFsIHZhbHVlXG5cdFx0XHRcdHZhbHVlID8/IHVuZGVmaW5lZCkgfHxcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0Ly8gYHByb2dyZXNzYCBlbGVtZW50cyBhbHdheXMgbmVlZCB0aGVpciB2YWx1ZSBzZXQgd2hlbiBpdCdzIGAwYFxuXHRcdChlbGVtZW50LnZhbHVlID09PSB2YWx1ZSAmJiAodmFsdWUgIT09IDAgfHwgZWxlbWVudC5ub2RlTmFtZSAhPT0gJ1BST0dSRVNTJykpXG5cdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0ZWxlbWVudC52YWx1ZSA9IHZhbHVlID8/ICcnO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtib29sZWFufSBjaGVja2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfY2hlY2tlZChlbGVtZW50LCBjaGVja2VkKSB7XG5cdHZhciBhdHRyaWJ1dGVzID0gZ2V0X2F0dHJpYnV0ZXMoZWxlbWVudCk7XG5cblx0aWYgKFxuXHRcdGF0dHJpYnV0ZXMuY2hlY2tlZCA9PT1cblx0XHQoYXR0cmlidXRlcy5jaGVja2VkID1cblx0XHRcdC8vIHRyZWF0IG51bGwgYW5kIHVuZGVmaW5lZCB0aGUgc2FtZSBmb3IgdGhlIGluaXRpYWwgdmFsdWVcblx0XHRcdGNoZWNrZWQgPz8gdW5kZWZpbmVkKVxuXHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdGVsZW1lbnQuY2hlY2tlZCA9IGNoZWNrZWQ7XG59XG5cbi8qKlxuICogU2V0cyB0aGUgYHNlbGVjdGVkYCBhdHRyaWJ1dGUgb24gYW4gYG9wdGlvbmAgZWxlbWVudC5cbiAqIE5vdCBzZXQgdGhyb3VnaCB0aGUgcHJvcGVydHkgYmVjYXVzZSB0aGF0IGRvZXNuJ3QgcmVmbGVjdCB0byB0aGUgRE9NLFxuICogd2hpY2ggbWVhbnMgaXQgd291bGRuJ3QgYmUgdGFrZW4gaW50byBhY2NvdW50IHdoZW4gYSBmb3JtIGlzIHJlc2V0LlxuICogQHBhcmFtIHtIVE1MT3B0aW9uRWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtib29sZWFufSBzZWxlY3RlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X3NlbGVjdGVkKGVsZW1lbnQsIHNlbGVjdGVkKSB7XG5cdGlmIChzZWxlY3RlZCkge1xuXHRcdC8vIFRoZSBzZWxlY3RlZCBvcHRpb24gY291bGQndmUgY2hhbmdlZCB2aWEgdXNlciBzZWxlY3Rpb24sIGFuZFxuXHRcdC8vIHNldHRpbmcgdGhlIHZhbHVlIHdpdGhvdXQgdGhpcyBjaGVjayB3b3VsZCBzZXQgaXQgYmFjay5cblx0XHRpZiAoIWVsZW1lbnQuaGFzQXR0cmlidXRlKCdzZWxlY3RlZCcpKSB7XG5cdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnc2VsZWN0ZWQnLCAnJyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xuXHR9XG59XG5cbi8qKlxuICogQXBwbGllcyB0aGUgZGVmYXVsdCBjaGVja2VkIHByb3BlcnR5IHdpdGhvdXQgaW5mbHVlbmNpbmcgdGhlIGN1cnJlbnQgY2hlY2tlZCBwcm9wZXJ0eS5cbiAqIEBwYXJhbSB7SFRNTElucHV0RWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtib29sZWFufSBjaGVja2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfZGVmYXVsdF9jaGVja2VkKGVsZW1lbnQsIGNoZWNrZWQpIHtcblx0Y29uc3QgZXhpc3RpbmdfdmFsdWUgPSBlbGVtZW50LmNoZWNrZWQ7XG5cdGVsZW1lbnQuZGVmYXVsdENoZWNrZWQgPSBjaGVja2VkO1xuXHRlbGVtZW50LmNoZWNrZWQgPSBleGlzdGluZ192YWx1ZTtcbn1cblxuLyoqXG4gKiBBcHBsaWVzIHRoZSBkZWZhdWx0IHZhbHVlIHByb3BlcnR5IHdpdGhvdXQgaW5mbHVlbmNpbmcgdGhlIGN1cnJlbnQgdmFsdWUgcHJvcGVydHkuXG4gKiBAcGFyYW0ge0hUTUxJbnB1dEVsZW1lbnQgfCBIVE1MVGV4dEFyZWFFbGVtZW50fSBlbGVtZW50XG4gKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldF9kZWZhdWx0X3ZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XG5cdGNvbnN0IGV4aXN0aW5nX3ZhbHVlID0gZWxlbWVudC52YWx1ZTtcblx0ZWxlbWVudC5kZWZhdWx0VmFsdWUgPSB2YWx1ZTtcblx0ZWxlbWVudC52YWx1ZSA9IGV4aXN0aW5nX3ZhbHVlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtzdHJpbmd9IGF0dHJpYnV0ZVxuICogQHBhcmFtIHtzdHJpbmcgfCBudWxsfSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbc2tpcF93YXJuaW5nXVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0X2F0dHJpYnV0ZShlbGVtZW50LCBhdHRyaWJ1dGUsIHZhbHVlLCBza2lwX3dhcm5pbmcpIHtcblx0dmFyIGF0dHJpYnV0ZXMgPSBnZXRfYXR0cmlidXRlcyhlbGVtZW50KTtcblxuXHRpZiAoaHlkcmF0aW5nKSB7XG5cdFx0YXR0cmlidXRlc1thdHRyaWJ1dGVdID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cmlidXRlKTtcblxuXHRcdGlmIChcblx0XHRcdGF0dHJpYnV0ZSA9PT0gJ3NyYycgfHxcblx0XHRcdGF0dHJpYnV0ZSA9PT0gJ3NyY3NldCcgfHxcblx0XHRcdChhdHRyaWJ1dGUgPT09ICdocmVmJyAmJiBlbGVtZW50Lm5vZGVOYW1lID09PSAnTElOSycpXG5cdFx0KSB7XG5cdFx0XHRpZiAoIXNraXBfd2FybmluZykge1xuXHRcdFx0XHRjaGVja19zcmNfaW5fZGV2X2h5ZHJhdGlvbihlbGVtZW50LCBhdHRyaWJ1dGUsIHZhbHVlID8/ICcnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2UgcmVzZXQgdGhlc2UgYXR0cmlidXRlcywgdGhleSB3b3VsZCByZXN1bHQgaW4gYW5vdGhlciBuZXR3b3JrIHJlcXVlc3QsIHdoaWNoIHdlIHdhbnQgdG8gYXZvaWQuXG5cdFx0XHQvLyBXZSBhc3N1bWUgdGhleSBhcmUgdGhlIHNhbWUgYmV0d2VlbiBjbGllbnQgYW5kIHNlcnZlciBhcyBjaGVja2luZyBpZiB0aGV5IGFyZSBlcXVhbCBpcyBleHBlbnNpdmVcblx0XHRcdC8vICh3ZSBjYW4ndCBqdXN0IGNvbXBhcmUgdGhlIHN0cmluZ3MgYXMgdGhleSBjYW4gYmUgZGlmZmVyZW50IGJldHdlZW4gY2xpZW50IGFuZCBzZXJ2ZXIgYnV0IHJlc3VsdCBpbiB0aGVcblx0XHRcdC8vIHNhbWUgdXJsLCBzbyB3ZSB3b3VsZCBuZWVkIHRvIGNyZWF0ZSBoaWRkZW4gYW5jaG9yIGVsZW1lbnRzIHRvIGNvbXBhcmUgdGhlbSlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRpZiAoYXR0cmlidXRlc1thdHRyaWJ1dGVdID09PSAoYXR0cmlidXRlc1thdHRyaWJ1dGVdID0gdmFsdWUpKSByZXR1cm47XG5cblx0aWYgKGF0dHJpYnV0ZSA9PT0gJ2xvYWRpbmcnKSB7XG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGVsZW1lbnRbTE9BRElOR19BVFRSX1NZTUJPTF0gPSB2YWx1ZTtcblx0fVxuXG5cdGlmICh2YWx1ZSA9PSBudWxsKSB7XG5cdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoYXR0cmlidXRlKTtcblx0fSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICYmIGdldF9zZXR0ZXJzKGVsZW1lbnQpLmluY2x1ZGVzKGF0dHJpYnV0ZSkpIHtcblx0XHQvLyBAdHMtaWdub3JlXG5cdFx0ZWxlbWVudFthdHRyaWJ1dGVdID0gdmFsdWU7XG5cdH0gZWxzZSB7XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0cmlidXRlLCB2YWx1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGRvbVxuICogQHBhcmFtIHtzdHJpbmd9IGF0dHJpYnV0ZVxuICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfeGxpbmtfYXR0cmlidXRlKGRvbSwgYXR0cmlidXRlLCB2YWx1ZSkge1xuXHRkb20uc2V0QXR0cmlidXRlTlMoJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsnLCBhdHRyaWJ1dGUsIHZhbHVlKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBub2RlXG4gKiBAcGFyYW0ge3N0cmluZ30gcHJvcFxuICogQHBhcmFtIHthbnl9IHZhbHVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRfY3VzdG9tX2VsZW1lbnRfZGF0YShub2RlLCBwcm9wLCB2YWx1ZSkge1xuXHQvLyBXZSBuZWVkIHRvIGVuc3VyZSB0aGF0IHNldHRpbmcgY3VzdG9tIGVsZW1lbnQgcHJvcHMsIHdoaWNoIGNhblxuXHQvLyBpbnZva2UgbGlmZWN5Y2xlIG1ldGhvZHMgb24gb3RoZXIgY3VzdG9tIGVsZW1lbnRzLCBkb2VzIG5vdCBhbHNvXG5cdC8vIGFzc29jaWF0ZSB0aG9zZSBsaWZlY3ljbGUgbWV0aG9kcyB3aXRoIHRoZSBjdXJyZW50IGFjdGl2ZSByZWFjdGlvblxuXHQvLyBvciBlZmZlY3Rcblx0dmFyIHByZXZpb3VzX3JlYWN0aW9uID0gYWN0aXZlX3JlYWN0aW9uO1xuXHR2YXIgcHJldmlvdXNfZWZmZWN0ID0gYWN0aXZlX2VmZmVjdDtcblxuXHQvLyBJZiB3ZSdyZSBoeWRyYXRpbmcgYnV0IHRoZSBjdXN0b20gZWxlbWVudCBpcyBmcm9tIFN2ZWx0ZSwgYW5kIGl0IGFscmVhZHkgc2NhZmZvbGRlZCxcblx0Ly8gdGhlbiBpdCBtaWdodCBydW4gYmxvY2sgbG9naWMgaW4gaHlkcmF0aW9uIG1vZGUsIHdoaWNoIHdlIGhhdmUgdG8gcHJldmVudC5cblx0bGV0IHdhc19oeWRyYXRpbmcgPSBoeWRyYXRpbmc7XG5cdGlmIChoeWRyYXRpbmcpIHtcblx0XHRzZXRfaHlkcmF0aW5nKGZhbHNlKTtcblx0fVxuXG5cdHNldF9hY3RpdmVfcmVhY3Rpb24obnVsbCk7XG5cdHNldF9hY3RpdmVfZWZmZWN0KG51bGwpO1xuXG5cdHRyeSB7XG5cdFx0aWYgKFxuXHRcdFx0Ly8gYHN0eWxlYCBzaG91bGQgdXNlIGBzZXRfYXR0cmlidXRlYCByYXRoZXIgdGhhbiB0aGUgc2V0dGVyXG5cdFx0XHRwcm9wICE9PSAnc3R5bGUnICYmXG5cdFx0XHQvLyBEb24ndCBjb21wdXRlIHNldHRlcnMgZm9yIGN1c3RvbSBlbGVtZW50cyB3aGlsZSB0aGV5IGFyZW4ndCByZWdpc3RlcmVkIHlldCxcblx0XHRcdC8vIGJlY2F1c2UgZHVyaW5nIHRoZWlyIHVwZ3JhZGUvaW5zdGFudGlhdGlvbiB0aGV5IG1pZ2h0IGFkZCBtb3JlIHNldHRlcnMuXG5cdFx0XHQvLyBJbnN0ZWFkLCBmYWxsIGJhY2sgdG8gYSBzaW1wbGUgXCJhbiBvYmplY3QsIHRoZW4gc2V0IGFzIHByb3BlcnR5XCIgaGV1cmlzdGljLlxuXHRcdFx0KHNldHRlcnNfY2FjaGUuaGFzKG5vZGUuZ2V0QXR0cmlidXRlKCdpcycpIHx8IG5vZGUubm9kZU5hbWUpIHx8XG5cdFx0XHQvLyBjdXN0b21FbGVtZW50cyBtYXkgbm90IGJlIGF2YWlsYWJsZSBpbiBicm93c2VyIGV4dGVuc2lvbiBjb250ZXh0c1xuXHRcdFx0IWN1c3RvbUVsZW1lbnRzIHx8XG5cdFx0XHRjdXN0b21FbGVtZW50cy5nZXQobm9kZS5nZXRBdHRyaWJ1dGUoJ2lzJykgfHwgbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdD8gZ2V0X3NldHRlcnMobm9kZSkuaW5jbHVkZXMocHJvcClcblx0XHRcdFx0OiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKVxuXHRcdCkge1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0bm9kZVtwcm9wXSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBXZSBkaWQgZ2V0dGVycyBldGMgY2hlY2tzIGFscmVhZHksIHN0cmluZ2lmeSBiZWZvcmUgcGFzc2luZyB0byBzZXRfYXR0cmlidXRlXG5cdFx0XHQvLyB0byBlbnN1cmUgaXQgZG9lc24ndCBpbnZva2UgdGhlIHNhbWUgbG9naWMgYWdhaW4sIGFuZCBwb3RlbnRpYWxseSBwb3B1bGF0aW5nXG5cdFx0XHQvLyB0aGUgc2V0dGVycyBjYWNoZSB0b28gZWFybHkuXG5cdFx0XHRzZXRfYXR0cmlidXRlKG5vZGUsIHByb3AsIHZhbHVlID09IG51bGwgPyB2YWx1ZSA6IFN0cmluZyh2YWx1ZSkpO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZXRfYWN0aXZlX3JlYWN0aW9uKHByZXZpb3VzX3JlYWN0aW9uKTtcblx0XHRzZXRfYWN0aXZlX2VmZmVjdChwcmV2aW91c19lZmZlY3QpO1xuXHRcdGlmICh3YXNfaHlkcmF0aW5nKSB7XG5cdFx0XHRzZXRfaHlkcmF0aW5nKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFNwcmVhZHMgYXR0cmlidXRlcyBvbnRvIGEgRE9NIGVsZW1lbnQsIHRha2luZyBpbnRvIGFjY291bnQgdGhlIGN1cnJlbnRseSBzZXQgYXR0cmlidXRlc1xuICogQHBhcmFtIHtFbGVtZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlfSBlbGVtZW50XG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcgfCBzeW1ib2wsIGFueT4gfCB1bmRlZmluZWR9IHByZXZcbiAqIEBwYXJhbSB7UmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgYW55Pn0gbmV4dCBOZXcgYXR0cmlidXRlcyAtIHRoaXMgZnVuY3Rpb24gbXV0YXRlcyB0aGlzIG9iamVjdFxuICogQHBhcmFtIHtzdHJpbmd9IFtjc3NfaGFzaF1cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3Nob3VsZF9yZW1vdmVfZGVmYXVsdHNdXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtza2lwX3dhcm5pbmddXG4gKiBAcmV0dXJucyB7UmVjb3JkPHN0cmluZywgYW55Pn1cbiAqL1xuZnVuY3Rpb24gc2V0X2F0dHJpYnV0ZXMoXG5cdGVsZW1lbnQsXG5cdHByZXYsXG5cdG5leHQsXG5cdGNzc19oYXNoLFxuXHRzaG91bGRfcmVtb3ZlX2RlZmF1bHRzID0gZmFsc2UsXG5cdHNraXBfd2FybmluZyA9IGZhbHNlXG4pIHtcblx0aWYgKGh5ZHJhdGluZyAmJiBzaG91bGRfcmVtb3ZlX2RlZmF1bHRzICYmIGVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJykge1xuXHRcdHZhciBpbnB1dCA9IC8qKiBAdHlwZSB7SFRNTElucHV0RWxlbWVudH0gKi8gKGVsZW1lbnQpO1xuXHRcdHZhciBhdHRyaWJ1dGUgPSBpbnB1dC50eXBlID09PSAnY2hlY2tib3gnID8gJ2RlZmF1bHRDaGVja2VkJyA6ICdkZWZhdWx0VmFsdWUnO1xuXG5cdFx0aWYgKCEoYXR0cmlidXRlIGluIG5leHQpKSB7XG5cdFx0XHRyZW1vdmVfaW5wdXRfZGVmYXVsdHMoaW5wdXQpO1xuXHRcdH1cblx0fVxuXG5cdHZhciBhdHRyaWJ1dGVzID0gZ2V0X2F0dHJpYnV0ZXMoZWxlbWVudCk7XG5cblx0dmFyIGlzX2N1c3RvbV9lbGVtZW50ID0gYXR0cmlidXRlc1tJU19DVVNUT01fRUxFTUVOVF07XG5cdHZhciBwcmVzZXJ2ZV9hdHRyaWJ1dGVfY2FzZSA9ICFhdHRyaWJ1dGVzW0lTX0hUTUxdO1xuXG5cdC8vIElmIHdlJ3JlIGh5ZHJhdGluZyBidXQgdGhlIGN1c3RvbSBlbGVtZW50IGlzIGZyb20gU3ZlbHRlLCBhbmQgaXQgYWxyZWFkeSBzY2FmZm9sZGVkLFxuXHQvLyB0aGVuIGl0IG1pZ2h0IHJ1biBibG9jayBsb2dpYyBpbiBoeWRyYXRpb24gbW9kZSwgd2hpY2ggd2UgaGF2ZSB0byBwcmV2ZW50LlxuXHRsZXQgaXNfaHlkcmF0aW5nX2N1c3RvbV9lbGVtZW50ID0gaHlkcmF0aW5nICYmIGlzX2N1c3RvbV9lbGVtZW50O1xuXHRpZiAoaXNfaHlkcmF0aW5nX2N1c3RvbV9lbGVtZW50KSB7XG5cdFx0c2V0X2h5ZHJhdGluZyhmYWxzZSk7XG5cdH1cblxuXHR2YXIgY3VycmVudCA9IHByZXYgfHwge307XG5cdHZhciBpc19vcHRpb25fZWxlbWVudCA9IGVsZW1lbnQudGFnTmFtZSA9PT0gJ09QVElPTic7XG5cblx0Zm9yICh2YXIga2V5IGluIHByZXYpIHtcblx0XHRpZiAoIShrZXkgaW4gbmV4dCkpIHtcblx0XHRcdG5leHRba2V5XSA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0aWYgKG5leHQuY2xhc3MpIHtcblx0XHRuZXh0LmNsYXNzID0gY2xzeChuZXh0LmNsYXNzKTtcblx0fSBlbHNlIGlmIChjc3NfaGFzaCB8fCBuZXh0W0NMQVNTXSkge1xuXHRcdG5leHQuY2xhc3MgPSBudWxsOyAvKiBmb3JjZSBjYWxsIHRvIHNldF9jbGFzcygpICovXG5cdH1cblxuXHRpZiAobmV4dFtTVFlMRV0pIHtcblx0XHRuZXh0LnN0eWxlID8/PSBudWxsOyAvKiBmb3JjZSBjYWxsIHRvIHNldF9zdHlsZSgpICovXG5cdH1cblxuXHR2YXIgc2V0dGVycyA9IGdldF9zZXR0ZXJzKGVsZW1lbnQpO1xuXG5cdC8vIHNpbmNlIGtleSBpcyBjYXB0dXJlZCB3ZSB1c2UgY29uc3Rcblx0Zm9yIChjb25zdCBrZXkgaW4gbmV4dCkge1xuXHRcdC8vIGxldCBpbnN0ZWFkIG9mIHZhciBiZWNhdXNlIHJlZmVyZW5jZWQgaW4gYSBjbG9zdXJlXG5cdFx0bGV0IHZhbHVlID0gbmV4dFtrZXldO1xuXG5cdFx0Ly8gVXAgaGVyZSBiZWNhdXNlIHdlIHdhbnQgdG8gZG8gdGhpcyBmb3IgdGhlIGluaXRpYWwgdmFsdWUsIHRvbywgZXZlbiBpZiBpdCdzIHVuZGVmaW5lZCxcblx0XHQvLyBhbmQgdGhpcyB3b3VsZG4ndCBiZSByZWFjaGVkIGluIGNhc2Ugb2YgdW5kZWZpbmVkIGJlY2F1c2Ugb2YgdGhlIGVxdWFsaXR5IGNoZWNrIGJlbG93XG5cdFx0aWYgKGlzX29wdGlvbl9lbGVtZW50ICYmIGtleSA9PT0gJ3ZhbHVlJyAmJiB2YWx1ZSA9PSBudWxsKSB7XG5cdFx0XHQvLyBUaGUgPG9wdGlvbj4gZWxlbWVudCBpcyBhIHNwZWNpYWwgY2FzZSBiZWNhdXNlIHJlbW92aW5nIHRoZSB2YWx1ZSBhdHRyaWJ1dGUgbWVhbnNcblx0XHRcdC8vIHRoZSB2YWx1ZSBpcyBzZXQgdG8gdGhlIHRleHQgY29udGVudCBvZiB0aGUgb3B0aW9uIGVsZW1lbnQsIGFuZCBzZXR0aW5nIHRoZSB2YWx1ZVxuXHRcdFx0Ly8gdG8gbnVsbCBvciB1bmRlZmluZWQgbWVhbnMgdGhlIHZhbHVlIGlzIHNldCB0byB0aGUgc3RyaW5nIFwibnVsbFwiIG9yIFwidW5kZWZpbmVkXCIuXG5cdFx0XHQvLyBUbyBhbGlnbiB3aXRoIGhvdyB3ZSBoYW5kbGUgdGhpcyBjYXNlIGluIG5vbi1zcHJlYWQtc2NlbmFyaW9zLCB0aGlzIGxvZ2ljIGlzIG5lZWRlZC5cblx0XHRcdC8vIFRoZXJlJ3MgYSBzdXBlci1lZGdlLWNhc2UgYnVnIGhlcmUgdGhhdCBpcyBsZWZ0IGluIGluIGZhdm9yIG9mIHNtYWxsZXIgY29kZSBzaXplOlxuXHRcdFx0Ly8gQmVjYXVzZSBvZiB0aGUgXCJzZXQgbWlzc2luZyBwcm9wcyB0byBudWxsXCIgbG9naWMgYWJvdmUsIHdlIGNhbid0IGRpZmZlcmVudGlhdGVcblx0XHRcdC8vIGJldHdlZW4gYSBtaXNzaW5nIHZhbHVlIGFuZCBhbiBleHBsaWNpdGx5IHNldCB2YWx1ZSBvZiBudWxsIG9yIHVuZGVmaW5lZC4gVGhhdCBtZWFuc1xuXHRcdFx0Ly8gdGhhdCBvbmNlIHNldCwgdGhlIHZhbHVlIGF0dHJpYnV0ZSBvZiBhbiA8b3B0aW9uPiBlbGVtZW50IGNhbid0IGJlIHJlbW92ZWQuIFRoaXMgaXNcblx0XHRcdC8vIGEgdmVyeSByYXJlIGVkZ2UgY2FzZSwgYW5kIHJlbW92aW5nIHRoZSBhdHRyaWJ1dGUgYWx0b2dldGhlciBpc24ndCBwb3NzaWJsZSBlaXRoZXJcblx0XHRcdC8vIGZvciB0aGUgPG9wdGlvbiB2YWx1ZT17dW5kZWZpbmVkfT4gY2FzZSwgc28gd2UncmUgbm90IGxvc2luZyBhbnkgZnVuY3Rpb25hbGl0eSBoZXJlLlxuXHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0ZWxlbWVudC52YWx1ZSA9IGVsZW1lbnQuX192YWx1ZSA9ICcnO1xuXHRcdFx0Y3VycmVudFtrZXldID0gdmFsdWU7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoa2V5ID09PSAnY2xhc3MnKSB7XG5cdFx0XHR2YXIgaXNfaHRtbCA9IGVsZW1lbnQubmFtZXNwYWNlVVJJID09PSAnaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCc7XG5cdFx0XHRzZXRfY2xhc3MoZWxlbWVudCwgaXNfaHRtbCwgdmFsdWUsIGNzc19oYXNoLCBwcmV2Py5bQ0xBU1NdLCBuZXh0W0NMQVNTXSk7XG5cdFx0XHRjdXJyZW50W2tleV0gPSB2YWx1ZTtcblx0XHRcdGN1cnJlbnRbQ0xBU1NdID0gbmV4dFtDTEFTU107XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoa2V5ID09PSAnc3R5bGUnKSB7XG5cdFx0XHRzZXRfc3R5bGUoZWxlbWVudCwgdmFsdWUsIHByZXY/LltTVFlMRV0sIG5leHRbU1RZTEVdKTtcblx0XHRcdGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuXHRcdFx0Y3VycmVudFtTVFlMRV0gPSBuZXh0W1NUWUxFXTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHZhciBwcmV2X3ZhbHVlID0gY3VycmVudFtrZXldO1xuXG5cdFx0Ly8gU2tpcCBpZiB2YWx1ZSBpcyB1bmNoYW5nZWQsIHVubGVzcyBpdCdzIGB1bmRlZmluZWRgIGFuZCB0aGUgZWxlbWVudCBzdGlsbCBoYXMgdGhlIGF0dHJpYnV0ZVxuXHRcdGlmICh2YWx1ZSA9PT0gcHJldl92YWx1ZSAmJiAhKHZhbHVlID09PSB1bmRlZmluZWQgJiYgZWxlbWVudC5oYXNBdHRyaWJ1dGUoa2V5KSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuXG5cdFx0dmFyIHByZWZpeCA9IGtleVswXSArIGtleVsxXTsgLy8gdGhpcyBpcyBmYXN0ZXIgdGhhbiBrZXkuc2xpY2UoMCwgMilcblx0XHRpZiAocHJlZml4ID09PSAnJCQnKSBjb250aW51ZTtcblxuXHRcdGlmIChwcmVmaXggPT09ICdvbicpIHtcblx0XHRcdC8qKiBAdHlwZSB7eyBjYXB0dXJlPzogdHJ1ZSB9fSAqL1xuXHRcdFx0Y29uc3Qgb3B0cyA9IHt9O1xuXHRcdFx0Y29uc3QgZXZlbnRfaGFuZGxlX2tleSA9ICckJCcgKyBrZXk7XG5cdFx0XHRsZXQgZXZlbnRfbmFtZSA9IGtleS5zbGljZSgyKTtcblx0XHRcdHZhciBkZWxlZ2F0ZWQgPSBjYW5fZGVsZWdhdGVfZXZlbnQoZXZlbnRfbmFtZSk7XG5cblx0XHRcdGlmIChpc19jYXB0dXJlX2V2ZW50KGV2ZW50X25hbWUpKSB7XG5cdFx0XHRcdGV2ZW50X25hbWUgPSBldmVudF9uYW1lLnNsaWNlKDAsIC03KTtcblx0XHRcdFx0b3B0cy5jYXB0dXJlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFkZWxlZ2F0ZWQgJiYgcHJldl92YWx1ZSkge1xuXHRcdFx0XHQvLyBMaXN0ZW5pbmcgdG8gc2FtZSBldmVudCBidXQgZGlmZmVyZW50IGhhbmRsZXIgLT4gb3VyIGhhbmRsZSBmdW5jdGlvbiBiZWxvdyB0YWtlcyBjYXJlIG9mIHRoaXNcblx0XHRcdFx0Ly8gSWYgd2Ugd2VyZSB0byByZW1vdmUgYW5kIGFkZCBsaXN0ZW5lcnMgaW4gdGhpcyBjYXNlLCBpdCBjb3VsZCBoYXBwZW4gdGhhdCB0aGUgZXZlbnQgaXMgXCJzd2FsbG93ZWRcIlxuXHRcdFx0XHQvLyAodGhlIGJyb3dzZXIgc2VlbXMgdG8gbm90IGtub3cgeWV0IHRoYXQgYSBuZXcgb25lIGV4aXN0cyBub3cpIGFuZCBkb2Vzbid0IHJlYWNoIHRoZSBoYW5kbGVyXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9zdmVsdGVqcy9zdmVsdGUvaXNzdWVzLzExOTAzXG5cdFx0XHRcdGlmICh2YWx1ZSAhPSBudWxsKSBjb250aW51ZTtcblxuXHRcdFx0XHRlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRfbmFtZSwgY3VycmVudFtldmVudF9oYW5kbGVfa2V5XSwgb3B0cyk7XG5cdFx0XHRcdGN1cnJlbnRbZXZlbnRfaGFuZGxlX2tleV0gPSBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmFsdWUgIT0gbnVsbCkge1xuXHRcdFx0XHRpZiAoIWRlbGVnYXRlZCkge1xuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIEB0aGlzIHthbnl9XG5cdFx0XHRcdFx0ICogQHBhcmFtIHtFdmVudH0gZXZ0XG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0ZnVuY3Rpb24gaGFuZGxlKGV2dCkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFtrZXldLmNhbGwodGhpcywgZXZ0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjdXJyZW50W2V2ZW50X2hhbmRsZV9rZXldID0gY3JlYXRlX2V2ZW50KGV2ZW50X25hbWUsIGVsZW1lbnQsIGhhbmRsZSwgb3B0cyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0XHRcdGVsZW1lbnRbYF9fJHtldmVudF9uYW1lfWBdID0gdmFsdWU7XG5cdFx0XHRcdFx0ZGVsZWdhdGUoW2V2ZW50X25hbWVdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChkZWxlZ2F0ZWQpIHtcblx0XHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0XHRlbGVtZW50W2BfXyR7ZXZlbnRfbmFtZX1gXSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ3N0eWxlJykge1xuXHRcdFx0Ly8gYXZvaWQgdXNpbmcgdGhlIHNldHRlclxuXHRcdFx0c2V0X2F0dHJpYnV0ZShlbGVtZW50LCBrZXksIHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ2F1dG9mb2N1cycpIHtcblx0XHRcdGF1dG9mb2N1cygvKiogQHR5cGUge0hUTUxFbGVtZW50fSAqLyAoZWxlbWVudCksIEJvb2xlYW4odmFsdWUpKTtcblx0XHR9IGVsc2UgaWYgKCFpc19jdXN0b21fZWxlbWVudCAmJiAoa2V5ID09PSAnX192YWx1ZScgfHwgKGtleSA9PT0gJ3ZhbHVlJyAmJiB2YWx1ZSAhPSBudWxsKSkpIHtcblx0XHRcdC8vIEB0cy1pZ25vcmUgV2UncmUgbm90IHJ1bm5pbmcgdGhpcyBmb3IgY3VzdG9tIGVsZW1lbnRzIGJlY2F1c2UgX192YWx1ZSBpcyBhY3R1YWxseVxuXHRcdFx0Ly8gaG93IExpdCBzdG9yZXMgdGhlIGN1cnJlbnQgdmFsdWUgb24gdGhlIGVsZW1lbnQsIGFuZCBtZXNzaW5nIHdpdGggdGhhdCB3b3VsZCBicmVhayB0aGluZ3MuXG5cdFx0XHRlbGVtZW50LnZhbHVlID0gZWxlbWVudC5fX3ZhbHVlID0gdmFsdWU7XG5cdFx0fSBlbHNlIGlmIChrZXkgPT09ICdzZWxlY3RlZCcgJiYgaXNfb3B0aW9uX2VsZW1lbnQpIHtcblx0XHRcdHNldF9zZWxlY3RlZCgvKiogQHR5cGUge0hUTUxPcHRpb25FbGVtZW50fSAqLyAoZWxlbWVudCksIHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIG5hbWUgPSBrZXk7XG5cdFx0XHRpZiAoIXByZXNlcnZlX2F0dHJpYnV0ZV9jYXNlKSB7XG5cdFx0XHRcdG5hbWUgPSBub3JtYWxpemVfYXR0cmlidXRlKG5hbWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgaXNfZGVmYXVsdCA9IG5hbWUgPT09ICdkZWZhdWx0VmFsdWUnIHx8IG5hbWUgPT09ICdkZWZhdWx0Q2hlY2tlZCc7XG5cblx0XHRcdGlmICh2YWx1ZSA9PSBudWxsICYmICFpc19jdXN0b21fZWxlbWVudCAmJiAhaXNfZGVmYXVsdCkge1xuXHRcdFx0XHRhdHRyaWJ1dGVzW2tleV0gPSBudWxsO1xuXG5cdFx0XHRcdGlmIChuYW1lID09PSAndmFsdWUnIHx8IG5hbWUgPT09ICdjaGVja2VkJykge1xuXHRcdFx0XHRcdC8vIHJlbW92aW5nIHZhbHVlL2NoZWNrZWQgYWxzbyByZW1vdmVzIGRlZmF1bHRWYWx1ZS9kZWZhdWx0Q2hlY2tlZCDigJQgcHJlc2VydmVcblx0XHRcdFx0XHRsZXQgaW5wdXQgPSAvKiogQHR5cGUge0hUTUxJbnB1dEVsZW1lbnR9ICovIChlbGVtZW50KTtcblx0XHRcdFx0XHRjb25zdCB1c2VfZGVmYXVsdCA9IHByZXYgPT09IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAobmFtZSA9PT0gJ3ZhbHVlJykge1xuXHRcdFx0XHRcdFx0bGV0IHByZXZpb3VzID0gaW5wdXQuZGVmYXVsdFZhbHVlO1xuXHRcdFx0XHRcdFx0aW5wdXQucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuXHRcdFx0XHRcdFx0aW5wdXQuZGVmYXVsdFZhbHVlID0gcHJldmlvdXM7XG5cdFx0XHRcdFx0XHQvLyBAdHMtaWdub3JlXG5cdFx0XHRcdFx0XHRpbnB1dC52YWx1ZSA9IGlucHV0Ll9fdmFsdWUgPSB1c2VfZGVmYXVsdCA/IHByZXZpb3VzIDogbnVsbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGV0IHByZXZpb3VzID0gaW5wdXQuZGVmYXVsdENoZWNrZWQ7XG5cdFx0XHRcdFx0XHRpbnB1dC5yZW1vdmVBdHRyaWJ1dGUobmFtZSk7XG5cdFx0XHRcdFx0XHRpbnB1dC5kZWZhdWx0Q2hlY2tlZCA9IHByZXZpb3VzO1xuXHRcdFx0XHRcdFx0aW5wdXQuY2hlY2tlZCA9IHVzZV9kZWZhdWx0ID8gcHJldmlvdXMgOiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChcblx0XHRcdFx0aXNfZGVmYXVsdCB8fFxuXHRcdFx0XHQoc2V0dGVycy5pbmNsdWRlcyhuYW1lKSAmJiAoaXNfY3VzdG9tX2VsZW1lbnQgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykpXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0XHRlbGVtZW50W25hbWVdID0gdmFsdWU7XG5cdFx0XHRcdC8vIHJlbW92ZSBpdCBmcm9tIGF0dHJpYnV0ZXMncyBjYWNoZVxuXHRcdFx0XHRpZiAobmFtZSBpbiBhdHRyaWJ1dGVzKSBhdHRyaWJ1dGVzW25hbWVdID0gVU5JTklUSUFMSVpFRDtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHNldF9hdHRyaWJ1dGUoZWxlbWVudCwgbmFtZSwgdmFsdWUsIHNraXBfd2FybmluZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGlzX2h5ZHJhdGluZ19jdXN0b21fZWxlbWVudCkge1xuXHRcdHNldF9oeWRyYXRpbmcodHJ1ZSk7XG5cdH1cblxuXHRyZXR1cm4gY3VycmVudDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0VsZW1lbnQgJiBFbGVtZW50Q1NTSW5saW5lU3R5bGV9IGVsZW1lbnRcbiAqIEBwYXJhbSB7KC4uLmV4cHJlc3Npb25zOiBhbnkpID0+IFJlY29yZDxzdHJpbmcgfCBzeW1ib2wsIGFueT59IGZuXG4gKiBAcGFyYW0ge0FycmF5PCgpID0+IGFueT59IHN5bmNcbiAqIEBwYXJhbSB7QXJyYXk8KCkgPT4gUHJvbWlzZTxhbnk+Pn0gYXN5bmNcbiAqIEBwYXJhbSB7QXJyYXk8UHJvbWlzZTx2b2lkPj59IGJsb2NrZXJzXG4gKiBAcGFyYW0ge3N0cmluZ30gW2Nzc19oYXNoXVxuICogQHBhcmFtIHtib29sZWFufSBbc2hvdWxkX3JlbW92ZV9kZWZhdWx0c11cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBfd2FybmluZ11cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF0dHJpYnV0ZV9lZmZlY3QoXG5cdGVsZW1lbnQsXG5cdGZuLFxuXHRzeW5jID0gW10sXG5cdGFzeW5jID0gW10sXG5cdGJsb2NrZXJzID0gW10sXG5cdGNzc19oYXNoLFxuXHRzaG91bGRfcmVtb3ZlX2RlZmF1bHRzID0gZmFsc2UsXG5cdHNraXBfd2FybmluZyA9IGZhbHNlXG4pIHtcblx0ZmxhdHRlbihibG9ja2Vycywgc3luYywgYXN5bmMsICh2YWx1ZXMpID0+IHtcblx0XHQvKiogQHR5cGUge1JlY29yZDxzdHJpbmcgfCBzeW1ib2wsIGFueT4gfCB1bmRlZmluZWR9ICovXG5cdFx0dmFyIHByZXYgPSB1bmRlZmluZWQ7XG5cblx0XHQvKiogQHR5cGUge1JlY29yZDxzeW1ib2wsIEVmZmVjdD59ICovXG5cdFx0dmFyIGVmZmVjdHMgPSB7fTtcblxuXHRcdHZhciBpc19zZWxlY3QgPSBlbGVtZW50Lm5vZGVOYW1lID09PSAnU0VMRUNUJztcblx0XHR2YXIgaW5pdGVkID0gZmFsc2U7XG5cblx0XHRtYW5hZ2VkKCgpID0+IHtcblx0XHRcdHZhciBuZXh0ID0gZm4oLi4udmFsdWVzLm1hcChnZXQpKTtcblx0XHRcdC8qKiBAdHlwZSB7UmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgYW55Pn0gKi9cblx0XHRcdHZhciBjdXJyZW50ID0gc2V0X2F0dHJpYnV0ZXMoXG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdHByZXYsXG5cdFx0XHRcdG5leHQsXG5cdFx0XHRcdGNzc19oYXNoLFxuXHRcdFx0XHRzaG91bGRfcmVtb3ZlX2RlZmF1bHRzLFxuXHRcdFx0XHRza2lwX3dhcm5pbmdcblx0XHRcdCk7XG5cblx0XHRcdGlmIChpbml0ZWQgJiYgaXNfc2VsZWN0ICYmICd2YWx1ZScgaW4gbmV4dCkge1xuXHRcdFx0XHRzZWxlY3Rfb3B0aW9uKC8qKiBAdHlwZSB7SFRNTFNlbGVjdEVsZW1lbnR9ICovIChlbGVtZW50KSwgbmV4dC52YWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IHN5bWJvbCBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKGVmZmVjdHMpKSB7XG5cdFx0XHRcdGlmICghbmV4dFtzeW1ib2xdKSBkZXN0cm95X2VmZmVjdChlZmZlY3RzW3N5bWJvbF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBzeW1ib2wgb2YgT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyhuZXh0KSkge1xuXHRcdFx0XHR2YXIgbiA9IG5leHRbc3ltYm9sXTtcblxuXHRcdFx0XHRpZiAoc3ltYm9sLmRlc2NyaXB0aW9uID09PSBBVFRBQ0hNRU5UX0tFWSAmJiAoIXByZXYgfHwgbiAhPT0gcHJldltzeW1ib2xdKSkge1xuXHRcdFx0XHRcdGlmIChlZmZlY3RzW3N5bWJvbF0pIGRlc3Ryb3lfZWZmZWN0KGVmZmVjdHNbc3ltYm9sXSk7XG5cdFx0XHRcdFx0ZWZmZWN0c1tzeW1ib2xdID0gYnJhbmNoKCgpID0+IGF0dGFjaChlbGVtZW50LCAoKSA9PiBuKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjdXJyZW50W3N5bWJvbF0gPSBuO1xuXHRcdFx0fVxuXG5cdFx0XHRwcmV2ID0gY3VycmVudDtcblx0XHR9KTtcblxuXHRcdGlmIChpc19zZWxlY3QpIHtcblx0XHRcdHZhciBzZWxlY3QgPSAvKiogQHR5cGUge0hUTUxTZWxlY3RFbGVtZW50fSAqLyAoZWxlbWVudCk7XG5cblx0XHRcdGVmZmVjdCgoKSA9PiB7XG5cdFx0XHRcdHNlbGVjdF9vcHRpb24oc2VsZWN0LCAvKiogQHR5cGUge1JlY29yZDxzdHJpbmcgfCBzeW1ib2wsIGFueT59ICovIChwcmV2KS52YWx1ZSwgdHJ1ZSk7XG5cdFx0XHRcdGluaXRfc2VsZWN0KHNlbGVjdCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpbml0ZWQgPSB0cnVlO1xuXHR9KTtcbn1cblxuLyoqXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50XG4gKi9cbmZ1bmN0aW9uIGdldF9hdHRyaWJ1dGVzKGVsZW1lbnQpIHtcblx0cmV0dXJuIC8qKiBAdHlwZSB7UmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgdW5rbm93bj59ICoqLyAoXG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdGVsZW1lbnQuX19hdHRyaWJ1dGVzID8/PSB7XG5cdFx0XHRbSVNfQ1VTVE9NX0VMRU1FTlRdOiBlbGVtZW50Lm5vZGVOYW1lLmluY2x1ZGVzKCctJyksXG5cdFx0XHRbSVNfSFRNTF06IGVsZW1lbnQubmFtZXNwYWNlVVJJID09PSBOQU1FU1BBQ0VfSFRNTFxuXHRcdH1cblx0KTtcbn1cblxuLyoqIEB0eXBlIHtNYXA8c3RyaW5nLCBzdHJpbmdbXT59ICovXG52YXIgc2V0dGVyc19jYWNoZSA9IG5ldyBNYXAoKTtcblxuLyoqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudCAqL1xuZnVuY3Rpb24gZ2V0X3NldHRlcnMoZWxlbWVudCkge1xuXHR2YXIgY2FjaGVfa2V5ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lzJykgfHwgZWxlbWVudC5ub2RlTmFtZTtcblx0dmFyIHNldHRlcnMgPSBzZXR0ZXJzX2NhY2hlLmdldChjYWNoZV9rZXkpO1xuXHRpZiAoc2V0dGVycykgcmV0dXJuIHNldHRlcnM7XG5cdHNldHRlcnNfY2FjaGUuc2V0KGNhY2hlX2tleSwgKHNldHRlcnMgPSBbXSkpO1xuXG5cdHZhciBkZXNjcmlwdG9ycztcblx0dmFyIHByb3RvID0gZWxlbWVudDsgLy8gSW4gdGhlIGNhc2Ugb2YgY3VzdG9tIGVsZW1lbnRzIHRoZXJlIG1pZ2h0IGJlIHNldHRlcnMgb24gdGhlIGluc3RhbmNlXG5cdHZhciBlbGVtZW50X3Byb3RvID0gRWxlbWVudC5wcm90b3R5cGU7XG5cblx0Ly8gU3RvcCBhdCBFbGVtZW50LCBmcm9tIHRoZXJlIG9uIHRoZXJlJ3Mgb25seSB1bm5lY2Vzc2FyeSBzZXR0ZXJzIHdlJ3JlIG5vdCBpbnRlcmVzdGVkIGluXG5cdC8vIERvIG5vdCB1c2UgY29udHJ1Y3Rvci5uYW1lIGhlcmUgYXMgdGhhdCdzIHVucmVsaWFibGUgaW4gc29tZSBicm93c2VyIGVudmlyb25tZW50c1xuXHR3aGlsZSAoZWxlbWVudF9wcm90byAhPT0gcHJvdG8pIHtcblx0XHRkZXNjcmlwdG9ycyA9IGdldF9kZXNjcmlwdG9ycyhwcm90byk7XG5cblx0XHRmb3IgKHZhciBrZXkgaW4gZGVzY3JpcHRvcnMpIHtcblx0XHRcdGlmIChkZXNjcmlwdG9yc1trZXldLnNldCkge1xuXHRcdFx0XHRzZXR0ZXJzLnB1c2goa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcm90byA9IGdldF9wcm90b3R5cGVfb2YocHJvdG8pO1xuXHR9XG5cblx0cmV0dXJuIHNldHRlcnM7XG59XG5cbi8qKlxuICogQHBhcmFtIHthbnl9IGVsZW1lbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBhdHRyaWJ1dGVcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICovXG5mdW5jdGlvbiBjaGVja19zcmNfaW5fZGV2X2h5ZHJhdGlvbihlbGVtZW50LCBhdHRyaWJ1dGUsIHZhbHVlKSB7XG5cdGlmICghREVWKSByZXR1cm47XG5cdGlmIChhdHRyaWJ1dGUgPT09ICdzcmNzZXQnICYmIHNyY3NldF91cmxfZXF1YWwoZWxlbWVudCwgdmFsdWUpKSByZXR1cm47XG5cdGlmIChzcmNfdXJsX2VxdWFsKGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHJpYnV0ZSkgPz8gJycsIHZhbHVlKSkgcmV0dXJuO1xuXG5cdHcuaHlkcmF0aW9uX2F0dHJpYnV0ZV9jaGFuZ2VkKFxuXHRcdGF0dHJpYnV0ZSxcblx0XHRlbGVtZW50Lm91dGVySFRNTC5yZXBsYWNlKGVsZW1lbnQuaW5uZXJIVE1MLCBlbGVtZW50LmlubmVySFRNTCAmJiAnLi4uJyksXG5cdFx0U3RyaW5nKHZhbHVlKVxuXHQpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBlbGVtZW50X3NyY1xuICogQHBhcmFtIHtzdHJpbmd9IHVybFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIHNyY191cmxfZXF1YWwoZWxlbWVudF9zcmMsIHVybCkge1xuXHRpZiAoZWxlbWVudF9zcmMgPT09IHVybCkgcmV0dXJuIHRydWU7XG5cdHJldHVybiBuZXcgVVJMKGVsZW1lbnRfc3JjLCBkb2N1bWVudC5iYXNlVVJJKS5ocmVmID09PSBuZXcgVVJMKHVybCwgZG9jdW1lbnQuYmFzZVVSSSkuaHJlZjtcbn1cblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBzcmNzZXQgKi9cbmZ1bmN0aW9uIHNwbGl0X3NyY3NldChzcmNzZXQpIHtcblx0cmV0dXJuIHNyY3NldC5zcGxpdCgnLCcpLm1hcCgoc3JjKSA9PiBzcmMudHJpbSgpLnNwbGl0KCcgJykuZmlsdGVyKEJvb2xlYW4pKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0hUTUxTb3VyY2VFbGVtZW50IHwgSFRNTEltYWdlRWxlbWVudH0gZWxlbWVudFxuICogQHBhcmFtIHtzdHJpbmd9IHNyY3NldFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIHNyY3NldF91cmxfZXF1YWwoZWxlbWVudCwgc3Jjc2V0KSB7XG5cdHZhciBlbGVtZW50X3VybHMgPSBzcGxpdF9zcmNzZXQoZWxlbWVudC5zcmNzZXQpO1xuXHR2YXIgdXJscyA9IHNwbGl0X3NyY3NldChzcmNzZXQpO1xuXG5cdHJldHVybiAoXG5cdFx0dXJscy5sZW5ndGggPT09IGVsZW1lbnRfdXJscy5sZW5ndGggJiZcblx0XHR1cmxzLmV2ZXJ5KFxuXHRcdFx0KFt1cmwsIHdpZHRoXSwgaSkgPT5cblx0XHRcdFx0d2lkdGggPT09IGVsZW1lbnRfdXJsc1tpXVsxXSAmJlxuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIHRlc3QgYm90aCB3YXlzIGJlY2F1c2UgVml0ZSB3aWxsIGNyZWF0ZSBhbiBhIGZ1bGwgVVJMIHdpdGhcblx0XHRcdFx0Ly8gYG5ldyBVUkwoYXNzZXQsIGltcG9ydC5tZXRhLnVybCkuaHJlZmAgZm9yIHRoZSBjbGllbnQgd2hlbiBgYmFzZTogJy4vJ2AsIGFuZCB0aGVcblx0XHRcdFx0Ly8gcmVsYXRpdmUgVVJMcyBpbnNpZGUgc3Jjc2V0IGFyZSBub3QgYXV0b21hdGljYWxseSByZXNvbHZlZCB0byBhYnNvbHV0ZSBVUkxzIGJ5XG5cdFx0XHRcdC8vIGJyb3dzZXJzIChpbiBjb250cmFzdCB0byBpbWcuc3JjKS4gVGhpcyBtZWFucyBib3RoIFNTUiBhbmQgRE9NIGNvZGUgY291bGRcblx0XHRcdFx0Ly8gY29udGFpbiByZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkxzLlxuXHRcdFx0XHQoc3JjX3VybF9lcXVhbChlbGVtZW50X3VybHNbaV1bMF0sIHVybCkgfHwgc3JjX3VybF9lcXVhbCh1cmwsIGVsZW1lbnRfdXJsc1tpXVswXSkpXG5cdFx0KVxuXHQpO1xufVxuIiwiLyoqIEBpbXBvcnQgeyBCYXRjaCB9IGZyb20gJy4uLy4uLy4uL3JlYWN0aXZpdHkvYmF0Y2guanMnICovXG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcbmltcG9ydCB7IHJlbmRlcl9lZmZlY3QsIHRlYXJkb3duIH0gZnJvbSAnLi4vLi4vLi4vcmVhY3Rpdml0eS9lZmZlY3RzLmpzJztcbmltcG9ydCB7IGxpc3Rlbl90b19ldmVudF9hbmRfcmVzZXRfZXZlbnQgfSBmcm9tICcuL3NoYXJlZC5qcyc7XG5pbXBvcnQgKiBhcyBlIGZyb20gJy4uLy4uLy4uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpcyB9IGZyb20gJy4uLy4uLy4uL3Byb3h5LmpzJztcbmltcG9ydCB7IHF1ZXVlX21pY3JvX3Rhc2sgfSBmcm9tICcuLi8uLi90YXNrLmpzJztcbmltcG9ydCB7IGh5ZHJhdGluZyB9IGZyb20gJy4uLy4uL2h5ZHJhdGlvbi5qcyc7XG5pbXBvcnQgeyB0aWNrLCB1bnRyYWNrIH0gZnJvbSAnLi4vLi4vLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgeyBpc19ydW5lcyB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHQuanMnO1xuaW1wb3J0IHsgY3VycmVudF9iYXRjaCwgcHJldmlvdXNfYmF0Y2ggfSBmcm9tICcuLi8uLi8uLi9yZWFjdGl2aXR5L2JhdGNoLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge0hUTUxJbnB1dEVsZW1lbnR9IGlucHV0XG4gKiBAcGFyYW0geygpID0+IHVua25vd259IGdldFxuICogQHBhcmFtIHsodmFsdWU6IHVua25vd24pID0+IHZvaWR9IHNldFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kX3ZhbHVlKGlucHV0LCBnZXQsIHNldCA9IGdldCkge1xuXHR2YXIgYmF0Y2hlcyA9IG5ldyBXZWFrU2V0KCk7XG5cblx0bGlzdGVuX3RvX2V2ZW50X2FuZF9yZXNldF9ldmVudChpbnB1dCwgJ2lucHV0JywgYXN5bmMgKGlzX3Jlc2V0KSA9PiB7XG5cdFx0aWYgKERFViAmJiBpbnB1dC50eXBlID09PSAnY2hlY2tib3gnKSB7XG5cdFx0XHQvLyBUT0RPIHNob3VsZCB0aGlzIGhhcHBlbiBpbiBwcm9kIHRvbz9cblx0XHRcdGUuYmluZF9pbnZhbGlkX2NoZWNrYm94X3ZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0LyoqIEB0eXBlIHthbnl9ICovXG5cdFx0dmFyIHZhbHVlID0gaXNfcmVzZXQgPyBpbnB1dC5kZWZhdWx0VmFsdWUgOiBpbnB1dC52YWx1ZTtcblx0XHR2YWx1ZSA9IGlzX251bWJlcmxpa2VfaW5wdXQoaW5wdXQpID8gdG9fbnVtYmVyKHZhbHVlKSA6IHZhbHVlO1xuXHRcdHNldCh2YWx1ZSk7XG5cblx0XHRpZiAoY3VycmVudF9iYXRjaCAhPT0gbnVsbCkge1xuXHRcdFx0YmF0Y2hlcy5hZGQoY3VycmVudF9iYXRjaCk7XG5cdFx0fVxuXG5cdFx0Ly8gQmVjYXVzZSBgeyNlYWNoIC4uLn1gIGJsb2NrcyB3b3JrIGJ5IHVwZGF0aW5nIHNvdXJjZXMgaW5zaWRlIHRoZSBmbHVzaCxcblx0XHQvLyB3ZSBuZWVkIHRvIHdhaXQgYSB0aWNrIGJlZm9yZSBjaGVja2luZyB0byBzZWUgaWYgd2Ugc2hvdWxkIGZvcmNpYmx5XG5cdFx0Ly8gdXBkYXRlIHRoZSBpbnB1dCBhbmQgcmVzZXQgdGhlIHNlbGVjdGlvbiBzdGF0ZVxuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIFJlc3BlY3QgYW55IHZhbGlkYXRpb24gaW4gYWNjZXNzb3JzXG5cdFx0aWYgKHZhbHVlICE9PSAodmFsdWUgPSBnZXQoKSkpIHtcblx0XHRcdHZhciBzdGFydCA9IGlucHV0LnNlbGVjdGlvblN0YXJ0O1xuXHRcdFx0dmFyIGVuZCA9IGlucHV0LnNlbGVjdGlvbkVuZDtcblx0XHRcdHZhciBsZW5ndGggPSBpbnB1dC52YWx1ZS5sZW5ndGg7XG5cblx0XHRcdC8vIHRoZSB2YWx1ZSBpcyBjb2VyY2VkIG9uIGFzc2lnbm1lbnRcblx0XHRcdGlucHV0LnZhbHVlID0gdmFsdWUgPz8gJyc7XG5cblx0XHRcdC8vIFJlc3RvcmUgc2VsZWN0aW9uXG5cdFx0XHRpZiAoZW5kICE9PSBudWxsKSB7XG5cdFx0XHRcdHZhciBuZXdfbGVuZ3RoID0gaW5wdXQudmFsdWUubGVuZ3RoO1xuXHRcdFx0XHQvLyBJZiBjdXJzb3Igd2FzIGF0IGVuZCBhbmQgbmV3IGlucHV0IGlzIGxvbmdlciwgbW92ZSBjdXJzb3IgdG8gbmV3IGVuZFxuXHRcdFx0XHRpZiAoc3RhcnQgPT09IGVuZCAmJiBlbmQgPT09IGxlbmd0aCAmJiBuZXdfbGVuZ3RoID4gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0aW5wdXQuc2VsZWN0aW9uU3RhcnQgPSBuZXdfbGVuZ3RoO1xuXHRcdFx0XHRcdGlucHV0LnNlbGVjdGlvbkVuZCA9IG5ld19sZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXQuc2VsZWN0aW9uU3RhcnQgPSBzdGFydDtcblx0XHRcdFx0XHRpbnB1dC5zZWxlY3Rpb25FbmQgPSBNYXRoLm1pbihlbmQsIG5ld19sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRpZiAoXG5cdFx0Ly8gSWYgd2UgYXJlIGh5ZHJhdGluZyBhbmQgdGhlIHZhbHVlIGhhcyBzaW5jZSBjaGFuZ2VkLFxuXHRcdC8vIHRoZW4gdXNlIHRoZSB1cGRhdGVkIHZhbHVlIGZyb20gdGhlIGlucHV0IGluc3RlYWQuXG5cdFx0KGh5ZHJhdGluZyAmJiBpbnB1dC5kZWZhdWx0VmFsdWUgIT09IGlucHV0LnZhbHVlKSB8fFxuXHRcdC8vIElmIGRlZmF1bHRWYWx1ZSBpcyBzZXQsIHRoZW4gdmFsdWUgPT0gZGVmYXVsdFZhbHVlXG5cdFx0Ly8gVE9ETyBTdmVsdGUgNjogcmVtb3ZlIGlucHV0LnZhbHVlIGNoZWNrIGFuZCBzZXQgdG8gZW1wdHkgc3RyaW5nP1xuXHRcdCh1bnRyYWNrKGdldCkgPT0gbnVsbCAmJiBpbnB1dC52YWx1ZSlcblx0KSB7XG5cdFx0c2V0KGlzX251bWJlcmxpa2VfaW5wdXQoaW5wdXQpID8gdG9fbnVtYmVyKGlucHV0LnZhbHVlKSA6IGlucHV0LnZhbHVlKTtcblxuXHRcdGlmIChjdXJyZW50X2JhdGNoICE9PSBudWxsKSB7XG5cdFx0XHRiYXRjaGVzLmFkZChjdXJyZW50X2JhdGNoKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJfZWZmZWN0KCgpID0+IHtcblx0XHRpZiAoREVWICYmIGlucHV0LnR5cGUgPT09ICdjaGVja2JveCcpIHtcblx0XHRcdC8vIFRPRE8gc2hvdWxkIHRoaXMgaGFwcGVuIGluIHByb2QgdG9vP1xuXHRcdFx0ZS5iaW5kX2ludmFsaWRfY2hlY2tib3hfdmFsdWUoKTtcblx0XHR9XG5cblx0XHR2YXIgdmFsdWUgPSBnZXQoKTtcblxuXHRcdGlmIChpbnB1dCA9PT0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Ly8gd2UgbmVlZCBib3RoLCBiZWNhdXNlIGluIG5vbi1hc3luYyBtb2RlLCByZW5kZXIgZWZmZWN0cyBydW4gYmVmb3JlIHByZXZpb3VzX2JhdGNoIGlzIHNldFxuXHRcdFx0dmFyIGJhdGNoID0gLyoqIEB0eXBlIHtCYXRjaH0gKi8gKHByZXZpb3VzX2JhdGNoID8/IGN1cnJlbnRfYmF0Y2gpO1xuXG5cdFx0XHQvLyBOZXZlciByZXdyaXRlIHRoZSBjb250ZW50cyBvZiBhIGZvY3VzZWQgaW5wdXQuIFdlIGNhbiBnZXQgaGVyZSBpZiwgZm9yIGV4YW1wbGUsXG5cdFx0XHQvLyBhbiB1cGRhdGUgaXMgZGVmZXJyZWQgYmVjYXVzZSBvZiBhc3luYyB3b3JrIGRlcGVuZGluZyBvbiB0aGUgaW5wdXQ6XG5cdFx0XHQvL1xuXHRcdFx0Ly8gPGlucHV0IGJpbmQ6dmFsdWU9e3F1ZXJ5fT5cblx0XHRcdC8vIDxwPnthd2FpdCBmaW5kKHF1ZXJ5KX08L3A+XG5cdFx0XHRpZiAoYmF0Y2hlcy5oYXMoYmF0Y2gpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNfbnVtYmVybGlrZV9pbnB1dChpbnB1dCkgJiYgdmFsdWUgPT09IHRvX251bWJlcihpbnB1dC52YWx1ZSkpIHtcblx0XHRcdC8vIGhhbmRsZXMgMCB2cyAwMCBjYXNlIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL3N2ZWx0ZWpzL3N2ZWx0ZS9pc3N1ZXMvOTk1OSlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5wdXQudHlwZSA9PT0gJ2RhdGUnICYmICF2YWx1ZSAmJiAhaW5wdXQudmFsdWUpIHtcblx0XHRcdC8vIEhhbmRsZXMgdGhlIGNhc2Ugd2hlcmUgYSB0ZW1wb3JhcmlseSBpbnZhbGlkIGRhdGUgaXMgc2V0ICh3aGlsZSB0eXBpbmcsIGZvciBleGFtcGxlIHdpdGggYSBsZWFkaW5nIDAgZm9yIHRoZSBkYXkpXG5cdFx0XHQvLyBhbmQgcHJldmVudHMgdGhpcyBzdGF0ZSBmcm9tIGNsZWFyaW5nIHRoZSBvdGhlciBwYXJ0cyBvZiB0aGUgZGF0ZSBpbnB1dCAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9zdmVsdGVqcy9zdmVsdGUvaXNzdWVzLzc4OTcpXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZG9uJ3Qgc2V0IHRoZSB2YWx1ZSBvZiB0aGUgaW5wdXQgaWYgaXQncyB0aGUgc2FtZSB0byBhbGxvd1xuXHRcdC8vIG1pbmxlbmd0aCB0byB3b3JrIHByb3Blcmx5XG5cdFx0aWYgKHZhbHVlICE9PSBpbnB1dC52YWx1ZSkge1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciB0aGUgdmFsdWUgaXMgY29lcmNlZCBvbiBhc3NpZ25tZW50XG5cdFx0XHRpbnB1dC52YWx1ZSA9IHZhbHVlID8/ICcnO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKiBAdHlwZSB7U2V0PEhUTUxJbnB1dEVsZW1lbnRbXT59ICovXG5jb25zdCBwZW5kaW5nID0gbmV3IFNldCgpO1xuXG4vKipcbiAqIEBwYXJhbSB7SFRNTElucHV0RWxlbWVudFtdfSBpbnB1dHNcbiAqIEBwYXJhbSB7bnVsbCB8IFtudW1iZXJdfSBncm91cF9pbmRleFxuICogQHBhcmFtIHtIVE1MSW5wdXRFbGVtZW50fSBpbnB1dFxuICogQHBhcmFtIHsoKSA9PiB1bmtub3dufSBnZXRcbiAqIEBwYXJhbSB7KHZhbHVlOiB1bmtub3duKSA9PiB2b2lkfSBzZXRcbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmluZF9ncm91cChpbnB1dHMsIGdyb3VwX2luZGV4LCBpbnB1dCwgZ2V0LCBzZXQgPSBnZXQpIHtcblx0dmFyIGlzX2NoZWNrYm94ID0gaW5wdXQuZ2V0QXR0cmlidXRlKCd0eXBlJykgPT09ICdjaGVja2JveCc7XG5cdHZhciBiaW5kaW5nX2dyb3VwID0gaW5wdXRzO1xuXG5cdC8vIG5lZWRzIHRvIGJlIGxldCBvciByZWxhdGVkIGNvZGUgaXNuJ3QgdHJlZXNoYWtlbiBvdXQgaWYgaXQncyBhbHdheXMgZmFsc2Vcblx0bGV0IGh5ZHJhdGlvbl9taXNtYXRjaCA9IGZhbHNlO1xuXG5cdGlmIChncm91cF9pbmRleCAhPT0gbnVsbCkge1xuXHRcdGZvciAodmFyIGluZGV4IG9mIGdyb3VwX2luZGV4KSB7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRiaW5kaW5nX2dyb3VwID0gYmluZGluZ19ncm91cFtpbmRleF0gPz89IFtdO1xuXHRcdH1cblx0fVxuXG5cdGJpbmRpbmdfZ3JvdXAucHVzaChpbnB1dCk7XG5cblx0bGlzdGVuX3RvX2V2ZW50X2FuZF9yZXNldF9ldmVudChcblx0XHRpbnB1dCxcblx0XHQnY2hhbmdlJyxcblx0XHQoKSA9PiB7XG5cdFx0XHQvLyBAdHMtaWdub3JlXG5cdFx0XHR2YXIgdmFsdWUgPSBpbnB1dC5fX3ZhbHVlO1xuXG5cdFx0XHRpZiAoaXNfY2hlY2tib3gpIHtcblx0XHRcdFx0dmFsdWUgPSBnZXRfYmluZGluZ19ncm91cF92YWx1ZShiaW5kaW5nX2dyb3VwLCB2YWx1ZSwgaW5wdXQuY2hlY2tlZCk7XG5cdFx0XHR9XG5cblx0XHRcdHNldCh2YWx1ZSk7XG5cdFx0fSxcblx0XHQvLyBUT0RPIGJldHRlciBkZWZhdWx0IHZhbHVlIGhhbmRsaW5nXG5cdFx0KCkgPT4gc2V0KGlzX2NoZWNrYm94ID8gW10gOiBudWxsKVxuXHQpO1xuXG5cdHJlbmRlcl9lZmZlY3QoKCkgPT4ge1xuXHRcdHZhciB2YWx1ZSA9IGdldCgpO1xuXG5cdFx0Ly8gSWYgd2UgYXJlIGh5ZHJhdGluZyBhbmQgdGhlIHZhbHVlIGhhcyBzaW5jZSBjaGFuZ2VkLCB0aGVuIHVzZSB0aGUgdXBkYXRlIHZhbHVlXG5cdFx0Ly8gZnJvbSB0aGUgaW5wdXQgaW5zdGVhZC5cblx0XHRpZiAoaHlkcmF0aW5nICYmIGlucHV0LmRlZmF1bHRDaGVja2VkICE9PSBpbnB1dC5jaGVja2VkKSB7XG5cdFx0XHRoeWRyYXRpb25fbWlzbWF0Y2ggPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc19jaGVja2JveCkge1xuXHRcdFx0dmFsdWUgPSB2YWx1ZSB8fCBbXTtcblx0XHRcdC8vIEB0cy1pZ25vcmVcblx0XHRcdGlucHV0LmNoZWNrZWQgPSB2YWx1ZS5pbmNsdWRlcyhpbnB1dC5fX3ZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0aW5wdXQuY2hlY2tlZCA9IGlzKGlucHV0Ll9fdmFsdWUsIHZhbHVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHR2YXIgaW5kZXggPSBiaW5kaW5nX2dyb3VwLmluZGV4T2YoaW5wdXQpO1xuXG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0YmluZGluZ19ncm91cC5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0fSk7XG5cblx0aWYgKCFwZW5kaW5nLmhhcyhiaW5kaW5nX2dyb3VwKSkge1xuXHRcdHBlbmRpbmcuYWRkKGJpbmRpbmdfZ3JvdXApO1xuXG5cdFx0cXVldWVfbWljcm9fdGFzaygoKSA9PiB7XG5cdFx0XHQvLyBuZWNlc3NhcnkgdG8gbWFpbnRhaW4gYmluZGluZyBncm91cCBvcmRlciBpbiBhbGwgaW5zZXJ0aW9uIHNjZW5hcmlvc1xuXHRcdFx0YmluZGluZ19ncm91cC5zb3J0KChhLCBiKSA9PiAoYS5jb21wYXJlRG9jdW1lbnRQb3NpdGlvbihiKSA9PT0gNCA/IC0xIDogMSkpO1xuXHRcdFx0cGVuZGluZy5kZWxldGUoYmluZGluZ19ncm91cCk7XG5cdFx0fSk7XG5cdH1cblxuXHRxdWV1ZV9taWNyb190YXNrKCgpID0+IHtcblx0XHRpZiAoaHlkcmF0aW9uX21pc21hdGNoKSB7XG5cdFx0XHR2YXIgdmFsdWU7XG5cblx0XHRcdGlmIChpc19jaGVja2JveCkge1xuXHRcdFx0XHR2YWx1ZSA9IGdldF9iaW5kaW5nX2dyb3VwX3ZhbHVlKGJpbmRpbmdfZ3JvdXAsIHZhbHVlLCBpbnB1dC5jaGVja2VkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBoeWRyYXRpb25faW5wdXQgPSBiaW5kaW5nX2dyb3VwLmZpbmQoKGlucHV0KSA9PiBpbnB1dC5jaGVja2VkKTtcblx0XHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0XHR2YWx1ZSA9IGh5ZHJhdGlvbl9pbnB1dD8uX192YWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0c2V0KHZhbHVlKTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7SFRNTElucHV0RWxlbWVudH0gaW5wdXRcbiAqIEBwYXJhbSB7KCkgPT4gdW5rbm93bn0gZ2V0XG4gKiBAcGFyYW0geyh2YWx1ZTogdW5rbm93bikgPT4gdm9pZH0gc2V0XG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJpbmRfY2hlY2tlZChpbnB1dCwgZ2V0LCBzZXQgPSBnZXQpIHtcblx0bGlzdGVuX3RvX2V2ZW50X2FuZF9yZXNldF9ldmVudChpbnB1dCwgJ2NoYW5nZScsIChpc19yZXNldCkgPT4ge1xuXHRcdHZhciB2YWx1ZSA9IGlzX3Jlc2V0ID8gaW5wdXQuZGVmYXVsdENoZWNrZWQgOiBpbnB1dC5jaGVja2VkO1xuXHRcdHNldCh2YWx1ZSk7XG5cdH0pO1xuXG5cdGlmIChcblx0XHQvLyBJZiB3ZSBhcmUgaHlkcmF0aW5nIGFuZCB0aGUgdmFsdWUgaGFzIHNpbmNlIGNoYW5nZWQsXG5cdFx0Ly8gdGhlbiB1c2UgdGhlIHVwZGF0ZSB2YWx1ZSBmcm9tIHRoZSBpbnB1dCBpbnN0ZWFkLlxuXHRcdChoeWRyYXRpbmcgJiYgaW5wdXQuZGVmYXVsdENoZWNrZWQgIT09IGlucHV0LmNoZWNrZWQpIHx8XG5cdFx0Ly8gSWYgZGVmYXVsdENoZWNrZWQgaXMgc2V0LCB0aGVuIGNoZWNrZWQgPT0gZGVmYXVsdENoZWNrZWRcblx0XHR1bnRyYWNrKGdldCkgPT0gbnVsbFxuXHQpIHtcblx0XHRzZXQoaW5wdXQuY2hlY2tlZCk7XG5cdH1cblxuXHRyZW5kZXJfZWZmZWN0KCgpID0+IHtcblx0XHR2YXIgdmFsdWUgPSBnZXQoKTtcblx0XHRpbnB1dC5jaGVja2VkID0gQm9vbGVhbih2YWx1ZSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge0FycmF5PEhUTUxJbnB1dEVsZW1lbnQ+fSBncm91cFxuICogQHBhcmFtIHtWfSBfX3ZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNoZWNrZWRcbiAqIEByZXR1cm5zIHtWW119XG4gKi9cbmZ1bmN0aW9uIGdldF9iaW5kaW5nX2dyb3VwX3ZhbHVlKGdyb3VwLCBfX3ZhbHVlLCBjaGVja2VkKSB7XG5cdC8qKiBAdHlwZSB7U2V0PFY+fSAqL1xuXHR2YXIgdmFsdWUgPSBuZXcgU2V0KCk7XG5cblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBncm91cC5sZW5ndGg7IGkgKz0gMSkge1xuXHRcdGlmIChncm91cFtpXS5jaGVja2VkKSB7XG5cdFx0XHQvLyBAdHMtaWdub3JlXG5cdFx0XHR2YWx1ZS5hZGQoZ3JvdXBbaV0uX192YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFjaGVja2VkKSB7XG5cdFx0dmFsdWUuZGVsZXRlKF9fdmFsdWUpO1xuXHR9XG5cblx0cmV0dXJuIEFycmF5LmZyb20odmFsdWUpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7SFRNTElucHV0RWxlbWVudH0gaW5wdXRcbiAqL1xuZnVuY3Rpb24gaXNfbnVtYmVybGlrZV9pbnB1dChpbnB1dCkge1xuXHR2YXIgdHlwZSA9IGlucHV0LnR5cGU7XG5cdHJldHVybiB0eXBlID09PSAnbnVtYmVyJyB8fCB0eXBlID09PSAncmFuZ2UnO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICovXG5mdW5jdGlvbiB0b19udW1iZXIodmFsdWUpIHtcblx0cmV0dXJuIHZhbHVlID09PSAnJyA/IG51bGwgOiArdmFsdWU7XG59XG5cbi8qKlxuICogQHBhcmFtIHtIVE1MSW5wdXRFbGVtZW50fSBpbnB1dFxuICogQHBhcmFtIHsoKSA9PiBGaWxlTGlzdCB8IG51bGx9IGdldFxuICogQHBhcmFtIHsodmFsdWU6IEZpbGVMaXN0IHwgbnVsbCkgPT4gdm9pZH0gc2V0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kX2ZpbGVzKGlucHV0LCBnZXQsIHNldCA9IGdldCkge1xuXHRsaXN0ZW5fdG9fZXZlbnRfYW5kX3Jlc2V0X2V2ZW50KGlucHV0LCAnY2hhbmdlJywgKCkgPT4ge1xuXHRcdHNldChpbnB1dC5maWxlcyk7XG5cdH0pO1xuXG5cdGlmIChcblx0XHQvLyBJZiB3ZSBhcmUgaHlkcmF0aW5nIGFuZCB0aGUgdmFsdWUgaGFzIHNpbmNlIGNoYW5nZWQsXG5cdFx0Ly8gdGhlbiB1c2UgdGhlIHVwZGF0ZWQgdmFsdWUgZnJvbSB0aGUgaW5wdXQgaW5zdGVhZC5cblx0XHRoeWRyYXRpbmcgJiZcblx0XHRpbnB1dC5maWxlc1xuXHQpIHtcblx0XHRzZXQoaW5wdXQuZmlsZXMpO1xuXHR9XG5cblx0cmVuZGVyX2VmZmVjdCgoKSA9PiB7XG5cdFx0aW5wdXQuZmlsZXMgPSBnZXQoKTtcblx0fSk7XG59XG4iLCJpbXBvcnQgeyBub29wIH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkL3V0aWxzLmpzJztcbmltcG9ydCB7IHVzZXJfcHJlX2VmZmVjdCB9IGZyb20gJy4uLy4uL3JlYWN0aXZpdHkvZWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBvbiB9IGZyb20gJy4uL2VsZW1lbnRzL2V2ZW50cy5qcyc7XG5cbi8qKlxuICogU3Vic3RpdHV0ZSBmb3IgdGhlIGB0cnVzdGVkYCBldmVudCBtb2RpZmllclxuICogQGRlcHJlY2F0ZWRcbiAqIEBwYXJhbSB7KGV2ZW50OiBFdmVudCwgLi4uYXJnczogQXJyYXk8dW5rbm93bj4pID0+IHZvaWR9IGZuXG4gKiBAcmV0dXJucyB7KGV2ZW50OiBFdmVudCwgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJ1c3RlZChmbikge1xuXHRyZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcblx0XHR2YXIgZXZlbnQgPSAvKiogQHR5cGUge0V2ZW50fSAqLyAoYXJnc1swXSk7XG5cdFx0aWYgKGV2ZW50LmlzVHJ1c3RlZCkge1xuXHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0Zm4/LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBTdWJzdGl0dXRlIGZvciB0aGUgYHNlbGZgIGV2ZW50IG1vZGlmaWVyXG4gKiBAZGVwcmVjYXRlZFxuICogQHBhcmFtIHsoZXZlbnQ6IEV2ZW50LCAuLi5hcmdzOiBBcnJheTx1bmtub3duPikgPT4gdm9pZH0gZm5cbiAqIEByZXR1cm5zIHsoZXZlbnQ6IEV2ZW50LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWxmKGZuKSB7XG5cdHJldHVybiBmdW5jdGlvbiAoLi4uYXJncykge1xuXHRcdHZhciBldmVudCA9IC8qKiBAdHlwZSB7RXZlbnR9ICovIChhcmdzWzBdKTtcblx0XHQvLyBAdHMtaWdub3JlXG5cdFx0aWYgKGV2ZW50LnRhcmdldCA9PT0gdGhpcykge1xuXHRcdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdFx0Zm4/LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBTdWJzdGl0dXRlIGZvciB0aGUgYHN0b3BQcm9wYWdhdGlvbmAgZXZlbnQgbW9kaWZpZXJcbiAqIEBkZXByZWNhdGVkXG4gKiBAcGFyYW0geyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IEFycmF5PHVua25vd24+KSA9PiB2b2lkfSBmblxuICogQHJldHVybnMgeyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbihmbikge1xuXHRyZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcblx0XHR2YXIgZXZlbnQgPSAvKiogQHR5cGUge0V2ZW50fSAqLyAoYXJnc1swXSk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdHJldHVybiBmbj8uYXBwbHkodGhpcywgYXJncyk7XG5cdH07XG59XG5cbi8qKlxuICogU3Vic3RpdHV0ZSBmb3IgdGhlIGBvbmNlYCBldmVudCBtb2RpZmllclxuICogQGRlcHJlY2F0ZWRcbiAqIEBwYXJhbSB7KGV2ZW50OiBFdmVudCwgLi4uYXJnczogQXJyYXk8dW5rbm93bj4pID0+IHZvaWR9IGZuXG4gKiBAcmV0dXJucyB7KGV2ZW50OiBFdmVudCwgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkfVxuICovXG5leHBvcnQgZnVuY3Rpb24gb25jZShmbikge1xuXHR2YXIgcmFuID0gZmFsc2U7XG5cblx0cmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG5cdFx0aWYgKHJhbikgcmV0dXJuO1xuXHRcdHJhbiA9IHRydWU7XG5cblx0XHQvLyBAdHMtaWdub3JlXG5cdFx0cmV0dXJuIGZuPy5hcHBseSh0aGlzLCBhcmdzKTtcblx0fTtcbn1cblxuLyoqXG4gKiBTdWJzdGl0dXRlIGZvciB0aGUgYHN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbmAgZXZlbnQgbW9kaWZpZXJcbiAqIEBkZXByZWNhdGVkXG4gKiBAcGFyYW0geyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IEFycmF5PHVua25vd24+KSA9PiB2b2lkfSBmblxuICogQHJldHVybnMgeyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbihmbikge1xuXHRyZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcblx0XHR2YXIgZXZlbnQgPSAvKiogQHR5cGUge0V2ZW50fSAqLyAoYXJnc1swXSk7XG5cdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdHJldHVybiBmbj8uYXBwbHkodGhpcywgYXJncyk7XG5cdH07XG59XG5cbi8qKlxuICogU3Vic3RpdHV0ZSBmb3IgdGhlIGBwcmV2ZW50RGVmYXVsdGAgZXZlbnQgbW9kaWZpZXJcbiAqIEBkZXByZWNhdGVkXG4gKiBAcGFyYW0geyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IEFycmF5PHVua25vd24+KSA9PiB2b2lkfSBmblxuICogQHJldHVybnMgeyhldmVudDogRXZlbnQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0KGZuKSB7XG5cdHJldHVybiBmdW5jdGlvbiAoLi4uYXJncykge1xuXHRcdHZhciBldmVudCA9IC8qKiBAdHlwZSB7RXZlbnR9ICovIChhcmdzWzBdKTtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdC8vIEB0cy1pZ25vcmVcblx0XHRyZXR1cm4gZm4/LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9O1xufVxuXG4vKipcbiAqIFN1YnN0aXR1dGUgZm9yIHRoZSBgcGFzc2l2ZWAgZXZlbnQgbW9kaWZpZXIsIGltcGxlbWVudGVkIGFzIGFuIGFjdGlvblxuICogQGRlcHJlY2F0ZWRcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IG5vZGVcbiAqIEBwYXJhbSB7W2V2ZW50OiBzdHJpbmcsIGhhbmRsZXI6ICgpID0+IEV2ZW50TGlzdGVuZXJdfSBvcHRpb25zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXNzaXZlKG5vZGUsIFtldmVudCwgaGFuZGxlcl0pIHtcblx0dXNlcl9wcmVfZWZmZWN0KCgpID0+IHtcblx0XHRyZXR1cm4gb24obm9kZSwgZXZlbnQsIGhhbmRsZXIoKSA/PyBub29wLCB7XG5cdFx0XHRwYXNzaXZlOiB0cnVlXG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIFN1YnN0aXR1dGUgZm9yIHRoZSBgbm9ucGFzc2l2ZWAgZXZlbnQgbW9kaWZpZXIsIGltcGxlbWVudGVkIGFzIGFuIGFjdGlvblxuICogQGRlcHJlY2F0ZWRcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IG5vZGVcbiAqIEBwYXJhbSB7W2V2ZW50OiBzdHJpbmcsIGhhbmRsZXI6ICgpID0+IEV2ZW50TGlzdGVuZXJdfSBvcHRpb25zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub25wYXNzaXZlKG5vZGUsIFtldmVudCwgaGFuZGxlcl0pIHtcblx0dXNlcl9wcmVfZWZmZWN0KCgpID0+IHtcblx0XHRyZXR1cm4gb24obm9kZSwgZXZlbnQsIGhhbmRsZXIoKSA/PyBub29wLCB7XG5cdFx0XHRwYXNzaXZlOiBmYWxzZVxuXHRcdH0pO1xuXHR9KTtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgQ29tcG9uZW50Q29udGV4dExlZ2FjeSB9IGZyb20gJyNjbGllbnQnICovXG5pbXBvcnQgeyBydW4sIHJ1bl9hbGwgfSBmcm9tICcuLi8uLi8uLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHsgY29tcG9uZW50X2NvbnRleHQgfSBmcm9tICcuLi8uLi9jb250ZXh0LmpzJztcbmltcG9ydCB7IGRlcml2ZWQgfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2Rlcml2ZWRzLmpzJztcbmltcG9ydCB7IHVzZXJfcHJlX2VmZmVjdCwgdXNlcl9lZmZlY3QgfSBmcm9tICcuLi8uLi9yZWFjdGl2aXR5L2VmZmVjdHMuanMnO1xuaW1wb3J0IHsgZGVlcF9yZWFkX3N0YXRlLCBnZXQsIHVudHJhY2sgfSBmcm9tICcuLi8uLi9ydW50aW1lLmpzJztcblxuLyoqXG4gKiBMZWdhY3ktbW9kZSBvbmx5OiBDYWxsIGBvbk1vdW50YCBjYWxsYmFja3MgYW5kIHNldCB1cCBgYmVmb3JlVXBkYXRlYC9gYWZ0ZXJVcGRhdGVgIGVmZmVjdHNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2ltbXV0YWJsZV1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXQoaW1tdXRhYmxlID0gZmFsc2UpIHtcblx0Y29uc3QgY29udGV4dCA9IC8qKiBAdHlwZSB7Q29tcG9uZW50Q29udGV4dExlZ2FjeX0gKi8gKGNvbXBvbmVudF9jb250ZXh0KTtcblxuXHRjb25zdCBjYWxsYmFja3MgPSBjb250ZXh0LmwudTtcblx0aWYgKCFjYWxsYmFja3MpIHJldHVybjtcblxuXHRsZXQgcHJvcHMgPSAoKSA9PiBkZWVwX3JlYWRfc3RhdGUoY29udGV4dC5zKTtcblxuXHRpZiAoaW1tdXRhYmxlKSB7XG5cdFx0bGV0IHZlcnNpb24gPSAwO1xuXHRcdGxldCBwcmV2ID0gLyoqIEB0eXBlIHtSZWNvcmQ8c3RyaW5nLCBhbnk+fSAqLyAoe30pO1xuXG5cdFx0Ly8gSW4gbGVnYWN5IGltbXV0YWJsZSBtb2RlLCBiZWZvcmUvYWZ0ZXJVcGRhdGUgb25seSBmaXJlIGlmIHRoZSBvYmplY3QgaWRlbnRpdHkgb2YgYSBwcm9wIGNoYW5nZXNcblx0XHRjb25zdCBkID0gZGVyaXZlZCgoKSA9PiB7XG5cdFx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSBjb250ZXh0LnM7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wcykge1xuXHRcdFx0XHRpZiAocHJvcHNba2V5XSAhPT0gcHJldltrZXldKSB7XG5cdFx0XHRcdFx0cHJldltrZXldID0gcHJvcHNba2V5XTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYW5nZWQpIHZlcnNpb24rKztcblx0XHRcdHJldHVybiB2ZXJzaW9uO1xuXHRcdH0pO1xuXG5cdFx0cHJvcHMgPSAoKSA9PiBnZXQoZCk7XG5cdH1cblxuXHQvLyBiZWZvcmVVcGRhdGVcblx0aWYgKGNhbGxiYWNrcy5iLmxlbmd0aCkge1xuXHRcdHVzZXJfcHJlX2VmZmVjdCgoKSA9PiB7XG5cdFx0XHRvYnNlcnZlX2FsbChjb250ZXh0LCBwcm9wcyk7XG5cdFx0XHRydW5fYWxsKGNhbGxiYWNrcy5iKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIG9uTW91bnQgKG11c3QgcnVuIGJlZm9yZSBhZnRlclVwZGF0ZSlcblx0dXNlcl9lZmZlY3QoKCkgPT4ge1xuXHRcdGNvbnN0IGZucyA9IHVudHJhY2soKCkgPT4gY2FsbGJhY2tzLm0ubWFwKHJ1bikpO1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGZuIG9mIGZucykge1xuXHRcdFx0XHRpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0Zm4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xuXG5cdC8vIGFmdGVyVXBkYXRlXG5cdGlmIChjYWxsYmFja3MuYS5sZW5ndGgpIHtcblx0XHR1c2VyX2VmZmVjdCgoKSA9PiB7XG5cdFx0XHRvYnNlcnZlX2FsbChjb250ZXh0LCBwcm9wcyk7XG5cdFx0XHRydW5fYWxsKGNhbGxiYWNrcy5hKTtcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIEludm9rZSB0aGUgZ2V0dGVyIG9mIGFsbCBzaWduYWxzIGFzc29jaWF0ZWQgd2l0aCBhIGNvbXBvbmVudFxuICogc28gdGhleSBjYW4gYmUgcmVnaXN0ZXJlZCB0byB0aGUgZWZmZWN0IHRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGluLlxuICogQHBhcmFtIHtDb21wb25lbnRDb250ZXh0TGVnYWN5fSBjb250ZXh0XG4gKiBAcGFyYW0geygoKSA9PiB2b2lkKX0gcHJvcHNcbiAqL1xuZnVuY3Rpb24gb2JzZXJ2ZV9hbGwoY29udGV4dCwgcHJvcHMpIHtcblx0aWYgKGNvbnRleHQubC5zKSB7XG5cdFx0Zm9yIChjb25zdCBzaWduYWwgb2YgY29udGV4dC5sLnMpIGdldChzaWduYWwpO1xuXHR9XG5cblx0cHJvcHMoKTtcbn1cbiIsIi8qKiBAaW1wb3J0IHsgU3RvcmVSZWZlcmVuY2VzQ29udGFpbmVyIH0gZnJvbSAnI2NsaWVudCcgKi9cbi8qKiBAaW1wb3J0IHsgU3RvcmUgfSBmcm9tICcjc2hhcmVkJyAqL1xuaW1wb3J0IHsgc3Vic2NyaWJlX3RvX3N0b3JlIH0gZnJvbSAnLi4vLi4vLi4vc3RvcmUvdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0IGFzIGdldF9zdG9yZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JlL3NoYXJlZC9pbmRleC5qcyc7XG5pbXBvcnQgeyBkZWZpbmVfcHJvcGVydHksIG5vb3AgfSBmcm9tICcuLi8uLi9zaGFyZWQvdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0IH0gZnJvbSAnLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgeyB0ZWFyZG93biB9IGZyb20gJy4vZWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBtdXRhYmxlX3NvdXJjZSwgc2V0IH0gZnJvbSAnLi9zb3VyY2VzLmpzJztcbmltcG9ydCB7IERFViB9IGZyb20gJ2VzbS1lbnYnO1xuXG4vKipcbiAqIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9wIGN1cnJlbnRseSBiZWluZyByZWFkIGlzIGEgc3RvcmUgYmluZGluZywgYXMgaW5cbiAqIGA8Q2hpbGQgYmluZDp4PXskeX0gLz5gLiBJZiBpdCBpcywgd2UgdHJlYXQgdGhlIHByb3AgYXMgbXV0YWJsZSBldmVuIGluXG4gKiBydW5lcyBtb2RlLCBhbmQgc2tpcCBgYmluZGluZ19wcm9wZXJ0eV9ub25fcmVhY3RpdmVgIHZhbGlkYXRpb25cbiAqL1xubGV0IGlzX3N0b3JlX2JpbmRpbmcgPSBmYWxzZTtcblxubGV0IElTX1VOTU9VTlRFRCA9IFN5bWJvbCgpO1xuXG4vKipcbiAqIEdldHMgdGhlIGN1cnJlbnQgdmFsdWUgb2YgYSBzdG9yZS4gSWYgdGhlIHN0b3JlIGlzbid0IHN1YnNjcmliZWQgdG8geWV0LCBpdCB3aWxsIGNyZWF0ZSBhIHByb3h5XG4gKiBzaWduYWwgdGhhdCB3aWxsIGJlIHVwZGF0ZWQgd2hlbiB0aGUgc3RvcmUgaXMuIFRoZSBzdG9yZSByZWZlcmVuY2VzIGNvbnRhaW5lciBpcyBuZWVkZWQgdG9cbiAqIHRyYWNrIHJlYXNzaWdubWVudHMgdG8gc3RvcmVzIGFuZCB0byB0cmFjayB0aGUgY29ycmVjdCBjb21wb25lbnQgY29udGV4dC5cbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge1N0b3JlPFY+IHwgbnVsbCB8IHVuZGVmaW5lZH0gc3RvcmVcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdG9yZV9uYW1lXG4gKiBAcGFyYW0ge1N0b3JlUmVmZXJlbmNlc0NvbnRhaW5lcn0gc3RvcmVzXG4gKiBAcmV0dXJucyB7Vn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlX2dldChzdG9yZSwgc3RvcmVfbmFtZSwgc3RvcmVzKSB7XG5cdGNvbnN0IGVudHJ5ID0gKHN0b3Jlc1tzdG9yZV9uYW1lXSA/Pz0ge1xuXHRcdHN0b3JlOiBudWxsLFxuXHRcdHNvdXJjZTogbXV0YWJsZV9zb3VyY2UodW5kZWZpbmVkKSxcblx0XHR1bnN1YnNjcmliZTogbm9vcFxuXHR9KTtcblxuXHRpZiAoREVWKSB7XG5cdFx0ZW50cnkuc291cmNlLmxhYmVsID0gc3RvcmVfbmFtZTtcblx0fVxuXG5cdC8vIGlmIHRoZSBjb21wb25lbnQgdGhhdCBzZXR1cCB0aGlzIGlzIGFscmVhZHkgdW5tb3VudGVkIHdlIGRvbid0IHdhbnQgdG8gcmVnaXN0ZXIgYSBzdWJzY3JpcHRpb25cblx0aWYgKGVudHJ5LnN0b3JlICE9PSBzdG9yZSAmJiAhKElTX1VOTU9VTlRFRCBpbiBzdG9yZXMpKSB7XG5cdFx0ZW50cnkudW5zdWJzY3JpYmUoKTtcblx0XHRlbnRyeS5zdG9yZSA9IHN0b3JlID8/IG51bGw7XG5cblx0XHRpZiAoc3RvcmUgPT0gbnVsbCkge1xuXHRcdFx0ZW50cnkuc291cmNlLnYgPSB1bmRlZmluZWQ7IC8vIHNlZSBzeW5jaHJvbm91cyBjYWxsYmFjayBjb21tZW50IGJlbG93XG5cdFx0XHRlbnRyeS51bnN1YnNjcmliZSA9IG5vb3A7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBpc19zeW5jaHJvbm91c19jYWxsYmFjayA9IHRydWU7XG5cblx0XHRcdGVudHJ5LnVuc3Vic2NyaWJlID0gc3Vic2NyaWJlX3RvX3N0b3JlKHN0b3JlLCAodikgPT4ge1xuXHRcdFx0XHRpZiAoaXNfc3luY2hyb25vdXNfY2FsbGJhY2spIHtcblx0XHRcdFx0XHQvLyBJZiB0aGUgZmlyc3QgdXBkYXRlcyB0byB0aGUgc3RvcmUgdmFsdWUgKHBvc3NpYmx5IG11bHRpcGxlIG9mIHRoZW0pIGFyZSBzeW5jaHJvbm91c2x5XG5cdFx0XHRcdFx0Ly8gaW5zaWRlIGEgZGVyaXZlZCwgd2Ugd2lsbCBoaXQgdGhlIGBzdGF0ZV91bnNhZmVfbXV0YXRpb25gIGVycm9yIGlmIHdlIGBzZXRgIHRoZSB2YWx1ZVxuXHRcdFx0XHRcdGVudHJ5LnNvdXJjZS52ID0gdjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXQoZW50cnkuc291cmNlLCB2KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlzX3N5bmNocm9ub3VzX2NhbGxiYWNrID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0Ly8gaWYgdGhlIGNvbXBvbmVudCB0aGF0IHNldHVwIHRoaXMgc3RvcmVzIGlzIGFscmVhZHkgdW5tb3VudGVkIHRoZSBzb3VyY2Ugd2lsbCBiZSBvdXQgb2Ygc3luY1xuXHQvLyBzbyB3ZSBqdXN0IHVzZSB0aGUgYGdldGAgZm9yIHRoZSBzdG9yZXMsIGxlc3MgcGVyZm9ybWFudCBidXQgaXQgYXZvaWRzIHRvIGNyZWF0ZSBhIG1lbW9yeSBsZWFrXG5cdC8vIGFuZCBpdCB3aWxsIGtlZXAgdGhlIHZhbHVlIGNvbnNpc3RlbnRcblx0aWYgKHN0b3JlICYmIElTX1VOTU9VTlRFRCBpbiBzdG9yZXMpIHtcblx0XHRyZXR1cm4gZ2V0X3N0b3JlKHN0b3JlKTtcblx0fVxuXG5cdHJldHVybiBnZXQoZW50cnkuc291cmNlKTtcbn1cblxuLyoqXG4gKiBVbnN1YnNjcmliZSBmcm9tIGEgc3RvcmUgaWYgaXQncyBub3QgdGhlIHNhbWUgYXMgdGhlIG9uZSBpbiB0aGUgc3RvcmUgcmVmZXJlbmNlcyBjb250YWluZXIuXG4gKiBXZSBuZWVkIHRoaXMgaW4gYWRkaXRpb24gdG8gYHN0b3JlX2dldGAgYmVjYXVzZSBzb21lb25lIGNvdWxkIHVuc3Vic2NyaWJlIGZyb20gYSBzdG9yZSBidXRcbiAqIHRoZW4gbmV2ZXIgc3Vic2NyaWJlIHRvIHRoZSBuZXcgb25lIChpZiBhbnkpLCBjYXVzaW5nIHRoZSBzdWJzY3JpcHRpb24gdG8gc3RheSBvcGVuIHdyb25nZnVsbHkuXG4gKiBAcGFyYW0ge1N0b3JlPGFueT4gfCBudWxsIHwgdW5kZWZpbmVkfSBzdG9yZVxuICogQHBhcmFtIHtzdHJpbmd9IHN0b3JlX25hbWVcbiAqIEBwYXJhbSB7U3RvcmVSZWZlcmVuY2VzQ29udGFpbmVyfSBzdG9yZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlX3Vuc3ViKHN0b3JlLCBzdG9yZV9uYW1lLCBzdG9yZXMpIHtcblx0LyoqIEB0eXBlIHtTdG9yZVJlZmVyZW5jZXNDb250YWluZXJbJyddIHwgdW5kZWZpbmVkfSAqL1xuXHRsZXQgZW50cnkgPSBzdG9yZXNbc3RvcmVfbmFtZV07XG5cblx0aWYgKGVudHJ5ICYmIGVudHJ5LnN0b3JlICE9PSBzdG9yZSkge1xuXHRcdC8vIERvbid0IHJlc2V0IHN0b3JlIHlldCwgc28gdGhhdCBzdG9yZV9nZXQgYWJvdmUgY2FuIHJlc3Vic2NyaWJlIHRvIG5ldyBzdG9yZSBpZiBuZWNlc3Nhcnlcblx0XHRlbnRyeS51bnN1YnNjcmliZSgpO1xuXHRcdGVudHJ5LnVuc3Vic2NyaWJlID0gbm9vcDtcblx0fVxuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuLyoqXG4gKiBTZXRzIHRoZSBuZXcgdmFsdWUgb2YgYSBzdG9yZSBhbmQgcmV0dXJucyB0aGF0IHZhbHVlLlxuICogQHRlbXBsYXRlIFZcbiAqIEBwYXJhbSB7U3RvcmU8Vj59IHN0b3JlXG4gKiBAcGFyYW0ge1Z9IHZhbHVlXG4gKiBAcmV0dXJucyB7Vn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlX3NldChzdG9yZSwgdmFsdWUpIHtcblx0c3RvcmUuc2V0KHZhbHVlKTtcblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7U3RvcmVSZWZlcmVuY2VzQ29udGFpbmVyfSBzdG9yZXNcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdG9yZV9uYW1lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnZhbGlkYXRlX3N0b3JlKHN0b3Jlcywgc3RvcmVfbmFtZSkge1xuXHR2YXIgZW50cnkgPSBzdG9yZXNbc3RvcmVfbmFtZV07XG5cdGlmIChlbnRyeS5zdG9yZSAhPT0gbnVsbCkge1xuXHRcdHN0b3JlX3NldChlbnRyeS5zdG9yZSwgZW50cnkuc291cmNlLnYpO1xuXHR9XG59XG5cbi8qKlxuICogVW5zdWJzY3JpYmVzIGZyb20gYWxsIGF1dG8tc3Vic2NyaWJlZCBzdG9yZXMgb24gZGVzdHJveVxuICogQHJldHVybnMge1tTdG9yZVJlZmVyZW5jZXNDb250YWluZXIsICgpPT52b2lkXX1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldHVwX3N0b3JlcygpIHtcblx0LyoqIEB0eXBlIHtTdG9yZVJlZmVyZW5jZXNDb250YWluZXJ9ICovXG5cdGNvbnN0IHN0b3JlcyA9IHt9O1xuXG5cdGZ1bmN0aW9uIGNsZWFudXAoKSB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0Zm9yICh2YXIgc3RvcmVfbmFtZSBpbiBzdG9yZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVmID0gc3RvcmVzW3N0b3JlX25hbWVdO1xuXHRcdFx0XHRyZWYudW5zdWJzY3JpYmUoKTtcblx0XHRcdH1cblx0XHRcdGRlZmluZV9wcm9wZXJ0eShzdG9yZXMsIElTX1VOTU9VTlRFRCwge1xuXHRcdFx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRcdFx0dmFsdWU6IHRydWVcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIFtzdG9yZXMsIGNsZWFudXBdO1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgYSBzdG9yZSB3aXRoIGEgbmV3IHZhbHVlLlxuICogQHBhcmFtIHtTdG9yZTxWPn0gc3RvcmUgIHRoZSBzdG9yZSB0byB1cGRhdGVcbiAqIEBwYXJhbSB7YW55fSBleHByZXNzaW9uICB0aGUgZXhwcmVzc2lvbiB0aGF0IG11dGF0ZXMgdGhlIHN0b3JlXG4gKiBAcGFyYW0ge1Z9IG5ld192YWx1ZSAgdGhlIG5ldyBzdG9yZSB2YWx1ZVxuICogQHRlbXBsYXRlIFZcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlX211dGF0ZShzdG9yZSwgZXhwcmVzc2lvbiwgbmV3X3ZhbHVlKSB7XG5cdHN0b3JlLnNldChuZXdfdmFsdWUpO1xuXHRyZXR1cm4gZXhwcmVzc2lvbjtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge1N0b3JlPG51bWJlcj59IHN0b3JlXG4gKiBAcGFyYW0ge251bWJlcn0gc3RvcmVfdmFsdWVcbiAqIEBwYXJhbSB7MSB8IC0xfSBbZF1cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVfc3RvcmUoc3RvcmUsIHN0b3JlX3ZhbHVlLCBkID0gMSkge1xuXHRzdG9yZS5zZXQoc3RvcmVfdmFsdWUgKyBkKTtcblx0cmV0dXJuIHN0b3JlX3ZhbHVlO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7U3RvcmU8bnVtYmVyPn0gc3RvcmVcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdG9yZV92YWx1ZVxuICogQHBhcmFtIHsxIHwgLTF9IFtkXVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZV9wcmVfc3RvcmUoc3RvcmUsIHN0b3JlX3ZhbHVlLCBkID0gMSkge1xuXHRjb25zdCB2YWx1ZSA9IHN0b3JlX3ZhbHVlICsgZDtcblx0c3RvcmUuc2V0KHZhbHVlKTtcblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIENhbGxlZCBpbnNpZGUgcHJvcCBnZXR0ZXJzIHRvIGNvbW11bmljYXRlIHRoYXQgdGhlIHByb3AgaXMgYSBzdG9yZSBiaW5kaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrX3N0b3JlX2JpbmRpbmcoKSB7XG5cdGlzX3N0b3JlX2JpbmRpbmcgPSB0cnVlO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSB0dXBsZSB0aGF0IGluZGljYXRlcyB3aGV0aGVyIGBmbigpYCByZWFkcyBhIHByb3AgdGhhdCBpcyBhIHN0b3JlIGJpbmRpbmcuXG4gKiBVc2VkIHRvIHByZXZlbnQgYGJpbmRpbmdfcHJvcGVydHlfbm9uX3JlYWN0aXZlYCB2YWxpZGF0aW9uIGZhbHNlIHBvc2l0aXZlcyBhbmRcbiAqIGVuc3VyZSB0aGF0IHRoZXNlIHByb3BzIGFyZSB0cmVhdGVkIGFzIG11dGFibGUgZXZlbiBpbiBydW5lcyBtb2RlXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHsoKSA9PiBUfSBmblxuICogQHJldHVybnMge1tULCBib29sZWFuXX1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhcHR1cmVfc3RvcmVfYmluZGluZyhmbikge1xuXHR2YXIgcHJldmlvdXNfaXNfc3RvcmVfYmluZGluZyA9IGlzX3N0b3JlX2JpbmRpbmc7XG5cblx0dHJ5IHtcblx0XHRpc19zdG9yZV9iaW5kaW5nID0gZmFsc2U7XG5cdFx0cmV0dXJuIFtmbigpLCBpc19zdG9yZV9iaW5kaW5nXTtcblx0fSBmaW5hbGx5IHtcblx0XHRpc19zdG9yZV9iaW5kaW5nID0gcHJldmlvdXNfaXNfc3RvcmVfYmluZGluZztcblx0fVxufVxuIiwiLyoqIEBpbXBvcnQgeyBFZmZlY3QsIFNvdXJjZSB9IGZyb20gJy4vdHlwZXMuanMnICovXG5pbXBvcnQgeyBERVYgfSBmcm9tICdlc20tZW52JztcbmltcG9ydCB7XG5cdFBST1BTX0lTX0JJTkRBQkxFLFxuXHRQUk9QU19JU19JTU1VVEFCTEUsXG5cdFBST1BTX0lTX0xBWllfSU5JVElBTCxcblx0UFJPUFNfSVNfUlVORVMsXG5cdFBST1BTX0lTX1VQREFURURcbn0gZnJvbSAnLi4vLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldF9kZXNjcmlwdG9yLCBpc19mdW5jdGlvbiB9IGZyb20gJy4uLy4uL3NoYXJlZC91dGlscy5qcyc7XG5pbXBvcnQgeyBzZXQsIHNvdXJjZSwgdXBkYXRlIH0gZnJvbSAnLi9zb3VyY2VzLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIGRlcml2ZWRfc2FmZV9lcXVhbCB9IGZyb20gJy4vZGVyaXZlZHMuanMnO1xuaW1wb3J0IHtcblx0YWN0aXZlX2VmZmVjdCxcblx0Z2V0LFxuXHRpc19kZXN0cm95aW5nX2VmZmVjdCxcblx0c2V0X2FjdGl2ZV9lZmZlY3QsXG5cdHVudHJhY2tcbn0gZnJvbSAnLi4vcnVudGltZS5qcyc7XG5pbXBvcnQgKiBhcyBlIGZyb20gJy4uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBERVNUUk9ZRUQsIExFR0FDWV9QUk9QUywgU1RBVEVfU1lNQk9MIH0gZnJvbSAnI2NsaWVudC9jb25zdGFudHMnO1xuaW1wb3J0IHsgcHJveHkgfSBmcm9tICcuLi9wcm94eS5qcyc7XG5pbXBvcnQgeyBjYXB0dXJlX3N0b3JlX2JpbmRpbmcgfSBmcm9tICcuL3N0b3JlLmpzJztcbmltcG9ydCB7IGxlZ2FjeV9tb2RlX2ZsYWcgfSBmcm9tICcuLi8uLi9mbGFncy9pbmRleC5qcyc7XG5cbi8qKlxuICogQHBhcmFtIHsoKHZhbHVlPzogbnVtYmVyKSA9PiBudW1iZXIpfSBmblxuICogQHBhcmFtIHsxIHwgLTF9IFtkXVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZV9wcm9wKGZuLCBkID0gMSkge1xuXHRjb25zdCB2YWx1ZSA9IGZuKCk7XG5cdGZuKHZhbHVlICsgZCk7XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geygodmFsdWU/OiBudW1iZXIpID0+IG51bWJlcil9IGZuXG4gKiBAcGFyYW0gezEgfCAtMX0gW2RdXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlX3ByZV9wcm9wKGZuLCBkID0gMSkge1xuXHRjb25zdCB2YWx1ZSA9IGZuKCkgKyBkO1xuXHRmbih2YWx1ZSk7XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuLyoqXG4gKiBUaGUgcHJveHkgaGFuZGxlciBmb3IgcmVzdCBwcm9wcyAoaS5lLiBgY29uc3QgeyB4LCAuLi5yZXN0IH0gPSAkcHJvcHMoKWApLlxuICogSXMgcGFzc2VkIHRoZSBmdWxsIGAkJHByb3BzYCBvYmplY3QgYW5kIGV4Y2x1ZGVzIHRoZSBuYW1lZCBwcm9wcy5cbiAqIEB0eXBlIHtQcm94eUhhbmRsZXI8eyBwcm9wczogUmVjb3JkPHN0cmluZyB8IHN5bWJvbCwgdW5rbm93bj4sIGV4Y2x1ZGU6IEFycmF5PHN0cmluZyB8IHN5bWJvbD4sIG5hbWU/OiBzdHJpbmcgfT59fVxuICovXG5jb25zdCByZXN0X3Byb3BzX2hhbmRsZXIgPSB7XG5cdGdldCh0YXJnZXQsIGtleSkge1xuXHRcdGlmICh0YXJnZXQuZXhjbHVkZS5pbmNsdWRlcyhrZXkpKSByZXR1cm47XG5cdFx0cmV0dXJuIHRhcmdldC5wcm9wc1trZXldO1xuXHR9LFxuXHRzZXQodGFyZ2V0LCBrZXkpIHtcblx0XHRpZiAoREVWKSB7XG5cdFx0XHQvLyBUT0RPIHNob3VsZCB0aGlzIGhhcHBlbiBpbiBwcm9kIHRvbz9cblx0XHRcdGUucHJvcHNfcmVzdF9yZWFkb25seShgJHt0YXJnZXQubmFtZX0uJHtTdHJpbmcoa2V5KX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdGdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGtleSkge1xuXHRcdGlmICh0YXJnZXQuZXhjbHVkZS5pbmNsdWRlcyhrZXkpKSByZXR1cm47XG5cdFx0aWYgKGtleSBpbiB0YXJnZXQucHJvcHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdFx0dmFsdWU6IHRhcmdldC5wcm9wc1trZXldXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblx0aGFzKHRhcmdldCwga2V5KSB7XG5cdFx0aWYgKHRhcmdldC5leGNsdWRlLmluY2x1ZGVzKGtleSkpIHJldHVybiBmYWxzZTtcblx0XHRyZXR1cm4ga2V5IGluIHRhcmdldC5wcm9wcztcblx0fSxcblx0b3duS2V5cyh0YXJnZXQpIHtcblx0XHRyZXR1cm4gUmVmbGVjdC5vd25LZXlzKHRhcmdldC5wcm9wcykuZmlsdGVyKChrZXkpID0+ICF0YXJnZXQuZXhjbHVkZS5pbmNsdWRlcyhrZXkpKTtcblx0fVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIHVua25vd24+fSBwcm9wc1xuICogQHBhcmFtIHtzdHJpbmdbXX0gZXhjbHVkZVxuICogQHBhcmFtIHtzdHJpbmd9IFtuYW1lXVxuICogQHJldHVybnMge1JlY29yZDxzdHJpbmcsIHVua25vd24+fVxuICovXG4vKiNfX05PX1NJREVfRUZGRUNUU19fKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0X3Byb3BzKHByb3BzLCBleGNsdWRlLCBuYW1lKSB7XG5cdHJldHVybiBuZXcgUHJveHkoXG5cdFx0REVWID8geyBwcm9wcywgZXhjbHVkZSwgbmFtZSwgb3RoZXI6IHt9LCB0b19wcm94eTogW10gfSA6IHsgcHJvcHMsIGV4Y2x1ZGUgfSxcblx0XHRyZXN0X3Byb3BzX2hhbmRsZXJcblx0KTtcbn1cblxuLyoqXG4gKiBUaGUgcHJveHkgaGFuZGxlciBmb3IgbGVnYWN5ICQkcmVzdFByb3BzIGFuZCAkJHByb3BzXG4gKiBAdHlwZSB7UHJveHlIYW5kbGVyPHsgcHJvcHM6IFJlY29yZDxzdHJpbmcgfCBzeW1ib2wsIHVua25vd24+LCBleGNsdWRlOiBBcnJheTxzdHJpbmcgfCBzeW1ib2w+LCBzcGVjaWFsOiBSZWNvcmQ8c3RyaW5nIHwgc3ltYm9sLCAodj86IHVua25vd24pID0+IHVua25vd24+LCB2ZXJzaW9uOiBTb3VyY2U8bnVtYmVyPiwgcGFyZW50X2VmZmVjdDogRWZmZWN0IH0+fX1cbiAqL1xuY29uc3QgbGVnYWN5X3Jlc3RfcHJvcHNfaGFuZGxlciA9IHtcblx0Z2V0KHRhcmdldCwga2V5KSB7XG5cdFx0aWYgKHRhcmdldC5leGNsdWRlLmluY2x1ZGVzKGtleSkpIHJldHVybjtcblx0XHRnZXQodGFyZ2V0LnZlcnNpb24pO1xuXHRcdHJldHVybiBrZXkgaW4gdGFyZ2V0LnNwZWNpYWwgPyB0YXJnZXQuc3BlY2lhbFtrZXldKCkgOiB0YXJnZXQucHJvcHNba2V5XTtcblx0fSxcblx0c2V0KHRhcmdldCwga2V5LCB2YWx1ZSkge1xuXHRcdGlmICghKGtleSBpbiB0YXJnZXQuc3BlY2lhbCkpIHtcblx0XHRcdHZhciBwcmV2aW91c19lZmZlY3QgPSBhY3RpdmVfZWZmZWN0O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZXRfYWN0aXZlX2VmZmVjdCh0YXJnZXQucGFyZW50X2VmZmVjdCk7XG5cblx0XHRcdFx0Ly8gSGFuZGxlIHByb3BzIHRoYXQgY2FuIHRlbXBvcmFyaWx5IGdldCBvdXQgb2Ygc3luYyB3aXRoIHRoZSBwYXJlbnRcblx0XHRcdFx0LyoqIEB0eXBlIHtSZWNvcmQ8c3RyaW5nLCAodj86IHVua25vd24pID0+IHVua25vd24+fSAqL1xuXHRcdFx0XHR0YXJnZXQuc3BlY2lhbFtrZXldID0gcHJvcChcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRnZXQgW2tleV0oKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXQucHJvcHNba2V5XTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC8qKiBAdHlwZSB7c3RyaW5nfSAqLyAoa2V5KSxcblx0XHRcdFx0XHRQUk9QU19JU19VUERBVEVEXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzZXRfYWN0aXZlX2VmZmVjdChwcmV2aW91c19lZmZlY3QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRhcmdldC5zcGVjaWFsW2tleV0odmFsdWUpO1xuXHRcdHVwZGF0ZSh0YXJnZXQudmVyc2lvbik7IC8vICQkcHJvcHMgaXMgY29hcnNlLWdyYWluZWQ6IHdoZW4gJCRwcm9wcy54IGlzIHVwZGF0ZWQsIHVzYWdlcyBvZiAkJHByb3BzLnkgZXRjIGFyZSBhbHNvIHJlcnVuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH0sXG5cdGdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGtleSkge1xuXHRcdGlmICh0YXJnZXQuZXhjbHVkZS5pbmNsdWRlcyhrZXkpKSByZXR1cm47XG5cdFx0aWYgKGtleSBpbiB0YXJnZXQucHJvcHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdFx0dmFsdWU6IHRhcmdldC5wcm9wc1trZXldXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblx0ZGVsZXRlUHJvcGVydHkodGFyZ2V0LCBrZXkpIHtcblx0XHQvLyBTdmVsdGUgNCBhbGxvd2VkIGZvciBkZWxldGlvbnMgb24gJCRyZXN0UHJvcHNcblx0XHRpZiAodGFyZ2V0LmV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSkgcmV0dXJuIHRydWU7XG5cdFx0dGFyZ2V0LmV4Y2x1ZGUucHVzaChrZXkpO1xuXHRcdHVwZGF0ZSh0YXJnZXQudmVyc2lvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0sXG5cdGhhcyh0YXJnZXQsIGtleSkge1xuXHRcdGlmICh0YXJnZXQuZXhjbHVkZS5pbmNsdWRlcyhrZXkpKSByZXR1cm4gZmFsc2U7XG5cdFx0cmV0dXJuIGtleSBpbiB0YXJnZXQucHJvcHM7XG5cdH0sXG5cdG93bktleXModGFyZ2V0KSB7XG5cdFx0cmV0dXJuIFJlZmxlY3Qub3duS2V5cyh0YXJnZXQucHJvcHMpLmZpbHRlcigoa2V5KSA9PiAhdGFyZ2V0LmV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSk7XG5cdH1cbn07XG5cbi8qKlxuICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLCB1bmtub3duPn0gcHJvcHNcbiAqIEBwYXJhbSB7c3RyaW5nW119IGV4Y2x1ZGVcbiAqIEByZXR1cm5zIHtSZWNvcmQ8c3RyaW5nLCB1bmtub3duPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeV9yZXN0X3Byb3BzKHByb3BzLCBleGNsdWRlKSB7XG5cdHJldHVybiBuZXcgUHJveHkoXG5cdFx0e1xuXHRcdFx0cHJvcHMsXG5cdFx0XHRleGNsdWRlLFxuXHRcdFx0c3BlY2lhbDoge30sXG5cdFx0XHR2ZXJzaW9uOiBzb3VyY2UoMCksXG5cdFx0XHQvLyBUT0RPIHRoaXMgaXMgb25seSBuZWNlc3NhcnkgYmVjYXVzZSB3ZSBuZWVkIHRvIHRyYWNrIGNvbXBvbmVudFxuXHRcdFx0Ly8gZGVzdHJ1Y3Rpb24gaW5zaWRlIGBwcm9wYCwgYmVjYXVzZSBvZiBgYmluZDp0aGlzYCwgYnV0IGl0XG5cdFx0XHQvLyBzZWVtcyBsaWtlbHkgdGhhdCB3ZSBjYW4gc2ltcGxpZnkgYGJpbmQ6dGhpc2AgaW5zdGVhZFxuXHRcdFx0cGFyZW50X2VmZmVjdDogLyoqIEB0eXBlIHtFZmZlY3R9ICovIChhY3RpdmVfZWZmZWN0KVxuXHRcdH0sXG5cdFx0bGVnYWN5X3Jlc3RfcHJvcHNfaGFuZGxlclxuXHQpO1xufVxuXG4vKipcbiAqIFRoZSBwcm94eSBoYW5kbGVyIGZvciBzcHJlYWQgcHJvcHMuIEhhbmRsZXMgdGhlIGluY29taW5nIGFycmF5IG9mIHByb3BzXG4gKiB0aGF0IGxvb2tzIGxpa2UgYCgpID0+IHsgZHluYW1pYzogcHJvcHMgfSwgeyBzdGF0aWM6IHByb3AgfSwgLi5gIGFuZCB3cmFwc1xuICogdGhlbSBzbyB0aGF0IHRoZSB3aG9sZSB0aGluZyBpcyBwYXNzZWQgdG8gdGhlIGNvbXBvbmVudCBhcyB0aGUgYCQkcHJvcHNgIGFyZ3VtZW50LlxuICogQHR5cGUge1Byb3h5SGFuZGxlcjx7IHByb3BzOiBBcnJheTxSZWNvcmQ8c3RyaW5nIHwgc3ltYm9sLCB1bmtub3duPiB8ICgoKSA9PiBSZWNvcmQ8c3RyaW5nIHwgc3ltYm9sLCB1bmtub3duPik+IH0+fX1cbiAqL1xuY29uc3Qgc3ByZWFkX3Byb3BzX2hhbmRsZXIgPSB7XG5cdGdldCh0YXJnZXQsIGtleSkge1xuXHRcdGxldCBpID0gdGFyZ2V0LnByb3BzLmxlbmd0aDtcblx0XHR3aGlsZSAoaS0tKSB7XG5cdFx0XHRsZXQgcCA9IHRhcmdldC5wcm9wc1tpXTtcblx0XHRcdGlmIChpc19mdW5jdGlvbihwKSkgcCA9IHAoKTtcblx0XHRcdGlmICh0eXBlb2YgcCA9PT0gJ29iamVjdCcgJiYgcCAhPT0gbnVsbCAmJiBrZXkgaW4gcCkgcmV0dXJuIHBba2V5XTtcblx0XHR9XG5cdH0sXG5cdHNldCh0YXJnZXQsIGtleSwgdmFsdWUpIHtcblx0XHRsZXQgaSA9IHRhcmdldC5wcm9wcy5sZW5ndGg7XG5cdFx0d2hpbGUgKGktLSkge1xuXHRcdFx0bGV0IHAgPSB0YXJnZXQucHJvcHNbaV07XG5cdFx0XHRpZiAoaXNfZnVuY3Rpb24ocCkpIHAgPSBwKCk7XG5cdFx0XHRjb25zdCBkZXNjID0gZ2V0X2Rlc2NyaXB0b3IocCwga2V5KTtcblx0XHRcdGlmIChkZXNjICYmIGRlc2Muc2V0KSB7XG5cdFx0XHRcdGRlc2Muc2V0KHZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0Z2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwga2V5KSB7XG5cdFx0bGV0IGkgPSB0YXJnZXQucHJvcHMubGVuZ3RoO1xuXHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdGxldCBwID0gdGFyZ2V0LnByb3BzW2ldO1xuXHRcdFx0aWYgKGlzX2Z1bmN0aW9uKHApKSBwID0gcCgpO1xuXHRcdFx0aWYgKHR5cGVvZiBwID09PSAnb2JqZWN0JyAmJiBwICE9PSBudWxsICYmIGtleSBpbiBwKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBnZXRfZGVzY3JpcHRvcihwLCBrZXkpO1xuXHRcdFx0XHRpZiAoZGVzY3JpcHRvciAmJiAhZGVzY3JpcHRvci5jb25maWd1cmFibGUpIHtcblx0XHRcdFx0XHQvLyBQcmV2ZW50IGEgXCJOb24tY29uZmlndXJhYmlsaXR5IFJlcG9ydCBFcnJvclwiOiBUaGUgdGFyZ2V0IGlzIGFuIGFycmF5LCBpdCBkb2VzXG5cdFx0XHRcdFx0Ly8gbm90IGFjdHVhbGx5IGNvbnRhaW4gdGhpcyBwcm9wZXJ0eS4gSWYgaXQgaXMgbm93IGRlc2NyaWJlZCBhcyBub24tY29uZmlndXJhYmxlLFxuXHRcdFx0XHRcdC8vIHRoZSBwcm94eSB0aHJvd3MgYSB2YWxpZGF0aW9uIGVycm9yLiBTZXR0aW5nIGl0IHRvIHRydWUgYXZvaWRzIHRoYXQuXG5cdFx0XHRcdFx0ZGVzY3JpcHRvci5jb25maWd1cmFibGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkZXNjcmlwdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0aGFzKHRhcmdldCwga2V5KSB7XG5cdFx0Ly8gVG8gcHJldmVudCBhIGZhbHNlIHBvc2l0aXZlIGBpc19lbnRyeV9wcm9wc2AgaW4gdGhlIGBwcm9wYCBmdW5jdGlvblxuXHRcdGlmIChrZXkgPT09IFNUQVRFX1NZTUJPTCB8fCBrZXkgPT09IExFR0FDWV9QUk9QUykgcmV0dXJuIGZhbHNlO1xuXG5cdFx0Zm9yIChsZXQgcCBvZiB0YXJnZXQucHJvcHMpIHtcblx0XHRcdGlmIChpc19mdW5jdGlvbihwKSkgcCA9IHAoKTtcblx0XHRcdGlmIChwICE9IG51bGwgJiYga2V5IGluIHApIHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0b3duS2V5cyh0YXJnZXQpIHtcblx0XHQvKiogQHR5cGUge0FycmF5PHN0cmluZyB8IHN5bWJvbD59ICovXG5cdFx0Y29uc3Qga2V5cyA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgcCBvZiB0YXJnZXQucHJvcHMpIHtcblx0XHRcdGlmIChpc19mdW5jdGlvbihwKSkgcCA9IHAoKTtcblx0XHRcdGlmICghcCkgY29udGludWU7XG5cblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHApIHtcblx0XHRcdFx0aWYgKCFrZXlzLmluY2x1ZGVzKGtleSkpIGtleXMucHVzaChrZXkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHApKSB7XG5cdFx0XHRcdGlmICgha2V5cy5pbmNsdWRlcyhrZXkpKSBrZXlzLnB1c2goa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ga2V5cztcblx0fVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5PFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgKCgpID0+IFJlY29yZDxzdHJpbmcsIHVua25vd24+KT59IHByb3BzXG4gKiBAcmV0dXJucyB7YW55fVxuICovXG5leHBvcnQgZnVuY3Rpb24gc3ByZWFkX3Byb3BzKC4uLnByb3BzKSB7XG5cdHJldHVybiBuZXcgUHJveHkoeyBwcm9wcyB9LCBzcHJlYWRfcHJvcHNfaGFuZGxlcik7XG59XG5cbi8qKlxuICogVGhpcyBmdW5jdGlvbiBpcyByZXNwb25zaWJsZSBmb3Igc3luY2hyb25pemluZyBhIHBvc3NpYmx5IGJvdW5kIHByb3Agd2l0aCB0aGUgaW5uZXIgY29tcG9uZW50IHN0YXRlLlxuICogSXQgaXMgdXNlZCB3aGVuZXZlciB0aGUgY29tcGlsZXIgc2VlcyB0aGF0IHRoZSBjb21wb25lbnQgd3JpdGVzIHRvIHRoZSBwcm9wLCBvciB3aGVuIGl0IGhhcyBhIGRlZmF1bHQgcHJvcF92YWx1ZS5cbiAqIEB0ZW1wbGF0ZSBWXG4gKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIHVua25vd24+fSBwcm9wc1xuICogQHBhcmFtIHtzdHJpbmd9IGtleVxuICogQHBhcmFtIHtudW1iZXJ9IGZsYWdzXG4gKiBAcGFyYW0ge1YgfCAoKCkgPT4gVil9IFtmYWxsYmFja11cbiAqIEByZXR1cm5zIHsoKCkgPT4gViB8ICgoYXJnOiBWKSA9PiBWKSB8ICgoYXJnOiBWLCBtdXRhdGlvbjogYm9vbGVhbikgPT4gVikpfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvcChwcm9wcywga2V5LCBmbGFncywgZmFsbGJhY2spIHtcblx0dmFyIHJ1bmVzID0gIWxlZ2FjeV9tb2RlX2ZsYWcgfHwgKGZsYWdzICYgUFJPUFNfSVNfUlVORVMpICE9PSAwO1xuXHR2YXIgYmluZGFibGUgPSAoZmxhZ3MgJiBQUk9QU19JU19CSU5EQUJMRSkgIT09IDA7XG5cdHZhciBsYXp5ID0gKGZsYWdzICYgUFJPUFNfSVNfTEFaWV9JTklUSUFMKSAhPT0gMDtcblxuXHR2YXIgZmFsbGJhY2tfdmFsdWUgPSAvKiogQHR5cGUge1Z9ICovIChmYWxsYmFjayk7XG5cdHZhciBmYWxsYmFja19kaXJ0eSA9IHRydWU7XG5cblx0dmFyIGdldF9mYWxsYmFjayA9ICgpID0+IHtcblx0XHRpZiAoZmFsbGJhY2tfZGlydHkpIHtcblx0XHRcdGZhbGxiYWNrX2RpcnR5ID0gZmFsc2U7XG5cblx0XHRcdGZhbGxiYWNrX3ZhbHVlID0gbGF6eVxuXHRcdFx0XHQ/IHVudHJhY2soLyoqIEB0eXBlIHsoKSA9PiBWfSAqLyAoZmFsbGJhY2spKVxuXHRcdFx0XHQ6IC8qKiBAdHlwZSB7Vn0gKi8gKGZhbGxiYWNrKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsbGJhY2tfdmFsdWU7XG5cdH07XG5cblx0LyoqIEB0eXBlIHsoKHY6IFYpID0+IHZvaWQpIHwgdW5kZWZpbmVkfSAqL1xuXHR2YXIgc2V0dGVyO1xuXG5cdGlmIChiaW5kYWJsZSkge1xuXHRcdC8vIENhbiBiZSB0aGUgY2FzZSB3aGVuIHNvbWVvbmUgZG9lcyBgbW91bnQoQ29tcG9uZW50LCBwcm9wcylgIHdpdGggYGxldCBwcm9wcyA9ICRzdGF0ZSh7Li4ufSlgXG5cdFx0Ly8gb3IgYGNyZWF0ZUNsYXNzQ29tcG9uZW50KENvbXBvbmVudCwgcHJvcHMpYFxuXHRcdHZhciBpc19lbnRyeV9wcm9wcyA9IFNUQVRFX1NZTUJPTCBpbiBwcm9wcyB8fCBMRUdBQ1lfUFJPUFMgaW4gcHJvcHM7XG5cblx0XHRzZXR0ZXIgPVxuXHRcdFx0Z2V0X2Rlc2NyaXB0b3IocHJvcHMsIGtleSk/LnNldCA/P1xuXHRcdFx0KGlzX2VudHJ5X3Byb3BzICYmIGtleSBpbiBwcm9wcyA/ICh2KSA9PiAocHJvcHNba2V5XSA9IHYpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHZhciBpbml0aWFsX3ZhbHVlO1xuXHR2YXIgaXNfc3RvcmVfc3ViID0gZmFsc2U7XG5cblx0aWYgKGJpbmRhYmxlKSB7XG5cdFx0W2luaXRpYWxfdmFsdWUsIGlzX3N0b3JlX3N1Yl0gPSBjYXB0dXJlX3N0b3JlX2JpbmRpbmcoKCkgPT4gLyoqIEB0eXBlIHtWfSAqLyAocHJvcHNba2V5XSkpO1xuXHR9IGVsc2Uge1xuXHRcdGluaXRpYWxfdmFsdWUgPSAvKiogQHR5cGUge1Z9ICovIChwcm9wc1trZXldKTtcblx0fVxuXG5cdGlmIChpbml0aWFsX3ZhbHVlID09PSB1bmRlZmluZWQgJiYgZmFsbGJhY2sgIT09IHVuZGVmaW5lZCkge1xuXHRcdGluaXRpYWxfdmFsdWUgPSBnZXRfZmFsbGJhY2soKTtcblxuXHRcdGlmIChzZXR0ZXIpIHtcblx0XHRcdGlmIChydW5lcykgZS5wcm9wc19pbnZhbGlkX3ZhbHVlKGtleSk7XG5cdFx0XHRzZXR0ZXIoaW5pdGlhbF92YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEB0eXBlIHsoKSA9PiBWfSAqL1xuXHR2YXIgZ2V0dGVyO1xuXG5cdGlmIChydW5lcykge1xuXHRcdGdldHRlciA9ICgpID0+IHtcblx0XHRcdHZhciB2YWx1ZSA9IC8qKiBAdHlwZSB7Vn0gKi8gKHByb3BzW2tleV0pO1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiBnZXRfZmFsbGJhY2soKTtcblx0XHRcdGZhbGxiYWNrX2RpcnR5ID0gdHJ1ZTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdGdldHRlciA9ICgpID0+IHtcblx0XHRcdHZhciB2YWx1ZSA9IC8qKiBAdHlwZSB7Vn0gKi8gKHByb3BzW2tleV0pO1xuXG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBpbiBsZWdhY3kgbW9kZSwgd2UgZG9uJ3QgcmV2ZXJ0IHRvIHRoZSBmYWxsYmFjayB2YWx1ZVxuXHRcdFx0XHQvLyBpZiB0aGUgcHJvcCBnb2VzIGZyb20gZGVmaW5lZCB0byB1bmRlZmluZWQuIFRoZSBlYXNpZXN0XG5cdFx0XHRcdC8vIHdheSB0byBtb2RlbCB0aGlzIGlzIHRvIG1ha2UgdGhlIGZhbGxiYWNrIHVuZGVmaW5lZFxuXHRcdFx0XHQvLyBhcyBzb29uIGFzIHRoZSBwcm9wIGhhcyBhIHZhbHVlXG5cdFx0XHRcdGZhbGxiYWNrX3ZhbHVlID0gLyoqIEB0eXBlIHtWfSAqLyAodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgPyBmYWxsYmFja192YWx1ZSA6IHZhbHVlO1xuXHRcdH07XG5cdH1cblxuXHQvLyBwcm9wIGlzIG5ldmVyIHdyaXR0ZW4gdG8g4oCUIHdlIG9ubHkgbmVlZCBhIGdldHRlclxuXHRpZiAocnVuZXMgJiYgKGZsYWdzICYgUFJPUFNfSVNfVVBEQVRFRCkgPT09IDApIHtcblx0XHRyZXR1cm4gZ2V0dGVyO1xuXHR9XG5cblx0Ly8gcHJvcCBpcyB3cml0dGVuIHRvLCBidXQgdGhlIHBhcmVudCBjb21wb25lbnQgaGFkIGBiaW5kOmZvb2Agd2hpY2hcblx0Ly8gbWVhbnMgd2UgY2FuIGp1c3QgY2FsbCBgJCRwcm9wcy5mb28gPSB2YWx1ZWAgZGlyZWN0bHlcblx0aWYgKHNldHRlcikge1xuXHRcdHZhciBsZWdhY3lfcGFyZW50ID0gcHJvcHMuJCRsZWdhY3k7XG5cdFx0cmV0dXJuIC8qKiBAdHlwZSB7KCkgPT4gVn0gKi8gKFxuXHRcdFx0ZnVuY3Rpb24gKC8qKiBAdHlwZSB7Vn0gKi8gdmFsdWUsIC8qKiBAdHlwZSB7Ym9vbGVhbn0gKi8gbXV0YXRpb24pIHtcblx0XHRcdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Ly8gV2UgZG9uJ3Qgd2FudCB0byBub3RpZnkgaWYgdGhlIHZhbHVlIHdhcyBtdXRhdGVkIGFuZCB0aGUgcGFyZW50IGlzIGluIHJ1bmVzIG1vZGUuXG5cdFx0XHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHRoZSBzdGF0ZSBwcm94eSAoaWYgaXQgZXhpc3RzKSBzaG91bGQgdGFrZSBjYXJlIG9mIHRoZSBub3RpZmljYXRpb24uXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHBhcmVudCBpcyBub3QgaW4gcnVuZXMgbW9kZSwgd2UgbmVlZCB0byBub3RpZnkgb24gbXV0YXRpb24sIHRvbywgdGhhdCB0aGUgcHJvcFxuXHRcdFx0XHRcdC8vIGhhcyBjaGFuZ2VkIGJlY2F1c2UgdGhlIHBhcmVudCB3aWxsIG5vdCBiZSBhYmxlIHRvIGRldGVjdCB0aGUgY2hhbmdlIG90aGVyd2lzZS5cblx0XHRcdFx0XHRpZiAoIXJ1bmVzIHx8ICFtdXRhdGlvbiB8fCBsZWdhY3lfcGFyZW50IHx8IGlzX3N0b3JlX3N1Yikge1xuXHRcdFx0XHRcdFx0LyoqIEB0eXBlIHtGdW5jdGlvbn0gKi8gKHNldHRlcikobXV0YXRpb24gPyBnZXR0ZXIoKSA6IHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZ2V0dGVyKCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdC8vIEVpdGhlciBwcm9wIGlzIHdyaXR0ZW4gdG8sIGJ1dCB0aGVyZSdzIG5vIGJpbmRpbmcsIHdoaWNoIG1lYW5zIHdlXG5cdC8vIGNyZWF0ZSBhIGRlcml2ZWQgdGhhdCB3ZSBjYW4gd3JpdGUgdG8gbG9jYWxseS5cblx0Ly8gT3Igd2UgYXJlIGluIGxlZ2FjeSBtb2RlIHdoZXJlIHdlIGFsd2F5cyBjcmVhdGUgYSBkZXJpdmVkIHRvIHJlcGxpY2F0ZSB0aGF0XG5cdC8vIFN2ZWx0ZSA0IGRpZCBub3QgdHJpZ2dlciB1cGRhdGVzIHdoZW4gYSBwcmltaXRpdmUgdmFsdWUgd2FzIHVwZGF0ZWQgdG8gdGhlIHNhbWUgdmFsdWUuXG5cdHZhciBvdmVycmlkZGVuID0gZmFsc2U7XG5cblx0dmFyIGQgPSAoKGZsYWdzICYgUFJPUFNfSVNfSU1NVVRBQkxFKSAhPT0gMCA/IGRlcml2ZWQgOiBkZXJpdmVkX3NhZmVfZXF1YWwpKCgpID0+IHtcblx0XHRvdmVycmlkZGVuID0gZmFsc2U7XG5cdFx0cmV0dXJuIGdldHRlcigpO1xuXHR9KTtcblxuXHRpZiAoREVWKSB7XG5cdFx0ZC5sYWJlbCA9IGtleTtcblx0fVxuXG5cdC8vIENhcHR1cmUgdGhlIGluaXRpYWwgdmFsdWUgaWYgaXQncyBiaW5kYWJsZVxuXHRpZiAoYmluZGFibGUpIGdldChkKTtcblxuXHR2YXIgcGFyZW50X2VmZmVjdCA9IC8qKiBAdHlwZSB7RWZmZWN0fSAqLyAoYWN0aXZlX2VmZmVjdCk7XG5cblx0cmV0dXJuIC8qKiBAdHlwZSB7KCkgPT4gVn0gKi8gKFxuXHRcdGZ1bmN0aW9uICgvKiogQHR5cGUge2FueX0gKi8gdmFsdWUsIC8qKiBAdHlwZSB7Ym9vbGVhbn0gKi8gbXV0YXRpb24pIHtcblx0XHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBuZXdfdmFsdWUgPSBtdXRhdGlvbiA/IGdldChkKSA6IHJ1bmVzICYmIGJpbmRhYmxlID8gcHJveHkodmFsdWUpIDogdmFsdWU7XG5cblx0XHRcdFx0c2V0KGQsIG5ld192YWx1ZSk7XG5cdFx0XHRcdG92ZXJyaWRkZW4gPSB0cnVlO1xuXG5cdFx0XHRcdGlmIChmYWxsYmFja192YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZmFsbGJhY2tfdmFsdWUgPSBuZXdfdmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNwZWNpYWwgY2FzZSDigJQgYXZvaWQgcmVjYWxjdWxhdGluZyB0aGUgZGVyaXZlZCBpZiB3ZSdyZSBpbiBhXG5cdFx0XHQvLyB0ZWFyZG93biBmdW5jdGlvbiBhbmQgdGhlIHByb3Agd2FzIG92ZXJyaWRkZW4gbG9jYWxseSwgb3IgdGhlXG5cdFx0XHQvLyBjb21wb25lbnQgd2FzIGFscmVhZHkgZGVzdHJveWVkICh0aGlzIGxhdHRlciBwYXJ0IGlzIG5lY2Vzc2FyeVxuXHRcdFx0Ly8gYmVjYXVzZSBgYmluZDp0aGlzYCBjYW4gcmVhZCBwcm9wcyBhZnRlciB0aGUgY29tcG9uZW50IGhhc1xuXHRcdFx0Ly8gYmVlbiBkZXN0cm95ZWQuIFRPRE8gc2ltcGxpZnkgYGJpbmQ6dGhpc2Bcblx0XHRcdGlmICgoaXNfZGVzdHJveWluZ19lZmZlY3QgJiYgb3ZlcnJpZGRlbikgfHwgKHBhcmVudF9lZmZlY3QuZiAmIERFU1RST1lFRCkgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGQudjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGdldChkKTtcblx0XHR9XG5cdCk7XG59XG4iLCJpbXBvcnQgeyBTVEFURV9TWU1CT0wgfSBmcm9tICcjY2xpZW50L2NvbnN0YW50cyc7XG5pbXBvcnQgeyBzbmFwc2hvdCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jbG9uZS5qcyc7XG5pbXBvcnQgKiBhcyB3IGZyb20gJy4uL3dhcm5pbmdzLmpzJztcbmltcG9ydCB7IHVudHJhY2sgfSBmcm9tICcuLi9ydW50aW1lLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kXG4gKiBAcGFyYW0gIHsuLi5hbnl9IG9iamVjdHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvZ19pZl9jb250YWluc19zdGF0ZShtZXRob2QsIC4uLm9iamVjdHMpIHtcblx0dW50cmFjaygoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBoYXNfc3RhdGUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkID0gW107XG5cblx0XHRcdGZvciAoY29uc3Qgb2JqIG9mIG9iamVjdHMpIHtcblx0XHRcdFx0aWYgKG9iaiAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBTVEFURV9TWU1CT0wgaW4gb2JqKSB7XG5cdFx0XHRcdFx0dHJhbnNmb3JtZWQucHVzaChzbmFwc2hvdChvYmosIHRydWUpKTtcblx0XHRcdFx0XHRoYXNfc3RhdGUgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyYW5zZm9ybWVkLnB1c2gob2JqKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzX3N0YXRlKSB7XG5cdFx0XHRcdHcuY29uc29sZV9sb2dfc3RhdGUobWV0aG9kKTtcblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuXHRcdFx0XHRjb25zb2xlLmxvZygnJWNbc25hcHNob3RdJywgJ2NvbG9yOiBncmV5JywgLi4udHJhbnNmb3JtZWQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge31cblx0fSk7XG5cblx0cmV0dXJuIG9iamVjdHM7XG59XG4iLCIvKipcbiAqIEBsaWNlbnNlIGx1Y2lkZS1zdmVsdGUgdjAuNTU1LjAgLSBJU0NcbiAqXG4gKiBJU0MgTGljZW5zZVxuICogXG4gKiBDb3B5cmlnaHQgKGMpIGZvciBwb3J0aW9ucyBvZiBMdWNpZGUgYXJlIGhlbGQgYnkgQ29sZSBCZW1pcyAyMDEzLTIwMjMgYXMgcGFydCBvZiBGZWF0aGVyIChNSVQpLiBBbGwgb3RoZXIgY29weXJpZ2h0IChjKSBmb3IgTHVjaWRlIGFyZSBoZWxkIGJ5IEx1Y2lkZSBDb250cmlidXRvcnMgMjAyNS5cbiAqIFxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICogXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiIEFORCBUSEUgQVVUSE9SIERJU0NMQUlNUyBBTEwgV0FSUkFOVElFU1xuICogV0lUSCBSRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRlxuICogTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTLiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SIEJFIExJQUJMRSBGT1JcbiAqIEFOWSBTUEVDSUFMLCBESVJFQ1QsIElORElSRUNULCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgT1IgQU5ZIERBTUFHRVNcbiAqIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST00gTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTlxuICogQUNUSU9OIE9GIENPTlRSQUNULCBORUdMSUdFTkNFIE9SIE9USEVSIFRPUlRJT1VTIEFDVElPTiwgQVJJU0lORyBPVVQgT0ZcbiAqIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgVVNFIE9SIFBFUkZPUk1BTkNFIE9GIFRISVMgU09GVFdBUkUuXG4gKiBcbiAqIC0tLVxuICogXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqIFxuICogQ29weXJpZ2h0IChjKSAyMDEzLTIwMjMgQ29sZSBCZW1pc1xuICogXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKiBcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqIFxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiBcbiAqL1xuY29uc3QgZGVmYXVsdEF0dHJpYnV0ZXMgPSB7XG4gICAgeG1sbnM6ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsXG4gICAgd2lkdGg6IDI0LFxuICAgIGhlaWdodDogMjQsXG4gICAgdmlld0JveDogJzAgMCAyNCAyNCcsXG4gICAgZmlsbDogJ25vbmUnLFxuICAgIHN0cm9rZTogJ2N1cnJlbnRDb2xvcicsXG4gICAgJ3N0cm9rZS13aWR0aCc6IDIsXG4gICAgJ3N0cm9rZS1saW5lY2FwJzogJ3JvdW5kJyxcbiAgICAnc3Ryb2tlLWxpbmVqb2luJzogJ3JvdW5kJyxcbn07XG5leHBvcnQgZGVmYXVsdCBkZWZhdWx0QXR0cmlidXRlcztcbiIsIjxzY3JpcHQ+aW1wb3J0IGRlZmF1bHRBdHRyaWJ1dGVzIGZyb20gJy4vZGVmYXVsdEF0dHJpYnV0ZXMnO1xuZXhwb3J0IGxldCBuYW1lID0gdW5kZWZpbmVkO1xuZXhwb3J0IGxldCBjb2xvciA9ICdjdXJyZW50Q29sb3InO1xuZXhwb3J0IGxldCBzaXplID0gMjQ7XG5leHBvcnQgbGV0IHN0cm9rZVdpZHRoID0gMjtcbmV4cG9ydCBsZXQgYWJzb2x1dGVTdHJva2VXaWR0aCA9IGZhbHNlO1xuZXhwb3J0IGxldCBpY29uTm9kZSA9IFtdO1xuY29uc3QgbWVyZ2VDbGFzc2VzID0gKC4uLmNsYXNzZXMpID0+IGNsYXNzZXMuZmlsdGVyKChjbGFzc05hbWUsIGluZGV4LCBhcnJheSkgPT4ge1xuICAgIHJldHVybiBCb29sZWFuKGNsYXNzTmFtZSkgJiYgYXJyYXkuaW5kZXhPZihjbGFzc05hbWUpID09PSBpbmRleDtcbn0pXG4gICAgLmpvaW4oJyAnKTtcbjwvc2NyaXB0PlxuXG48c3ZnXG4gIHsuLi5kZWZhdWx0QXR0cmlidXRlc31cbiAgey4uLiQkcmVzdFByb3BzfVxuICB3aWR0aD17c2l6ZX1cbiAgaGVpZ2h0PXtzaXplfVxuICBzdHJva2U9e2NvbG9yfVxuICBzdHJva2Utd2lkdGg9e1xuICAgIGFic29sdXRlU3Ryb2tlV2lkdGhcbiAgICAgID8gTnVtYmVyKHN0cm9rZVdpZHRoKSAqIDI0IC8gTnVtYmVyKHNpemUpXG4gICAgICA6IHN0cm9rZVdpZHRoXG4gIH1cbiAgY2xhc3M9e1xuICAgIG1lcmdlQ2xhc3NlcyhcbiAgICAgICdsdWNpZGUtaWNvbicsXG4gICAgICAnbHVjaWRlJyxcbiAgICAgIG5hbWUgPyBgbHVjaWRlLSR7bmFtZX1gOiAnJyxcbiAgICAgICQkcHJvcHMuY2xhc3NcbiAgICApXG4gIH1cbj5cbiAgeyNlYWNoIGljb25Ob2RlIGFzIFt0YWcsIGF0dHJzXX1cbiAgICA8c3ZlbHRlOmVsZW1lbnQgdGhpcz17dGFnfSB7Li4uYXR0cnN9Lz5cbiAgey9lYWNofVxuICA8c2xvdCAvPlxuPC9zdmc+XG4iLCI8c2NyaXB0Pi8qKlxuICogQGxpY2Vuc2UgbHVjaWRlLXN2ZWx0ZSB2MC41NTUuMCAtIElTQ1xuICpcbiAqIElTQyBMaWNlbnNlXG4gKlxuICogQ29weXJpZ2h0IChjKSBmb3IgcG9ydGlvbnMgb2YgTHVjaWRlIGFyZSBoZWxkIGJ5IENvbGUgQmVtaXMgMjAxMy0yMDIzIGFzIHBhcnQgb2YgRmVhdGhlciAoTUlUKS4gQWxsIG90aGVyIGNvcHlyaWdodCAoYykgZm9yIEx1Y2lkZSBhcmUgaGVsZCBieSBMdWNpZGUgQ29udHJpYnV0b3JzIDIwMjUuXG4gKlxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTXG4gKiBXSVRIIFJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GXG4gKiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUlxuICogQU5ZIFNQRUNJQUwsIERJUkVDVCwgSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFU1xuICogV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTSBMT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOXG4gKiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1IgT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRlxuICogT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1IgUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cbiAqXG4gKiAtLS1cbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMyBDb2xlIEJlbWlzXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqXG4gKi9cbmltcG9ydCBJY29uIGZyb20gJy4uL0ljb24uc3ZlbHRlJztcbmNvbnN0IGljb25Ob2RlID0gW1tcInBhdGhcIiwgeyBcImRcIjogXCJNMTIgMTVWM1wiIH1dLCBbXCJwYXRoXCIsIHsgXCJkXCI6IFwiTTIxIDE1djRhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJ2LTRcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIm03IDEwIDUgNSA1LTVcIiB9XV07XG4vKipcbiAqIEBjb21wb25lbnQgQG5hbWUgRG93bmxvYWRcbiAqIEBkZXNjcmlwdGlvbiBMdWNpZGUgU1ZHIGljb24gY29tcG9uZW50LCByZW5kZXJzIFNWRyBFbGVtZW50IHdpdGggY2hpbGRyZW4uXG4gKlxuICogQHByZXZpZXcgIVtpbWddKGRhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEhOMlp5QWdlRzFzYm5NOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6SXdNREF2YzNabklnb2dJSGRwWkhSb1BTSXlOQ0lLSUNCb1pXbG5hSFE5SWpJMElnb2dJSFpwWlhkQ2IzZzlJakFnTUNBeU5DQXlOQ0lLSUNCbWFXeHNQU0p1YjI1bElnb2dJSE4wY205clpUMGlJekF3TUNJZ2MzUjViR1U5SW1KaFkydG5jbTkxYm1RdFkyOXNiM0k2SUNObVptWTdJR0p2Y21SbGNpMXlZV1JwZFhNNklESndlQ0lLSUNCemRISnZhMlV0ZDJsa2RHZzlJaklpQ2lBZ2MzUnliMnRsTFd4cGJtVmpZWEE5SW5KdmRXNWtJZ29nSUhOMGNtOXJaUzFzYVc1bGFtOXBiajBpY205MWJtUWlDajRLSUNBOGNHRjBhQ0JrUFNKTk1USWdNVFZXTXlJZ0x6NEtJQ0E4Y0dGMGFDQmtQU0pOTWpFZ01UVjJOR0V5SURJZ01DQXdJREV0TWlBeVNEVmhNaUF5SURBZ01DQXhMVEl0TW5ZdE5DSWdMejRLSUNBOGNHRjBhQ0JrUFNKdE55QXhNQ0ExSURVZ05TMDFJaUF2UGdvOEwzTjJaejRLKSAtIGh0dHBzOi8vbHVjaWRlLmRldi9pY29ucy9kb3dubG9hZFxuICogQHNlZSBodHRwczovL2x1Y2lkZS5kZXYvZ3VpZGUvcGFja2FnZXMvbHVjaWRlLXN2ZWx0ZSAtIERvY3VtZW50YXRpb25cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcHMgLSBMdWNpZGUgaWNvbnMgcHJvcHMgYW5kIGFueSB2YWxpZCBTVkcgYXR0cmlidXRlXG4gKiBAcmV0dXJucyB7RnVuY3Rpb25hbENvbXBvbmVudH0gU3ZlbHRlIGNvbXBvbmVudFxuICpcbiAqL1xuPC9zY3JpcHQ+XG5cbjxJY29uIG5hbWU9XCJkb3dubG9hZFwiIHsuLi4kJHByb3BzfSBpY29uTm9kZT17aWNvbk5vZGV9PlxuICA8c2xvdC8+XG48L0ljb24+XG4iLCI8c2NyaXB0Pi8qKlxuICogQGxpY2Vuc2UgbHVjaWRlLXN2ZWx0ZSB2MC41NTUuMCAtIElTQ1xuICpcbiAqIElTQyBMaWNlbnNlXG4gKlxuICogQ29weXJpZ2h0IChjKSBmb3IgcG9ydGlvbnMgb2YgTHVjaWRlIGFyZSBoZWxkIGJ5IENvbGUgQmVtaXMgMjAxMy0yMDIzIGFzIHBhcnQgb2YgRmVhdGhlciAoTUlUKS4gQWxsIG90aGVyIGNvcHlyaWdodCAoYykgZm9yIEx1Y2lkZSBhcmUgaGVsZCBieSBMdWNpZGUgQ29udHJpYnV0b3JzIDIwMjUuXG4gKlxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTXG4gKiBXSVRIIFJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GXG4gKiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUlxuICogQU5ZIFNQRUNJQUwsIERJUkVDVCwgSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFU1xuICogV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTSBMT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOXG4gKiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1IgT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRlxuICogT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1IgUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cbiAqXG4gKiAtLS1cbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMyBDb2xlIEJlbWlzXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqXG4gKi9cbmltcG9ydCBJY29uIGZyb20gJy4uL0ljb24uc3ZlbHRlJztcbmNvbnN0IGljb25Ob2RlID0gW1tcInJlY3RcIiwgeyBcIndpZHRoXCI6IFwiMThcIiwgXCJoZWlnaHRcIjogXCIxOFwiLCBcInhcIjogXCIzXCIsIFwieVwiOiBcIjNcIiwgXCJyeFwiOiBcIjJcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIk0zIDloMThcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIk0zIDE1aDE4XCIgfV0sIFtcInBhdGhcIiwgeyBcImRcIjogXCJNOSAzdjE4XCIgfV0sIFtcInBhdGhcIiwgeyBcImRcIjogXCJNMTUgM3YxOFwiIH1dXTtcbi8qKlxuICogQGNvbXBvbmVudCBAbmFtZSBHcmlkM3gzXG4gKiBAZGVzY3JpcHRpb24gTHVjaWRlIFNWRyBpY29uIGNvbXBvbmVudCwgcmVuZGVycyBTVkcgRWxlbWVudCB3aXRoIGNoaWxkcmVuLlxuICpcbiAqIEBwcmV2aWV3ICFbaW1nXShkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBITjJaeUFnZUcxc2JuTTlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5Mekl3TURBdmMzWm5JZ29nSUhkcFpIUm9QU0l5TkNJS0lDQm9aV2xuYUhROUlqSTBJZ29nSUhacFpYZENiM2c5SWpBZ01DQXlOQ0F5TkNJS0lDQm1hV3hzUFNKdWIyNWxJZ29nSUhOMGNtOXJaVDBpSXpBd01DSWdjM1I1YkdVOUltSmhZMnRuY205MWJtUXRZMjlzYjNJNklDTm1abVk3SUdKdmNtUmxjaTF5WVdScGRYTTZJREp3ZUNJS0lDQnpkSEp2YTJVdGQybGtkR2c5SWpJaUNpQWdjM1J5YjJ0bExXeHBibVZqWVhBOUluSnZkVzVrSWdvZ0lITjBjbTlyWlMxc2FXNWxhbTlwYmowaWNtOTFibVFpQ2o0S0lDQThjbVZqZENCM2FXUjBhRDBpTVRnaUlHaGxhV2RvZEQwaU1UZ2lJSGc5SWpNaUlIazlJak1pSUhKNFBTSXlJaUF2UGdvZ0lEeHdZWFJvSUdROUlrMHpJRGxvTVRnaUlDOCtDaUFnUEhCaGRHZ2daRDBpVFRNZ01UVm9NVGdpSUM4K0NpQWdQSEJoZEdnZ1pEMGlUVGtnTTNZeE9DSWdMejRLSUNBOGNHRjBhQ0JrUFNKTk1UVWdNM1l4T0NJZ0x6NEtQQzl6ZG1jK0NnPT0pIC0gaHR0cHM6Ly9sdWNpZGUuZGV2L2ljb25zL2dyaWQtM3gzXG4gKiBAc2VlIGh0dHBzOi8vbHVjaWRlLmRldi9ndWlkZS9wYWNrYWdlcy9sdWNpZGUtc3ZlbHRlIC0gRG9jdW1lbnRhdGlvblxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wcyAtIEx1Y2lkZSBpY29ucyBwcm9wcyBhbmQgYW55IHZhbGlkIFNWRyBhdHRyaWJ1dGVcbiAqIEByZXR1cm5zIHtGdW5jdGlvbmFsQ29tcG9uZW50fSBTdmVsdGUgY29tcG9uZW50XG4gKlxuICovXG48L3NjcmlwdD5cblxuPEljb24gbmFtZT1cImdyaWQtM3gzXCIgey4uLiQkcHJvcHN9IGljb25Ob2RlPXtpY29uTm9kZX0+XG4gIDxzbG90Lz5cbjwvSWNvbj5cbiIsIjxzY3JpcHQ+LyoqXG4gKiBAbGljZW5zZSBsdWNpZGUtc3ZlbHRlIHYwLjU1NS4wIC0gSVNDXG4gKlxuICogSVNDIExpY2Vuc2VcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIGZvciBwb3J0aW9ucyBvZiBMdWNpZGUgYXJlIGhlbGQgYnkgQ29sZSBCZW1pcyAyMDEzLTIwMjMgYXMgcGFydCBvZiBGZWF0aGVyIChNSVQpLiBBbGwgb3RoZXIgY29weXJpZ2h0IChjKSBmb3IgTHVjaWRlIGFyZSBoZWxkIGJ5IEx1Y2lkZSBDb250cmlidXRvcnMgMjAyNS5cbiAqXG4gKiBQZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcbiAqIHB1cnBvc2Ugd2l0aCBvciB3aXRob3V0IGZlZSBpcyBoZXJlYnkgZ3JhbnRlZCwgcHJvdmlkZWQgdGhhdCB0aGUgYWJvdmVcbiAqIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2UgYXBwZWFyIGluIGFsbCBjb3BpZXMuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVNcbiAqIFdJVEggUkVHQVJEIFRPIFRISVMgU09GVFdBUkUgSU5DTFVESU5HIEFMTCBJTVBMSUVEIFdBUlJBTlRJRVMgT0ZcbiAqIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUy4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUiBCRSBMSUFCTEUgRk9SXG4gKiBBTlkgU1BFQ0lBTCwgRElSRUNULCBJTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTXG4gKiBXSEFUU09FVkVSIFJFU1VMVElORyBGUk9NIExPU1MgT0YgVVNFLCBEQVRBIE9SIFBST0ZJVFMsIFdIRVRIRVIgSU4gQU5cbiAqIEFDVElPTiBPRiBDT05UUkFDVCwgTkVHTElHRU5DRSBPUiBPVEhFUiBUT1JUSU9VUyBBQ1RJT04sIEFSSVNJTkcgT1VUIE9GXG4gKiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUiBQRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxuICpcbiAqIC0tLVxuICpcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKSAoZm9yIHBvcnRpb25zIGRlcml2ZWQgZnJvbSBGZWF0aGVyKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMy0yMDIzIENvbGUgQmVtaXNcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICpcbiAqL1xuaW1wb3J0IEljb24gZnJvbSAnLi4vSWNvbi5zdmVsdGUnO1xuY29uc3QgaWNvbk5vZGUgPSBbW1wicmVjdFwiLCB7IFwid2lkdGhcIjogXCIxOFwiLCBcImhlaWdodFwiOiBcIjE4XCIsIFwieFwiOiBcIjNcIiwgXCJ5XCI6IFwiM1wiLCBcInJ4XCI6IFwiMlwiLCBcInJ5XCI6IFwiMlwiIH1dLCBbXCJjaXJjbGVcIiwgeyBcImN4XCI6IFwiOVwiLCBcImN5XCI6IFwiOVwiLCBcInJcIjogXCIyXCIgfV0sIFtcInBhdGhcIiwgeyBcImRcIjogXCJtMjEgMTUtMy4wODYtMy4wODZhMiAyIDAgMCAwLTIuODI4IDBMNiAyMVwiIH1dXTtcbi8qKlxuICogQGNvbXBvbmVudCBAbmFtZSBJbWFnZVxuICogQGRlc2NyaXB0aW9uIEx1Y2lkZSBTVkcgaWNvbiBjb21wb25lbnQsIHJlbmRlcnMgU1ZHIEVsZW1lbnQgd2l0aCBjaGlsZHJlbi5cbiAqXG4gKiBAcHJldmlldyAhW2ltZ10oZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlBZ2VHMXNibk05SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpJd01EQXZjM1puSWdvZ0lIZHBaSFJvUFNJeU5DSUtJQ0JvWldsbmFIUTlJakkwSWdvZ0lIWnBaWGRDYjNnOUlqQWdNQ0F5TkNBeU5DSUtJQ0JtYVd4c1BTSnViMjVsSWdvZ0lITjBjbTlyWlQwaUl6QXdNQ0lnYzNSNWJHVTlJbUpoWTJ0bmNtOTFibVF0WTI5c2IzSTZJQ05tWm1ZN0lHSnZjbVJsY2kxeVlXUnBkWE02SURKd2VDSUtJQ0J6ZEhKdmEyVXRkMmxrZEdnOUlqSWlDaUFnYzNSeWIydGxMV3hwYm1WallYQTlJbkp2ZFc1a0lnb2dJSE4wY205clpTMXNhVzVsYW05cGJqMGljbTkxYm1RaUNqNEtJQ0E4Y21WamRDQjNhV1IwYUQwaU1UZ2lJR2hsYVdkb2REMGlNVGdpSUhnOUlqTWlJSGs5SWpNaUlISjRQU0l5SWlCeWVUMGlNaUlnTHo0S0lDQThZMmx5WTJ4bElHTjRQU0k1SWlCamVUMGlPU0lnY2owaU1pSWdMejRLSUNBOGNHRjBhQ0JrUFNKdE1qRWdNVFV0TXk0d09EWXRNeTR3T0RaaE1pQXlJREFnTUNBd0xUSXVPREk0SURCTU5pQXlNU0lnTHo0S1BDOXpkbWMrQ2c9PSkgLSBodHRwczovL2x1Y2lkZS5kZXYvaWNvbnMvaW1hZ2VcbiAqIEBzZWUgaHR0cHM6Ly9sdWNpZGUuZGV2L2d1aWRlL3BhY2thZ2VzL2x1Y2lkZS1zdmVsdGUgLSBEb2N1bWVudGF0aW9uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzIC0gTHVjaWRlIGljb25zIHByb3BzIGFuZCBhbnkgdmFsaWQgU1ZHIGF0dHJpYnV0ZVxuICogQHJldHVybnMge0Z1bmN0aW9uYWxDb21wb25lbnR9IFN2ZWx0ZSBjb21wb25lbnRcbiAqXG4gKi9cbjwvc2NyaXB0PlxuXG48SWNvbiBuYW1lPVwiaW1hZ2VcIiB7Li4uJCRwcm9wc30gaWNvbk5vZGU9e2ljb25Ob2RlfT5cbiAgPHNsb3QvPlxuPC9JY29uPlxuIiwiPHNjcmlwdD4vKipcbiAqIEBsaWNlbnNlIGx1Y2lkZS1zdmVsdGUgdjAuNTU1LjAgLSBJU0NcbiAqXG4gKiBJU0MgTGljZW5zZVxuICpcbiAqIENvcHlyaWdodCAoYykgZm9yIHBvcnRpb25zIG9mIEx1Y2lkZSBhcmUgaGVsZCBieSBDb2xlIEJlbWlzIDIwMTMtMjAyMyBhcyBwYXJ0IG9mIEZlYXRoZXIgKE1JVCkuIEFsbCBvdGhlciBjb3B5cmlnaHQgKGMpIGZvciBMdWNpZGUgYXJlIGhlbGQgYnkgTHVjaWRlIENvbnRyaWJ1dG9ycyAyMDI1LlxuICpcbiAqIFBlcm1pc3Npb24gdG8gdXNlLCBjb3B5LCBtb2RpZnksIGFuZC9vciBkaXN0cmlidXRlIHRoaXMgc29mdHdhcmUgZm9yIGFueVxuICogcHVycG9zZSB3aXRoIG9yIHdpdGhvdXQgZmVlIGlzIGhlcmVieSBncmFudGVkLCBwcm92aWRlZCB0aGF0IHRoZSBhYm92ZVxuICogY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBhcHBlYXIgaW4gYWxsIGNvcGllcy5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiIEFORCBUSEUgQVVUSE9SIERJU0NMQUlNUyBBTEwgV0FSUkFOVElFU1xuICogV0lUSCBSRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRlxuICogTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTLiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SIEJFIExJQUJMRSBGT1JcbiAqIEFOWSBTUEVDSUFMLCBESVJFQ1QsIElORElSRUNULCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgT1IgQU5ZIERBTUFHRVNcbiAqIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST00gTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTlxuICogQUNUSU9OIE9GIENPTlRSQUNULCBORUdMSUdFTkNFIE9SIE9USEVSIFRPUlRJT1VTIEFDVElPTiwgQVJJU0lORyBPVVQgT0ZcbiAqIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgVVNFIE9SIFBFUkZPUk1BTkNFIE9GIFRISVMgU09GVFdBUkUuXG4gKlxuICogLS0tXG4gKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpIChmb3IgcG9ydGlvbnMgZGVyaXZlZCBmcm9tIEZlYXRoZXIpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEzLTIwMjMgQ29sZSBCZW1pc1xuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKlxuICovXG5pbXBvcnQgSWNvbiBmcm9tICcuLi9JY29uLnN2ZWx0ZSc7XG5jb25zdCBpY29uTm9kZSA9IFtbXCJwYXRoXCIsIHsgXCJkXCI6IFwiTTMgNWguMDFcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIk0zIDEyaC4wMVwiIH1dLCBbXCJwYXRoXCIsIHsgXCJkXCI6IFwiTTMgMTloLjAxXCIgfV0sIFtcInBhdGhcIiwgeyBcImRcIjogXCJNOCA1aDEzXCIgfV0sIFtcInBhdGhcIiwgeyBcImRcIjogXCJNOCAxMmgxM1wiIH1dLCBbXCJwYXRoXCIsIHsgXCJkXCI6IFwiTTggMTloMTNcIiB9XV07XG4vKipcbiAqIEBjb21wb25lbnQgQG5hbWUgTGlzdFxuICogQGRlc2NyaXB0aW9uIEx1Y2lkZSBTVkcgaWNvbiBjb21wb25lbnQsIHJlbmRlcnMgU1ZHIEVsZW1lbnQgd2l0aCBjaGlsZHJlbi5cbiAqXG4gKiBAcHJldmlldyAhW2ltZ10oZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlBZ2VHMXNibk05SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpJd01EQXZjM1puSWdvZ0lIZHBaSFJvUFNJeU5DSUtJQ0JvWldsbmFIUTlJakkwSWdvZ0lIWnBaWGRDYjNnOUlqQWdNQ0F5TkNBeU5DSUtJQ0JtYVd4c1BTSnViMjVsSWdvZ0lITjBjbTlyWlQwaUl6QXdNQ0lnYzNSNWJHVTlJbUpoWTJ0bmNtOTFibVF0WTI5c2IzSTZJQ05tWm1ZN0lHSnZjbVJsY2kxeVlXUnBkWE02SURKd2VDSUtJQ0J6ZEhKdmEyVXRkMmxrZEdnOUlqSWlDaUFnYzNSeWIydGxMV3hwYm1WallYQTlJbkp2ZFc1a0lnb2dJSE4wY205clpTMXNhVzVsYW05cGJqMGljbTkxYm1RaUNqNEtJQ0E4Y0dGMGFDQmtQU0pOTXlBMWFDNHdNU0lnTHo0S0lDQThjR0YwYUNCa1BTSk5NeUF4TW1ndU1ERWlJQzgrQ2lBZ1BIQmhkR2dnWkQwaVRUTWdNVGxvTGpBeElpQXZQZ29nSUR4d1lYUm9JR1E5SWswNElEVm9NVE1pSUM4K0NpQWdQSEJoZEdnZ1pEMGlUVGdnTVRKb01UTWlJQzgrQ2lBZ1BIQmhkR2dnWkQwaVRUZ2dNVGxvTVRNaUlDOCtDand2YzNablBnbz0pIC0gaHR0cHM6Ly9sdWNpZGUuZGV2L2ljb25zL2xpc3RcbiAqIEBzZWUgaHR0cHM6Ly9sdWNpZGUuZGV2L2d1aWRlL3BhY2thZ2VzL2x1Y2lkZS1zdmVsdGUgLSBEb2N1bWVudGF0aW9uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzIC0gTHVjaWRlIGljb25zIHByb3BzIGFuZCBhbnkgdmFsaWQgU1ZHIGF0dHJpYnV0ZVxuICogQHJldHVybnMge0Z1bmN0aW9uYWxDb21wb25lbnR9IFN2ZWx0ZSBjb21wb25lbnRcbiAqXG4gKi9cbjwvc2NyaXB0PlxuXG48SWNvbiBuYW1lPVwibGlzdFwiIHsuLi4kJHByb3BzfSBpY29uTm9kZT17aWNvbk5vZGV9PlxuICA8c2xvdC8+XG48L0ljb24+XG4iLCI8c2NyaXB0Pi8qKlxuICogQGxpY2Vuc2UgbHVjaWRlLXN2ZWx0ZSB2MC41NTUuMCAtIElTQ1xuICpcbiAqIElTQyBMaWNlbnNlXG4gKlxuICogQ29weXJpZ2h0IChjKSBmb3IgcG9ydGlvbnMgb2YgTHVjaWRlIGFyZSBoZWxkIGJ5IENvbGUgQmVtaXMgMjAxMy0yMDIzIGFzIHBhcnQgb2YgRmVhdGhlciAoTUlUKS4gQWxsIG90aGVyIGNvcHlyaWdodCAoYykgZm9yIEx1Y2lkZSBhcmUgaGVsZCBieSBMdWNpZGUgQ29udHJpYnV0b3JzIDIwMjUuXG4gKlxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTXG4gKiBXSVRIIFJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GXG4gKiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUlxuICogQU5ZIFNQRUNJQUwsIERJUkVDVCwgSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFU1xuICogV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTSBMT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOXG4gKiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1IgT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRlxuICogT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1IgUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cbiAqXG4gKiAtLS1cbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMyBDb2xlIEJlbWlzXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqXG4gKi9cbmltcG9ydCBJY29uIGZyb20gJy4uL0ljb24uc3ZlbHRlJztcbmNvbnN0IGljb25Ob2RlID0gW1tcInBhdGhcIiwgeyBcImRcIjogXCJtMjEgMjEtNC4zNC00LjM0XCIgfV0sIFtcImNpcmNsZVwiLCB7IFwiY3hcIjogXCIxMVwiLCBcImN5XCI6IFwiMTFcIiwgXCJyXCI6IFwiOFwiIH1dXTtcbi8qKlxuICogQGNvbXBvbmVudCBAbmFtZSBTZWFyY2hcbiAqIEBkZXNjcmlwdGlvbiBMdWNpZGUgU1ZHIGljb24gY29tcG9uZW50LCByZW5kZXJzIFNWRyBFbGVtZW50IHdpdGggY2hpbGRyZW4uXG4gKlxuICogQHByZXZpZXcgIVtpbWddKGRhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEhOMlp5QWdlRzFzYm5NOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6SXdNREF2YzNabklnb2dJSGRwWkhSb1BTSXlOQ0lLSUNCb1pXbG5hSFE5SWpJMElnb2dJSFpwWlhkQ2IzZzlJakFnTUNBeU5DQXlOQ0lLSUNCbWFXeHNQU0p1YjI1bElnb2dJSE4wY205clpUMGlJekF3TUNJZ2MzUjViR1U5SW1KaFkydG5jbTkxYm1RdFkyOXNiM0k2SUNObVptWTdJR0p2Y21SbGNpMXlZV1JwZFhNNklESndlQ0lLSUNCemRISnZhMlV0ZDJsa2RHZzlJaklpQ2lBZ2MzUnliMnRsTFd4cGJtVmpZWEE5SW5KdmRXNWtJZ29nSUhOMGNtOXJaUzFzYVc1bGFtOXBiajBpY205MWJtUWlDajRLSUNBOGNHRjBhQ0JrUFNKdE1qRWdNakV0TkM0ek5DMDBMak0wSWlBdlBnb2dJRHhqYVhKamJHVWdZM2c5SWpFeElpQmplVDBpTVRFaUlISTlJamdpSUM4K0Nqd3ZjM1puUGdvPSkgLSBodHRwczovL2x1Y2lkZS5kZXYvaWNvbnMvc2VhcmNoXG4gKiBAc2VlIGh0dHBzOi8vbHVjaWRlLmRldi9ndWlkZS9wYWNrYWdlcy9sdWNpZGUtc3ZlbHRlIC0gRG9jdW1lbnRhdGlvblxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wcyAtIEx1Y2lkZSBpY29ucyBwcm9wcyBhbmQgYW55IHZhbGlkIFNWRyBhdHRyaWJ1dGVcbiAqIEByZXR1cm5zIHtGdW5jdGlvbmFsQ29tcG9uZW50fSBTdmVsdGUgY29tcG9uZW50XG4gKlxuICovXG48L3NjcmlwdD5cblxuPEljb24gbmFtZT1cInNlYXJjaFwiIHsuLi4kJHByb3BzfSBpY29uTm9kZT17aWNvbk5vZGV9PlxuICA8c2xvdC8+XG48L0ljb24+XG4iLCI8c2NyaXB0Pi8qKlxuICogQGxpY2Vuc2UgbHVjaWRlLXN2ZWx0ZSB2MC41NTUuMCAtIElTQ1xuICpcbiAqIElTQyBMaWNlbnNlXG4gKlxuICogQ29weXJpZ2h0IChjKSBmb3IgcG9ydGlvbnMgb2YgTHVjaWRlIGFyZSBoZWxkIGJ5IENvbGUgQmVtaXMgMjAxMy0yMDIzIGFzIHBhcnQgb2YgRmVhdGhlciAoTUlUKS4gQWxsIG90aGVyIGNvcHlyaWdodCAoYykgZm9yIEx1Y2lkZSBhcmUgaGVsZCBieSBMdWNpZGUgQ29udHJpYnV0b3JzIDIwMjUuXG4gKlxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTXG4gKiBXSVRIIFJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GXG4gKiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUlxuICogQU5ZIFNQRUNJQUwsIERJUkVDVCwgSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFU1xuICogV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTSBMT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOXG4gKiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1IgT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRlxuICogT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1IgUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cbiAqXG4gKiAtLS1cbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMyBDb2xlIEJlbWlzXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqXG4gKi9cbmltcG9ydCBJY29uIGZyb20gJy4uL0ljb24uc3ZlbHRlJztcbmNvbnN0IGljb25Ob2RlID0gW1tcInBhdGhcIiwgeyBcImRcIjogXCJNMjEgMTAuNjU2VjE5YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmgxMi4zNDRcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIm05IDExIDMgM0wyMiA0XCIgfV1dO1xuLyoqXG4gKiBAY29tcG9uZW50IEBuYW1lIFNxdWFyZUNoZWNrQmlnXG4gKiBAZGVzY3JpcHRpb24gTHVjaWRlIFNWRyBpY29uIGNvbXBvbmVudCwgcmVuZGVycyBTVkcgRWxlbWVudCB3aXRoIGNoaWxkcmVuLlxuICpcbiAqIEBwcmV2aWV3ICFbaW1nXShkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBITjJaeUFnZUcxc2JuTTlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5Mekl3TURBdmMzWm5JZ29nSUhkcFpIUm9QU0l5TkNJS0lDQm9aV2xuYUhROUlqSTBJZ29nSUhacFpYZENiM2c5SWpBZ01DQXlOQ0F5TkNJS0lDQm1hV3hzUFNKdWIyNWxJZ29nSUhOMGNtOXJaVDBpSXpBd01DSWdjM1I1YkdVOUltSmhZMnRuY205MWJtUXRZMjlzYjNJNklDTm1abVk3SUdKdmNtUmxjaTF5WVdScGRYTTZJREp3ZUNJS0lDQnpkSEp2YTJVdGQybGtkR2c5SWpJaUNpQWdjM1J5YjJ0bExXeHBibVZqWVhBOUluSnZkVzVrSWdvZ0lITjBjbTlyWlMxc2FXNWxhbTlwYmowaWNtOTFibVFpQ2o0S0lDQThjR0YwYUNCa1BTSk5NakVnTVRBdU5qVTJWakU1WVRJZ01pQXdJREFnTVMweUlESklOV0V5SURJZ01DQXdJREV0TWkweVZqVmhNaUF5SURBZ01DQXhJREl0TW1neE1pNHpORFFpSUM4K0NpQWdQSEJoZEdnZ1pEMGliVGtnTVRFZ015QXpUREl5SURRaUlDOCtDand2YzNablBnbz0pIC0gaHR0cHM6Ly9sdWNpZGUuZGV2L2ljb25zL3NxdWFyZS1jaGVjay1iaWdcbiAqIEBzZWUgaHR0cHM6Ly9sdWNpZGUuZGV2L2d1aWRlL3BhY2thZ2VzL2x1Y2lkZS1zdmVsdGUgLSBEb2N1bWVudGF0aW9uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzIC0gTHVjaWRlIGljb25zIHByb3BzIGFuZCBhbnkgdmFsaWQgU1ZHIGF0dHJpYnV0ZVxuICogQHJldHVybnMge0Z1bmN0aW9uYWxDb21wb25lbnR9IFN2ZWx0ZSBjb21wb25lbnRcbiAqXG4gKi9cbjwvc2NyaXB0PlxuXG48SWNvbiBuYW1lPVwic3F1YXJlLWNoZWNrLWJpZ1wiIHsuLi4kJHByb3BzfSBpY29uTm9kZT17aWNvbk5vZGV9PlxuICA8c2xvdC8+XG48L0ljb24+XG4iLCI8c2NyaXB0Pi8qKlxuICogQGxpY2Vuc2UgbHVjaWRlLXN2ZWx0ZSB2MC41NTUuMCAtIElTQ1xuICpcbiAqIElTQyBMaWNlbnNlXG4gKlxuICogQ29weXJpZ2h0IChjKSBmb3IgcG9ydGlvbnMgb2YgTHVjaWRlIGFyZSBoZWxkIGJ5IENvbGUgQmVtaXMgMjAxMy0yMDIzIGFzIHBhcnQgb2YgRmVhdGhlciAoTUlUKS4gQWxsIG90aGVyIGNvcHlyaWdodCAoYykgZm9yIEx1Y2lkZSBhcmUgaGVsZCBieSBMdWNpZGUgQ29udHJpYnV0b3JzIDIwMjUuXG4gKlxuICogUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XG4gKiBwdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlXG4gKiBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTXG4gKiBXSVRIIFJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GXG4gKiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUlxuICogQU5ZIFNQRUNJQUwsIERJUkVDVCwgSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFU1xuICogV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTSBMT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOXG4gKiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1IgT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRlxuICogT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1IgUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cbiAqXG4gKiAtLS1cbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVCkgKGZvciBwb3J0aW9ucyBkZXJpdmVkIGZyb20gRmVhdGhlcilcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyMyBDb2xlIEJlbWlzXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqXG4gKi9cbmltcG9ydCBJY29uIGZyb20gJy4uL0ljb24uc3ZlbHRlJztcbmNvbnN0IGljb25Ob2RlID0gW1tcInJlY3RcIiwgeyBcIndpZHRoXCI6IFwiMThcIiwgXCJoZWlnaHRcIjogXCIxOFwiLCBcInhcIjogXCIzXCIsIFwieVwiOiBcIjNcIiwgXCJyeFwiOiBcIjJcIiB9XV07XG4vKipcbiAqIEBjb21wb25lbnQgQG5hbWUgU3F1YXJlXG4gKiBAZGVzY3JpcHRpb24gTHVjaWRlIFNWRyBpY29uIGNvbXBvbmVudCwgcmVuZGVycyBTVkcgRWxlbWVudCB3aXRoIGNoaWxkcmVuLlxuICpcbiAqIEBwcmV2aWV3ICFbaW1nXShkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBITjJaeUFnZUcxc2JuTTlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5Mekl3TURBdmMzWm5JZ29nSUhkcFpIUm9QU0l5TkNJS0lDQm9aV2xuYUhROUlqSTBJZ29nSUhacFpYZENiM2c5SWpBZ01DQXlOQ0F5TkNJS0lDQm1hV3hzUFNKdWIyNWxJZ29nSUhOMGNtOXJaVDBpSXpBd01DSWdjM1I1YkdVOUltSmhZMnRuY205MWJtUXRZMjlzYjNJNklDTm1abVk3SUdKdmNtUmxjaTF5WVdScGRYTTZJREp3ZUNJS0lDQnpkSEp2YTJVdGQybGtkR2c5SWpJaUNpQWdjM1J5YjJ0bExXeHBibVZqWVhBOUluSnZkVzVrSWdvZ0lITjBjbTlyWlMxc2FXNWxhbTlwYmowaWNtOTFibVFpQ2o0S0lDQThjbVZqZENCM2FXUjBhRDBpTVRnaUlHaGxhV2RvZEQwaU1UZ2lJSGc5SWpNaUlIazlJak1pSUhKNFBTSXlJaUF2UGdvOEwzTjJaejRLKSAtIGh0dHBzOi8vbHVjaWRlLmRldi9pY29ucy9zcXVhcmVcbiAqIEBzZWUgaHR0cHM6Ly9sdWNpZGUuZGV2L2d1aWRlL3BhY2thZ2VzL2x1Y2lkZS1zdmVsdGUgLSBEb2N1bWVudGF0aW9uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzIC0gTHVjaWRlIGljb25zIHByb3BzIGFuZCBhbnkgdmFsaWQgU1ZHIGF0dHJpYnV0ZVxuICogQHJldHVybnMge0Z1bmN0aW9uYWxDb21wb25lbnR9IFN2ZWx0ZSBjb21wb25lbnRcbiAqXG4gKi9cbjwvc2NyaXB0PlxuXG48SWNvbiBuYW1lPVwic3F1YXJlXCIgey4uLiQkcHJvcHN9IGljb25Ob2RlPXtpY29uTm9kZX0+XG4gIDxzbG90Lz5cbjwvSWNvbj5cbiIsIjxzY3JpcHQ+LyoqXG4gKiBAbGljZW5zZSBsdWNpZGUtc3ZlbHRlIHYwLjU1NS4wIC0gSVNDXG4gKlxuICogSVNDIExpY2Vuc2VcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIGZvciBwb3J0aW9ucyBvZiBMdWNpZGUgYXJlIGhlbGQgYnkgQ29sZSBCZW1pcyAyMDEzLTIwMjMgYXMgcGFydCBvZiBGZWF0aGVyIChNSVQpLiBBbGwgb3RoZXIgY29weXJpZ2h0IChjKSBmb3IgTHVjaWRlIGFyZSBoZWxkIGJ5IEx1Y2lkZSBDb250cmlidXRvcnMgMjAyNS5cbiAqXG4gKiBQZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcbiAqIHB1cnBvc2Ugd2l0aCBvciB3aXRob3V0IGZlZSBpcyBoZXJlYnkgZ3JhbnRlZCwgcHJvdmlkZWQgdGhhdCB0aGUgYWJvdmVcbiAqIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2UgYXBwZWFyIGluIGFsbCBjb3BpZXMuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVNcbiAqIFdJVEggUkVHQVJEIFRPIFRISVMgU09GVFdBUkUgSU5DTFVESU5HIEFMTCBJTVBMSUVEIFdBUlJBTlRJRVMgT0ZcbiAqIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUy4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUiBCRSBMSUFCTEUgRk9SXG4gKiBBTlkgU1BFQ0lBTCwgRElSRUNULCBJTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTXG4gKiBXSEFUU09FVkVSIFJFU1VMVElORyBGUk9NIExPU1MgT0YgVVNFLCBEQVRBIE9SIFBST0ZJVFMsIFdIRVRIRVIgSU4gQU5cbiAqIEFDVElPTiBPRiBDT05UUkFDVCwgTkVHTElHRU5DRSBPUiBPVEhFUiBUT1JUSU9VUyBBQ1RJT04sIEFSSVNJTkcgT1VUIE9GXG4gKiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUiBQRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxuICpcbiAqIC0tLVxuICpcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKSAoZm9yIHBvcnRpb25zIGRlcml2ZWQgZnJvbSBGZWF0aGVyKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMy0yMDIzIENvbGUgQmVtaXNcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICpcbiAqL1xuaW1wb3J0IEljb24gZnJvbSAnLi4vSWNvbi5zdmVsdGUnO1xuY29uc3QgaWNvbk5vZGUgPSBbW1wicGF0aFwiLCB7IFwiZFwiOiBcIk0xOCA2IDYgMThcIiB9XSwgW1wicGF0aFwiLCB7IFwiZFwiOiBcIm02IDYgMTIgMTJcIiB9XV07XG4vKipcbiAqIEBjb21wb25lbnQgQG5hbWUgWFxuICogQGRlc2NyaXB0aW9uIEx1Y2lkZSBTVkcgaWNvbiBjb21wb25lbnQsIHJlbmRlcnMgU1ZHIEVsZW1lbnQgd2l0aCBjaGlsZHJlbi5cbiAqXG4gKiBAcHJldmlldyAhW2ltZ10oZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlBZ2VHMXNibk05SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpJd01EQXZjM1puSWdvZ0lIZHBaSFJvUFNJeU5DSUtJQ0JvWldsbmFIUTlJakkwSWdvZ0lIWnBaWGRDYjNnOUlqQWdNQ0F5TkNBeU5DSUtJQ0JtYVd4c1BTSnViMjVsSWdvZ0lITjBjbTlyWlQwaUl6QXdNQ0lnYzNSNWJHVTlJbUpoWTJ0bmNtOTFibVF0WTI5c2IzSTZJQ05tWm1ZN0lHSnZjbVJsY2kxeVlXUnBkWE02SURKd2VDSUtJQ0J6ZEhKdmEyVXRkMmxrZEdnOUlqSWlDaUFnYzNSeWIydGxMV3hwYm1WallYQTlJbkp2ZFc1a0lnb2dJSE4wY205clpTMXNhVzVsYW05cGJqMGljbTkxYm1RaUNqNEtJQ0E4Y0dGMGFDQmtQU0pOTVRnZ05pQTJJREU0SWlBdlBnb2dJRHh3WVhSb0lHUTlJbTAySURZZ01USWdNVElpSUM4K0Nqd3ZjM1puUGdvPSkgLSBodHRwczovL2x1Y2lkZS5kZXYvaWNvbnMveFxuICogQHNlZSBodHRwczovL2x1Y2lkZS5kZXYvZ3VpZGUvcGFja2FnZXMvbHVjaWRlLXN2ZWx0ZSAtIERvY3VtZW50YXRpb25cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcHMgLSBMdWNpZGUgaWNvbnMgcHJvcHMgYW5kIGFueSB2YWxpZCBTVkcgYXR0cmlidXRlXG4gKiBAcmV0dXJucyB7RnVuY3Rpb25hbENvbXBvbmVudH0gU3ZlbHRlIGNvbXBvbmVudFxuICpcbiAqL1xuPC9zY3JpcHQ+XG5cbjxJY29uIG5hbWU9XCJ4XCIgey4uLiQkcHJvcHN9IGljb25Ob2RlPXtpY29uTm9kZX0+XG4gIDxzbG90Lz5cbjwvSWNvbj5cbiIsIjxzY3JpcHQgbGFuZz1cInRzXCI+XG4gIGltcG9ydCB7IFgsIERvd25sb2FkLCBTZWFyY2gsIEZpbHRlciwgR3JpZCwgTGlzdCwgQ2hlY2tTcXVhcmUsIFNxdWFyZSwgSW1hZ2UgYXMgSW1hZ2VJY29uIH0gZnJvbSAnbHVjaWRlLXN2ZWx0ZSc7XG5cbiAgZXhwb3J0IGxldCBpbWFnZXM6IGFueVtdID0gW107XG4gIGV4cG9ydCBsZXQgb25DbG9zZTogKCkgPT4gdm9pZDtcblxuICBsZXQgc2VhcmNoVGVybSA9ICcnO1xuICBsZXQgc2VsZWN0ZWRDYXRlZ29yeSA9ICflhajpg6gnO1xuICBsZXQgdmlld01vZGUgPSAnZ3JpZCc7IC8vIGdyaWQgb3IgbGlzdFxuICBsZXQgc2VsZWN0ZWRJbWFnZXMgPSBuZXcgU2V0KCk7XG5cbiAgLy8g6I635Y+W5omA5pyJ5YiG57G7XG4gICQ6IGNhdGVnb3JpZXMgPSBbJ+WFqOmDqCcsIC4uLm5ldyBTZXQoaW1hZ2VzLm1hcChpbWcgPT4gaW1nLmNhdGVnb3J5KSldO1xuXG4gIC8vIOi/h+a7pOWbvueJh1xuICAkOiBmaWx0ZXJlZEltYWdlcyA9IGltYWdlcy5maWx0ZXIoaW1nID0+IHtcbiAgICBjb25zdCBtYXRjaGVzU2VhcmNoID0gaW1nLmFsdC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHNlYXJjaFRlcm0udG9Mb3dlckNhc2UoKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaW1nLnNyYy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHNlYXJjaFRlcm0udG9Mb3dlckNhc2UoKSk7XG4gICAgY29uc3QgbWF0Y2hlc0NhdGVnb3J5ID0gc2VsZWN0ZWRDYXRlZ29yeSA9PT0gJ+WFqOmDqCcgfHwgaW1nLmNhdGVnb3J5ID09PSBzZWxlY3RlZENhdGVnb3J5O1xuICAgIHJldHVybiBtYXRjaGVzU2VhcmNoICYmIG1hdGNoZXNDYXRlZ29yeTtcbiAgfSk7XG5cbiAgLy8g5oyJ5YiG57G75YiG57uE5Zu+54mHXG4gICQ6IGdyb3VwZWRJbWFnZXMgPSBmaWx0ZXJlZEltYWdlcy5yZWR1Y2UoKGFjYywgaW1nKSA9PiB7XG4gICAgaWYgKCFhY2NbaW1nLmNhdGVnb3J5XSkge1xuICAgICAgYWNjW2ltZy5jYXRlZ29yeV0gPSBbXTtcbiAgICB9XG4gICAgYWNjW2ltZy5jYXRlZ29yeV0ucHVzaChpbWcpO1xuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICAvLyDpgInmi6kv5Y+W5raI6YCJ5oup5Zu+54mHXG4gIGZ1bmN0aW9uIHRvZ2dsZUltYWdlU2VsZWN0aW9uKGltYWdlSW5kZXg6IG51bWJlcikge1xuICAgIGlmIChzZWxlY3RlZEltYWdlcy5oYXMoaW1hZ2VJbmRleCkpIHtcbiAgICAgIHNlbGVjdGVkSW1hZ2VzLmRlbGV0ZShpbWFnZUluZGV4KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZWN0ZWRJbWFnZXMuYWRkKGltYWdlSW5kZXgpO1xuICAgIH1cbiAgICBzZWxlY3RlZEltYWdlcyA9IHNlbGVjdGVkSW1hZ2VzOyAvLyDop6blj5Hlk43lupTlvI/mm7TmlrBcbiAgfVxuXG4gIC8vIOWFqOmAiS/lj5bmtojlhajpgIlcbiAgZnVuY3Rpb24gdG9nZ2xlU2VsZWN0QWxsKCkge1xuICAgIGlmIChzZWxlY3RlZEltYWdlcy5zaXplID09PSBmaWx0ZXJlZEltYWdlcy5sZW5ndGgpIHtcbiAgICAgIHNlbGVjdGVkSW1hZ2VzLmNsZWFyKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbHRlcmVkSW1hZ2VzLmZvckVhY2goKGltZywgaW5kZXgpID0+IHtcbiAgICAgICAgc2VsZWN0ZWRJbWFnZXMuYWRkKGltZy5pbmRleCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgc2VsZWN0ZWRJbWFnZXMgPSBzZWxlY3RlZEltYWdlcztcbiAgfVxuXG4gIC8vIOS4i+i9veWNleS4quWbvueJh1xuICBhc3luYyBmdW5jdGlvbiBkb3dubG9hZEltYWdlKGltYWdlOiBhbnkpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgIGxpbmsuaHJlZiA9IGltYWdlLnNyYztcbiAgICAgIGxpbmsuZG93bmxvYWQgPSBgJHtpbWFnZS5hbHQgfHwgJ2ltYWdlJ31fJHtpbWFnZS5pbmRleH0uanBnYDtcbiAgICAgIGxpbmsudGFyZ2V0ID0gJ19ibGFuayc7XG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpbmspO1xuICAgICAgbGluay5jbGljaygpO1xuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChsaW5rKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign5LiL6L295aSx6LSlOicsIGVycm9yKTtcbiAgICAgIC8vIOWkjeWItuWIsOWJqui0tOadv+S9nOS4uuWkh+mAieaWueahiFxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoaW1hZ2Uuc3JjKS50aGVuKCgpID0+IHtcbiAgICAgICAgYWxlcnQoJ+WbvueJh+mTvuaOpeW3suWkjeWItuWIsOWJqui0tOadvycpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8g5om56YeP5LiL6L296YCJ5Lit55qE5Zu+54mHXG4gIGFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkU2VsZWN0ZWRJbWFnZXMoKSB7XG4gICAgY29uc3Qgc2VsZWN0ZWRJbWFnZXNEYXRhID0gaW1hZ2VzLmZpbHRlcihpbWcgPT4gc2VsZWN0ZWRJbWFnZXMuaGFzKGltZy5pbmRleCkpO1xuXG4gICAgaWYgKHNlbGVjdGVkSW1hZ2VzRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgIGFsZXJ0KCfor7flhYjpgInmi6nopoHkuIvovb3nmoTlm77niYcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGltYWdlIG9mIHNlbGVjdGVkSW1hZ2VzRGF0YSkge1xuICAgICAgYXdhaXQgZG93bmxvYWRJbWFnZShpbWFnZSk7XG4gICAgICAvLyDmt7vliqDlu7bov5/pgb/lhY3mtY/op4jlmajpmLvmraLlpJrkuKrkuIvovb1cbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MDApKTtcbiAgICB9XG4gIH1cblxuICAvLyDlpI3liLbmiYDmnInlm77niYfpk77mjqVcbiAgZnVuY3Rpb24gY29weUFsbExpbmtzKCkge1xuICAgIGNvbnN0IGxpbmtzID0gZmlsdGVyZWRJbWFnZXMubWFwKGltZyA9PiBpbWcuc3JjKS5qb2luKCdcXG4nKTtcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChsaW5rcykudGhlbigoKSA9PiB7XG4gICAgICBhbGVydChg5bey5aSN5Yi2ICR7ZmlsdGVyZWRJbWFnZXMubGVuZ3RofSDkuKrlm77niYfpk77mjqXliLDliarotLTmnb9gKTtcbiAgICB9KTtcbiAgfVxuPC9zY3JpcHQ+XG5cbjwhLS0g6YGu572p5bGCIC0tPlxuPGRpdiBjbGFzcz1cImZpeGVkIGluc2V0LTAgYmctYmxhY2svNTAgYmFja2Ryb3AtYmx1ci1zbSB6LXBhbmVsLWJhY2tkcm9wIGFuaW1hdGUtZmFkZS1pblwiIG9uOmNsaWNrPXtvbkNsb3NlfT48L2Rpdj5cblxuPCEtLSDkuLvpnaLmnb8gLS0+XG48ZGl2IGNsYXNzPVwiZml4ZWQgcmlnaHQtMCB0b3AtMCBoLWZ1bGwgdy05NiBiZy13aGl0ZSBzaGFkb3ctMnhsIHotcGFuZWwtbWFpbiBhbmltYXRlLXNsaWRlLWluLXJpZ2h0IG92ZXJmbG93LWhpZGRlbiBmbGV4IGZsZXgtY29sXCI+XG4gIDwhLS0g5aS06YOoIC0tPlxuICA8ZGl2IGNsYXNzPVwiZ3JhZGllbnQtcHJpbWFyeSB0ZXh0LXdoaXRlIHAtNCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICA8ZGl2IGNsYXNzPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yXCI+XG4gICAgICA8SW1hZ2UgY2xhc3M9XCJ3LTUgaC01XCIgLz5cbiAgICAgIDxoMiBjbGFzcz1cInRleHQtbGcgZm9udC1zZW1pYm9sZFwiPuWbvueJh+euoeeQhuWZqDwvaDI+XG4gICAgICA8c3BhbiBjbGFzcz1cImJnLXdoaXRlLzIwIHB4LTIgcHktMSByb3VuZGVkLWZ1bGwgdGV4dC14c1wiPlxuICAgICAgICB7ZmlsdGVyZWRJbWFnZXMubGVuZ3RofSDlvKBcbiAgICAgIDwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgICA8YnV0dG9uXG4gICAgICBvbjpjbGljaz17b25DbG9zZX1cbiAgICAgIGNsYXNzPVwiaG92ZXI6Ymctd2hpdGUvMjAgcC0xIHJvdW5kZWQtbGcgdHJhbnNpdGlvbi1jb2xvcnNcIlxuICAgID5cbiAgICAgIDxYIGNsYXNzPVwidy01IGgtNVwiIC8+XG4gICAgPC9idXR0b24+XG4gIDwvZGl2PlxuXG4gIDwhLS0g5pCc57Si5ZKM562b6YCJ5qCPIC0tPlxuICA8ZGl2IGNsYXNzPVwicC00IGJvcmRlci1iIGJvcmRlci1ncmF5LTIwMCBzcGFjZS15LTNcIj5cbiAgICA8IS0tIOaQnOe0ouahhiAtLT5cbiAgICA8ZGl2IGNsYXNzPVwicmVsYXRpdmVcIj5cbiAgICAgIDxTZWFyY2ggY2xhc3M9XCJhYnNvbHV0ZSBsZWZ0LTMgdG9wLTEvMiB0cmFuc2Zvcm0gLXRyYW5zbGF0ZS15LTEvMiB0ZXh0LWdyYXktNDAwIHctNCBoLTRcIiAvPlxuICAgICAgPGlucHV0XG4gICAgICAgIHR5cGU9XCJ0ZXh0XCJcbiAgICAgICAgYmluZDp2YWx1ZT17c2VhcmNoVGVybX1cbiAgICAgICAgcGxhY2Vob2xkZXI9XCLmkJzntKLlm77niYcuLi5cIlxuICAgICAgICBjbGFzcz1cInctZnVsbCBwbC0xMCBwci00IHB5LTIgYm9yZGVyIGJvcmRlci1ncmF5LTIwMCByb3VuZGVkLWxnIGZvY3VzOm91dGxpbmUtbm9uZSBmb2N1czpyaW5nLTIgZm9jdXM6cmluZy1wcmltYXJ5LTUwMCBmb2N1czpib3JkZXItdHJhbnNwYXJlbnRcIlxuICAgICAgLz5cbiAgICA8L2Rpdj5cblxuICAgIDwhLS0g5YiG57G7562b6YCJIC0tPlxuICAgIDxkaXYgY2xhc3M9XCJmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTIgb3ZlcmZsb3cteC1hdXRvXCI+XG4gICAgICB7I2VhY2ggY2F0ZWdvcmllcyBhcyBjYXRlZ29yeX1cbiAgICAgICAgPGJ1dHRvblxuICAgICAgICAgIG9uOmNsaWNrPXsoKSA9PiBzZWxlY3RlZENhdGVnb3J5ID0gY2F0ZWdvcnl9XG4gICAgICAgICAgY2xhc3M9XCJweC0zIHB5LTEgcm91bmRlZC1mdWxsIHRleHQtc20gd2hpdGVzcGFjZS1ub3dyYXAgdHJhbnNpdGlvbi1jb2xvcnNcbiAgICAgICAgICAgICAgICAge3NlbGVjdGVkQ2F0ZWdvcnkgPT09IGNhdGVnb3J5XG4gICAgICAgICAgICAgICAgICAgPyAnYmctcHJpbWFyeS01MDAgdGV4dC13aGl0ZSdcbiAgICAgICAgICAgICAgICAgICA6ICdiZy1ncmF5LTEwMCB0ZXh0LWdyYXktNzAwIGhvdmVyOmJnLWdyYXktMjAwJ31cIlxuICAgICAgICA+XG4gICAgICAgICAge2NhdGVnb3J5fVxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgIHsvZWFjaH1cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG5cbiAgPCEtLSDmk43kvZzmoI8gLS0+XG4gIDxkaXYgY2xhc3M9XCJwLTQgYm9yZGVyLWIgYm9yZGVyLWdyYXktMjAwIGJnLWdyYXktNTBcIj5cbiAgICA8ZGl2IGNsYXNzPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yXCI+XG4gICAgICAgIDxidXR0b25cbiAgICAgICAgICBvbjpjbGljaz17dG9nZ2xlU2VsZWN0QWxsfVxuICAgICAgICAgIGNsYXNzPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0xIHRleHQtc20gdGV4dC1ncmF5LTYwMCBob3Zlcjp0ZXh0LXByaW1hcnktNjAwIHRyYW5zaXRpb24tY29sb3JzXCJcbiAgICAgICAgPlxuICAgICAgICAgIHsjaWYgc2VsZWN0ZWRJbWFnZXMuc2l6ZSA9PT0gZmlsdGVyZWRJbWFnZXMubGVuZ3RoICYmIGZpbHRlcmVkSW1hZ2VzLmxlbmd0aCA+IDB9XG4gICAgICAgICAgICA8Q2hlY2tTcXVhcmUgY2xhc3M9XCJ3LTQgaC00XCIgLz5cbiAgICAgICAgICAgIDxzcGFuPuWPlua2iOWFqOmAiTwvc3Bhbj5cbiAgICAgICAgICB7OmVsc2V9XG4gICAgICAgICAgICA8U3F1YXJlIGNsYXNzPVwidy00IGgtNFwiIC8+XG4gICAgICAgICAgICA8c3Bhbj7lhajpgIk8L3NwYW4+XG4gICAgICAgICAgey9pZn1cbiAgICAgICAgPC9idXR0b24+XG5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXNtIHRleHQtZ3JheS01MDBcIj5cbiAgICAgICAgICDlt7LpgIkge3NlbGVjdGVkSW1hZ2VzLnNpemV9IOW8oFxuICAgICAgICA8L3NwYW4+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIHNwYWNlLXgtMlwiPlxuICAgICAgICA8IS0tIOinhuWbvuWIh+aNoiAtLT5cbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIGJnLWdyYXktMjAwIHJvdW5kZWQtbGcgcC0xXCI+XG4gICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgb246Y2xpY2s9eygpID0+IHZpZXdNb2RlID0gJ2dyaWQnfVxuICAgICAgICAgICAgY2xhc3M9XCJwLTEgcm91bmRlZCB7dmlld01vZGUgPT09ICdncmlkJyA/ICdiZy13aGl0ZSBzaGFkb3ctc20nIDogJyd9XCJcbiAgICAgICAgICA+XG4gICAgICAgICAgICA8R3JpZCBjbGFzcz1cInctNCBoLTRcIiAvPlxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uOmNsaWNrPXsoKSA9PiB2aWV3TW9kZSA9ICdsaXN0J31cbiAgICAgICAgICAgIGNsYXNzPVwicC0xIHJvdW5kZWQge3ZpZXdNb2RlID09PSAnbGlzdCcgPyAnYmctd2hpdGUgc2hhZG93LXNtJyA6ICcnfVwiXG4gICAgICAgICAgPlxuICAgICAgICAgICAgPExpc3QgY2xhc3M9XCJ3LTQgaC00XCIgLz5cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPCEtLSDmibnph4/mk43kvZwgLS0+XG4gICAgICAgIHsjaWYgc2VsZWN0ZWRJbWFnZXMuc2l6ZSA+IDB9XG4gICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgb246Y2xpY2s9e2Rvd25sb2FkU2VsZWN0ZWRJbWFnZXN9XG4gICAgICAgICAgICBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIHNwYWNlLXgtMSBiZy1ncmVlbi01MDAgdGV4dC13aGl0ZSBweC0zIHB5LTEgcm91bmRlZC1sZyB0ZXh0LXNtIGhvdmVyOmJnLWdyZWVuLTYwMCB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgPlxuICAgICAgICAgICAgPERvd25sb2FkIGNsYXNzPVwidy00IGgtNFwiIC8+XG4gICAgICAgICAgICA8c3Bhbj7kuIvovb3pgInkuK08L3NwYW4+XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgIHsvaWZ9XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG5cbiAgPCEtLSDlm77niYfliJfooaggLS0+XG4gIDxkaXYgY2xhc3M9XCJmbGV4LTEgb3ZlcmZsb3cteS1hdXRvIHAtNFwiPlxuICAgIHsjaWYgT2JqZWN0LmtleXMoZ3JvdXBlZEltYWdlcykubGVuZ3RoID09PSAwfVxuICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHB5LTggdGV4dC1ncmF5LTUwMFwiPlxuICAgICAgICA8SW1hZ2VJY29uIGNsYXNzPVwidy0xMiBoLTEyIG14LWF1dG8gbWItMyBvcGFjaXR5LTUwXCIgLz5cbiAgICAgICAgPHA+5pqC5peg5Zu+54mHPC9wPlxuICAgICAgPC9kaXY+XG4gICAgezplbHNlfVxuICAgICAgeyNlYWNoIE9iamVjdC5lbnRyaWVzKGdyb3VwZWRJbWFnZXMpIGFzIFtjYXRlZ29yeSwgY2F0ZWdvcnlJbWFnZXNdfVxuICAgICAgICA8ZGl2IGNsYXNzPVwibWItNlwiPlxuICAgICAgICAgIDxoMyBjbGFzcz1cInRleHQtc20gZm9udC1zZW1pYm9sZCB0ZXh0LWdyYXktNzAwIG1iLTMgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICA8c3Bhbj57Y2F0ZWdvcnl9PC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXhzIHRleHQtZ3JheS01MDBcIj4oe2NhdGVnb3J5SW1hZ2VzLmxlbmd0aH3lvKApPC9zcGFuPlxuICAgICAgICAgIDwvaDM+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwic3BhY2UteS0yIHt2aWV3TW9kZSA9PT0gJ2dyaWQnID8gJ2dyaWQgZ3JpZC1jb2xzLTIgZ2FwLTInIDogJyd9XCI+XG4gICAgICAgICAgICB7I2VhY2ggY2F0ZWdvcnlJbWFnZXMgYXMgaW1hZ2V9XG4gICAgICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgICAgICBjbGFzcz1cImdyb3VwIHJlbGF0aXZlIGJnLXdoaXRlIGJvcmRlciBib3JkZXItZ3JheS0yMDAgcm91bmRlZC1sZyBvdmVyZmxvdy1oaWRkZW4gaG92ZXI6c2hhZG93LW1kIHRyYW5zaXRpb24tYWxsIGR1cmF0aW9uLTIwMFxuICAgICAgICAgICAgICAgICAgICAgICB7dmlld01vZGUgPT09ICdsaXN0JyA/ICdmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTMnIDogJyd9XCJcbiAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIDwhLS0g6YCJ5oup5qGGIC0tPlxuICAgICAgICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgICAgICAgIG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbj17KCkgPT4gdG9nZ2xlSW1hZ2VTZWxlY3Rpb24oaW1hZ2UuaW5kZXgpfVxuICAgICAgICAgICAgICAgICAgY2xhc3M9XCJhYnNvbHV0ZSB0b3AtMiBsZWZ0LTIgei0xMCBiZy13aGl0ZS85MCByb3VuZGVkLWZ1bGwgcC0xIG9wYWNpdHktMCBncm91cC1ob3ZlcjpvcGFjaXR5LTEwMCB0cmFuc2l0aW9uLW9wYWNpdHlcIlxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgIHsjaWYgc2VsZWN0ZWRJbWFnZXMuaGFzKGltYWdlLmluZGV4KX1cbiAgICAgICAgICAgICAgICAgICAgPENoZWNrU3F1YXJlIGNsYXNzPVwidy00IGgtNCB0ZXh0LXByaW1hcnktNTAwXCIgLz5cbiAgICAgICAgICAgICAgICAgIHs6ZWxzZX1cbiAgICAgICAgICAgICAgICAgICAgPFNxdWFyZSBjbGFzcz1cInctNCBoLTQgdGV4dC1ncmF5LTQwMFwiIC8+XG4gICAgICAgICAgICAgICAgICB7L2lmfVxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuXG4gICAgICAgICAgICAgICAgPCEtLSDlm77niYfpooTop4ggLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInt2aWV3TW9kZSA9PT0gJ2xpc3QnID8gJ3ctMTYgaC0xNiBmbGV4LXNocmluay0wJyA6ICdhc3BlY3Qtc3F1YXJlJ30gYmctZ3JheS0xMDBcIj5cbiAgICAgICAgICAgICAgICAgIDxpbWdcbiAgICAgICAgICAgICAgICAgICAgc3JjPXtpbWFnZS5zcmN9XG4gICAgICAgICAgICAgICAgICAgIGFsdD17aW1hZ2UuYWx0fVxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cInctZnVsbCBoLWZ1bGwgb2JqZWN0LWNvdmVyXCJcbiAgICAgICAgICAgICAgICAgICAgbG9hZGluZz1cImxhenlcIlxuICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0g5Zu+54mH5L+h5oGvIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJwLTMgZmxleC0xIG1pbi13LTBcIj5cbiAgICAgICAgICAgICAgICAgIDxwIGNsYXNzPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LWdyYXktOTAwIHRydW5jYXRlXCI+XG4gICAgICAgICAgICAgICAgICAgIHtpbWFnZS5hbHR9XG4gICAgICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICAgICAgICA8cCBjbGFzcz1cInRleHQteHMgdGV4dC1ncmF5LTUwMCBtdC0xXCI+XG4gICAgICAgICAgICAgICAgICAgIHtpbWFnZS53aWR0aH0gw5cge2ltYWdlLmhlaWdodH1cbiAgICAgICAgICAgICAgICAgIDwvcD5cblxuICAgICAgICAgICAgICAgICAgeyNpZiB2aWV3TW9kZSA9PT0gJ2xpc3QnfVxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibXQtMiBmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgICAgICAgICBvbjpjbGljaz17KCkgPT4gZG93bmxvYWRJbWFnZShpbWFnZSl9XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzcz1cInRleHQteHMgYmctcHJpbWFyeS01MDAgdGV4dC13aGl0ZSBweC0yIHB5LTEgcm91bmRlZCBob3ZlcjpiZy1wcmltYXJ5LTYwMCB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICAgICAg5LiL6L29XG4gICAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgey9pZn1cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0g5oKs5YGc5pON5L2cIC0tPlxuICAgICAgICAgICAgICAgIHsjaWYgdmlld01vZGUgPT09ICdncmlkJ31cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhYnNvbHV0ZSBib3R0b20tMiByaWdodC0yIG9wYWNpdHktMCBncm91cC1ob3ZlcjpvcGFjaXR5LTEwMCB0cmFuc2l0aW9uLW9wYWNpdHlcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgIG9uOmNsaWNrPXsoKSA9PiBkb3dubG9hZEltYWdlKGltYWdlKX1cbiAgICAgICAgICAgICAgICAgICAgICBjbGFzcz1cImJnLXByaW1hcnktNTAwIHRleHQtd2hpdGUgcC0xLjUgcm91bmRlZC1sZyBob3ZlcjpiZy1wcmltYXJ5LTYwMCB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgICA8RG93bmxvYWQgY2xhc3M9XCJ3LTQgaC00XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICB7L2lmfVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIHsvZWFjaH1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICB7L2VhY2h9XG4gICAgey9pZn1cbiAgPC9kaXY+XG5cbiAgPCEtLSDlupXpg6jmk43kvZzmoI8gLS0+XG4gIDxkaXYgY2xhc3M9XCJwLTQgYm9yZGVyLXQgYm9yZGVyLWdyYXktMjAwIGJnLWdyYXktNTBcIj5cbiAgICA8ZGl2IGNsYXNzPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICA8YnV0dG9uXG4gICAgICAgIG9uOmNsaWNrPXtjb3B5QWxsTGlua3N9XG4gICAgICAgIGNsYXNzPVwidGV4dC1zbSB0ZXh0LWdyYXktNjAwIGhvdmVyOnRleHQtcHJpbWFyeS02MDAgdHJhbnNpdGlvbi1jb2xvcnNcIlxuICAgICAgPlxuICAgICAgICDlpI3liLbmiYDmnInpk77mjqVcbiAgICAgIDwvYnV0dG9uPlxuXG4gICAgICA8c3BhbiBjbGFzcz1cInRleHQteHMgdGV4dC1ncmF5LTUwMFwiPlxuICAgICAgICDlhbEge2ltYWdlcy5sZW5ndGh9IOW8oOWbvueJh1xuICAgICAgPC9zcGFuPlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbjwvZGl2PiIsIjxzY3JpcHQgbGFuZz1cInRzXCI+XG4gIGltcG9ydCB7IEltYWdlLCBEb3dubG9hZCwgWCwgQ2hldnJvbkxlZnQgfSBmcm9tICdsdWNpZGUtc3ZlbHRlJztcbiAgaW1wb3J0IEltYWdlUGFuZWwgZnJvbSAnLi9JbWFnZVBhbmVsLnN2ZWx0ZSc7XG5cbiAgbGV0IHNob3dJbWFnZVBhbmVsID0gZmFsc2U7XG4gIGxldCBleHRyYWN0ZWRJbWFnZXM6IGFueVtdID0gW107XG4gIGxldCBpc0V4dHJhY3RpbmcgPSBmYWxzZTtcblxuICAvLyDmj5Dlj5blm77niYflh73mlbBcbiAgYXN5bmMgZnVuY3Rpb24gZXh0cmFjdEltYWdlcygpIHtcbiAgICBpc0V4dHJhY3RpbmcgPSB0cnVlO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIOiOt+WPluaJgOacieWbvueJh+WFg+e0oFxuICAgICAgY29uc3QgYWxsSW1hZ2VzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW1nJyk7XG4gICAgICBjb25zdCBpbWFnZXM6IGFueVtdID0gW107XG5cbiAgICAgIC8vIOWIhuexu+WbvueJh1xuICAgICAgYWxsSW1hZ2VzLmZvckVhY2goKGltZywgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3Qgc3JjID0gaW1nLnNyYyB8fCBpbWcuZ2V0QXR0cmlidXRlKCdkYXRhLXNyYycpIHx8ICcnO1xuICAgICAgICBjb25zdCBhbHQgPSBpbWcuYWx0IHx8IGDlm77niYcgJHtpbmRleCArIDF9YDtcbiAgICAgICAgY29uc3Qgd2lkdGggPSBpbWcubmF0dXJhbFdpZHRoIHx8IGltZy53aWR0aDtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gaW1nLm5hdHVyYWxIZWlnaHQgfHwgaW1nLmhlaWdodDtcblxuICAgICAgICBpZiAoc3JjICYmICFzcmMuaW5jbHVkZXMoJ2RhdGE6aW1hZ2UnKSkge1xuICAgICAgICAgIC8vIOagueaNruWwuuWvuOWSjOS9jee9ruWIpOaWreWbvueJh+exu+Wei1xuICAgICAgICAgIGxldCBjYXRlZ29yeSA9ICflhbbku5blm77niYcnO1xuXG4gICAgICAgICAgLy8g5Li75Zu+77ya6YCa5bi45Zyo5ZWG5ZOB5bGV56S65Yy65Z+f77yM5bC65a+46L6D5aSnXG4gICAgICAgICAgaWYgKHdpZHRoID4gNDAwICYmIGhlaWdodCA+IDQwMCkge1xuICAgICAgICAgICAgY2F0ZWdvcnkgPSAn5ZWG5ZOB5Li75Zu+JztcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8g6K+m5oOF5Zu+77ya5Zyo6K+m5oOF5o+P6L+w5Yy65Z+fXG4gICAgICAgICAgZWxzZSBpZiAoaW1nLmNsb3Nlc3QoJy5kZXRhaWwtY29udGVudCwgLnByb2R1Y3QtZGV0YWlsLCAuZGVzY3JpcHRpb24nKSkge1xuICAgICAgICAgICAgY2F0ZWdvcnkgPSAn5ZWG5ZOB6K+m5oOFJztcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8g6K+E5Lu35Zu+54mH77ya5Zyo6K+E5Lu35Yy65Z+fXG4gICAgICAgICAgZWxzZSBpZiAoaW1nLmNsb3Nlc3QoJy5yZXZpZXcsIC5jb21tZW50LCAucmF0aW5nJykpIHtcbiAgICAgICAgICAgIGNhdGVnb3J5ID0gJ+S5sOWutuivhOS7tyc7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIOe8qeeVpeWbvlxuICAgICAgICAgIGVsc2UgaWYgKHdpZHRoIDwgMTUwICYmIGhlaWdodCA8IDE1MCkge1xuICAgICAgICAgICAgY2F0ZWdvcnkgPSAn57yp55Wl5Zu+JztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpbWFnZXMucHVzaCh7XG4gICAgICAgICAgICBzcmMsXG4gICAgICAgICAgICBhbHQsXG4gICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgIGNhdGVnb3J5LFxuICAgICAgICAgICAgaW5kZXhcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGV4dHJhY3RlZEltYWdlcyA9IGltYWdlcztcbiAgICAgIHNob3dJbWFnZVBhbmVsID0gdHJ1ZTtcblxuICAgICAgLy8g5Y+R6YCB5raI5oGv5YiwY29udGVudCBzY3JpcHRcbiAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgIHR5cGU6ICdJTUFHRVNfRVhUUkFDVEVEJyxcbiAgICAgICAgaW1hZ2VzOiBpbWFnZXNcbiAgICAgIH0sICcqJyk7XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign5o+Q5Y+W5Zu+54mH5aSx6LSlOicsIGVycm9yKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaXNFeHRyYWN0aW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLy8g5YWz6Zet5Zu+54mH6Z2i5p2/XG4gIGZ1bmN0aW9uIGNsb3NlSW1hZ2VQYW5lbCgpIHtcbiAgICBzaG93SW1hZ2VQYW5lbCA9IGZhbHNlO1xuICB9XG5cbiAgLy8g5qOA5p+l5piv5ZCm5Zyo55S15ZWG572R56uZXG4gIGZ1bmN0aW9uIGlzRWNvbW1lcmNlU2l0ZSgpOiBib29sZWFuIHtcbiAgICBjb25zdCBob3N0bmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICBjb25zdCBlY29tbWVyY2VEb21haW5zID0gW1xuICAgICAgJ3Rhb2Jhby5jb20nLCAndG1hbGwuY29tJywgJ2pkLmNvbScsICdhbWF6b24uJyxcbiAgICAgICdzdW5pbmcuY29tJywgJ3BpbmR1b2R1by5jb20nLCAndmlwLmNvbScsXG4gICAgICAnZGFuZ2RhbmcuY29tJywgJ3loZC5jb20nXG4gICAgXTtcblxuICAgIHJldHVybiBlY29tbWVyY2VEb21haW5zLnNvbWUoZG9tYWluID0+IGhvc3RuYW1lLmluY2x1ZGVzKGRvbWFpbikpO1xuICB9XG5cbiAgLy8g5qOA5p+l5piv5ZCm5Zyo5ZWG5ZOB6K+m5oOF6aG1XG4gIGZ1bmN0aW9uIGlzUHJvZHVjdFBhZ2UoKTogYm9vbGVhbiB7XG4gICAgY29uc3QgdXJsID0gd2luZG93LmxvY2F0aW9uLmhyZWY7XG4gICAgY29uc3QgcHJvZHVjdEtleXdvcmRzID0gWydpdGVtJywgJ3Byb2R1Y3QnLCAnZ29vZHMnLCAnZGV0YWlsJ107XG4gICAgY29uc3QgaGFzUHJvZHVjdEtleXdvcmQgPSBwcm9kdWN0S2V5d29yZHMuc29tZShrZXl3b3JkID0+XG4gICAgICB1cmwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhrZXl3b3JkKVxuICAgICk7XG5cbiAgICAvLyDmo4Dmn6XpobXpnaLmmK/lkKbljIXlkKvllYblk4Hnm7jlhbPlhYPntKBcbiAgICBjb25zdCBoYXNQcm9kdWN0RWxlbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgJy5wcmljZSwgLnByb2R1Y3QtcHJpY2UsIC5nb29kcy1wcmljZSwgLnByb2R1Y3QtbmFtZSwgLnByb2R1Y3QtdGl0bGUnXG4gICAgKTtcblxuICAgIHJldHVybiBoYXNQcm9kdWN0S2V5d29yZCB8fCBoYXNQcm9kdWN0RWxlbWVudHM7XG4gIH1cbjwvc2NyaXB0PlxuXG57I2lmIGlzRWNvbW1lcmNlU2l0ZSgpICYmIGlzUHJvZHVjdFBhZ2UoKX1cbiAgPCEtLSDmta7liqjlt6XlhbfmoI8gLS0+XG4gIDxkaXYgY2xhc3M9XCJmaXhlZCB0b3AtMS8yIHJpZ2h0LTQgdHJhbnNmb3JtIC10cmFuc2xhdGUteS0xLzIgei1oaWdoIGFuaW1hdGUtZmFkZS1pblwiPlxuICAgIDxkaXYgY2xhc3M9XCJnbGFzcy1lZmZlY3Qgcm91bmRlZC0yeGwgc2hhZG93LXNvZnQgcC0yIHNwYWNlLXktMlwiPlxuICAgICAgPGJ1dHRvblxuICAgICAgICBvbjpjbGljaz17ZXh0cmFjdEltYWdlc31cbiAgICAgICAgZGlzYWJsZWQ9e2lzRXh0cmFjdGluZ31cbiAgICAgICAgY2xhc3M9XCJncm91cCByZWxhdGl2ZSBncmFkaWVudC1wcmltYXJ5IHRleHQtd2hpdGUgcC0zIHJvdW5kZWQteGwgaG92ZXI6c2hhZG93LWxnIHRyYW5zaXRpb24tYWxsIGR1cmF0aW9uLTMwMCBob3ZlcjpzY2FsZS0xMDUgZGlzYWJsZWQ6b3BhY2l0eS01MCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWRcIlxuICAgICAgICB0aXRsZT1cIuaKk+WPlumhtemdouWbvueJh1wiXG4gICAgICA+XG4gICAgICAgIHsjaWYgaXNFeHRyYWN0aW5nfVxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJhbmltYXRlLXNwaW4gdy01IGgtNSBib3JkZXItMiBib3JkZXItd2hpdGUvMzAgYm9yZGVyLXQtd2hpdGUgcm91bmRlZC1mdWxsXCI+PC9kaXY+XG4gICAgICAgIHs6ZWxzZX1cbiAgICAgICAgICA8SW1hZ2UgY2xhc3M9XCJ3LTUgaC01XCIgLz5cbiAgICAgICAgey9pZn1cblxuICAgICAgICA8IS0tIOaCrOWBnOaPkOekuiAtLT5cbiAgICAgICAgPGRpdiBjbGFzcz1cImFic29sdXRlIHJpZ2h0LWZ1bGwgbXItMiB0b3AtMS8yIHRyYW5zZm9ybSAtdHJhbnNsYXRlLXktMS8yIGJnLWdyYXktOTAwIHRleHQtd2hpdGUgcHgtMyBweS0xIHJvdW5kZWQtbGcgdGV4dC1zbSB3aGl0ZXNwYWNlLW5vd3JhcCBvcGFjaXR5LTAgZ3JvdXAtaG92ZXI6b3BhY2l0eS0xMDAgdHJhbnNpdGlvbi1vcGFjaXR5IGR1cmF0aW9uLTIwMCBwb2ludGVyLWV2ZW50cy1ub25lXCI+XG4gICAgICAgICAge2lzRXh0cmFjdGluZyA/ICfmraPlnKjmipPlj5YuLi4nIDogJ+aKk+WPluWbvueJhyd9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9idXR0b24+XG5cbiAgICAgIHsjaWYgZXh0cmFjdGVkSW1hZ2VzLmxlbmd0aCA+IDB9XG4gICAgICAgIDxidXR0b25cbiAgICAgICAgICBvbjpjbGljaz17KCkgPT4gc2hvd0ltYWdlUGFuZWwgPSB0cnVlfVxuICAgICAgICAgIGNsYXNzPVwicmVsYXRpdmUgYmctZ3JlZW4tNTAwIHRleHQtd2hpdGUgcC0zIHJvdW5kZWQteGwgaG92ZXI6YmctZ3JlZW4tNjAwIGhvdmVyOnNoYWRvdy1sZyB0cmFuc2l0aW9uLWFsbCBkdXJhdGlvbi0zMDAgaG92ZXI6c2NhbGUtMTA1XCJcbiAgICAgICAgICB0aXRsZT1cIuafpeeci+aKk+WPlueahOWbvueJh1wiXG4gICAgICAgID5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgIDxJbWFnZSBjbGFzcz1cInctNSBoLTVcIiAvPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhYnNvbHV0ZSAtdG9wLTEgLXJpZ2h0LTEgYmctcmVkLTUwMCB0ZXh0LXdoaXRlIHRleHQteHMgcm91bmRlZC1mdWxsIHctNCBoLTQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXJcIj5cbiAgICAgICAgICAgICAge2V4dHJhY3RlZEltYWdlcy5sZW5ndGh9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgey9pZn1cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG5cbiAgPCEtLSDlm77niYflsZXnpLrpnaLmnb8gLS0+XG4gIHsjaWYgc2hvd0ltYWdlUGFuZWx9XG4gICAgPEltYWdlUGFuZWxcbiAgICAgIGltYWdlcz17ZXh0cmFjdGVkSW1hZ2VzfVxuICAgICAgb25DbG9zZT17Y2xvc2VJbWFnZVBhbmVsfVxuICAgIC8+XG4gIHsvaWZ9XG57L2lmfVxuXG48c3R5bGUgbGFuZz1cImNzc1wiPlxuICAvKiDnoa7kv53moLflvI/kuI3kuI7pobXpnaLlhrLnqoEgKi9cbiAgOmdsb2JhbCguZml4ZWQpIHtcbiAgICBwb3NpdGlvbjogZml4ZWQgIWltcG9ydGFudDtcbiAgfVxuXG4gIDpnbG9iYWwoLnotaGlnaCkge1xuICAgIHotaW5kZXg6IDEwMDAwICFpbXBvcnRhbnQ7XG4gIH1cbjwvc3R5bGU+Il0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJyb290IiwiVG9vbGJhciIsImV2ZW50IiwiYnJvd3NlciIsIl9icm93c2VyIiwicHJpbnQiLCJsb2dnZXIiLCJlbGVtZW50IiwiYm9sZCIsIm5vcm1hbCIsIncuc3RhdGVfc25hcHNob3RfdW5jbG9uZWFibGUiLCJzb3VyY2UiLCJzdGFjayIsImVmZmVjdCIsImNoaWxkIiwicmVzdWx0IiwidXBkYXRlIiwiZS5lZmZlY3RfdXBkYXRlX2RlcHRoX2V4Y2VlZGVkIiwiZSIsInN0YXRlIiwiaSIsImtleSIsIml0ZW0iLCJpbmRleCIsInJ1biIsInByZXZpb3VzX2JhdGNoIiwibG9jYXRpb24iLCJlLmFzeW5jX2Rlcml2ZWRfb3JwaGFuIiwiZCIsImRlcml2ZWQiLCJlLmRlcml2ZWRfcmVmZXJlbmNlc19zZWxmIiwiZS5zdGF0ZV91bnNhZmVfbXV0YXRpb24iLCJ2ZXJzaW9uIiwicHJvcCIsImUuc3RhdGVfZGVzY3JpcHRvcnNfZml4ZWQiLCJzIiwidmFsdWUiLCJlLnN0YXRlX3Byb3RvdHlwZV9maXhlZCIsIncuc3RhdGVfcHJveHlfZXF1YWxpdHlfbWlzbWF0Y2giLCJlLmVmZmVjdF9vcnBoYW4iLCJlLmVmZmVjdF9pbl91bm93bmVkX2Rlcml2ZWQiLCJlLmVmZmVjdF9pbl90ZWFyZG93biIsInRlYXJkb3duIiwic2libGluZyIsImdldCIsImNhcHR1cmUiLCJ3LmV2ZW50X2hhbmRsZXJfaW52YWxpZCIsImNvbnRlbnQiLCJjbG9uZSIsInRhZyIsImUuc3ZlbHRlX2VsZW1lbnRfaW52YWxpZF90aGlzX3ZhbHVlIiwiZS5zbmlwcGV0X3dpdGhvdXRfcmVuZGVyX3RhZyIsIm9mZnNjcmVlbiIsImJyYW5jaCIsImUucnVuZV9vdXRzaWRlX3N2ZWx0ZSIsImUuY29tcG9uZW50X2FwaV9pbnZhbGlkX25ldyIsImUuY29tcG9uZW50X2FwaV9jaGFuZ2VkIiwiZm4iLCJhbmNob3IiLCJjbHN4IiwiX2Nsc3giLCJ3LnNlbGVjdF9tdWx0aXBsZV9pbnZhbGlkX3ZhbHVlIiwiaW5wdXQiLCJzZXQiLCJiYXRjaGVzIiwiZS5iaW5kX2ludmFsaWRfY2hlY2tib3hfdmFsdWUiLCJwcm9wcyIsImUucHJvcHNfaW52YWxpZF92YWx1ZSIsIncuY29uc29sZV9sb2dfc3RhdGUiLCIkLnByb3AiLCIkLnN0cmljdF9lcXVhbHMiLCIkLnVudHJhY2siLCIkLmNoaWxkIiwiJC5pbmRleCIsIiQkYW5jaG9yIiwiJC5nZXQiLCIkLmFwcGVuZCIsIiQuc3ByZWFkX3Byb3BzIiwiJC5zZXQiLCJsaW5rIiwiJC5sb2dfaWZfY29udGFpbnNfc3RhdGUiLCIkLnRyYWNrX3JlYWN0aXZpdHlfbG9zcyIsIiQuZmlyc3RfY2hpbGQiLCIkLnNpYmxpbmciLCJyb290XzEiLCIkLnJlc2V0IiwiJC5zZXRfY2xhc3MiLCJDaGVja1NxdWFyZSIsIkdyaWQiLCJyb290XzQiLCIkLmV2ZW50IiwiSW1hZ2VJY29uIiwiJC5zZXRfYXR0cmlidXRlIiwiJC5zdG9wUHJvcGFnYXRpb24iLCIkLm11dGFibGVfc291cmNlIiwiaXNQcm9kdWN0UGFnZSIsIkltYWdlIiwiJC50ZW1wbGF0ZV9lZmZlY3QiLCIkLnNldF90ZXh0Il0sIm1hcHBpbmdzIjoiOztBQUFPLFdBQVMsb0JBQW9CQSxhQUFZO0FBQzlDLFdBQU9BO0FBQUEsRUFDVDtBQ0FBLFFBQUEsYUFBQSxvQkFBQTtBQUFBLElBQW1DLFNBQUE7QUFBQSxNQUN4QjtBQUFBLE1BQ1A7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNGLE9BQUE7QUFFRSxjQUFBLElBQUEsV0FBQTtBQUdBLGVBQUEsa0JBQUE7QUFDRSxZQUFBLFNBQUEsZUFBQSxZQUFBO0FBQ0Usd0JBQUE7QUFBQSxRQUFjLE9BQUE7QUFFZCxpQkFBQSxpQkFBQSxRQUFBLGFBQUE7QUFBQSxRQUE2QztBQUFBLE1BQy9DO0FBSUYs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QUFJOUIsWUFBQSxxQkFBcUIsU0FBUyxjQUNsQyxxRUFBb0U7QUFHL0QsYUFBQSxxQkFBcUI7QUFBQSxJQUM5Qjs7Ozs7Ozs7WUFLQyxNQUFHYixZQUFBLFVBQUE7QUFDRCxZQUFBLGNBREYsR0FBRztBQUVDLFlBQUEsU0FBQVYsTUFERixLQUFHO0FBQ0QsWUFBQSxTQUFBQSxNQUFBLE1BQUE7OztnQkFPSSxRQUFHLE9BQUE7OEJBQUgsS0FBRztBQUFBOztrQ0FFSHdCLFFBQUt0QixXQUFBLEVBQUEsT0FBQSxVQUFBLENBQUEsR0FBQSxhQUFBLFNBQUEsS0FBQSxJQUFBLEVBQUEsY0FBQSxRQUFBLENBQUE7QUFBQTs7O3NCQUhILFlBQVksRUFBQSxVQUFBLFVBQUE7QUFBQSxrQkFBQSxVQUFBLFdBQUEsS0FBQTtBQUFBOzs7Ozs7O1lBT2hCLFFBQUdTLFFBQUEsUUFBQSxDQUFBO3lCQUFILEtBQUc7QUFiTCxZQUFBLFNBQUFBLFFBQUEsUUFBQSxDQUFBOzs7QUFtQkUsZ0JBQUEsV0FBQSxPQUFBO0FBS0UsZ0JBQUEsUUFBR1gsTUFMTCxRQUFBOytCQUtFLEtBQUc7a0NBQ0R3QixRQUFLLFFBQUEsRUFBQSxPQUFBLFVBQUEsQ0FBQSxHQUFBLGFBQUEsU0FBQSxLQUFBLElBQUEsRUFBQSxjQUFBLFFBQUEsQ0FBQTtnQkFDTCxPQUFJYixRQUFBLFFBQUEsQ0FBQTsrQkFBSixJQUFJO0FBQ0ZjLDRCQUFBLE1BQUFDLFNBQUEsUUFBQXZCLElBQUEsZUFBZSxFQUFDLE1BQU0sQ0FBQTsyQkFSNUIsVUFBQSxNQUFBRyxJQUNpQixnQkFBaUIsSUFBSSxDQUFBO0FBRHRDRixtQkFBQUYsV0FBQSxRQUFBO0FBQUE7OztzQkFERSxlQUFlLEVBQUMsU0FBUyxFQUFDLFVBQUEsWUFBQTtBQUFBOzs7Ozs7OzZCQXBCbEMsS0FBRyxDQUFBOzs7O2NBdUNELE1BQUEsV0FBQUEsV0FBQTtBQUFBOzZCQUNTLGVBQWU7QUFBQTt5QkFDZDtBQUFBOzs7Ozs7Ozs7O3NCQUhSLGNBQWMsRUFBQSxVQUFBLFlBQUE7QUFBQTs7Ozs7Ozs7QUFwQ2QsaUJBQUEsV0FBQUMsSUFFVyxZQUFZOzZCQVluQixZQUFZLElBQUcsWUFBWSxNQUFNO0FBQUE7QUFkckNlLGNBQUEsU0FBQSxRQUNXLGFBQWE7Ozs7O0FBTDFCLGNBQUEsZ0JBQWUsS0FBTUssaUJBQWEsVUFBQSxZQUFBO0FBQUE7Ozs7Ozs7OztFQUZ2Qzs7Ozs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwyLDMsNCw1LDYsNyw4LDksMTAsMTEsMTIsMTMsMTQsMTUsMTYsMTcsMTgsMTksMjAsMjEsMjIsMjMsMjQsMjUsMjYsMjcsMjgsMjksMzAsMzEsMzIsMzMsMzQsMzUsMzYsMzcsMzgsMzksNDAsNDEsNDIsNDMsNDQsNDUsNDYsNDcsNDgsNDksNTAsNTEsNTIsNTMsNTQsNTUsNTYsNTcsNTgsNTksNjAsNjEsNjIsNjMsNjQsNjUsNjYsNjcsNjgsNjksNzAsNzEsNzIsNzMsNzQsNzUsNzZdfQ==
content;