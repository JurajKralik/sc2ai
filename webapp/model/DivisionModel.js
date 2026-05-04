sap.ui.define([
  "sap/m/MessageToast",
  "sc2ai/model/formatter"
], function(MessageToast, Formatter) {
  "use strict";

  function changeIcon(delta) {
    if (delta === null || delta === undefined) return "sap-icon://arrow-right";
    var abs = Math.abs(delta);
    if (abs <= 15) return "sap-icon://arrow-right";
    if (abs <= 30) return delta > 0 ? "sap-icon://trend-up" : "sap-icon://trend-down";
    return delta > 0 ? "sap-icon://arrow-top" : "sap-icon://arrow-bottom";
  }

  function changeState(delta) {
    if (delta === null || delta === undefined || Math.abs(delta) <= 15) return "None";
    return delta > 0 ? "Success" : "Error";
  }

  return {

    loadDivision: async function(model) {
      model.setProperty("/division/loading", true);
      try {
        var response = await fetch("/api/division");
        if (!response.ok) {
          throw new Error("Division request failed: " + response.status);
        }
        var payload = await response.json();
        var division = payload.division;
        if (!division) {
          model.setProperty("/division/participants", []);
          model.setProperty("/division/number", "");
          return;
        }
        var participants = (division.participants || []).map(function(p) {
          return {
            botId: p.botId,
            name: p.name,
            race: p.race,
            raceIcon: Formatter.raceIconPath(p.race),
            raceDisplay: Formatter.raceDisplay(p.race),
            elo: p.elo,
            eloChange30: p.eloChange30,
            changeIcon: changeIcon(p.eloChange30),
            changeState: changeState(p.eloChange30),
            divisionRank: p.divisionRank,
            isMe: !!p.isMe,
            state: p.isMe ? "Information" : "None"
          };
        });
        model.setProperty("/division/number", division.division);
        model.setProperty("/division/participants", participants);
      } catch (error) {
        console.error(error);
        MessageToast.show("Failed to load division: " + error.message);
      } finally {
        model.setProperty("/division/loading", false);
      }
    }

  };
});
