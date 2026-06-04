import * as tf from "@tensorflow/tfjs";

/* =========================================================
   SHARED / APP SETUP
========================================================= */

const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/Z7sdOoyx6/";
const MODEL_URL = `${MODEL_BASE_URL}model.json`;
const METADATA_URL = `${MODEL_BASE_URL}metadata.json`;

let modelPromise = loadModel();

async function loadModel() {
  await tf.ready();

  try { await tf.setBackend("webgl"); } catch {}

  const [model, metadata] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(METADATA_URL).then(r => r.json()),
  ]);

  return { model, metadata };
}

let wikipediaDataset = null;
let datasetStats = null;
let imageClassified = {};
let AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };

let lastUrl = location.href;
let lastTextScanSignature = "";
let textScanInFlight = false;

window.onload = async () => {
  const targetNode = document.getElementById("page-content") || document.body;

  selfObserver(targetNode);
  wikipediaDataset = await loadWikipediaDatasetJSONL("data/wikipedia.jsonl");
  datasetStats = buildDatasetStats(wikipediaDataset);

  main();
  observeUrlChange();
};

function selfObserver(node) {
  const observer = new MutationObserver(() => main());
  observer.observe(node, { childList: true, subtree: true });
}

function observeUrlChange() {
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      imageClassified = {};
      lastTextScanSignature = "";
      main();
    }
  }, 300);
}

async function loadWikipediaDatasetJSONL(path) {
  try {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    const text = await res.text();

    const lines = text.split("\n").filter(Boolean);
    const dataset = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);

        if (item.human_text && item.human_text.length > 50) {
          dataset.push({ text: normalizeWhitespace(item.human_text), label: 0 });
        }

        if (item.ai_text && item.ai_text.length > 50) {
          dataset.push({ text: normalizeWhitespace(item.ai_text), label: 1 });
        }
      } catch {}
    }

    return dataset;
  } catch {
    return [];
  }
}

function buildDatasetStats(dataset) {
  const fallback = {
    allMedian: 900,
    allP25: 500,
    allP75: 1400,
    humanMedian: 950,
    aiMedian: 850,
    humanLengths: [],
    aiLengths: []
  };

  if (!dataset || !dataset.length) return fallback;

  const humanLengths = dataset
    .filter(d => d.label === 0)
    .map(d => d.text.length)
    .sort((a, b) => a - b);

  const aiLengths = dataset
    .filter(d => d.label === 1)
    .map(d => d.text.length)
    .sort((a, b) => a - b);

  const allLengths = dataset
    .map(d => d.text.length)
    .sort((a, b) => a - b);

  return {
    allMedian: quantileSorted(allLengths, 0.50) || fallback.allMedian,
    allP25: quantileSorted(allLengths, 0.25) || fallback.allP25,
    allP75: quantileSorted(allLengths, 0.75) || fallback.allP75,
    humanMedian: quantileSorted(humanLengths, 0.50) || fallback.humanMedian,
    aiMedian: quantileSorted(aiLengths, 0.50) || fallback.aiMedian,
    humanLengths,
    aiLengths
  };
}

function main() {
  chrome.storage.local.get("switchStatus", data => {
    if (data.switchStatus === true) {
      /* Cover image scan */
      runML();

      /* Article scan */
      runArticleTextScan();
    } else {
      AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };
      chrome.storage.local.set({ AIDataCollected: AIData });
    }
  });
}











/* =========================================================
   COVER IMAGE SCANNING
   - Responsible for scanning article cover images
   - Uses the Teachable Machine image model
========================================================= */

function runML() {
  let imgs = document.querySelectorAll(
    ".crayons-article__cover, .crayons-article__main-image"
  );

  for (let i of imgs) {
    const imgTag = i.querySelector("img");
    if (!imgTag) continue;

    if (!(imgTag.src in imageClassified)) {
      imageClassified[imgTag.src] = true;
      iconAssigned(null, i);
      imageClassificationScan(i);
    }
  }
}

async function imageClassificationScan(imgObj) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imgObj.querySelector("img").src;

  await new Promise(r => (img.onload = r));

  try {
    const { model, metadata } = await modelPromise;

    const tensor = tf.browser
      .fromPixels(img)
      .resizeBilinear([224, 224])
      .toFloat()
      .div(255)
      .expandDims();

    const pred = model.predict(tensor);
    const scores = await pred.data();

    tf.dispose([tensor, pred]);

    const results = metadata.labels.map((l, i) => ({
      label: l,
      confidence: scores[i],
    }));

    results.sort((a, b) => b.confidence - a.confidence);

    iconAssigned(results, imgObj);
  } catch {
    iconAssigned(null, imgObj);
  }
}

