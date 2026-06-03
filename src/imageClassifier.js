import * as tf from "@tensorflow/tfjs";


const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/Z7sdOoyx6/";
const MODEL_URL = `${MODEL_BASE_URL}model.json`;
const METADATA_URL = `${MODEL_BASE_URL}metadata.json`;

let modelPromise = loadModel();

async function loadModel() {
  await tf.ready();

  try {
    await tf.setBackend("webgl");
  } catch {}

  const [model, metadata] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(METADATA_URL).then(r => r.json()),
  ]);

  return { model, metadata };
}

let wikipediaDataset = null;

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

  function runML() {
    let imgs = document.querySelectorAll(
      ".crayons-article__cover, .crayons-article__main-image"
    );

    for (let i of imgs) {
      const imgTag = i.querySelector("img");
      if (!imgTag) continue;

      if (!(imgTag.src in imageClassified)) {
        imageClassified[imgTag.src] = true;

        iconAssigned(null, i); // loading state
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
    } catch (e) {
      iconAssigned(null, imgObj);
    }
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
  icon.style.pointerEvents = "none";

  try {
    if (!results) {
      icon.src = chrome.runtime.getURL("Images/loading.gif");
    } else {
      let [label, conf] = [results[0].label, results[0].confidence * 100];

      AIData.TotalScan++;

      if ((label === "AI" || label === "NotAI") && conf <= 60) {
        icon.src = chrome.runtime.getURL("Images/AINeutral.png");
        AIData.AINeutral++;
      } else if (label === "AI") {
        icon.src = chrome.runtime.getURL("Images/AIGenerated.png");
        AIData.AIGenerated++;
      } else {
        icon.src = chrome.runtime.getURL("Images/AIFree.png");
        AIData.NotAI++;
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

  const result = await detectAiGeneratedText(text);

  console.log("🧠 TEXT AI:", result);

  lastTextScanSignature = signature;
  textScanInFlight = false;
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
  return mean(arr.map(x => (x - m) ** 2));
}

function extractTextFeatures(text) {
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);

  const lengths = sentences.map(s => tokenizeWords(s).length);

  return {
    avgSentenceLengthNorm: mean(lengths) / 28,
    lowSentenceVarianceNorm: 1 - variance(lengths) / 180,
    lowLexicalDiversityNorm: 1 - new Set(words).size / (words.length || 1),
    repetitionNorm: 0,
    aiPhraseDensityNorm: 0,
    punctuationUniformityNorm: 0,
    lowFirstPersonNorm: 1,
  };
}

async function detectAiGeneratedText(text) {
  const f = extractTextFeatures(text);

  const x = tf.tensor2d([[
    f.avgSentenceLengthNorm,
    f.lowSentenceVarianceNorm,
    f.lowLexicalDiversityNorm,
    f.repetitionNorm,
    f.aiPhraseDensityNorm,
    f.punctuationUniformityNorm,
    f.lowFirstPersonNorm,
  ]]);

  const w = tf.tensor2d([[0.45],[1.15],[1.10],[1.35],[1.10],[0.55],[0.85]]);
  const b = tf.scalar(-3.1);

  const prob = tf.sigmoid(x.matMul(w).add(b)).dataSync()[0];

  const aiScore = prob * 100;

  let label =
    prob > 0.8 ? "Likely AI-generated" :
    prob > 0.4 ? "Mixed" :
    "Likely human-written";

  return { label, aiScore };
}