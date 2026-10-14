// Diary's client-side router. GitHub Pages has no server-side routing, so
// every path renders through this one page -- see 404.html for how a direct
// request for /@handle/page-name arrives here in the first place.
(function () {
  var redirect = new URLSearchParams(location.search).get("redirect");
  if (redirect) {
    history.replaceState(null, "", redirect);
  }

  var app = document.getElementById("app");
  var authArea = document.getElementById("auth-area");
  var me = null; // { signedIn: false } | { signedIn: true, user: {...} }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var key in attrs || {}) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "html") continue; // never: page content is user text, not markup
      else node.setAttribute(key, attrs[key]);
    }
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function api(path, options) {
    return fetch("/api" + path, Object.assign({ credentials: "same-origin" }, options)).then(
      function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      },
    );
  }

  function parseRoute(pathname) {
    if (pathname === "/" || pathname === "") return { type: "home" };
    var parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts[0][0] !== "@") return { type: "not-found" };
    var handle = parts[0].slice(1);
    if (parts.length === 1) return { type: "user", handle: handle };
    if (parts.length === 2) return { type: "page", handle: handle, slug: parts[1] };
    return { type: "not-found" };
  }

  function navigate(path) {
    history.pushState(null, "", path);
    render();
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[data-nav]");
    if (!link) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  window.addEventListener("popstate", render);

  // A non-authoritative hint, shared across the ecosystem: has this browser
  // signed in to a HarithKavish account before, anywhere? Reading it costs
  // nothing (a plain cookie read, no network call) and it is never trusted
  // for anything but this -- deciding whether a silent sign-in attempt is
  // worth making at all. Someone who has never touched the ecosystem never
  // triggers one.
  function hasEcosystemHint() {
    try {
      return !!(window.HarithStore && window.HarithStore.get("user"));
    } catch (e) {
      return false;
    }
  }

  // Guards against a redirect loop: if the hint is stale (this browser was
  // signed in before, but the real session has since ended everywhere), the
  // silent attempt fails and lands back on this exact page, hint still set --
  // an unguarded retry would redirect forever. sessionStorage clears itself
  // when the tab closes, so a later visit gets a fresh attempt.
  function alreadyTriedSilentSignIn() {
    try {
      return sessionStorage.getItem("diary_silent_attempted") === "1";
    } catch (e) {
      return true; // storage blocked -- don't risk a loop, just show the button
    }
  }

  function markSilentSignInAttempted() {
    try {
      sessionStorage.setItem("diary_silent_attempted", "1");
    } catch (e) {
      /* non-fatal */
    }
  }

  function renderAuthArea() {
    authArea.textContent = "";
    if (me && me.signedIn) {
      authArea.appendChild(el("span", { class: "auth-name", text: me.user.name }));
      var signOut = el("button", { class: "button button--secondary", type: "button", text: "Sign out" });
      signOut.addEventListener("click", function () {
        api("/auth/logout", { method: "POST" }).then(function () {
          location.href = "/";
        });
      });
      authArea.appendChild(signOut);
    } else {
      var signIn = el("a", { class: "button button--primary", href: "/api/auth/login?next=" + encodeURIComponent(location.pathname) });
      signIn.textContent = "Sign in";
      authArea.appendChild(signIn);
    }
  }

  function pageForm(defaults, onSubmit) {
    var form = el("form", { class: "page-form" });
    var slug = el("input", { placeholder: "page name (e.g. day-one)", value: defaults.slug || "", required: "required" });
    var title = el("input", { placeholder: "title", value: defaults.title || "", required: "required" });
    var content = el("textarea", { rows: "12", placeholder: "Write here..." });
    content.value = defaults.content || "";

    var save = el("button", { class: "button button--primary", type: "submit", text: defaults.submitLabel || "Save" });
    form.appendChild(slug);
    form.appendChild(title);
    form.appendChild(content);
    form.appendChild(save);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      onSubmit({ slug: slug.value, title: title.value, content: content.value });
    });

    return form;
  }

  function renderHome() {
    app.textContent = "";
    var head = el("section", { class: "section-head" }, [
      el("h1", { class: "section-head__title", text: "Diary" }),
    ]);
    app.appendChild(head);

    if (me && me.signedIn) {
      var lead = el("p", { class: "section-head__lead" });
      lead.appendChild(document.createTextNode("Signed in as " + me.user.name + ". "));
      var link = el("a", { href: "/@" + me.user.handle, "data-nav": "true", text: "Go to your pages" });
      lead.appendChild(link);
      app.appendChild(lead);
      app.appendChild(renderCreateButton());
    } else {
      app.appendChild(
        el("p", { class: "section-head__lead", text: "A personal journal. Sign in to create your own pages." }),
      );
    }
  }

  function renderCreateButton() {
    var wrap = el("div", { class: "create-page" });
    var button = el("button", { class: "button button--primary", type: "button", text: "Create page" });
    button.addEventListener("click", function () {
      if (wrap.querySelector("form")) return;
      wrap.appendChild(
        pageForm({ submitLabel: "Create" }, function (values) {
          api("/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }).then(
            function (result) {
              if (!result.ok) {
                alert("Could not create page: " + (result.data.error || "unknown error"));
                return;
              }
              navigate("/@" + result.data.handle + "/" + result.data.slug);
            },
          );
        }),
      );
    });
    wrap.appendChild(button);
    return wrap;
  }

  function renderUser(handle) {
    app.textContent = "";
    app.appendChild(el("section", { class: "section-head" }, [el("h1", { class: "section-head__title", text: "@" + handle })]));

    var isOwner = me && me.signedIn && me.user.handle === handle;
    if (isOwner) app.appendChild(renderCreateButton());

    var list = el("div", { class: "page-list" });
    app.appendChild(list);

    api("/pages/@" + handle).then(function (result) {
      if (!result.ok) {
        list.appendChild(el("p", { text: "No such user." }));
        return;
      }
      if (result.data.pages.length === 0) {
        list.appendChild(el("p", { text: isOwner ? "You have no pages yet." : "No pages yet." }));
        return;
      }
      result.data.pages.forEach(function (page) {
        var href = "/@" + handle + "/" + page.slug;
        var item = el("div", { class: "page-list__item" }, [el("a", { href: href, "data-nav": "true", text: page.title })]);
        list.appendChild(item);
      });
    });
  }

  function renderPage(handle, slug) {
    app.textContent = "";
    var isOwner = me && me.signedIn && me.user.handle === handle;

    api("/pages/@" + handle + "/" + slug).then(function (result) {
      if (!result.ok) {
        app.appendChild(el("section", { class: "section-head" }, [el("h1", { class: "section-head__title", text: "Not found" })]));
        return;
      }
      var page = result.data.page;
      var head = el("section", { class: "section-head" });
      head.appendChild(el("h1", { class: "section-head__title", text: page.title }));
      head.appendChild(el("p", { class: "section-head__lead", text: "@" + handle }));
      app.appendChild(head);

      var body = el("div", { class: "page-body" });
      body.textContent = page.content; // never innerHTML: this is another person's typed text
      app.appendChild(body);

      if (isOwner) {
        var editButton = el("button", { class: "button button--secondary", type: "button", text: "Edit" });
        editButton.addEventListener("click", function () {
          body.hidden = true;
          editButton.hidden = true;
          var form = pageForm({ slug: slug, title: page.title, content: page.content, submitLabel: "Save" }, function (values) {
            api("/pages/@" + handle + "/" + slug, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(values),
            }).then(function (saveResult) {
              if (!saveResult.ok) {
                alert("Could not save: " + (saveResult.data.error || "unknown error"));
                return;
              }
              navigate("/@" + handle + "/" + saveResult.data.slug);
            });
          });
          app.appendChild(form);
        });
        app.appendChild(editButton);
      }
    });
  }

  function render() {
    var route = parseRoute(location.pathname);
    if (route.type === "home") renderHome();
    else if (route.type === "user") renderUser(route.handle);
    else if (route.type === "page") renderPage(route.handle, route.slug);
    else {
      app.textContent = "";
      app.appendChild(el("section", { class: "section-head" }, [el("h1", { class: "section-head__title", text: "Not found" })]));
    }
  }

  api("/me").then(function (result) {
    me = result.data;
    if (!me.signedIn && hasEcosystemHint() && !alreadyTriedSilentSignIn()) {
      // Worth a quiet check before ever showing "Sign in": a real top-level
      // navigation (see hasEcosystemHint's comment for why it must be one),
      // fast either way -- it either comes back signed in, or lands right
      // back here still signed out, this time with the attempt marked so it
      // is not repeated.
      markSilentSignInAttempted();
      location.href = "/api/auth/login?silent=1&next=" + encodeURIComponent(location.pathname);
      return;
    }
    renderAuthArea();
    render();
  });
})();
