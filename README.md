# <picture><img src="./assets/quickbootjs-logo.svg" alt="Quickboot.js" height="32"></picture>

<img alt="" src="https://github.com/naruaway/quickbootjs/assets/2931577/cf3fd6e0-e520-468b-889e-054b21112acc">

Quickboot.js is an **experimental** tool to reduce JS code size beyond tree-shaking. It uses runtime tracing, eval(), and sync XHR with **non trivial trade-offs.**

It's hard to use it in a reliable way at least for now. However, this strategy is already producing interesting results.

As an example, Quickboot.js was able to reduce the JS needed for simple animation demo using React and framer-motion from **202 Kb to 118 Kb**, which is **42%** size reduction 🤯

See the official site for more details and demos: https://quickbootjs.nry.app

## License

Quickboot.js is [MIT licensed](./LICENSE).
