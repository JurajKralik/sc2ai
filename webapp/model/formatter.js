sap.ui.define([], function() {
  "use strict";

  return {

    buildEloSvg: function(matches, botUpdated) {
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
    },

    resultSafeDate: function(value) {
      if (!value) {
        return "";
      }
      var date = new Date(value);
      if (isNaN(date.getTime())) {
        return value;
      }
      var pad = function(num) { return String(num).padStart(2, "0"); };
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    },

    relativeStartedDate: function(value) {
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
    },

    raceIconPath: function(race) {
      if (race === "P") return "assets/protoss.svg";
      if (race === "T") return "assets/terran.svg";
      if (race === "Z") return "assets/zerg.svg";
      return "assets/random.svg";
    },

    raceDisplay: function(race) {
      if (race === "P") return "Protoss";
      if (race === "T") return "Terran";
      if (race === "Z") return "Zerg";
      return "Random";
    },

    raceState: function(race) {
      if (race === "P") return "Warning";
      if (race === "T") return "Information";
      if (race === "Z") return "Error";
      return "Success";
    },

    formatGameLength: function(gameSteps) {
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
    },

    normalizeResultType: function(rawType) {
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
    },

    resultTypeState: function(displayType) {
      if (displayType === "Crash" || displayType === "Timeout" || displayType === "Error") {
        return "Error";
      }
      return "None";
    },

    eloChangeDisplay: function(value) {
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
    },

    eloChangeState: function(value) {
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
    },

    eloSinceUpdateDisplay: function(delta) {
      if (delta === null || delta === undefined || delta === "") {
        return "";
      }
      var num = Number(delta);
      if (isNaN(num)) {
        return "";
      }
      return num > 0 ? "+" + num : String(num);
    },

    eloSinceUpdateState: function(delta) {
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
    },

    dateState: function(dateValue, botUpdated) {
      if (!dateValue || !botUpdated) {
        return "None";
      }
      var ts = new Date(dateValue).getTime();
      var cutoff = new Date(botUpdated).getTime();
      if (isNaN(ts) || isNaN(cutoff)) {
        return "None";
      }
      return ts < cutoff ? "Warning" : "None";
    },

    normalizeMatch: function(match, botId, botName, raceMap, botUpdated, participationMap, lastSeenMatchId) {
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

      var displayResultType = this.normalizeResultType(result.type || "Unknown");
      var gameLength = this.formatGameLength(result.game_steps);
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
        createdDisplay: this.resultSafeDate(match.created),
        started: match.started,
        startedDisplay: this.relativeStartedDate(match.started || match.created),
        startedState: this.dateState(match.started || match.created, botUpdated),
        map: match.map,
        opponent: opponent,
        opponentRace: opponentRace,
        opponentRaceDisplay: this.raceDisplay(opponentRace),
        opponentRaceIcon: this.raceIconPath(opponentRace),
        opponentRaceState: this.raceState(opponentRace),
        outcome: outcome,
        outcomeDisplay: outcomeDisplay,
        state: state,
        resultType: result.type || "Unknown",
        resultTypeDisplay: displayResultType,
        resultTypeState: this.resultTypeState(displayResultType),
        gameSteps: result.game_steps || 0,
        gameLength: gameLength.text,
        gameLengthState: gameLength.state,
        eloChange: participation.eloChange,
        eloChangeDisplay: this.eloChangeDisplay(participation.eloChange),
        eloChangeState: this.eloChangeState(participation.eloChange),
        replay: result.replay_file || "",
        log: result.arenaclient_log || ""
      };
    }

  };
});
