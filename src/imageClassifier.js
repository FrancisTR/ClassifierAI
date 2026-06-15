import * as tf from "@tensorflow/tfjs";

/* =========================================================
   IMAGE CLASSIFICATION MODEL
========================================================= */

const IMAGE_MODEL_BASE_URL =
  "https://teachablemachine.withgoogle.com/models/ZIGMmrziY/";

const IMAGE_MODEL_URL = `${IMAGE_MODEL_BASE_URL}model.json`;
const IMAGE_METADATA_URL = `${IMAGE_MODEL_BASE_URL}metadata.json`;

let imageModelPromise = loadImageModel(); // Loading the model

async function loadImageModel() {
  await tf.ready();
  try {
    await tf.setBackend("webgl");
  } catch {
    console.error("Failed to set WebGL backend");
  }

  const [model, metadata] = await Promise.all([
    tf.loadLayersModel(IMAGE_MODEL_URL),
    fetch(IMAGE_METADATA_URL).then((r) => r.json()),
  ]);

  return { model, metadata };
}

/* =========================================================
   GLOBAL STATE
========================================================= */

let wikipediaDataset = null; // Wikipedia dataset for text classification (Placeholder)
let imageClassified = {}; // Uses Teachable Machines

let lastUrl = location.href;
let lastTextScanSignature = "";
let textScanInFlight = false;

/* =========================================================
   INIT
========================================================= */

window.onload = async () => {
  // Replace the dataset path below to use your own JSONL file
  wikipediaDataset = await loadDatasetJSONL("data/wikipedia.jsonl"); // PLACEHOLDER DATA FOR NOW

  observeUrlChange();

  new MutationObserver(() => main()).observe(document.body, {
    childList: true,
    subtree: true,
  });

  main(); // Main function
};

/* =========================================================
   URL CHANGE DETECTION
========================================================= */

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

/* =========================================================
   DATASET LOADING (TEXT CLASSIFICATION)
========================================================= */

/**
 * DEV NOTE:
 * Replace the `path` below with your own JSONL dataset.
 *
 * Expected JSONL format (one object per line):
 * { "human_text": "..."}
 * OR
 * { "ai_text": "..."}
 *
 * Labels:
 * - 0 = Human
 * - 1 = AI
 */
async function loadDatasetJSONL(path) {
  try {
    const url = chrome.runtime.getURL(path);
    const text = await (await fetch(url)).text();

    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const item = JSON.parse(line);

          if (item.human_text)
            return { text: normalizeWhitespace(item.human_text), label: 0 };

          if (item.ai_text)
            return { text: normalizeWhitespace(item.ai_text), label: 1 };
        } catch { }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* =========================================================
   MAIN PIPELINE
========================================================= */

function main() {
  chrome.storage.local.get("switchStatus", (data) => {
    if (data.switchStatus) {
      runImageClassification();
      runTextClassification();
    }
  });
}

/* =========================================================
   IMAGE CLASSIFICATION
========================================================= */

function runImageClassification() {
  // Get the cover image
  const imgCover = document.getElementsByClassName("crayons-article__cover__image")[0];

  if (!(imgCover.src in imageClassified)) {
    imageClassified[imgCover.src] = true; //Store it
    renderImageIcon(null, imgCover.parentElement); // We get the parent of the IMG element so that we can append the icon to the user
    imageClassificationScan(imgCover); // Classify the image
  }
}

async function imageClassificationScan(imgObj) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imgObj.src;

  await new Promise((r) => (img.onload = r));

  try {
    const { model, metadata } = await imageModelPromise;

    const tensor = tf.browser
      .fromPixels(img)
      .resizeBilinear([224, 224])
      .toFloat()
      .div(255)
      .expandDims();

    // Run the model on the image
    const pred = model.predict(tensor);
    const scores = await pred.data();

    tf.dispose([tensor, pred]);

    const results = metadata.labels.map((l, i) => ({
      label: l,
      confidence: scores[i],
    }));

    results.sort((a, b) => b.confidence - a.confidence);

    renderImageIcon(results, imgObj.parentElement);
  } catch {
    renderImageIcon(null, imgObj.parentElement);
  }
}

function renderImageIcon(results, imgObj) {
  const existing = imgObj.querySelector("#FrancisTRStatusAI");
  if (existing) existing.remove();

  imgObj.style.position = "relative";

  const icon = document.createElement("img");
  icon.id = "FrancisTRStatusAI";

  // Assign the icon based on the result. With no result, add the loading icon
  icon.src = !results
    ? chrome.runtime.getURL("Images/loading.gif")
    : results[0].label === "AI"
      ? chrome.runtime.getURL("Images/AIGenerated.png")
      : chrome.runtime.getURL("Images/AIFree.png");

  imgObj.appendChild(icon);
}

/* =========================================================
   TEXT CLASSIFICATION
========================================================= */

