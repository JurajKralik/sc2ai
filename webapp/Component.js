sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function(UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("sc2ai.Component", {
    metadata: {
      interfaces: ["sap.ui.core.IAsyncContentCreation"],
      rootView: {
        viewName: "sc2ai.view.App",
        type: "XML",
        async: true,
        id: "app"
      }
    },

    init: function() {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(new JSONModel({
        loading: true,
        botName: "RustyNikolaj",
        botUpdated: "",
        botUpdatedDisplay: "",
        botRaceIcon: "",
        ranking: {
          elo: "",
          division: "",
          overallRank: "",
          overallTotal: "",
          divisionRank: "",
          divisionTotal: ""
        },
        eloSinceUpdate: {
          baseline: "",
          current: "",
          delta: null,
          display: "",
          state: "None"
        },
        summary: {
          total: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          initErrors: 0,
          winRate: "0%"
        },
        paging: {
          limit: 100,
          offset: 0,
          totalCount: 0,
          loadedCount: 0,
          nextOffset: 0,
          hasMore: true,
          loadingMore: false
        },
        sort: {
          key: "started",
          descending: true
        },
        matches: []
      }), "matches");
    }
  });
});
