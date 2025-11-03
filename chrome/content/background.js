const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

if (!globalThis.ZoteroPDFQAAddon) {
  class ZoteroPDFQAAddon {
    constructor({ addonID, rootURI }) {
      this.addonID = addonID;
      this.rootURI = rootURI;
      this.sectionRegistration = null;
      this.unloaders = [];
      this.windowTracker = new Set();
    }

    async onStartup(reason) {
      await Zotero.initializationPromise;
      this.registerPreferencePane();
      this.registerItemPaneSection();
      this.registerWindowListeners();
    }

    onShutdown(reason) {
      for (const unloader of this.unloaders.splice(0)) {
        try {
          unloader();
        } catch (err) {
          Zotero.logError(err);
        }
      }
      this.sectionRegistration = null;
      this.windowTracker.clear();
    }

    registerWindowListeners() {
      const handler = window => {
        if (!window.ZoteroPane) {
          return;
        }
        if (this.windowTracker.has(window)) {
          return;
        }
        this.windowTracker.add(window);
        window.addEventListener("unload", () => this.windowTracker.delete(window), { once: true });
      };

      for (const window of Zotero.getMainWindows()) {
        handler(window);
      }

      const observer = {
        observe: (subject, topic) => {
          if (topic === "domwindowopened") {
            subject.addEventListener(
              "load",
              () => {
                handler(subject);
              },
              { once: true }
            );
          }
        }
      };

      Services.ww.registerNotification(observer);
      this.unloaders.push(() => Services.ww.unregisterNotification(observer));
    }

    registerPreferencePane() {
      const paneID = "pdf-qa-helper-options";
      if (Zotero.PreferencePanes.get(paneID)) {
        return;
      }
      Zotero.PreferencePanes.register({
        id: paneID,
        label: "PDF 问答助手",
        image: null,
        paneType: "iframe",
        url: this.rootURI + "chrome/content/options.xhtml"
      });
      this.unloaders.push(() => Zotero.PreferencePanes.unregister(paneID));
    }

    registerItemPaneSection() {
      const sectionID = "pdf-qa-helper-section";
      if (this.sectionRegistration) {
        return;
      }
      const registration = Zotero.ItemPaneManager.registerSection({
        id: sectionID,
        label: "PDF 问答助手",
        order: 50,
        icon: null,
        supportItems: true,
        html: this.rootURI + "chrome/content/panel.xhtml",
        onLoad: (iframeWindow) => {
          iframeWindow.panelBootstrap?.init(this.createPanelAPI());
        },
        onUnload: (iframeWindow) => {
          iframeWindow.panelBootstrap?.destroy();
        },
        onUpdate: (iframeWindow, item) => {
          iframeWindow.panelBootstrap?.updateItem(item?.id ?? null);
        }
      });
      this.sectionRegistration = registration;
      this.unloaders.push(() => {
        registration.unregister();
      });
    }

    createPanelAPI() {
      return {
        getConfig: () => this.getConfig(),
        saveQuestionHistory: (itemID, payload) => this.saveHistory(itemID, payload),
        loadQuestionHistory: (itemID) => this.loadHistory(itemID),
        extractPDFText: (itemID) => this.extractPDFText(itemID),
        sendRequest: (payload, signal) => this.sendRemoteRequest(payload, signal),
        openResultWindow: (itemID) => this.openResultWindow(itemID)
      };
    }

    getConfig() {
      return {
        endpoint: Zotero.Prefs.get("extensions.pdf-qa-helper.endpoint", true),
        apiKey: Zotero.Prefs.get("extensions.pdf-qa-helper.apiKey", true),
        model: Zotero.Prefs.get("extensions.pdf-qa-helper.model", true)
      };
    }

    async saveHistory(itemID, payload) {
      try {
        const key = `extensions.pdf-qa-helper.history.${itemID}`;
        await Zotero.Prefs.setAsync(key, JSON.stringify(payload));
      } catch (err) {
        Zotero.logError(err);
      }
    }

    async loadHistory(itemID) {
      const key = `extensions.pdf-qa-helper.history.${itemID}`;
      const raw = await Zotero.Prefs.getAsync(key);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (err) {
        Zotero.logError(err);
        return null;
      }
    }

    async extractPDFText(itemID) {
      if (!itemID) {
        throw new Error("未选中条目");
      }
      const item = Zotero.Items.get(itemID);
      if (!item) {
        throw new Error("无法加载条目信息");
      }
      if (!item.isRegularItem()) {
        throw new Error("只能对参考文献条目使用");
      }
      let attachment = null;
      if (Zotero.Items.getBestAttachment) {
        attachment = await Zotero.Items.getBestAttachment(item.id, { includeTrashed: false });
      }
      if (!attachment) {
        const attachmentIDs = item.getAttachments();
        for (const id of attachmentIDs) {
          const candidate = Zotero.Items.get(id);
          if (candidate?.isAttachment() && candidate.isPDFAttachment?.()) {
            attachment = candidate;
            break;
          }
        }
      }

      if (!attachment) {
        throw new Error("未找到 PDF 附件");
      }
      const isPDF = attachment.isPDFAttachment?.() || attachment.attachmentMIMEType === "application/pdf";
      if (!isPDF) {
        throw new Error("附件不是 PDF 文件");
      }

      const extractor = async () => {
        if (Zotero.Fulltext?.getDocumentTextFromAttachment) {
          return Zotero.Fulltext.getDocumentTextFromAttachment(attachment.id);
        }
        if (Zotero.PDFWorker?.getText) {
          return Zotero.PDFWorker.getText(attachment.id);
        }
        throw new Error("当前 Zotero 版本不支持 PDF 文本提取");
      };

      const text = await extractor();
      if (!text) {
        throw new Error("未能提取到 PDF 文本");
      }
      return {
        text,
        attachmentID: attachment.id,
        attachmentTitle: attachment.getDisplayTitle()
      };
    }

    async sendRemoteRequest(payload, signal) {
      const { endpoint, apiKey, model, text, question } = payload;
      if (!endpoint) {
        throw new Error("未设置 API 地址");
      }
      if (!question) {
        throw new Error("问题不能为空");
      }
      const body = JSON.stringify({
        model,
        question,
        document: text
      });
      const headers = {
        "Content-Type": "application/json"
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`请求失败: ${response.status} ${errorText}`);
      }
      const responseText = await response.text();
      try {
        return JSON.parse(responseText);
      } catch (err) {
        if (responseText) {
          return { answer: responseText };
        }
        throw err;
      }
    }

    openResultWindow(itemID) {
      if (!itemID) {
        throw new Error("未选中条目");
      }
      const windowURL = this.rootURI + "chrome/content/resultWindow.xhtml";
      const features = "chrome,centerscreen,resizable";
      const win = Services.ww.openWindow(null, windowURL, "pdf-qa-helper-window", features, null);
      win.addEventListener(
        "load",
        () => {
          win.resultWindowBootstrap?.init({
            api: {
              loadQuestionHistory: (targetItemID) => this.loadHistory(targetItemID),
              getConfig: () => this.getConfig()
            },
            itemID
          });
        },
        { once: true }
      );
    }
  }

  globalThis.ZoteroPDFQAAddon = ZoteroPDFQAAddon;
}
