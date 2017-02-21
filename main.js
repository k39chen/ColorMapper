// keep track of the current match candidates
var USER_INPUTS = {
    MATCH_CANDIDATES: [],
    INPUT_VALUES: []
};
var INFINITY = 9007199254740991;
var MAX_DISTANCE = 10000;
var ACCEPTANCE_THRESHOLD = 0.7;

/*========================================================================*
 * PROGRAM EXECUTION
 *========================================================================*/
$(document).ready(function() {
    var $matchCandidates = $("#match-candidates");
    var $inputValues = $("#input-values");

    // bind all the event listeners now that the UI is done rendering.
    bindListeners();

    // see if we can get any values from either bucket
    processTextareaValue($matchCandidates, "MATCH_CANDIDATES");
    processTextareaValue($inputValues, "INPUT_VALUES");

    // generate the appropriate tables
    generateMatchCandidatesTable();
    generateSimilarMatchesTable();
});
/*========================================================================*
 * PARSING METHODS
 *========================================================================*/
/**
 * This will get the input from the specified textarea object, parse it, and
 * dump it into the appropriate user input bucket.
 *
 * @method processTextareaValue
 * @param $textarea {Object} The textarea object.
 * @param bucket {String} The appropriate bucket.
 */
var processTextareaValue = function($textarea, bucket) {
    var value = $textarea.val();
    var values = value.split("\n");

    // remove leading and trailing whitespace
    values = _.map(values, function(value) {
        return $.trim(value);
    });
    // remove empty rows
    values = _.filter(values, function(value) {
        return !_.isEmpty($.trim(value));
    });
    // perform the appropriate cleansing.
    // TODO: kchen - remove this cleansing step if you want to see the raw values.
    values = _.map(values, function(value) {
        var parts = value.split(":");
        var hex;
        if (_.isEqual(parts.length, 2)) {
            hex = formatHex(parts[1]);
            return [parts[0], hex].join(":");
        } else {
            hex = formatHex(parts[0]);
            return hex;
        }
    });
    // only have unique values
    values = _.uniq(values);

    // figure out the parts that this row is composed of
    values = _.map(values, function(value) {
        var parts = value.split(":");
        var rgb = null;
        var rawHex = null;
        var hex = null;
        var label = null;
        if (_.isEqual(parts.length, 2)) {
            label = parts[0];
            rawHex = parts[1];
            hex = formatHex(parts[1]);
            rgb = hex2rgb(hex);
        } else {
            rawHex = parts[0];
            hex = formatHex(parts[0]);
            rgb = hex2rgb(hex);
        }
        var hsv = rgb2hsv(rgb);
        return {
            label: label,
            rawHex: rawHex,
            hex: hex,
            rgb: rgb,
            hsv: hsv
        }
    });
    values = _.chain(values)
        .sortBy(function(val) {
            var rgb = val.rgb;
            var r = rgb[0];
            var g = rgb[1];
            var b = rgb[2];
            var luminance = (r * 299 + g * 587 + b * 114) / 1000;

            return luminance;
        })
        .value()
        .reverse();

    USER_INPUTS[bucket] = values;
};
/*========================================================================*
 * GENERATION METHODS
 *========================================================================*/
/**
 * This method will generate the match candidates table.
 *
 * @method generateMatchCandidatesTable
 */
var generateMatchCandidatesTable = function() {
    var $table = $("#match-candidates-results");
    var $tbody = $table.find("> tbody");
    var $stats = $table.closest(".result-container").find("> .result-stats");
    var values = USER_INPUTS.MATCH_CANDIDATES;
    var colorAs = $("select[name='show-color-as']").val();

    // first, empty the table.
    $tbody.empty();

    // if there are no values, then show the empty message and that is it.
    if (_.isEqual(values.length, 0)) {
        $stats.hide();
        generateEmptyRow($table);
        return;
    }
    // go through each value and create the appropriate row.
    _.each(values, function(value) {
        var $row = $("<tr />").appendTo($tbody);
        var $cellName = $("<td class='labeled-cell' />").append(value.label);
        var $cellColor = $("<td />");
        switch (colorAs) {
        case "rgb-hex" : $cellColor.append(value.hex); break;
        case "rgb-int" : $cellColor.append("rgb(" + value.rgb.join(",") + ")"); break;
        case "hsv"     : $cellColor.append("hsv(" + value.hsv.join(",") + ")"); break;
        default        : break;
        }
        var $cellPreview = $("<td class='colored-cell'/>").append("<span style='background-color:" + value.hex + "' data-value='" + value.hex + "'></span>");

        $row.append($cellName, $cellColor, $cellPreview);
    });
    // populate the stats
    $stats.show();
    $stats.find(".result-stat[data-type='total'] > .value").text(values.length);
};
/**
 * This method will generate the similar matches table.
 *
 * @method generateSimilarMatchesTable
 */
