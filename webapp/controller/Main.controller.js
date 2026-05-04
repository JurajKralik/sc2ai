sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/TextArea",
  "sap/ui/core/HTML",
  "sc2ai/model/formatter"
], function(Controller, MessageToast, Dialog, Button, TextArea, HTML, Formatter) {
  "use strict";

  return Controller.extend("sc2ai.controller.App", {
    onInit: async function() {
      var model = this.getOwnerComponent().getModel("matches");
      this.getView().setModel(model, "matches");
      await this._loadHeader();
      await this._loadMatches(true);
      this._loadEloSinceUpdate();
    },

    _mergeMatches: function(existing, incoming) {
      var seen = {};
      var merged = [];
      existing.concat(incoming).forEach(function(match) {
        if (!seen[match.id]) {
          seen[match.id] = true;
          merged.push(match);
        }
      });
      return merged;
    },

    _buildSummary: function(matches, botUpdated) {
      var cutoff = botUpdated ? new Date(botUpdated).getTime() : null;
      var filtered = matches.filter(function(match) {
        if (!cutoff || isNaN(cutoff)) {
          return true;
        }
        var when = match.started || match.created;
        var ts = when ? new Date(when).getTime() : 0;
        return ts >= cutoff;
      });
      var summary = filtered.reduce(function(acc, match) {
        acc.total += 1;
        if (match.outcome === "Win") {
          acc.wins += 1;
        } else if (match.outcome === "Loss") {
          acc.losses += 1;
        } else if (match.outcome === "Tie") {
          acc.ties += 1;
        }
        if (match.resultType === "InitializationError") {
          acc.initErrors += 1;
        }
        return acc;
      }, { total: 0, wins: 0, losses: 0, ties: 0, initErrors: 0 });
      summary.winRate = summary.total ? Math.round((summary.wins / summary.total) * 100) + "%" : "0%";
      return summary;
    },

    async _loadHeader() {
      var model = this.getView().getModel("matches");
      try {
        var response = await fetch("/api/header");
        if (!response.ok) {
          throw new Error("Header request failed: " + response.status);
        }
        var payload = await response.json();
        var bot = payload.bot || {};
        var botUpdated = payload.botUpdated || bot.bot_zip_updated || "";
        var ranking = payload.ranking || {};
        model.setProperty("/botId", bot.id != null ? String(bot.id) : "");
        model.setProperty("/botName", bot.name || "");
        model.setProperty("/botUpdated", botUpdated);
        model.setProperty("/botUpdatedDisplay", Formatter.resultSafeDate(botUpdated));
        model.setProperty("/botRaceIcon", Formatter.raceIconPath((bot.plays_race || {}).label || "R"));
        model.setProperty("/ranking", ranking);
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load header: " + error.message);
      }
    },

    async _loadEloSinceUpdate() {
      var model = this.getView().getModel("matches");
      try {
        var response = await fetch("/api/elo-since-update");
        if (!response.ok) {
          throw new Error("Elo-since-update request failed: " + response.status);
        }
        var payload = await response.json();
        var eloSinceUpdate = payload.eloSinceUpdate || {};
        model.setProperty("/eloSinceUpdate", {
          baseline: eloSinceUpdate.baseline,
          current: eloSinceUpdate.current,
          delta: eloSinceUpdate.delta,
          display: Formatter.eloSinceUpdateDisplay(eloSinceUpdate.delta),
          state: Formatter.eloSinceUpdateState(eloSinceUpdate.delta)
        });
      } catch (error) {
        console.error(error);
      }
    },

    async _loadMatches(reset) {
      var model = this.getView().getModel("matches");
      var limit = model.getProperty("/paging/limit") || 100;
      var offset = reset ? 0 : (model.getProperty("/paging/nextOffset") || 0);
      model.setProperty("/loading", !!reset);
      model.setProperty("/paging/loadingMore", !reset);
      try {
        var lastSeenMatchId = localStorage.getItem("sc2ai_lastSeenMatchId") || null;
        var response = await fetch("/api/recent-matches?limit=" + limit + "&offset=" + offset);
        if (!response.ok) {
          throw new Error("Recent matches request failed: " + response.status);
        }
        var payload = await response.json();
        var data = payload.matches;
        var paging = payload.paging || {};
        var raceMap = payload.raceMap || {};
        var participationMap = payload.participationMap || {};
        var botName = model.getProperty("/botName") || "";
        var botUpdated = model.getProperty("/botUpdated") || "";
        var botId = model.getProperty("/botId") || "939";
        var incoming = (data.results || []).map(function(match) {
          return Formatter.normalizeMatch(match, botId, botName, raceMap, botUpdated, participationMap, lastSeenMatchId);
        }).filter(function(match) {
          return match.resultType !== "Unknown";
        });
        var existing = reset ? [] : (model.getProperty("/matches") || []);
        var matches = this._mergeMatches(existing, incoming);
        var newestMatchId = matches.length > 0 ? Math.max.apply(null, matches.map(function(m) { return Number(m.id); })) : null;
        if (newestMatchId) {
          localStorage.setItem("sc2ai_lastSeenMatchId", String(newestMatchId));
        }
        model.setProperty("/matches", matches);
        model.setProperty("/summary", this._buildSummary(matches, botUpdated));
        model.setProperty("/paging/totalCount", paging.count || matches.length);
        model.setProperty("/paging/loadedCount", matches.length);
        model.setProperty("/paging/nextOffset", offset + limit);
        model.setProperty("/paging/hasMore", !!paging.next);
        this._sortMatchesData();
        this._updateEloChart();
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load matches: " + error.message);
      } finally {
        model.setProperty("/loading", false);
        model.setProperty("/paging/loadingMore", false);
      }
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
      var model = this.getView().getModel("matches");
      var key = model.getProperty("/sort/key") || "created";
      var descending = !!model.getProperty("/sort/descending");
      var matches = (model.getProperty("/matches") || []).slice();
      matches.sort(function(a, b) {
        var av = a[key];
        var bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return descending ? 1 : -1;
        if (bv == null) return descending ? -1 : 1;
        if (av < bv) return descending ? 1 : -1;
        if (av > bv) return descending ? -1 : 1;
        return 0;
      });
      model.setProperty("/matches", matches);
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