(() => {
  "use strict";

  const mapElement = document.getElementById("provider-map");
  if (!mapElement || !window.L) return;

  const statusElement = document.getElementById("results-status");
  const resultsList = document.getElementById("provider-results");
  const providersTitle = document.getElementById("providers-title");
  const addressMessage = document.getElementById("address-message");
  const addressForm = document.getElementById("address-search-form");
  const entranceSelect = document.getElementById("entrance");
  const technologySelect = document.getElementById("technology");
  const speedSelect = document.getElementById("speed");
  const energyCheckbox = document.getElementById("energy-independent");

  const state = {
    city: null,
    street: null,
    building: null,
    entrance: null,
    lastSearch: null,
    markerByCoverageId: new Map()
  };

  const map = L.map(mapElement, {
    scrollWheelZoom: true,
    zoomControl: true,
    minZoom: 11,
    maxZoom: 19
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Демонстраційна зона з попередньої версії. Вона є приблизним візуальним контуром,
  // а фактичні результати пошуку надходять з JSON-бази через REST API.
  const coverageCoordinates = [
    [50.448898, 30.587870], [50.449719, 30.590062], [50.450521, 30.591628],
    [50.450962, 30.593507], [50.451423, 30.596012], [50.451583, 30.598361],
    [50.450621, 30.599144], [50.449559, 30.600866], [50.449219, 30.603371],
    [50.448597, 30.605407], [50.447716, 30.606472], [50.446393, 30.607442],
    [50.445111, 30.608225], [50.443548, 30.608852], [50.443588, 30.609259],
    [50.442546, 30.609948], [50.440803, 30.610261], [50.439440, 30.611670],
    [50.440181, 30.607975], [50.439460, 30.607912], [50.438338, 30.607599],
    [50.437496, 30.606660], [50.437015, 30.605094], [50.436414, 30.603215],
    [50.435673, 30.601649], [50.434851, 30.600083], [50.434090, 30.598674],
    [50.433348, 30.596639], [50.432787, 30.594133], [50.432367, 30.591941],
    [50.432567, 30.589280], [50.434390, 30.588904], [50.436294, 30.588872],
    [50.438017, 30.588497], [50.439260, 30.587870], [50.440803, 30.587745],
    [50.442746, 30.587808], [50.444710, 30.587902], [50.446614, 30.587933],
    [50.448477, 30.588152]
  ];

  const coverage = L.polygon(coverageCoordinates, {
    color: "#1476d4",
    weight: 2,
    opacity: 0.95,
    fillColor: "#2689e8",
    fillOpacity: 0.18,
    smoothFactor: 1.2,
    interactive: true
  }).addTo(map);

  coverage.bindTooltip("Орієнтовна зона покриття «Так.нет»", {
    sticky: true,
    direction: "top",
    opacity: 0.96
  });
  coverage.on("click", () => {
    window.location.href = "isp-info.html?id=prov-taknet";
  });
  coverage.on("mouseover", () => {
    mapElement.style.cursor = "pointer";
    coverage.setStyle({ fillOpacity: 0.28, weight: 3 });
  });
  coverage.on("mouseout", () => {
    mapElement.style.cursor = "";
    coverage.setStyle({ fillOpacity: 0.18, weight: 2 });
  });

  const markerLayer = L.layerGroup().addTo(map);
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const container = L.DomUtil.create("div", "coverage-legend");
    container.innerHTML = '<span class="coverage-legend-swatch" aria-hidden="true"></span>Орієнтовна зона «Так.нет»';
    L.DomEvent.disableClickPropagation(container);
    return container;
  };
  legend.addTo(map);
  map.fitBounds(coverage.getBounds(), { padding: [22, 22], maxZoom: 14 });

  const addressInputs = {
    city: document.querySelector('[data-address-input="city"]'),
    street: document.querySelector('[data-address-input="street"]'),
    building: document.querySelector('[data-address-input="building"]')
  };

  const apiGet = async (path) => {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Помилка запиту (${response.status}).`);
    return data;
  };

  const setStatus = (status, message) => {
    if (!statusElement) return;
    statusElement.dataset.state = status;
    statusElement.textContent = message;
    if (providersTitle) {
      providersTitle.textContent = status === "results" ? "Знайдені пропозиції" : "Результати пошуку";
    }
  };

  const setAddressMessage = (message, isError = false) => {
    if (!addressMessage) return;
    addressMessage.textContent = message;
    addressMessage.dataset.state = isError ? "error" : "info";
  };

  const filtersToParams = () => {
    const params = new URLSearchParams();
    if (technologySelect?.value) params.set("connectionType", technologySelect.value);
    if (speedSelect?.value) params.set("minMaxSpeedMbps", speedSelect.value);
    if (energyCheckbox?.checked) params.set("energyIndependent", "true");
    return params;
  };

  const addFilters = (params) => {
    const filters = filtersToParams();
    filters.forEach((value, key) => params.set(key, value));
    return params;
  };

  const hideSuggestions = (field) => {
    const box = document.querySelector(`[data-address-results="${field}"]`);
    if (box) {
      box.hidden = true;
      box.replaceChildren();
    }
    addressInputs[field]?.setAttribute("aria-expanded", "false");
  };

  const clearSelectionAfter = (field) => {
    const order = ["city", "street", "building"];
    const position = order.indexOf(field);
    order.slice(position + 1).forEach((name) => {
      state[name] = null;
      if (addressInputs[name]) addressInputs[name].value = "";
      hideSuggestions(name);
    });
    state.entrance = null;
    if (entranceSelect) {
      entranceSelect.innerHTML = '<option value="">Під\'їзд</option>';
      entranceSelect.disabled = true;
    }
    if (field === "city") {
      addressInputs.street.disabled = true;
      addressInputs.building.disabled = true;
      document.querySelector('[data-address-focus="street"]').disabled = true;
      document.querySelector('[data-address-focus="building"]').disabled = true;
    } else if (field === "street") {
      addressInputs.building.disabled = true;
      document.querySelector('[data-address-focus="building"]').disabled = true;
    }
  };

  const apiForAddressField = (field, query) => {
    const encoded = encodeURIComponent(query);
    if (field === "city") return `/api/address/cities?q=${encoded}`;
    if (field === "street" && state.city) {
      return `/api/address/streets?cityId=${encodeURIComponent(state.city.id)}&q=${encoded}`;
    }
    if (field === "building" && state.street) {
      return `/api/address/buildings?streetId=${encodeURIComponent(state.street.id)}&q=${encoded}`;
    }
    return null;
  };

  const renderAddressSuggestions = (field, items) => {
    const box = document.querySelector(`[data-address-results="${field}"]`);
    const input = addressInputs[field];
    if (!box || !input) return;
    box.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "address-suggestion-empty";
      empty.textContent = "Нічого не знайдено";
      box.append(empty);
    } else {
      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "address-suggestion";
        button.setAttribute("role", "option");
        button.textContent = item.label;
        button.addEventListener("click", () => selectAddressItem(field, item));
        box.append(button);
      });
    }
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const populateEntrances = async (buildingId) => {
    if (!entranceSelect) return;
    entranceSelect.disabled = true;
    entranceSelect.innerHTML = '<option value="">Завантаження…</option>';
    const data = await apiGet(`/api/address/entrances?buildingId=${encodeURIComponent(buildingId)}`);
    entranceSelect.innerHTML = '<option value="">Увесь будинок</option>';
    data.items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      entranceSelect.append(option);
    });
    entranceSelect.disabled = data.items.length === 0;
  };

  const selectAddressItem = async (field, item) => {
    state[field] = item;
    addressInputs[field].value = item.label;
    hideSuggestions(field);
    clearSelectionAfter(field);

    if (field === "city") {
      state.city = item;
      addressInputs.street.disabled = false;
      document.querySelector('[data-address-focus="street"]').disabled = false;
      map.setView([item.lat, item.lng], 13);
      setAddressMessage("Тепер оберіть вулицю.");
      return;
    }

    if (field === "street") {
      state.street = item;
      addressInputs.building.disabled = false;
      document.querySelector('[data-address-focus="building"]').disabled = false;
      setAddressMessage("Тепер введіть номер будинку або шукайте за всією вулицею.");
      return;
    }

    if (field === "building") {
      state.building = item;
      try {
        await populateEntrances(item.id);
        setAddressMessage("Адресу обрано. Завантажуємо доступні пропозиції.");
        await runAddressSearch();
      } catch (error) {
        setAddressMessage(error.message, true);
        setStatus("error", error.message);
      }
    }
  };

  const autocompleteTimers = new Map();
  const autocompleteControllers = new Map();
  Object.entries(addressInputs).forEach(([field, input]) => {
    if (!input) return;
    input.addEventListener("input", () => {
      clearSelectionAfter(field);
      state[field] = null;
      setAddressMessage("");
      window.clearTimeout(autocompleteTimers.get(field));
      const query = input.value.trim();
      if (!query) {
        hideSuggestions(field);
        return;
      }
      if ((field === "street" && !state.city) || (field === "building" && !state.street)) {
        hideSuggestions(field);
        setAddressMessage(field === "street" ? "Спочатку оберіть місто." : "Спочатку оберіть вулицю.", true);
        return;
      }
      autocompleteTimers.set(field, window.setTimeout(async () => {
        try {
          autocompleteControllers.get(field)?.abort();
          const controller = new AbortController();
          autocompleteControllers.set(field, controller);
          const endpoint = apiForAddressField(field, query);
          if (!endpoint) return;
          const response = await fetch(endpoint, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "Помилка пошуку адреси.");
          renderAddressSuggestions(field, data.items || []);
        } catch (error) {
          if (error.name !== "AbortError") setAddressMessage(error.message, true);
        }
      }, 180));
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSuggestions(field);
      if (event.key === "Enter") {
        const box = document.querySelector(`[data-address-results="${field}"]`);
        const first = box?.querySelector(".address-suggestion");
        if (first && !box.hidden) {
          event.preventDefault();
          first.click();
        }
      }
    });
  });

  document.querySelectorAll("[data-address-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.addressFocus;
      addressInputs[field]?.focus();
      addressInputs[field]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-address-control]");
    Object.keys(addressInputs).forEach((field) => {
      if (!control || control.dataset.addressControl !== field) hideSuggestions(field);
    });
  });

  const renderResults = (items) => {
    markerLayer.clearLayers();
    state.markerByCoverageId.clear();
    resultsList.replaceChildren();

    const providerGroups = new Map();
    items.forEach((item) => {
      const marker = L.marker([item.lat, item.lng]);
      const popup = document.createElement("div");
      popup.className = "map-result-popup";
      const name = document.createElement("strong");
      name.textContent = item.providerName;
      const address = document.createElement("p");
      address.textContent = item.address || "Адресу не вказано";
      const details = document.createElement("p");
      details.textContent = `${item.connectionType} · до ${item.maxSpeedMbps} Мбіт/с`;
      const energy = document.createElement("p");
      energy.textContent = item.energyIndependent ? "Енергонезалежний" : "Енергонезалежність не підтверджена";
      const link = document.createElement("a");
      link.href = `isp-info.html?id=${encodeURIComponent(item.providerId)}`;
      link.textContent = "Інформація про оператора";
      popup.append(name, address, details, energy, link);
      marker.bindPopup(popup).addTo(markerLayer);
      state.markerByCoverageId.set(item.coverageId, marker);

      if (!providerGroups.has(item.providerId)) {
        providerGroups.set(item.providerId, {
          providerId: item.providerId,
          providerName: item.providerName,
          offers: []
        });
      }
      providerGroups.get(item.providerId).offers.push(item);
    });

    providerGroups.forEach((group) => {
      const li = document.createElement("li");
      const providerLink = document.createElement("a");
      providerLink.href = `isp-info.html?id=${encodeURIComponent(group.providerId)}`;
      providerLink.className = "provider-result-link";
      const providerName = document.createElement("span");
      providerName.className = "provider-result-name";
      providerName.textContent = group.providerName;
      const types = [...new Set(group.offers.map((offer) => offer.connectionType))].join(", ");
      const maxSpeed = Math.max(...group.offers.map((offer) => Number(offer.maxSpeedMbps) || 0));
      const description = document.createElement("span");
      description.className = "provider-result-description";
      description.textContent = `${group.offers.length} адресних пропозицій · ${types} · до ${maxSpeed} Мбіт/с`;
      providerLink.append(providerName, description);
      li.append(providerLink);

      const addressList = document.createElement("ul");
      addressList.className = "provider-result-addresses";
      group.offers.forEach((offer) => {
        const addressItem = document.createElement("li");
        const addressButton = document.createElement("button");
        addressButton.type = "button";
        addressButton.className = "provider-address-button";
        addressButton.textContent = `${offer.address || "Адреса"} · ${offer.connectionType} · ${offer.maxSpeedMbps} Мбіт/с`;
        addressButton.addEventListener("click", () => {
          const marker = state.markerByCoverageId.get(offer.coverageId);
          if (marker) {
            map.setView(marker.getLatLng(), 17);
            marker.openPopup();
          }
        });
        addressItem.append(addressButton);
        addressList.append(addressItem);
      });
      li.append(addressList);
      resultsList.append(li);
    });

    return providerGroups.size;
  };

  const performMapSearch = async (baseParams) => {
    const base = new URLSearchParams(baseParams);
    state.lastSearch = Object.fromEntries(base.entries());
    const params = addFilters(base);
    setStatus("loading", "Шукаємо доступні пропозиції…");
    setAddressMessage("");
    resultsList.replaceChildren();

    try {
      const data = await apiGet(`/api/map/providers?${params.toString()}`);
      const providerCount = renderResults(data.items || []);
      if (data.items?.length) {
        setStatus("results", `Знайдено провайдерів: ${providerCount}; адресних пропозицій: ${data.items.length}. Натисніть на адресу, щоб показати її на мапі.`);
        const points = data.items.map((item) => [item.lat, item.lng]);
        if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 17 });
        } else {
          map.setView(points[0], 17);
        }
      } else {
        setStatus("empty", "За вибраною адресою та фільтрами доступних провайдерів не знайдено.");
        if (data.center?.lat && data.center?.lng) map.setView([data.center.lat, data.center.lng], 16);
      }
    } catch (error) {
      renderResults([]);
      setStatus("error", error.message || "Не вдалося виконати пошук. Спробуйте ще раз.");
    }
  };

  const runAddressSearch = async () => {
    const params = new URLSearchParams();
    if (state.city?.id) params.set("cityId", state.city.id);
    if (state.street?.id) params.set("streetId", state.street.id);
    if (state.building?.id) params.set("buildingId", state.building.id);
    if (state.entrance?.id) params.set("entranceId", state.entrance.id);
    if (!params.toString()) {
      setAddressMessage("Оберіть місто, щоб розпочати пошук.", true);
      return;
    }
    await performMapSearch(params);
  };

  addressForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAddressSearch();
  });

  entranceSelect?.addEventListener("change", () => {
    const selected = entranceSelect.selectedOptions[0];
    state.entrance = entranceSelect.value ? { id: entranceSelect.value, label: selected.textContent } : null;
    if (state.building) runAddressSearch();
  });

  const rerunWithFilters = () => {
    if (state.lastSearch) performMapSearch(state.lastSearch);
  };
  technologySelect?.addEventListener("change", rerunWithFilters);
  speedSelect?.addEventListener("change", rerunWithFilters);
  energyCheckbox?.addEventListener("change", rerunWithFilters);

  window.addEventListener("ispcheck:provider-selected", (event) => {
    const providerId = event.detail?.providerId;
    if (!providerId) return;
    state.city = state.street = state.building = state.entrance = null;
    Object.values(addressInputs).forEach((input) => {
      input.value = "";
    });
    addressInputs.street.disabled = true;
    addressInputs.building.disabled = true;
    document.querySelector('[data-address-focus="street"]').disabled = true;
    document.querySelector('[data-address-focus="building"]').disabled = true;
    entranceSelect.innerHTML = '<option value="">Під\'їзд</option>';
    entranceSelect.disabled = true;
    performMapSearch(new URLSearchParams({ providerId }));
  });

  const loadFilters = async () => {
    try {
      const data = await apiGet("/api/meta/filters");
      (data.connectionTypes || []).forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        technologySelect.append(option);
      });
      (data.speedValues || []).forEach((speed) => {
        const option = document.createElement("option");
        option.value = String(speed);
        option.textContent = `Від ${speed} Мбіт/с`;
        speedSelect.append(option);
      });
    } catch (error) {
      setAddressMessage(`Не вдалося завантажити фільтри: ${error.message}`, true);
    }
  };

  loadFilters();
  window.addEventListener("load", () => map.invalidateSize());
  window.addEventListener("resize", () => map.invalidateSize());
})();
