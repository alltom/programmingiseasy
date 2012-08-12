
function buildMap(text, expectedWord) {
	var punctuation = /\s*[.?!]+\s*/g;
	var spaces = /\s+/g;

	var doSentences = function () {
		var puncMatches;
		var sentences = [];
		var lastSentenceIndex = 0;
		while (puncMatches = punctuation.exec(text)) {
			var sentence = text.slice(lastSentenceIndex, puncMatches.index);
			if (sentence) {
				sentences.push({ words: doWords(sentence, sentences.length, lastSentenceIndex), range: [lastSentenceIndex, puncMatches.index] });
			}
			lastSentenceIndex = punctuation.lastIndex;
		}
		var lastSentence = text.slice(lastSentenceIndex);
		if (lastSentence) {
			sentences.push({ words: doWords(lastSentence, sentences.length, lastSentenceIndex), range: [lastSentenceIndex, lastSentenceIndex + lastSentence.length] });
		}
		return sentences;
	};

	var doWords = function (sentence, sentenceIndex, charOffset) {
		var spMatches;
		var words = [];
		var lastWordIndex = 0;
		while (spMatches = spaces.exec(sentence)) {
			var word = sentence.slice(lastWordIndex, spMatches.index);
			if (word) {
				words.push({ word: word, range: [charOffset + lastWordIndex, charOffset + spMatches.index], valid: isWord(word, expectedWord) });
				lastWordIndex = spaces.lastIndex;
			}
		}
		var lastWord = sentence.slice(lastWordIndex);
		if (lastWord) {
			words.push({ word: lastWord, range: [charOffset + lastWordIndex, charOffset + lastWordIndex + lastWord.length], valid: isWord(lastWord, expectedWord) });
		}
		return words;
	};

	return doSentences();
}

function sentenceToString(sentence) {
	return sentence.range[0] + "-" + sentence.range[1];
}

function wordToString(word) {
	return (word.valid ? "valid-" : "invalid-") + word.range[0] + "-" + word.range[1];
}

function warp(map, deletedRanges) {
	var warpPos = function (pos) {
		var ipos = pos;
		for (var i in deletedRanges) {
			var range = deletedRanges[i];
			if (pos >= range[0]) {
				if (pos < range[1]) {
					pos = range[0];
				} else {
					pos -= (range[1] - range[0]);
					pos += range[2];
				}
			}
		}
		return pos;
	};

	for (var i in map) {
		var sentence = map[i];
		sentence.range = [warpPos(sentence.range[0]), warpPos(sentence.range[1])];
		for (var j in sentence.words) {
			var word = sentence.words[j];
			word.range = [warpPos(word.range[0]), warpPos(word.range[1])];
		}
	}
}

/** converts {line, ch} to a character offset */
function linearizePos(pos, text) {
	var lines = text.split("\n");
	if (pos.line === 0) {
		return pos.ch;
	} else {
		return lines.slice(0, pos.line).join("\n").length + 1 + pos.ch;
	}
}

/** converts a character offset to {line, ch} */
function delinearizePos(pos, text) {
	var lines = text.split("\n");
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		if (pos <= line.length) {
			return { line: i, ch: pos };
		} else {
			pos -= line.length + 1;
		}
	}
	throw "past end!"
}

/** true if word is expectedWord, modulo case and punctuation */
function isWord(word, expectedWord) {
	var re = new RegExp(expectedWord, "i");
	if (re.test(word)) {
		var withoutWord = word.replace(re, "");
		if (/[a-z]/i.test(withoutWord)) {
			return false;
		}

		var caps = expectedWord.toUpperCase();
		var numCaps = 0;
		for (var i in word) {
			if (caps.indexOf(word[i]) !== -1) {
				numCaps++;
			}
		}
		return (numCaps + 1) / caps.length;
	}
	return false;
}

var greens = d3.interpolateHsl(d3.hsl(80, 0.5, 0.5), d3.hsl(160, 0.5, 0.5));

