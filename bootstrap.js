const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = [];

let gAddon = null;

function install(data, reason) {}
function uninstall(data, reason) {}

function startup(data, reason) {
  const resourceURI = data.resourceURI.spec;
  Services.scriptloader.loadSubScript(resourceURI + "chrome/content/background.js", this);
  gAddon = new ZoteroPDFQAAddon({ addonID: data.id, rootURI: resourceURI });
  gAddon.onStartup(reason);
}

function shutdown(data, reason) {
  if (gAddon) {
    gAddon.onShutdown(reason);
    gAddon = null;
  }
}
