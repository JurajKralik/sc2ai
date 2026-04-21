sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/ui/model/Sorter"
], function(Controller, MessageToast, Sorter) {
  "use strict";

  function resultSafeDate(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return value;
    }
    var pad = function(num) { return String(num).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function normalizeMatch(match, botId, botName) {
    var result = match.result || {};
    var winner = result.winner;
    var bot1 = result.bot1_name || "Bot 1";
    var bot2 = result.bot2_name || "Bot 2";
    var isBot1 = String(bot1) === String(botName);
    var opponent = isBot1 ? bot2 : bot1;
    var outcome = winner === null
      ? (result.type === "Tie" ? "Tie" : "No result")
      : String(winner) === String(botId) ? "Win" : "Loss";

    var state = "None";
    if (outcome === "Win") {
      state = "Success";
    } else if (outcome === "Loss") {
      state = "Error";
    } else if (outcome === "Tie" || result.type === "InitializationError") {
      state = "Warning";
    }

    return {
      id: match.id,
      created: match.created,
      createdDisplay: resultSafeDate(match.created),
      started: match.started,
      startedDisplay: resultSafeDate(match.started || match.created),
      map: match.map,
      opponent: opponent,
      outcome: outcome,
      state: state,
      resultType: result.type || "Unknown",
      gameSteps: result.game_steps || 0,
      replay: result.replay_file || "",
      log: result.arenaclient_log || ""
    };
  }

  return Controller.extend("sc2ai.controller.App", {
    onInit: async function() {
      var model = this.getOwnerComponent().getModel("matches");
      this.getView().setModel(model, "matches");
      await this._loadMatches();
    },

    async _loadMatches() {
      var model = this.getView().getModel("matches");
      var limit = model.getProperty("/paging/limit") || 100;
      var offset = model.getProperty("/paging/offset") || 0;
      model.setProperty("/loading", true);
      try {
        var response = await fetch("/api/recent-matches?limit=" + limit + "&offset=" + offset);
        if (!response.ok) {
          throw new Error("Recent matches request failed: " + response.status);
        }
        var payload = await response.json();
        var bot = payload.bot;
        var data = payload.matches;
        var botId = String(bot.id);
        var matches = (data.results || []).map(function(match) {
          return normalizeMatch(match, botId, bot.name);
        }).filter(function(match) {
          return match.resultType !== "Unknown";
        });
        var summary = matches.reduce(function(acc, match) {
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
        model.setProperty("/botName", bot.name);
        model.setProperty("/summary", summary);
        model.setProperty("/matches", matches);
        model.setProperty("/paging/totalCount", matches.length);
        this._applySort();
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load matches: " + error.message);
      } finally {
        model.setProperty("/loading", false);
      }
    },

    _applySort: function() {
      var table = this.byId("matchesTable");
      var model = this.getView().getModel("matches");
      var key = model.getProperty("/sort/key") || "created";
      var descending = !!model.getProperty("/sort/descending");
      var binding = table.getBinding("items");
      if (binding) {
        binding.sort(new Sorter(key, descending));
      }
    },

    onSortChange: function(event) {
      var selectedItem = event.getParameter("selectedItem");
      var key = selectedItem ? selectedItem.getKey() : "created";
      this.getView().getModel("matches").setProperty("/sort/key", key);
      this._applySort();
    },

    onToggleSortDirection: function() {
      var model = this.getView().getModel("matches");
      var current = !!model.getProperty("/sort/descending");
      model.setProperty("/sort/descending", !current);
      this._applySort();
    },


    onRefresh: async function() {
      await this._loadMatches();
      MessageToast.show("Recent matches refreshed");
    },

    onOpenLink: function(event) {
      var customData = event.getSource().getCustomData() || [];
      var url = customData.length ? customData[0].getValue() : "";
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  });
});