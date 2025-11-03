(() => {
  const logLines = [];
  const MAX_LOG_LINES = 200;

  const panelState = {
    api: null,
    currentItemID: null,
    abortController: null,
    isBusy: false,
    questionInput: null,
    askButton: null,
    cancelButton: null,
    logElement: null,
    answerElement: null
  };

  function setBusy(isBusy) {
    panelState.isBusy = isBusy;
    panelState.askButton.disabled = isBusy;
    panelState.cancelButton.disabled = !isBusy;
  }

  function log(message) {
    const time = new Date().toLocaleTimeString();
    logLines.push(`[${time}] ${message}`);
    if (logLines.length > MAX_LOG_LINES) {
      logLines.shift();
    }
    if (panelState.logElement) {
      panelState.logElement.textContent = logLines.join("\n");
      panelState.logElement.scrollTop = panelState.logElement.scrollHeight;
    }
  }

  function clearAnswer() {
    if (!panelState.answerElement) {
      return;
    }
    panelState.answerElement.textContent = "";
    panelState.answerElement.classList.add("empty-message");
    panelState.answerElement.textContent = "暂无结果";
  }

  async function onAsk() {
    if (!panelState.api) {
      return;
    }
    const itemID = panelState.currentItemID;
    if (!itemID) {
      log("未选中文献条目");
      return;
    }
    const question = panelState.questionInput.value.trim();
    if (!question) {
      log("请输入问题");
      return;
    }

    const config = panelState.api.getConfig();
    if (!config?.endpoint) {
      log("请先在设置中填写 API 地址");
      return;
    }
    log("正在提取文本…");
    setBusy(true);
    clearAnswer();
    panelState.abortController = new AbortController();

    try {
      const { text, attachmentID, attachmentTitle } = await panelState.api.extractPDFText(itemID);
      log(`已提取附件：${attachmentTitle || attachmentID}`);

      log("正在发送请求…");
      const response = await panelState.api.sendRequest(
        {
          endpoint: config.endpoint,
          apiKey: config.apiKey,
          model: config.model,
          text,
          question
        },
        panelState.abortController.signal
      );

      const answer = response?.answer ?? response?.data ?? JSON.stringify(response, null, 2);
      if (panelState.answerElement) {
        panelState.answerElement.textContent = answer;
        panelState.answerElement.classList.remove("empty-message");
      }
      log("请求完成");

      try {
        await panelState.api.saveQuestionHistory(itemID, {
          question,
          answer,
          timestamp: Date.now()
        });
      } catch (error) {
        log(`保存历史记录失败：${error.message || error}`);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        log("请求已取消");
      } else {
        if (panelState.answerElement) {
          panelState.answerElement.textContent = "发生错误，详见日志";
          panelState.answerElement.classList.add("empty-message");
        }
        log(`错误：${error.message || error}`);
        if (error.stack) {
          log(error.stack);
        }
      }
    } finally {
      setBusy(false);
      panelState.abortController = null;
    }
  }

  function onCancel() {
    if (panelState.abortController) {
      panelState.abortController.abort();
    }
  }

  async function restoreHistory(itemID) {
    if (!panelState.questionInput) {
      return;
    }
    if (!itemID) {
      clearAnswer();
      return;
    }
    let history = null;
    try {
      history = await panelState.api.loadQuestionHistory(itemID);
    } catch (error) {
      log(`无法加载历史记录：${error.message || error}`);
    }
    if (!history) {
      panelState.questionInput.value = "";
      clearAnswer();
      return;
    }
    panelState.questionInput.value = history.question ?? "";
    if (history.answer) {
      if (panelState.answerElement) {
        panelState.answerElement.textContent = history.answer;
        panelState.answerElement.classList.remove("empty-message");
      }
    } else {
      clearAnswer();
    }
  }

  function openPreferences() {
    if (typeof Zotero !== "undefined" && Zotero.openPreferences) {
      Zotero.openPreferences("pdf-qa-helper-options");
    }
  }

  function openWindow() {
    const itemID = panelState.currentItemID;
    if (!itemID) {
      log("未选中文献条目");
      return;
    }
    try {
      panelState.api.openResultWindow(itemID);
    } catch (error) {
      log(`无法打开窗口：${error.message || error}`);
    }
  }

  const panelBootstrap = {
    init(api) {
      panelState.api = api;
      panelState.currentItemID = null;
      panelState.questionInput = document.getElementById("question");
      panelState.askButton = document.getElementById("ask-button");
      panelState.cancelButton = document.getElementById("cancel-button");
      panelState.logElement = document.getElementById("log");
      panelState.answerElement = document.getElementById("answer");

      panelState.askButton.addEventListener("click", onAsk);
      panelState.cancelButton.addEventListener("click", onCancel);
      document
        .getElementById("open-preferences")
        .addEventListener("click", openPreferences);
      document
        .getElementById("open-window")
        .addEventListener("click", openWindow);

      clearAnswer();
    },

    async updateItem(itemID) {
      panelState.currentItemID = itemID;
      if (!itemID) {
        log("尚未选中条目");
        clearAnswer();
        return;
      }
      await restoreHistory(itemID);
    },

    destroy() {
      panelState.askButton?.removeEventListener("click", onAsk);
      panelState.cancelButton?.removeEventListener("click", onCancel);
      document
        .getElementById("open-preferences")
        ?.removeEventListener("click", openPreferences);
      document
        .getElementById("open-window")
        ?.removeEventListener("click", openWindow);
      panelState.api = null;
      panelState.currentItemID = null;
      panelState.abortController = null;
    }
  };

  window.panelBootstrap = panelBootstrap;
})();
