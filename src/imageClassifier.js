import * as tf from "@tensorflow/tfjs";

const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/Z7sdOoyx6/";
const MODEL_URL = `${MODEL_BASE_URL}model.json`;
const METADATA_URL = `${MODEL_BASE_URL}metadata.json`;

let modelPromise = loadModel();

async function loadModel() {
  await tf.ready();
  if (tf.setBackend) {
    try {
      await tf.setBackend("webgl");
    } catch (error) {
      console.warn(
        "TensorFlow.js WebGL backend unavailable, using default backend.",
        error
      );
    }
  }

  const [model, metadata] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(METADATA_URL).then((response) => response.json()),
  ]);

  return { model, metadata };
}

let imageClassified = {};
let AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };

let lastUrl = location.href;

/* -------------------- text scan state (WIP) -------------------- */
let lastTextScanSignature = "";
let textScanInFlight = false;

const AI_STYLE_PHRASES = [
  "in conclusion",
  "overall",
  "additionally",
  "furthermore",
  "moreover",
  "it is important to note",
  "it is worth noting",
  "this highlights",
  "this demonstrates",
  "delve into",
  "leverage",
  "seamless",
  "robust",
  "transformative",
  "unlock the potential",
  "navigate the",
  "in today's",
];

// Start observing
window.onload = () => {
  const targetNode = document.getElementById("page-content") || document.body;

  selfObserver(targetNode);

  main();
  observeUrlChange();
};

/*
  Wait until the cover image exists before scanning
*/
function waitForImagesAndRun() {
  const interval = setInterval(() => {
    let imgs = document.querySelectorAll(
      ".crayons-article__cover, .crayons-article__main-image"
    );

    if (imgs.length > 0) {
      clearInterval(interval);
      main();
    }
  }, 200);
}

/*
  Detect SPA navigation
*/
function observeUrlChange() {
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;

      imageClassified = {};
      lastTextScanSignature = "";

      // Wait until article image is actually present
      waitForImagesAndRun();
    }
  }, 300);
}

function selfObserver(documentNode) {
  const observer = new MutationObserver(function () {
    main();
  });

  const config = {
    childList: true,
    subtree: true,
  };

  try {
    observer.observe(documentNode, config);
  } catch (error) {
    console.log("Cannot Observe.");
  }
}

function main() {
  chrome.storage.local.get("switchStatus", function (data) {
    if (data.switchStatus === true) {
      runML();

      // run article text scan (WIP)
      runArticleTextScan();
    } else {
      AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };
      chrome.storage.local.set({ AIDataCollected: AIData });
    }
  });

  function runML() {
    let img = document.querySelectorAll(
      ".crayons-article__cover, .crayons-article__main-image"
    );

    for (let i of img) {
      const imgTag = i.getElementsByTagName("img")[0];
      if (!imgTag) continue;

      if (!(imgTag.src in imageClassified)) {
        imageClassified[imgTag.src] = imgTag.src;

        iconAssigned(null, i);
        imageClassificationScan(i);
      }
    }
  }

  async function imageClassificationScan(imgObj) {
    const img = loadImage(imgObj.getElementsByTagName("img")[0].src);

    try {
      await waitForImageLoad(img);
      const results = await classifyImage(img);
      iconAssigned(results, imgObj);
    } catch (error) {
      console.log("Image classification failed", error);
      iconAssigned(null, imgObj);
    }
  }

  function loadImage(src) {
    const img = new Image();
    img.setAttribute("crossorigin", "anonymous");
    img.src = src;
    return img;
  }

  function waitForImageLoad(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
      } else {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      }
    });
  }

  async function classifyImage(imageElement) {
    const { model, metadata } = await modelPromise;
    const imageSize = metadata.imageSize || 224;
    const labels = metadata.labels || [];

    const tensor = tf.browser
      .fromPixels(imageElement)
      .resizeBilinear([imageSize, imageSize])
      .toFloat()
      .div(tf.scalar(255))
      .expandDims();

    let prediction = model.predict(tensor);
    if (Array.isArray(prediction)) {
      prediction = prediction[0];
    }

    const scores = prediction.dataSync
      ? prediction.dataSync()
      : await prediction.data();

    tf.dispose([tensor, prediction]);

    const results = Array.from(scores).map((confidence, index) => ({
      label: labels[index] || `Class ${index}`,
      confidence,
    }));

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  function iconAssigned(results, imgObj) {
    var statusImg = document.createElement("img");
    statusImg.setAttribute("id", "FrancisTRStatusAI");

    try {
      let result = [results[0].label, results[0].confidence * 100];
      AIData["TotalScan"] += 1;

      if (
        (result[0] === "AI" || result[0] === "NotAI") &&
        result[1] <= 60.0
      ) {
        statusImg.src = chrome.runtime.getURL("Images/AINeutral.png");
        AIData["AINeutral"] += 1;
      } else if (result[0] === "AI" && result[1] > 60.0) {
        statusImg.src = chrome.runtime.getURL("Images/AIGenerated.png");
        AIData["AIGenerated"] += 1;
      } else if (result[0] === "NotAI" && result[1] > 60.0) {
        statusImg.src = chrome.runtime.getURL("Images/AIFree.png");
        AIData["NotAI"] += 1;
      }

      chrome.storage.local.set({ AIDataCollected: AIData });
    } catch (error) {
      statusImg.src = chrome.runtime.getURL("Images/loading.gif");
    }

    imgObj.appendChild(statusImg);
  }
}

