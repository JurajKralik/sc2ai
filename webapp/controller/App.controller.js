sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/ui/model/Sorter",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/TextArea",
  "sap/ui/core/HTML"
], function(Controller, MessageToast, Sorter, Dialog, Button, TextArea, HTML) {
  "use strict";

  function buildEloSvg(matches, botUpdated) {
    var cutoff = botUpdated ? new Date(botUpdated).getTime() : null;
    var relevant = matches.filter(function(m) {
      if (m.eloChange === null || m.eloChange === undefined || m.eloChange === "") return false;
      if (!cutoff || isNaN(cutoff)) return true;
      var when = m.started || m.created;
      return when ? new Date(when).getTime() >= cutoff : false;
    }).slice().sort(function(a, b) {
      return new Date(a.started || a.created).getTime() - new Date(b.started || b.created).getTime();
    });
    if (relevant.length < 2) return "";
    var W = 600, H = 70, pad = 8;
    var cumulative = [];
    var running = 0;
    relevant.forEach(function(m) { running += Number(m.eloChange); cumulative.push(running); });
    var min = Math.min(0, Math.min.apply(null, cumulative));
    var max = Math.max(0, Math.max.apply(null, cumulative));
    var range = max - min || 1;
    var n = cumulative.length;
    var zeroY = (pad + ((max - 0) / range) * (H - 2 * pad)).toFixed(1);
    var points = cumulative.map(function(v, i) {
      var x = (pad + (i / (n - 1)) * (W - 2 * pad)).toFixed(1);
      var y = (pad + ((max - v) / range) * (H - 2 * pad)).toFixed(1);
      return x + "," + y;
    }).join(" ");
    var last = cumulative[cumulative.length - 1];
    var stroke = last >= 0 ? "#4caf50" : "#f44336";
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + W + " " + H + "' style='width:100%;height:70px;display:block'>" +
      "<line x1='" + pad + "' y1='" + zeroY + "' x2='" + (W - pad) + "' y2='" + zeroY + "' stroke='#888' stroke-width='1' stroke-dasharray='4,4'/>" +
      "<polyline points='" + points + "' fill='none' stroke='" + stroke + "' stroke-width='2.5' stroke-linejoin='round' stroke-linecap='round'/>" +
      "</svg>";
  }

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

  function relativeStartedDate(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return value;
    }
    var now = new Date();
    var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var startOfValueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var diffDays = Math.round((startOfToday - startOfValueDay) / 86400000);
    var hhmm = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    if (diffDays <= 0) {
      return hhmm;
    }
    return "(-" + diffDays + ") " + hhmm;
  }

  function raceIconPath(race) {
    if (race === "P") return "assets/protoss.svg";
    if (race === "T") return "assets/terran.svg";
    if (race === "Z") return "assets/zerg.svg";
    return "assets/random.svg";
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

  function formatGameLength(gameSteps) {
    var steps = Number(gameSteps || 0);
    if (!steps || steps < 0) {
      return { text: "", state: "None" };
    }
    var seconds = Math.round(steps / 22.4);
    var minutes = Math.floor(seconds / 60);
    var remaining = seconds % 60;
    var state = "None";
    if (seconds > 3599) {
      state = "Error";
    } else if (seconds > 1800) {
      state = "Warning";
    }
    return {
      text: minutes + ":" + String(remaining).padStart(2, "0"),
      state: state
    };
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

  function eloChangeDisplay(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    var num = Number(value);
    if (isNaN(num)) {
      return "";
    }
    var count = Math.abs(num);
    if (count === 0) {
      return "○";
    }
    return "●".repeat(count);
  }

  function eloChangeState(value) {
    if (value === null || value === undefined || value === "") {
      return "None";
    }
    var num = Number(value);
    if (isNaN(num)) {
      return "None";
    }
    if (num > 0) return "Success";
    if (num < 0) return "Error";
    return "None";
  }

  function eloSinceUpdateDisplay(delta) {
    if (delta === null || delta === undefined || delta === "") {
      return "";
    }
    var num = Number(delta);
    if (isNaN(num)) {
      return "";
    }
    return num > 0 ? "+" + num : String(num);
  }

  function eloSinceUpdateState(delta) {
    if (delta === null || delta === undefined || delta === "") {
      return "None";
    }
    var num = Number(delta);
    if (isNaN(num)) {
      return "None";
    }
    if (num > 0) return "Success";
    if (num < 0) return "Error";
    return "None";
  }

  function dateState(dateValue, botUpdated) {
    if (!dateValue || !botUpdated) {
      return "None";
    }
    var ts = new Date(dateValue).getTime();
    var cutoff = new Date(botUpdated).getTime();
    if (isNaN(ts) || isNaN(cutoff)) {
      return "None";
    }
    return ts < cutoff ? "Warning" : "None";
  }

  function normalizeMatch(match, botId, botName, raceMap, botUpdated, participationMap, lastSeenMatchId) {
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
    var isNew = lastSeenMatchId ? Number(match.id) > Number(lastSeenMatchId) : false;

    var state = "None";
    if (outcome === "Win") {
      state = "Success";
    } else if (outcome === "Loss") {
      state = "Error";
    } else if (outcome === "Tie" || result.type === "InitializationError") {
      state = "Warning";
    }

    var displayResultType = normalizeResultType(result.type || "Unknown");
    var gameLength = formatGameLength(result.game_steps);
    var participation = participationMap[match.id] || {};
    var outcomeDisplay = outcome;
    if (displayResultType) {
      outcomeDisplay = outcome + "\n(" + displayResultType + ")";
    }

    return {
      id: match.id,
      isNew: isNew,
      matchIdState: isNew ? "Information" : "None",
      created: match.created,
      createdDisplay: resultSafeDate(match.created),
      started: match.started,
      startedDisplay: relativeStartedDate(match.started || match.created),
      startedState: dateState(match.started || match.created, botUpdated),
      map: match.map,
      opponent: opponent,
      opponentRace: opponentRace,
      opponentRaceDisplay: raceDisplay(opponentRace),
      opponentRaceIcon: raceIconPath(opponentRace),
      opponentRaceState: raceState(opponentRace),
      outcome: outcome,
      outcomeDisplay: outcomeDisplay,
      state: state,
      resultType: result.type || "Unknown",
      resultTypeDisplay: displayResultType,
      resultTypeState: resultTypeState(displayResultType),
      gameSteps: result.game_steps || 0,
      gameLength: gameLength.text,
      gameLengthState: gameLength.state,
      eloChange: participation.eloChange,
      eloChangeDisplay: eloChangeDisplay(participation.eloChange),
      eloChangeState: eloChangeState(participation.eloChange),
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
        var bot = payload.bot;
        var botUpdated = payload.botUpdated || bot.bot_zip_updated || "";
        var data = payload.matches;
        var ranking = payload.ranking || {};
        var eloSinceUpdate = payload.eloSinceUpdate || {};
        var paging = payload.paging || {};
        var raceMap = payload.raceMap || {};
        var participationMap = payload.participationMap || {};
        var botId = String(bot.id);
        var incoming = (data.results || []).map(function(match) {
          return normalizeMatch(match, botId, bot.name, raceMap, botUpdated, participationMap, lastSeenMatchId);
        }).filter(function(match) {
          return match.resultType !== "Unknown";
        });
        var existing = reset ? [] : (model.getProperty("/matches") || []);
        var matches = this._mergeMatches(existing, incoming);
        var newestMatchId = matches.length > 0 ? Math.max.apply(null, matches.map(function(m) { return Number(m.id); })) : null;
        if (newestMatchId) {
          localStorage.setItem("sc2ai_lastSeenMatchId", String(newestMatchId));
        }
        model.setProperty("/botName", bot.name);
        model.setProperty("/botUpdated", botUpdated);
        model.setProperty("/botUpdatedDisplay", resultSafeDate(botUpdated));
        model.setProperty("/botRaceIcon", raceIconPath((bot.plays_race || {}).label || "R"));
        model.setProperty("/ranking", ranking);
        model.setProperty("/eloSinceUpdate", {
          baseline: eloSinceUpdate.baseline,
          current: eloSinceUpdate.current,
          delta: eloSinceUpdate.delta,
          display: eloSinceUpdateDisplay(eloSinceUpdate.delta),
          state: eloSinceUpdateState(eloSinceUpdate.delta)
        });
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
      this._eloChartSvg = buildEloSvg(matches, botUpdated);
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
          title: "Elo change since last bot update",
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