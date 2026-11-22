(() => {
  "use strict";

  const fetchSuggestions = async (query, signal) => {
    const response = await fetch(`/api/providers/suggest?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) throw new Error("Не вдалося отримати підказки провайдерів.");
    const data = await response.json();
    return Array.isArray(data.providers) ? data.providers : [];
  };

  document.querySelectorAll("[data-provider-search]").forEach((searchRoot) => {
    const form = searchRoot.querySelector("form");
    const input = searchRoot.querySelector("[data-provider-input]");
    const results = searchRoot.querySelector("[data-provider-results]");
    const isMapSearch = searchRoot.dataset.providerSearchMode === "map";

    if (!form || !input || !results) return;

    let providers = [];
    let debounceTimer = null;
    let requestController = null;

    const closeResults = () => {
      results.hidden = true;
      results.replaceChildren();
      input.setAttribute("aria-expanded", "false");
    };

    const showMessage = (message) => {
      const row = document.createElement("p");
      row.className = "search-empty";
      row.setAttribute("role", "status");
      row.textContent = message;
      results.replaceChildren(row);
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    const selectProvider = (provider) => {
      closeResults();
      if (isMapSearch) {
        window.dispatchEvent(new CustomEvent("ispcheck:provider-selected", {
          detail: { providerId: provider.id, providerName: provider.name }
        }));
        return;
      }
      window.location.href = `isp-info.html?id=${encodeURIComponent(provider.id)}`;
    };

    const showProviders = (items) => {
      const fragment = document.createDocumentFragment();
      items.forEach((provider) => {
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = isMapSearch
          ? "#map-results"
          : `isp-info.html?id=${encodeURIComponent(provider.id)}`;
        link.setAttribute("role", "option");
        link.setAttribute("aria-selected", "false");

        const name = document.createElement("span");
        name.className = "search-result-name";
        name.textContent = provider.name;

        const detail = document.createElement("span");
        detail.className = "search-result-description";
        const types = (provider.connectionTypes || []).join(", ");
        const speed = provider.maxSpeedMbps ? `до ${provider.maxSpeedMbps} Мбіт/с` : "";
        detail.textContent = [types, speed].filter(Boolean).join(" · ") || "Інтернет-провайдер";
        link.append(name, detail);

        link.addEventListener("click", (event) => {
          if (isMapSearch) event.preventDefault();
          selectProvider(provider);
        });
        fragment.append(link);
      });
      results.replaceChildren(fragment);
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    const updateResults = async () => {
      const query = input.value.trim();
      if (!query) {
        closeResults();
        return;
      }

      if (requestController) requestController.abort();
      requestController = new AbortController();
      showMessage("Шукаємо операторів…");

      try {
        providers = await fetchSuggestions(query, requestController.signal);
        if (!providers.length) {
          showMessage("За вашим запитом не знайдено операторів.");
        } else {
          showProviders(providers);
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        showMessage("Не вдалося виконати пошук. Перевірте з'єднання із сервером.");
      }
    };

    input.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(updateResults, 180);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && !results.hidden) {
        const first = results.querySelector("a.search-result");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === "Escape") {
        closeResults();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        closeResults();
        return;
      }
      try {
        const matches = await fetchSuggestions(input.value);
        if (matches.length === 1) {
          selectProvider(matches[0]);
        } else if (!matches.length) {
          showMessage("За вашим запитом не знайдено операторів.");
        } else {
          showProviders(matches);
        }
      } catch {
        showMessage("Не вдалося виконати пошук. Перевірте з'єднання із сервером.");
      }
    });

    document.addEventListener("click", (event) => {
      if (!searchRoot.contains(event.target)) closeResults();
    });
  });

  // Деталі провайдера завантажуються окремим модулем provider.js.
})();