function iconAssigned(results, imgObj) {
  const existing = imgObj.querySelector("#FrancisTRStatusAI");
  if (existing) existing.remove();

  imgObj.style.position = "relative";

  const icon = document.createElement("img");
  icon.id = "FrancisTRStatusAI";

  icon.style.position = "absolute";
  icon.style.bottom = "10px";
  icon.style.right = "10px";
  icon.style.width = "42px";
  icon.style.height = "42px";
  icon.style.zIndex = "9999";

  try {
    if (!results) {
      icon.src = chrome.runtime.getURL("Images/loading.gif");
    } else {
      let [label, conf] = [results[0].label, results[0].confidence * 100];

      AIData.TotalScan++;

      if ((label === "AI" || label === "NotAI") && conf <= 60) {
        icon.src = chrome.runtime.getURL("Images/AINeutral.png");
      } else if (label === "AI") {
        icon.src = chrome.runtime.getURL("Images/AIGenerated.png");
      } else {
        icon.src = chrome.runtime.getURL("Images/AIFree.png");
      }

      chrome.storage.local.set({ AIDataCollected: AIData });
    }
  } catch {
    icon.src = chrome.runtime.getURL("Images/loading.gif");
  }

  imgObj.appendChild(icon);
}










/* =========================================================
   ARTICLE SCANNING
   - Responsible for extracting article text
   - Splits article into dataset-length chunks
   - Compares each chunk against human/AI dataset
========================================================= */

function getCleanArticleText() {
  const root =
    document.querySelector(".crayons-article__body") ||
    document.getElementById("article-body") ||
    document.querySelector("article");

  if (!root) return "";

  const elements = root.querySelectorAll("h1, h2, h3, h4, p, li");
  let textParts = [];

  elements.forEach(el => {
    const tag = el.tagName.toLowerCase();
    const text = normalizeWhitespace(el.innerText || "");
    if (!text) return;

    if (tag === "h1") textParts.push(`# ${text}`);
    else if (tag === "h2") textParts.push(`## ${text}`);
    else if (tag === "h3") textParts.push(`### ${text}`);
    else if (tag === "h4") textParts.push(`#### ${text}`);
    else if (tag === "li") textParts.push(`- ${text}`);
    else textParts.push(text);
  });

  return textParts.join("\n\n");
}

/* ============================
   DATASET-LENGTH CHUNKING
============================ */

function splitTextIntoDatasetLengthChunks(text) {
  if (!text) return [];

  const targetLen = getTargetChunkLength();
  const minLen = Math.max(250, Math.floor(targetLen * 0.75));
  const maxLen = Math.max(minLen + 100, Math.ceil(targetLen * 1.20));

  const blocks = text
    .split(/\n{2,}/)
    .map(x => x.trim())
    .filter(Boolean);

  if (!blocks.length) return [];

  let chunks = [];
  let buffer = "";

  for (let block of blocks) {
    if (block.length > maxLen) {
      const splitBlocks = splitLongBlockAtSentenceBoundaries(
        block,
        targetLen,
        minLen,
        maxLen
      );

      for (const piece of splitBlocks) {
        if (!buffer) {
          buffer = piece;
        } else if ((buffer.length + 2 + piece.length) <= maxLen) {
          buffer += "\n\n" + piece;
        } else {
          if (buffer.trim()) chunks.push(buffer.trim());
          buffer = piece;
        }
      }
      continue;
    }

    if (!buffer) {
      buffer = block;
      continue;
    }

    const proposedLength = buffer.length + 2 + block.length;

    if (proposedLength <= maxLen) {
      buffer += "\n\n" + block;
    } else {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = block;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());

  return rebalanceChunkLengths(chunks, minLen, maxLen);
}

function getTargetChunkLength() {
  if (!datasetStats) return 900;

  return clampNumber(
    Math.round(datasetStats.allMedian || 900),
    Math.max(300, datasetStats.allP25 || 500),
    Math.max(700, datasetStats.allP75 || 1400)
  );
}

function splitLongBlockAtSentenceBoundaries(block, targetLen, minLen, maxLen) {
  const sentences = splitSentences(block)
    .map(s => normalizeWhitespace(s))
    .filter(Boolean);

  if (!sentences.length) return [block];

  const pieces = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }

    if ((buffer.length + 1 + sentence.length) <= maxLen) {
      buffer += " " + sentence;
    } else {
      pieces.push(buffer.trim());
      buffer = sentence;
    }
  }

  if (buffer.trim()) pieces.push(buffer.trim());

  const merged = [];
  for (const piece of pieces) {
    if (!merged.length) {
      merged.push(piece);
      continue;
    }

    const last = merged[merged.length - 1];
    if (last.length < minLen && (last.length + 1 + piece.length) <= maxLen) {
      merged[merged.length - 1] = last + " " + piece;
    } else {
      merged.push(piece);
    }
  }

  return merged;
}

