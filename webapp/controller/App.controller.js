sap.ui.define([
  "sap/ui/core/mvc/Controller"
], function(Controller) {
  "use strict";
  return Controller.extend("sc2ai.controller.App", {
    onInit: function() {
      this.getView().byId("app").addPage(sap.ui.xmlview("sc2ai.view.Main"));
    }
  });
});