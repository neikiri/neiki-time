import subprocess
import os

# =========================
# KONFIG
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

JS_INPUT = os.path.join(BASE_DIR, "src", "neiki-time.js")
OUTPUT_DIR = os.path.join(BASE_DIR, "dist")
JS_OUTPUT = os.path.join(OUTPUT_DIR, "neiki-time.min.js")

# =========================
# 1️⃣ OUTPUT SLOŽKA
# =========================
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================
# 2️⃣ MINIFIKACE JS (TERSER)
# =========================
print("Minifikuju neiki-time.js přes terser...")

subprocess.run([
    r"C:\Program Files\nodejs\npx.cmd",
    "terser",
    JS_INPUT,
    "-o", JS_OUTPUT,
    "--compress",
    "--mangle"
], check=True)

# =========================
# ✅ HOTOVO
# =========================
input_size = os.path.getsize(JS_INPUT)
output_size = os.path.getsize(JS_OUTPUT)

print(f"\n✅ HOTOVO")
print(f"📦 Input:  {JS_INPUT} ({input_size} bytes)")
print(f"📦 Output: {JS_OUTPUT} ({output_size} bytes)")
print(f"📉 Compression: {100 - (output_size / input_size * 100):.1f}%")