/*
   DEV article text scan + heuristic AI-likelihood scoring
   Uses #article-body as the article text container.
   Console logs only; does not alter image scan behavior. (WIP)
*/
async function runArticleTextScan() {
  if (textScanInFlight) return;

  const articleText = getDevToArticleText();
  if (!articleText) return;

  // Avoid repeated logs on MutationObserver updates
  const signature = `${location.pathname}|${articleText.length}|${articleText.slice(
    0,
    800
  )}`;
  if (signature === lastTextScanSignature) return;

  // Skip short content
  if (articleText.length < 600) return;

  textScanInFlight = true;

  try {
    const result = await detectAiGeneratedText(articleText);

    lastTextScanSignature = signature;

    console.log("[AI Text Detection]", result);
  } catch (error) {
    console.error("[AI Text Detection] failed", error);
  } finally {
    textScanInFlight = false;
  }
}

function getDevToArticleText() {
  const articleRoot = document.getElementById("article-body");
  if (!articleRoot) return "";

  const contentNodes = articleRoot.querySelectorAll(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote"
  );

  let text = "";
  if (contentNodes.length > 0) {
    text = Array.from(contentNodes)
      .map((node) => (node.innerText || node.textContent || "").trim())
      .filter(Boolean)
      .join(" ");
  } else {
    text = articleRoot.innerText || articleRoot.textContent || "";
  }

  return normalizeWhitespace(text);
}

function normalizeWhitespace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return (
    text
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) || []
  );
}

function tokenizeWords(text) {
  return text.toLowerCase().match(/[a-z0-9']+/g) || [];
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, n) => sum + n, 0) / arr.length;
}

function variance(arr) {
  if (!arr.length) return 0;
  const avg = mean(arr);
  return mean(arr.map((n) => (n - avg) ** 2));
}

function countPhraseMatches(text, phrases) {
  const lower = text.toLowerCase();
  let count = 0;

  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(escaped, "g"));
    if (matches) count += matches.length;
  }

  return count;
}

function ngramRepetitionRatio(words, n = 3) {
  if (words.length < n) return 0;

  const counts = new Map();
  let total = 0;

  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ");
    counts.set(gram, (counts.get(gram) || 0) + 1);
    total++;
  }

  if (total === 0) return 0;

  let repeated = 0;
  for (const value of counts.values()) {
    if (value > 1) repeated += value - 1;
  }

  return repeated / total;
}

