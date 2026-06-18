/*
 * Shared admin-console behaviour, loaded on every authenticated page.
 *
 * Currently: the inline-confirm "Cancel" action. The confirmation fragment
 * (admin-delete-confirm.hbs) carries the original control inside an inert
 * <template>; clicking Cancel restores it by cloning that template's nodes —
 * no HTML-from-string parsing, so it is not an XSS sink. HTMX's mutation
 * observer plus an explicit htmx.process re-activate the restored control's
 * hx-* attributes.
 */
(function () {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-confirm-cancel]");
    if (!btn) return;
    var box = btn.closest(".inline-confirm");
    if (!box) return;
    var tpl = box.querySelector("template[data-cancel-restore]");
    if (!tpl) return;
    var frag = tpl.content.cloneNode(true);
    var restored = frag.firstElementChild;
    box.replaceWith(frag);
    if (restored && window.htmx && typeof window.htmx.process === "function") {
      window.htmx.process(restored);
    }
  });
})();
