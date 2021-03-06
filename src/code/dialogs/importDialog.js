import WasabeeOp from "../operation";
import WasabeePortal from "../portal";
import { Feature } from "../leafletDrawImports";
import { getSelectedOperation, makeSelectedOperation } from "../selectedOp";

const ImportDialogControl = Feature.extend({
  statics: {
    TYPE: "importDialog"
  },

  initialize: function(map, options) {
    if (!map) map = window.map;
    this.type = ImportDialogControl.TYPE;
    Feature.prototype.initialize.call(this, map, options);
  },

  addHooks: function() {
    if (!this._map) return;
    Feature.prototype.addHooks.call(this);
    this._displayDialog();
  },

  removeHooks: function() {
    Feature.prototype.removeHooks.call(this);
  },

  _displayDialog: function() {
    if (!this._map) return;
    this.idialog = new ImportDialog();
    const idhandler = this;
    this._dialog = window.dialog({
      title: "Import Wasabee Operation",
      width: "auto",
      height: "auto",
      html: this.idialog.container,
      buttons: {
        OK: () => {
          this.idialog.importTextareaAsOp();
          window.runHooks("wasabeeUIUpdate", getSelectedOperation());
          this._dialog.dialog("close");
        },
        "Get existing DrawTools draw": () => {
          this.idialog.drawToolsFormat();
        }
      },
      dialogClass: "wasabee-dialog-mustauth",
      closeCallback: () => {
        idhandler.disable();
        delete idhandler._dialog;
      },
      id: window.plugin.wasabee.static.dialogNames.importDialog
    });
  }
});

export default ImportDialogControl;

// XXX move all this into the main class, no need for a sub class for this
class ImportDialog {
  constructor() {
    this.container = L.DomUtil.create("div", "");

    // Input area
    this.textarea = L.DomUtil.create("textarea", "", this.container);
    this.textarea.rows = 20;
    this.textarea.cols = 80;
    this.textarea.placeholder =
      "Paste a Wasabee draw export here.\n\nWasabee cannot import the stock intel format.\n\nThere is experimental support for importing the IITC DrawTools format.\n\nBefore importing DrawTools format, preview the areas and make sure all the portals load so IITC has them cached. Any portals that are not pre-cached will be faked.\n\nYou will need to use the 'swap' feature to move anchors from the faked portals to the real portals (they should be in the correct location, just not associated with the portal.\n\nCached portals might not be properly named.";
  }

  drawToolsFormat() {
    if (window.plugin.drawTools.drawnItems) {
      /* const tmp = new Array();
      for (const l of window.plugin.drawTools.drawnItems._layers) {
        if (layer instanceof L.GeodesicPolyline || layer instanceof L.Polyline) {
	}
      } */
      // this.textarea.value = JSON.stringify(tmp);
      this.textarea.value = localStorage["plugin-draw-tools-layer"];
    } else {
      this.textarea.placeholder = "No DrawTools drawn items detected";
    }
  }

  importTextareaAsOp() {
    const string = this.textarea.value;
    if (
      string.match(
        new RegExp("^(https?://)?(www\\.)?intel.ingress.com/intel.*")
      )
    ) {
      alert("Wasabee doesn't support stock intel draw imports");
      return;
    }

    // check to see if it is drawtools
    if (string.match(new RegExp(".*polyline.*"))) {
      console.log("trying to import IITC Drawtools format... wish me luck");
      const newop = this.parseDrawTools(string);
      newop.updatePortalsFromIITCData();
      newop.store();
      makeSelectedOperation(newop.ID);
      return;
    }

    // assume a Wasabee op
    try {
      const data = JSON.parse(string);
      const importedOp = WasabeeOp.create(data);
      importedOp.store();
      makeSelectedOperation(importedOp.ID);
      alert("Imported Operation: " + importedOp.name + " Successfuly.");
    } catch (e) {
      console.warn("WasabeeTools: failed to import data: " + e);
      alert("Import Failed.");
    }
  }

  parseDrawTools(string) {
    const newop = new WasabeeOp();
    newop.name = "Imported Drawtools Op: " + new Date().toGMTString();
    const data = JSON.parse(string);

    // pass one, try to prime the pump
    /* for (const line of data) {
      if (line.type == "polyline") {
        for (const point of line.latLngs) {
          window.selectPortalByLatLng(point.lat, point.lng);
        }
      }
    } */

    // build a hash map for fast searching of window.portals
    const pmap = this.buildWindowPortalMap();

    let faked = 0;
    let found = 0;
    // pass two, convert points to portals
    for (const line of data) {
      if (line.type != "polyline") {
        continue;
      }

      let prev = false;

      for (const point of line.latLngs) {
        // try the op first
        let portal = newop.getPortalByLatLng(point.lat, point.lng);

        // look to see if it is known
        if (!portal) {
          portal = this.searchWindowPortals(point, pmap);
          if (portal) {
            newop.addPortal(portal);
            found++;
          }
        }

        // worst case: fake it
        if (!portal) {
          const p = WasabeePortal.fake(point.lat, point.lng);
          newop.addPortal(p);
          portal = p;
          faked++;
        }
        if (portal && prev) {
          newop.addLink(prev, portal);
        }
        prev = portal;
      }
    }
    alert(
      "Import Complete. Found " +
        found +
        " portals. Faked " +
        faked +
        ". Please use the swap feature to move faked portals to the real portals at the same location."
    );
    return newop;
  }

  // build a fast lookup map of known portals
  buildWindowPortalMap() {
    const pmap = new Map();
    for (const portalID in window.portals) {
      const ll = window.portals[portalID].getLatLng();
      const key = ll.lat + "/" + ll.lng;
      pmap.set(key, portalID);
    }
    return pmap;
  }

  searchWindowPortals(latLng, pmap) {
    const key = latLng.lat + "/" + latLng.lng;
    if (pmap.has(key)) {
      const portalID = pmap.get(key);
      const np = new WasabeePortal(
        portalID,
        "[loading name: " + portalID + "]",
        latLng.lat,
        latLng.lng
      );
      return np;
    }
    return false;
  }
}
