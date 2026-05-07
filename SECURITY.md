# Security Policy

## 🛡️ Supported Versions

The following versions of Neiki's Time are currently supported with security updates:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅ Yes     |
| < 1.0   | ❌ No      |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public issue**.

Instead, report it responsibly:

* 📧 Email: **[dev@neiki.eu](mailto:dev@neiki.eu)**
* 💬 Or open a **private GitHub security advisory**

---

## 📋 What to include

Please provide as much detail as possible:

* Description of the vulnerability
* Steps to reproduce
* Browser and version used
* Potential impact

---

## ⏱️ Response Time

* Initial response: **within 48 hours**
* Fix timeline: depends on severity

---

## ⚠️ Scope

Neiki's Time is a **client-side JavaScript library** that runs entirely in the browser. It does not have a backend server or database.

The following areas are considered **in-scope**:

* **XSS / code injection** — malicious input via data attributes or configuration options that could execute arbitrary code
* **CDN integrity** — issues with the hosted files on `cdn.neiki.eu`
* **Time API abuse** — scenarios where manipulated API responses could cause unexpected behavior
* **DOM manipulation** — unintended DOM side effects from the library's rendering logic

The following are **out of scope**:

* Issues in upstream time APIs (report those to WorldTimeAPI / TimeAPI.io)
* Self-hosted deployment configuration (web server, HTTPS, etc.)
* Browser-specific bugs unrelated to the library

---

## 🙏 Responsible Disclosure

We appreciate responsible disclosure and will credit reporters where appropriate.
