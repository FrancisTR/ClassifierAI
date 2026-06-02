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
      console.warn("TensorFlow.js WebGL backend unavailable, using default backend.", error);
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

//Start observing
window.onload = () => {
  const targetNode =
    document.getElementById("page-content") || document.body;

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

    const scores = prediction.dataSync ? prediction.dataSync() : await prediction.data();
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

      if ((result[0] === "AI" || result[0] === "NotAI") && result[1] <= 60.0) {
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