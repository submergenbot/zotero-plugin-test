(() => {
  const state = {
    api: null,
    itemID: null,
    questionEl: null,
    answerEl: null,
    timestampEl: null,
    itemIdEl: null,
    statusEl: null
  };

  async function refresh() {
    if (!state.api || !state.itemID) {
      return;
    }
    state.statusEl.textContent = "正在加载…";
    try {
      const history = await state.api.loadQuestionHistory(state.itemID);
      if (!history) {
        state.questionEl.textContent = "暂无历史记录";
        state.answerEl.textContent = "";
        state.timestampEl.textContent = "";
        state.statusEl.textContent = "";
        return;
      }
      state.questionEl.textContent = history.question || "";
      state.answerEl.textContent = history.answer || "";
      if (history.timestamp) {
        state.timestampEl.textContent = new Date(history.timestamp).toLocaleString();
      } else {
        state.timestampEl.textContent = "";
      }
      state.statusEl.textContent = "";
    } catch (error) {
      console.error(error);
      state.statusEl.textContent = `加载失败：${error.message || error}`;
    }
  }

  const closeHandler = () => window.close();

  const bootstrap = {
    init({ api, itemID }) {
      state.api = api;
      state.itemID = itemID;
      state.questionEl = document.getElementById("question");
      state.answerEl = document.getElementById("answer");
      state.timestampEl = document.getElementById("timestamp");
      state.itemIdEl = document.getElementById("item-id");
      state.statusEl = document.getElementById("status");

      document.getElementById("refresh").addEventListener("click", refresh);
      document.getElementById("close").addEventListener("click", closeHandler);

      state.itemIdEl.textContent = `Item ID: ${itemID}`;
      refresh();
    },

    destroy() {
      document.getElementById("refresh")?.removeEventListener("click", refresh);
      document.getElementById("close")?.removeEventListener("click", closeHandler);
      state.api = null;
      state.itemID = null;
    }
  };

  window.resultWindowBootstrap = bootstrap;
  window.addEventListener("unload", () => bootstrap.destroy());
})();