var generateSimilarMatchesTable = function() {
    var $table = $("#similar-matches-results");
    var $tbody = $table.find("> tbody");
    var $stats = $table.closest(".result-container").find("> .result-stats");
    var values = USER_INPUTS.INPUT_VALUES;
    var colorAs = $("select[name='show-color-as']").val();

    // first, empty the table.
    $tbody.empty();

    // if there are no values, then show the empty message and that is it.
    if (_.isEqual(values.length, 0)) {
        $stats.hide();
        generateEmptyRow($table);
        return;
    }
    // compute and sort by the match rate
    values = _.map(values, function(value) {
        var similarData = getMostSimilar(value.hsv);
        return $.extend({}, value, {similarData: similarData});
    });
    values = _.sortBy(values, function(value) {
        return value.similarData.rate;
    }).reverse();

    // go through each value and create the appropriate row.
    var breakdown = {
        "match-100": 0,
        "match-90": 0,
        "match-80": 0,
        "match-less-80": 0,
        "match-unmatched": 0
    };
    _.each(values, function(value) {
        var $row = $("<tr />").appendTo($tbody);
        var inputData = value;

        // these are the cells indicating the input data
        var $cellInputColor = $("<td />");
        switch (colorAs) {
        case "rgb-hex" : $cellInputColor.append(inputData.rawHex); break;
        case "rgb-int" : $cellInputColor.append("rgb(" + inputData.rgb.join(",") + ")"); break;
        case "hsv"     : $cellInputColor.append("hsv(" + inputData.hsv.join(",") + ")"); break;
        default        : break;
        }
        var $cellInputPreview = $("<td class='separator colored-cell'/>").append("<span style='background-color:" + inputData.hex + "' data-value='" + inputData.hex + "'></span>");

        // if there is nothing similar, then just skip.
        var similarData = value.similarData;
        if (_.isNull(similarData)) return;

        // these are the cells indicating the input data
        var $cellMatchName = $("<td class='labeled-cell' />").append(similarData.label);

        if (_.isEqual(similarData.rate, 1.0)) {
            breakdown["match-100"]++;
        } else if (similarData.rate > 0.9 && similarData.rate < 1.0) {
            breakdown["match-90"]++;
        } else if (similarData.rate > 0.8 && similarData.rate < 0.9) {
            breakdown["match-80"]++;
        } else if (similarData.rate < 0.8) {
            if (similarData.rate < ACCEPTANCE_THRESHOLD / 100) {
                breakdown["match-less-80"]++;
            } else {
                breakdown["match-unmatched"]++;
            }
        }
        // compute the match percentage string.
        var matchPct = Math.floor(similarData.rate * 10000) / 100 + "%";
        if (similarData.rate < ACCEPTANCE_THRESHOLD) {
            matchPct = "No Match";
        }
        var $cellMatchPct = $("<td class='labeled-cell monospace' />");
        if (_.isEqual(similarData.rate, 1.0)) {
            $cellMatchPct.append("<span class='match-indicator' style='background-color:#6eba83'></span> <span class='label'>" + matchPct + "</span>");
        } else if (similarData.rate > 0.9 && similarData.rate < 1.0) {
            $cellMatchPct.append("<span class='match-indicator' style='background-color:#86d099'></span> <span class='label'>" + matchPct + "</span>");
        } else if (similarData.rate > 0.8 && similarData.rate < 0.9) {
            $cellMatchPct.append("<span class='match-indicator' style='background-color:#ffa84d'></span> <span class='label'>" + matchPct + "</span>");
        } else if (similarData.rate < 0.8) {
            if (similarData.rate < ACCEPTANCE_THRESHOLD / 100) {
                $cellMatchPct.append("<span class='match-indicator' style='background-color:#828282'></span> <span class='label'>" + matchPct + "</span>");
            } else {
                $cellMatchPct.append("<span class='match-indicator' style='background-color:#ef8166'></span> <span class='label'>" + matchPct + "</span>");
            }
        }
        var $cellMatchColor = $("<td />");
        switch (colorAs) {
        case "rgb-hex" : $cellMatchColor.append(similarData.hex); break;
        case "rgb-int" : $cellMatchColor.append("rgb(" + similarData.rgb.join(",") + ")"); break;
        case "hsv"     : $cellMatchColor.append("hsv(" + similarData.hsv.join(",") + ")"); break;
        default        : break;
        }
        var $cellMatchPreview = $("<td class='colored-cell'/>").append("<span style='background-color:" + similarData.hex + "' data-value='" + similarData.hex + "'></span>");
        var $cellFlag = $("<td class='checkbox' />");
        var $cellCheckbox = $("<input type='checkbox' />").data("data", {value: value}).appendTo($cellFlag);

        $row.append($cellInputColor, $cellInputPreview, $cellMatchPct, $cellMatchName, $cellMatchColor, $cellMatchPreview, $cellFlag);
    });
    // populate the stats
    $stats.show();

    var $total = $stats.find(".result-stat[data-type='total']");
    $stats.find(".result-stat[data-type='total'] > .value").text(values.length);
    $stats.find(".result-stat[data-type='match-100'] > .value").text(breakdown["match-100"]);
    $stats.find(".result-stat[data-type='match-90'] > .value").text(breakdown["match-90"]);
    $stats.find(".result-stat[data-type='match-80'] > .value").text(breakdown["match-80"]);
    $stats.find(".result-stat[data-type='match-less-80'] > .value").text(breakdown["match-less-80"]);
    $stats.find(".result-stat[data-type='match-unmatched'] > .value").text(breakdown["match-unmatched"]);

    var $chart = $stats.find("> .result-chart");
    $chart.empty();
    $chart.append("<span style='width:" + (breakdown["match-100"] / values.length) * 100 + "%;background-color:#6eba83'></span>");
    $chart.append("<span style='width:" + (breakdown["match-90"] / values.length) * 100 + "%;background-color:#86d099'></span>");
    $chart.append("<span style='width:" + (breakdown["match-80"] / values.length) * 100 + "%;background-color:#ffa84d'></span>");
    $chart.append("<span style='width:" + (breakdown["match-less-80"] / values.length) * 100 + "%;background-color:#ef8166'></span>");
    $chart.append("<span style='width:" + (breakdown["match-unmatched"] / values.length) * 100 + "%;background-color:#828282'></span>");
};
/**
 * Creates an empty message row in the provided table.
 *
 * @method generateEmptyRow
 * @param $table {Object} The table that we want to add this to.
 * @return {Object} The resulting DOM.
 */
