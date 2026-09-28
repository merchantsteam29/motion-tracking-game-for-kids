// Share page: QR code and copy/share link.
import { siteUrl, registerServiceWorker } from "./config.js";

const $ = (id) => document.getElementById(id);
const url = siteUrl();

$("siteLink").textContent = url;

// QR code (drawn locally, no internet needed).
if (window.qrcode) {
  const q = window.qrcode(0, "M");
  q.addData(url);
  q.make();
  $("qr").innerHTML = q.createSvgTag(6, 2);
} else {
  $("qr").textContent = "QR code unavailable";
}

// Copy link
$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(url);
    $("copyMsg").textContent = "✅ Link copied! Paste it into a message.";
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("siteLink"));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    $("copyMsg").textContent = "Link selected — press Ctrl+C (or long-press → Copy).";
  }
});

// Native share sheet (phones, tablets, some computers)
if (navigator.share) {
  $("shareBtn").hidden = false;
  $("shareBtn").addEventListener("click", () => {
    navigator.share({ title: "Move & Play", text: "Camera workout games for kids! 🏃‍♀️🎉", url }).catch(() => {});
  });
}

registerServiceWorker();
