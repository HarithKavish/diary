// Diary's client-side router. GitHub Pages has no server-side routing, so
// every path renders through this one page -- see 404.html for how a direct
// request for /@handle/topic/slug arrives here in the first place.
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
    if (parts.length === 3) return { type: "page", handle: handle, topic: parts[1], slug: parts[2] };
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
    var topic = el("input", { placeholder: "topic (e.g. travel)", value: defaults.topic || "", required: "required" });
    var slug = el("input", { placeholder: "page name (e.g. day-one)", value: defaults.slug || "", required: "required" });
    var title = el("input", { placeholder: "title", value: defaults.title || "", required: "required" });
    var content = el("textarea", { rows: "12", placeholder: "Write here..." });
    content.value = defaults.content || "";

    if (defaults.lockTopicSlug) {
      topic.setAttribute("readonly", "readonly");
      slug.setAttribute("readonly", "readonly");
    }

    var save = el("button", { class: "button button--primary", type: "submit", text: defaults.submitLabel || "Save" });
    form.appendChild(el("div", { class: "field-row" }, [topic, slug]));
    form.appendChild(title);
    form.appendChild(content);
    form.appendChild(save);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      onSubmit({ topic: topic.value, slug: slug.value, title: title.value, content: content.value });
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
              navigate("/@" + result.data.handle + "/" + values.topic.toLowerCase() + "/" + values.slug.toLowerCase());
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
        var href = "/@" + handle + "/" + page.topic + "/" + page.slug;
        var item = el("div", { class: "page-list__item" }, [
          el("a", { href: href, "data-nav": "true", text: page.title }),
          el("span", { class: "page-list__topic", text: page.topic }),
        ]);
        list.appendChild(item);
      });
    });
  }

  function renderPage(handle, topic, slug) {
    app.textContent = "";
    var isOwner = me && me.signedIn && me.user.handle === handle;

    api("/pages/@" + handle + "/" + topic + "/" + slug).then(function (result) {
      if (!result.ok) {
        app.appendChild(el("section", { class: "section-head" }, [el("h1", { class: "section-head__title", text: "Not found" })]));
        return;
      }
      var page = result.data.page;
      var head = el("section", { class: "section-head" });
      head.appendChild(el("h1", { class: "section-head__title", text: page.title }));
      head.appendChild(el("p", { class: "section-head__lead", text: "@" + handle + " / " + topic }));
      app.appendChild(head);

      var body = el("div", { class: "page-body" });
      body.textContent = page.content; // never innerHTML: this is another person's typed text
      app.appendChild(body);

      if (isOwner) {
        var editButton = el("button", { class: "button button--secondary", type: "button", text: "Edit" });
        editButton.addEventListener("click", function () {
          body.hidden = true;
          editButton.hidden = true;
          var form = pageForm(
            { topic: topic, slug: slug, title: page.title, content: page.content, lockTopicSlug: true, submitLabel: "Save" },
            function (values) {
              api("/pages/@" + handle + "/" + topic + "/" + slug, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: values.title, content: values.content }),
              }).then(function (saveResult) {
                if (!saveResult.ok) {
                  alert("Could not save: " + (saveResult.data.error || "unknown error"));
                  return;
                }
                render();
              });
            },
          );
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
    else if (route.type === "page") renderPage(route.handle, route.topic, route.slug);
    else {
      app.textContent = "";
      app.appendChild(el("section", { class: "section-head" }, [el("h1", { class: "section-head__title", text: "Not found" })]));
    }
  }

  api("/me").then(function (result) {
    me = result.data;
    renderAuthArea();
    render();
  });
})();