var generateEmptyRow = function($table) {
    var $theadColumns = $table.find("> thead > tr > td");
    var $tbody = $table.find("> tbody");

    // figure out the number of headers this spans.
    var numColumns = $theadColumns.length;

    // add an extra row to the body.
    var $row = $("<tr />").appendTo($tbody);
    $row.append("<td class='empty-message' colspan='" + numColumns + "'>No data provided.</td>");
};
/*========================================================================*
 * COMPUTATION METHODS
 *========================================================================*/
/**
 * This method will compute the most similar the provided value is to the list
 * of the provided matches.
 *
 * @method getMostSimilar
 * @param hsv {String} The hsv value that we want to match something to.
 * @return {Object} The data for the most similar match.
 */
var getMostSimilar = function(hsv) {
    var distance = INFINITY;
    var mostSimilar = null;

    _.each(USER_INPUTS.MATCH_CANDIDATES, function(candidate) {
        var computedDistance = computeDistance(candidate.hsv, hsv);
        if (computedDistance < distance) {
            distance = computedDistance;
            mostSimilar = candidate;
        }
    });
    // compute the match rate.
    var rate = (MAX_DISTANCE - distance) / MAX_DISTANCE;

    return $.extend({rate: rate, distance: distance}, mostSimilar);
};
/**
 * Computes the distance from the two provided values.
 *
 * @method computeDistance
 * @param value_1 {Array} The first value.
 * @param value_2 {Array} The second value.
 * @return {Number} The computed distance.
 */
var computeDistance = function(value_1, value_2) {
    var r_1 = value_1[0];
    var g_1 = value_1[1];
    var b_1 = value_1[2];

    var r_2 = value_2[0];
    var g_2 = value_2[1];
    var b_2 = value_2[2];

    return Math.pow(r_1 - r_2,2) + Math.pow(g_1 - g_2,2) + Math.pow(b_1 - b_2,2);
};
/*========================================================================*
 * CONVERSION METHODS
 *========================================================================*/
