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

let idfCache = {};

/* =========================================================
   INIT
========================================================= */

window.onload = async () => {
  wikipediaDataset = await loadDatasetJSONL("data/wikipedia.jsonl");

  console.log(
    wikipediaDataset.filter(d => d.label === 1).length,
    wikipediaDataset.filter(d => d.label === 0).length
  );

  buildIDF();

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
      main();
    }
  }, 300);
}

/* =========================================================
   DATASET LOADING (TEXT CLASSIFICATION)
========================================================= */

async function loadDatasetJSONL(path) {
  try {
    const url = chrome.runtime.getURL(path);
    const text = await (await fetch(url)).text();

    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const item = JSON.parse(line);
          const arr = [];

          if (item.human_text) {
            arr.push({
              text: normalizeWhitespace(item.human_text),
              label: 0,
            });
          }

          if (item.ai_text) {
            arr.push({
              text: normalizeWhitespace(item.ai_text),
              label: 1,
            });
          }

          return arr;
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/* =========================================================
   TF-IDF BUILD
========================================================= */

function buildIDF() {
  const docCount = wikipediaDataset.length;
  const df = {};

  wikipediaDataset.forEach((d) => {
    const words = new Set(tokenizeWords(d.text));
    words.forEach((w) => {
      df[w] = (df[w] || 0) + 1;
    });
  });

  Object.keys(df).forEach((w) => {
    idfCache[w] = Math.log(docCount / (df[w] + 1));
  });
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
  try {
    const imgCover = document.getElementsByClassName("crayons-article__cover__image")[0];

    if (!(imgCover.src in imageClassified)) {
      imageClassified[imgCover.src] = true; //Store it
      renderImageIcon(null, imgCover.parentElement); // We get the parent of the IMG element so that we can append the icon to the user
      imageClassificationScan(imgCover); // Classify the image
    }
  } catch {
    console.log("No image detected");
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
  const text = getCleanArticleText();
  const result = detectGPTStyle(text);

  chrome.storage.local.set({ articleAnalysis: result });
}

/**
 * MAIN TEXT DETECTION LOGIC
 */
function detectGPTStyle(text) {
  if (!wikipediaDataset || wikipediaDataset.length < 10) {
    return baseUnknownResult();
  }

  const aiScore = compareDataset(text);
  console.log(aiScore);

  let label =
    aiScore >= 50
      ? "AI-generated"
      : "Human-written";

  return {
    label,
    averageAIScore: Number(aiScore.toFixed(2)),
    humanPercent: Number((100 - aiScore).toFixed(2)),
    aiPercent: Number(aiScore.toFixed(2)),
    mixedPercent: 0,
  };
}

/**
 * DATASET SIMILARITY
 */
function compareDataset(text) {
  const vec = textToVectorTFIDF(text);

  const human = getBalancedSamples(0).map((s) =>
    cosineSimilarity(vec, textToVectorTFIDF(s.text))
  );
  console.log("Human similarity scores:", human);

  const ai = getBalancedSamples(1).map((s) =>
    cosineSimilarity(vec, textToVectorTFIDF(s.text))
  );
  console.log("AI similarity scores:", ai);

  return (mean(ai) / (mean(ai) + mean(human) + 1e-6)) * 100;
}

function getBalancedSamples(label) {
  return wikipediaDataset.filter((d) => d.label === label).slice(0, 50);
}

/* =========================================================
   TF-IDF VECTOR
========================================================= */

function textToVectorTFIDF(text) {
  const words = tokenizeWords(text);
  const freq = {};

  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));

  const vec = {};
  Object.keys(freq).forEach((w) => {
    const idf = idfCache[w] || 0;
    vec[w] = freq[w] * idf;
  });

  return vec;
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