function runTextClassification() {
  if (textScanInFlight) return;

  const text = getCleanArticleText();
  // adjust minimum text length threshold
  if (!text || text.length < 600) return;

  const sig = text.slice(0, 300);
  if (sig === lastTextScanSignature) return;

  textScanInFlight = true;

  const result = detectGPTStyle(text);

  chrome.storage.local.set({ articleAnalysis: result });

  lastTextScanSignature = sig;
  textScanInFlight = false;
}

/**
 * MAIN TEXT DETECTION LOGIC
 *
 * Tune weights below to control sensitivity
 */
function detectGPTStyle(text) {
  if (!wikipediaDataset || wikipediaDataset.length < 10) {
    return baseUnknownResult();
  }

  const datasetScore = compareDataset(text);       // AI %
  const devHuman = computeDevHumanScore(text);     // Human %
  const generalHuman = computeGeneralScore(text);  // Human %
  const aiPenalty = detectAIPatterns(text);        // AI %

  // Adjust weights here
  let humanScore =
    devHuman * 0.40 +
    (100 - datasetScore) * 0.35 +
    generalHuman * 0.25 -
    aiPenalty * 0.25;

  // Modify squash sensitivity
  humanScore = squashScore(humanScore);

  // Adjust classification thresholds
  let label =
    humanScore <= 33.33
      ? "AI-generated"
      : humanScore >= 66.66
        ? "Human-written"
        : "Mixed";

  const finalScore = Number(humanScore.toFixed(2));
  return {
    label,
    averageAIScore: finalScore,
    humanPercent: finalScore,
    aiPercent: Number((100 - humanScore).toFixed(2)),
    mixedPercent:
      finalScore > 33.33 && finalScore < 66.66 ? 100 : 0,
  };
}

/* -------------------------
   FEATURE ENGINEERING
------------------------- */

/**
 * Increase weight if you want more "human writing signals"
 */
function computeDevHumanScore(text) {
  const words = tokenizeWords(text);
  const sentences = splitSentences(text);

  const pronouns = words.filter((w) =>
    ["i", "my", "we", "our", "me"].includes(w)
  ).length;

  const personal = pronouns / (words.length || 1);

  const lengths = sentences.map((s) => tokenizeWords(s).length);
  const variability = variance(lengths);

  return clamp((personal * 4 + variability / 100) * 100);
}

/**
 * Add/remove AI phrases here
 */
function detectAIPatterns(text) {
  const patterns = [
    "in conclusion",
    "overall",
    "additionally",
    "furthermore",
    "this article will",
  ];

  let count = 0;

  for (let p of patterns) {
    if (text.toLowerCase().includes(p)) count++;
  }

  // Adjust penalty strength
  return clamp(count * 10, 0, 40);
}

/**
 * DATASET SIMILARITY
 *
 * DEV OPTIONS:
 * - Increase sample size (currently 30)
 * - Replace cosine similarity with embeddings later
 */
function compareDataset(text) {
  const vec = textToVector(text);

  const human = getBalancedSamples(0).map((s) =>
    cosineSimilarity(vec, textToVector(s.text))
  );

  const ai = getBalancedSamples(1).map((s) =>
    cosineSimilarity(vec, textToVector(s.text))
  );

  return (mean(ai) / (mean(ai) + mean(human) + 1e-6)) * 100;
}

function getBalancedSamples(label) {
  // Increase slice size for higher accuracy (slower)
  return wikipediaDataset.filter((d) => d.label === label).slice(0, 30);
}

/**
 * General lexical diversity
 */
function computeGeneralScore(text) {
  const words = tokenizeWords(text);

  return (new Set(words).size / words.length) * 100;
}

/**
 * Controls how extreme scores behave
 */
function squashScore(x) {
  return 100 / (1 + Math.exp(-(x - 50) / 12));
}

/* =========================================================
   UTILITIES
========================================================= */

function tokenizeWords(t) {
  return t.toLowerCase().match(/[a-z0-9']+/g) || [];
}

function splitSentences(t) {
  return t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function textToVector(text) {
  const words = tokenizeWords(text);
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return freq;
}

function cosineSimilarity(a, b) {
  let dot = 0,
    magA = 0,
    magB = 0;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  keys.forEach((k) => {
    const x = a[k] || 0;
    const y = b[k] || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  });

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((a, x) => a + (x - m) ** 2, 0) / (arr.length || 1);
}

function clamp(x, min = 0, max = 100) {
  return Math.max(min, Math.min(max, x));
}

function normalizeWhitespace(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

/* =========================================================
   FALLBACK
========================================================= */

function baseUnknownResult() {
  return {
    label: "Unknown",
    humanPercent: 50,
    aiPercent: 50,
  };
}

/* =========================================================
   TEXT EXTRACTION
========================================================= */

function getCleanArticleText() {
  const root =
    document.querySelector(".crayons-article__body") ||
    document.querySelector("article");

  return root ? normalizeWhitespace(root.innerText) : "";
}