function rebalanceChunkLengths(chunks, minLen, maxLen) {
  if (!chunks.length) return chunks;

  const output = [];
  let i = 0;

  while (i < chunks.length) {
    let current = chunks[i];

    if (
      current.length < minLen &&
      i < chunks.length - 1 &&
      (current.length + 2 + chunks[i + 1].length) <= maxLen
    ) {
      output.push((current + "\n\n" + chunks[i + 1]).trim());
      i += 2;
      continue;
    }

    output.push(current);
    i++;
  }

  return output;
}

/* ============================
   ARTICLE SCAN ENTRY
============================ */

async function runArticleTextScan() {
  if (textScanInFlight) return;

  const text = getCleanArticleText();
  if (!text || text.length < 600) return;

  const signature = text.slice(0, 400);
  if (signature === lastTextScanSignature) return;

  textScanInFlight = true;

  console.log("===== FORMATTED ARTICLE =====");
  console.log(text);
  console.log("================================");

  const result = await detectGPTStyle(text);

  console.log("FINAL RESULT:", result);

  lastTextScanSignature = signature;
  textScanInFlight = false;
}

/* ============================
   DETECTION
============================ */

async function detectGPTStyle(text) {
  if (!text || !wikipediaDataset || wikipediaDataset.length < 10) {
    return { label: "Unknown", aiScore: 0 };
  }

  const chunks = splitTextIntoDatasetLengthChunks(text);
  if (!chunks.length) {
    return { label: "Unknown", aiScore: 0 };
  }

  let humanCount = 0;
  let mixedCount = 0;
  let aiCount = 0;
  let chunkScores = [];

  console.log("===== DATASET LENGTH MATCHING =====");
  console.log(`Dataset Median Length: ${datasetStats?.allMedian || 0}`);
  console.log(`Dataset P25 Length: ${datasetStats?.allP25 || 0}`);
  console.log(`Dataset P75 Length: ${datasetStats?.allP75 || 0}`);
  console.log(`Target Chunk Length: ${getTargetChunkLength()}`);
  console.log(`Chunk Count: ${chunks.length}`);
  console.log("===================================");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const datasetScore = compareWithDataset(chunk);
    const heuristicScore = computeHeuristicScore(chunk);

    let score = datasetScore * 0.80 + heuristicScore * 0.20;

    score = 50 + (score - 50) * 1.6;
    score = clamp(score, 0, 100);

    let verdict;
    if (score >= 58) {
      verdict = "AI-generated";
      aiCount++;
    } else if (score <= 42) {
      verdict = "Human-written";
      humanCount++;
    } else {
      verdict = "Mixed";
      mixedCount++;
    }

    chunkScores.push(score);

    console.log(`===== CHUNK ${i + 1}/${chunks.length} =====`);
    console.log(chunk);
    console.log("------------------------------------");
    console.log(`Chunk Length: ${chunk.length}`);
    console.log(`Dataset Score: ${datasetScore.toFixed(2)}%`);
    console.log(`Heuristic Score: ${heuristicScore.toFixed(2)}%`);
    console.log(`Final Chunk Score: ${score.toFixed(2)}%`);
    console.log(`Chunk Verdict: ${verdict}`);
    console.log("====================================");
  }

  const totalChunks = chunks.length || 1;
  const humanPercent = (humanCount / totalChunks) * 100;
  const mixedPercent = (mixedCount / totalChunks) * 100;
  const aiPercent = (aiCount / totalChunks) * 100;
  const avgScore = mean(chunkScores);

  let finalLabel;
  if (aiPercent > 50) finalLabel = "AI-generated";
  else if (humanPercent > 50) finalLabel = "Human-written";
  else finalLabel = "Mixed";

  console.log("===== FULL ARTICLE ANALYSIS =====");
  console.log(`Human-written: ${humanPercent.toFixed(2)}%`);
  console.log(`Mixed: ${mixedPercent.toFixed(2)}%`);
  console.log(`AI-generated: ${aiPercent.toFixed(2)}%`);
  console.log("------------------------------------");
  console.log(`Average AI Score: ${avgScore.toFixed(2)}%`);
  console.log("------------------------------------");
  console.log(`Final Verdict: ${finalLabel}`);
  console.log("====================================");

  return {
    label: finalLabel,
    aiScore: Number(avgScore.toFixed(2))
  };
}