/**
 * This method will convert a hex value to a rgb array.
 *
 * @method hex2rgb
 * @param colorHex {String} The hex value represented as a string,
 * @return {Array} The RGB value represented as an array.
 */
var hex2rgb = function(colorHex) {
    var r,g,b;
    if (_.isEqual(colorHex.charAt(0), '#')) {
        colorHex = colorHex.substr(1);
    }
    r = colorHex.charAt(0) + colorHex.charAt(1);
    g = colorHex.charAt(2) + colorHex.charAt(3);
    b = colorHex.charAt(4) + colorHex.charAt(5);

    r = parseInt(r,16);
    g = parseInt(g,16);
    b = parseInt(b,16);
    return [r,g,b];
};
/**
 * This method will convert a rgb array value to a hsv array value.
 *
 * @method rgb2hsv
 * @param rgb {Array} The RGB value represented as an array.
 * @return {Array} the HSV value represented as an array.
 */
var rgb2hsv = function(rgb) {
    var rr, gg, bb;
    var r = rgb[0] / 255;
    var g = rgb[1] / 255;
    var b = rgb[2] / 255;
    var h, s;
    var v = Math.max(r, g, b);
    var diff = v - Math.min(r, g, b);
    var diffc = function(c) {
        return (v - c) / 6 / diff + 1 / 2;
    };
    if (diff == 0) {
        h = s = 0;
    } else {
        s = diff / v;
        rr = diffc(r);
        gg = diffc(g);
        bb = diffc(b);

        if (_.isEqual(r, v)) {
            h = bb - gg;
        } else if (_.isEqual(g, v)) {
            h = (1 / 3) + rr - bb;
        } else if (_.isEqual(b, v)) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        } else if (h > 1) {
            h -= 1;
        }
    }
    return [
        Math.round(h * 360),
        Math.round(s * 100),
        Math.round(v * 100)
    ];
};
/**
 * This will format the hex to our standards.
 *
 * @method formatHex
 * @param hex {String} The input hex value.
 * @return {String} The ouput hex.
 */
var formatHex = function(hex) {
    var temp = hex.substr(1).toLowerCase();
    var result = "#";

    if (_.isEqual(temp.length, 3)) {
        _.each(temp, function(char) {
            result = result + char + char;
        });
    } else {
        return hex.toLowerCase();
    }
    return result.toLowerCase();
};
/*========================================================================*
 * EVENT LISTENING METHODS
 *========================================================================*/
/**
 * This will bind all the event listeners.
 *
 * @method bindListeners
 */
var bindListeners = function() {
    $("#match-candidates").change(function() {
        processTextareaValue($(this), "MATCH_CANDIDATES");
        generateMatchCandidatesTable();
    });
    $("#input-values").change(function() {
        processTextareaValue($(this), "INPUT_VALUES");
        generateSimilarMatchesTable();
    });
    $("#toggle-match-candidates-btn").click(function() {
        $(this).closest(".result-container-group").toggleClass("hide-match-candidates");
    });
    $("#export-btn").click(function() {
        $("#export-dialog").dialog("open");
    });
    $("select[name='show-color-as']").change(function() {
        var $table = $(this).closest(".result-container-group").find("table");

        $table.each(function() {
            var type = $(this).attr("id");

            switch (type) {
            case "match-candidates-results" : generateMatchCandidatesTable(); break;
            case "similar-matches-results"  : generateSimilarMatchesTable(); break;
            default                         : break;
            }
        });
    });
    // create the export dialog
    $("#export-dialog").dialog({
        title: "Export Flagged Rows",
        autoOpen: false,
        modal: true,
        width: 600,
        height: 300,
        open: function() {
            var $textarea = $("#export-value");
            var $table = $("#similar-matches-results");

            // populate the text area accordingly.
            $textarea.empty();

            $table.find("input[type='checkbox']:checked").each(function() {
                var $checkbox = $(this);
                var data = $checkbox.data("data");
                var rowOutput = JSON.stringify(data);

                $textarea.append(rowOutput + "\n");
            });
        }
    });
    // create event listener for similar matches results row mouse events
    var $table = $("#similar-matches-results");
    $table.find("tbody").click("> tr > td", function(ev) {
        var $checkbox = $(ev.target).closest("tr").find("input[type='checkbox']");

        if ($checkbox.prop("checked")) {
            $checkbox.removeAttr("checked").prop("checked", false);
        } else {
            $checkbox.attr("checked", true).prop("checked", true);
        }
    });
};
