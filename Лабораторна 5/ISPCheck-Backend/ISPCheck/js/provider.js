(() => {
  "use strict";

  const root = document.querySelector("[data-provider-detail]");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const providerId = params.get("id") || "prov-taknet";
  const status = document.getElementById("provider-load-status");

  const setText = (selector, value, fallback = "Не вказано") => {
    const element = root.querySelector(selector);
    if (element) element.textContent = value || fallback;
  };

  const loadProvider = async () => {
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(providerId)}`);
      if (response.status === 404) {
        throw new Error("Оператора з таким ідентифікатором не знайдено.");
      }
      if (!response.ok) throw new Error("Не вдалося завантажити інформацію про оператора.");
      const provider = await response.json();

      document.title = `ISPCheck — ${provider.name}`;
      setText("[data-provider-name]", provider.name);
      setText("[data-provider-description]", provider.description);
      setText("[data-provider-types]", (provider.connectionTypes || []).join(", "));
      setText("[data-provider-speed]", provider.maxSpeedMbps ? `до ${provider.maxSpeedMbps} Мбіт/с` : null);

      const website = root.querySelector("[data-provider-website]");
      if (website) {
        website.replaceChildren();
        if (provider.website) {
          const link = document.createElement("a");
          link.href = provider.website;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = provider.website;
          website.append(link);
        } else {
          website.textContent = "Не вказано";
        }
      }
      setText("[data-provider-phone]", provider.phone);
      if (status) {
        status.textContent = "";
        status.hidden = true;
      }
    } catch (error) {
      if (status) status.textContent = error.message;
      setText("[data-provider-name]", "Оператора не знайдено");
      setText("[data-provider-description]", "Перевірте адресу сторінки або поверніться до мапи.");
    }
  };

  loadProvider();
})();
