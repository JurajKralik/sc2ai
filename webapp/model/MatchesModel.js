sap.ui.define([
  "sap/m/MessageToast",
  "sc2ai/model/formatter"
], function(MessageToast, Formatter) {
  "use strict";

  return {

    mergeMatches: function(existing, incoming) {
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

    buildSummary: function(matches, botUpdated) {
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

    sortMatches: function(model) {
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

    loadHeader: async function(model) {
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

    loadEloSinceUpdate: async function(model) {
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

    loadMatches: async function(model, reset) {
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
        var matches = this.mergeMatches(existing, incoming);
        var newestMatchId = matches.length > 0 ? Math.max.apply(null, matches.map(function(m) { return Number(m.id); })) : null;
        if (newestMatchId) {
          localStorage.setItem("sc2ai_lastSeenMatchId", String(newestMatchId));
        }
        model.setProperty("/matches", matches);
        model.setProperty("/summary", this.buildSummary(matches, botUpdated));
        model.setProperty("/paging/totalCount", paging.count || matches.length);
        model.setProperty("/paging/loadedCount", matches.length);
        model.setProperty("/paging/nextOffset", offset + limit);
        model.setProperty("/paging/hasMore", !!paging.next);
        this.sortMatches(model);
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load matches: " + error.message);
      } finally {
        model.setProperty("/loading", false);
        model.setProperty("/paging/loadingMore", false);
      }
    }

  };
});
