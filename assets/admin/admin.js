/*
 * Shared admin-console behaviour, loaded on every authenticated page.
 *
 * Currently: the inline-confirm "Cancel" action. The confirmation fragment
 * (admin-delete-confirm.hbs) carries the original control's markup in
 * `data-cancel-html`; clicking Cancel restores it. HTMX's mutation observer
 * re-processes the restored control's hx-* attributes. Extracted from an
 * inline onclick so the admin CSP can use `script-src 'self'`.
 */
(function () {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-confirm-cancel]");
    if (!btn) return;
    var box = btn.closest(".inline-confirm");
    if (!box) return;
    var html = btn.getAttribute("data-cancel-html");
    if (html !== null) {
      box.outerHTML = html;
    }
  });
})();
