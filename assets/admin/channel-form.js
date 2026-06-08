/*
 * Channel create/edit form behaviour: dynamic feed rows, inline field
 * validation, and CORS auto-populate.
 *
 * Handlers are delegated on `document` so they keep working after the edit
 * form is swapped in by HTMX (admin-channel-form-result.hbs replaces
 * #form-result without re-running any page script). Extracted from an inline
 * <script> block so the admin CSP can use `script-src 'self'`.
 */
(function () {
  function getNextIndex() {
    var rows = document.querySelectorAll(".feed-row");
    var max = -1;
    for (var i = 0; i < rows.length; i++) {
      var idx = parseInt(rows[i].getAttribute("data-index"), 10);
      if (idx > max) max = idx;
    }
    return max + 1;
  }

  function updateRemoveButtons() {
    var rows = document.querySelectorAll(".feed-row");
    var btns = document.querySelectorAll(".remove-feed-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = rows.length <= 1;
    }
  }

  function addFeedRow() {
    var idx = getNextIndex();
    var html =
      '<div class="feed-row" data-index="' +
      idx +
      '">' +
      '<div class="form-field">' +
      '<label class="required">Feed Name</label>' +
      '<input type="text" name="feeds[' +
      idx +
      '][name]" value="" required>' +
      '<small class="helper-text">Display name for this feed in emails</small>' +
      "</div>" +
      '<div class="form-field">' +
      '<label class="required">Feed URL</label>' +
      '<input type="url" name="feeds[' +
      idx +
      '][url]" value="" required>' +
      '<small class="helper-text">URL of the RSS or Atom feed</small>' +
      "</div>" +
      '<div class="feed-row-actions">' +
      '<button type="button" class="remove-feed-btn btn-small">Remove</button>' +
      "</div>" +
      "</div>";
    document.getElementById("feed-rows").insertAdjacentHTML("beforeend", html);
    updateRemoveButtons();
  }

  function removeFeedRow(btn) {
    var rows = document.querySelectorAll(".feed-row");
    if (rows.length <= 1) return;
    if (!confirm("Remove this feed?")) return;
    btn.closest(".feed-row").remove();
    updateRemoveButtons();
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.className = "field-error";
  }

  function showHelper(el, msg) {
    el.textContent = msg;
    el.className = "helper-text";
  }

  // The original (default) helper text, captured the first time we touch the
  // helper while it is still in its non-error state. Cached on the element so
  // it survives HTMX form swaps that replace the node.
  function defaultText(helper) {
    if (helper.dataset.defaultText == null) {
      helper.dataset.defaultText = helper.classList.contains("field-error")
        ? ""
        : helper.textContent;
    }
    return helper.dataset.defaultText;
  }

  // Channel ID validation mirrors validateChannelId() in shared/lib/config.js.
  function validateChannelId(input) {
    var helper = document.getElementById("id-helper");
    if (!helper) return;
    var def = defaultText(helper);
    var val = input.value;
    if (!val) {
      showHelper(helper, def);
      return;
    }
    if (/[A-Z]/.test(val)) {
      showError(helper, "Must be lowercase");
      return;
    }
    if (/\s/.test(val)) {
      showError(helper, "No spaces allowed");
      return;
    }
    if (val.startsWith("-") || val.endsWith("-")) {
      showError(helper, "Must not start or end with a hyphen");
      return;
    }
    if (/--/.test(val)) {
      showError(helper, "No consecutive hyphens");
      return;
    }
    var pattern = new RegExp(input.getAttribute("pattern"));
    if (!pattern.test(val)) {
      showError(helper, "Only lowercase letters, numbers, and hyphens");
      return;
    }
    showHelper(helper, def);
  }

  function validateFromUser(input) {
    var helper = document.getElementById("fromUser-helper");
    if (!helper) return;
    var def = defaultText(helper);
    var val = input.value;
    if (!val) {
      showHelper(helper, def);
      return;
    }
    if (val.indexOf("@") !== -1) {
      showError(helper, "Enter just the local part (before the @)");
      return;
    }
    if (/\s/.test(val)) {
      showError(helper, "No spaces allowed");
      return;
    }
    showHelper(helper, def);
  }

  // Tracks whether the operator hand-edited CORS, so siteUrl auto-populate
  // never clobbers a manual value.
  var corsManuallyEdited = false;

  // Add / remove feed rows (delegated — survives HTMX swaps).
  document.addEventListener("click", function (e) {
    if (e.target.closest("#add-feed-btn")) {
      addFeedRow();
      return;
    }
    var removeBtn = e.target.closest(".remove-feed-btn");
    if (removeBtn) {
      removeFeedRow(removeBtn);
    }
  });

  // Inline field validation + CORS manual-edit tracking.
  document.addEventListener("input", function (e) {
    if (e.target.id === "id") {
      validateChannelId(e.target);
    } else if (e.target.id === "fromUser") {
      validateFromUser(e.target);
    } else if (e.target.id === "corsOrigins") {
      corsManuallyEdited = true;
    }
  });

  // CORS auto-populate from Site URL on blur (create only — never overwrite an
  // existing channel's origins). `blur` does not bubble, so listen in capture.
  document.addEventListener(
    "blur",
    function (e) {
      if (e.target.id !== "siteUrl") return;
      var form = e.target.closest("form");
      if (!form || form.getAttribute("data-mode") !== "create") return;
      if (corsManuallyEdited) return;
      var val = e.target.value.trim();
      if (!val) return;
      try {
        var origin = new URL(val).origin;
        if (origin && origin !== "null") {
          var cors = document.getElementById("corsOrigins");
          if (cors) cors.value = origin;
        }
      } catch (err) {
        /* invalid URL, ignore */
      }
    },
    true
  );

  updateRemoveButtons();
})();
