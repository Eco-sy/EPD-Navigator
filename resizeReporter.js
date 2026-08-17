(function () {
  const target = document.getElementById("app");
  const WIX_ORIGIN = "https://www.eco-sy.com";

  function reportHeight() {
    const height = target.scrollHeight;
    window.parent.postMessage({ type: "epd-calc-resize", height }, WIX_ORIGIN);
  }

  const observer = new ResizeObserver(() => reportHeight());
  observer.observe(target);

  // Einmal initial senden, sobald alles geladen ist
  window.addEventListener("load", reportHeight);
})();