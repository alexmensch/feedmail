/*
 * WebAuthn passkey ceremonies for the admin console.
 *
 * Loaded on both the login page (authentication: #passkey-btn) and the
 * settings page (registration: #register-btn). Each ceremony self-activates
 * only when its trigger button is present, so a single file serves both pages.
 *
 * Extracted from inline <script> blocks so the admin CSP can use
 * `script-src 'self'` with no nonces or 'unsafe-inline'.
 */
(function () {
  function base64urlToBuffer(base64url) {
    var s = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToBase64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ── Authentication ceremony (login page) ──────────────────────────────
  var authBtn = document.getElementById("passkey-btn");
  if (authBtn) {
    var authErr = document.getElementById("passkey-error");
    if (!window.PublicKeyCredential) {
      authBtn.disabled = true;
      authBtn.textContent = "Passkeys not supported in this browser";
    } else {
      authBtn.addEventListener("click", async function () {
        authBtn.disabled = true;
        authErr.hidden = true;
        try {
          var optRes = await fetch("/admin/passkeys/authenticate/options", {
            method: "POST"
          });
          if (!optRes.ok) throw new Error("Failed to get options");
          var opts = await optRes.json();
          opts.challenge = base64urlToBuffer(opts.challenge);
          if (opts.allowCredentials) {
            opts.allowCredentials = opts.allowCredentials.map(function (c) {
              return {
                id: base64urlToBuffer(c.id),
                type: c.type,
                transports: c.transports
              };
            });
          }
          var cred = await navigator.credentials.get({ publicKey: opts });
          var body = {
            response: {
              id: cred.id,
              rawId: bufferToBase64url(cred.rawId),
              response: {
                authenticatorData: bufferToBase64url(
                  cred.response.authenticatorData
                ),
                clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
                signature: bufferToBase64url(cred.response.signature),
                userHandle: cred.response.userHandle
                  ? bufferToBase64url(cred.response.userHandle)
                  : null
              },
              type: cred.type,
              authenticatorAttachment:
                cred.authenticatorAttachment || undefined,
              clientExtensionResults: cred.getClientExtensionResults()
            }
          };
          var verRes = await fetch("/admin/passkeys/authenticate/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          var result = await verRes.json();
          if (result.verified) {
            window.location.href = result.redirectUrl || "/admin";
          } else {
            authErr.querySelector("strong").textContent =
              result.error || "Authentication failed";
            authErr.hidden = false;
            authBtn.disabled = false;
          }
        } catch (e) {
          if (e.name !== "NotAllowedError") {
            authErr.querySelector("strong").textContent =
              "Passkey authentication failed. Try magic link instead.";
            authErr.hidden = false;
          }
          authBtn.disabled = false;
        }
      });
    }
  }

  // ── Registration ceremony (settings page) ─────────────────────────────
  var regBtn = document.getElementById("register-btn");
  if (regBtn) {
    var regErr = document.getElementById("register-error");
    var regSuccess = document.getElementById("register-success");
    if (!window.PublicKeyCredential) {
      regBtn.disabled = true;
      regBtn.textContent = "Passkeys not supported in this browser";
    } else {
      regBtn.addEventListener("click", async function () {
        regBtn.disabled = true;
        regErr.hidden = true;
        regSuccess.hidden = true;
        var name = document.getElementById("passkey-name").value.trim();
        try {
          var optRes = await fetch("/admin/passkeys/register/options", {
            method: "POST"
          });
          if (!optRes.ok) throw new Error("Failed to get options");
          var opts = await optRes.json();
          opts.challenge = base64urlToBuffer(opts.challenge);
          opts.user.id = base64urlToBuffer(opts.user.id);
          if (opts.excludeCredentials) {
            opts.excludeCredentials = opts.excludeCredentials.map(function (c) {
              return {
                id: base64urlToBuffer(c.id),
                type: c.type,
                transports: c.transports
              };
            });
          }
          var cred = await navigator.credentials.create({ publicKey: opts });
          var body = {
            name: name || null,
            response: {
              id: cred.id,
              rawId: bufferToBase64url(cred.rawId),
              response: {
                attestationObject: bufferToBase64url(
                  cred.response.attestationObject
                ),
                clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
                transports: cred.response.getTransports
                  ? cred.response.getTransports()
                  : undefined
              },
              type: cred.type,
              authenticatorAttachment:
                cred.authenticatorAttachment || undefined,
              clientExtensionResults: cred.getClientExtensionResults()
            }
          };
          var verRes = await fetch("/admin/passkeys/register/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          var result = await verRes.json();
          if (result.verified) {
            window.location.reload();
          } else {
            regErr.querySelector("strong").textContent =
              result.error || "Registration failed";
            regErr.hidden = false;
            regBtn.disabled = false;
          }
        } catch (e) {
          if (e.name !== "NotAllowedError") {
            regErr.querySelector("strong").textContent =
              "Registration failed. Please try again.";
            regErr.hidden = false;
          }
          regBtn.disabled = false;
        }
      });
    }
  }
})();
