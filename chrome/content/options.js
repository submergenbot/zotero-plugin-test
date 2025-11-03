(async () => {
  const endpointInput = document.getElementById("endpoint");
  const apiKeyInput = document.getElementById("apiKey");
  const modelInput = document.getElementById("model");
  const statusLabel = document.getElementById("status");
  const saveButton = document.getElementById("save");
  const resetButton = document.getElementById("reset");

  const PREF_ENDPOINT = "extensions.pdf-qa-helper.endpoint";
  const PREF_API_KEY = "extensions.pdf-qa-helper.apiKey";
  const PREF_MODEL = "extensions.pdf-qa-helper.model";

  async function load() {
    endpointInput.value = (await Zotero.Prefs.getAsync(PREF_ENDPOINT)) || "";
    apiKeyInput.value = (await Zotero.Prefs.getAsync(PREF_API_KEY)) || "";
    modelInput.value = (await Zotero.Prefs.getAsync(PREF_MODEL)) || "";
    statusLabel.textContent = "";
  }

  async function save() {
    await Zotero.Prefs.setAsync(PREF_ENDPOINT, endpointInput.value.trim());
    await Zotero.Prefs.setAsync(PREF_API_KEY, apiKeyInput.value.trim());
    await Zotero.Prefs.setAsync(PREF_MODEL, modelInput.value.trim());
    statusLabel.textContent = "已保存";
    setTimeout(() => {
      statusLabel.textContent = "";
    }, 2000);
  }

  async function reset() {
    endpointInput.value = "";
    apiKeyInput.value = "";
    modelInput.value = "";
    await save();
  }

  saveButton.addEventListener("click", () => {
    save().catch(error => {
      console.error(error);
      statusLabel.textContent = `保存失败：${error.message || error}`;
    });
  });

  resetButton.addEventListener("click", () => {
    reset().catch(error => {
      console.error(error);
      statusLabel.textContent = `重置失败：${error.message || error}`;
    });
  });

  load().catch(error => {
    console.error(error);
    statusLabel.textContent = `加载失败：${error.message || error}`;
  });
})();
