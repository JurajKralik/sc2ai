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

  function raceDisplay(race) {
    if (race === "P") return "Protoss";
    if (race === "T") return "Terran";
    if (race === "Z") return "Zerg";
    return "Random";
  }

  function raceState(race) {
    if (race === "P") return "Warning";
    if (race === "T") return "Information";
    if (race === "Z") return "Error";
    return "Success";
  }

  function normalizeResultType(rawType) {
    if (!rawType || rawType === "Player1Win" || rawType === "Player2Win" || rawType === "Tie") {
      return "";
    }
    if (rawType === "InitializationError") {
      return "Error";
    }
    if (rawType.indexOf("Crash") !== -1) {
      return "Crash";
    }
    if (rawType.indexOf("TimeOut") !== -1 || rawType.indexOf("Timeout") !== -1) {
      return "Timeout";
    }
    return rawType;
  }

  function resultTypeState(displayType) {
    if (displayType === "Crash" || displayType === "Timeout" || displayType === "Error") {
      return "Error";
    }
    return "None";
  }

  function normalizeMatch(match, botId, botName, raceMap) {
    var result = match.result || {};
    var winner = result.winner;
    var bot1 = result.bot1_name || "Bot 1";
    var bot2 = result.bot2_name || "Bot 2";
    var isBot1 = String(bot1) === String(botName);
    var opponent = isBot1 ? bot2 : bot1;
    var opponentRace = raceMap[opponent] || "R";
    var outcome = winner === null
      ? (result.type === "Tie" ? "Tie" : "-")
      : String(winner) === String(botId) ? "Win" : "Loss";

    var state = "None";
    if (outcome === "Win") {
      state = "Success";
    } else if (outcome === "Loss") {
      state = "Error";
    } else if (outcome === "Tie" || result.type === "InitializationError") {
      state = "Warning";
    }

    var displayResultType = normalizeResultType(result.type || "Unknown");

    return {
      id: match.id,
      created: match.created,
      createdDisplay: resultSafeDate(match.created),
      started: match.started,
      startedDisplay: resultSafeDate(match.started || match.created),
      map: match.map,
      opponent: opponent,
      opponentRace: opponentRace,
      opponentRaceDisplay: raceDisplay(opponentRace),
      opponentRaceState: raceState(opponentRace),
      outcome: outcome,
      state: state,
      resultType: result.type || "Unknown",
      resultTypeDisplay: displayResultType,
      resultTypeState: resultTypeState(displayResultType),
      gameSteps: result.game_steps || 0,
      replay: result.replay_file || "",
      log: result.arenaclient_log || ""
    };
  }

  return Controller.extend("sc2ai.controller.App", {
    onInit: async function() {
      var model = this.getOwnerComponent().getModel("matches");
      this.getView().setModel(model, "matches");
      await this._loadMatches(true);
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

    _buildSummary: function(matches) {
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
      return summary;
    },

    async _loadMatches(reset) {
      var model = this.getView().getModel("matches");
      var limit = model.getProperty("/paging/limit") || 100;
      var offset = reset ? 0 : (model.getProperty("/paging/nextOffset") || 0);
      model.setProperty("/loading", !!reset);
      model.setProperty("/paging/loadingMore", !reset);
      try {
        var response = await fetch("/api/recent-matches?limit=" + limit + "&offset=" + offset);
        if (!response.ok) {
          throw new Error("Recent matches request failed: " + response.status);
        }
        var payload = await response.json();
        var bot = payload.bot;
        var data = payload.matches;
        var paging = payload.paging || {};
        var raceMap = payload.raceMap || {};
        var botId = String(bot.id);
        var incoming = (data.results || []).map(function(match) {
          return normalizeMatch(match, botId, bot.name, raceMap);
        }).filter(function(match) {
          return match.resultType !== "Unknown";
        });
        var existing = reset ? [] : (model.getProperty("/matches") || []);
        var matches = this._mergeMatches(existing, incoming);
        model.setProperty("/botName", bot.name);
        model.setProperty("/matches", matches);
        model.setProperty("/summary", this._buildSummary(matches));
        model.setProperty("/paging/totalCount", paging.count || matches.length);
        model.setProperty("/paging/loadedCount", matches.length);
        model.setProperty("/paging/nextOffset", offset + limit);
        model.setProperty("/paging/hasMore", !!paging.next);
        this._sortMatchesData();
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load matches: " + error.message);
      } finally {
        model.setProperty("/loading", false);
        model.setProperty("/paging/loadingMore", false);
      }
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

    onOpenLink: function(event) {
      var customData = event.getSource().getCustomData() || [];
      var url = customData.length ? customData[0].getValue() : "";
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  });
});