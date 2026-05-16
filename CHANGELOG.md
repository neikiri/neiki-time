# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-05-07

### Added

- Core time synchronization engine with NTP-like round-trip estimation
- Support for multiple public time APIs (WorldTimeAPI, TimeAPI.io)
- High-resolution drift-free ticking via `performance.now()`
- Automatic periodic re-sync (configurable interval)
- Per-element timezone override via `data-neiki-tz` attribute
- Configurable display: date, milliseconds, sync debug info
- Built-in light/dark/auto theme with CSS injection
- UMD module support (script tag, AMD, CommonJS)
- JavaScript API: `init`, `destroy`, `sync`, `now`, `date`, `isSynced`, `getSyncInfo`
- CDN distribution via `cdn.neikiri.dev`
- Live demo page