function shapeLanguage(textArea, svg, specialWord, glyphMaker) {
	var codeMirror, oldText, wordMap;
	var svg = d3.select(svg);
	var changes = [];
	var marks = [];

	var processChanges = _.debounce(function (codeMirror) {
		warp(wordMap, changes);
		wordMap = buildMap(codeMirror.getValue(), specialWord);
		oldText = codeMirror.getValue();
		changes = [];

		renderUpdate();
		markErrors(codeMirror, wordMap, specialWord);
	}, 300);

	var markErrors = function () {
		while (marks.length > 0) {
			marks.pop().clear();
		}
		for (var i in wordMap) {
			var sentence = wordMap[i];
			for (var j in sentence.words) {
				var word = sentence.words[j];
				if (!isWord(word.word, specialWord)) {
					var start = delinearizePos(word.range[0], codeMirror.getValue());
					var end = delinearizePos(word.range[1], codeMirror.getValue());
					marks.push(codeMirror.markText(start, end, "error"));
				}
			}
		}
	}

	codeMirror = CodeMirror.fromTextArea(textArea, {
		smartIndent: false,
		electricChars: false,
		autoClearEmptyLines: false,
		lineWrapping: true,
		onChange: function (codeMirror, change) {
			while (change) {
				var from = linearizePos(change.from, oldText);
				var to = linearizePos(change.to, oldText);
				var length = change.text.join("\n").length;
				changes.push([from, to, length])
				change = change.next;
			}
			processChanges(codeMirror);
		}
	});

	var renderGlyph = function (stage) {
		return function (d) {
			var selector = d3.select(this);
			var bigness = isWord(d.word, specialWord);
			if (bigness) {
				glyphMaker[stage](selector, bigness);
			} else {
				xMaker[stage](selector);
			}
		};
	};

	var render = function () {
		var row = svg.selectAll("g.row")
		    .data(wordMap);
		var rowEnter = row.enter()
		  .append("g").classed("row", true)
		    .attr("transform", function (d, i) { return "translate(0, " + (15 + i * 24) + ")" });

		var glyph = row.selectAll("g.glyph")
		    .data(function (d, i) { return d.words })
		  .enter()
		  .append("g").classed("glyph", true)
		    .attr("transform", function (d, i) { return "translate(" + (15 + i * 24) + ", 0)" })
		  .each(renderGlyph("enter"));
	};

	var renderUpdate = function () {
		var row = svg.selectAll("g.row")
		    .data(wordMap, function (d) { return sentenceToString(d) });
		row
		  .transition()
		    .attr("transform", function (d, i) { return "translate(0, " + (15 + i * 24) + ")" });
		var rowEnter = row.enter()
		  .append("g").classed("row", true)
		    .attr("transform", function (d, i) { return "translate(0, " + (15 + i * 24) + ")" });
		row.exit()
		  .transition()
		    .style("opacity", 0)
		    .remove();

		var glyph = row.selectAll("g.glyph")
		    .data(function (d, i) { return d.words }, function (d) { return wordToString(d) });
		glyph
		  .transition()
		    .attr("transform", function (d, i) { return "translate(" + (15 + i * 24) + ", 0)" })
		    .each(renderGlyph("update"));
		glyph
		  .enter()
		  .append("g").classed("glyph", true)
		    .attr("transform", function (d, i) { return "translate(" + (15 + i * 24) + ", 0)" })
		  .each(renderGlyph("enter"));
		glyph.exit()
		  .each(renderGlyph("exit"));
	};

	oldText = codeMirror.getValue();
	wordMap = buildMap(codeMirror.getValue(), specialWord);
	render();
}

var circleMaker = {
	enter: function (parent, bigness) {
		bigness || (bigness = 0.5);
		parent.append("circle")
		    .style("fill", greens(Math.random()))
		    .attr("r", 0)
		  .transition()
		    .attr("r", 5 + bigness*10);
	},
	update: function (parent, bigness) {
		bigness || (bigness = 0.5);
		parent.selectAll("circle")
		  .transition()
		    .attr("r", 5 + bigness*10);
	},
	exit: function (parent) {
		parent.selectAll("circle")
		  .transition()
		    .style("opacity", 0)
		    .remove();
	}
};

var squareMaker = {
	enter: function (parent, bigness) {
		bigness || (bigness = 0.5);
		var r = 5 + bigness*10;
		parent.append("rect")
		    .style("fill", greens(Math.random()))
		  .transition()
		    .attr("x", -r)
		    .attr("y", -r)
		    .attr("width", r*2)
		    .attr("height", r*2);
	},
	update: function (parent, bigness) {
		bigness || (bigness = 0.5);
		var r = 5 + bigness*10;
		parent.selectAll("rect")
		  .transition()
		    .attr("x", -r)
		    .attr("y", -r)
		    .attr("width", r*2)
		    .attr("height", r*2);
	},
	exit: function (parent) {
		parent.selectAll("rect")
		  .transition()
		    .style("opacity", 0)
		    .remove();
	}
};

var xMaker = {
	enter: function (parent) {
		parent.append("line")
		    .style("stroke", d3.hsl(0, 1, 0.5))
		    .style("stroke-width", 3)
		    .attr("x1", -100)
		    .attr("y1", -100)
		    .attr("x2", 100)
		    .attr("y2", 100)
		  .transition()
		    .attr("x1", -10)
		    .attr("y1", -10)
		    .attr("x2", 10)
		    .attr("y2", 10);
		parent.append("line")
		    .style("stroke", d3.hsl(0, 1, 0.5))
		    .style("stroke-width", 3)
		    .attr("x1", -100)
		    .attr("y1", 100)
		    .attr("x2", 100)
		    .attr("y2", -100)
		  .transition()
		    .attr("x1", -10)
		    .attr("y1", 10)
		    .attr("x2", 10)
		    .attr("y2", -10);
	},
	update: function (x) {
	},
	exit: function (x) {
		x
		  .transition()
		    .style("opacity", 0)
		    .remove();
	}
};
