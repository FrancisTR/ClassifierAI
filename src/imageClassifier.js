import * as tf from "@tensorflow/tfjs";

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
let imageClassified = {};
let AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };

let lastUrl = location.href;
let lastTextScanSignature = "";
let textScanInFlight = false;


window.onload = async () => {
  const targetNode = document.getElementById("page-content") || document.body;

  selfObserver(targetNode);
  wikipediaDataset = await loadWikipediaDatasetJSONL("data/wikipedia.jsonl");

  main();
  observeUrlChange();
};

function selfObserver(node) {
  const observer = new MutationObserver(() => main());

  observer.observe(node, {
    childList: true,
    subtree: true,
  });
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
          dataset.push({ text: item.human_text, label: 0 });
        }

        if (item.ai_text && item.ai_text.length > 50) {
          dataset.push({ text: item.ai_text, label: 1 });
        }
      } catch {}
    }

    console.log("Dataset:", dataset.length);
    return dataset;

  } catch (e) {
    console.warn("Dataset failed:", e);
    return [];
  }
}

function main() {
  chrome.storage.local.get("switchStatus", data => {
    if (data.switchStatus === true) {
      runML();
      runArticleTextScan();
    } else {
      AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };
      chrome.storage.local.set({ AIDataCollected: AIData });
    }
  });
}

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

    let pred = model.predict(tensor);
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

async function runArticleTextScan() {
  if (textScanInFlight) return;

  const text = getText();
  if (!text || text.length < 600) return;

  const signature = text.slice(0, 400);
  if (signature === lastTextScanSignature) return;

  textScanInFlight = true;

  const result = await detectGPTStyle(text);

  console.log("RESULT:", result);

  lastTextScanSignature = signature;
  textScanInFlight = false;
}

function getSentenceSafeChunks() {
  const root =
    document.getElementById("article-body") ||
    document.querySelector(".crayons-article__body") ||
    document.querySelector("article");

  if (!root) return [];

  const blocks = root.querySelectorAll("p, li, h1, h2, h3");

  let chunks = [];

  blocks.forEach(el => {
    const text = normalizeWhitespace(el.innerText || "");
    if (text.length < 80) return;

    const sentences = splitSentences(text);

    let buffer = "";

    sentences.forEach(s => {
      buffer += s.trim() + " ";

      if (buffer.length > 180) {
        chunks.push(buffer.trim());
        buffer = "";
      }
    });

    if (buffer.length > 0) {
      chunks.push(buffer.trim());
    }
  });

  return chunks;
}

/* Scoring */
async function detectGPTStyle(text) {
  const chunks = getSentenceSafeChunks();
  if (!chunks.length) return { label: "Unknown", aiScore: 0 };

  let scores = [];

  for (let c of chunks) {
    const f = extractAdvancedFeatures(c);
    const score = computeGPTZeroScore(f);
    scores.push(score);
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    label:
      avg > 80 ? "AI-generated" :
      avg > 40 ? "Mixed" :
      "Human-written",
    aiScore: Number(avg.toFixed(2))
  };
}

function extractAdvancedFeatures(text) {
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);

  const lengths = sentences.map(s => tokenizeWords(s).length);

  const avgLen = mean(lengths);
  const varLen = variance(lengths);

  const diversity = new Set(words).size / (words.length || 1);
  const repetition = 1 - diversity;

  return { avgLen, varLen, repetition, diversity };
}

function computeGPTZeroScore(f) {
  let burstiness = clamp(f.varLen / 50);
  let repetition = clamp(f.repetition);
  let diversity = clamp(1 - f.diversity);

  let ai =
    (1 - burstiness) * 0.4 +
    repetition * 0.35 +
    diversity * 0.25;

  return clamp(ai) * 100;
}

/* Utilities */
function clamp(x, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

function normalizeWhitespace(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function getText() {
  const root = document.getElementById("article-body");
  if (!root) return "";
  return normalizeWhitespace(root.innerText || "");
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