/* ============================
   DATASET COMPARISON
============================ */

function compareWithDataset(text) {
  if (!wikipediaDataset || wikipediaDataset.length < 10) return 50;

  const targetLength = text.length;
  const comparableA = trimTextToComparableLength(text, targetLength);
  const vectorA = textToVector(comparableA);

  const humanSamples = getLengthMatchedSamples(0, targetLength, 24);
  const aiSamples = getLengthMatchedSamples(1, targetLength, 24);

  const humanSims = [];
  const aiSims = [];

  for (const sample of humanSamples) {
    const sampleText = trimTextToComparableLength(sample.text, targetLength);
    const vectorB = textToVector(sampleText);
    humanSims.push(cosineSimilarity(vectorA, vectorB));
  }

  for (const sample of aiSamples) {
    const sampleText = trimTextToComparableLength(sample.text, targetLength);
    const vectorB = textToVector(sampleText);
    aiSims.push(cosineSimilarity(vectorA, vectorB));
  }

  const humanScore = averageTopK(humanSims, 6);
  const aiScore = averageTopK(aiSims, 6);

  return (aiScore / (aiScore + humanScore + 0.0001)) * 100;
}

function getLengthMatchedSamples(label, targetLength, limit = 24) {
  if (!wikipediaDataset || !wikipediaDataset.length) return [];

  const pool = wikipediaDataset.filter(item => item.label === label);
  if (!pool.length) return [];

  const tolerances = [0.12, 0.20, 0.30, 0.45, 0.65];
  let matches = [];

  for (const tolerance of tolerances) {
    const delta = Math.max(60, Math.round(targetLength * tolerance));

    matches = pool
      .filter(item => Math.abs(item.text.length - targetLength) <= delta)
      .sort(
        (a, b) =>
          Math.abs(a.text.length - targetLength) -
          Math.abs(b.text.length - targetLength)
      );

    if (matches.length >= limit) {
      return matches.slice(0, limit);
    }
  }

  return pool
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.text.length - targetLength) -
        Math.abs(b.text.length - targetLength)
    )
    .slice(0, limit);
}

function trimTextToComparableLength(text, targetLength) {
  const clean = normalizeWhitespace(text || "");
  if (clean.length <= targetLength) return clean;

  const sentences = splitSentences(clean);
  if (!sentences.length) return clean.slice(0, targetLength);

  let buffer = "";
  for (const sentence of sentences) {
    const next = buffer
      ? buffer + " " + normalizeWhitespace(sentence)
      : normalizeWhitespace(sentence);

    if (next.length > targetLength) {
      if (buffer.length >= Math.floor(targetLength * 0.85)) {
        return buffer.trim();
      }
      return next.slice(0, targetLength).trim();
    }

    buffer = next;
  }

  return buffer.trim().slice(0, targetLength);
}

function averageTopK(arr, k = 6) {
  if (!arr || !arr.length) return 0;

  const sorted = [...arr].sort((a, b) => b - a).slice(0, k);
  return mean(sorted);
}

function computeHeuristicScore(text) {
  const words = tokenizeWords(text);
  const sentences = splitSentences(text);

  const diversity = new Set(words).size / (words.length || 1);
  const repetition = 1 - diversity;

  const lengths = sentences.map(s => tokenizeWords(s).length);
  const varLen = variance(lengths);

  return clamp(
    (1 - clamp(varLen / 60)) * 0.5 +
    clamp(repetition) * 0.25 +
    clamp(1 - diversity) * 0.25
  ) * 100;
}

/* =========================================================
   SHARED UTILITIES
========================================================= */

function quantileSorted(arr, q) {
  if (!arr || !arr.length) return 0;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (arr[base + 1] !== undefined) {
    return Math.round(arr[base] + rest * (arr[base + 1] - arr[base]));
  }
  return arr[base];
}

function textToVector(text) {
  const words = tokenizeWords(text);
  const freq = {};

  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });

  return freq;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  keys.forEach(k => {
    const x = a[k] || 0;
    const y = b[k] || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  });

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

function clamp(x, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

function clampNumber(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function normalizeWhitespace(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function splitSentences(t) {
  return t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function tokenizeWords(t) {
  return t.toLowerCase().match(/[a-z0-9']+/g) || [];
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((acc, x) => acc + Math.pow(x - m, 2), 0) / (arr.length || 1);
}