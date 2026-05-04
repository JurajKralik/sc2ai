sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/TextArea",
  "sap/ui/core/HTML",
  "sc2ai/model/formatter",
  "sc2ai/model/MatchesModel"
], function(Controller, MessageToast, Dialog, Button, TextArea, HTML, Formatter, MatchesModel) {
  "use strict";

  return Controller.extend("sc2ai.controller.App", {
    onInit: async function() {
      var model = this.getOwnerComponent().getModel("matches");
      this.getView().setModel(model, "matches");
      await MatchesModel.loadHeader(model);
      await this._loadMatches(true);
      MatchesModel.loadEloSinceUpdate(model);
    },

    async _loadMatches(reset) {
      var model = this.getView().getModel("matches");
      await MatchesModel.loadMatches(model, reset);
      this._updateEloChart();
    },

    _updateEloChart: function() {
      var model = this.getView().getModel("matches");
      var matches = model.getProperty("/matches") || [];
      var botUpdated = model.getProperty("/botUpdated") || "";
      this._eloChartSvg = Formatter.buildEloSvg(matches, botUpdated);
    },

    onOpenChart: function() {
      var svg = this._eloChartSvg || "";
      if (!svg) {
        MessageToast.show("Not enough data to display chart");
        return;
      }
      if (!this._chartDialog) {
        this._chartHtml = new HTML({
          preferDOM: false,
          content: svg
        });
        this._chartDialog = new Dialog({
          title: "Elo change over time",
          contentWidth: "600px",
          content: [this._chartHtml],
          endButton: new Button({ text: "Close", press: function() { this._chartDialog.close(); }.bind(this) })
        });
        this.getView().addDependent(this._chartDialog);
      } else {
        this._chartHtml.setContent(svg);
      }
      this._chartDialog.open();
    },

    _sortMatchesData: function() {
      MatchesModel.sortMatches(this.getView().getModel("matches"));
    },

    onSortChange: function(event) {
      var selectedItem = event.getParameter("selectedItem");
      var key = selectedItem ? selectedItem.getKey() : "created";
      this.getView().getModel("matches").setProperty("/sort/key", key);
      this._sortMatchesData();
    },

    onToggleSortDirection: function() {
      var model = this.getView().getModel("matches");
      var current = !!model.getProperty("/sort/descending");
      model.setProperty("/sort/descending", !current);
      this._sortMatchesData();
    },


    onUpdateFinished: async function(event) {
      var reason = event.getParameter("reason");
      var actual = event.getSource().getItems().length;
      var model = this.getView().getModel("matches");
      var loaded = model.getProperty("/paging/loadedCount") || 0;
      var hasMore = !!model.getProperty("/paging/hasMore");
      var loadingMore = !!model.getProperty("/paging/loadingMore");
      if (reason === "Growing" && actual >= loaded && hasMore && !loadingMore) {
        await this._loadMatches(false);
      }
    },

    onRefresh: async function() {
      await this._loadMatches(true);
      MessageToast.show("Recent matches refreshed");
    },

    onOpenLog: async function(event) {
      var context = event.getSource().getBindingContext("matches");
      var match = context ? context.getObject() : null;
      if (!match || !match.id) {
        MessageToast.show("Match log unavailable");
        return;
      }
      try {
        var response = await fetch("/api/match-log?matchId=" + encodeURIComponent(match.id));
        if (!response.ok) {
          throw new Error("Log request failed: " + response.status);
        }
        var payload = await response.json();
        if (!this._logDialog) {
          this._logArea = new TextArea({ width: "100%", height: "30rem", editable: false });
          this._logDialog = new Dialog({
            title: "Bot log",
            contentWidth: "80%",
            contentHeight: "70%",
            stretchOnPhone: true,
            content: [this._logArea],
            beginButton: new Button({ 
              text: "Download Replay", 
              press: function() { 
                if (this._currentMatch && this._currentMatch.replay) {
                  window.open(this._currentMatch.replay, "_blank", "noopener,noreferrer");
                } else {
                  MessageToast.show("Replay not available");
                }
              }.bind(this) 
            }),
            endButton: new Button({ text: "Close", press: function() { this._logDialog.close(); }.bind(this) })
          });
          this.getView().addDependent(this._logDialog);
        }
        this._currentMatch = match;
        this._logDialog.setTitle("Bot log for match " + match.id);
        this._logArea.setValue(payload.stdout || "");
        this._logDialog.getBeginButton().setEnabled(!!match.replay);
        this._logDialog.open();
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load bot log: " + error.message);
      }
    },

    onCopyMatchId: function(event) {
      event.cancelBubble();
      var context = event.getSource().getBindingContext("matches");
      var matchId = context ? context.getProperty("id") : null;
      if (!matchId) return;
      navigator.clipboard.writeText("!q " + matchId).then(function() {
        MessageToast.show("Copied: !q " + matchId);
      });
    },

    onOpenLink: function(event) {
      event.cancelBubble();
      var customData = event.getSource().getCustomData() || [];
      var url = customData.length ? customData[0].getValue() : "";
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  });
});