function extractTextFeatures(text) {
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);

  const sentenceLengths = sentences.map(
    (sentence) => tokenizeWords(sentence).length
  );
  const avgSentenceLength = mean(sentenceLengths);
  const sentenceLengthVariance = variance(sentenceLengths);

  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length ? uniqueWords.size / words.length : 0;

  const repeated3GramRatio = ngramRepetitionRatio(words, 3);
  const aiPhraseCount = countPhraseMatches(text, AI_STYLE_PHRASES);

  const punctuationSet = new Set(
    (text.match(/[,:;!?()\-"']/g) || []).join("").split("")
  );
  const punctuationVariety = punctuationSet.size;

  const firstPersonMatches =
    text.match(/\b(i|i'm|i’ve|i'd|me|my|mine|we|we're|we’ve|our|ours)\b/gi) || [];
  const firstPersonDensity = sentences.length
    ? firstPersonMatches.length / sentences.length
    : 0;

  return {
    avgSentenceLengthNorm: clamp(avgSentenceLength / 28),
    lowSentenceVarianceNorm: 1 - clamp(sentenceLengthVariance / 180),
    lowLexicalDiversityNorm: 1 - clamp(lexicalDiversity / 0.62),
    repetitionNorm: clamp(repeated3GramRatio * 6),
    aiPhraseDensityNorm: clamp(
      aiPhraseCount / Math.max(2, sentences.length * 0.15)
    ),
    punctuationUniformityNorm: 1 - clamp(punctuationVariety / 7),
    lowFirstPersonNorm: 1 - clamp(firstPersonDensity / 0.35),

    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: Number(avgSentenceLength.toFixed(2)),
    lexicalDiversity: Number(lexicalDiversity.toFixed(4)),
    repeated3GramRatio: Number(repeated3GramRatio.toFixed(4)),
    aiPhraseCount,
    punctuationVariety,
    firstPersonDensity: Number(firstPersonDensity.toFixed(4)),
  };
}

async function detectAiGeneratedText(text) {
  const features = extractTextFeatures(text);

  const featureVector = [
    features.avgSentenceLengthNorm,
    features.lowSentenceVarianceNorm,
    features.lowLexicalDiversityNorm,
    features.repetitionNorm,
    features.aiPhraseDensityNorm,
    features.punctuationUniformityNorm,
    features.lowFirstPersonNorm,
  ];

  const aiProbability = tf.tidy(() => {
    const x = tf.tensor2d([featureVector], [1, featureVector.length], "float32");

    // Heuristic weights for AI-likelihood scoring
    const w = tf.tensor2d(
      [
        [0.45], // avgSentenceLengthNorm
        [1.15], // lowSentenceVarianceNorm
        [1.10], // lowLexicalDiversityNorm
        [1.35], // repetitionNorm
        [1.10], // aiPhraseDensityNorm
        [0.55], // punctuationUniformityNorm
        [0.85], // lowFirstPersonNorm
      ],
      [featureVector.length, 1],
      "float32"
    );

    const b = tf.scalar(-3.1, "float32");

    const y = tf.sigmoid(x.matMul(w).add(b));
    return y.dataSync()[0];
  });

  const aiScore = Number((aiProbability * 100).toFixed(2));
  const humanScore = Number((100 - aiScore).toFixed(2));

  let label = "Uncertain / mixed signal";
  let confidence = Math.abs(aiScore - 50) * 2;

  if (aiProbability >= 0.80) {
    label = "Likely AI-generated";
    confidence = aiScore;
  }else if (aiProbability < 0.80 && aiProbability >= 0.40) {
    label = "Likely human-written with some AI influence";
    confidence = humanScore;
  } else if (aiProbability < 0.40) {
    label = "Likely human-written";
    confidence = humanScore;
  }

  return {
    label,
    confidence: Number(confidence.toFixed(2)),
    aiScore,
    wordCount: features.wordCount,
    sentenceCount: features.sentenceCount,
    features,
  };
}